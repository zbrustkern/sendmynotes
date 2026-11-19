import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { firestoreDb, getOrderById } from "./firebase-admin";
import { getOfferReservationsCollection, offerIntentMatches, ownsOfferLease, releaseOfferReservation, type OfferHold, type OfferIntentEvidence } from "./offer-engine";
import { markOfferCaptureReconciliation, settlePaidOrderPromotion } from "./offer-settlement";
import { createCardPaymentIntent, getStripeClient } from "./stripe";
import { resolvePaymentMode } from "./payment-mode";
import { processPaidOrder, verifyPaymentIntentForOrder } from "./order-processor";
import { deriveCommercialKind, recordPaymentCaptureFact } from "./financial-ledger";
import { logIncident } from "./incident-logger";

const FIVE_MINUTES = 5 * 60 * 1_000;
const RETRY_MAX = 12 * FIVE_MINUTES;
const MAX_REPLAY_AGE = 23 * 60 * 60 * 1_000;
const NEVER = Number.MAX_SAFE_INTEGER;
type Lease = { token: string; revision: number };
type ReconciliationDependencies = {
  clock?: () => number;
  mode?: ReturnType<typeof resolvePaymentMode>;
  create?: typeof createCardPaymentIntent;
  intents?: Pick<Stripe["paymentIntents"], "retrieve" | "cancel">;
  process?: typeof processPaidOrder;
};

async function claimHold(ref: FirebaseFirestore.DocumentReference, now: number) {
  return firestoreDb.runTransaction(async (tx) => {
    const hold = (await tx.get(ref)).data() as OfferHold | undefined;
    if (!hold || !["active", "consumed"].includes(hold.status) || (hold.nextActionAt ?? NEVER) > now || (hold.lease?.expiresAt ?? 0) > now) return null;
    const token = randomUUID();
    const revision = (hold.revision ?? 0) + 1;
    tx.update(ref, { lease: { token, expiresAt: now + FIVE_MINUTES }, revision, nextActionAt: now + FIVE_MINUTES });
    return { hold, lease: { token, revision } };
  });
}

async function completeFollowUp(ref: FirebaseFirestore.DocumentReference, lease: Lease, now: number) {
  return firestoreDb.runTransaction(async (tx) => {
    const hold = (await tx.get(ref)).data() as OfferHold | undefined;
    if (!hold || hold.status !== "consumed" || !ownsOfferLease(hold, lease, now)) return false;
    tx.update(ref, { nextActionAt: NEVER, lease: null, reconciliationFinishedAt: now });
    return true;
  });
}

async function deferHold(ref: FirebaseFirestore.DocumentReference, lease: Lease, now: number, reason: string) {
  const report = await firestoreDb.runTransaction(async (tx) => {
    const hold = (await tx.get(ref)).data() as OfferHold | undefined;
    if (!hold || !ownsOfferLease(hold, lease, now)) return null;
    const attempts = (hold.reconciliationAttempts ?? 0) + 1;
    const nextActionAt = now + Math.min(RETRY_MAX, FIVE_MINUTES * 2 ** Math.min(attempts - 1, 8));
    const exposure = { orderId: hold.orderId, ageMs: now - hold.reservedAt, discountCents: hold.discountCents ?? 0, expectedTotalCents: hold.expectedTotalCents ?? 0, attempts };
    const reportToOperator = attempts === 3;
    tx.update(ref, { reconciliationAttempts: attempts, reconciliationReason: reason, nextActionAt, lease: null, ...(attempts >= 3 ? { operatorReview: exposure } : {}) });
    return reportToOperator ? exposure : null;
  });
  if (report) await logIncident({
    type: "STRIPE", severity: "error", summary: "Promotion payment needs operator review",
    technicalDetails: reason, metadata: report,
  });
}

function mockIntent(hold: OfferHold, paymentIntentId: string) {
  return {
    id: paymentIntentId, status: "canceled", amount: hold.expectedTotalCents, currency: "usd", livemode: false,
    metadata: { orderId: hold.orderId, quoteId: hold.quoteId ?? "", checkoutRevision: hold.checkoutRevision ?? "" },
  };
}

