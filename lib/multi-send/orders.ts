import { firestoreDb, getOrderById, getOrdersCollection, updateOrderStatus } from "../firebase-admin";
import type { Order } from "../types";
import { prepareHandwryttenCustomCard, submitPreparedHandwryttenOrder } from "../handwrytten";
import { isOperationalControlPaused, updateOperationalControl } from "../operational-controls";

export type MultiSendChoice = { mode: "inherit" } | { mode: "custom"; text: string };
export type MultiSendNote = { salutation?: string; text: string; signOff?: string; style: string };
export type MultiSendParent = NonNullable<Order["multiSend"]>;
export type MultiSendRecipient = MultiSendParent["recipients"][number];

export type DeliveryState = "PENDING" | "DISPATCHING" | "DISPATCH_UNCERTAIN" | "ACCEPTED" | "REJECTED" | "MAILED" | "REFUND_PENDING" | "REFUNDED";
export type Delivery = {
  schemaVersion: 1;
  parentOrderId: string;
  recipientId: string;
  address: MultiSendRecipient["address"];
  correctedAddress?: MultiSendRecipient["address"];
  greeting: MultiSendChoice;
  resolvedGreeting: string;
  printedMessage: string;
  amountInCents: number;
  state: DeliveryState;
  stateVersion: number;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  dispatchAttemptId?: string;
  dispatchFence?: number;
  dispatchStartedAt?: number;
  supplierOrderId?: string;
  outcome?: "accepted" | "rejected" | "unknown";
  error?: string;
  refundId?: string;
  refundAmountInCents?: number;
  refundAttemptStartedAt?: number;
  refundStatus?: string;
};

export function isMultiSendOrder(order: Order | null | undefined): order is Order & { multiSend: MultiSendParent } {
  return order?.multiSend?.version === 1 && order.multiSend.kind === "parent";
}

function deliveries(orderId: string) {
  return getOrdersCollection().doc(orderId).collection("deliveries");
}

/** Materialize all immutable children before any child is eligible for dispatch. */
export async function prepareMultiSendManifest(orderId: string): Promise<{ created: number; complete: boolean }> {
  const order = await getOrderById(orderId);
  if (!isMultiSendOrder(order)) throw new Error("Order is not a multi-send parent.");
  if (order.status === "PENDING_PAYMENT") throw new Error("Cannot prepare children before verified payment.");
  if (!order.multiSend.preparationState || order.multiSend.preparationState !== "ready") {
    await updateOrderStatus(orderId, { multiSend: { ...order.multiSend, manifestComplete: false, preparationState: "blocked" } } as any);
    return { created: 0, complete: false };
  }
  const now = Date.now();
  let created = 0;
  for (const recipient of order.multiSend.recipients) {
    const ref = deliveries(orderId).doc(recipient.id);
    await firestoreDb.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const old = snap.data() as Delivery;
        if (old.parentOrderId !== orderId || old.recipientId !== recipient.id || old.printedMessage !== recipient.printedMessage) {
          throw new Error("Existing delivery does not match the frozen parent snapshot.");
        }
        return;
      }
      const child: Delivery = {
        schemaVersion: 1, parentOrderId: orderId, recipientId: recipient.id,
        address: recipient.address, greeting: recipient.greeting,
        resolvedGreeting: recipient.resolvedGreeting, printedMessage: recipient.printedMessage,
        amountInCents: recipient.amountInCents, state: "PENDING", stateVersion: 1,
        attempts: 0, createdAt: now, updatedAt: now,
      };
      tx.create(ref, child);
      created++;
    });
  }
  const snapshot = await deliveries(orderId).get();
  const complete = snapshot.size === order.multiSend.recipients.length && snapshot.docs.every((doc: any) => {
    const child = doc.data() as Delivery;
    return order.multiSend.recipients.some((r) => r.id === child.recipientId && r.printedMessage === child.printedMessage);
  });
  if (complete) await updateOrderStatus(orderId, { multiSend: { ...order.multiSend, manifestComplete: true } } as any);
  return { created, complete };
}

export async function listMultiSendDeliveries(orderId: string): Promise<Delivery[]> {
  const snap = await deliveries(orderId).get();
  return snap.docs.map((doc: any) => doc.data() as Delivery);
}

