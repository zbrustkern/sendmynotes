import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getOrderById } from "@/lib/firebase-admin";
import { getStripeClient, getStripeSecretKey } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (
      order.status === "PROCESSING_HANDWRYTTEN" ||
      order.status === "MAILED"
    ) {
      return NextResponse.json({
        success: true,
        status: order.status,
        message: "Order is already fulfilled/processing.",
        order,
      });
    }

    const secret = getStripeSecretKey();
    if (!secret || secret.startsWith("sk_test_placeholder")) {
      // In dev mock mode, allow admin to simulate payment verification
      const result = await processPaidOrder(orderId, order.stripePaymentId || `pi_mock_${orderId}`);
      return NextResponse.json({
        success: result.success,
        status: result.status,
        handwryttenOrderId: result.handwryttenOrderId,
        message: "Mock payment confirmed and robotic fulfillment initiated.",
      });
    }

    // Query Stripe to see if PaymentIntent succeeded
    if (!order.stripePaymentId) {
      return NextResponse.json({
        success: false,
        error: "No Stripe PaymentIntent ID associated with this draft order.",
      }, { status: 400 });
    }

    const stripe = getStripeClient();
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentId);

    if (pi.status !== "succeeded") {
      return NextResponse.json({
        success: false,
        status: pi.status,
        message: `Stripe PaymentIntent is in '${pi.status}' state (not succeeded).`,
      });
    }

    // Payment succeeded in Stripe! Process and fulfill via Handwrytten
    const result = await processPaidOrder(
      orderId,
      pi.id,
      pi.receipt_email || order.customerEmail
    );

    return NextResponse.json({
      success: result.success,
      status: result.status,
      handwryttenOrderId: result.handwryttenOrderId,
      message: `Verified Stripe payment (${pi.id})! Dispatched to Handwrytten.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error syncing with Stripe";
    console.error("[Admin Sync Stripe Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
