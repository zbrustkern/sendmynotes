import { NextRequest, NextResponse } from "next/server";
import { getOrdersCollection, updateOrderStatus } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";

/**
 * Handwrytten Order Status Webhook Receiver
 *
 * Configured in Handwrytten Dashboard under Integrations / Webhook Settings:
 * Endpoint: https://sendmynotes.com/api/webhooks/handwrytten
 *
 * Receives order fulfillment events (e.g., written, mailed, shipped, tracking updates),
 * matches with the SendMyNotes order via handwryttenOrderId, and updates Firestore.
 */

export async function GET() {
  return NextResponse.json({
    service: "SendMyNotes Handwrytten Webhook Listener",
    status: "active",
    endpoint: "/api/webhooks/handwrytten",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    let payload: Record<string, unknown> = {};

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        payload = await req.json();
      } catch {
        payload = {};
      }
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      try {
        const formData = await req.formData();
        formData.forEach((val, key) => {
          payload[key] = val.toString();
        });
      } catch {
        payload = {};
      }
    } else {
      const text = await req.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    console.log("[Handwrytten Webhook] Received payload:", JSON.stringify(payload));

    // Flexible extraction of Handwrytten order ID
    const nestedOrder =
      (payload.order as Record<string, unknown>) ||
      (payload.data as Record<string, unknown>) ||
      null;

    const rawOrderId =
      payload.order_id ||
      payload.orderId ||
      payload.id ||
      nestedOrder?.id ||
      nestedOrder?.order_id;

    if (!rawOrderId) {
      console.warn("[Handwrytten Webhook] Received event without identifiable order_id:", payload);
      return NextResponse.json({
        received: true,
        warning: "No order_id found in payload",
      });
    }

    const hwOrderId = String(rawOrderId).trim();

    // Flexible status extraction
    const rawStatus = String(
      payload.status ||
      payload.order_status ||
      nestedOrder?.status ||
      nestedOrder?.order_status ||
      "updated"
    ).toLowerCase().trim();

    // Query matching SendMyNotes order from Firestore
    const snapshot = await getOrdersCollection()
      .where("handwryttenOrderId", "==", hwOrderId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(
        `[Handwrytten Webhook] No SendMyNotes order matched Handwrytten Order ID: ${hwOrderId}`
      );
      return NextResponse.json({
        received: true,
        warning: `Order ${hwOrderId} not found in SendMyNotes system`,
      });
    }

    const orderDoc = snapshot.docs[0];
    const order = orderDoc.data() as Order;
    const orderId = order.id;

    const updates: Partial<Order> = {
      handwryttenStatus: rawStatus,
    };

    // Tracking Number
    const tracking =
      payload.tracking_number ||
      payload.tracking ||
      nestedOrder?.tracking_number ||
      nestedOrder?.tracking;
    if (tracking) {
      updates.handwryttenTrackingNumber = String(tracking);
    }

    // Tracking URL
    const trackingUrl =
      payload.tracking_url ||
      nestedOrder?.tracking_url;
    if (trackingUrl) {
      updates.handwryttenTrackingUrl = String(trackingUrl);
    }

    // Date Sent / Mailed
    const dateSent =
      payload.date_sent ||
      payload.mailed_date ||
      payload.completed_at ||
      nestedOrder?.date_sent ||
      nestedOrder?.mailed_date;
    if (dateSent) {
      updates.handwryttenMailedDate = String(dateSent);
    }

    // Map Handwrytten status to high-level OrderStatus
    if (
      rawStatus.includes("mail") ||
      rawStatus.includes("ship") ||
      rawStatus.includes("complete") ||
      rawStatus.includes("sent") ||
      rawStatus === "done"
    ) {
      updates.status = "MAILED";
      if (!updates.handwryttenMailedDate) {
        updates.handwryttenMailedDate = new Date().toISOString().split("T")[0];
      }
    } else if (
      rawStatus.includes("writ") ||
      rawStatus.includes("print") ||
      rawStatus.includes("process") ||
      rawStatus.includes("queue")
    ) {
      updates.status = "PROCESSING_HANDWRYTTEN";
    }

    await updateOrderStatus(orderId, updates);
    console.log(
      `[Handwrytten Webhook] Successfully updated Order ${orderId} (HW: ${hwOrderId}) ->`,
      updates
    );

    return NextResponse.json({
      received: true,
      orderId,
      handwryttenOrderId: hwOrderId,
      status: updates.status || order.status,
      handwryttenStatus: rawStatus,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Webhook handler exception";
    console.error("[Handwrytten Webhook Exception]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
