/**
 * lib/financial-ledger.ts
 *
 * Durable financial fact ledger for the SendMyNotes Admin Overhaul (SPRINT-0002).
 * Records capture, refund, and dispute facts independently of fulfillment status.
 * Enforces semantic deduplication, idempotency, and explicit commercial classification.
 *
 * Reference: docs/sprints/SPRINT-0002.md
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import {
  ClassificationProvenance,
  CommercialKind,
  FinancialFactRecord,
  PaymentFactType,
} from "./contracts/admin-overhaul";

export const FINANCIAL_FACTS_COLLECTION = "financial_facts";

export interface RecordCaptureFactInput {
  operationId?: string;
  buildSha?: string;
  orderId?: string;
  paymentIntentId: string;
  amountCents: number;
  currency?: string;
  livemode: boolean;
  providerEventId?: string;
  commercialKind?: CommercialKind;
  classification?: ClassificationProvenance;
  stripeFeeCents?: number | null;
  supplierCostCents?: number | null;
  occurredAt?: number;
  metadata?: Record<string, unknown>;
  reconciledBy?: string;
  reconciliationNotes?: string;
}

export interface RecordRefundFactInput {
  refundId?: string;
  orderId?: string;
  paymentIntentId?: string;
  chargeId?: string;
  amountCents: number;
  currency?: string;
  livemode: boolean;
  providerEventId?: string;
  commercialKind?: CommercialKind;
  classification?: ClassificationProvenance;
  occurredAt?: number;
  reason?: string;
  reconciledBy?: string;
  reconciliationNotes?: string;
}

export interface RecordDisputeFactInput {
  disputeId?: string;
  chargeId?: string;
  orderId?: string;
  paymentIntentId?: string;
  amountCents: number;
  currency?: string;
  livemode: boolean;
  providerEventId?: string;
  commercialKind?: CommercialKind;
  classification?: ClassificationProvenance;
  occurredAt?: number;
  reason?: string;
  reconciledBy?: string;
  reconciliationNotes?: string;
}

export interface FinancialLedgerSummary {
  capturedCents: number;
  refundedCents: number;
  disputedCents: number;
  netCapturedCents: number;
  estimatedProcessorFeeCents: number;
  captureCount: number;
  refundCount: number;
  disputeCount: number;
  unmatchedCaptureCount: number;
  unmatchedCapturedCents: number;
}

/**
 * Derives the appropriate CommercialKind ensuring test/comp/promo facts
 * NEVER become paid_customer.
 */
export function deriveCommercialKind(params: {
  amountCents: number;
  livemode: boolean;
  explicitKind?: CommercialKind;
  classificationRole?: string;
  isComp?: boolean;
  isFounderTest?: boolean;
  paymentMethod?: string;
  paymentMode?: string;
}): CommercialKind {
  // Provider mode and trusted founder/comp provenance always override labels.
  if (!params.livemode || params.paymentMode === "stripe_test" || params.paymentMode === "local_mock") {
    return "founder_test";
  }
  if (params.isFounderTest || params.classificationRole === "founder" || params.explicitKind === "founder_test") {
    return "founder_test";
  }
  if (params.isComp || params.paymentMethod === "STUDIO_COMP" || params.explicitKind === "studio_comp") {
    return "studio_comp";
  }
  // An explicit commercial label cannot turn a zero-dollar capture into paid revenue.
  if (params.amountCents <= 0) {
    return params.explicitKind === "unresolved_historical" ? "unresolved_historical" : "free_promo";
  }
  // Positive payable value with a promotion is a discounted paid order, never a free one.
  if (params.paymentMethod === "PROMO_CODE") return "discounted_paid";
  // `free_promo` is valid only for a genuinely zero-payable fact.
  if (params.explicitKind === "free_promo") return "paid_customer";
  if (params.explicitKind) return params.explicitKind;
  return "paid_customer";
}

/**
 * Atomically records a payment capture fact.
 * Deduplicates by semantic key (`fact_cap_${paymentIntentId}`).
 * If a capture fact for this paymentIntentId already exists, returns { duplicate: true }.
 */
