/**
 * lib/reconciliation.ts
 *
 * Read-only reconciliation and exception detection for SendMyNotes (SPRINT-0002-T04).
 * Compares financial facts, persisted orders, provider snapshots, and telemetry
 * projections to detect discrepancies without mutating production data or leaking PII.
 *
 * Reference: docs/sprints/SPRINT-0002.md
 */

import { firestoreDb, getOrdersCollection } from "./firebase-admin";
import { listAllFinancialFacts, FINANCIAL_FACTS_COLLECTION } from "./financial-ledger";
import { FinancialFactRecord, ReconciliationExceptionRecord } from "./contracts/admin-overhaul";
import { Order } from "./types";

export interface ProviderPaymentSnapshot {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  status: string;
  orderId?: string;
  createdAt?: number;
}

export interface ReconciliationOptions {
  cursor?: string;
  limit?: number;
  providerSnapshots?: ProviderPaymentSnapshot[];
  checkTelemetryDrift?: boolean;
}

export interface ReconciliationDryRunResult {
  exceptions: ReconciliationExceptionRecord[];
  summary: {
    totalCheckedOrders: number;
    totalCheckedFacts: number;
    exceptionCount: number;
    hasMore: boolean;
    nextCursor?: string;
  };
  asOf: number;
}

export interface ScopedCorrectionOptions {
  operatorId: string;
  reason: string;
  orderIds: string[];
}

export interface ScopedCorrectionResult {
  success: boolean;
  operatorId: string;
  reason: string;
  modifiedOrderIds: string[];
  auditTimestamp: number;
}

/**
 * Runs a strictly read-only dry-run reconciliation.
 * Never mutates any database records.
 * Strips all PII (emails, names, recipient addresses, handwritten note content)
 * from reported exception records.
 */
