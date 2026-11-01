/** Analytics-only durable projection handler. No email or supplier side effects live here. */
import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { OutboxEntry } from "./transactional-outbox";

export async function projectAnalyticsOutboxEntry(entry: OutboxEntry): Promise<void> {
  if (entry.topic !== "analytics_projection") throw new Error("Unsupported outbox topic");
  const amount = entry.payload.amountInCents;
  const currency = entry.payload.currency;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0 || currency !== "usd") {
    throw new Error("Analytics projection payload failed validation");
  }
  const ref = firestoreDb.collection("analytics_order_projections").doc(entry.outboxId);
  await firestoreDb.runTransaction(async (tx: any) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    tx.set(ref, sanitizeFirestoreData({
      projectionId: entry.outboxId,
      operationId: typeof entry.payload.operationId === "string" ? entry.payload.operationId : null,
      orderId: entry.orderId || entry.aggregateId,
      paymentIntentId: entry.paymentIntentId || null,
      amountInCents: amount,
      currency,
      isLive: entry.payload.isLive === true,
      orderStatusAtCapture: typeof entry.payload.status === "string" ? entry.payload.status : "unknown",
      projectedAt: Date.now(),
    }));
  });
}
