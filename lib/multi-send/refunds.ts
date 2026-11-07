import { firestoreDb, getOrderById, getOrdersCollection, updateOrderStatus } from "../firebase-admin";
import { getStripeClient } from "../stripe";
import { recordPaymentRefundFact } from "../financial-ledger";
import { isMultiSendOrder, type Delivery } from "./orders";

export async function refundMultiSendDelivery(input: { orderId: string; recipientId: string; expectedStateVersion: number; reason: string; idempotencyKey: string; actor: string; adapter?: (args: any, options: any) => Promise<any> }) {
  const { orderId, recipientId } = input;
  if (!input.actor || !input.reason.trim() || input.reason.trim().length > 500 || !/^[\w:-]{16,128}$/.test(input.idempotencyKey)) throw new Error("Actor, bounded reason, and an explicit idempotency key are required.");
  const order = await getOrderById(orderId);
  if (!isMultiSendOrder(order) || !order.stripePaymentId || order.paymentMode !== "live" || order.isTest || order.isComp || order.isFounderTest) throw new Error("A live, captured multi-send parent is required.");
  const parentRef = getOrdersCollection().doc(orderId);
  const ref = parentRef.collection("deliveries").doc(recipientId);
  const captureRef = firestoreDb.collection("financial_facts").doc(`fact_cap_${order.stripePaymentId}`);
  const totalCents = order.multiSend.quote.totalCents;
  const reserved = await firestoreDb.runTransaction(async (tx: any) => {
    const [parentSnap, snap, captureSnap] = await Promise.all([tx.get(parentRef), tx.get(ref), tx.get(captureRef)]);
    if (!parentSnap.exists || !captureSnap.exists) throw new Error("Verified payment or delivery manifest is unavailable.");
    const currentParent = parentSnap.data() as any;
    const capture = captureSnap.data() as any;
    if (currentParent.stripePaymentId !== order.stripePaymentId || currentParent.paymentMode !== "live" || !["QUEUED_FOR_FULFILLMENT", "DISPATCH_UNCERTAIN", "PROCESSING_HANDWRYTTEN", "MAILED"].includes(currentParent.status) ||
        capture.provider !== "stripe" || capture.orderId !== orderId || capture.livemode !== true || capture.currency !== "usd" || capture.amountCents !== totalCents || totalCents !== (currentParent.finalAmountInCents ?? currentParent.amountInCents)) {
      throw new Error("Matching live payment capture, currency, and parent total are required before refund.");
    }
    const allocationSnapshots = await Promise.all(order.multiSend.recipients.map((row) => tx.get(parentRef.collection("deliveries").doc(row.id))));
    const allocations = allocationSnapshots.filter((row: any) => row.exists).map((row: any) => row.data() as Delivery);
    if (allocations.length !== order.multiSend.recipients.length || allocations.reduce((sum: number, row: Delivery) => sum + row.amountInCents, 0) !== totalCents) throw new Error("Complete child allocations must equal the paid parent total.");
    if (!snap.exists) throw new Error("Delivery not found.");
    const child = snap.data() as Delivery & { refundIdempotencyKey?: string; refundRequestedBy?: string; refundReason?: string };
    if (child.state === "REFUND_PENDING" && child.refundIdempotencyKey === input.idempotencyKey) return { ...child, duplicate: true };
    if (allocations.some((row: any) => row.recipientId !== recipientId && row.state === "REFUND_PENDING")) throw new Error("Another refund is pending or uncertain; reconcile it before reserving a new refund.");
    if (child.state !== "REJECTED" || child.stateVersion !== input.expectedStateVersion) throw new Error("Only the current, known-rejected child can be refunded.");
    const alreadyReserved = allocations.reduce((sum: number, row: any) => sum + (row.state === "REFUND_PENDING" || row.state === "REFUNDED" ? Number(row.refundAmountInCents || 0) : 0), 0);
    if (child.amountInCents <= 0 || alreadyReserved + child.amountInCents > totalCents) throw new Error("Refund would exceed the parent capture or allocated child amount.");
    tx.update(ref, { state: "REFUND_PENDING", stateVersion: child.stateVersion + 1, refundIdempotencyKey: input.idempotencyKey, refundRequestedBy: input.actor, refundReason: input.reason.trim(), refundAmountInCents: child.amountInCents, refundAttemptStartedAt: Date.now(), updatedAt: Date.now() });
    tx.update(parentRef, { multiSendRefundReservedCents: alreadyReserved + child.amountInCents, multiSendRefundVersion: Number(currentParent.multiSendRefundVersion || 0) + 1, updatedAt: Date.now() });
    return { ...child, state: "REFUND_PENDING", stateVersion: child.stateVersion + 1, refundIdempotencyKey: input.idempotencyKey };
  });
  if ((reserved as any).duplicate) return { refundId: (reserved as any).refundId, status: "pending", amountInCents: reserved.amountInCents };
  if (reserved.state !== "REFUND_PENDING" || reserved.refundIdempotencyKey !== input.idempotencyKey) throw new Error("Refund state reservation failed.");
  const adapter = input.adapter || ((args: any, options: any) => getStripeClient().refunds.create(args, options));
  let refund: any;
  try {
    refund = await adapter({ payment_intent: order.stripePaymentId, amount: reserved.amountInCents, reason: "requested_by_customer", metadata: { orderId, recipientId } }, { idempotencyKey: input.idempotencyKey });
  } catch (error) {
    await ref.update({ refundStatus: "unknown", refundError: error instanceof Error ? error.message.slice(0, 240) : "Provider response was lost", updatedAt: Date.now() });
    throw new Error("Stripe refund result is unknown. Reconcile read-only before taking another action.");
  }
  if (refund.payment_intent !== order.stripePaymentId || Number(refund.amount) !== reserved.amountInCents || String(refund.currency || "usd").toLowerCase() !== "usd" || refund.livemode !== true) {
    await ref.update({ refundStatus: "unknown", refundMismatchAt: Date.now(), updatedAt: Date.now() });
    throw new Error("Stripe refund result does not match the reserved live payment allocation; reconciliation is required.");
  }
  await recordPaymentRefundFact({ refundId: String(refund.id), orderId, paymentIntentId: order.stripePaymentId, chargeId: typeof refund.charge === "string" ? refund.charge : undefined, amountCents: Number(refund.amount), currency: String(refund.currency || "usd"), providerRefundStatus: String(refund.status || "pending"), livemode: Boolean(refund.livemode), reason: input.reason.trim(), reconciledBy: input.actor, reconciliationNotes: `multi_send_delivery:${recipientId}` });
  const state = refund.status === "succeeded" ? "REFUNDED" : "REFUND_PENDING";
  await ref.update({ state, stateVersion: reserved.stateVersion + 1, refundId: String(refund.id), refundAmountInCents: Number(refund.amount), refundStatus: String(refund.status || "pending"), updatedAt: Date.now() });
  const children = await ref.parent.get();
  const rows = children.docs.map((doc: any) => doc.data() as Delivery);
  const pending = rows.some((row) => row.state === "DISPATCH_UNCERTAIN" || row.state === "DISPATCHING");
  await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: pending ? "MULTI_SEND_CHECKING" : "MULTI_SEND_PARTIAL", updatedAt: Date.now() } as any);
  return { refundId: String(refund.id), status: String(refund.status || "pending"), amountInCents: Number(refund.amount) };
}

