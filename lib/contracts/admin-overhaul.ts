/**
 * lib/contracts/admin-overhaul.ts
 *
 * Core shared contracts, reporting defaults, telemetry schema v2 envelope,
 * financial fact ledger, metric envelopes, offer lifecycles, and drilldown
 * queries for the SendMyNotes Admin Overhaul (SPRINT-0001-T02).
 *
 * Reference: docs/sprints/ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md
 * Canonical Authority: AGENTS.md, CANONICAL_PROJECT_BRIEF.md, CANONICAL_PRODUCT_SPECS.md
 */

// ============================================================================
// Proposed Reporting & Policy Defaults
// ============================================================================

export const REPORTING_POLICY_VERSION = "2026-10-18.v1";

/**
 * 30-minute session boundary. Inactivity exceeding this duration delimits
 * distinct sessions.
 */
export const SESSION_INACTIVITY_WINDOW_MS = 30 * 60 * 1000;

/**
 * 5-minute active journey threshold. Sessions with activity within this
 * threshold are considered actively in-progress.
 */
export const ACTIVE_JOURNEY_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * 24-hour session conversion horizon. Conversion metrics evaluate linked
 * verified payments within 24 hours of first session entry.
 */
export const SESSION_CONVERSION_HORIZON_MS = 24 * 60 * 60 * 1000;

/**
 * 7-day last-observable-non-direct touch attribution lookback window.
 */
export const ATTRIBUTION_LOOKBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Standard operating timezone for executive reporting and day boundaries.
 */
export const DEFAULT_ADMIN_TIMEZONE = "America/Chicago";

/**
 * Max active promotional offers that can be applied to an individual order.
 */
export const MAX_ACTIVE_OFFERS_PER_ORDER = 1;

/**
 * A refunded order does NOT automatically restore the offer's redemption usage slot.
 */
export const REFUND_RESTORES_OFFER_USAGE = false;

/**
 * Accepted promotional price quotes are valid for 30 minutes before revalidation.
 */
export const DEFAULT_QUOTE_VALIDITY_MS = 30 * 60 * 1000;

// ============================================================================
// Contract 1: Event v2 Envelope, Authority Rules, Ingestion & Properties
// ============================================================================

export type TelemetrySchemaVersion = "v2.0" | "v1.legacy";

export type EventEnvironment = "production" | "staging" | "development" | "test";

export type EventSourceAuthority =
  | "browser"
  | "server"
  | "provider_webhook"
  | "reconciliation";

export type TrafficRole =
  | "customer"
  | "founder"
  | "staff"
  | "synthetic"
  | "known_bot"
  | "unresolved";

export interface ClassificationProvenance {
  role: TrafficRole;
  reason: string;
  version: string;
  explicitOverride: boolean;
}

export type ConsentState =
  | "granted"
  | "denied"
  | "gpc_restricted"
  | "not_required";

export type EventV2Name =
  // Entry
  | "entry_viewed"
  | "builder_engaged"
  // Cover
  | "cover_loaded"
  | "cover_selected"
  | "generation_requested"
  | "generation_completed"
  | "generation_failed"
  // Note
  | "note_template_loaded"
  | "note_edit_started"
  | "note_confirmed"
  // Address
  | "address_viewed"
  | "address_validation_failed"
  | "address_confirmed"
  | "address_deferred"
  // Checkout
  | "checkout_requested"
  | "checkout_created"
  | "payment_ui_ready"
  | "payment_ui_failed"
  // Wallet
  | "wallet_availability_observed"
  | "wallet_selected"
  | "wallet_canceled"
  // Payment (client lifecycle - observational only, cannot count as verified paid)
  | "payment_attempted"
  | "payment_action_required"
  | "payment_failed"
  | "payment_canceled"
  | "payment_confirmation_observed"
  // Financial authority (server/webhook verified facts only)
  | "payment_captured"
  | "payment_refunded"
  | "payment_disputed"
  // Fulfillment (server facts)
  | "fulfillment_queued"
  | "fulfillment_submitted"
  | "fulfillment_failed"
  | "supplier_status_observed"
  // Communications (server facts)
  | "receipt_requested"
  | "receipt_accepted"
  | "receipt_delivered"
  | "receipt_failed"
  // Promotions
  | "offer_viewed"
  | "discount_apply_requested"
  | "discount_applied"
  | "discount_rejected"
  | "discount_removed"
  | "discount_redeemed"
  // Recovery
  | "draft_resumed"
  | "recovery_offer_viewed"
  | "recovery_purchase_linked"
  // Change & governance
  | "experiment_exposed"
  | "control_changed"
  | "release_observed";