/** Prepare shared artwork and record a complete immutable manifest before dispatch. */
export async function preparePaidMultiSend(orderId: string, options: { prepare?: typeof prepareHandwryttenCustomCard } = {}): Promise<{ ready: boolean; status: string; created?: number; error?: string }> {
  const order = await getOrderById(orderId);
  if (!isMultiSendOrder(order)) return { ready: false, status: "NOT_BATCH" };
  if (order.status === "PENDING_PAYMENT" || !order.stripePaymentId || order.paymentMode !== "live" || order.isTest || order.isFounderTest || order.isComp) {
    await updateOrderStatus(orderId, { fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: "Batch requires verified live payment before fulfillment." } as any);
    return { ready: false, status: "PAYMENT_RECEIVED", error: "Batch supplier work requires a verified live customer payment." };
  }
  const capture = await firestoreDb.collection("financial_facts").doc(`fact_cap_${order.stripePaymentId}`).get();
  const captureData = capture.data() as any;
  const parentTotal = order.multiSend.quote.totalCents;
  if (!capture.exists || captureData?.provider !== "stripe" || captureData?.providerObjectId !== order.stripePaymentId || captureData?.livemode !== true || captureData?.orderId !== orderId || captureData?.amountCents !== parentTotal || captureData?.currency !== "usd" || parentTotal !== (order.finalAmountInCents ?? order.amountInCents) || parentTotal !== order.multiSend.recipients.reduce((sum, row) => sum + row.amountInCents, 0)) {
    await updateOrderStatus(orderId, { fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: "Stripe capture does not match the frozen parent quote and child allocations." } as any);
    return { ready: false, status: "MULTI_SEND_HELD", error: "A matching live Stripe capture, currency, total, and child allocations are required before batch preparation." };
  }
  if (process.env.STAGING_REVIEW_ONLY === "true" || process.env.HANDWRYTTEN_TEST_MODE === "true") {
    await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: "Supplier test or staging mode prevents batch fulfillment." } as any);
    return { ready: false, status: "QUEUED_FOR_FULFILLMENT", error: "Batch is held by supplier environment safeguards." };
  }
  if (await isOperationalControlPaused("fulfillment")) { await updateOrderStatus(orderId, { fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: "Supplier submission is paused by operational control." } as any); return { ready: false, status: "MULTI_SEND_HELD", error: "Supplier submission is paused." }; }
  let current = await getOrderById(orderId);
  if (!current || !isMultiSendOrder(current)) return { ready: false, status: "NOT_FOUND" };
  if (!current.multiSend.preparedCardId) {
    // Acquire a preparation fence. A stale in-flight preparation is held for review
    // because the provider may have created an artifact before the process stopped.
    const claim = await firestoreDb.runTransaction(async (tx: any) => {
      const ref = getOrdersCollection().doc(orderId); const snap = await tx.get(ref);
      if (!snap.exists) return "missing";
      const row = snap.data() as Order;
      if (!isMultiSendOrder(row)) return "not_batch";
      if (row.multiSend.preparedCardId) return "prepared";
      if (row.multiSend.preparationState === "preparing" || row.multiSend.preparationState === "uncertain") return "uncertain";
      tx.update(ref, { multiSend: { ...row.multiSend, preparationState: "preparing" }, updatedAt: Date.now() });
      return "claimed";
    });
    if (claim !== "claimed") {
      if (claim === "uncertain") await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_PREPARATION_UNCERTAIN", fulfillmentError: "Shared artwork preparation outcome requires operator review before retry." } as any);
      return { ready: false, status: claim === "uncertain" ? "QUEUED_FOR_FULFILLMENT" : String(claim), error: claim === "uncertain" ? "Shared preparation is uncertain and will not be repeated automatically." : undefined };
    }
    const prepare = options.prepare || prepareHandwryttenCustomCard;
    const prepared = await prepare({ imageUrl: current.multiSend.shared.frontImageUrl, ...(current.uploadMaster ? { uploadMaster: current.uploadMaster } : {}), orderId });
    if (!prepared.success) {
      await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", multiSend: { ...current.multiSend, preparationState: "uncertain" }, fulfillmentStatus: "MULTI_SEND_PREPARATION_UNCERTAIN", fulfillmentError: prepared.error } as any);
      return { ready: false, status: "QUEUED_FOR_FULFILLMENT", error: prepared.error };
    }
    await updateOrderStatus(orderId, { multiSend: { ...current.multiSend, preparedCardId: prepared.cardId, preparationEnvironment: prepared.environment, preparationState: "ready" }, updatedAt: Date.now() } as any);
    current = await getOrderById(orderId);
    if (!current || !isMultiSendOrder(current)) return { ready: false, status: "NOT_FOUND" };
  }
  const manifest = await prepareMultiSendManifest(orderId);
  if (!manifest.complete) return { ready: false, status: "QUEUED_FOR_FULFILLMENT", error: "Delivery manifest is incomplete; supplier dispatch is held." };
  await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_READY", fulfillmentError: undefined } as any);
  return { ready: true, status: "QUEUED_FOR_FULFILLMENT", created: manifest.created };
}

