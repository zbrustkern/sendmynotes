import { NextRequest, NextResponse } from "next/server";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { fetchHandwryttenOrderStatus } from "@/lib/handwrytten";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { Order } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to order status sync" },
        { status: 401 }
      );
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.handwryttenOrderId) {
      return NextResponse.json(
        { error: "Order has no Handwrytten Order ID yet" },
        { status: 400 }
      );
    }

    console.log(
      `[Admin] Fetching live Handwrytten status for Order ${orderId} (HW: ${order.handwryttenOrderId})...`
    );

    const result = await fetchHandwryttenOrderStatus(order.handwryttenOrderId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to query Handwrytten" },
        { status: 400 }
      );
    }

    const updates: Partial<Order> = {
      handwryttenStatus: result.status,
    };

    if (result.trackingNumber) updates.handwryttenTrackingNumber = result.trackingNumber;
    if (result.trackingUrl) updates.handwryttenTrackingUrl = result.trackingUrl;
    if (result.dateSent) updates.handwryttenMailedDate = result.dateSent;

    const lowerStatus = (result.status || "").toLowerCase();
    if (
      lowerStatus.includes("mail") ||
      lowerStatus.includes("ship") ||
      lowerStatus.includes("complete") ||
      lowerStatus.includes("sent") ||
      lowerStatus === "done"
    ) {
      updates.status = "MAILED";
      if (!updates.handwryttenMailedDate) {
        updates.handwryttenMailedDate = new Date().toISOString().split("T")[0];
      }
    }

    await updateOrderStatus(orderId, updates);

    return NextResponse.json({
      success: true,
      orderId,
      handwryttenOrderId: order.handwryttenOrderId,
      status: updates.status || order.status,
      handwryttenStatus: result.status,
      trackingNumber: updates.handwryttenTrackingNumber,
      trackingUrl: updates.handwryttenTrackingUrl,
      mailedDate: updates.handwryttenMailedDate,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Sync status exception";
    console.error("[Admin Sync Handwrytten Exception]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