export async function reconcileOfferReservations(deps: ReconciliationDependencies = {}) {
  const clock = deps.clock ?? Date.now;
  const mode = deps.mode ?? resolvePaymentMode();
  const create = deps.create ?? createCardPaymentIntent;
  const intents = deps.intents ?? getStripeClient().paymentIntents;
  const process = deps.process ?? processPaidOrder;
  const now = clock();
  const due = await getOfferReservationsCollection()
    .where("status", "in", ["active", "consumed"])
    .where("nextActionAt", "<=", now).orderBy("nextActionAt", "asc").limit(50).get();
  const result = { due: due.size, released: 0, settled: 0, fulfilled: 0, uncertain: 0, skipped: 0 };
  for (const ref of due.docs.map((doc) => doc.ref)) {
    const claimed = await claimHold(ref, clock());
    if (!claimed) { result.skipped++; continue; }
    const { hold, lease } = claimed;
    try {
      const order = await getOrderById(hold.orderId);
      const bound = hold.paymentIntentId ?? order?.stripePaymentId;
      if (hold.paymentMode && hold.paymentMode !== mode) throw new Error("Stored payment mode is unavailable in this environment.");
      if (hold.status === "consumed") {
        if (!order || !bound) throw new Error("Settled hold is missing its order or provider binding.");
        const completion = await process(hold.orderId, bound, order.customerEmail, { paymentMode: mode });
        if (!completion.success) throw new Error("Settled payment still requires order completion.");
        if (await completeFollowUp(ref, lease, clock())) result.fulfilled++;
        continue;
      }

      if (hold.expectedTotalCents === 0 && !bound) {
        if (!await releaseOfferReservation(hold.orderId, "expired", { lease, nowMs: clock() })) throw new Error("Promotion release could not be verified.");
        result.released++;
        continue;
      }
      let providerId = bound;
      if (!providerId && hold.creationRequest?.idempotencyKey && clock() - hold.reservedAt < MAX_REPLAY_AGE) {
        providerId = (await create(hold.creationRequest)).paymentIntentId;
      }
      if (!providerId) throw new Error("Missing provider binding and a safe idempotent replay window.");
      let intent: OfferIntentEvidence = mode === "local_mock"
        ? mockIntent(hold, providerId)
        : await intents.retrieve(providerId);
      const holdWithBinding = { ...hold, paymentIntentId: bound, paymentMode: hold.paymentMode ?? mode };
      if (!offerIntentMatches(holdWithBinding, intent, { canBind: true })) throw new Error("Provider payment does not match the frozen offer.");
      if (intent.status !== "succeeded" && intent.status !== "canceled") {
        try { intent = await intents.cancel(providerId); }
        catch { intent = await intents.retrieve(providerId); }
      }
      if (!offerIntentMatches(holdWithBinding, intent, { canBind: true })) throw new Error("Provider payment does not match the frozen offer.");
      if (intent.status === "canceled") {
        if (!await releaseOfferReservation(hold.orderId, "expired", { lease, paymentIntent: intent, nowMs: clock() })) throw new Error("Promotion release could not be verified.");
        result.released++;
        continue;
      }
      if (intent.status !== "succeeded") throw new Error("Provider payment outcome remains uncertain.");
      const verified = order ? verifyPaymentIntentForOrder({ paymentIntent: intent, orderId: hold.orderId, order }) : null;
      await recordPaymentCaptureFact({
        paymentIntentId: providerId, orderId: verified?.valid ? hold.orderId : undefined,
        amountCents: intent.amount_received ?? 0, currency: intent.currency,
        livemode: Boolean(intent.livemode), operationId: order?.operationId ?? intent.metadata?.operationId,
        origin: order?.origin,
        commercialKind: verified?.valid
          ? deriveCommercialKind({ amountCents: intent.amount_received ?? 0, livemode: Boolean(intent.livemode), isComp: order?.isComp, isFounderTest: order?.isFounderTest, origin: order?.origin, paymentMethod: order?.paymentMethod, explicitKind: "discounted_paid" })
          : "unresolved_historical",
      });
      if (!order || !verified?.valid) throw new Error("Captured payment requires order binding reconciliation.");
      const redemption = await settlePaidOrderPromotion({ order, intent, paymentMode: mode, hold: holdWithBinding, lease, observedAt: clock() });
      if (redemption.status !== "redeemed") {
        await markOfferCaptureReconciliation(hold.orderId, providerId, "Capture timing or offer terms require reconciliation.");
        throw new Error("Captured payment is late or requires offer reconciliation.");
      }
      result.settled++;
    } catch (error) {
      result.uncertain++;
      const reason = error instanceof Error && [
        "Stored payment mode is unavailable in this environment.",
        "Settled hold is missing its order or provider binding.",
        "Settled payment still requires order completion.",
        "Missing provider binding and a safe idempotent replay window.",
        "Provider payment does not match the frozen offer.",
        "Provider payment outcome remains uncertain.",
        "Captured payment requires order binding reconciliation.",
        "Captured payment is late or requires offer reconciliation.",
        "Promotion release could not be verified.",
      ].includes(error.message) ? error.message : "Provider or storage could not be reconciled.";
      await deferHold(ref, lease, clock(), reason);
    }
  }
  return result;
}
