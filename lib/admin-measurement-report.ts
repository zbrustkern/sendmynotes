import {
  AdminMeasurementReport, ReportChannel, ReportOrderInput, ReportPeriod, ReportRecordMode,
  ReportReconciliationEntry, ReportScope, SourceCoverage, REPORT_TIME_ZONE,
} from "@/lib/contracts/admin-measurement-report";
import { ALLOWED_BROWSER_EVENT_NAMES } from "@/lib/telemetry-schema";

const CHANNELS: ReportChannel[] = ["all", "google_paid", "email", "organic", "social_meta", "referral", "direct", "unknown"];
const PERIODS: ReportPeriod[] = ["today", "last7", "since_oct13", "all", "custom"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidReportScope extends Error {}

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Convert a Chicago wall-clock midnight to UTC by solving against the zone's actual offset.
function chicagoMidnight(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const next = guess + target - represented;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

export function normalizeReportScope(params: URLSearchParams, now = new Date()): ReportScope {
  const allowedKeys = new Set(["period", "channel", "records", "start", "end"]);
  for (const key of params.keys()) if (!allowedKeys.has(key)) throw new InvalidReportScope("Unknown report filter.");
  for (const key of allowedKeys) if (params.getAll(key).length > 1) throw new InvalidReportScope("Duplicate report filter.");
  const rawPeriod = params.get("period") ?? "last7";
  const rawChannel = params.get("channel") ?? "all";
  const rawRecords = params.get("records") ?? "customers";
  if (!PERIODS.includes(rawPeriod as ReportPeriod) || !CHANNELS.includes(rawChannel as ReportChannel) || !["customers", "all"].includes(rawRecords)) {
    throw new InvalidReportScope("Invalid report filter.");
  }
  const period = rawPeriod as ReportPeriod;
  if (period !== "custom" && (params.has("start") || params.has("end"))) throw new InvalidReportScope("Date bounds require a custom period.");
  const today = localDate(now);
  let startDate: string | null = null;
  let endDate: string | null = null;
  if (period === "today") startDate = endDate = today;
  if (period === "last7") { startDate = addDays(today, -6); endDate = today; }
  if (period === "since_oct13") { startDate = "2026-10-13"; endDate = today; }
  if (period === "custom") { startDate = params.get("start"); endDate = params.get("end"); }
  if (period === "all") {
    if (params.has("start") || params.has("end")) throw new InvalidReportScope("All available does not accept custom dates.");
  } else if (!startDate || !endDate || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new InvalidReportScope("Invalid or reversed report dates.");
  }
  return {
    period, startDate, endDate, channel: rawChannel as ReportChannel,
    records: rawRecords as ReportRecordMode,
    startUtc: startDate ? chicagoMidnight(startDate) : null,
    endUtc: endDate ? chicagoMidnight(addDays(endDate, 1)) : null,
  };
}

export function reportScopeKey(scope: ReportScope): string {
  return [scope.period, scope.startDate ?? "*", scope.endDate ?? "*", scope.channel, scope.records].join(":");
}

export function timestampMillis(value: ReportOrderInput["createdAt"]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  if (value && typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

type Classification = "customer" | "founder" | "comp" | "admin" | "unresolved" | "unpaid";
function classification(order: ReportOrderInput, sidecar?: ReportReconciliationEntry): Classification {
  if (order.isFounderTest === true || order.isTest === true || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock" || order.purchaseMeasurement?.reason === "test_payment" || sidecar?.classification === "founder_test") return "founder";
  if (order.isComp === true || order.commercialKind === "studio_comp" || sidecar?.classification === "comp") return "comp";
  if (order.origin === "ADMIN_COMP" || order.commercialKind === "admin_comp_balance" || sidecar?.classification === "admin_origin") return "admin";
  if (sidecar?.classification === "independent_customer") return "customer";
  if (sidecar?.classification === "unresolved") return "unresolved";
  const m = order.purchaseMeasurement;
  if (m && m.version === 1 && m.transactionId === order.id && Number.isFinite(m.verifiedAt) && Number.isInteger(m.amountInCents) && (m.amountInCents ?? 0) > 0 && m.currency === "USD" && ["eligible", "known_refund"].includes(m.reason ?? "") && order.paymentMode !== "stripe_test" && order.paymentMode !== "local_mock" && order.paymentMethod === "STRIPE" && order.stripePaymentId) return "customer";
  return "unresolved";
}

function campaignParts(order: ReportOrderInput) {
  const rawSource = order.attribution?.source || order.source || "unknown";
  const rawMedium = order.attribution?.medium || "unknown";
  const rawCampaign = order.attribution?.campaign || order.campaignId || order.attribution?.campaignId || "unknown";
  const source = sanitizeAttributionText(rawSource).toLowerCase();
  const medium = sanitizeAttributionText(rawMedium).toLowerCase();
  const name = sanitizeAttributionText(rawCampaign).toLowerCase();
  const label = rawCampaign === "unknown" ? "Unattributed" : sanitizeAttributionText(rawCampaign);
  return { source, medium, campaign: name, key: `${source}|${medium}|${name}`, label };
}
function sanitizeAttributionText(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  if (/@/.test(clean) || /\+?\d[\d\s().-]{6,}\d/.test(clean)) return "[redacted]";
  return clean || "unknown";
}
function channelFor(order: ReportOrderInput): ReportChannel {
  const { source, medium } = campaignParts(order);
  if (["email", "e-mail"].includes(medium) || order.attribution?.emailClickId) return "email";
  if (medium === "organic") return "organic";
  if (["facebook", "instagram", "meta"].some((s) => source.includes(s)) || medium === "social" || !!order.attribution?.fbclid) return "social_meta";
  if (["cpc", "ppc", "paid", "paidsearch"].includes(medium) && (source.includes("google") || order.attribution?.gclid || order.attribution?.wbraid || order.attribution?.gbraid) || order.attribution?.gclid || order.attribution?.wbraid || order.attribution?.gbraid) return "google_paid";
  if (["referral", "affiliate"].includes(medium)) return "referral";
  if (source === "direct" || medium === "none" || medium === "direct") return "direct";
  return "unknown";
}
function eventChannel(event: NonNullable<AggregateInput["telemetry"]>[number]): Exclude<ReportChannel, "all"> {
  const source = (event.source || "unknown").toLowerCase();
  const medium = (event.medium || "unknown").toLowerCase();
  if (["email", "e-mail"].includes(medium)) return "email";
  if (medium === "organic") return "organic";
  if (["facebook", "instagram", "meta"].some((s) => source.includes(s)) || medium === "social" || event.hasMetaClick) return "social_meta";
  if (event.hasGoogleClick || ["cpc", "ppc", "paid", "paidsearch"].includes(medium) && source.includes("google")) return "google_paid";
  if (["referral", "affiliate"].includes(medium)) return "referral";
  if (source === "direct" || ["none", "direct"].includes(medium)) return "direct";
  return "unknown";
}

export interface AggregateInput {
  asOf: Date;
  dataEnvironment?: "live" | "synthetic" | "unavailable";
  scope: ReportScope;
  orders: ReportOrderInput[];
  orderCoverage: SourceCoverage;
  telemetryCoverage: SourceCoverage;
  reconciliationCoverage: SourceCoverage;
  reconciliations?: ReportReconciliationEntry[];
  telemetry?: Array<{ eventId?: string; sessionKey?: string; eventName?: string; source?: string; medium?: string; campaign?: string; hasGoogleClick?: boolean; hasMetaClick?: boolean }>;
  telemetrySampled?: boolean;
}

export function aggregateMeasurementReport(input: AggregateInput): AdminMeasurementReport {
  const { asOf, scope } = input;
  const sidecarByOrder = new Map<string, ReportReconciliationEntry>();
  const conflictingSidecarIds = new Set<string>();
  const sidecarGroups = new Map<string, ReportReconciliationEntry[]>();
  for (const entry of input.reconciliations ?? []) {
    const group = sidecarGroups.get(entry.orderId) ?? [];
    group.push(entry); sidecarGroups.set(entry.orderId, group);
  }
  for (const [orderId, group] of sidecarGroups) {
    const revisions = new Map<number, ReportReconciliationEntry>();
    for (const entry of group) {
      const sameRevision = revisions.get(entry.revision);
      if (sameRevision && JSON.stringify(entry) !== JSON.stringify(sameRevision)) conflictingSidecarIds.add(orderId);
      else revisions.set(entry.revision, entry);
    }
    const ordered = [...revisions.values()].sort((a, b) => a.revision - b.revision);
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i].revision !== ordered[i - 1].revision + 1 || ordered[i].supersedes !== ordered[i - 1].revision) conflictingSidecarIds.add(orderId);
    }
    const latest = ordered.at(-1);
    if (latest) {
      if (latest.revision === 1 && latest.supersedes !== undefined || latest.revision > 1 && latest.supersedes !== latest.revision - 1) conflictingSidecarIds.add(orderId);
      sidecarByOrder.set(orderId, latest);
    }
  }
  const uniqueOrders = new Map<string, ReportOrderInput>();
  const conflictingOrderIds = new Set<string>();
  const censusPaymentOwners = new Map<string, Set<string>>();
  for (const order of input.orders) if (order.stripePaymentId) {
    const owners = censusPaymentOwners.get(order.stripePaymentId) ?? new Set<string>(); owners.add(order.id); censusPaymentOwners.set(order.stripePaymentId, owners);
  }
  for (const order of input.orders) {
    if (!order.id) continue;
    const prior = uniqueOrders.get(order.id);
    if (!prior) uniqueOrders.set(order.id, order);
    else if (JSON.stringify(prior) !== JSON.stringify(order)) conflictingOrderIds.add(order.id);
  }
  const candidates: Array<{ order: ReportOrderInput; type: Classification; amount: number | null; created: number | null }> = [];
  const exceptions: AdminMeasurementReport["exceptions"] = [];
  let undated = 0;
  for (const order of uniqueOrders.values()) {
    const created = timestampMillis(order.createdAt);
    if (created === null) { undated++; exceptions.push({ orderId: order.id, code: "missing_created_at" }); continue; }
    else if ((scope.startUtc && created < Date.parse(scope.startUtc)) || (scope.endUtc && created >= Date.parse(scope.endUtc))) continue;
    if (scope.channel !== "all" && channelFor(order) !== scope.channel) continue;
    const sidecar = sidecarByOrder.get(order.id);
    let type = classification(order, sidecar);
    if (sidecar?.classification === "independent_customer" && type !== "customer") exceptions.push({ orderId: order.id, code: "classification_conflict" });
    if (conflictingSidecarIds.has(order.id) || conflictingOrderIds.has(order.id)) { exceptions.push({ orderId: order.id, code: "conflicting_evidence" }); type = "unresolved"; }
    const m = order.purchaseMeasurement;
    const sidecarCapture = sidecar?.classification === "independent_customer" && sidecar.liveMode === true && sidecar.currency === "USD" &&
      Number.isInteger(sidecar.amountInCents) && (sidecar.amountInCents ?? 0) > 0 && !!sidecar.paymentIntentId && sidecar.paymentIntentId === order.stripePaymentId &&
      (!Number.isInteger(order.amountInCents) || order.amountInCents === sidecar.amountInCents) &&
      (!m || (m.amountInCents === sidecar.amountInCents && m.currency === sidecar.currency && m.transactionId === order.id));
    const snapshotCapture = m?.version === 1 && m.transactionId === order.id && Number.isFinite(m.verifiedAt) && Number.isInteger(m.amountInCents) && (m.amountInCents ?? 0) > 0 && m.currency === "USD" && ["eligible", "known_refund"].includes(m.reason ?? "") &&
      !!order.stripePaymentId && (!Number.isInteger(order.amountInCents) || order.amountInCents === m.amountInCents);
    const amount = sidecarCapture ? sidecar!.amountInCents : m?.amountInCents;
    const validCapture = type === "customer" && (sidecarCapture || snapshotCapture);
    if (type === "customer" && !validCapture) { exceptions.push({ orderId: order.id, code: "capture_evidence_conflict" }); type = "unresolved"; }
    if (order.stripePaymentId && (censusPaymentOwners.get(order.stripePaymentId)?.size ?? 0) > 1) { exceptions.push({ orderId: order.id, code: "payment_intent_collision" }); type = "unresolved"; }
    candidates.push({ order, type, amount: type === "customer" && validCapture ? amount! : null, created });
  }
  const rows = candidates.filter((x) => scope.records === "all" || x.type === "customer" || x.type === "unresolved");
  const completeOrders = input.orderCoverage.status === "complete";
  const completeCustomerClassification = completeOrders && input.reconciliationCoverage.status === "complete";
  const count = (type: Classification) => completeCustomerClassification ? candidates.filter((x) => x.type === type).length : null;
  const customers = rows.filter((x) => x.type === "customer");
  const revenue = completeCustomerClassification ? customers.reduce((sum, x) => sum + (x.amount ?? 0), 0) : null;
  const refundEvidence = (order: ReportOrderInput) => {
    const sidecar = sidecarByOrder.get(order.id);
    const observations = [sidecar?.refundStatus, order.refundStatus, order.purchaseMeasurement?.refundStatus].filter((x): x is string => !!x && x !== "unknown");
    const knownRefunded = observations.some((x) => ["partial", "partially_refunded", "full", "fully_refunded"].includes(x));
    if (knownRefunded && observations.includes("none_observed")) { exceptions.push({ orderId: order.id, code: "refund_evidence_conflict" }); return "unknown"; }
    return observations.find((x) => x === "partial" || x === "partially_refunded" || x === "full" || x === "fully_refunded") ?? observations[0] ?? "unknown";
  };
  const refunded = rows.filter((x) => ["partial", "full", "fully_refunded", "partially_refunded"].includes(refundEvidence(x.order)));
  const refundUnknown = rows.filter((x) => refundEvidence(x.order) === "unknown");
  const refundAmounts = refunded.map((x): number | null => {
    const sidecarAmount = sidecarByOrder.get(x.order.id)?.refundedAmountInCents;
    const observed = [x.order.refundedAmountInCents, sidecarAmount].filter((value): value is number => value !== undefined);
    if (!observed.length) return null;
    const captured = x.amount ?? x.order.amountInCents ?? sidecarByOrder.get(x.order.id)?.amountInCents;
    if (observed.some((value) => !Number.isInteger(value) || value < 0 || captured === undefined || value > captured) || new Set(observed).size > 1) {
      exceptions.push({ orderId: x.order.id, code: "refund_amount_conflict" });
      return null;
    }
    return observed[0];
  });
  const disputeEvidence = (order: ReportOrderInput) => {
    const sidecar = sidecarByOrder.get(order.id);
    const observed = [sidecar?.disputeStatus, order.disputeStatus].filter((x): x is string => !!x && x !== "unknown");
    if (observed.includes("disputed") && observed.includes("none_observed")) { exceptions.push({ orderId: order.id, code: "dispute_evidence_conflict" }); return "unknown"; }
    return observed.includes("disputed") ? "disputed" : observed[0] ?? "unknown";
  };
  const disputed = rows.filter((x) => disputeEvidence(x.order) === "disputed");
  const disputeUnknown = rows.filter((x) => disputeEvidence(x.order) === "unknown");
  const campaigns = new Map<string, { key: string; source: string; medium: string; campaign: string; label: string; channel: Exclude<ReportChannel, "all">; orders: number; capturedCents: number }>();
  for (const c of customers) {
    const parts = campaignParts(c.order);
    const agg = campaigns.get(parts.key) ?? { ...parts, channel: channelFor(c.order) as Exclude<ReportChannel, "all">, orders: 0, capturedCents: 0 };
    agg.orders++; agg.capturedCents += c.amount ?? 0; campaigns.set(parts.key, agg);
  }
  const eventsByCampaign = new Map<string, Array<{ sessionKey?: string; eventName?: string }>>();
  const eventNames = ALLOWED_BROWSER_EVENT_NAMES as Set<string>;
  const uniqueTelemetry = new Map<string, NonNullable<AggregateInput["telemetry"]>[number]>();
  for (const event of input.telemetry ?? []) {
    if (!event.eventName || !eventNames.has(event.eventName)) continue;
    const eventId = event.eventId || JSON.stringify(event);
    if (!uniqueTelemetry.has(eventId)) uniqueTelemetry.set(eventId, event);
  }
  for (const event of uniqueTelemetry.values()) {
    const source = sanitizeAttributionText(event.source || "unknown").toLowerCase();
    const medium = sanitizeAttributionText(event.medium || "unknown").toLowerCase();
    const name = sanitizeAttributionText(event.campaign || "unknown").toLowerCase();
    const key = `${source}|${medium}|${name}`;
    if (scope.channel !== "all" && eventChannel(event) !== scope.channel) continue;
    const rows = eventsByCampaign.get(key) ?? [];
    rows.push(event); eventsByCampaign.set(key, rows);
    if (!campaigns.has(key)) campaigns.set(key, { source, medium, campaign: name, key, label: !event.campaign || event.campaign === "unknown" ? "Unattributed" : sanitizeAttributionText(event.campaign), channel: eventChannel(event), orders: 0, capturedCents: 0 });
  }
  const status = input.orderCoverage.status === "unavailable" ? "unavailable" : input.orderCoverage.status === "partial" || input.telemetryCoverage.status !== "complete" || input.reconciliationCoverage.status !== "complete" ? "partial" : "complete";
  const orderIds = new Set(rows.map((x) => x.order.id));
  const matchedRecs = (input.reconciliations ?? []).filter((x) => orderIds.has(x.orderId));
  const recs = matchedRecs.filter((x) => x.classification === "independent_customer");
  return {
    asOf: asOf.toISOString(), dataEnvironment: input.dataEnvironment ?? "synthetic", timezone: REPORT_TIME_ZONE, scope, scopeKey: reportScopeKey(scope), status,
    sources: { orders: input.orderCoverage, telemetry: input.telemetryCoverage, reconciliation: input.reconciliationCoverage },
    totals: {
      verifiedCustomerOrders: completeCustomerClassification ? customers.length : null,
      capturedCustomerRevenueCents: revenue,
      founderTestOrders: count("founder"), compOrders: count("comp"), adminCompBalanceOrders: count("admin"),
      unresolvedOrders: count("unresolved"),
      undatedOrders: completeOrders ? undated : null,
      refunds: { knownOrderCount: completeOrders ? refunded.length : null,
        knownRefundedCents: completeOrders ? refundAmounts.length === refunded.length && refundAmounts.every((x): x is number => x !== null) ? refundAmounts.reduce((s, x) => s + x, 0) : null : null,
      unknownOrderCount: completeOrders ? refundUnknown.length : null },
      disputes: { knownOrderCount: completeOrders ? disputed.length : null, unknownOrderCount: completeOrders ? disputeUnknown.length : null },
    },
    orderDiagnostics: rows.map((row) => {
      const sidecar = sidecarByOrder.get(row.order.id);
      const m = row.order.purchaseMeasurement;
      const sidecarCapture = sidecar?.liveMode === true && sidecar.currency === "USD" && sidecar.paymentIntentId === row.order.stripePaymentId && Number.isInteger(sidecar.amountInCents) && (sidecar.amountInCents ?? 0) > 0 &&
        (!Number.isInteger(row.order.amountInCents) || row.order.amountInCents === sidecar.amountInCents) && (!m || (m.amountInCents === sidecar.amountInCents && m.currency === sidecar.currency && m.transactionId === row.order.id));
      const snapshotCapture = m?.version === 1 && m.transactionId === row.order.id && Number.isFinite(m.verifiedAt) && m.currency === "USD" && Number.isInteger(m.amountInCents) && (m.amountInCents ?? 0) > 0 && !!row.order.stripePaymentId && (!Number.isInteger(row.order.amountInCents) || row.order.amountInCents === m.amountInCents);
      const hasBadSnapshot = !!m && !snapshotCapture && !sidecarCapture;
      const evidenceStatus = sidecarCapture || snapshotCapture ? "verified_capture" as const : hasBadSnapshot ? "conflict" as const : "missing" as const;
      const evidenceSource = hasBadSnapshot ? "conflict" as const : sidecarCapture && snapshotCapture ? "both" as const : sidecarCapture ? "reconciliation" as const : snapshotCapture ? "purchase_snapshot" as const : sidecar ? "conflict" as const : "none" as const;
      const parts = campaignParts(row.order);
      const clicksKnown = !!row.order.attribution;
      const click = !!(row.order.attribution?.gclid || row.order.attribution?.wbraid || row.order.attribution?.gbraid || row.order.attribution?.fbclid);
      const refund = refundEvidence(row.order);
      const dispute = disputeEvidence(row.order);
      const visibleClass = row.type === "customer" ? "independent_customer" as const : row.type === "founder" ? "founder_test" as const : row.type === "comp" ? "comp" as const : row.type === "admin" ? "admin_origin" as const : "unresolved" as const;
      return { orderId: row.order.id, createdAt: row.created === null ? null : new Date(row.created).toISOString(), classification: visibleClass,
        paymentEvidenceStatus: evidenceStatus, paymentEvidenceSource: evidenceSource, amountInCents: evidenceStatus === "verified_capture" ? sidecarCapture ? sidecar!.amountInCents! : m!.amountInCents! : null,
        currency: evidenceStatus === "verified_capture" ? "USD" : null,
        verifiedAt: typeof m?.verifiedAt === "number" && Number.isFinite(m.verifiedAt) ? new Date(m.verifiedAt).toISOString() : null,
        observedAt: sidecar?.observedAt && Number.isFinite(Date.parse(sidecar.observedAt)) ? new Date(sidecar.observedAt).toISOString() : null,
        campaign: { ...parts, channel: channelFor(row.order) as Exclude<ReportChannel, "all"> },
        refundStatus: ["partial", "partially_refunded"].includes(refund) ? "partial" as const : ["full", "fully_refunded"].includes(refund) ? "full" as const : refund === "none_observed" ? "none_observed" as const : "unknown" as const,
        disputeStatus: dispute === "disputed" ? "disputed" as const : dispute === "none_observed" ? "none_observed" as const : "unknown" as const,
        clickIdPresent: clicksKnown ? click : null };
    }),
    campaigns: [...campaigns].map(([key, v]) => { const activity = eventsByCampaign.get(key) ?? []; return { ...v, orders: completeCustomerClassification ? v.orders : null, capturedCents: completeCustomerClassification ? v.capturedCents : null,
      observedSessions: input.telemetryCoverage.status !== "unavailable" ? new Set(activity.filter((t) => t.sessionKey).map((t) => t.sessionKey)).size : null,
      eventCounts: input.telemetryCoverage.status !== "unavailable" ? Object.fromEntries([...new Set(activity.map((t) => t.eventName).filter((x): x is string => !!x))].map((name) => [name, activity.filter((t) => t.eventName === name).length])) : null }; }),
    activity: { observedSessions: input.telemetryCoverage.status !== "unavailable" ? new Set([...uniqueTelemetry.values()].filter((t) => t.sessionKey).map((t) => t.sessionKey)).size : null,
      eventCounts: input.telemetryCoverage.status !== "unavailable" ? Object.fromEntries([...new Set([...uniqueTelemetry.values()].map((t) => t.eventName).filter((x): x is string => !!x))].map((name) => [name, [...uniqueTelemetry.values()].filter((t) => t.eventName === name).length])) : null,
      sampled: input.telemetrySampled ?? input.telemetryCoverage.status !== "complete" },
    exceptions: exceptions.slice(0, 100),
    attribution: { campaignRecorded: completeCustomerClassification ? customers.filter((x) => campaignParts(x.order).campaign !== "unknown").length : null,
      clickIdPresent: completeCustomerClassification ? customers.filter((x) => !!(x.order.attribution?.gclid || x.order.attribution?.wbraid || x.order.attribution?.gbraid || x.order.attribution?.fbclid)).length : null },
    reconciliation: { status: input.reconciliationCoverage.status === "unavailable" ? "unavailable" : matchedRecs.length ? "applied" : "pending",
      verifiedCustomerOrders: input.reconciliationCoverage.status === "complete" ? recs.length : null,
      capturedCents: input.reconciliationCoverage.status === "complete" ? recs.reduce((s, x) => s + (x.amountInCents ?? 0), 0) : null },
  };
}
