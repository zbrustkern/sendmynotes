import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";
import { logIncident } from "@/lib/incident-logger";
import Stripe from "stripe";

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

      console.log(`[Webhook] Payment confirmed for Order ${orderId}. Processing order...`);

      const result = await processPaidOrder(
        orderId,
        paymentIntent.id,
        paymentIntent.receipt_email || undefined
      );

      if (!result.success) {
        return NextResponse.json({
          received: true,
          status: result.status,
          error: result.error,
        }, { status: 200 });
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
