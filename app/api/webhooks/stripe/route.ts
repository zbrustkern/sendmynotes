import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";
import { logIncident } from "@/lib/incident-logger";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import {
  sendDeferredAddressReceiptEmail,
  sendOrderPenningReceiptEmail,
} from "@/lib/email/transactional";
import { effectiveOrderEmail } from "@/lib/checkout-contact";
import { claimReceiptEmailDelivery, finishReceiptEmailDelivery } from "@/lib/receipt-email-delivery";
import Stripe from "stripe";
import { buildPurchaseMeasurement, persistPurchaseMeasurement, validateVerifiedCapture } from "@/lib/purchase-measurement";

export async function POST(req: NextRequest) {
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

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata?.orderId;

      if (!orderId) {
        console.warn("[Webhook] payment_intent.succeeded missing metadata.orderId:", paymentIntent.id);
        return NextResponse.json({ received: true, warning: "Missing orderId in metadata" });
      }

      const isTestPayment = event.livemode === false || paymentIntent.livemode === false;
      const paymentMode = isTestPayment ? "stripe_test" : "live";

      const order = await getOrderById(orderId);
      if (!order) {
        console.warn("[Webhook] PaymentIntent references a missing order.");
        return NextResponse.json({ received: true, error: "Order not found" }, { status: 200 });
      }
      if (paymentIntent.status !== "succeeded") {
        return NextResponse.json({ received: true, error: "PaymentIntent is not succeeded" }, { status: 200 });
      }
      const captureError = validateVerifiedCapture(order, {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        amountReceived: paymentIntent.amount_received,
        currency: paymentIntent.currency,
      });
      if (captureError || paymentIntent.metadata?.orderId !== order.id || event.livemode !== paymentIntent.livemode) {
        const reason = captureError || "PaymentIntent order binding or livemode mismatch.";
        await logIncident({ type: "WEBHOOK", severity: "error", summary: "Stripe capture verification failed", technicalDetails: reason });
        return NextResponse.json({ received: true, error: reason }, { status: 200 });
      }
      try {
        await persistPurchaseMeasurement(orderId, buildPurchaseMeasurement(order, {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          amountReceived: paymentIntent.amount_received,
          currency: paymentIntent.currency,
          livemode: paymentIntent.livemode,
        }));
      } catch {
        console.warn("[Webhook] Purchase measurement snapshot write unavailable.");
      }

      console.log(
        `[Webhook] Payment confirmed for Order ${orderId} (mode: ${paymentMode}, livemode: ${!isTestPayment}). Processing order...`
      );

      const customerEmail = effectiveOrderEmail(order, paymentIntent.receipt_email);

      const result = await processPaidOrder(
        orderId,
        paymentIntent.id,
        customerEmail || undefined,
        {
          isTest: isTestPayment,
          paymentMode,
        }
      );

      if (!result.success) {
        return NextResponse.json({
          received: true,
          status: result.status,
          error: result.error,
        }, { status: 200 });
      }

      // Automated Transactional Email Dispatch (Resend + Google Secret Manager)
      try {
        if (customerEmail) {
          const claim = await claimReceiptEmailDelivery(orderId);
          if (claim) {
            const isAddressDeferred = Boolean(
              claim.addressDeferred ||
              (claim as any).address_deferred ||
              claim.status === "AWAITING_RECIPIENT_ADDRESS" ||
              paymentIntent.metadata?.address_deferred === "true" ||
              paymentIntent.metadata?.addressDeferred === "true"
            );

            try {
              if (isAddressDeferred) {
                console.log(
                  `[Webhook] Dispatching Scenario A (deferred address) receipt email to ${customerEmail} for order ${orderId}...`
                );
                await sendDeferredAddressReceiptEmail({
                  order: claim,
                  customerEmail,
                });
              } else {
                console.log(
                  `[Webhook] Dispatching Scenario B (penning confirmation) receipt email to ${customerEmail} for order ${orderId}...`
                );
                await sendOrderPenningReceiptEmail({
                  order: claim,
                  customerEmail,
                });
              }
              await finishReceiptEmailDelivery(orderId, isAddressDeferred);
            } catch (sendErr: unknown) {
              const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
              await finishReceiptEmailDelivery(orderId, isAddressDeferred, sendMsg);
              throw sendErr;
            }
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

      return NextResponse.json({
        received: true,
        orderId,
        handwryttenOrderId: result.handwryttenOrderId,
        status: result.status,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Webhook handler exception";
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
