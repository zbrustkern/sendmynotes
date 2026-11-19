import type Stripe from "stripe";
import { firestoreDb } from "../firebase-admin";
import {
  recordPaymentRefundFact,
  resolvePaymentIntentReference,
} from "../financial-ledger";
import { getStripeClient } from "../stripe";
import { digest, type WeddingQuoteLine } from "./finance";
import {
  heldPaymentRuntime,
  safeId,
  weddingBatchRef,
  WeddingCheckoutError,
} from "./checkout";

type RefundJob = {
  id: string;
  batchId: string;
  householdId: string;
  paymentIntentId: string;
  cents: number;
  createdAt: number;
  status: "reserved" | "pending" | "succeeded" | "failed";
  providerId: string | null;
  ledgerPending?: boolean;
  actor: string;
};
const jobRef = (id: string) =>
  firestoreDb.collection("weddingRefunds").doc(safeId(id));
function requireRefundEnvironment() {
  if (!heldPaymentRuntime())
    throw new WeddingCheckoutError(
      "Child refunds require the staging test processor.",
      503,
    );
}
export async function reserveWeddingRefund(
  batchId: string,
  householdId: string,
  key: string,
  actor: string,
) {
  requireRefundEnvironment();
  safeId(key);
  safeId(householdId);
  const batch = weddingBatchRef(batchId),
    card = batch.collection("cards").doc(householdId);
  const id = "wr_" + digest([batchId, householdId, key]);
  return firestoreDb.runTransaction(async (tx) => {
    const [parentSnap, childSnap, requestSnap] = await Promise.all([
      tx.get(batch),
      tx.get(card),
      tx.get(jobRef(id)),
    ]);
    if (requestSnap.exists) return requestSnap.data() as RefundJob;
    const b = parentSnap.data(),
      child = childSnap.data(),
      line = child?.line as WeddingQuoteLine | undefined;
    if (!b || b.status !== "held" || !b.paymentIntentId || !line)
      throw new WeddingCheckoutError("A captured wedding card is required.");
    if (child?.refundRequestId) {
      const prior = (await tx.get(jobRef(child.refundRequestId))).data() as
        | RefundJob
        | undefined;
      if (!prior || prior.status !== "failed")
        throw new WeddingCheckoutError(
          "This card already has a refund request.",
        );
    }
    const cents = line.totalCents;
    if (
      !Number.isSafeInteger(cents) ||
      cents <= 0 ||
      b.refundedCents + b.refundReservedCents + cents > b.capturedCents
    )
      throw new WeddingCheckoutError("Refund exceeds the captured balance.");
    const now = Date.now();
    const job: RefundJob = {
      id,
      batchId,
      householdId,
      actor,
      status: "reserved",
      cents,
      paymentIntentId: b.paymentIntentId,
      createdAt: now,
      providerId: null,
    };
    tx.create(jobRef(id), { ...job, dueAt: now });
    tx.update(batch, { refundReservedCents: b.refundReservedCents + cents });
    tx.update(card, { refundRequestId: id, refundStatus: "reserved" });
    return job;
  });
}
export async function applyWeddingRefund(refund: Stripe.Refund) {
  requireRefundEnvironment();
  const id = safeId(refund.metadata?.weddingRefundId);
  const intentId = resolvePaymentIntentReference(refund.payment_intent);
  const job = await firestoreDb.runTransaction(async (tx) => {
    const j = (await tx.get(jobRef(id))).data() as RefundJob | undefined;
    if (
      !j ||
      refund.amount !== j.cents ||
      refund.currency !== "usd" ||
      intentId !== j.paymentIntentId ||
      refund.metadata?.weddingBatchId !== j.batchId ||
      (j.providerId && j.providerId !== refund.id)
    )
      throw new WeddingCheckoutError(
        "Refund evidence requires reconciliation.",
      );
    if (j.status === "succeeded" || j.status === "failed") return j;
    const batch = weddingBatchRef(j.batchId),
      card = batch.collection("cards").doc(j.householdId);
    const [parentSnap, cardSnap] = await Promise.all([
      tx.get(batch),
      tx.get(card),
    ]);
    const b = parentSnap.data(),
      c = cardSnap.data();
    if (
      !b ||
      !c ||
      c.refundRequestId !== id ||
      c.line.totalCents !== j.cents ||
      b.refundReservedCents < j.cents
    )
      throw new WeddingCheckoutError("Refund allocation needs reconciliation.");
    const succeeded = refund.status === "succeeded",
      failed = refund.status === "failed" || refund.status === "canceled";
    const status = succeeded ? "succeeded" : failed ? "failed" : "pending";
    if (succeeded || failed) {
      tx.update(batch, {
        refundedCents: b.refundedCents + (succeeded ? j.cents : 0),
        refundReservedCents: b.refundReservedCents - j.cents,
      });
      if (succeeded) {
        tx.update(
          firestoreDb
            .collection("weddingProjects")
            .doc(b.projectId)
            .collection("households")
            .doc(j.householdId),
          { refundStatus: "refunded", refundedCents: j.cents },
        );
        // Frozen child components contain exactly the tax basis for a future reversal.
        tx.set(jobRef(id).collection("allocations").doc("full"), {
          originalLine: c.line,
          refundedCents: j.cents,
          providerRefundId: refund.id,
        });
      }
    }
    tx.update(card, { refundStatus: status });
    tx.update(jobRef(id), {
      providerId: refund.id,
      status,
      ledgerPending: succeeded,
      dueAt: failed ? null : succeeded ? Date.now() : Date.now() + 60000,
    });
    return { ...j, status, providerId: refund.id } as RefundJob;
  });
  if (job.status === "succeeded") {
    await recordPaymentRefundFact({
      refundId: refund.id,
      paymentIntentId: job.paymentIntentId,
      chargeId: resolvePaymentIntentReference(refund.charge),
      amountCents: refund.amount,
      currency: refund.currency,
      providerRefundStatus: "succeeded",
      livemode: false,
      commercialKind: "founder_test",
    });
    await jobRef(id).update({ ledgerPending: false, dueAt: null });
  }
  return {
    requestId: id,
    status: job.status,
    amountCents: job.cents,
    providerRefundId: job.providerId,
  };
}
async function sendOrCheck(job: RefundJob) {
  requireRefundEnvironment();
  const sdk = getStripeClient();
  if (
    (job.status === "succeeded" && !job.ledgerPending) ||
    job.status === "failed"
  )
    return {
      requestId: job.id,
      status: job.status,
      amountCents: job.cents,
      providerRefundId: job.providerId,
    };
  if (!job.providerId && Date.now() - job.createdAt > 23 * 3600000)
    throw new WeddingCheckoutError(
      "Review the processor outcome before resubmitting this refund.",
    );
  const refund = job.providerId
    ? await sdk.refunds.retrieve(job.providerId)
    : await sdk.refunds.create(
        {
          payment_intent: job.paymentIntentId,
          amount: job.cents,
          metadata: { weddingRefundId: job.id, weddingBatchId: job.batchId },
        },
        { idempotencyKey: job.id },
      );
  return applyWeddingRefund(refund);
}
export async function refundWeddingCard(
  batchId: string,
  householdId: string,
  key: string,
  actor: string,
) {
  return sendOrCheck(
    await reserveWeddingRefund(batchId, householdId, key, actor),
  );
}
export async function reconcilePendingWeddingRefunds() {
  if (!heldPaymentRuntime()) return { visited: 0, deferred: 0 };
  const now = Date.now();
  const due = await firestoreDb
    .collection("weddingRefunds")
    .where("dueAt", ">", 0)
    .where("dueAt", "<=", now)
    .orderBy("dueAt", "asc")
    .limit(4)
    .get();
  let deferred = 0;
  await Promise.all(
    due.docs.map(async (d) => {
      try {
        await sendOrCheck(d.data() as RefundJob);
      } catch {
        deferred++;
        await firestoreDb.runTransaction(async (tx) => {
          const snap = await tx.get(d.ref),
            job = snap.data();
          if (
            job &&
            (job.status === "reserved" ||
              job.status === "pending" ||
              job.ledgerPending)
          )
            tx.update(d.ref, {
              dueAt: Date.now() + 300000,
              lastFailure: "reconciliation_required",
            });
        });
      }
    }),
  );
  return { visited: due.size, deferred };
}