/** Claims and submits only provably unsent children; expired claims become holds. */
async function dispatchMultiSendChildrenLocked(orderId: string, limit = 5, options: { submit?: typeof submitPreparedHandwryttenOrder; lock?: any; workerId?: string } = {}): Promise<{ accepted: number; rejected: number; uncertain: number; pending: number }> {
  const order = await getOrderById(orderId);
  if (!isMultiSendOrder(order) || !order.multiSend.manifestComplete || !order.multiSend.preparedCardId || order.multiSend.preparationEnvironment !== "live") throw new Error("Batch is not prepared with a complete live-environment child manifest.");
  if (order.status === "PENDING_PAYMENT" || !order.stripePaymentId || order.paymentMode !== "live" || order.isTest || order.isFounderTest || order.isComp || process.env.STAGING_REVIEW_ONLY === "true" || process.env.HANDWRYTTEN_TEST_MODE === "true" || !process.env.HANDWRYTTEN_API_KEY) throw new Error("Live supplier dispatch safeguards are not satisfied.");
  const capture = await firestoreDb.collection("financial_facts").doc(`fact_cap_${order.stripePaymentId}`).get();
  const captureData = capture.data() as any;
  const parentTotal = order.multiSend.quote.totalCents;
  if (!capture.exists || captureData?.provider !== "stripe" || captureData?.providerObjectId !== order.stripePaymentId || captureData?.livemode !== true || captureData?.orderId !== orderId || captureData?.amountCents !== parentTotal || captureData?.currency !== "usd" || parentTotal !== (order.finalAmountInCents ?? order.amountInCents) || parentTotal !== order.multiSend.recipients.reduce((sum, row) => sum + row.amountInCents, 0)) throw new Error("A matching live Stripe capture, currency, total, and child allocations are required before child dispatch.");
  if (await isOperationalControlPaused("fulfillment")) throw new Error("Supplier submission is paused.");
  let accepted = 0, rejected = 0, uncertain = 0;
  const children = await listMultiSendDeliveries(orderId);
  for (const child of children.filter((entry) => entry.state === "DISPATCHING" && Date.now() - (entry.dispatchStartedAt || 0) > 5 * 60_000)) {
    await firestoreDb.runTransaction(async (tx: any) => {
      const ref = deliveries(orderId).doc(child.recipientId); const snap = await tx.get(ref); if (!snap.exists) return;
      const current = snap.data() as Delivery;
      if (current.state !== "DISPATCHING" || current.dispatchAttemptId !== child.dispatchAttemptId || current.stateVersion !== child.stateVersion) return;
      tx.update(ref, { state: "DISPATCH_UNCERTAIN", outcome: "unknown", error: "A prior supplier submission attempt expired without a recorded result; reconcile before retrying.", stateVersion: current.stateVersion + 1, updatedAt: Date.now() });
    });
  }
  for (const child of children.filter((entry) => entry.state === "PENDING").slice(0, Math.max(1, Math.min(limit, 10)))) {
    if (options.lock && options.workerId) {
      const ownsLease = await firestoreDb.runTransaction(async (tx: any) => {
        const snap = await tx.get(options.lock); const lease = snap.data() as any;
        if (lease?.workerId !== options.workerId || lease.leaseExpiresAt <= Date.now()) return false;
        tx.update(options.lock, { leaseExpiresAt: Date.now() + 180_000, updatedAt: Date.now() }); return true;
      });
      if (!ownsLease) break;
    }
    const attemptId = `${orderId}_${child.recipientId}_${Date.now()}`;
    const ref = deliveries(orderId).doc(child.recipientId);
    const claimed = await firestoreDb.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref); if (!snap.exists) return false;
      const current = snap.data() as Delivery;
      if (current.state !== "PENDING" || current.parentOrderId !== orderId || current.printedMessage !== child.printedMessage) return false;
      tx.update(ref, { state: "DISPATCHING", stateVersion: current.stateVersion + 1, attempts: current.attempts + 1, dispatchAttemptId: attemptId, dispatchFence: (current.dispatchFence || 0) + 1, dispatchStartedAt: Date.now(), updatedAt: Date.now() });
      return true;
    });
    if (!claimed) continue;
    const params = {
      orderId: `${orderId}-${child.recipientId}`, imageUrl: order.multiSend.shared.frontImageUrl,
      ...(order.uploadMaster ? { uploadMaster: order.uploadMaster } : {}),
      handwrittenMessage: child.printedMessage, fontId: order.multiSend.shared.fontStyleId,
      recipient: child.correctedAddress || child.address, returnAddress: order.multiSend.shared.returnAddress,
    };
    const submit = options.submit || submitPreparedHandwryttenOrder;
    let result;
    try { result = await submit(params, order.multiSend.preparedCardId); }
    catch (error) { result = { success: false, error: `Supplier outcome uncertain: ${error instanceof Error ? error.message : "submission threw"}` }; }
    if (result.success && result.order_id) {
      const updated = await firestoreDb.runTransaction(async (tx: any) => {
        const snap = await tx.get(ref); if (!snap.exists) return false; const current = snap.data() as Delivery;
        if (current.state !== "DISPATCHING" || current.dispatchAttemptId !== attemptId || current.stateVersion !== child.stateVersion + 1) return false;
        tx.update(ref, { state: "ACCEPTED", outcome: "accepted", supplierOrderId: result.order_id, stateVersion: current.stateVersion + 1, updatedAt: Date.now(), error: undefined }); return true;
      });
      if (updated) accepted++;
    } else {
      const isUncertain = (result as any).details?.providerRejected !== true;
      const systemic = (result as any).details?.providerSystemicFailure === true;
      const updated = await firestoreDb.runTransaction(async (tx: any) => {
        const snap = await tx.get(ref); if (!snap.exists) return false; const current = snap.data() as Delivery;
        if (current.state !== "DISPATCHING" || current.dispatchAttemptId !== attemptId || current.stateVersion !== child.stateVersion + 1) return false;
        tx.update(ref, { state: isUncertain ? "DISPATCH_UNCERTAIN" : "REJECTED", outcome: isUncertain ? "unknown" : "rejected", error: result.error || "Supplier rejected recipient", stateVersion: current.stateVersion + 1, updatedAt: Date.now() }); return true;
      });
      if (updated) { if (isUncertain) uncertain++; else rejected++; }
      if (systemic) {
        await updateOperationalControl({ name: "fulfillment", paused: true, reason: `Supplier systemic failure for batch ${orderId}; reconcile provider access before resuming.`, actor: "multi-send-worker" });
        break;
      }
    }
  }
  const after = await listMultiSendDeliveries(orderId);
  const pending = after.filter((entry) => entry.state === "PENDING").length;
  const hasUncertain = after.some((entry) => entry.state === "DISPATCH_UNCERTAIN" || entry.state === "DISPATCHING");
  const allDone = after.length === order.multiSend.recipients.length && after.every((entry) => ["ACCEPTED", "REJECTED", "MAILED", "REFUNDED"].includes(entry.state));
  await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: hasUncertain ? "MULTI_SEND_CHECKING" : allDone ? "MULTI_SEND_COMPLETE" : "MULTI_SEND_PARTIAL", fulfillmentError: hasUncertain ? "At least one recipient outcome is uncertain; reconcile that child before any resend." : undefined } as any);
  return { accepted, rejected, uncertain, pending };
}

