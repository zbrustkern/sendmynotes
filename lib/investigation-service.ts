/**
 * lib/investigation-service.ts
 *
 * Scoped investigation engine for the SendMyNotes Admin Overhaul (SPRINT-0007).
 * Implements:
 * - Scoped server pagination & search for orders, journeys, and exceptions.
 * - PII masking by default with immutable audit logging on reveal.
 * - Unified chronological evidence timeline combining browser, server, payment, and supplier facts.
 * - 4 independent state pillars (payment, address, fulfillment, communication).
 * - Pre-retry safety gate preventing duplicate physical card billing.
 * - Economics detail with known vs estimated costs and aggregate-detail-export parity.
 *
 * References:
 * - docs/sprints/SPRINT-0007.md (T01, T02, T03, T04, T05)
 * - lib/contracts/admin-overhaul.ts
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { readBoundedCollection, readBoundedQuery, boundedCoverage } from "./bounded-admin-read";
import { AdminGlobalScope, toGlobalReportScope } from "./admin-scope";
import {
  AcquisitionChannel,
  classifyAcquisitionChannel,
  DEFAULT_ADMIN_TIMEZONE,
  EventSourceAuthority,
  EventV2Envelope,
  FinancialFactRecord,
  REPORTING_POLICY_VERSION,
  TrafficRole,
} from "./contracts/admin-overhaul";
import {
  DATED_SPEND_COLLECTION,
  DatedSpendRecord,
  SUPPLIER_COST_COLLECTION,
  SupplierCostAllocationRecord,
} from "./spend-and-cost-ledger";
import { FINANCIAL_FACTS_COLLECTION } from "./financial-ledger";
import { TELEMETRY_V2_COLLECTION } from "./telemetry-v2";
import { TELEMETRY_COLLECTION } from "./telemetry";
import { getWindowBounds, evaluateCohortAndFunnelReport } from "./reporting-engine";
import { Order, OrderStatus, MailingAddress } from "./types";

export const ADMIN_AUDIT_LOG_COLLECTION = "admin_audit_log";

// ----------------------------------------------------------------------------
// Type Definitions
// ----------------------------------------------------------------------------

export type PaymentState =
  | "unpaid"
  | "authorized_pending"
  | "captured_verified"
  | "partially_refunded"
  | "refunded"
  | "disputed"
  | "verification_failed"
  | "free_or_comp";

export type AddressState =
  | "complete"
  | "deferred_awaiting_recipient"
  | "validation_failed"
  | "missing";

export type FulfillmentState =
  | "not_ready"
  | "queued"
  | "dispatching_locked"
  | "uncertain"
  | "submitted_to_supplier"
  | "mailed_confirmed"
  | "failed";

export type CommunicationState =
  | "not_applicable"
  | "pending"
  | "receipt_sent"
  | "deferred_magic_link_sent"
  | "failed";

export interface InvestigationOrderSummary {
  orderId: string;
  occurredAt: number;
  customerEmail: string;
  recipientName: string;
  recipientAddressSummary: string;
  amountInCents: number;
  status: OrderStatus;
  channel: string;
  campaign?: string;
  paymentState: PaymentState;
  addressState: AddressState;
  fulfillmentState: FulfillmentState;
  fulfillmentStateLabel: string;
  communicationState: CommunicationState;
  handwryttenOrderId?: string;
  handwryttenStatus?: string;
  fulfillmentError?: string;
  isFounderTest?: boolean;
  isComp?: boolean;
  isTest?: boolean;
  sessionId?: string;
  journeyId?: string;
  discountCode?: string;
  occasion?: string;
  hasPrivateContentHidden: boolean;
  frontImageUrl?: string;
}

export interface InvestigationJourneySummary {
  journeyId: string;
  sessionId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  trafficRole: TrafficRole;
  channel: string;
  campaign?: string;
  deviceCategory: string;
  entryPath: string;
  milestones: string[];
  completedStage: string;
  dropOffStage?: string;
  isPaid: boolean;
  paidOrdersCount: number;
  revenueCents: number;
  orderId?: string;
  resumedSessionCount: number;
  identityStatus: "verified" | "correlated_unverified" | "degraded_storage" | "anonymous_unresolved";
}

export interface InvestigationException {
  id: string;
  type:
    | "paid_unmatched"
    | "paid_fulfillment_failed"
    | "stale_dispatching_lock"
    | "awaiting_recipient_address"
    | "communication_failed";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  orderId?: string;
  paymentIntentId?: string;
  financialImpactCents: number;
  ageMs: number;
  occurredAt: number;
  recommendedAction:
    | "retry_fulfillment"
    | "sync_handwrytten"
    | "sync_stripe"
    | "repair_address"
    | "reconcile_order"
    | "resend_receipt";
  safeActionLabel: string;
  isBillableAction: boolean;
  requiresReadSyncFirst: boolean;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  label: string;
  description: string;
  sourceAuthority:
    | "browser_observed"
    | "server_transition"
    | "provider_webhook"
    | "supplier_observation"
    | "communication_service"
    | "reconciliation";
  category: "milestone" | "order" | "payment" | "offer" | "fulfillment" | "communication" | "audit";
  correlation: {
    orderId?: string;
    sessionId?: string;
    journeyId?: string;
    paymentIntentId?: string;
    handwryttenOrderId?: string;
    gitSha?: string;
    experienceVersion?: string;
    traceId?: string;
  };
  metadata?: Record<string, any>;
}

export interface UnifiedEvidenceTimeline {
  sourceCoverage?: ReturnType<typeof boundedCoverage>;
  orderId?: string;
  sessionId?: string;
  journeyId?: string;
  events: TimelineEvent[];
  missingEvidenceStages: string[];
  identityStatus: "verified" | "correlated_unverified" | "degraded_storage" | "anonymous_unresolved";
  resumedSessionIds: string[];
  states: {
    paymentState: PaymentState;
    addressState: AddressState;
    fulfillmentState: FulfillmentState;
    fulfillmentStateLabel: string;
    communicationState: CommunicationState;
  };
  buildMetadata: {
    gitSha: string;
    experienceVersion: string;
  };
}

export interface FulfillmentRetryGateResult {
  allowed: boolean;
  reason:
    | "ready_for_dispatch"
    | "already_has_supplier_order_id"
    | "already_submitted_or_locked"
    | "incomplete_address"
    | "payment_not_verified"
    | "ambiguous_requires_sync"
    | "order_not_found";
  message: string;
  safeToRetry: boolean;
  requiresReadSyncFirst: boolean;
  orderStatus: OrderStatus;
  currentHandwryttenOrderId?: string;
  suggestedAction: "sync_handwrytten" | "sync_stripe" | "repair_address" | "retry_fulfillment" | "reconcile_order";
}

export interface EconomicsInvestigationReport {
  summary: {
    totalCapturedRevenueCents: number;
    netReceiptsCents: number;
    refundsCents: number;
    datedSpendCents: number | null;
    supplierInvoicedCostCents: number;
    supplierEstimatedCostCents: number;
    unconfirmedOrdersCount: number;
    invoicedOrdersCount: number;
    unmatchedFactsCount: number;
  };
  transactionLedgerView: Array<{
    id: string;
    type: "capture" | "refund" | "dispute";
    orderId?: string;
    paymentIntentId: string;
    amountCents: number;
    stripeFeeCents?: number | null;
    supplierCostCents?: number | null;
    supplierCostStatus: "verified_invoice" | "estimated" | "unconfirmed" | "none";
    occurredAt: number;
    commercialKind: string;
    classification: string;
    isUnmatched: boolean;
  }>;
  cohortEconomicsView: Array<{
    date: string;
    channel: string;
    campaign: string;
    sessions: number;
    paidOrders: number;
    revenueCents: number;
    datedSpendCents: number | null;
    supplierCostCents: number | null;
    cacCents: number | null;
    roas: number | null;
    costStatus: "verified" | "estimated" | "unavailable";
  }>;
  exportRows: Record<string, any>[];
  csvContent: string;
  sourceCoverage?: ReturnType<typeof boundedCoverage>;
  scenarioModel: {
    isScenarioModelOnly: true;
    disclaimer: string;
    baseAovCents: number;
    baseCogsCents: number;
    modeledContributionMarginPercent: number;
  };
}

// ----------------------------------------------------------------------------
// PII Masking Utilities (SPRINT-0007-T01, T05)
// ----------------------------------------------------------------------------

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.trim().split("@");
  if (parts.length !== 2) return "***";
  const [user, domain] = parts;
  if (user.length <= 1) {
    return `${user}***@${domain}`;
  }
  return `${user[0]}***@${domain}`;
}

export function maskName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  const trimmed = name.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) {
    return `${tokens[0][0]}***`;
  }
  return `${tokens[0]} ${tokens[tokens.length - 1][0]}***`;
}

export function maskStreet(street?: string | null): string {
  if (!street || typeof street !== "string") return "";
  const trimmed = street.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return `${trimmed.slice(0, 1)}***`;
  }
  const numberPart = trimmed.slice(0, spaceIndex);
  const streetName = trimmed.slice(spaceIndex + 1);
  return `${numberPart.slice(0, 1)}*** ${streetName}`;
}

export function maskRecipientAddress(address?: MailingAddress | null): MailingAddress {
  if (!address) {
    return {
      firstName: "",
      lastName: "",
      street1: "",
      city: "",
      state: "",
      zip: "",
    };
  }
  return {
    firstName: address.firstName,
    lastName: address.lastName ? `${address.lastName.slice(0, 1)}***` : "",
    street1: maskStreet(address.street1),
    street2: address.street2 ? "***" : undefined,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
  };
}

// ----------------------------------------------------------------------------
// State Pillar Derivations (SPRINT-0007-AC02)
// ----------------------------------------------------------------------------

export function deriveFulfillmentStateLabel(state: FulfillmentState): string {
  switch (state) {
    case "submitted_to_supplier":
      return "Submitted to Supplier"; // NEVER "Inking (Robot)"
    case "mailed_confirmed":
      return "Mailed via USPS"; // NEVER "Physically Delivered" without proof
    case "uncertain":
      return "Supplier outcome unknown · reconcile before retry";
    case "dispatching_locked":
      return "Dispatching (Locked)";
    case "queued":
      return "Queued for Fulfillment";
    case "failed":
      return "Fulfillment Failed";
    case "not_ready":
    default:
      return "Awaiting Payment or Address";
  }
}

export function deriveOrderStates(
  order: Partial<Order>,
  financialFacts?: FinancialFactRecord[]
): {
  paymentState: PaymentState;
  addressState: AddressState;
  fulfillmentState: FulfillmentState;
  fulfillmentStateLabel: string;
  communicationState: CommunicationState;
} {
  // 1. Payment State
  let paymentState: PaymentState = "unpaid";
  if (
    order.isComp ||
    order.paymentMethod === "STUDIO_COMP" ||
    order.paymentMethod === "PROMO_CODE" ||
    order.amountInCents === 0
  ) {
    paymentState = "free_or_comp";
  } else if (order.status === "PAYMENT_VERIFICATION_FAILED") {
    paymentState = "verification_failed";
  } else if (financialFacts && financialFacts.length > 0) {
    const hasDispute = financialFacts.some((f) => f.factType === "dispute");
    const refunds = financialFacts.filter((f) => f.factType === "refund");
    const captures = financialFacts.filter((f) => f.factType === "capture");

    const totalCaptured = captures.reduce((acc, c) => acc + c.amountCents, 0);
    const totalRefunded = refunds.reduce((acc, r) => acc + r.amountCents, 0);

    if (hasDispute) {
      paymentState = "disputed";
    } else if (totalRefunded > 0 && totalRefunded >= totalCaptured && totalCaptured > 0) {
      paymentState = "refunded";
    } else if (totalRefunded > 0) {
      paymentState = "partially_refunded";
    } else if (totalCaptured > 0) {
      paymentState = "captured_verified";
    }
  } else if (
    order.status === "PAYMENT_RECEIVED" ||
    order.status === "QUEUED_FOR_FULFILLMENT" ||
    order.status === "PROCESSING_HANDWRYTTEN" ||
    order.status === "MAILED"
  ) {
    paymentState = "authorized_pending"; // Legacy order status alone is not capture authority.
  } else if (order.status === "PENDING_PAYMENT") {
    paymentState = "unpaid";
  }

  // 2. Address State
  let addressState: AddressState = "complete";
  if (
    order.addressDeferred ||
    order.address_deferred ||
    order.status === "AWAITING_RECIPIENT_ADDRESS"
  ) {
    addressState = "deferred_awaiting_recipient";
  } else if (!order.recipientAddress || !order.recipientAddress.street1) {
    addressState = "missing";
  } else if (
    !order.recipientAddress.city ||
    !order.recipientAddress.state ||
    !order.recipientAddress.zip
  ) {
    addressState = "validation_failed";
  }

  // 3. Fulfillment State
  let fulfillmentState: FulfillmentState = "not_ready";
  if (order.status === "MAILED") {
    fulfillmentState = "mailed_confirmed";
  } else if (order.status === "PROCESSING_HANDWRYTTEN") {
    fulfillmentState = "submitted_to_supplier";
  } else if (order.status === "DISPATCH_UNCERTAIN") {
    fulfillmentState = "uncertain";
  } else if (order.status === "DISPATCHING") {
    fulfillmentState = "dispatching_locked";
  } else if (order.status === "QUEUED_FOR_FULFILLMENT") {
    fulfillmentState = "queued";
  } else if (order.status === "FAILED" || order.fulfillmentError) {
    fulfillmentState = "failed";
  }

  // Communication is a separate observation, never inferred from payment or fulfillment.
  let communicationState: CommunicationState = "pending";
  if (order.addressDeferredEmailSentAt) communicationState = "deferred_magic_link_sent";
  else if (order.receiptEmailSentAt) communicationState = "receipt_sent";

  return {
    paymentState,
    addressState,
    fulfillmentState,
    fulfillmentStateLabel: deriveFulfillmentStateLabel(fulfillmentState),
    communicationState,
  };
}

// ----------------------------------------------------------------------------
// Audited PII Reveal (SPRINT-0007-T01, T05)
// ----------------------------------------------------------------------------

export async function revealOrderPiiWithAudit(params: {
  orderId: string;
  operatorId: string;
  reason: string;
  fields?: string[];
}): Promise<{
  orderId: string;
  customerEmail: string;
  recipientAddress: MailingAddress;
  handwrittenNote?: string;
  printedMessage?: string;
  auditId: string;
}> {
  const { orderId, operatorId, reason } = params;
  if (!orderId) throw new Error("Missing orderId for PII reveal");
  if (!reason || reason.trim().length < 5) {
    throw new Error("A valid operational reason (>= 5 chars) is required for audited PII reveal");
  }

  const orderDoc = await firestoreDb.collection("orders").doc(orderId).get();
  if (!orderDoc.exists) {
    throw new Error(`Order ${orderId} not found`);
  }
  const order = orderDoc.data() as Order;

  const auditId = `audit_pii_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const auditEntry = {
    id: auditId,
    action: "pii_reveal",
    orderId,
    operatorId: operatorId || "system_operator",
    reason: reason.trim(),
    fields: params.fields || ["customerEmail", "recipientAddress", "handwrittenNote"],
    timestamp: Date.now(),
  };

  await firestoreDb.collection(ADMIN_AUDIT_LOG_COLLECTION).doc(auditId).set(auditEntry);

  return {
    orderId,
    customerEmail: order.customerEmail || "",
    recipientAddress: order.recipientAddress || {
      firstName: "",
      lastName: "",
      street1: "",
      city: "",
      state: "",
      zip: "",
    },
    handwrittenNote: order.handwrittenNote,
    printedMessage: order.printedMessage,
    auditId,
  };
}

// ----------------------------------------------------------------------------
// Fulfillment Pre-Retry Safety Gate (SPRINT-0007-T03, AC03)
// ----------------------------------------------------------------------------

export async function evaluateFulfillmentRetryGate(orderId: string): Promise<FulfillmentRetryGateResult> {
  if (!orderId) {
    return {
      allowed: false,
      reason: "order_not_found",
      message: "Order ID is missing",
      safeToRetry: false,
      requiresReadSyncFirst: false,
      orderStatus: "FAILED",
      suggestedAction: "reconcile_order",
    };
  }

  const orderDoc = await firestoreDb.collection("orders").doc(orderId).get();
  if (!orderDoc.exists) {
    return {
      allowed: false,
      reason: "order_not_found",
      message: `Order ${orderId} does not exist in the database`,
      safeToRetry: false,
      requiresReadSyncFirst: false,
      orderStatus: "FAILED",
      suggestedAction: "reconcile_order",
    };
  }

  const order = orderDoc.data() as Order;

  // 1. Check if supplier order ID already exists (DUPLICATE CARD PREVENTION)
  if (order.handwryttenOrderId) {
    return {
      allowed: false,
      reason: "already_has_supplier_order_id",
      message: `Order ${orderId} already has Handwrytten ID #${order.handwryttenOrderId}. Submitting again would duplicate physical card manufacturing and billable supplier charges.`,
      safeToRetry: false,
      requiresReadSyncFirst: true,
      orderStatus: order.status,
      currentHandwryttenOrderId: order.handwryttenOrderId,
      suggestedAction: "sync_handwrytten",
    };
  }

  // 2. Check if already mailed or submitted
  if (order.status === "MAILED") {
    return {
      allowed: false,
      reason: "already_submitted_or_locked",
      message: `Order ${orderId} is already recorded as MAILED via USPS.`,
      safeToRetry: false,
      requiresReadSyncFirst: false,
      orderStatus: order.status,
      suggestedAction: "sync_handwrytten",
    };
  }

  if (order.status === "PROCESSING_HANDWRYTTEN") {
    return {
      allowed: false,
      reason: "already_submitted_or_locked",
      message: `Order ${orderId} has already been submitted to supplier (status: PROCESSING_HANDWRYTTEN). Retrying without syncing supplier status would create double charges.`,
      safeToRetry: false,
      requiresReadSyncFirst: true,
      orderStatus: order.status,
      suggestedAction: "sync_handwrytten",
    };
  }

  if (order.status === "DISPATCH_UNCERTAIN" || (order.status === "DISPATCHING" && Date.now() - (order.dispatchStartedAt || 0) >= 300000)) {
    return { allowed: false, reason: "ambiguous_requires_sync", message: "Supplier submission outcome is uncertain. Reconcile the provider record before any billable retry.", safeToRetry: false, requiresReadSyncFirst: true, orderStatus: order.status, suggestedAction: "sync_handwrytten" };
  }

  // 3. Check for active dispatch lock (< 5m)
  if (order.status === "DISPATCHING") {
    const lockAge = Date.now() - (order.dispatchStartedAt || 0);
    if (lockAge < 300000) {
      return {
        allowed: false,
        reason: "already_submitted_or_locked",
        message: `Order ${orderId} is currently being dispatched by an active process (lock age: ${Math.round(lockAge / 1000)}s). Please wait for the dispatch process to conclude.`,
        safeToRetry: false,
        requiresReadSyncFirst: true,
        orderStatus: order.status,
        suggestedAction: "sync_handwrytten",
      };
    }
  }

  // 4. Check payment verification
  if (
    order.status === "PENDING_PAYMENT" ||
    order.status === "PAYMENT_VERIFICATION_FAILED"
  ) {
    return {
      allowed: false,
      reason: "payment_not_verified",
      message: `Order ${orderId} payment is not verified (status: ${order.status}). Retrying fulfillment would create unpaid physical mail.`,
      safeToRetry: false,
      requiresReadSyncFirst: false,
      orderStatus: order.status,
      suggestedAction: "sync_stripe",
    };
  }

  const gateFacts = await readBoundedQuery(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).where("orderId", "==", orderId));
  const verifiedCapture = gateFacts.docs.some((doc) => { const fact = doc.data() as FinancialFactRecord; return fact.factType === "capture" && fact.amountCents > 0; });
  const acceptedFree = order.amountInCents === 0 || order.finalAmountInCents === 0 || order.isComp;
  if (!verifiedCapture && !acceptedFree) return { allowed: false, reason: "payment_not_verified", message: "No authoritative capture fact is available; reconcile payment before retrying.", safeToRetry: false, requiresReadSyncFirst: true, orderStatus: order.status, suggestedAction: "sync_stripe" };

  // 5. Check complete address
  if (
    order.addressDeferred ||
    order.address_deferred ||
    order.status === "AWAITING_RECIPIENT_ADDRESS" ||
    !order.recipientAddress ||
    !order.recipientAddress.street1 ||
    !order.recipientAddress.city ||
    !order.recipientAddress.state ||
    !order.recipientAddress.zip
  ) {
    return {
      allowed: false,
      reason: "incomplete_address",
      message: `Order ${orderId} recipient address is incomplete or deferred. Complete recipient address is required before physical submission.`,
      safeToRetry: false,
      requiresReadSyncFirst: false,
      orderStatus: order.status,
      suggestedAction: "repair_address",
    };
  }

  // Safety gate passed!
  return {
    allowed: true,
    reason: "ready_for_dispatch",
    message: `Order ${orderId} is verified paid, recipient address is complete, and no prior supplier order exists. Safe to proceed with billable submission.`,
    safeToRetry: true,
    requiresReadSyncFirst: false,
    orderStatus: order.status,
    suggestedAction: "retry_fulfillment",
  };
}

// ----------------------------------------------------------------------------
// Orders Investigation Query (SPRINT-0007-T01, AC01)
// ----------------------------------------------------------------------------

export async function queryOrdersEvidence(params: {
  scope: AdminGlobalScope;
  cursor?: string;
  limit?: number;
  search?: string;
  status?: string;
  orderId?: string;
}): Promise<{
  orders: InvestigationOrderSummary[];
  totalMatchingCount: number;
  scopedPaidOrdersTotal: number;
  scopedNetRevenueCents: number;
  hiddenOperationalExceptionsCount: number;
  strandedPaidExceptionsCount: number;
  warningBanner?: string;
  nextCursor?: string;
  hasMore: boolean;
  sourceCoverage: ReturnType<typeof boundedCoverage>;
}> {
  const { scope } = params;
  const limit = Math.min(Math.max(params.limit || 25, 1), 100);
  const search = (params.search || "").trim().toLowerCase();
  const statusFilter = (params.status || "").trim();

  const bounds = getWindowBounds({
    dateRange: scope.datePreset || scope.window || "since_oct13",
    from: scope.customFrom || scope.from ? new Date(scope.customFrom || scope.from!).getTime() : undefined,
    to: scope.customTo || scope.to ? new Date(scope.customTo || scope.to!).getTime() : undefined,
    timezone: scope.timezone,
    fromDate: scope.customFrom || scope.from,
    toDate: scope.customTo || scope.to,
  });

  // 1. Fetch raw orders from Firestore
  const ordersSnapshot = await readBoundedCollection(firestoreDb.collection("orders"));
  const allOrders: Order[] = [];
  ordersSnapshot.forEach((doc) => {
    const data = doc.data() as Order;
    allOrders.push({
      ...data,
      id: data.id || doc.id,
    });
  });

  // 2. Fetch financial facts for cross-checking payments
  const factsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const allFacts: FinancialFactRecord[] = [];
  factsSnapshot.forEach((doc) => {
    allFacts.push(doc.data() as FinancialFactRecord);
  });

  const factsByOrderId = new Map<string, FinancialFactRecord[]>();
  for (const f of allFacts) {
    if (f.orderId) {
      const list = factsByOrderId.get(f.orderId) || [];
      list.push(f);
      factsByOrderId.set(f.orderId, list);
    }
  }

  const periodReport = await evaluateCohortAndFunnelReport({ scope: toGlobalReportScope(scope) });
  const periodFactIds = new Set(periodReport.financialFactIds || []);
  const periodPaidOrderIds = new Set(allFacts.filter((fact) => fact.factType === "capture" && periodFactIds.has(fact.factId)).map((fact) => fact.orderId));
  // 3. Operational vs Customer Filtering
  let hiddenExceptionsCount = 0;
  let strandedPaidCount = 0;

  // Evaluate operational open exceptions
  for (const order of allOrders) {
    const isFounder =
      order.isFounderTest === true ||
      order.customerEmail === "founder@sendmynotes.com" ||
      order.customerEmail === "zbrustkern@gmail.com" ||
      order.isComp === true ||
      order.isTest === true;

    const isPaid =
      order.status === "PAYMENT_RECEIVED" ||
      order.status === "QUEUED_FOR_FULFILLMENT" ||
      order.status === "PROCESSING_HANDWRYTTEN" ||
      order.status === "MAILED" ||
      (factsByOrderId.get(order.id)?.some((f) => f.factType === "capture") ?? false);

    const isException =
      order.status === "FAILED" ||
      Boolean(order.fulfillmentError) ||
      order.status === "AWAITING_RECIPIENT_ADDRESS" ||
      order.addressDeferred === true;

    if (isFounder && isException) {
      hiddenExceptionsCount++;
      if (isPaid) {
        strandedPaidCount++;
      }
    }
  }

  // Apply Window & Mode scope filters
  const scopedOrders = allOrders.filter((order) => {
    // Window filter
    const ts = (order as any).createdAt || (order as any).occurredAt || 0;
    if (scope.drilldownMetric === "paidOrdersCount") {
      if (!periodPaidOrderIds.has(order.id)) return false;
    } else {
      const orderAt = typeof ts === "string" ? Date.parse(ts) : ts;
      if (!Number.isFinite(orderAt) || orderAt < bounds.startMs || orderAt >= bounds.endMs) return false;
    }

    // Mode filter
    if (scope.mode === "customer_reporting") {
      if (
        order.isFounderTest === true ||
        order.customerEmail === "founder@sendmynotes.com" ||
        order.customerEmail === "zbrustkern@gmail.com" ||
        order.isComp === true ||
        order.isTest === true
      ) {
        return false;
      }
    }

    // Channel filter
    if (scope.channel && scope.channel !== "all") {
      const ch = (order.attribution?.utmMedium || order.attribution?.utmSource || "").toLowerCase();
      if (scope.channel === "paid" && !ch.includes("cpc") && !ch.includes("paid")) return false;
      if (scope.channel === "google_cpc" && !ch.includes("google")) return false;
      if (scope.channel === "meta_paid" && !ch.includes("meta") && !ch.includes("facebook")) return false;
      if (scope.channel === "organic_direct" && (ch.includes("cpc") || ch.includes("paid"))) return false;
    }

    // Device filter
    if (scope.device && scope.device !== "all") {
      const dev = ((order as any).deviceCategory || "").toLowerCase();
      if (dev !== scope.device) return false;
    }

    return true;
  });

  // Period totals use the same financial authority as Overview, independent of
  // order search, pagination, creation date or legacy status strings.
  const scopedPaidOrdersTotal = periodReport.summaryMetrics.paidOrdersCount.value;
  const scopedNetRevenueCents = periodReport.summaryMetrics.netReceipts.value;

  // 4. Apply User Search and Status Filters
  let filteredOrders = scopedOrders;

  if (params.orderId) {
    filteredOrders = filteredOrders.filter((o) => o.id === params.orderId);
  }

  if (statusFilter) {
    filteredOrders = filteredOrders.filter((o) => {
      const states = deriveOrderStates(o, factsByOrderId.get(o.id));
      return (
        o.status === statusFilter ||
        states.paymentState === statusFilter ||
        states.fulfillmentState === statusFilter ||
        states.addressState === statusFilter
      );
    });
  }

  if (search) {
    filteredOrders = filteredOrders.filter((o) => {
      const recipient = `${o.recipientAddress?.firstName || ""} ${o.recipientAddress?.lastName || ""}`.toLowerCase();
      const email = (o.customerEmail || "").toLowerCase();
      const id = o.id.toLowerCase();
      const hwId = (o.handwryttenOrderId || "").toLowerCase();
      const promo = (o.discountCode || "").toLowerCase();
      const occasion = (o.occasion || "").toLowerCase();
      return (
        id.includes(search) ||
        recipient.includes(search) ||
        email.includes(search) ||
        hwId.includes(search) ||
        promo.includes(search) ||
        occasion.includes(search)
      );
    });
  }

  const totalMatchingCount = filteredOrders.length;

  // Sort: Exceptions first, then newest
  filteredOrders.sort((a, b) => {
    const aIsExc = a.status === "FAILED" || Boolean(a.fulfillmentError) ? 1 : 0;
    const bIsExc = b.status === "FAILED" || Boolean(b.fulfillmentError) ? 1 : 0;
    if (aIsExc !== bIsExc) return bIsExc - aIsExc;
    const aTs = (a as any).createdAt || 0;
    const bTs = (b as any).createdAt || 0;
    return bTs - aTs;
  });

  // Cursor Pagination
  let startIndex = 0;
  if (params.cursor) {
    const idx = filteredOrders.findIndex((o) => o.id === params.cursor);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }

  const paged = filteredOrders.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < filteredOrders.length ? paged[paged.length - 1]?.id : undefined;
  const hasMore = Boolean(nextCursor);

  // Map to Masked Summaries
  const summaries: InvestigationOrderSummary[] = paged.map((order) => {
    const states = deriveOrderStates(order, factsByOrderId.get(order.id));
    const recipient = order.recipientAddress;
    const recipientName = recipient ? `${recipient.firstName} ${recipient.lastName}` : "Unknown";
    const recipientSummary = recipient
      ? `${maskStreet(recipient.street1)}, ${recipient.city}, ${recipient.state} ${recipient.zip}`
      : "No address recorded";

    return {
      orderId: order.id,
      occurredAt: (order as any).createdAt || (order as any).occurredAt || Date.now(),
      customerEmail: maskEmail(order.customerEmail),
      recipientName: maskName(recipientName),
      recipientAddressSummary: recipientSummary,
      amountInCents: order.amountInCents || 0,
      status: order.status,
      channel: order.attribution?.utmMedium || order.attribution?.utmSource || "direct",
      campaign: order.attribution?.utmCampaign,
      paymentState: states.paymentState,
      addressState: states.addressState,
      fulfillmentState: states.fulfillmentState,
      fulfillmentStateLabel: states.fulfillmentStateLabel,
      communicationState: states.communicationState,
      handwryttenOrderId: order.handwryttenOrderId,
      handwryttenStatus: order.handwryttenStatus,
      fulfillmentError: order.fulfillmentError,
      isFounderTest: order.isFounderTest,
      isComp: order.isComp,
      isTest: order.isTest,
      sessionId: order.sessionId,
      journeyId: (order as any).journeyId,
      discountCode: order.discountCode,
      occasion: order.occasion,
      hasPrivateContentHidden: true,
      frontImageUrl: order.frontImageUrl,
    };
  });

  let warningBanner: string | undefined;
  if (scope.mode === "customer_reporting" && hiddenExceptionsCount > 0) {
    warningBanner = `Customer Mode is active (excluding founder & test orders). ${hiddenExceptionsCount} operational exception(s)${
      strandedPaidCount > 0 ? ` including ${strandedPaidCount} paid order(s)` : ""
    } are currently hidden from view. Switch to Operational Mode to investigate.`;
  }

  return {
    orders: summaries,
    totalMatchingCount,
    scopedPaidOrdersTotal,
    scopedNetRevenueCents,
    hiddenOperationalExceptionsCount: hiddenExceptionsCount,
    strandedPaidExceptionsCount: strandedPaidCount,
    warningBanner,
    nextCursor,
    hasMore,
    sourceCoverage: boundedCoverage(ordersSnapshot, factsSnapshot),
  };
}

// ----------------------------------------------------------------------------
// Journeys Investigation Query (SPRINT-0007-T01, T02)
// ----------------------------------------------------------------------------

export async function queryJourneysEvidence(params: {
  scope: AdminGlobalScope;
  cursor?: string;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<{
  journeys: InvestigationJourneySummary[];
  totalMatchingCount: number;
  scopedTotalJourneys: number;
  scopedConvertedJourneys: number;
  scopedConversionRate: number;
  nextCursor?: string;
  hasMore: boolean;
  sourceCoverage: ReturnType<typeof boundedCoverage>;
}> {
  const { scope } = params;
  const limit = Math.min(Math.max(params.limit || 25, 1), 100);
  const search = (params.search || "").trim().toLowerCase();

  const bounds = getWindowBounds({
    dateRange: scope.datePreset || scope.window || "since_oct13",
    from: scope.customFrom || scope.from ? new Date(scope.customFrom || scope.from!).getTime() : undefined,
    to: scope.customTo || scope.to ? new Date(scope.customTo || scope.to!).getTime() : undefined,
    timezone: scope.timezone,
    fromDate: scope.customFrom || scope.from,
    toDate: scope.customTo || scope.to,
  });

  // 1. Fetch events from telemetry_events_v2 & telemetry_events
  const eventsSnapshot = await readBoundedCollection(firestoreDb.collection(TELEMETRY_V2_COLLECTION));
  const rawEvents: EventV2Envelope[] = [];
  eventsSnapshot.forEach((doc) => {
    const event = doc.data() as EventV2Envelope;
    if (scope.environment && event.environment !== scope.environment) return;
    rawEvents.push(event);
  });

  // Group events by journeyId (or sessionId)
  const journeyMap = new Map<string, EventV2Envelope[]>();
  for (const ev of rawEvents) {
    const jId = ev.journey_id || ev.session_id || "unknown_journey";
    const list = journeyMap.get(jId) || [];
    list.push(ev);
    journeyMap.set(jId, list);
  }

  const journeyFactsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const journeyCaptures = journeyFactsSnapshot.docs.map((doc) => doc.data() as FinancialFactRecord).filter((fact) =>
    fact.factType === "capture" && fact.amountCents > 0 && fact.currency === "usd" &&
    (!scope.environment || (scope.environment === "production" ? fact.livemode === true : fact.livemode === false)) &&
    (scope.mode !== "customer_reporting" || fact.commercialKind === "paid_customer" || fact.commercialKind === "discounted_paid"));
  const journeyOrdersSnapshot = await readBoundedCollection(firestoreDb.collection("orders"));
  const journeyOrders = journeyOrdersSnapshot.docs.map((doc) => ({ ...doc.data() as any, id: doc.id }));
  const allJourneys: InvestigationJourneySummary[] = [];

  for (const [jId, events] of journeyMap.entries()) {
    events.sort((a, b) => a.occurred_at - b.occurred_at);
    const firstEv = events[0];
    const lastEv = events[events.length - 1];

    const milestones = Array.from(new Set(events.map((e) => e.event_name)));
    const sessions = Array.from(new Set(events.map((e) => e.session_id).filter(Boolean)));

    const linkedOrderIds = new Set(events.map((event) => event.order_id).filter(Boolean));
    for (const order of journeyOrders) if (sessions.includes(order.sessionId)) linkedOrderIds.add(order.id);
    const journeyPayments = journeyCaptures.filter((fact) => linkedOrderIds.has(fact.orderId));
    const isPaid = journeyPayments.length > 0;

    // Determine completed / dropoff stage
    let completedStage = "entry_viewed";
    let dropOffStage: string | undefined = "entry_viewed";

    const stageHierarchy = [
      "entry_viewed",
      "builder_engaged",
      "cover_selected",
      "note_confirmed",
      "address_ready",
      "checkout_initiated",
      "payment_captured",
    ];

    for (const st of stageHierarchy) {
      if (milestones.includes(st)) {
        completedStage = st;
      } else {
        dropOffStage = st;
        break;
      }
    }
    if (isPaid) dropOffStage = undefined;

    // Traffic role & classification
    const trafficRole: TrafficRole = firstEv.classification?.role || (firstEv as any).trafficRole || "customer";
    if (scope.mode === "customer_reporting" && trafficRole !== "customer") {
      continue;
    }

    // Window check
    if (bounds.startMs > 0 && firstEv.occurred_at < bounds.startMs) continue;
    if (bounds.endMs > 0 && firstEv.occurred_at >= bounds.endMs) continue;

    // Channel check
    const attribution = (firstEv.properties as Record<string, any>) || {};
    const observedChannel = classifyAcquisitionChannel({ utmSource: attribution.utmSource || attribution.utm_source, utmMedium: attribution.utmMedium || attribution.utm_medium, utmCampaign: attribution.utmCampaign || attribution.utm_campaign, referrer: attribution.referrer });
    const channel = attribution.channel || (attribution.attribution_observed || attribution.utmSource || attribution.utm_source || attribution.referrer ? observedChannel.channel : "Unattributed");
    if (scope.channel && scope.channel !== "all") {
      const ch = channel.toLowerCase();
      if (scope.channel === "google_cpc" && !ch.includes("google")) continue;
      if (scope.channel === "meta_paid" && !ch.includes("meta")) continue;
      if (scope.channel === "paid" && !ch.includes("paid") && !ch.includes("cpc")) continue;
      if (scope.channel === "organic_direct" && (ch.includes("cpc") || ch.includes("paid"))) continue;
    }

    // Device check
    const device = (firstEv.properties as any)?.device_category || (firstEv as any).client?.device_category || "desktop";
    if (scope.device && scope.device !== "all" && device !== scope.device) {
      continue;
    }

    // Identity Status
    let identityStatus: "verified" | "correlated_unverified" | "degraded_storage" | "anonymous_unresolved" = "anonymous_unresolved";
    if (firstEv.journey_id && firstEv.session_id && firstEv.anonymous_id) {
      identityStatus = "correlated_unverified";
    } else if (firstEv.consent_state === "gpc_restricted" || (firstEv as any).client?.gpc || !firstEv.anonymous_id) {
      identityStatus = "degraded_storage";
    }

    allJourneys.push({
      journeyId: jId,
      sessionId: firstEv.session_id || jId,
      firstSeenAt: firstEv.occurred_at,
      lastSeenAt: lastEv.occurred_at,
      trafficRole,
      channel,
      campaign: (firstEv.properties as any)?.utm_campaign || (firstEv as any).classification?.utm_campaign,
      deviceCategory: device,
      entryPath: firstEv.route_template || (firstEv.properties as any)?.path || "/",
      milestones,
      completedStage,
      dropOffStage,
      isPaid,
      paidOrdersCount: new Set(journeyPayments.map((fact) => fact.orderId)).size,
      revenueCents: journeyPayments.reduce((sum, fact) => sum + fact.amountCents, 0),
      orderId: firstEv.order_id,
      resumedSessionCount: Math.max(1, sessions.length),
      identityStatus,
    });
  }

  // Scoped Aggregate Totals
  const scopedTotalJourneys = allJourneys.length;
  const scopedConvertedJourneys = allJourneys.filter((j) => j.isPaid).length;
  const scopedConversionRate =
    scopedTotalJourneys > 0 ? Number(((scopedConvertedJourneys / scopedTotalJourneys) * 100).toFixed(1)) : 0;

  // Drilldown selects observed membership, not inferred step completion.
  const stageAliases: Record<string, string[]> = { entry: ["entry_viewed", "landing_viewed"], cover_selected: ["cover_selected", "cover_preset_selected"], note_confirmed: ["note_confirmed", "note_completed"], address_confirmed: ["address_confirmed", "address_deferred", "address_completed"], checkout_initiated: ["checkout_requested", "checkout_initiated"] };
  let filtered = allJourneys.filter((journey) => {
    if (scope.drilldownStage === "paid") return journey.isPaid;
    if (scope.drilldownStage) return (stageAliases[scope.drilldownStage] || [scope.drilldownStage]).some((stage) => journey.milestones.includes(stage));
    if (scope.drilldownMetric === "sessionConversionRatePercent") return journey.milestones.includes("entry_viewed") || journey.milestones.includes("landing_viewed");
    return true;
  });
  // Apply Search
  if (search) {
    filtered = filtered.filter((j) => {
      return (
        j.journeyId.toLowerCase().includes(search) ||
        j.sessionId.toLowerCase().includes(search) ||
        j.channel.toLowerCase().includes(search) ||
        (j.campaign || "").toLowerCase().includes(search) ||
        (j.orderId || "").toLowerCase().includes(search)
      );
    });
  }

  const totalMatchingCount = filtered.length;

  // Sort newest first
  filtered.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  // Pagination
  let startIndex = 0;
  if (params.cursor) {
    const idx = filtered.findIndex((j) => j.journeyId === params.cursor);
    if (idx !== -1) startIndex = idx + 1;
  }

  const paged = filtered.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < filtered.length ? paged[paged.length - 1]?.journeyId : undefined;
  const hasMore = Boolean(nextCursor);

  return {
    journeys: paged,
    totalMatchingCount,
    scopedTotalJourneys,
    scopedConvertedJourneys,
    scopedConversionRate,
    nextCursor,
    hasMore,
    sourceCoverage: boundedCoverage(eventsSnapshot),
  };
}

// ----------------------------------------------------------------------------
// Actionable Exceptions Queue Query (SPRINT-0007-T03)
// ----------------------------------------------------------------------------

export async function queryExceptionsQueue(params: {
  scope: AdminGlobalScope;
  limit?: number;
}): Promise<{
  exceptions: InvestigationException[];
  totalExceptionsCount: number;
  hiddenOperationalExceptionsCount: number;
  totalAtRiskCents: number;
  warningBanner?: string;
  sourceCoverage: ReturnType<typeof boundedCoverage>;
}> {
  const { scope } = params;
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  const ordersSnapshot = await readBoundedCollection(firestoreDb.collection("orders"));
  const allOrders: Order[] = [];
  ordersSnapshot.forEach((doc) => {
    const data = doc.data() as Order;
    allOrders.push({ ...data, id: data.id || doc.id });
  });

  const factsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const allFacts: FinancialFactRecord[] = [];
  factsSnapshot.forEach((doc) => {
    allFacts.push(doc.data() as FinancialFactRecord);
  });

  const orderIdSet = new Set(allOrders.map((o) => o.id));
  const exceptions: InvestigationException[] = [];
  let hiddenExceptionsCount = 0;

  // 1. Paid Unmatched: Captured financial facts without matching order doc
  for (const fact of allFacts) {
    if (fact.factType === "capture" && (!fact.orderId || !orderIdSet.has(fact.orderId))) {
      const ageMs = Date.now() - fact.occurredAt;
      const paymentIntent = fact.providerObjectId || (fact as any).providerPaymentId || "unknown";
      exceptions.push({
        id: `exc_unmatched_${fact.factId}`,
        type: "paid_unmatched",
        severity: "critical",
        title: `Captured Payment Without Order Record: ${paymentIntent}`,
        description: `Stripe capture of $${(fact.amountCents / 100).toFixed(2)} exists on fact ledger but has no corresponding order document.`,
        paymentIntentId: paymentIntent,
        financialImpactCents: fact.amountCents,
        ageMs,
        occurredAt: fact.occurredAt,
        recommendedAction: "reconcile_order",
        safeActionLabel: "Reconcile Order",
        isBillableAction: false,
        requiresReadSyncFirst: true,
      });
    }
  }

  // 2. Orders exceptions
  for (const order of allOrders) {
    const isFounder =
      order.isFounderTest === true ||
      order.customerEmail === "founder@sendmynotes.com" ||
      order.customerEmail === "zbrustkern@gmail.com" ||
      order.isComp === true ||
      order.isTest === true;

    const ageMs = Date.now() - ((order as any).createdAt || order.dispatchStartedAt || 0);

    // Paid Fulfillment Failed
    if (order.status === "FAILED" || (order.fulfillmentError && !order.handwryttenOrderId)) {
      if (scope.mode === "customer_reporting" && isFounder) {
        hiddenExceptionsCount++;
        continue;
      }
      exceptions.push({
        id: `exc_failed_${order.id}`,
        type: "paid_fulfillment_failed",
        severity: "critical",
        title: `Fulfillment Failed: Order #${order.id}`,
        description: order.fulfillmentError || "Supplier API dispatch returned error. Card not created.",
        orderId: order.id,
        financialImpactCents: order.amountInCents || 900,
        ageMs,
        occurredAt: (order as any).createdAt || Date.now(),
        recommendedAction: "retry_fulfillment",
        safeActionLabel: "Pre-Check Retry",
        isBillableAction: true,
        requiresReadSyncFirst: false,
      });
      continue;
    }

    // Stale Dispatching Lock
    if (order.status === "DISPATCHING") {
      const lockAge = Date.now() - (order.dispatchStartedAt || 0);
      if (lockAge > 300000) {
        // > 5 minutes
        if (scope.mode === "customer_reporting" && isFounder) {
          hiddenExceptionsCount++;
          continue;
        }
        exceptions.push({
          id: `exc_stale_lock_${order.id}`,
          type: "stale_dispatching_lock",
          severity: "warning",
          title: `Stale Dispatch Lock (>5m): Order #${order.id}`,
          description: `Order has been locked in DISPATCHING state for ${Math.round(lockAge / 60000)} minutes without conclusion.`,
          orderId: order.id,
          financialImpactCents: order.amountInCents || 900,
          ageMs: lockAge,
          occurredAt: order.dispatchStartedAt || Date.now(),
          recommendedAction: "sync_handwrytten",
          safeActionLabel: "Check Supplier Status",
          isBillableAction: false,
          requiresReadSyncFirst: true,
        });
        continue;
      }
    }

    // Awaiting Recipient Address
    if (
      order.status === "AWAITING_RECIPIENT_ADDRESS" ||
      order.addressDeferred === true ||
      order.address_deferred === true
    ) {
      if (scope.mode === "customer_reporting" && isFounder) {
        hiddenExceptionsCount++;
        continue;
      }
      exceptions.push({
        id: `exc_address_${order.id}`,
        type: "awaiting_recipient_address",
        severity: "warning",
        title: `Awaiting Recipient Address: Order #${order.id}`,
        description: "Payment captured; deferred address link pending completion by sender or recipient.",
        orderId: order.id,
        financialImpactCents: order.amountInCents || 900,
        ageMs,
        occurredAt: (order as any).createdAt || Date.now(),
        recommendedAction: "repair_address",
        safeActionLabel: "Input Address",
        isBillableAction: false,
        requiresReadSyncFirst: false,
      });
    }
  }

  // Sort exceptions: Severity critical first, then financial impact descending, then age descending
  exceptions.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    if (a.financialImpactCents !== b.financialImpactCents) {
      return b.financialImpactCents - a.financialImpactCents;
    }
    return b.ageMs - a.ageMs;
  });

  const totalAtRiskCents = exceptions.reduce((acc, exc) => acc + exc.financialImpactCents, 0);

  let warningBanner: string | undefined;
  if (scope.mode === "customer_reporting" && hiddenExceptionsCount > 0) {
    warningBanner = `${hiddenExceptionsCount} operational exceptions are hidden by Customer Mode founder filter.`;
  }

  return {
    exceptions: exceptions.slice(0, limit),
    totalExceptionsCount: exceptions.length,
    hiddenOperationalExceptionsCount: hiddenExceptionsCount,
    totalAtRiskCents,
    warningBanner,
    sourceCoverage: boundedCoverage(ordersSnapshot, factsSnapshot),
  };
}

// ----------------------------------------------------------------------------
// Unified Chronological Evidence Timeline (SPRINT-0007-T02, AC02)
// ----------------------------------------------------------------------------

export async function buildUnifiedEvidenceTimeline(params: {
  orderId?: string;
  sessionId?: string;
  journeyId?: string;
  environment?: string;
}): Promise<UnifiedEvidenceTimeline> {
  const { orderId, sessionId, journeyId } = params;
  const events: TimelineEvent[] = [];

  let resolvedOrderId = orderId;
  let resolvedSessionId = sessionId;
  let resolvedJourneyId = journeyId;

  let orderData: Order | null = null;
  if (resolvedOrderId) {
    const orderDoc = await firestoreDb.collection("orders").doc(resolvedOrderId).get();
    if (orderDoc.exists) {
      orderData = orderDoc.data() as Order;
      if (!resolvedSessionId && orderData.sessionId) resolvedSessionId = orderData.sessionId;
      if (!resolvedJourneyId && (orderData as any).journeyId) resolvedJourneyId = (orderData as any).journeyId;
    }
  }

  // 1. Browser Observed Events (telemetry_events_v2)
  const telemetrySnapshot = await readBoundedCollection(firestoreDb.collection(TELEMETRY_V2_COLLECTION));
  const rawEvents: EventV2Envelope[] = [];
  telemetrySnapshot.forEach((doc) => {
    rawEvents.push(doc.data() as EventV2Envelope);
  });

  const matchedTelemetry = rawEvents.filter((ev) => {
    if (params.environment && ev.environment !== params.environment) return false;
    if (resolvedOrderId && ev.order_id === resolvedOrderId) return true;
    if (resolvedJourneyId && ev.journey_id === resolvedJourneyId) return true;
    if (resolvedSessionId && ev.session_id === resolvedSessionId) return true;
    return false;
  });

  for (const tel of matchedTelemetry) {
    events.push({
      id: tel.event_id,
      timestamp: tel.occurred_at,
      label: `Browser: ${tel.event_name}`,
      description: `Observed milestone '${tel.event_name}' on path ${tel.route_template || (tel.properties as any)?.path || "/"} via ${(tel.classification as any)?.channel || "Direct"}.`,
      sourceAuthority: "browser_observed",
      category: "milestone",
      correlation: {
        orderId: tel.order_id,
        sessionId: tel.session_id,
        journeyId: tel.journey_id,
        gitSha: tel.build_sha || "unknown",
        experienceVersion: tel.experience_version || "unknown",
      },
      metadata: tel.properties as Record<string, unknown>,
    });
  }

  // 2. Server Order Transitions
  if (orderData) {
    const createdAt = Number((orderData as any).createdAt);
    if (Number.isFinite(createdAt) && createdAt > 0) events.push({
      id: `ord_create_${orderData.id}`,
      timestamp: createdAt,
      label: "Order Created in System",
      description: `Order document initialized with status ${orderData.status}. Customer: ${maskEmail(orderData.customerEmail)}.`,
      sourceAuthority: "server_transition",
      category: "order",
      correlation: {
        orderId: orderData.id,
        sessionId: orderData.sessionId,
        experienceVersion: orderData.experienceVersion || "unknown",
      },
    });

    const mailedAt = orderData.handwryttenMailedDate ? Date.parse(orderData.handwryttenMailedDate) : NaN;
    if (orderData.status === "MAILED" && Number.isFinite(mailedAt)) {
      events.push({
        id: `ord_mailed_${orderData.id}`,
        timestamp: mailedAt,
        label: "Mailed via USPS",
        description: `Supplier confirmed mail induction. Status: MAILED via USPS${
          orderData.handwryttenTrackingNumber ? ` (Tracking: ${orderData.handwryttenTrackingNumber})` : ""
        }.`,
        sourceAuthority: "supplier_observation",
        category: "fulfillment",
        correlation: {
          orderId: orderData.id,
          handwryttenOrderId: orderData.handwryttenOrderId,
        },
      });
    } else if (orderData.handwryttenOrderId && Number.isFinite(Number((orderData as any).supplierSubmittedAt || (orderData as any).submittedAt))) {
      events.push({
        id: `ord_submitted_${orderData.id}`,
        timestamp: Number((orderData as any).supplierSubmittedAt || (orderData as any).submittedAt),
        label: "Submitted to Supplier",
        description: `Order successfully submitted to Handwrytten (Supplier ID: #${orderData.handwryttenOrderId}).`,
        sourceAuthority: "supplier_observation",
        category: "fulfillment",
        correlation: {
          orderId: orderData.id,
          handwryttenOrderId: orderData.handwryttenOrderId,
        },
      });
    }

    const fulfillmentErrorAt = Number((orderData as any).fulfillmentErrorAt || (orderData as any).fulfillmentFailedAt);
    if (orderData.fulfillmentError && Number.isFinite(fulfillmentErrorAt) && fulfillmentErrorAt > 0) {
      events.push({
        id: `ord_err_${orderData.id}`,
        timestamp: fulfillmentErrorAt,
        label: "Fulfillment Dispatch Failed",
        description: orderData.fulfillmentError,
        sourceAuthority: "server_transition",
        category: "fulfillment",
        correlation: { orderId: orderData.id },
      });
    }
  }

  // 3. Provider Webhook Facts (Financial Ledger)
  const factsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const facts: FinancialFactRecord[] = [];
  factsSnapshot.forEach((doc) => {
    facts.push(doc.data() as FinancialFactRecord);
  });

  const matchedFacts = facts.filter((f) => {
    if (resolvedOrderId && f.orderId === resolvedOrderId) return true;
    const paymentId = f.providerObjectId || (f as any).providerPaymentId;
    if (orderData?.stripePaymentId && paymentId === orderData.stripePaymentId) return true;
    return false;
  });

  for (const fact of matchedFacts) {
    const paymentId = fact.providerObjectId || (fact as any).providerPaymentId || "unknown";
    events.push({
      id: fact.factId,
      timestamp: fact.occurredAt,
      label: `Stripe ${fact.factType.toUpperCase()}: $${(fact.amountCents / 100).toFixed(2)}`,
      description: `Verified ${fact.factType} of $${(fact.amountCents / 100).toFixed(2)} via webhook event (${paymentId}).`,
      sourceAuthority: "provider_webhook",
      category: "payment",
      correlation: {
        orderId: fact.orderId,
        paymentIntentId: paymentId,
      },
    });
  }

  // Sort Chronologically
  events.sort((a, b) => a.timestamp - b.timestamp);

  // Derive Missing Evidence Stages
  const observedMilestones = new Set(matchedTelemetry.map((t) => t.event_name));
  const missingEvidenceStages: string[] = [];
  if (orderData && !observedMilestones.has("entry_viewed")) missingEvidenceStages.push("entry_viewed");
  if (orderData && !observedMilestones.has("cover_selected")) missingEvidenceStages.push("cover_selected");
  if (orderData && !observedMilestones.has("note_confirmed")) missingEvidenceStages.push("note_confirmed");
  if (orderData && !observedMilestones.has("address_ready") && !orderData.addressDeferred) {
    missingEvidenceStages.push("address_ready");
  }

  // Derive Identity & Resumed Sessions
  const sessions = Array.from(new Set(matchedTelemetry.map((t) => t.session_id).filter(Boolean))) as string[];
  let identityStatus: "verified" | "correlated_unverified" | "degraded_storage" | "anonymous_unresolved" = "anonymous_unresolved";
  if (sessions.length > 0) identityStatus = "correlated_unverified";

  const states = deriveOrderStates(orderData || {}, matchedFacts);

  return {
    orderId: resolvedOrderId,
    sessionId: resolvedSessionId,
    journeyId: resolvedJourneyId,
    events,
    missingEvidenceStages,
    identityStatus,
    sourceCoverage: boundedCoverage(telemetrySnapshot, factsSnapshot),
    resumedSessionIds: sessions,
    states,
    buildMetadata: {
      gitSha: matchedTelemetry.find((event) => Boolean(event.build_sha))?.build_sha || "unknown",
      experienceVersion: matchedTelemetry.find((event) => Boolean(event.experience_version))?.experience_version || orderData?.experienceVersion || "unknown",
    },
  };
}

// ----------------------------------------------------------------------------
// Economics Investigation Report (SPRINT-0007-T04, AC04)
// ----------------------------------------------------------------------------

export async function getEconomicsInvestigationReport(params: {
  scope: AdminGlobalScope;
  format?: "json" | "csv";
}): Promise<EconomicsInvestigationReport> {
  const { scope } = params;

  const bounds = getWindowBounds({
    dateRange: scope.datePreset || scope.window || "since_oct13",
    from: scope.customFrom || scope.from ? new Date(scope.customFrom || scope.from!).getTime() : undefined,
    to: scope.customTo || scope.to ? new Date(scope.customTo || scope.to!).getTime() : undefined,
    timezone: scope.timezone,
    fromDate: scope.customFrom || scope.from,
    toDate: scope.customTo || scope.to,
  });

  // 1. Fetch financial facts
  const factsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const facts: FinancialFactRecord[] = [];
  factsSnapshot.forEach((doc) => {
    facts.push(doc.data() as FinancialFactRecord);
  });

  // 2. Fetch supplier costs
  const costsSnapshot = await readBoundedCollection(firestoreDb.collection(SUPPLIER_COST_COLLECTION));
  const supplierCosts: SupplierCostAllocationRecord[] = [];
  costsSnapshot.forEach((doc) => {
    supplierCosts.push(doc.data() as SupplierCostAllocationRecord);
  });
  const costByOrderId = new Map<string, SupplierCostAllocationRecord>();
  for (const c of supplierCosts) {
    costByOrderId.set(c.orderId, c);
  }

  // 3. Fetch dated spend
  const spendSnapshot = await readBoundedCollection(firestoreDb.collection(DATED_SPEND_COLLECTION));
  const datedSpends: DatedSpendRecord[] = [];
  spendSnapshot.forEach((doc) => {
    datedSpends.push(doc.data() as DatedSpendRecord);
  });

  const commonReport = await evaluateCohortAndFunnelReport({ scope: toGlobalReportScope(scope) });
  const includedFactIds = new Set(commonReport.financialFactIds || []);
  const filteredFacts = facts.filter((fact) => includedFactIds.has(fact.factId));

  let totalCaptured = 0;
  let totalRefunded = 0;
  let invoicedCostTotal = 0;
  let estimatedCostTotal = 0;
  let unconfirmedCount = 0;
  let invoicedCount = 0;
  let unmatchedCount = 0;

  const transactionLedgerView = filteredFacts.map((fact) => {
    const costRecord = fact.orderId ? costByOrderId.get(fact.orderId) : undefined;
    const isUnmatched = !fact.orderId;
    if (isUnmatched) unmatchedCount++;

    let supplierCostStatus: "verified_invoice" | "estimated" | "unconfirmed" | "none" = "none";
    let supplierCostCents: number | null = null;

    if (fact.factType === "capture") {
      totalCaptured += fact.amountCents;
      if (costRecord) {
        supplierCostStatus = costRecord.isEstimate ? "estimated" : "verified_invoice";
        supplierCostCents = costRecord.totalSupplierCostCents;
        if (costRecord.isEstimate) { estimatedCostTotal += costRecord.totalSupplierCostCents; unconfirmedCount++; }
        else { invoicedCostTotal += costRecord.totalSupplierCostCents; invoicedCount++; }
      } else {
        supplierCostStatus = "unconfirmed";
        supplierCostCents = null; // NEVER assume $0 cost or unconfirmed cost as verified
        unconfirmedCount++;
      }
    } else if (fact.factType === "refund") {
      totalRefunded += fact.amountCents;
    }

    return {
      id: fact.factId,
      type: fact.factType,
      orderId: fact.orderId,
      paymentIntentId: fact.paymentIntentId || (fact.factType === "capture" ? fact.providerObjectId : undefined) || (fact as any).providerPaymentId || "unmatched",
      amountCents: fact.amountCents,
      stripeFeeCents: fact.stripeFeeCents ?? null,
      supplierCostCents,
      supplierCostStatus,
      occurredAt: fact.occurredAt,
      commercialKind: fact.commercialKind,
      classification: (fact as any).classification?.traffic_role || fact.commercialKind || "customer_prospect",
      isUnmatched,
    };
  });

  const netReceiptsCents = totalCaptured - totalRefunded;
  const datedSpendCents = commonReport.summaryMetrics.datedAdSpendCents.value;
  const cohortEconomicsView = commonReport.campaigns.map((row) => ({
    date: bounds.label, channel: row.channel, campaign: row.campaign,
    sessions: row.sessions, paidOrders: row.paidOrders, revenueCents: row.capturedRevenueCents,
    datedSpendCents: row.datedSpendCents, supplierCostCents: row.supplierCostCents,
    cacCents: row.cacCents, roas: row.roas,
    costStatus: row.costStatus === "verified" ? "verified" as const : "unavailable" as const,
  }));

  // Flat Export Rows (proves exact aggregate == detail == export parity)
  const exportRows = transactionLedgerView.map((tx) => ({
    FactID: tx.id,
    Type: tx.type,
    OrderID: tx.orderId || "UNMATCHED",
    PaymentIntentID: tx.paymentIntentId,
    AmountDollars: (tx.amountCents / 100).toFixed(2),
    StripeFeeDollars: tx.stripeFeeCents == null ? "UNCONFIRMED" : (tx.stripeFeeCents / 100).toFixed(2),
    SupplierCostDollars: tx.supplierCostCents !== null ? (tx.supplierCostCents / 100).toFixed(2) : "UNCONFIRMED",
    SupplierCostStatus: tx.supplierCostStatus,
    OccurredAtUTC: new Date(tx.occurredAt).toISOString(),
    Classification: tx.classification,
  }));

  // CSV Generator
  const csvHeaders = [
    "FactID",
    "Type",
    "OrderID",
    "PaymentIntentID",
    "AmountDollars",
    "StripeFeeDollars",
    "SupplierCostDollars",
    "SupplierCostStatus",
    "OccurredAtUTC",
    "Classification",
  ];
  const csvLines = [
    csvHeaders.join(","),
    ...exportRows.map((r) =>
      csvHeaders
        .map((h) => {
          const val = String((r as any)[h] || "");
          return val.includes(",") ? `"${val}"` : val;
        })
        .join(",")
    ),
  ];
  const csvContent = csvLines.join("\n");

  return {
    summary: {
      totalCapturedRevenueCents: totalCaptured,
      netReceiptsCents,
      refundsCents: totalRefunded,
      datedSpendCents,
      supplierInvoicedCostCents: invoicedCostTotal,
      supplierEstimatedCostCents: estimatedCostTotal,
      unconfirmedOrdersCount: unconfirmedCount,
      invoicedOrdersCount: invoicedCount,
      unmatchedFactsCount: unmatchedCount,
    },
    transactionLedgerView,
    cohortEconomicsView,
    exportRows,
    csvContent,
    sourceCoverage: boundedCoverage(factsSnapshot, costsSnapshot, spendSnapshot),
    scenarioModel: {
      isScenarioModelOnly: true,
      disclaimer:
        "Scenario models and break-even calculations are simulation estimates only based on modeled $4.88 COGS baseline. They are strictly separated from reconciled transaction ledger facts.",
      baseAovCents: 900,
      baseCogsCents: 488,
      modeledContributionMarginPercent: 39.6,
    },
  };
}
