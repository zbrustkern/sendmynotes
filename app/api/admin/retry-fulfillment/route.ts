import { NextRequest, NextResponse } from "next/server";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to fulfillment retry" }, { status: 401 });
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    console.log(`[Admin] Retrying Handwrytten fulfillment for order: ${orderId}...`);

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
      console.error(`[Admin] Retry fulfillment failed for ${orderId}:`, fulfillment.error);
      await updateOrderStatus(orderId, {
        status: "QUEUED_FOR_FULFILLMENT",
        fulfillmentError: fulfillment.error || "Retry fulfillment failed",
      });
      return NextResponse.json(
        {
          success: false,
          error: fulfillment.error,
        },
        { status: 400 }
      );
    }

    await updateOrderStatus(orderId, {
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
      fulfillmentError: undefined,
    });

    console.log(`[Admin] Order ${orderId} successfully fulfilled! HW ID: ${fulfillment.order_id}`);
    return NextResponse.json({
      success: true,
      handwryttenOrderId: fulfillment.order_id,
      status: "PROCESSING_HANDWRYTTEN",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing retry";
    console.error("[Admin Retry Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
