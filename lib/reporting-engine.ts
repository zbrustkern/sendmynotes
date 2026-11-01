/**
 * lib/reporting-engine.ts
 *
 * Core reporting engine for the SendMyNotes Admin Overhaul (SPRINT-0004).
 * Reconciles observed cohorts, financial transactions, supplier costs,
 * and acquisition economics into a single bounded, versioned reporting API.
 *
 * References:
 * - docs/sprints/SPRINT-0004.md (T01, T02, T03, T05)
 * - lib/contracts/admin-overhaul.ts (REPORTING_POLICY_VERSION, MetricEnvelope, etc.)
 * - lib/contracts/golden-fixtures.ts (Golden scenarios)
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { readBoundedCollection, readBoundedQuery, boundedCoverage } from "./bounded-admin-read";
import {
  AcquisitionChannel,
  classifyAcquisitionChannel,
  DEFAULT_ADMIN_TIMEZONE,
  EvidenceDrilldownQuery,
  EvidenceDrilldownResponse,
  GlobalReportScope,
  MetricCoverage,
  MetricEnvelope,
  MetricStatus,
  REPORTING_POLICY_VERSION,
  TrafficRole,
  FinancialFactRecord,
  EventV2Envelope,
  SESSION_CONVERSION_HORIZON_MS,
} from "./contracts/admin-overhaul";
import {
  queryDatedSpend,
  querySupplierCostsForOrders,
  computeSpendAndCostCoverage,
  DatedSpendRecord,
  SupplierCostAllocationRecord,
} from "./spend-and-cost-ledger";
import { FINANCIAL_FACTS_COLLECTION } from "./financial-ledger";
import { TELEMETRY_V2_COLLECTION } from "./telemetry-v2";
import { TELEMETRY_COLLECTION } from "./telemetry";

export const REPORTING_PROJECTIONS_COLLECTION = "reporting_projections_v2";

// ----------------------------------------------------------------------------
// Date & Timezone Utilities (America/Chicago)
// ----------------------------------------------------------------------------

export function formatDateInTimezone(
  timestampMs: number,
  timeZone = DEFAULT_ADMIN_TIMEZONE
): string {
  const d = new Date(timestampMs);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

function localDateBoundaryMs(dateString: string, timeZone: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  let guess = targetUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  // Offset converges in one correction for normal timezone transitions; the
  // second iteration handles offsets changing at the target local midnight.
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = targetUtc - represented;
    guess += delta;
    if (delta === 0) break;
  }
  return guess;
}

function shiftLocalDate(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Converts a local calendar midnight to UTC, including DST offset changes. */
export function startOfCalendarDay(date: string, timezone = DEFAULT_ADMIN_TIMEZONE): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid calendar date");
  const [year, month, day] = date.split("-").map(Number);
  const nominal = Date.UTC(year, month - 1, day);
  let guess = nominal;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(guess).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const adjustment = nominal - represented;
    guess += adjustment;
    if (!adjustment) break;
  }
  return guess;
}
function shiftCalendarDate(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10);
}
export function getWindowBounds(params: { dateRange?: string; from?: number; to?: number; fromDate?: string; toDate?: string; timezone?: string; nowMs?: number }): { startMs: number; endMs: number; startDate: string; endDate: string; label: string } {
  const tz = params.timezone || DEFAULT_ADMIN_TIMEZONE;
  const now = params.nowMs ?? Date.now();
  const today = formatDateInTimezone(now, tz);
  const dateOnly = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  let start: number, end: number, label: string;
  if ((params.fromDate || params.from !== undefined) && (params.toDate || params.to !== undefined)) {
    start = dateOnly(params.fromDate) ? startOfCalendarDay(params.fromDate!, tz) : params.fromDate ? Date.parse(params.fromDate) : params.from!;
    // Calendar date UI has an inclusive final date; timestamp API windows remain half-open.
    end = dateOnly(params.toDate) ? startOfCalendarDay(shiftCalendarDate(params.toDate!, 1), tz) : params.toDate ? Date.parse(params.toDate) : params.to!;
    label = "Custom";
  } else {
    const range = (params.dateRange || "oct13").toLowerCase();
    end = now + 1; // Include observations stamped in the current millisecond.
    switch (range) {
      case "all": start = 0; label = "All time"; break;
      case "today": start = startOfCalendarDay(today, tz); label = "Today"; break;
      case "yesterday": start = startOfCalendarDay(shiftCalendarDate(today, -1), tz); end = startOfCalendarDay(today, tz); label = "Yesterday"; break;
      case "7d": case "last7": start = startOfCalendarDay(shiftCalendarDate(today, -6), tz); label = "Last 7 days"; break;
      case "30d": start = startOfCalendarDay(shiftCalendarDate(today, -29), tz); label = "Last 30 days"; break;
      default: start = startOfCalendarDay("2026-10-13", tz); label = "Since October 13";
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Invalid report window");
  return { startMs: start, endMs: end, startDate: formatDateInTimezone(start, tz), endDate: formatDateInTimezone(Math.max(start, end - 1), tz), label };
}
export function isTimestampInScopeWindow(timestampMs: number, _scope: GlobalReportScope, bounds: { startMs: number; endMs: number }): boolean {
  return Number.isFinite(timestampMs) && timestampMs >= bounds.startMs && timestampMs < bounds.endMs;
}

// ----------------------------------------------------------------------------
// Metric Envelope Builder
// ----------------------------------------------------------------------------

export function buildMetricEnvelope<T>(params: {
  value: T;
  scope: GlobalReportScope;
  source: string;
  status: MetricStatus;
  coverage: MetricCoverage;
  numerator?: number;
  denominator?: number;
  exclusions?: Record<string, number>;
  provisional?: boolean;
}): MetricEnvelope<T> {
  return {
    value: params.value,
    definitionVersion: REPORTING_POLICY_VERSION,
    asOf: new Date().toISOString(),
    window: params.scope.window,
    timezone: params.scope.timezone || DEFAULT_ADMIN_TIMEZONE,
    filters: params.scope,
    source: params.source,
    coverage: params.coverage,
    status: params.status,
    numerator: params.numerator,
    denominator: params.denominator,
    exclusions: params.exclusions,
    provisional: params.provisional,
  };
}

// ----------------------------------------------------------------------------
// Internal Session Aggregation Model
// ----------------------------------------------------------------------------

export interface EvaluatedSession {
  sessionId: string;
  anonymousId?: string;
  journeyId?: string;
  trafficRole: TrafficRole;
  entryAt?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  channel: AcquisitionChannel;
  campaign?: string;
  deviceCategory: "mobile" | "desktop" | "tablet" | "all";
  route: string;
  experienceVersion?: string;
  observedMilestones: Set<string>;
  paidOrders: Array<{
    orderId: string;
    amountCents: number;
    capturedAt: number;
    fulfillmentStatus?: string;
    isDeferredAddress?: boolean;
    supplierCostCents?: number | null;
  }>;
  isActive: boolean;
}

// ----------------------------------------------------------------------------
// Reporting Overview Interface
// ----------------------------------------------------------------------------

export interface CampaignSummaryRow {
  channel: string;
  campaign: string;
  sessions: number;
  paidSessions: number;
  paidOrders: number;
  capturedRevenueCents: number;
  datedSpendCents: number | null;
  supplierCostCents: number | null;
  cacCents: number | null;
  roas: number | null;
  spendStatus: MetricStatus;
  costStatus: MetricStatus;
  cacStatus: MetricStatus;
}

export interface FunnelStageMetric {
  stageKey: string;
  label: string;
  observedCount: number;
  dropOffCount: number | null;
  conversionRateFromEntry: number | null;
  conversionRateFromPrevious: number | null;
}

export interface ExecutiveReportingOverview {
  definitionVersion: string;
  financialFactIds?: string[];
  asOf: string;
  storage: {
    adapterType: "firestore_bounded_sample";
    sourceTruncated?: boolean;
    readLimit?: number;
    cloudWarehouseStatus: "not_provisioned";
    maxQueryWindowDays: number;
    projectionVersion: string;
  };
  scope: GlobalReportScope;
  summaryMetrics: {
    verifiedCapturedRevenue: MetricEnvelope<number>;
    netReceipts: MetricEnvelope<number>;
    refundedAmount: MetricEnvelope<number>;
    totalSessions: MetricEnvelope<number>;
    paidSessionsCount: MetricEnvelope<number>;
    paidOrdersCount: MetricEnvelope<number>;
    sessionConversionRate: MetricEnvelope<number | null>;
    orderConversionRate: MetricEnvelope<number | null>;
    averageOrderValueCents: MetricEnvelope<number | null>;
    datedAdSpendCents: MetricEnvelope<number | null>;
    blendedCacCents: MetricEnvelope<number | null>;
    supplierCostCents: MetricEnvelope<number | null>;
    contributionMarginPercent: MetricEnvelope<number | null>;
  };
  funnel: {
    stages: FunnelStageMetric[];
    branching: {
      addressConfirmedCount: number;
      addressDeferredCount: number;
      activeSessionsCount: number;
      draftResumedCount: number;
    };
  };
  campaigns: CampaignSummaryRow[];
  recentSessions: Array<{
    sessionId: string;
    anonymousId?: string;
    entryAt?: number;
    firstSeenAt: number;
    lastSeenAt: number;
    trafficRole: TrafficRole;
    channel: string;
    deviceCategory: string;
    milestones: string[];
    isPaid: boolean;
    paidOrdersCount: number;
    revenueCents: number;
    isActive: boolean;
  }>;
  unmatchedFinancialFacts: Array<{
    factId: string;
    providerObjectId: string;
    amountCents: number;
    occurredAt: number;
    reason: string;
  }>;
  operationalExceptions: Array<{
    id: string;
    category: string;
    severity: string;
    orderId?: string;
    title: string;
    ageMs: number;
  }>;
}

// ----------------------------------------------------------------------------
// Core Evaluation Engine
// ----------------------------------------------------------------------------

export async function evaluateCohortAndFunnelReport(params: {
  scope: GlobalReportScope;
  sessionLimit?: number;
  sessionOffset?: number;
}): Promise<ExecutiveReportingOverview> {
  const { scope } = params;
  const now = Date.now();
  const sessionLimit = params.sessionLimit ?? 50;
  const sessionOffset = params.sessionOffset ?? 0;

  const bounds = getWindowBounds({
    dateRange: scope.window.label,
    fromDate: scope.window.start || undefined,
    toDate: scope.window.end || undefined,
    from: scope.window.start ? new Date(scope.window.start).getTime() : undefined,
    to: scope.window.end ? new Date(scope.window.end).getTime() : undefined,
    timezone: scope.timezone,
  });
  const { startMs, endMs, startDate, endDate } = bounds;

  // 1. Fetch Financial Facts
  const financialFactsSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const historicalCaptures: FinancialFactRecord[] = [];
  const allCaptures: FinancialFactRecord[] = [];
  const allRefunds: FinancialFactRecord[] = [];
  const allDisputes: FinancialFactRecord[] = [];
  let missingEnvironmentEvents = 0;

  financialFactsSnapshot.forEach((doc) => {
    const data = doc.data() as FinancialFactRecord;
    if (!data || !data.occurredAt || data.currency?.toLowerCase() !== "usd") return;
    if (scope.environment === "production" && data.livemode !== true) return;
    if (scope.environment && scope.environment !== "production" && data.livemode === true) return;

    if (data.factType === "capture") historicalCaptures.push(data);
    if (!isTimestampInScopeWindow(data.occurredAt, scope, bounds)) return;
    if (data.factType === "capture") {
      allCaptures.push(data);
    } else if (data.factType === "refund") {
      allRefunds.push(data);
    } else if (data.factType === "dispute") {
      allDisputes.push(data);
    }
  });

  // Map captures by orderId
  const capturesByOrderId = new Map<string, FinancialFactRecord>();
  const unmatchedCaptures: FinancialFactRecord[] = [];

  for (const cap of allCaptures) {
    if (cap.orderId && cap.orderId.trim().length > 0) {
      capturesByOrderId.set(cap.orderId, cap);
    } else {
      unmatchedCaptures.push(cap);
    }
  }

  // 2. Fetch Orders for Status & Fulfillment
  const ordersSnapshot = await readBoundedCollection(firestoreDb.collection("orders"));
  const ordersMap = new Map<string, any>();
  const orderSessionMap = new Map<string, string>(); // orderId -> sessionId

  ordersSnapshot.forEach((doc) => {
    const order = doc.data() as any;
    if (!order) return;
    const orderId = doc.id || order.id || order.orderId;
    if (!orderId) return;

    ordersMap.set(orderId, order);
    const sId = order.sessionId || order.visitorSessionId || order.metadata?.sessionId;
    if (sId) {
      orderSessionMap.set(orderId, sId);
    }
  });

  // 3. Fetch Telemetry Events V2
  const telemetryV2Snapshot = await readBoundedCollection(firestoreDb.collection(TELEMETRY_V2_COLLECTION));
  const sessionsMap = new Map<string, EvaluatedSession>();
  let legacyTruncated = false;

  // Firestore document order is not event chronology. Select acquisition context
  // from the earliest observed event, regardless of delivery/document ordering.
  telemetryV2Snapshot.docs.slice().sort((a, b) => (a.data().occurred_at || 0) - (b.data().occurred_at || 0)).forEach((doc) => {
    const env = doc.data() as EventV2Envelope;
    if (!env || !env.occurred_at) return;
    // Window check
    if (!isTimestampInScopeWindow(env.occurred_at, scope, bounds)) return;
    if (!env.environment) missingEnvironmentEvents++;
    if (scope.environment && env.environment !== scope.environment) return;

    // Traffic Role check
    const role: TrafficRole = env.classification?.role || "customer";
    if (scope.excludeFounder && role === "founder") {
      return;
    }
    if (scope.mode === "customer_reporting" && role !== "customer") {
      return;
    }

    const sessionId = env.session_id || `anon_sess_${doc.id}`;
    let sess = sessionsMap.get(sessionId);

    if (!sess) {
      // Classify acquisition channel
      const props = (env.properties as Record<string, any>) || {};
      const channelInfo = classifyAcquisitionChannel({
        utmSource: props.utmSource || props.utm_source,
        utmMedium: props.utmMedium || props.utm_medium,
        utmCampaign: props.utmCampaign || props.utm_campaign,
        gclid: props.gclid,
        fbclid: props.fbclid,
        referrer: props.referrer,
      });

      // Device category
      let deviceCat: "mobile" | "desktop" | "tablet" | "all" = ["mobile", "desktop", "tablet"].includes(props.device_category) ? props.device_category : "all";
      const ua = (props.userAgent || "").toLowerCase();
      if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
        deviceCat = "mobile";
      } else if (ua.includes("tablet") || ua.includes("ipad")) {
        deviceCat = "tablet";
      }

      sess = {
        sessionId,
        anonymousId: env.anonymous_id,
        journeyId: env.journey_id,
        trafficRole: role,
        firstSeenAt: env.occurred_at,
        lastSeenAt: env.occurred_at,
        channel: props.attribution_observed || props.utmSource || props.utm_source || props.referrer ? channelInfo.channel : "Unattributed",
        campaign: props.utmCampaign || props.utm_campaign,
        deviceCategory: deviceCat,
        route: env.route_template || "/",
        experienceVersion: env.experience_version,
        observedMilestones: new Set<string>(),
        paidOrders: [],
        isActive: false,
      };
      sessionsMap.set(sessionId, sess);
    }

    if (env.event_name === "entry_viewed" || env.event_name === "landing_viewed") sess.entryAt = Math.min(sess.entryAt ?? Infinity, env.occurred_at);
    sess.firstSeenAt = Math.min(sess.firstSeenAt, env.occurred_at);
    sess.lastSeenAt = Math.max(sess.lastSeenAt, env.occurred_at);
    sess.observedMilestones.add(env.event_name);

    if (now - env.occurred_at < 5 * 60 * 1000) {
      sess.isActive = true;
    }

    // Link order if event contains orderId
    if (env.order_id) {
      orderSessionMap.set(env.order_id, sessionId);
    }
  });

  // Fallback: If telemetry_events_v2 is empty (e.g. legacy test records in telemetry_events)
  if (sessionsMap.size === 0) {
    const legacySnap = await readBoundedCollection(firestoreDb.collection(TELEMETRY_COLLECTION));
    legacyTruncated = legacySnap.truncated;
    legacySnap.forEach((doc) => {
      const leg = doc.data() as any;
      if (!leg || !leg.timestamp) return;
      if (scope.environment) {
        missingEnvironmentEvents++;
        return;
      }
      if (!isTimestampInScopeWindow(leg.timestamp, scope, bounds)) return;

      const isFounder = Boolean(leg.isFounder ?? leg.is_founder);
      if (scope.excludeFounder && isFounder) return;

      const sessionId = leg.sessionId || `leg_sess_${doc.id}`;
      let sess = sessionsMap.get(sessionId);
      if (!sess) {
        sess = {
          sessionId,
          trafficRole: isFounder ? "founder" : "customer",
          firstSeenAt: leg.timestamp,
          lastSeenAt: leg.timestamp,
          channel: "Direct",
          deviceCategory: "desktop",
          route: leg.path || "/",
          observedMilestones: new Set<string>(),
          paidOrders: [],
          isActive: false,
        };
        sessionsMap.set(sessionId, sess);
      }
      sess.observedMilestones.add(leg.eventName);
      if (leg.orderId) {
        orderSessionMap.set(leg.orderId, sessionId);
      }
    });
  }

  // 4. Link Verified Paid Orders to Sessions
  const hasCohortFilter = Boolean(
    (scope.channel && scope.channel !== "all") ||
    (scope.deviceCategory && scope.deviceCategory !== "all") ||
    scope.experienceVersion
  );
  const channelMatches = (channel: string, requested?: string) => {
    if (!requested || requested === "all") return true;
    const value = channel.toLowerCase();
    if (requested === "paid") return value.includes("paid") || value.includes("cpc");
    if (requested === "google_cpc") return value.includes("google");
    if (requested === "meta_paid") return value.includes("meta") || value.includes("facebook");
    if (requested === "organic_direct") return !value.includes("paid") && !value.includes("cpc");
    return value === requested.toLowerCase();
  };
  for (const [sessionId, session] of sessionsMap) {
    if (
      !channelMatches(session.channel, scope.channel) ||
      (scope.deviceCategory && scope.deviceCategory !== "all" && session.deviceCategory !== scope.deviceCategory) ||
      (scope.experienceVersion && session.experienceVersion !== scope.experienceVersion)
    ) {
      sessionsMap.delete(sessionId);
    }
  }

  // Keep payment facts aligned with the filtered cohort. A payment lacking session
  // attribution cannot safely be assigned to a channel/device/experience slice.
  const isCustomerFact = (fact: FinancialFactRecord) =>
    fact.commercialKind === "paid_customer" || fact.commercialKind === "discounted_paid";
  const matchesCohort = (fact: FinancialFactRecord) => {
    if (!hasCohortFilter) return true;
    const sessionId = orderSessionMap.get(fact.orderId);
    return Boolean(sessionId && sessionsMap.has(sessionId));
  };
  const eligibleHistory = historicalCaptures.filter((fact) =>
    (scope.mode !== "customer_reporting" || isCustomerFact(fact)) && matchesCohort(fact));
  const eligibleHistoricalOrders = new Set(eligibleHistory.map((fact) => fact.orderId).filter(Boolean));
  const eligibleHistoricalProviders = new Set(eligibleHistory.map((fact) => fact.providerObjectId));
  allCaptures.splice(0, allCaptures.length, ...allCaptures.filter((fact) =>
    (scope.mode !== "customer_reporting" || isCustomerFact(fact)) && matchesCohort(fact)));
  allRefunds.splice(0, allRefunds.length, ...allRefunds.filter((refund) => {
    const linked = eligibleHistoricalOrders.has(refund.orderId) ||
      eligibleHistoricalProviders.has((refund as FinancialFactRecord & { paymentIntentId?: string }).paymentIntentId || refund.providerObjectId);
    // Transaction-period refunds remain visible even when the purchase predates
    // the window. Unattributed refunds cannot be assigned to a filtered cohort.
    return hasCohortFilter ? linked : scope.mode !== "customer_reporting" || isCustomerFact(refund) || linked;
  }));

  const allOrderIds: string[] = [];
  const operationalExceptions: Array<{
    id: string;
    category: string;
    severity: string;
    orderId?: string;
    title: string;
    ageMs: number;
  }> = [];

  for (const cap of allCaptures) {
    // Only customer commercialKind or unresolved if in operational_all
    if (scope.mode === "customer_reporting") {
      if (cap.commercialKind !== "paid_customer" && cap.commercialKind !== "discounted_paid") {
        continue;
      }
    }

    const orderId = cap.orderId;
    allOrderIds.push(orderId);
    const orderDoc = ordersMap.get(orderId);

    const isDeferred = orderDoc?.status === "AWAITING_RECIPIENT_ADDRESS";
    const uncertainSubmission = orderDoc?.status === "DISPATCH_UNCERTAIN";
    const fulfillmentFailed = uncertainSubmission || orderDoc?.fulfillmentStatus === "FAILED" || orderDoc?.status === "FAILED" || orderDoc?.status === "FULFILLMENT_FAILED" || Boolean(orderDoc?.fulfillmentError);

    if (fulfillmentFailed) {
      operationalExceptions.push({
        id: `exc_${orderId}_fulfillment_failed`,
        category: "paid_fulfillment_failed",
        severity: "critical",
        orderId,
        title: uncertainSubmission ? `Supplier outcome unknown for ${orderId}; reconcile before retry` : `Captured order ${orderId} failed supplier fulfillment`,
        ageMs: now - cap.occurredAt,
      });
    }

    // Link to session
    const sId = orderSessionMap.get(orderId);
    if (sId && sessionsMap.has(sId)) {
      const sess = sessionsMap.get(sId)!;
      sess.paidOrders.push({
        orderId,
        amountCents: cap.amountCents,
        capturedAt: cap.occurredAt,
        fulfillmentStatus: orderDoc?.fulfillmentStatus,
        isDeferredAddress: isDeferred,
        supplierCostCents: cap.supplierCostCents,
      });
      sess.observedMilestones.add("payment_captured");
    } else {
      // If payment has no linked session, record as an attribution gap exception
      operationalExceptions.push({
        id: `exc_${orderId}_attribution_gap`,
        category: "attribution_gap",
        severity: "info",
        orderId,
        title: `Captured order ${orderId} has no linked visitor session`,
        ageMs: now - cap.occurredAt,
      });
    }
  }

  // 5. Spend & Cost Queries
  const spendCoverage = await computeSpendAndCostCoverage({
    orderIds: allOrderIds,
    startDate,
    endDate,
    channels: scope.channel && scope.channel !== "all" ?
      ["Google CPC", "Meta Paid", "Organic Search", "Organic Social", "Referral", "Direct", "Unattributed"].filter((channel) => channelMatches(channel, scope.channel)) : undefined,
  });
  // Spend has no device or experience allocation. Do not divide total spend by
  // a filtered subcohort and present the result as that subcohort's CAC.
  if ((scope.deviceCategory && scope.deviceCategory !== "all") || scope.experienceVersion) {
    spendCoverage.datedSpend.status = "unavailable";
  }

  const supplierCostMap = await querySupplierCostsForOrders(allOrderIds);

  // 6. Aggregate Financial Truth
  let verifiedCapturedCents = 0;
  for (const cap of allCaptures) {
    if (scope.mode === "customer_reporting") {
      if (cap.commercialKind === "paid_customer" || cap.commercialKind === "discounted_paid") {
        verifiedCapturedCents += cap.amountCents;
      }
    } else {
      verifiedCapturedCents += cap.amountCents;
    }
  }

  let refundedCents = 0;
  for (const ref of allRefunds) {
    refundedCents += ref.amountCents;
  }

  const netReceiptsCents = verifiedCapturedCents - refundedCents;

  // 7. Aggregate Full-Cohort Metrics
  const allSessionsList = Array.from(sessionsMap.values());
  const totalSessionsCount = allSessionsList.length;

  let paidSessionsCount = 0;
  const paidOrdersCount = new Set(allCaptures.filter((fact) => fact.amountCents > 0).map((fact) => fact.orderId || fact.providerObjectId)).size;

  for (const s of allSessionsList) {
    if (s.paidOrders.length > 0) {
      paidSessionsCount++;

    }
  }

  // 8. Funnel Aggregation (Observed Milestones ONLY - NO superset propagation)
  let entryCount = 0;
  let coverSelectedCount = 0;
  let noteConfirmedCount = 0;
  let addressConfirmedCount = 0;
  let addressDeferredCount = 0;
  let checkoutInitiatedCount = 0;
  let paidMilestoneCount = 0;
  let draftResumedCount = 0;
  let activeSessionsCount = 0;

  for (const s of allSessionsList) {
    if (s.isActive) activeSessionsCount++;
    if (s.observedMilestones.has("entry_viewed") || s.observedMilestones.has("landing_viewed")) {
      entryCount++;
    }
    if (s.observedMilestones.has("cover_selected") || s.observedMilestones.has("cover_preset_selected")) {
      coverSelectedCount++;
    }
    if (s.observedMilestones.has("note_confirmed") || s.observedMilestones.has("note_completed")) {
      noteConfirmedCount++;
    }
    if (s.observedMilestones.has("address_confirmed") || s.observedMilestones.has("address_completed")) {
      addressConfirmedCount++;
    }
    if (s.observedMilestones.has("address_deferred")) {
      addressDeferredCount++;
    }
    if (s.observedMilestones.has("checkout_requested") || s.observedMilestones.has("checkout_initiated")) {
      checkoutInitiatedCount++;
    }
    if (s.paidOrders.length > 0 || s.observedMilestones.has("payment_captured")) {
      paidMilestoneCount++;
    }
    if (s.observedMilestones.has("draft_resumed")) {
      draftResumedCount++;
    }
  }

  const funnelStages: FunnelStageMetric[] = [
    ["entry", "Entry Viewed", entryCount],
    ["cover_selected", "Cover Selected", coverSelectedCount],
    ["note_confirmed", "Note Confirmed", noteConfirmedCount],
    ["address_confirmed", "Address Ready", allSessionsList.filter((s) =>
      ["address_confirmed", "address_completed", "address_deferred"].some((name) => s.observedMilestones.has(name))).length],
    ["checkout_initiated", "Checkout Initiated", checkoutInitiatedCount],
    ["paid", "Verified Paid", paidMilestoneCount],
  ].map(([stageKey, label, observedCount]) => ({
    stageKey: String(stageKey), label: String(label), observedCount: Number(observedCount),
    // Independent milestone observations do not establish ordered transitions.
    // Leave abandonment/conversion unavailable rather than divide marginal counts.
    dropOffCount: null, conversionRateFromEntry: null, conversionRateFromPrevious: null,
  }));

  // 9. Full-Cohort Campaign Aggregation (Independent of Recent-Sessions Pagination)
  const campaignMap = new Map<string, CampaignSummaryRow>();
  const datedSpendRows = await queryDatedSpend({ startDate, endDate });

  // Index spend by channel + campaign
  const spendByChannelCamp = new Map<string, number>();
  for (const sp of datedSpendRows) {
    const key = `${sp.channel.toLowerCase()}::${(sp.utmCampaign || "_all_").toLowerCase()}`;
    spendByChannelCamp.set(key, (spendByChannelCamp.get(key) || 0) + sp.amountCents);


  }

  // Aggregate sessions into campaigns
  for (const s of allSessionsList) {
    const ch = s.channel || "Unattributed";
    const camp = s.campaign || "none";
    const rowKey = `${ch}::${camp}`;

    let row = campaignMap.get(rowKey);
    if (!row) {
      row = {
        channel: ch,
        campaign: camp,
        sessions: 0,
        paidSessions: 0,
        paidOrders: 0,
        capturedRevenueCents: 0,
        datedSpendCents: null,
        supplierCostCents: null,
        cacCents: null,
        roas: null,
        spendStatus: "unavailable",
        costStatus: "unavailable",
        cacStatus: "unavailable",
      };
      campaignMap.set(rowKey, row);
    }

    row.sessions++;
    if (s.paidOrders.length > 0) {
      row.paidSessions++;
      row.paidOrders += s.paidOrders.length;
      for (const po of s.paidOrders) {
        row.capturedRevenueCents += po.amountCents;

        const alloc = supplierCostMap.get(po.orderId);
        if (alloc) {
          row.supplierCostCents = (row.supplierCostCents || 0) + alloc.totalSupplierCostCents;
          row.costStatus = alloc.isEstimate ? "partial" : "verified";
        }
      }
    }
  }

  // Attach spend and calculate CAC/ROAS per campaign
  const campaignRows = Array.from(campaignMap.values());
  for (const cr of campaignRows) {
    const keyWithCamp = `${cr.channel.toLowerCase()}::${cr.campaign.toLowerCase()}`;
    const keyChanOnly = `${cr.channel.toLowerCase()}::_all_`;

    // Channel-only spend is unallocated, never copied into each campaign.
    const spend = spendByChannelCamp.get(keyWithCamp);

    if (spend !== undefined) {
      cr.datedSpendCents = spend;
      cr.spendStatus = spend > 0 ? "verified" : "verified";
      if (cr.paidOrders > 0) {
        cr.cacCents = Math.round(spend / cr.paidOrders);
        cr.cacStatus = "verified";
      } else {
        cr.cacCents = null;
        cr.cacStatus = "not_applicable";
      }
      if (spend > 0) {
        cr.roas = Number((cr.capturedRevenueCents / spend).toFixed(2));
      }
    } else {
      // AC02: Missing spend NEVER defaults to $0 CAC!
      cr.datedSpendCents = null;
      cr.spendStatus = "unavailable";
      cr.cacCents = null;
      cr.cacStatus = "unavailable";
    }
  }

  // 10. Compute Summary Metric Envelopes
  const totalSpendCents = spendCoverage.datedSpend.totalSpendCents;
  const totalActualSupplierCost = spendCoverage.supplierCost.totalActualCostCents;

  const entrySessions = allSessionsList.filter((session) => session.entryAt !== undefined);
  const entrySessionMap = new Map(entrySessions.map((session) => [session.sessionId, session]));
  const cohortPayments = eligibleHistory.filter((fact) => {
    const session = entrySessionMap.get(orderSessionMap.get(fact.orderId) || "");
    return fact.amountCents > 0 && session?.entryAt !== undefined &&
      fact.occurredAt >= session.entryAt && fact.occurredAt < session.entryAt + SESSION_CONVERSION_HORIZON_MS && fact.occurredAt <= now;
  });
  const cohortPaidSessions = new Set(cohortPayments.map((fact) => orderSessionMap.get(fact.orderId))).size;
  const cohortPaidOrders = new Set(cohortPayments.map((fact) => fact.orderId || fact.providerObjectId)).size;
  const cohortProvisional = entrySessions.some((session) => now < session.entryAt! + SESSION_CONVERSION_HORIZON_MS);
  const sessionConvRateVal = entrySessions.length > 0 ? cohortPaidSessions / entrySessions.length : null;
  const orderConvRateVal = entrySessions.length > 0 ? cohortPaidOrders / entrySessions.length : null;
  const aovCentsVal = paidOrdersCount > 0 ? Math.round(verifiedCapturedCents / paidOrdersCount) : null;

  // Blended CAC (AC02: If spend is unavailable, CAC is null/unavailable)
  let blendedCacVal: number | null = null;
  let blendedCacStatus: MetricStatus = "unavailable";
  if (spendCoverage.datedSpend.status !== "unavailable") {
    if (paidOrdersCount > 0) {
      blendedCacVal = Math.round(totalSpendCents / paidOrdersCount);
      blendedCacStatus = spendCoverage.datedSpend.status;
    } else {
      blendedCacStatus = "not_applicable";
    }
  }

  // Supplier Cost & Contribution Margin (AC02: Never defaults to 39.6% if cost is unknown)
  let supplierCostVal: number | null = null;
  let contributionMarginVal: number | null = null;
  let marginStatus: MetricStatus = "unavailable";

  if (spendCoverage.supplierCost.ordersWithVerifiedInvoice > 0) {
    supplierCostVal = totalActualSupplierCost;
    const feesComplete = allCaptures.length > 0 && allCaptures.every((fact) =>
      typeof fact.stripeFeeCents === "number" && Number.isFinite(fact.stripeFeeCents));
    const supplierComplete = spendCoverage.supplierCost.status === "verified" &&
      spendCoverage.supplierCost.ordersWithVerifiedInvoice === paidOrdersCount;
    // Contribution after acquisition needs complete actual supplier costs,
    // processor fees, refunds and dated spend. Missing costs never become zero.
    if (verifiedCapturedCents > 0 && feesComplete && supplierComplete &&
        spendCoverage.datedSpend.status === "verified") {
      const fees = allCaptures.reduce((sum, fact) => sum + fact.stripeFeeCents!, 0);
      const contribution = netReceiptsCents - fees - totalActualSupplierCost - totalSpendCents;
      contributionMarginVal = Number(((contribution / verifiedCapturedCents) * 100).toFixed(1));
      marginStatus = "verified";
    }
  }

  const scopeCoverage: MetricCoverage = {
    observedCount: totalSessionsCount,
    totalEligibleCount: totalSessionsCount + missingEnvironmentEvents,
    unresolvedCount: unmatchedCaptures.length + missingEnvironmentEvents,
    coverageRatio: totalSessionsCount + missingEnvironmentEvents > 0
      ? totalSessionsCount / (totalSessionsCount + missingEnvironmentEvents)
      : null,
    notes: missingEnvironmentEvents > 0
      ? [`${missingEnvironmentEvents} legacy or untagged telemetry records were excluded because environment could not be verified.`]
      : undefined,
  };
  const environmentCoverageStatus: MetricStatus = missingEnvironmentEvents > 0 ? "partial" : "verified";

  const summaryMetrics = {
    verifiedCapturedRevenue: buildMetricEnvelope<number>({
      value: verifiedCapturedCents,
      scope,
      source: "financial_facts",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    netReceipts: buildMetricEnvelope<number>({
      value: netReceiptsCents,
      scope,
      source: "financial_facts",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    refundedAmount: buildMetricEnvelope<number>({
      value: refundedCents,
      scope,
      source: "financial_facts",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    totalSessions: buildMetricEnvelope<number>({
      value: totalSessionsCount,
      scope,
      source: "telemetry_events_v2",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    paidSessionsCount: buildMetricEnvelope<number>({
      value: paidSessionsCount,
      scope,
      source: "financial_facts+telemetry_events_v2",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    paidOrdersCount: buildMetricEnvelope<number>({
      value: paidOrdersCount,
      scope,
      source: "financial_facts",
      status: environmentCoverageStatus,
      coverage: scopeCoverage,
    }),
    sessionConversionRate: buildMetricEnvelope<number | null>({
      value: sessionConvRateVal,
      scope,
      source: "derived_cohort",
      status: sessionConvRateVal !== null ? (cohortProvisional ? "partial" : environmentCoverageStatus) : "unavailable",
      provisional: cohortProvisional,
      numerator: cohortPaidSessions,
      denominator: entrySessions.length,
      coverage: scopeCoverage,
    }),
    orderConversionRate: buildMetricEnvelope<number | null>({
      value: orderConvRateVal,
      scope,
      source: "derived_cohort",
      status: orderConvRateVal !== null ? (cohortProvisional ? "partial" : environmentCoverageStatus) : "unavailable",
      provisional: cohortProvisional,
      numerator: cohortPaidOrders,
      denominator: entrySessions.length,
      coverage: scopeCoverage,
    }),
    averageOrderValueCents: buildMetricEnvelope<number | null>({
      value: aovCentsVal,
      scope,
      source: "derived_cohort",
      status: aovCentsVal !== null ? "verified" : "unavailable",
      numerator: verifiedCapturedCents,
      denominator: paidOrdersCount,
      coverage: scopeCoverage,
    }),
    datedAdSpendCents: buildMetricEnvelope<number | null>({
      value: spendCoverage.datedSpend.status !== "unavailable" ? totalSpendCents : null,
      scope,
      source: "dated_spend_ledger",
      status: spendCoverage.datedSpend.status,
      coverage: {
        observedCount: spendCoverage.datedSpend.daysCovered,
        totalEligibleCount: spendCoverage.datedSpend.totalDaysInWindow,
        unresolvedCount: 0,
        coverageRatio: spendCoverage.datedSpend.coverageRatio,
      },
    }),
    blendedCacCents: buildMetricEnvelope<number | null>({
      value: blendedCacVal,
      scope,
      source: "derived_economics",
      status: blendedCacStatus,
      coverage: scopeCoverage,
    }),
    supplierCostCents: buildMetricEnvelope<number | null>({
      value: supplierCostVal,
      scope,
      source: "supplier_cost_allocations",
      status: spendCoverage.supplierCost.status,
      coverage: {
        observedCount: spendCoverage.supplierCost.ordersWithVerifiedInvoice,
        totalEligibleCount: spendCoverage.supplierCost.totalOrdersEvaluated,
        unresolvedCount: spendCoverage.supplierCost.ordersWithMissingCost,
        coverageRatio: spendCoverage.supplierCost.coverageRatio,
      },
    }),
    contributionMarginPercent: buildMetricEnvelope<number | null>({
      value: contributionMarginVal,
      scope,
      source: "derived_economics",
      status: marginStatus,
      coverage: scopeCoverage,
    }),
  };

  // 11. Paginated Recent Sessions for UI Table
  const sortedSessions = allSessionsList.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const pagedSessions = sortedSessions.slice(sessionOffset, sessionOffset + sessionLimit);

  const recentSessionsOut = pagedSessions.map((s) => ({
    sessionId: s.sessionId,
    anonymousId: s.anonymousId,
    firstSeenAt: s.firstSeenAt,
    lastSeenAt: s.lastSeenAt,
    trafficRole: s.trafficRole,
    channel: s.channel,
    deviceCategory: s.deviceCategory,
    milestones: Array.from(s.observedMilestones),
    isPaid: s.paidOrders.length > 0,
    paidOrdersCount: s.paidOrders.length,
    revenueCents: s.paidOrders.reduce((acc, po) => acc + po.amountCents, 0),
    isActive: s.isActive,
  }));

  const unmatchedFactsOut = unmatchedCaptures.map((u) => ({
    factId: u.factId,
    providerObjectId: u.providerObjectId,
    amountCents: u.amountCents,
    occurredAt: u.occurredAt,
    reason: "No orderId linked on payment fact",
  }));

  const sourceTruncated = financialFactsSnapshot.truncated || ordersSnapshot.truncated || telemetryV2Snapshot.truncated || legacyTruncated || supplierCostMap.sourceCoverage?.complete === false;
  if (sourceTruncated) {
    for (const metric of Object.values(summaryMetrics)) {
      if (metric.status === "verified") metric.status = "partial";
      metric.coverage = { ...metric.coverage, coverageRatio: null };
    }
    for (const campaign of campaignRows) {
      if (campaign.spendStatus === "verified") campaign.spendStatus = "partial";
      if (campaign.costStatus === "verified") campaign.costStatus = "partial";
      if (campaign.cacStatus === "verified") campaign.cacStatus = "partial";
    }
  }
  return {
    definitionVersion: REPORTING_POLICY_VERSION,
    asOf: new Date().toISOString(),
    storage: {
      adapterType: "firestore_bounded_sample",
      sourceTruncated,
      readLimit: financialFactsSnapshot.readLimit,
      cloudWarehouseStatus: "not_provisioned",
      maxQueryWindowDays: 90,
      projectionVersion: REPORTING_POLICY_VERSION,
    },
    scope,
    summaryMetrics,
    financialFactIds: [...allCaptures, ...allRefunds].map((fact) => fact.factId),
    funnel: {
      stages: funnelStages,
      branching: {
        addressConfirmedCount,
        addressDeferredCount,
        activeSessionsCount,
        draftResumedCount,
      },
    },
    campaigns: campaignRows,
    recentSessions: recentSessionsOut,
    unmatchedFinancialFacts: unmatchedFactsOut,
    operationalExceptions,
  };
}

// ----------------------------------------------------------------------------
// Metric Drilldown & Export Parity
// ----------------------------------------------------------------------------

export async function queryReportingDrilldown(
  query: EvidenceDrilldownQuery
): Promise<EvidenceDrilldownResponse> {
  const limit = Math.min(200, Math.max(1, query.limit || 50));
  const offset = query.cursor ? parseInt(query.cursor, 10) : 0;

  const report = await evaluateCohortAndFunnelReport({
    scope: query.scope,
    sessionLimit: 2000,
  });

  let rawItems: any[] = [];

  switch (query.metricKey) {
    case "verified_paid_revenue": {
      // List of individual verified captures
      const capturesSnap = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
      capturesSnap.forEach((doc) => {
        const d = doc.data() as FinancialFactRecord;
        if (d && d.factType === "capture" && report.financialFactIds?.includes(d.factId)) {
          rawItems.push(d);
        }
      });
      break;
    }
    case "paid_sessions": {
      rawItems = report.recentSessions.filter((s) => s.isPaid);
      break;
    }
    case "operational_exceptions": {
      rawItems = report.operationalExceptions;
      break;
    }
    case "campaigns": {
      rawItems = report.campaigns;
      break;
    }
    case "all_sessions":
    default: {
      rawItems = report.recentSessions;
      break;
    }
  }

  const totalMatching = rawItems.length;
  const pagedItems = rawItems.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const hasMore = nextOffset < totalMatching;

  return {
    metricKey: query.metricKey,
    asOf: report.asOf,
    scope: query.scope,
    items: pagedItems,
    pagination: {
      limit,
      cursor: hasMore ? String(nextOffset) : undefined,
      hasMore,
      totalCount: totalMatching,
    },
    summary: {
      totalMatching,
    },
  };
}

// ----------------------------------------------------------------------------
// Analytics-Only Projection Replay
// ----------------------------------------------------------------------------

export async function runAnalyticsProjectionReplay(params?: {
  from?: number;
  to?: number;
  dryRun?: boolean;
}): Promise<{
  success: boolean;
  isReplay: true;
  replayedEventsCount: number;
  replayedSessionsCount: number;
  durationMs: number;
  snapshotId: string;
}> {
  const t0 = Date.now();
  const dryRun = Boolean(params?.dryRun);

  // Analytics replay strictly evaluates data without triggering external effects
  const defaultScope: GlobalReportScope = {
    window: {
      start: params?.from ? new Date(params.from).toISOString() : "2026-10-13T00:00:00Z",
      end: params?.to ? new Date(params.to).toISOString() : new Date().toISOString(),
      label: "replay_cohort",
    },
    timezone: DEFAULT_ADMIN_TIMEZONE,
    mode: "operational_all",
    excludeFounder: false,
  };

  const report = await evaluateCohortAndFunnelReport({
    scope: defaultScope,
    sessionLimit: 500,
  });

  const snapshotId = `replay_${Date.now()}`;

  if (!dryRun) {
    const projectionDoc = {
      snapshotId,
      projectionVersion: REPORTING_POLICY_VERSION,
      replayedAt: Date.now(),
      isReplay: true,
      report,
    };
    const sanitized = sanitizeFirestoreData(projectionDoc);
    await firestoreDb.collection(REPORTING_PROJECTIONS_COLLECTION).doc(snapshotId).set(sanitized);
  }

  return {
    success: true,
    isReplay: true,
    replayedEventsCount: report.summaryMetrics.totalSessions.value || 0,
    replayedSessionsCount: report.summaryMetrics.totalSessions.value || 0,
    durationMs: Date.now() - t0,
    snapshotId,
  };
}
