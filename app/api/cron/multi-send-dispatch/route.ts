import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { getOrdersCollection, updateOrderStatus } from "@/lib/firebase-admin";
import { firestoreDb } from "@/lib/firebase-admin";
import { dispatchMultiSendChildren, isMultiSendOrder, preparePaidMultiSend } from "@/lib/multi-send/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req, "MULTI_SEND_WORKER_SECRET")) return NextResponse.json({ error: "Multi-send worker authorization is required.", code: "unauthorized" }, { status: 401, headers });
  if (process.env.STAGING_REVIEW_ONLY === "true" || process.env.HANDWRYTTEN_TEST_MODE === "true" || !process.env.HANDWRYTTEN_API_KEY) return NextResponse.json({ data: { state: "held_by_environment", processed: 0 } }, { status: 202, headers });
  const scanPerState = 25;
  const lock = firestoreDb.collection("system_config").doc("multi_send_worker_lock");
  const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const acquired = await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(lock); const current = snap.data() as any;
    if (current?.leaseExpiresAt > Date.now()) return false;
    tx.set(lock, { workerId, leaseExpiresAt: Date.now() + 180_000, updatedAt: Date.now() }); return true;
  });
  if (!acquired) return NextResponse.json({ data: { state: "already_running", processed: 0 } }, { status: 202, headers });
  try {
    const statuses = ["MULTI_SEND_QUEUED", "MULTI_SEND_READY", "MULTI_SEND_PARTIAL", "MULTI_SEND_CHECKING"];
    const snapshots = await Promise.all(statuses.map((status) => getOrdersCollection().where("fulfillmentStatus", "==", status).orderBy("updatedAt", "asc").limit(scanPerState).get()));
    const parents = new Map<string, any>();
    for (const snapshot of snapshots) for (const doc of snapshot.docs) parents.set(doc.id, doc.data());
    // Fetch a bounded window from every eligible status, then sort the union by
    // update time so a busy QUEUED lane cannot starve older CHECKING/PARTIAL work.
    const candidates = [...parents.entries()].filter(([, row]) => isMultiSendOrder(row)).sort(([aId, a], [bId, b]) => {
      const millis = (value: any) => typeof value === "number" ? value : typeof value?.toMillis === "function" ? value.toMillis() : 0;
      return millis(a.updatedAt) - millis(b.updatedAt) || aId.localeCompare(bId);
    }).slice(0, 1);
    const result: Array<{ orderId: string; state: string; accepted?: number; rejected?: number; uncertain?: number; pending?: number }> = [];
    for (const [orderId] of candidates) {
      const prepared = await preparePaidMultiSend(orderId);
      if (!prepared.ready) { result.push({ orderId, state: prepared.status }); continue; }
      try {
        const dispatched = await dispatchMultiSendChildren(orderId, 5);
        result.push({ orderId, state: "processed", ...dispatched });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Batch dispatch needs operator attention.";
        await updateOrderStatus(orderId, { fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: message } as any);
        result.push({ orderId, state: "held" });
      }
    }
    return NextResponse.json({ data: { state: "succeeded", processed: result.length, results: result } }, { headers });
  } catch {
    return NextResponse.json({ error: "Multi-send queue needs operator attention.", code: "queue_unavailable" }, { status: 503, headers });
  } finally {
    await firestoreDb.runTransaction(async (tx: any) => {
      const snap = await tx.get(lock); if (snap.exists && (snap.data() as any)?.workerId === workerId) tx.delete(lock);
    });
  }
}
