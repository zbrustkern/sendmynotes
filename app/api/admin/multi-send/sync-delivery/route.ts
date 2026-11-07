import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { firestoreDb, getOrdersCollection, getOrderById } from "@/lib/firebase-admin";
import { fetchHandwryttenOrderStatus } from "@/lib/handwrytten";
import { isMultiSendOrder, type Delivery } from "@/lib/multi-send/orders";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await req.json();
    const orderId = String(body.orderId || ""), recipientId = String(body.recipientId || "");
    const parent = await getOrderById(orderId);
    if (!isMultiSendOrder(parent)) return NextResponse.json({ error: "Multi-send parent not found." }, { status: 404 });
    const ref = getOrdersCollection().doc(orderId).collection("deliveries").doc(recipientId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    const child = snap.data() as Delivery;
    if ((child.state === "DISPATCH_UNCERTAIN" || child.state === "DISPATCHING") && !child.supplierOrderId) return NextResponse.json({ success: false, state: child.state, error: "No supplier ID is recorded. This child remains on hold; do not resend or correct it. Provider correlation needs operator investigation." }, { status: 409 });
    if (!child.supplierOrderId) return NextResponse.json({ error: "Delivery has no supplier order ID." }, { status: 409 });
    if (!["ACCEPTED", "MAILED", "DISPATCH_UNCERTAIN"].includes(child.state)) return NextResponse.json({ error: "This child is not in a supplier-status-syncable state." }, { status: 409 });
    const result = await fetchHandwryttenOrderStatus(child.supplierOrderId);
    if (!result.success) return NextResponse.json({ success: false, error: result.error || "Supplier status lookup failed." }, { status: 503 });
    const normalized = String(result.status || "").toLowerCase().trim();
    const mailed = ["mailed", "sent", "shipped", "complete", "completed", "done"].includes(normalized);
    const updated = await firestoreDb.runTransaction(async (tx: any) => {
      const currentSnap = await tx.get(ref); if (!currentSnap.exists) return false;
      const current = currentSnap.data() as Delivery;
      if (current.supplierOrderId !== child.supplierOrderId || current.stateVersion !== child.stateVersion || !["ACCEPTED", "MAILED", "DISPATCH_UNCERTAIN"].includes(current.state)) return false;
      tx.update(ref, { state: mailed ? "MAILED" : current.state === "DISPATCH_UNCERTAIN" ? "DISPATCH_UNCERTAIN" : "ACCEPTED", handwryttenStatus: result.status, ...(result.trackingNumber ? { trackingNumber: result.trackingNumber } : {}), ...(result.trackingUrl ? { trackingUrl: result.trackingUrl } : {}), ...(result.dateSent ? { mailedAt: result.dateSent } : {}), lastStatusSyncAt: Date.now(), lastStatusSyncBy: actor, stateVersion: current.stateVersion + 1, updatedAt: Date.now() }); return true;
    });
    if (!updated) return NextResponse.json({ error: "Delivery changed during supplier sync; refresh before continuing." }, { status: 409 });
    const rowsSnapshot = await ref.parent.get();
    const rows = rowsSnapshot.docs.map((doc: any) => doc.data() as Delivery);
    const hasUncertain = rows.some((row) => row.state === "DISPATCH_UNCERTAIN" || row.state === "DISPATCHING");
    const allTerminal = rows.length === parent.multiSend.recipients.length && rows.every((row) => ["MAILED", "REJECTED", "REFUNDED"].includes(row.state));
    await getOrdersCollection().doc(orderId).update({ status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: hasUncertain ? "MULTI_SEND_CHECKING" : allTerminal ? "MULTI_SEND_COMPLETE" : "MULTI_SEND_PARTIAL", updatedAt: Date.now() });
    return NextResponse.json({ success: true, orderId, recipientId, state: mailed ? "MAILED" : "ACCEPTED", status: result.status, trackingNumber: result.trackingNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery status sync failed." }, { status: 503 });
  }
}