export async function runReconciliationDryRun(
  options?: ReconciliationOptions
): Promise<ReconciliationDryRunResult> {
  const asOf = Date.now();
  const limit = options?.limit || 50;
  const exceptions: ReconciliationExceptionRecord[] = [];

  // 1. Fetch financial facts
  const allFacts = await listAllFinancialFacts();
  const factsByOrder = new Map<string, FinancialFactRecord[]>();
  const captureFactsByPi = new Map<string, FinancialFactRecord>();

  for (const fact of allFacts) {
    if (fact.orderId) {
      const existing = factsByOrder.get(fact.orderId) || [];
      existing.push(fact);
      factsByOrder.set(fact.orderId, existing);
    }
    if (fact.factType === "capture") {
      captureFactsByPi.set(fact.providerObjectId, fact);
    }
  }

  // 2. Fetch orders
  const ordersSnap = await getOrdersCollection().get();
  const allOrders: Order[] = [];
  ordersSnap.forEach((doc) => allOrders.push(doc.data() as Order));

  // Sort orders deterministically by createdAt/id for cursor pagination
  allOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  let startIndex = 0;
  if (options?.cursor) {
    const idx = allOrders.findIndex((o) => o.id === options.cursor);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }

  const pagedOrders = allOrders.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < allOrders.length;
  const nextCursor = hasMore ? pagedOrders[pagedOrders.length - 1]?.id : undefined;

  const checkedOrderIds = new Set<string>();

  // 3. Inspect orders for financial parity and exceptions
  for (const order of pagedOrders) {
    checkedOrderIds.add(order.id);
    const orderFacts = factsByOrder.get(order.id) || [];
    const captureFact = orderFacts.find((f) => f.factType === "capture");

    const isLive = order.paymentMode === "live" || (order.isTest === false && !order.isComp);
    const isPaidStatus =
      order.status === "PROCESSING_HANDWRYTTEN" ||
      order.status === "MAILED" ||
      order.status === "AWAITING_RECIPIENT_ADDRESS" ||
      order.status === "PAYMENT_RECEIVED";

    // Exception A: Paid order missing financial capture fact
    if (isLive && isPaidStatus && !captureFact && (order.amountInCents || 900) > 0) {
      exceptions.push({
        exceptionId: `exc_missing_fact_${order.id}`,
        category: "paid_order_missing_fact" as any,
        orderId: order.id,
        providerPaymentId: order.stripePaymentId,
        severity: "critical",
        detectedAt: asOf,
        ageMs: asOf - (order.createdAt || asOf),
        details: `Order in paid state (${order.status}) is missing a verified financial capture fact in the ledger.`,
        resolved: false,
      });
    }

    // Exception B: Amount or currency mismatch
    if (captureFact) {
      const orderAmount = order.finalAmountInCents ?? order.amountInCents ?? 900;
      if (orderAmount !== captureFact.amountCents) {
        exceptions.push({
          exceptionId: `exc_amount_mismatch_${order.id}`,
          category: "amount_currency_mismatch" as any,
          orderId: order.id,
          providerPaymentId: captureFact.providerObjectId,
          severity: "critical",
          detectedAt: asOf,
          ageMs: asOf - (order.createdAt || asOf),
          details: `Order subtotal (${orderAmount} cents) mismatches recorded capture fact (${captureFact.amountCents} cents).`,
          resolved: false,
        });
      }

      const orderCurrency = (order as any).currency;
      if (orderCurrency && captureFact.currency && String(orderCurrency).toLowerCase() !== captureFact.currency.toLowerCase()) {
        exceptions.push({
          exceptionId: `exc_currency_mismatch_${order.id}`,
          category: "amount_currency_mismatch" as any,
          orderId: order.id,
          providerPaymentId: captureFact.providerObjectId,
          severity: "critical",
          detectedAt: asOf,
          ageMs: asOf - (order.createdAt || asOf),
          details: `Order currency (${orderCurrency}) mismatches recorded capture fact (${captureFact.currency}).`,
          resolved: false,
        });
      }
    }

    // Exception C: Paid fulfillment failed (captured payment with failed supplier fulfillment)
    if (captureFact && captureFact.amountCents > 0 && order.status === "FAILED") {
      exceptions.push({
        exceptionId: `exc_paid_failed_${order.id}`,
        category: "paid_fulfillment_failed",
        orderId: order.id,
        providerPaymentId: captureFact.providerObjectId,
        severity: "critical",
        detectedAt: asOf,
        ageMs: asOf - (order.createdAt || asOf),
        details: `Customer payment of ${captureFact.amountCents} cents is captured, but supplier fulfillment status is FAILED (${order.fulfillmentError || "unspecified error"}).`,
        resolved: false,
      });
    }

    // Exception D: Historical unresolved order
    // Order created with live payment mode or live payment facts, but unverified provenance
    if (
      captureFact?.commercialKind === "unresolved_historical" ||
      ((order as any).reconciliationStatus === "pending_founder_verification" && !order.isFounderTest)
    ) {
      exceptions.push({
        exceptionId: `exc_hist_unresolved_${order.id}`,
        category: "historical_unresolved" as any,
        orderId: order.id,
        providerPaymentId: order.stripePaymentId,
        severity: "warning",
        detectedAt: asOf,
        ageMs: asOf - (order.createdAt || asOf),
        details: "Historical order from baseline period pending explicit founder reconciliation.",
        resolved: false,
      });
    }

    // Exception E: Telemetry projection drift
    if (options?.checkTelemetryDrift && captureFact) {
      // Check if telemetry purchase_verified exists for this order
      const telSnap = await firestoreDb
        .collection("server_telemetry_events")
        .where("orderId", "==", order.id)
        .where("eventName", "==", "purchase_verified")
        .limit(1)
        .get();

      if (telSnap.empty) {
        exceptions.push({
          exceptionId: `exc_tel_drift_${order.id}`,
          category: "telemetry_projection_drift" as any,
          orderId: order.id,
          providerPaymentId: captureFact.providerObjectId,
          severity: "info",
          detectedAt: asOf,
          ageMs: asOf - (order.createdAt || asOf),
          details: "Financial capture exists, but purchase_verified telemetry event is missing in telemetry projections.",
          resolved: false,
        });
      }
    }
  }

  // 4. Check for unmatched provider captures and historical unresolved facts
  for (const fact of allFacts) {
    if (fact.factType === "capture") {
      if (fact.commercialKind === "unresolved_historical") {
        const excId = `exc_hist_unresolved_${fact.orderId || fact.factId}`;
        if (!exceptions.some((e) => e.exceptionId === excId)) {
          exceptions.push({
            exceptionId: excId,
            category: "historical_unresolved" as any,
            orderId: fact.orderId || undefined,
            providerPaymentId: fact.providerObjectId,
            severity: "warning",
            detectedAt: asOf,
            ageMs: asOf - fact.occurredAt,
            details: "Historical order from baseline period pending explicit founder reconciliation.",
            resolved: false,
          });
        }
      }

      if (!fact.orderId || fact.orderId.trim().length === 0) {
        exceptions.push({
          exceptionId: `exc_unmatched_cap_${fact.factId}`,
          category: "unmatched_provider_capture" as any,
          providerPaymentId: fact.providerObjectId,
          severity: "critical",
          detectedAt: asOf,
          ageMs: asOf - fact.occurredAt,
          details: `Stripe capture of ${fact.amountCents} ${fact.currency} (${fact.providerObjectId}) has no linked order ID.`,
          resolved: false,
        });
      } else if (!allOrders.some((o) => o.id === fact.orderId)) {
        exceptions.push({
          exceptionId: `exc_missing_order_doc_${fact.factId}`,
          category: "unmatched_provider_capture" as any,
          orderId: fact.orderId,
          providerPaymentId: fact.providerObjectId,
          severity: "critical",
          detectedAt: asOf,
          ageMs: asOf - fact.occurredAt,
          details: `Capture fact references orderId ${fact.orderId}, but no matching order document exists in database.`,
          resolved: false,
        });
      }
    }
  }

  // 5. Check external provider snapshots if provided
  if (options?.providerSnapshots) {
    for (const snap of options.providerSnapshots) {
      if (snap.status === "succeeded" && !captureFactsByPi.has(snap.paymentIntentId)) {
        exceptions.push({
          exceptionId: `exc_ext_provider_unrecorded_${snap.paymentIntentId}`,
          category: "unmatched_provider_capture" as any,
          orderId: snap.orderId,
          providerPaymentId: snap.paymentIntentId,
          severity: "critical",
          detectedAt: asOf,
          ageMs: asOf - (snap.createdAt || asOf),
          details: `Provider reports successful PaymentIntent ${snap.paymentIntentId} (${snap.amountCents} ${snap.currency}), but no capture fact exists in financial ledger.`,
          resolved: false,
        });
      }
    }
  }

  return {
    exceptions,
    summary: {
      totalCheckedOrders: pagedOrders.length,
      totalCheckedFacts: allFacts.length,
      exceptionCount: exceptions.length,
      hasMore,
      nextCursor,
    },
    asOf,
  };
}

/**
 * Applies scoped, operator-audited corrections.
 * Never deletes records; sets audited metadata and reconciliation provenance.
 */
export async function applyScopedCorrections(
  options: ScopedCorrectionOptions
): Promise<ScopedCorrectionResult> {
  const auditTimestamp = Date.now();
  const modifiedOrderIds: string[] = [];

  for (const orderId of options.orderIds) {
    const docRef = getOrdersCollection().doc(orderId);
    const snap = await docRef.get();
    if (!snap.exists) continue;

    await docRef.set(
      {
        reconciledAt: auditTimestamp,
        reconciledBy: options.operatorId,
        reconciliationReason: options.reason,
      },
      { merge: true }
    );
    modifiedOrderIds.push(orderId);
  }

  return {
    success: true,
    operatorId: options.operatorId,
    reason: options.reason,
    modifiedOrderIds,
    auditTimestamp,
  };
}
