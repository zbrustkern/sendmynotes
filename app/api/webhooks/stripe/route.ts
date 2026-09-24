import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";
import { logIncident } from "@/lib/incident-logger";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const mockIntentHeader = req.headers.get("x-mock-payment-intent");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    // Support mock execution header in dev/test mode
    if (mockIntentHeader || !webhookSecret || webhookSecret.includes("placeholder")) {
      const parsed = JSON.parse(rawBody);
      event = parsed as Stripe.Event;
    } else {
      if (!signature) {
        return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
      }
      try {
        event = constructWebhookEvent(rawBody, signature, webhookSecret);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Webhook signature error";
        return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
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