export const FINANCIAL_AUTHORITY_EVENTS: ReadonlySet<string> = new Set([
  "payment_captured",
  "payment_refunded",
  "payment_disputed",
]);

export const SERVER_ONLY_AUTHORITY_EVENTS: ReadonlySet<string> = new Set([
  "payment_captured",
  "payment_refunded",
  "payment_disputed",
  "fulfillment_queued",
  "fulfillment_submitted",
  "fulfillment_failed",
  "supplier_status_observed",
  "receipt_accepted",
  "receipt_delivered",
  "receipt_failed",
  "discount_redeemed",
  "control_changed",
  "release_observed",
]);

/**
 * Checks if the given event name is a financial authority event (e.g. captured, refunded).
 */
export function isFinancialAuthorityEventV2(name: string): boolean {
  return FINANCIAL_AUTHORITY_EVENTS.has(name);
}

/**
 * Determines whether a browser client is allowed to emit the specified event.
 * Rejects financial authority events and server-only state transitions.
 * Browser confirmation events like `payment_confirmation_observed` or legacy
 * `step_6_paid_order` MUST NOT have financial authority.
 */
export function isBrowserAllowedEventV2(name: string): boolean {
  if (SERVER_ONLY_AUTHORITY_EVENTS.has(name)) {
    return false;
  }
  // Legacy alias explicitly barred from browser ingestion as paid
  if (name === "step_6_paid_order") {
    return false;
  }
  return true;
}

/**
 * Computes a deterministic deduplication key for telemetry events.
 */
export function computeEventDedupeKey(params: {
  event_id?: string;
  event_name: string;
  occurred_at: number;
  session_id?: string;
  order_id?: string;
}): string {
  if (params.event_id && params.event_id.trim().length > 0) {
    return `ev_${params.event_id.trim()}`;
  }
  const scope = params.order_id || params.session_id || "global";
  return `ev_${params.event_name}_${scope}_${params.occurred_at}`;
}

export interface ExperimentExposure {
  experiment_id: string;
  variant_id: string;
}

/**
 * Event v2 Envelope matching the overhaul specification.
 */
export interface EventV2Envelope<T = Record<string, unknown>> {
  event_id: string;
  event_name: EventV2Name | string;
  schema_version: TelemetrySchemaVersion;
  occurred_at: number;
  received_at: number;
  environment: EventEnvironment;
  source: EventSourceAuthority;
  session_id?: string;
  anonymous_id?: string;
  journey_id?: string;
  order_id?: string;
  payment_attempt_id?: string;
  request_id?: string;
  trace_id?: string;
  build_sha: string;
  experience_version: string;
  route_template: string;
  classification: ClassificationProvenance;
  consent_state: ConsentState;
  attribution_snapshot_id?: string;
  experiment_exposures?: ExperimentExposure[];
  degraded_identity?: boolean;
  clock_skew_ms?: number;
  properties: T;
}

export interface TelemetryIngestResponse {
  accepted: boolean;
  eventId: string;
  dedupeKey: string;
  quarantined?: boolean;
  quarantineReason?: string;
  clockSkewMs?: number;
  error?: string;
}

// ============================================================================
// Contract 2: Payment/Capture/Refund/Dispute Ledger & Correlation Identities
// ============================================================================

export type PaymentFactType = "capture" | "refund" | "dispute";

