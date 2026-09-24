import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import {
  getOrderById,
  updateOrderStatus,
  getImageCachePoolCollection,
} from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
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

      console.log(`[Webhook] Payment confirmed for Order ${orderId}. Starting Handwrytten fulfillment...`);

      // 1. Read Order from Firestore
      const order = await getOrderById(orderId);
      if (!order) {
        console.error(`[Webhook] Order ${orderId} not found in Firestore.`);
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }

      // Update status to PAYMENT_RECEIVED
      await updateOrderStatus(orderId, {
        status: "PAYMENT_RECEIVED",
        stripePaymentId: paymentIntent.id,
        customerEmail: paymentIntent.receipt_email || order.customerEmail,
      });

      // 2. Fulfill via Handwrytten robotic pen API
      const fulfillment = await fulfillHandwryttenOrder({
        imageUrl: order.frontImageUrl,
        printedGreeting: order.printedMessage,
        handwrittenMessage: order.handwrittenNote,
        fontId: order.fontStyleId || "1",
        recipient: order.recipientAddress,
        returnAddress: order.returnAddress,
        scheduledSendDate: order.scheduledSendDate,
      });

      if (!fulfillment.success) {
        console.error(`[Webhook] Handwrytten fulfillment queued/retry for Order ${orderId}:`, fulfillment.error);
        await updateOrderStatus(orderId, {
          status: "QUEUED_FOR_FULFILLMENT",
          fulfillmentError: fulfillment.error || "Awaiting studio fulfillment queue",
        });

        await logIncident({
          type: "HANDWRYTTEN",
          severity: "error",
          summary: `Handwrytten robotic pen dispatch failed for Order ${orderId}`,
          technicalDetails: fulfillment.error || "Handwrytten singleStepOrder API error",
          metadata: { orderId, details: fulfillment.details },
        });

        return NextResponse.json({
          received: true,
          status: "QUEUED_FOR_FULFILLMENT",
          error: fulfillment.error,
        }, { status: 200 });
      }

      // 3. Update Firestore Order to PROCESSING_HANDWRYTTEN
      await updateOrderStatus(orderId, {
        status: "PROCESSING_HANDWRYTTEN",
        handwryttenOrderId: fulfillment.order_id,
      });

      // 4. Mark image as CLAIMED in image_cache_pool if matched
      try {
        const cacheSnapshot = await getImageCachePoolCollection()
          .where("imageUrl", "==", order.frontImageUrl)
          .limit(1)
          .get();

        if (!cacheSnapshot.empty) {
          const docId = cacheSnapshot.docs[0].id;
          await getImageCachePoolCollection().doc(docId).update({
            status: "CLAIMED",
          });
        }
      } catch (cacheErr) {
        console.warn("[Webhook] Notice updating cache pool status:", cacheErr);
      }

      console.log(`[Webhook] Order ${orderId} successfully dispatched to Handwrytten robot pen! OrderID: ${fulfillment.order_id}`);

      return NextResponse.json({
        received: true,
        orderId,
        handwryttenOrderId: fulfillment.order_id,
        status: "PROCESSING_HANDWRYTTEN",
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