export async function reconcileMultiSendRefund(input: { orderId: string; recipientId: string; actor: string; retrieve?: (id: string) => Promise<any>; lookup?: (paymentIntentId: string) => Promise<any[]> }) {
  const order = await getOrderById(input.orderId);
  if (!isMultiSendOrder(order) || !order.stripePaymentId || !input.actor) throw new Error("Paid batch and authenticated operator are required.");
  const ref = getOrdersCollection().doc(input.orderId).collection("deliveries").doc(input.recipientId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Delivery not found.");
  const child = snap.data() as Delivery & { refundId?: string; refundReason?: string };
  if (child.state !== "REFUND_PENDING") throw new Error("This delivery has no pending Stripe refund to reconcile.");
  let refund: any;
  if (child.refundId) {
    const retrieve = input.retrieve || ((id: string) => getStripeClient().refunds.retrieve(id));
    refund = await retrieve(child.refundId);
  } else {
    const lookup = input.lookup || (async (paymentIntentId: string) => (await getStripeClient().refunds.list({ payment_intent: paymentIntentId, limit: 100 })).data);
    const matches = (await lookup(order.stripePaymentId)).filter((row: any) => row.payment_intent === order.stripePaymentId && row.metadata?.orderId === input.orderId && row.metadata?.recipientId === input.recipientId);
    if (!matches.length) return { refundId: null, status: "unresolved", amountInCents: child.refundAmountInCents };
    if (matches.length !== 1) throw new Error("Multiple Stripe refunds match this child; operator review is required.");
    refund = matches[0];
  }
  if (refund.payment_intent !== order.stripePaymentId || Number(refund.amount) !== child.refundAmountInCents || String(refund.currency || "usd").toLowerCase() !== "usd" || refund.livemode !== true || (child.refundId && child.refundId !== String(refund.id))) throw new Error("Stripe refund identity, amount, currency, or mode does not match the reserved child allocation.");
  await recordPaymentRefundFact({ refundId: String(refund.id), orderId: input.orderId, paymentIntentId: order.stripePaymentId, chargeId: typeof refund.charge === "string" ? refund.charge : undefined, amountCents: Number(refund.amount), currency: String(refund.currency || "usd"), providerRefundStatus: String(refund.status || "pending"), livemode: Boolean(refund.livemode), reason: child.refundReason, reconciledBy: input.actor, reconciliationNotes: `multi_send_refund_reconciled:${input.recipientId}` });
  const state = refund.status === "succeeded" ? "REFUNDED" : "REFUND_PENDING";
  const committed = await firestoreDb.runTransaction(async (tx: any) => {
    const currentSnap = await tx.get(ref); if (!currentSnap.exists) return false;
    const current = currentSnap.data() as Delivery;
    if (current.state !== "REFUND_PENDING" || current.stateVersion !== child.stateVersion || current.refundAmountInCents !== child.refundAmountInCents || (current.refundId && current.refundId !== String(refund.id))) return false;
    tx.update(ref, { state, stateVersion: current.stateVersion + 1, refundId: String(refund.id), refundStatus: String(refund.status || "pending"), updatedAt: Date.now() }); return true;
  });
  if (!committed) throw new Error("Refund state changed during reconciliation; recorded provider fact requires operator review.");
  return { refundId: String(refund.id), status: String(refund.status || "pending"), amountInCents: Number(refund.amount) };
}