export async function recordPaymentCaptureFact(
  input: RecordCaptureFactInput
): Promise<{ fact: FinancialFactRecord; duplicate: boolean }> {
  const collectionRef = firestoreDb.collection(FINANCIAL_FACTS_COLLECTION);
  const factId = `fact_cap_${input.paymentIntentId}`;
  const docRef = collectionRef.doc(factId);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);

    if (snapshot.exists) {
      const existingFact = snapshot.data() as FinancialFactRecord;
      return { fact: existingFact, duplicate: true };
    }

    // Secondary check: if providerEventId is provided, check if already recorded
    if (input.providerEventId) {
      const querySnap = await collectionRef
        .where("providerEventId", "==", input.providerEventId)
        .limit(1)
        .get();

      if (!querySnap.empty) {
        const existing = querySnap.docs[0].data() as FinancialFactRecord;
        return { fact: existing, duplicate: true };
      }
    }

    const commercialKind = deriveCommercialKind({
      amountCents: input.amountCents,
      livemode: input.livemode,
      explicitKind: input.commercialKind,
      classificationRole: input.classification?.role,
    });

    const now = Date.now();
    const record: FinancialFactRecord = {
      factId,
      factType: "capture",
      occurredAtBasis: input.occurredAt === undefined ? "server_observed" : "provider_reported",
      operationId: input.operationId,
      buildSha: input.buildSha,
      commercialKind,
      orderId: input.orderId || "",
      provider: "stripe",
      providerObjectId: input.paymentIntentId,
      providerEventId: input.providerEventId,
      amountCents: Math.max(0, input.amountCents),
      currency: (input.currency || "usd").toLowerCase(),
      stripeFeeCents: input.stripeFeeCents ?? null,
      supplierCostCents: input.supplierCostCents ?? null,
      netRevenueCents: input.amountCents - (input.stripeFeeCents || 0),
      livemode: Boolean(input.livemode),
      occurredAt: input.occurredAt || now,
      recordedAt: now,
      reconciledBy: input.reconciledBy,
      reconciliationNotes: input.reconciliationNotes,
    };

    transaction.set(docRef, sanitizeFirestoreData(record));
    return { fact: record, duplicate: false };
  });
}

/**
 * Atomically records a payment refund fact.
 * Distinct partial/full refunds for the same payment remain distinct records.
 * Deduplicates by unique refund ID or providerEventId.
 */
export async function recordPaymentRefundFact(
  input: RecordRefundFactInput
): Promise<{ fact: FinancialFactRecord; duplicate: boolean }> {
  const collectionRef = firestoreDb.collection(FINANCIAL_FACTS_COLLECTION);
  const refundKey = input.refundId
    ? input.refundId
    : input.providerEventId
    ? `${input.paymentIntentId || "unmatched"}_${input.providerEventId}`
    : `${input.paymentIntentId || input.chargeId || "unmatched"}_${input.amountCents}_${input.occurredAt || Date.now()}`;
  const factId = `fact_ref_${refundKey}`;
  const docRef = collectionRef.doc(factId);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);

    if (snapshot.exists) {
      const existingFact = snapshot.data() as FinancialFactRecord;
      return { fact: existingFact, duplicate: true };
    }

    // Provider refund IDs are stable even if the PI relation becomes available
    // later. Also recognize records written by the earlier PI-prefixed schema.
    if (input.refundId) {
      const prior = await transaction.get(collectionRef.where("providerObjectId", "==", input.refundId).where("factType", "==", "refund").limit(1));
      if (!prior.empty) return { fact: prior.docs[0].data() as FinancialFactRecord, duplicate: true };
    }

    // Check if capture fact exists to match orderId and commercialKind if missing
    let orderId = input.orderId || "";
    let commercialKind = input.commercialKind;

    if ((!orderId || !commercialKind) && input.paymentIntentId) {
      const capDoc = await transaction.get(collectionRef.doc(`fact_cap_${input.paymentIntentId}`));
      if (capDoc.exists) {
        const capData = capDoc.data() as FinancialFactRecord;
        if (!orderId) orderId = capData.orderId;
        if (!commercialKind) commercialKind = capData.commercialKind;
      }
    }

    commercialKind = deriveCommercialKind({
      amountCents: input.amountCents,
      livemode: input.livemode,
      explicitKind: commercialKind || "unresolved_historical",
      classificationRole: input.classification?.role,
    });

    const now = Date.now();
    const record: FinancialFactRecord & { paymentIntentId?: string; providerRelationshipStatus?: string; relatedChargeId?: string } = {
      factId,
      factType: "refund",
      commercialKind,
      orderId,
      provider: "stripe",
      providerObjectId: input.refundId || input.chargeId || input.paymentIntentId || "unmatched_refund",
      providerRelationshipStatus: input.paymentIntentId ? "linked" : "unmatched",
      relatedChargeId: input.chargeId,
      providerEventId: input.providerEventId,
      amountCents: Math.abs(input.amountCents),
      currency: (input.currency || "usd").toLowerCase(),
      stripeFeeCents: null,
      supplierCostCents: null,
      netRevenueCents: -Math.abs(input.amountCents),
      livemode: Boolean(input.livemode),
      occurredAt: input.occurredAt || now,
      recordedAt: now,
      reconciledBy: input.reconciledBy,
      reconciliationNotes: input.reconciliationNotes || input.reason,
      ...(input.paymentIntentId ? { paymentIntentId: input.paymentIntentId } : {}),
    };

    transaction.set(docRef, sanitizeFirestoreData(record));
    return { fact: record, duplicate: false };
  });
}

