import { normalizeCountryCode } from "@/lib/mailing-destinations";
import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { processPaidOrder, verifyPaymentIntentForOrder } from "@/lib/order-processor";
import { redeemOfferForOrder } from "@/lib/offer-engine";
import { logIncident } from "@/lib/incident-logger";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import {
  sendDeferredAddressReceiptEmail,
  sendOrderPenningReceiptEmail,
} from "@/lib/email/transactional";
import { acceptWebhookEvent, markWebhookInboxProcessed, markWebhookInboxFailed } from "@/lib/webhook-inbox";
import {
  deriveCommercialKind,
  resolvePaymentIntentReference,
  recordPaymentCaptureFact,
  recordPaymentRefundFact,
  recordPaymentDisputeFact,
} from "@/lib/financial-ledger";
import Stripe from "stripe";


export async function POST(req: NextRequest) {
  let acceptedEventId: string | undefined;
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const webhookSecret =
      process.env["stripe-webhook-secret"] || process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    // Strict security check: Caller-controlled headers must NEVER disable signature checks.
    // Webhook secret MUST be configured; otherwise fail closed immediately.
    const isTestEnvironment =
      process.env.NODE_ENV === "test" && process.env.TEST_BYPASS_WEBHOOK_SIGNATURE === "true";

    if (isTestEnvironment) {
      // Internal automated test suite runner only (controlled via server env, never client headers)
      const parsed = JSON.parse(rawBody);
      event = parsed as Stripe.Event;
    } else {
      if (!webhookSecret || webhookSecret.includes("placeholder")) {
        console.error("[Webhook Error] STRIPE_WEBHOOK_SECRET is not configured or is a placeholder.");
        await logIncident({
          type: "WEBHOOK",
          severity: "error",
          summary: "Stripe Webhook Misconfiguration",
          technicalDetails: "Incoming Stripe webhook rejected because STRIPE_WEBHOOK_SECRET is missing or invalid.",
        });
        return NextResponse.json(
          { error: "Stripe webhook endpoint is not configured." },
          { status: 500 }
        );
      }

      if (!signature) {
        return NextResponse.json(
          { error: "Missing required stripe-signature header." },
          { status: 400 }
        );
      }

      try {
        event = constructWebhookEvent(rawBody, signature, webhookSecret);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Webhook signature error";
        console.warn("[Webhook] Signature verification failed:", msg);
        return NextResponse.json(
          { error: `Webhook signature verification failed: ${msg}` },
          { status: 400 }
        );
      }
    }

    // 1. Durable Webhook Inbox Acceptance & Idempotency Check (SPRINT-0002)
    const orderIdCandidate = (event.data.object as any)?.metadata?.orderId;
    const paymentIntentIdCandidate =
      event.type.startsWith("payment_intent")
        ? (event.data.object as any)?.id
        : (event.data.object as any)?.payment_intent;

    const inboxResult = await acceptWebhookEvent({
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      livemode: Boolean(event.livemode),
      signatureVerified: true,
      payloadSummary: {
        eventId: event.id,
        type: event.type,
        objectId: (event.data.object as any)?.id,
        operationId: (event.data.object as any)?.metadata?.operationId || null,
      },
      orderId: orderIdCandidate,
      paymentIntentId: paymentIntentIdCandidate,
    });

    acceptedEventId = event.id;
    if (inboxResult.duplicate) {
      console.log(
        `[Webhook] Duplicate Stripe webhook ${event.id} (${event.type}) received. Safely returning 200 OK.`
      );
      return NextResponse.json({ received: true, duplicate: true });
    }

    // 2. Handle Payment Intent Succeeded
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata?.orderId;
      const isTestPayment = event.livemode === false || paymentIntent.livemode === false;
      const paymentMode = isTestPayment ? "stripe_test" : "live";
      const amountReceived = paymentIntent.amount_received ?? paymentIntent.amount ?? 900;
      const currency = paymentIntent.currency || "usd";

      const order = orderId ? await getOrderById(orderId) : null;
      const paymentCheck = order
        ? verifyPaymentIntentForOrder({ paymentIntent, orderId: orderId!, order })
        : { valid: false, reason: "PaymentIntent metadata orderId does not identify an existing order." };

      // Persist evidence of captured money even when it cannot safely authorize fulfillment.
      await recordPaymentCaptureFact({
        paymentIntentId: paymentIntent.id,
        operationId: paymentIntent.metadata?.operationId,
        amountCents: amountReceived,
        currency,
        livemode: !isTestPayment,
        providerEventId: event.id,
        orderId: paymentCheck.valid ? orderId : undefined,
        commercialKind: paymentCheck.valid
          ? deriveCommercialKind({ amountCents: amountReceived, livemode: !isTestPayment, isFounderTest: order?.isFounderTest, isComp: order?.isComp, paymentMethod: order?.paymentMethod, explicitKind: (order?.discountAmountInCents || 0) > 0 ? "discounted_paid" : undefined })
          : (isTestPayment ? "founder_test" : "unresolved_historical"),
        occurredAt: event.created * 1000,
      });

      if (!paymentCheck.valid) {
        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: `Captured payment requires reconciliation (${paymentIntent.id})`,
          technicalDetails: paymentCheck.reason || "Payment verification failed.",
          metadata: { paymentIntentId: paymentIntent.id,
        operationId: paymentIntent.metadata?.operationId, orderId: orderId || "" },
        });
        await markWebhookInboxProcessed(event.id);
        return NextResponse.json({
          received: true,
          warning: "Captured payment recorded for reconciliation; fulfillment was not dispatched.",
        });
      }

      console.log(
        `[Webhook] Payment confirmed for Order ${orderId} (mode: ${paymentMode}, livemode: ${!isTestPayment}). Processing order...`
      );

      const result = await processPaidOrder(
        orderId,
        paymentIntent.id,
        paymentIntent.receipt_email || undefined,
        {
          isTest: isTestPayment,
          paymentMode,
          amountReceivedCents: amountReceived,
          currency,
          providerEventId: event.id,
          providerOccurredAt: event.created * 1000,
          verifiedPaymentIntent: paymentIntent,
        }
      );

      if (!result.success) {
        await markWebhookInboxProcessed(event.id);
        return NextResponse.json(
          {
            received: true,
            status: result.status,
            error: result.error,
          },
          { status: 200 }
        );
      }

      // A verified webhook may be the only completion signal the server receives. Redeem
      // the bound promotion here as well; the transaction is idempotent with client confirm.
      let offerRedemption: { status: "not_applicable" | "redeemed" | "reconciliation_required"; error?: string } = { status: "not_applicable" };
      if (order?.discountCode) {
        const redemption = await redeemOfferForOrder({
          code: order.discountCode,
          orderId,
          quoteId: order.quoteId,
          discountAmountCents: order.discountAmountInCents || 0,
          finalAmountCents: order.finalAmountInCents ?? order.amountInCents,
          destinationSurchargeCents: order.quote?.internationalSurchargeCents || 0,
          verifiedCaptureId: paymentIntent.id,
          requireAuthoritativeBinding: true,
        });
        offerRedemption = redemption.redeemed
          ? { status: "redeemed" }
          : { status: "reconciliation_required", error: redemption.error || "Offer redemption could not be confirmed." };
        if (!redemption.redeemed) {
          await logIncident({
            type: "STRIPE",
            severity: "error",
            summary: `Paid order offer redemption requires reconciliation (${orderId})`,
            technicalDetails: redemption.error || "Promotion redemption failed after verified payment.",
            metadata: { orderId, paymentIntentId: paymentIntent.id, eventId: event.id },
          });
        }
      }

      // Automated Transactional Email Dispatch (Resend + Google Secret Manager)
      try {
        const order = await getOrderById(orderId);
        if (order && !order.isInternationalPreview && !(process.env.STAGING_REVIEW_ONLY === "true" && (normalizeCountryCode(order.quote?.countryCode || order.recipientAddress?.country) || (order.recipientAddress?.country ? null : "US")) !== "US")) {
          const customerEmail = paymentIntent.receipt_email || order.customerEmail;
          const isAddressDeferred = Boolean(
            order.addressDeferred ||
              (order as any).address_deferred ||
              order.status === "AWAITING_RECIPIENT_ADDRESS" ||
              paymentIntent.metadata?.address_deferred === "true" ||
              paymentIntent.metadata?.addressDeferred === "true"
          );

          if (customerEmail && !order.receiptEmailSentAt && !order.addressDeferredEmailSentAt) {
            let delivery: { success: boolean; error?: string };
            if (isAddressDeferred) {
              console.log(
                `[Webhook] Dispatching Scenario A (deferred address) receipt email to ${customerEmail} for order ${orderId}...`
              );
              delivery = await sendDeferredAddressReceiptEmail({
                order,
                customerEmail,
              });
            } else {
              console.log(
                `[Webhook] Dispatching Scenario B (penning confirmation) receipt email to ${customerEmail} for order ${orderId}...`
              );
              delivery = await sendOrderPenningReceiptEmail({
                order,
                customerEmail,
              });
            }

            if (!delivery.success) throw new Error(delivery.error || "Receipt provider did not acknowledge delivery request");
            await updateOrderStatus(orderId, {
              ...(isAddressDeferred ? { addressDeferredEmailSentAt: Date.now() } : { receiptEmailSentAt: Date.now() }),
            } as any);
          }
        }
      } catch (emailErr: unknown) {
        const emailMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error(`[Webhook] Error dispatching transactional email for order ${orderId}:`, emailMsg);
        await logIncident({
          type: "WEBHOOK",
          severity: "warning",
          summary: `Transactional email dispatch error for order ${orderId}`,
          technicalDetails: emailMsg,
        });
      }

      await markWebhookInboxProcessed(event.id);

      return NextResponse.json({
        received: true,
        orderId,
        handwryttenOrderId: result.handwryttenOrderId,
        status: result.status,
        offerRedemption,
      });
    }

    // 3. Handle Charge Refunded (supports partial and multiple refunds)
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = resolvePaymentIntentReference(charge.payment_intent);
      const orderId = paymentIntentId ? charge.metadata?.orderId : undefined;
      const isTestPayment = event.livemode === false || charge.livemode === false;

      const refundsList = charge.refunds?.data || [];
      if (refundsList.length > 0) {
        for (const r of refundsList) {
          await recordPaymentRefundFact({
            refundId: r.id,
            orderId,
            paymentIntentId,
            chargeId: charge.id,
            amountCents: r.amount,
            currency: r.currency || charge.currency || "usd",
            livemode: !isTestPayment,
            commercialKind: paymentIntentId ? undefined : "unresolved_historical",
            providerEventId: event.id,
            occurredAt: (r.created || charge.created) * 1000,
            reason: r.reason || undefined,
          });
        }
      } else {
        // amount_refunded is a cumulative charge total, not a new refund.
        // Converting each callback into a fact would double-count partial refunds.
        // Keep the inbox retryable until itemized refund evidence is available.
        throw new Error("Itemized refund IDs are unavailable; reconcile provider refunds before accepting this event.");
      }

      await markWebhookInboxProcessed(event.id);
      return NextResponse.json({ received: true, event: "charge.refunded" });
    }

    // 4. Handle Charge Dispute Created
    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as any)?.id;
      const expandedCharge = dispute.charge && typeof dispute.charge === "object" ? dispute.charge as unknown as Record<string, unknown> : undefined;
      const paymentIntentId = resolvePaymentIntentReference((dispute as any).payment_intent) || resolvePaymentIntentReference(expandedCharge?.payment_intent);
      const isTestPayment = event.livemode === false || dispute.livemode === false;

      await recordPaymentDisputeFact({
        disputeId: dispute.id,
        chargeId,
        paymentIntentId,
        amountCents: dispute.amount || 0,
        currency: dispute.currency || "usd",
        livemode: !isTestPayment,
        commercialKind: paymentIntentId ? undefined : "unresolved_historical",
        providerEventId: event.id,
        occurredAt: (dispute.created || Date.now() / 1000) * 1000,
        reason: dispute.reason || undefined,
      });

      await markWebhookInboxProcessed(event.id);
      return NextResponse.json({ received: true, event: "charge.dispute.created" });
    }

    await markWebhookInboxProcessed(event.id);
      return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Webhook handler exception";
    if (acceptedEventId) {
      try {
        await markWebhookInboxFailed(acceptedEventId, msg);
      } catch (inboxErr) {
        console.error("[Webhook] Failed to mark inbox record retryable:", inboxErr);
      }
    }
    console.error("[Webhook Exception]:", msg);

    await logIncident({
      type: "WEBHOOK",
      severity: "error",
      summary: "Stripe Webhook Processing Exception",
      technicalDetails: msg,
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
