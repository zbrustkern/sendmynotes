import { localTimeToEpoch, validCivilDate } from "@/lib/account/calendar";
import { trySyncPostPurchaseOrder } from "@/lib/post-purchase/integration";
import { NextRequest, NextResponse } from "next/server";
import { firestoreDb, getOrdersCollection, updateOrderStatus } from "@/lib/firebase-admin";
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

    // Optional webhook secret validation if configured
    const webhookSecret = process.env.HANDWRYTTEN_WEBHOOK_SECRET;
    if (webhookSecret) {
      const urlToken = req.nextUrl.searchParams.get("token") || req.nextUrl.searchParams.get("secret");
      const headerToken = req.headers.get("x-webhook-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const incomingToken = urlToken || headerToken;
      if (!incomingToken || incomingToken !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
      }
    }

    // Flexible extraction of Handwrytten order ID
    const nestedOrder =
      (payload.order as Record<string, unknown>) ||
      (payload.data as Record<string, unknown>) ||
      null;

    const rawOrderId =
      payload.order_id ||
      payload.id ||
      nestedOrder?.id ||
      nestedOrder?.order_id;

    // Log sanitized metadata only (never log full payload to avoid customer PII leaks)
    console.log("[Handwrytten Webhook] Received webhook event for HW ID:", rawOrderId ? String(rawOrderId) : "unknown");

    if (!rawOrderId) {
      console.warn("[Handwrytten Webhook] Received event without identifiable order_id");
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

    // Batch supplier IDs belong to child delivery records. Update only the
    // matched child and derive the parent summary from its frozen manifest.
    const deliverySnapshot = await firestoreDb.collectionGroup("deliveries").where("supplierOrderId", "==", hwOrderId).limit(1).get();
    if (!deliverySnapshot.empty) {
      if (!webhookSecret) return NextResponse.json({ error: "Batch delivery webhook authentication is not configured." }, { status: 503 });
      const urlToken = req.nextUrl.searchParams.get("token") || req.nextUrl.searchParams.get("secret");
      const headerToken = req.headers.get("x-webhook-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if ((urlToken || headerToken) !== webhookSecret) return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
      const deliveryDoc = deliverySnapshot.docs[0];
      const delivery = deliveryDoc.data() as any;
      const parentRef = deliveryDoc.ref.parent.parent;
      if (!parentRef || delivery.parentOrderId !== parentRef.id) return NextResponse.json({ received: true, warning: "Batch delivery parent could not be verified." });
      const mailed = ["mailed", "sent", "shipped", "complete", "completed", "done"].includes(rawStatus);
      const transitioned = await firestoreDb.runTransaction(async (tx: any) => {
        const currentSnap = await tx.get(deliveryDoc.ref); if (!currentSnap.exists) return false;
        const current = currentSnap.data() as any;
        if (current.supplierOrderId !== hwOrderId || !["ACCEPTED", "MAILED", "DISPATCH_UNCERTAIN"].includes(current.state)) return false;
        tx.update(deliveryDoc.ref, { state: mailed ? "MAILED" : current.state, handwryttenStatus: rawStatus, ...(payload.tracking_number ? { trackingNumber: String(payload.tracking_number) } : {}), ...(payload.tracking_url ? { trackingUrl: String(payload.tracking_url) } : {}), ...(payload.date_sent || payload.mailed_date ? { mailedAt: String(payload.date_sent || payload.mailed_date) } : {}), stateVersion: Number(current.stateVersion || 0) + 1, updatedAt: Date.now() }); return true;
      });
      if (!transitioned) return NextResponse.json({ received: true, warning: "Delivery state changed or is not supplier-status-syncable." });
      const children = await parentRef.collection("deliveries").get();
      const rows = children.docs.map((doc: any) => doc.data());
      const uncertain = rows.some((row: any) => row.state === "DISPATCH_UNCERTAIN" || row.state === "DISPATCHING");
      const allTerminal = rows.length > 0 && rows.every((row: any) => ["MAILED", "REJECTED", "REFUNDED"].includes(row.state));
      await parentRef.update({ status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: uncertain ? "MULTI_SEND_CHECKING" : allTerminal ? "MULTI_SEND_COMPLETE" : "MULTI_SEND_PARTIAL", updatedAt: Date.now() });
      return NextResponse.json({ received: true, orderId: parentRef.id, deliveryId: delivery.recipientId, handwryttenOrderId: hwOrderId, status: mailed ? "MAILED" : "PROCESSING_HANDWRYTTEN" });
    }

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

    // Retention timing requires explicit authenticated mailing evidence. Legacy
    // broad status/date fallbacks below remain display-only and never start a flow.
    const explicitMailDate = payload.date_sent || payload.mailed_date || nestedOrder?.date_sent || nestedOrder?.mailed_date;
    let explicitMailedAt = NaN;
    if (typeof explicitMailDate === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(explicitMailDate)) {
        const [year, month, day] = explicitMailDate.split("-").map(Number);
        if (validCivilDate({ year, month, day })) explicitMailedAt = localTimeToEpoch({ year, month, day }, 12, "America/Chicago");
      } else if (/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(explicitMailDate)) explicitMailedAt = Date.parse(explicitMailDate);
    }
    if (webhookSecret && ["mailed", "sent", "shipped"].includes(rawStatus) && Number.isFinite(explicitMailedAt) && explicitMailedAt <= Date.now() && explicitMailedAt >= order.createdAt - 86400000) {
      updates.postPurchaseMailedAt = explicitMailedAt;
      updates.postPurchaseMailingEvidence = { source: "authenticated_supplier_mailed_date", recordedAt: Date.now() };
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
    await trySyncPostPurchaseOrder(orderId);
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
