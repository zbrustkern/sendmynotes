import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, getStripeSecretKey } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";
import { getOrderById } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { orderId, paymentIntentId, customerEmail } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // If order is already completed/processing, return immediately
    if (
      order.status === "PROCESSING_HANDWRYTTEN" ||
      order.status === "MAILED"
    ) {
      return NextResponse.json({
        success: true,
        status: order.status,
        orderId,
        alreadyProcessed: true,
      });
    }

    // Verify payment with Stripe
    const secret = getStripeSecretKey();
    let verifiedPaymentIntentId = paymentIntentId || order.stripePaymentId;

    if (!secret || secret.startsWith("sk_test_placeholder")) {
      // Mock / Dev mode fallback
      console.log(`[Confirm Order] Mock mode verification for order ${orderId}`);
    } else if (verifiedPaymentIntentId) {
      try {
        const stripe = getStripeClient();
        const pi = await stripe.paymentIntents.retrieve(verifiedPaymentIntentId);

        if (pi.status !== "succeeded") {
          return NextResponse.json(
            {
              success: false,
              status: "PAYMENT_NOT_SUCCEEDED",
              message: `PaymentIntent status is ${pi.status}`,
            },
            { status: 400 }
          );
        }

        // Verify orderId matches metadata if present
        if (pi.metadata?.orderId && pi.metadata.orderId !== orderId) {
          return NextResponse.json(
            { error: "PaymentIntent orderId mismatch" },
            { status: 400 }
          );
        }
      } catch (stripeErr: unknown) {
        console.warn("[Confirm Order] Notice verifying PaymentIntent with Stripe:", stripeErr);
      }
    }

    // Process and fulfill the paid order
    const result = await processPaidOrder(
      orderId,
      verifiedPaymentIntentId || `pi_direct_${orderId}`,
      customerEmail
    );

    return NextResponse.json({
      success: result.success,
      status: result.status,
      orderId,
      handwryttenOrderId: result.handwryttenOrderId,
      error: result.error,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error confirming order";
    console.error("[Confirm Order Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