export type CommercialKind =
  | "paid_customer"
  | "discounted_paid"
  | "free_promo"
  | "studio_comp"
  | "founder_test"
  | "unresolved_historical";

export interface FinancialFactRecord {
  paymentIntentId?: string;
  providerRelationshipStatus?: "linked" | "unmatched";
  relatedChargeId?: string;
  operationId?: string;
  occurredAtBasis?: "provider_reported" | "server_observed";
  buildSha?: string;
  factId: string;
  factType: PaymentFactType;
  commercialKind: CommercialKind;
  orderId: string;
  provider: "stripe" | "manual_reconciliation";
  providerObjectId: string;
  providerEventId?: string;
  amountCents: number;
  currency: string;
  stripeFeeCents?: number | null;
  supplierCostCents?: number | null; // null represents unavailable/unknown
  netRevenueCents?: number | null;
  livemode: boolean;
  occurredAt: number;
  recordedAt: number;
  reconciledBy?: string;
  reconciliationNotes?: string;
}

export interface ProviderWebhookInboxRecord {
  inboxId: string;
  provider: "stripe" | "handwrytten";
  providerEventId: string;
  eventType: string;
  receivedAt: number;
  status: "pending" | "processing" | "processed" | "ignored" | "failed";
  leaseUntil?: number;
  processedAt?: number;
  attempts: number;
  error?: string;
  idempotencySignature: string;
  payloadSummary: Record<string, unknown>;
}

export interface TransactionalOutboxRecord {
  outboxId: string;
  topic: "analytics_event" | "fulfillment_submission" | "email_receipt";
  aggregateId: string;
  createdAt: number;
  status: "pending" | "dispatched" | "failed";
  dispatchedAt?: number;
  retryCount: number;
  lastError?: string;
  payload: Record<string, unknown>;
}