/**
 * Atomically records a payment dispute fact.
 */
export async function recordPaymentDisputeFact(
  input: RecordDisputeFactInput
): Promise<{ fact: FinancialFactRecord; duplicate: boolean }> {
  const collectionRef = firestoreDb.collection(FINANCIAL_FACTS_COLLECTION);
  const disputeKey = input.disputeId
    ? input.disputeId
    : input.providerEventId
    ? `${input.paymentIntentId || "unmatched"}_${input.providerEventId}`
    : `${input.paymentIntentId || input.chargeId || "unmatched"}_${input.occurredAt || Date.now()}`;
  const factId = `fact_disp_${disputeKey}`;
  const docRef = collectionRef.doc(factId);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);

    if (snapshot.exists) {
      const existingFact = snapshot.data() as FinancialFactRecord;
      return { fact: existingFact, duplicate: true };
    }

    if (input.disputeId) {
      const prior = await transaction.get(collectionRef.where("providerObjectId", "==", input.disputeId).where("factType", "==", "dispute").limit(1));
      if (!prior.empty) return { fact: prior.docs[0].data() as FinancialFactRecord, duplicate: true };
    }

    let orderId = input.orderId || "";
    let commercialKind = input.commercialKind;

    if ((!orderId || !commercialKind) && input.paymentIntentId) {
      const capDoc = await transaction.get(collectionRef.doc(`fact_cap_${input.paymentIntentId}`));
      if (capDoc.exists) {
        const capData = capDoc.data() as FinancialFactRecord;
        if (!orderId) orderId = capData.orderId;
        if (!commercialKind) commercialKind = capData.commercialKind;
      }
    }

    commercialKind = deriveCommercialKind({
      amountCents: input.amountCents,
      livemode: input.livemode,
      explicitKind: commercialKind || "unresolved_historical",
      classificationRole: input.classification?.role,
    });

    const now = Date.now();
    const record: FinancialFactRecord & { paymentIntentId?: string; providerRelationshipStatus?: string; relatedChargeId?: string } = {
      factId,
      factType: "dispute",
      commercialKind,
      orderId,
      provider: "stripe",
      providerObjectId: input.disputeId || input.chargeId || input.paymentIntentId || "unmatched_dispute",
      providerRelationshipStatus: input.paymentIntentId ? "linked" : "unmatched",
      relatedChargeId: input.chargeId,
      providerEventId: input.providerEventId,
      amountCents: Math.abs(input.amountCents),
      currency: (input.currency || "usd").toLowerCase(),
      stripeFeeCents: null,
      supplierCostCents: null,
      netRevenueCents: -Math.abs(input.amountCents),
      livemode: Boolean(input.livemode),
      occurredAt: input.occurredAt || now,
      recordedAt: now,
      reconciledBy: input.reconciledBy,
      reconciliationNotes: input.reconciliationNotes || input.reason,
      ...(input.paymentIntentId ? { paymentIntentId: input.paymentIntentId } : {}),
    };

    transaction.set(docRef, sanitizeFirestoreData(record));
    return { fact: record, duplicate: false };
  });
}

/**
 * Retrieves all financial facts associated with a specific orderId.
 */