/** Global server-side fence also protects direct service callers outside the cron route. */
export async function dispatchMultiSendChildren(orderId: string, limit = 5, options: { submit?: typeof submitPreparedHandwryttenOrder } = {}) {
  const lock = firestoreDb.collection("system_config").doc("multi_send_dispatch_lock");
  const workerId = `dispatch_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const acquired = await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(lock); const current = snap.data() as any;
    if (current?.leaseExpiresAt > Date.now()) return false;
    tx.set(lock, { workerId, leaseExpiresAt: Date.now() + 180_000, updatedAt: Date.now() }); return true;
  });
  if (!acquired) return { accepted: 0, rejected: 0, uncertain: 0, pending: 0 };
  try { return await dispatchMultiSendChildrenLocked(orderId, Math.max(1, Math.min(limit, 5)), { ...options, lock, workerId }); }
  finally {
    await firestoreDb.runTransaction(async (tx: any) => {
      const snap = await tx.get(lock); if (snap.exists && (snap.data() as any)?.workerId === workerId) tx.delete(lock);
    });
  }
}

export async function correctRejectedMultiSendDelivery(input: { orderId: string; recipientId: string; expectedStateVersion: number; address: MultiSendRecipient["address"]; reason: string; idempotencyKey: string; actor: string; confirmBillableDispatch: boolean }) {
  if (!input.actor || !input.reason.trim() || !input.confirmBillableDispatch || !/^[\w:-]{16,128}$/.test(input.idempotencyKey)) throw new Error("Actor, reason, idempotency key, and explicit billable dispatch consent are required.");
  const parent = await getOrderById(input.orderId);
  if (!isMultiSendOrder(parent) || !parent.stripePaymentId || parent.status === "PENDING_PAYMENT") throw new Error("A paid multi-send parent is required.");
  const original = parent.multiSend.recipients.find((row) => row.id === input.recipientId);
  if (!original || original.address.country !== input.address.country) throw new Error("A corrected address must preserve the purchased destination country.");
  const address = input.address;
  if (![address.firstName, address.street1, address.city, address.state, address.zip].every((value) => typeof value === "string" && value.trim())) throw new Error("The corrected recipient address is incomplete.");
  const ref = deliveries(input.orderId).doc(input.recipientId);
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new Error("Delivery not found.");
    const child = snap.data() as Delivery & { correctionIdempotencyKey?: string };
    if (child.correctionIdempotencyKey === input.idempotencyKey && child.correctedAddress) return { duplicate: true, state: child.state, stateVersion: child.stateVersion };
    if (child.state !== "REJECTED" || child.stateVersion !== input.expectedStateVersion) throw new Error("Only a current, known-rejected child can receive an address correction.");
    tx.update(ref, { correctedAddress: address, correctionIdempotencyKey: input.idempotencyKey, correctionReason: input.reason.trim(), correctedBy: input.actor, state: "PENDING", stateVersion: child.stateVersion + 1, outcome: "rejected", updatedAt: Date.now() });
    const parentRef = getOrdersCollection().doc(input.orderId);
    tx.update(parentRef, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_PARTIAL", fulfillmentError: "A corrected rejected delivery is queued for billable resubmission.", updatedAt: Date.now() });
    return { duplicate: false, state: "PENDING", stateVersion: child.stateVersion + 1 };
  });
}

/** Explicitly re-enter an operator-held parent after resolving its underlying hold. */
export async function resumeHeldMultiSend(input: { orderId: string; reason: string; idempotencyKey: string; actor: string }) {
  if (!input.actor || !input.reason.trim() || input.reason.trim().length > 500 || !/^[\w:-]{16,128}$/.test(input.idempotencyKey)) throw new Error("Actor, bounded reason, and an idempotency key are required.");
  if (process.env.STAGING_REVIEW_ONLY === "true" || process.env.HANDWRYTTEN_TEST_MODE === "true" || !process.env.HANDWRYTTEN_API_KEY) throw new Error("Live supplier environment safeguards are not satisfied.");
  if (await isOperationalControlPaused("fulfillment")) throw new Error("Fulfillment is still paused; resolve the operational control before resuming this parent.");
  const parentRef = getOrdersCollection().doc(input.orderId);
  const parent = await getOrderById(input.orderId);
  if (!isMultiSendOrder(parent) || !parent.stripePaymentId || parent.paymentMode !== "live" || parent.isTest || parent.isFounderTest || parent.isComp || parent.status === "PENDING_PAYMENT") throw new Error("A verified live paid multi-send parent is required.");
  const capture = await firestoreDb.collection("financial_facts").doc(`fact_cap_${parent.stripePaymentId}`).get();
  const fact = capture.data() as any; const total = parent.multiSend.quote.totalCents;
  if (!capture.exists || fact?.provider !== "stripe" || fact?.providerObjectId !== parent.stripePaymentId || fact?.orderId !== input.orderId || fact?.livemode !== true || fact?.currency !== "usd" || fact?.amountCents !== total || total !== (parent.finalAmountInCents ?? parent.amountInCents) || total !== parent.multiSend.recipients.reduce((sum, row) => sum + row.amountInCents, 0)) throw new Error("Verified live capture and frozen child allocations must match before resume.");
  if (parent.multiSend.preparationState === "preparing" || parent.multiSend.preparationState === "uncertain") throw new Error("Shared artwork preparation is uncertain; operator must resolve it without automatic recreation.");
  if (!parent.multiSend.preparedCardId && parent.multiSend.preparationState !== "pending") throw new Error("Shared artwork is not in a safely resumable preparation state.");
  const children = await listMultiSendDeliveries(input.orderId);
  if (parent.multiSend.preparedCardId && (!parent.multiSend.manifestComplete || children.length !== parent.multiSend.recipients.length)) throw new Error("A complete frozen delivery manifest is required before resume.");
  if (children.some((row) => !["PENDING", "DISPATCHING", "DISPATCH_UNCERTAIN", "ACCEPTED", "REJECTED", "MAILED", "REFUND_PENDING", "REFUNDED"].includes(row.state))) throw new Error("Delivery manifest contains an unsupported state; manual review is required.");
  const recoveryRef = parentRef.collection("admin_actions").doc(`resume_${input.idempotencyKey}`);
  return firestoreDb.runTransaction(async (tx: any) => {
    const [parentSnap, recoverySnap] = await Promise.all([tx.get(parentRef), tx.get(recoveryRef)]);
    if (!parentSnap.exists) throw new Error("Multi-send parent no longer exists.");
    const current = parentSnap.data() as Order;
    if (!isMultiSendOrder(current)) throw new Error("Order is no longer a multi-send parent.");
    if (recoverySnap.exists) return { duplicate: true, state: current.fulfillmentStatus, pending: children.filter((row) => row.state === "PENDING").length };
    if (current.fulfillmentStatus !== "MULTI_SEND_HELD") throw new Error("Only a currently held multi-send parent can be resumed.");
    if (current.multiSend.preparationState === "preparing" || current.multiSend.preparationState === "uncertain") throw new Error("Shared artwork preparation became uncertain; automatic recreation is prohibited.");
    tx.create(recoveryRef, { action: "resume_multi_send", actor: input.actor, reason: input.reason.trim(), idempotencyKey: input.idempotencyKey, createdAt: Date.now() });
    const pending = children.filter((row) => row.state === "PENDING").length;
    const uncertain = children.some((row) => row.state === "DISPATCH_UNCERTAIN" || row.state === "DISPATCHING");
    tx.update(parentRef, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: uncertain ? "MULTI_SEND_CHECKING" : parent.multiSend.preparedCardId ? (pending ? "MULTI_SEND_READY" : "MULTI_SEND_PARTIAL") : "MULTI_SEND_QUEUED", fulfillmentError: undefined, multiSendLastResumedAt: Date.now(), updatedAt: Date.now() });
    return { duplicate: false, state: uncertain ? "MULTI_SEND_CHECKING" : parent.multiSend.preparedCardId ? (pending ? "MULTI_SEND_READY" : "MULTI_SEND_PARTIAL") : "MULTI_SEND_QUEUED", pending };
  });
}

/** Batch parent is deliberately excluded from every singular retry/correction route. */
export async function rejectLegacyMultiSendAction(orderId: string): Promise<boolean> {
  return isMultiSendOrder(await getOrderById(orderId));
}