export interface ReconciliationExceptionRecord {
  exceptionId: string;
  category:
    | "unmatched_payment"
    | "paid_fulfillment_failed"
    | "paid_address_deferred"
    | "attribution_gap"
    | "historical_unresolved";
  orderId?: string;
  providerPaymentId?: string;
  severity: "critical" | "warning" | "info";
  detectedAt: number;
  ageMs: number;
  details: string;
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface CorrelationIdentity {
  sessionId?: string;
  anonymousId?: string;
  journeyId?: string;
  orderId?: string;
  paymentAttemptId?: string;
  requestId?: string;
  traceId?: string;
}

// ============================================================================
// Contract 3: Metric Scope, Status, Coverage, Cohorts & Attribution
// ============================================================================

export type MetricStatus =
  | "verified"
  | "estimated"
  | "partial"
  | "unavailable"
  | "not_applicable";

export type ReportingMode = "customer_reporting" | "operational_all";

export interface GlobalReportScope {
  window: {
    start: string;
    end: string;
    label: string;
  };
  timezone: string;
  environment?: EventEnvironment;
  mode: ReportingMode;
  channel?: string;
  experienceVersion?: string;
  deviceCategory?: "mobile" | "desktop" | "tablet" | "all";
  excludeFounder?: boolean;
}

export interface MetricCoverage {
  observedCount: number;
  totalEligibleCount: number;
  unresolvedCount: number;
  coverageRatio: number | null;
  notes?: string[];
}

export interface MetricEnvelope<T = number | null> {
  value: T;
  definitionVersion: string;
  asOf: string;
  window: {
    start: string;
    end: string;
    label: string;
  };
  timezone: string;
  filters: GlobalReportScope;
  source: string;
  coverage: MetricCoverage;
  status: MetricStatus;
  numerator?: number;
  denominator?: number;
  exclusions?: Record<string, number>;
  provisional?: boolean;
}

export type AcquisitionChannel =
  | "Google CPC"
  | "Meta Paid"
  | "Organic Search"
  | "Organic Social"
  | "Referral"
  | "Direct"
  | "Unattributed";

export interface AttributionTouch {
  touchId: string;
  timestamp: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landingPath: string;
  channel: AcquisitionChannel;
}

export interface AttributionSnapshot {
  policyVersion: string;
  firstTouch: AttributionTouch | null;
  entryTouch: AttributionTouch | null;
  orderSnapshot: AttributionTouch | null;
  channel: AcquisitionChannel;
  isPaidVerified: boolean;
  provenance:
    | "paid_medium"
    | "ad_platform_id_verified"
    | "social_unverified_paid"
    | "organic_inferred";
}

/**
 * Shared acquisition channel classifier.
 *
 * Rules:
 * - Google CPC: `gclid` present or source contains "google" with medium matching cpc/paid.
 * - Meta Paid: Source matches facebook/meta/instagram AND medium matches cpc/paid/paid_social,
 *   or explicit campaign contains "paid".
 * - Organic Social: Source matches facebook/meta/instagram WITHOUT paid medium/campaign,
 *   OR `fbclid` alone without paid medium/campaign. `fbclid` alone is explicitly classified
 *   as "Organic Social" with provenance "social_unverified_paid", NEVER silently Direct or verified paid.
 * - Organic Search: Referrer from google/bing/duckduckgo/yahoo without paid tags.
 * - Referral: External referrer without search or paid attribution.
 * - Direct: No referrer, no UTM parameters, no click IDs.
 * - Unattributed: Unclassifiable or corrupt input.
 */
export function classifyAcquisitionChannel(params: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}): {
  channel: AcquisitionChannel;
  isPaidVerified: boolean;
  provenance: AttributionSnapshot["provenance"];
} {
  const source = (params.utmSource || "").trim().toLowerCase();
  const medium = (params.utmMedium || "").trim().toLowerCase();
  const campaign = (params.utmCampaign || "").trim().toLowerCase();
  const gclid = (params.gclid || "").trim();
  const fbclid = (params.fbclid || "").trim();
  const referrer = (params.referrer || "").trim().toLowerCase();

  const isPaidMedium =
    medium === "cpc" ||
    medium === "paid" ||
    medium === "paid_social" ||
    medium === "paidsocial" ||
    medium === "display" ||
    medium === "ppc" ||
    medium === "sem";

  // 1. Google Paid
  if (gclid.length > 0) {
    return {
      channel: "Google CPC",
      isPaidVerified: true,
      provenance: "ad_platform_id_verified",
    };
  }
  if (source.includes("google") && isPaidMedium) {
    return {
      channel: "Google CPC",
      isPaidVerified: true,
      provenance: "paid_medium",
    };
  }

  // 2. Meta / Social Paid vs Unverified Social
  const isMetaSource =
    source.includes("facebook") ||
    source.includes("meta") ||
    source.includes("instagram") ||
    source.includes("ig");

  const hasPaidCampaign = campaign.includes("paid") || campaign.includes("cpc");

  if (isMetaSource && (isPaidMedium || hasPaidCampaign)) {
    return {
      channel: "Meta Paid",
      isPaidVerified: true,
      provenance: "paid_medium",
    };
  }

  if (fbclid.length > 0) {
    // fbclid alone without paid medium or campaign is UNVERIFIED paid social
    return {
      channel: "Organic Social",
      isPaidVerified: false,
      provenance: "social_unverified_paid",
    };
  }

  if (isMetaSource) {
    return {
      channel: "Organic Social",
      isPaidVerified: false,
      provenance: "organic_inferred",
    };
  }

  // 3. Search Engines (Organic)
  if (
    referrer.includes("google.") ||
    referrer.includes("bing.") ||
    referrer.includes("duckduckgo.") ||
    referrer.includes("search.yahoo.")
  ) {
    return {
      channel: "Organic Search",
      isPaidVerified: false,
      provenance: "organic_inferred",
    };
  }

  // 4. Other Social Referrers
  if (
    referrer.includes("instagram.com") ||
    referrer.includes("facebook.com") ||
    referrer.includes("t.co") ||
    referrer.includes("twitter.com") ||
    referrer.includes("linkedin.com") ||
    referrer.includes("pinterest.com")
  ) {
    return {
      channel: "Organic Social",
      isPaidVerified: false,
      provenance: "organic_inferred",
    };
  }

  // 5. Generic Referral
  if (referrer.length > 0 && !referrer.includes("sendmynotes.com") && !referrer.includes("localhost")) {
    return {
      channel: "Referral",
      isPaidVerified: false,
      provenance: "organic_inferred",
    };
  }

  // 6. Direct
  if (
    source.length === 0 &&
    medium.length === 0 &&
    campaign.length === 0 &&
    gclid.length === 0 &&
    fbclid.length === 0 &&
    referrer.length === 0
  ) {
    return {
      channel: "Direct",
      isPaidVerified: false,
      provenance: "organic_inferred",
    };
  }

  return {
    channel: "Unattributed",
    isPaidVerified: false,
    provenance: "organic_inferred",
  };
}