export async function getFinancialFactsByOrder(orderId: string): Promise<FinancialFactRecord[]> {
  if (!orderId) return [];
  const snapshot = await firestoreDb
    .collection(FINANCIAL_FACTS_COLLECTION)
    .where("orderId", "==", orderId)
    .get();

  const facts: FinancialFactRecord[] = [];
  snapshot.forEach((doc) => facts.push(doc.data() as FinancialFactRecord));
  return facts.sort((a, b) => a.occurredAt - b.occurredAt);
}

/**
 * Retrieves all financial facts associated with a specific Stripe PaymentIntent ID.
 */
export async function getFinancialFactsByPaymentIntent(
  paymentIntentId: string
): Promise<FinancialFactRecord[]> {
  if (!paymentIntentId) return [];
  const snapshot = await firestoreDb
    .collection(FINANCIAL_FACTS_COLLECTION)
    .get();

  const facts: FinancialFactRecord[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data() as FinancialFactRecord;
    if (
      data.providerObjectId === paymentIntentId ||
      (data as any).paymentIntentId === paymentIntentId ||
      data.factId.includes(paymentIntentId)
    ) {
      facts.push(data);
    }
  });
  return facts.sort((a, b) => a.occurredAt - b.occurredAt);
}

/**
 * Lists all financial facts across the system.
 */
export async function listAllFinancialFacts(): Promise<FinancialFactRecord[]> {
  const snapshot = await firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).get();
  const facts: FinancialFactRecord[] = [];
  snapshot.forEach((doc) => facts.push(doc.data() as FinancialFactRecord));
  return facts.sort((a, b) => a.occurredAt - b.occurredAt);
}

/**
 * Aggregates financial ledger metrics across all records.
 * Supports filtering by liveCustomerOnly, fromMs, and toMs.
 */
export async function computeFinancialLedgerSummary(options?: {
  liveCustomerOnly?: boolean;
  fromMs?: number;
  toMs?: number;
}): Promise<FinancialLedgerSummary> {
  const facts = await listAllFinancialFacts();

  let capturedCents = 0;
  let refundedCents = 0;
  let disputedCents = 0;
  let estimatedProcessorFeeCents = 0;
  let captureCount = 0;
  let refundCount = 0;
  let disputeCount = 0;
  let unmatchedCaptureCount = 0;
  let unmatchedCapturedCents = 0;

  for (const fact of facts) {
    if (options?.fromMs !== undefined && fact.occurredAt < options.fromMs) continue;
    if (options?.toMs !== undefined && fact.occurredAt > options.toMs) continue;

    if (options?.liveCustomerOnly) {
      if (!fact.livemode) continue;
      if (fact.commercialKind !== "paid_customer" && fact.commercialKind !== "discounted_paid") {
        continue;
      }
    }

    if (fact.factType === "capture") {
      capturedCents += fact.amountCents;
      captureCount++;
      if (fact.stripeFeeCents != null) {
        estimatedProcessorFeeCents += fact.stripeFeeCents;
      } else {
        // Standard Stripe fee estimate: 2.9% + 30 cents if not specifically recorded
        estimatedProcessorFeeCents += Math.round(fact.amountCents * 0.029) + 30;
      }

      if (!fact.orderId || fact.orderId.trim().length === 0) {
        unmatchedCaptureCount++;
        unmatchedCapturedCents += fact.amountCents;
      }
    } else if (fact.factType === "refund") {
      refundedCents += fact.amountCents;
      refundCount++;
    } else if (fact.factType === "dispute") {
      disputedCents += fact.amountCents;
      disputeCount++;
    }
  }

  const netCapturedCents = Math.max(0, capturedCents - refundedCents - disputedCents);

  return {
    capturedCents,
    refundedCents,
    disputedCents,
    netCapturedCents,
    estimatedProcessorFeeCents,
    captureCount,
    refundCount,
    disputeCount,
    unmatchedCaptureCount,
    unmatchedCapturedCents,
  };
}

/** Returns only an actual PaymentIntent relation; charge/dispute IDs stay unmatched. */
export function resolvePaymentIntentReference(value: unknown): string | undefined {
  if (typeof value === "string") return value.startsWith("pi_") ? value : undefined;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" && id.startsWith("pi_") ? id : undefined;
  }
  return undefined;
}
