import { trySyncPostPurchaseOrder } from "@/lib/post-purchase/integration";
import { normalizeCountryCode } from "@/lib/mailing-destinations";
import { effectiveOrderEmail } from "@/lib/checkout-contact";
import { claimReceiptEmailDelivery, finishReceiptEmailDelivery } from "@/lib/receipt-email-delivery";
import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent, getStripeClient } from "@/lib/stripe";
import { recordOfferRefundOutcome } from "@/lib/offer-refunds";
import { processPaidOrder, verifyPaymentIntentForOrder } from "@/lib/order-processor";
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
import { buildPurchaseMeasurement, persistPurchaseMeasurement, validateVerifiedCapture } from "@/lib/purchase-measurement";


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
        signatureVerified: !isTestEnvironment,
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

    const weddingMetadata = (event.data.object as { metadata?: Record<string,string> }).metadata;
    const weddingPaymentEvent = event.type === "payment_intent.succeeded" ||
      (event.type.startsWith("refund.") && Boolean(weddingMetadata?.weddingRefundId));
    if (weddingMetadata?.weddingBatchId && weddingPaymentEvent) {
      const { resolveWeddingPaymentRuntime, settleWeddingIntent } = await import("@/lib/wedding/checkout");
      const runtime = resolveWeddingPaymentRuntime();
      if (!runtime) throw new Error("Wedding payment runtime is unavailable.");
      if (Boolean(event.livemode) !== runtime.expectedLivemode) {
        throw new Error("A wedding Stripe webhook event had an unexpected livemode.");
      }
      if (event.type === "payment_intent.succeeded") {
        await settleWeddingIntent(event.data.object as Stripe.PaymentIntent);
      } else if (event.type.startsWith("refund.") && weddingMetadata.weddingRefundId) {
        const { applyWeddingRefund } = await import("@/lib/wedding/refunds");
        await applyWeddingRefund(event.data.object as Stripe.Refund);
      }
      await markWebhookInboxProcessed(event.id);
      return NextResponse.json({ received: true, held: runtime.stagingReviewOnly });
    }

    // 2. Handle Payment Intent Succeeded
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata?.orderId;
      const isTestPayment = event.livemode === false || paymentIntent.livemode === false;
      const paymentMode = isTestPayment ? "stripe_test" : "live";
      const amountReceived = paymentIntent.amount_received ?? 0;
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
          ? deriveCommercialKind({ amountCents: amountReceived, livemode: !isTestPayment, isFounderTest: order?.isFounderTest, isComp: order?.isComp, paymentMethod: order?.paymentMethod, origin: order?.origin, explicitKind: (order?.discountAmountInCents || 0) > 0 ? "discounted_paid" : undefined })
          : (isTestPayment ? "founder_test" : "unresolved_historical"),
        origin: order?.origin,
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

      const latestOrder = await getOrderById(orderId);
      if (!latestOrder) {
        console.warn("[Webhook] PaymentIntent references a missing order.");
        return NextResponse.json({ received: true, error: "Order not found" }, { status: 200 });
      }
      if (paymentIntent.status !== "succeeded") {
        return NextResponse.json({ received: true, error: "PaymentIntent is not succeeded" }, { status: 200 });
      }
      const captureError = validateVerifiedCapture(latestOrder, {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        amountReceived: paymentIntent.amount_received,
        currency: paymentIntent.currency,
      });
      if (captureError || paymentIntent.metadata?.orderId !== latestOrder.id || event.livemode !== paymentIntent.livemode) {
        const reason = captureError || "PaymentIntent order binding or livemode mismatch.";
        await logIncident({ type: "WEBHOOK", severity: "error", summary: "Stripe capture verification failed", technicalDetails: reason });
        return NextResponse.json({ received: true, error: reason }, { status: 200 });
      }
      console.log(
        `[Webhook] Payment confirmed for Order ${orderId} (mode: ${paymentMode}, livemode: ${!isTestPayment}). Processing order...`
      );

      const customerEmail = effectiveOrderEmail(latestOrder, paymentIntent.receipt_email);

      const result = await processPaidOrder(
        orderId,
        paymentIntent.id,
        customerEmail || undefined,
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

      const offerRedemption = result.offerRedemption ?? { status: latestOrder.discountCode && latestOrder.origin !== "ADMIN_COMP" ? "redeemed" : "not_applicable" };
      try {
        await persistPurchaseMeasurement(orderId, buildPurchaseMeasurement(latestOrder, {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          amountReceived: paymentIntent.amount_received,
          currency: paymentIntent.currency,
          livemode: paymentIntent.livemode,
        }));
      } catch {
        console.warn("[Webhook] Purchase measurement snapshot write unavailable.");
      }

      await trySyncPostPurchaseOrder(orderId);

      // Automated Transactional Email Dispatch (Resend + Google Secret Manager)
      try {
        const refreshedOrder = await getOrderById(orderId);
        if (refreshedOrder && !refreshedOrder.isInternationalPreview && !(process.env.STAGING_REVIEW_ONLY === "true" && (normalizeCountryCode(refreshedOrder.quote?.countryCode || refreshedOrder.recipientAddress?.country) || (refreshedOrder.recipientAddress?.country ? null : "US")) !== "US")) {
          const customerEmail = effectiveOrderEmail(refreshedOrder, paymentIntent.receipt_email);
          const isAddressDeferred = Boolean(
            refreshedOrder.addressDeferred ||
              (refreshedOrder as any).address_deferred ||
              refreshedOrder.status === "AWAITING_RECIPIENT_ADDRESS" ||
              paymentIntent.metadata?.address_deferred === "true" ||
              paymentIntent.metadata?.addressDeferred === "true"
          );

          if (customerEmail && !refreshedOrder.receiptEmailSentAt && !refreshedOrder.addressDeferredEmailSentAt) {
            const claimedOrder = await claimReceiptEmailDelivery(orderId);
            const committedEmail = claimedOrder ? effectiveOrderEmail(claimedOrder, paymentIntent.receipt_email) : "";
            if (!claimedOrder || !committedEmail) {
              // Another sender owns the delivery claim, or the explicit choice was
              // omitted while this webhook was preparing its send.
              await markWebhookInboxProcessed(event.id);
              return NextResponse.json({ received: true, orderId, status: result.status });
            }
            const deliveryOrder = claimedOrder;
            const deliveryIsDeferred = Boolean(deliveryOrder.addressDeferred || (deliveryOrder as any).address_deferred || deliveryOrder.status === "AWAITING_RECIPIENT_ADDRESS");
            let delivery: { success: boolean; error?: string };
            if (deliveryIsDeferred) {
              console.log(
                `[Webhook] Dispatching Scenario A (deferred address) receipt email to ${committedEmail} for order ${orderId}...`
              );
              delivery = await sendDeferredAddressReceiptEmail({
                order: deliveryOrder,
                customerEmail: committedEmail,
              });
            } else {
              console.log(
                `[Webhook] Dispatching Scenario B (penning confirmation) receipt email to ${committedEmail} for order ${orderId}...`
              );
              delivery = await sendOrderPenningReceiptEmail({
                order: deliveryOrder,
                customerEmail: committedEmail,
              });
            }

            if (!delivery.success) throw new Error(delivery.error || "Receipt provider did not acknowledge delivery request");
            await finishReceiptEmailDelivery(orderId, deliveryIsDeferred);
          }
        }
      } catch (emailErr: unknown) {
        const emailMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.error(`[Webhook] Error dispatching transactional email for order ${orderId}:`, emailMsg);
        await finishReceiptEmailDelivery(orderId, false, emailMsg).catch(() => {});
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

    // 3. Handle asynchronous status changes for an existing Stripe refund.
    if (event.type === "refund.updated" || event.type === "refund.created") {
      const refund = event.data.object as Stripe.Refund;
      const paymentIntentId = resolvePaymentIntentReference(refund.payment_intent);
      if (paymentIntentId) {
        const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
        await recordPaymentRefundFact({
          refundId: refund.id,
          paymentIntentId,
          chargeId: chargeId || undefined,
          amountCents: refund.amount,
          currency: refund.currency || "usd",
          providerRefundStatus: refund.status || undefined,
          providerStatusObservedAt: event.created * 1000,
          livemode: event.livemode,
          providerEventId: event.id,
          occurredAt: refund.created * 1000,
          reason: refund.reason || undefined,
        });
        await recordOfferRefundOutcome({
          refundId: refund.id, paymentIntentId, orderId: refund.metadata?.orderId, recipientId: refund.metadata?.recipientId,
          amountCents: refund.amount, currency: refund.currency, livemode: event.livemode, status: refund.status, occurredAt: refund.created * 1_000,
        });
      }
      await markWebhookInboxProcessed(event.id);
      return NextResponse.json({ received: true, event: event.type });
    }

    // 4. Handle Charge Refunded (supports partial and multiple refunds)
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = resolvePaymentIntentReference(charge.payment_intent);
      const orderId = paymentIntentId ? charge.metadata?.orderId : undefined;
      const isTestPayment = event.livemode === false || charge.livemode === false;

      let refundsList = charge.refunds?.data || [];
      if (!isTestEnvironment && (!refundsList.length || charge.refunds?.has_more)) {
        const stripe = getStripeClient();
        refundsList = [];
        let cursor: string | undefined;
        for (let page = 0; page < 3; page++) {
          const current = await stripe.refunds.list({ charge: charge.id, limit: 100, starting_after: cursor });
          refundsList.push(...current.data);
          if (!current.has_more) break;
          cursor = current.data.at(-1)?.id;
          if (!cursor || page === 2) throw new Error("Provider refund itemization exceeds the reconciliation window.");
        }
      }
      if (refundsList.length > 0) {
        for (const r of refundsList) {
          await recordPaymentRefundFact({
            refundId: r.id,
            orderId,
            paymentIntentId,
            chargeId: charge.id,
            amountCents: r.amount,
            currency: r.currency || charge.currency || "usd",
            providerRefundStatus: r.status || undefined,
            providerStatusObservedAt: event.created * 1000,
            livemode: !isTestPayment,
            commercialKind: paymentIntentId ? undefined : "unresolved_historical",
            providerEventId: event.id,
            occurredAt: (r.created || charge.created) * 1000,
            reason: r.reason || undefined,
          });
          if (paymentIntentId) await recordOfferRefundOutcome({
            refundId: r.id, paymentIntentId, orderId, recipientId: r.metadata?.recipientId,
            amountCents: r.amount, currency: r.currency || charge.currency, livemode: !isTestPayment,
            status: r.status, occurredAt: (r.created || charge.created) * 1_000,
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