// ============================================================================
// Contract 4: Offer Lifecycle, Quotes, Reservations & Redemptions
// ============================================================================

export const LEGACY_OFFER_URL_PARAMS = ["discount", "code", "promo"] as const;

export type OfferLifecycleStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "exhausted"
  | "expired"
  | "archived";

export interface OfferVersionRecord {
  offerId: string;
  version: number;
  code: string;
  purpose: string;
  campaignId?: string;
  destinationPath: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number; // percentage (1-100) or cents
  startsAt?: number;
  endsAt?: number;
  timezone: string;
  status: OfferLifecycleStatus;
  maxUses?: number;
  usedCount: number;
  reservedCount: number;
  dollarBudgetLimitCents?: number;
  totalDiscountGivenCents: number;
  perCustomerLimit?: number;
  stackingAllowed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface OfferPriceQuoteSnapshot {
  quoteId: string;
  offerId: string;
  offerVersion: number;
  code: string;
  basePriceCents: number;
  discountAmountCents: number;
  payableAmountCents: number;
  issuedAt: number;
  expiresAt: number;
  isStale: boolean;
  currency: string;
}

export interface OfferReservationRecord {
  reservationId: string;
  offerId: string;
  offerVersion: number;
  orderId: string;
  sessionId?: string;
  quoteId?: string;
  reservedAt: number;
  expiresAt: number;
  status: "active" | "consumed" | "released" | "expired";
  releasedReason?: string;
}

export interface OfferRedemptionRecord {
  redemptionId: string;
  offerId: string;
  offerVersion: number;
  orderId: string;
  commercialKind: CommercialKind;
  quoteId: string;
  discountAmountCents: number;
  payableAmountCents: number;
  verifiedCaptureId?: string;
  redeemedAt: number;
  refunded: boolean;
  refundRestoredUsage: boolean;
}

// ============================================================================
// Contract 5: Evidence & Drilldown Response, Cursors & Operational Exceptions
// ============================================================================

export interface PaginationCursor {
  limit: number;
  cursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

export interface EvidenceDrilldownQuery {
  metricKey: string;
  scope: GlobalReportScope;
  cursor?: string;
  limit?: number;
  filterCohort?: string;
}

export interface EvidenceDrilldownResponse<T = Record<string, unknown>> {
  metricKey: string;
  asOf: string;
  scope: GlobalReportScope;
  items: T[];
  pagination: PaginationCursor;
  summary: {
    totalMatching: number;
    sampleRate?: number;
  };
}

export interface ExceptionQueueItem {
  id: string;
  category:
    | "payment_mismatch"
    | "paid_fulfillment_failed"
    | "paid_address_deferred"
    | "telemetry_freshness_gap"
    | "historical_unresolved";
  orderId?: string;
  sessionId?: string;
  title: string;
  ageMs: number;
  severity: "critical" | "warning" | "info";
  requiredAction:
    | "investigate_reconciliation"
    | "retry_fulfillment"
    | "await_recipient_address"
    | "rebuild_projections"
    | "audit_founder_test";
  safeActions: string[];
  details: Record<string, unknown>;
}
