import assert from "node:assert/strict";
import { aggregateWaterfallReport, chicagoMidnight, normalizeWaterfallScope } from "../lib/admin-waterfall-report";
import { readWaterfallSources } from "../lib/admin-waterfall-source";
import { WaterfallOrderInput, WaterfallTelemetryEventInput } from "../lib/contracts/admin-waterfall";

const now = new Date("2026-10-29T18:00:00.000Z");
const scope = normalizeWaterfallScope(new URLSearchParams({ window: "custom", start: "2026-10-29", end: "2026-10-29" }), now);
const started = Date.parse(chicagoMidnight("2026-10-29"));

function verifiedOrder(id: string, sessionId: string, timestamp = started + 5_000, amountInCents = 765): WaterfallOrderInput {
  return {
    id,
    sessionId,
    createdAt: timestamp,
    amountInCents,
    paymentMethod: "STRIPE",
    stripePaymentId: `pi_${id}`,
    status: "PROCESSING_HANDWRYTTEN",
    purchaseMeasurement: {
      version: 1,
      transactionId: id,
      amountInCents,
      currency: "USD",
      verifiedAt: timestamp,
      eligible: true,
      reason: "eligible",
    },
    attribution: { sessionId, source: "google", medium: "cpc", campaign: "smn_first_sale_v1" },
  };
}

function fullJourney(sessionId: string, founder = false): WaterfallTelemetryEventInput[] {
  const common = { sessionId, timestamp: started + 1_000, utmSource: "google", utmMedium: "cpc", utmCampaign: "smn_first_sale_v1" };
  return [
    { ...common, eventName: "entry_viewed", isFounder: founder },
    { ...common, eventName: "cover_selected", timestamp: started + 2_000, isFounder: founder },
    { ...common, eventName: "note_confirmed", timestamp: started + 3_000, isFounder: founder },
    { ...common, eventName: "address_confirmed", timestamp: started + 4_000, isFounder: founder },
    { ...common, eventName: "checkout_created", timestamp: started + 5_000, isFounder: founder },
  ];
}

function fakeSnapshot(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: rows.map((row) => ({ id: row.id, data: () => row.data })) };
}

class FakeQuery {
  private filters: Array<(row: { id: string; data: Record<string, unknown> }) => boolean> = [];
  private orderField = "__name__";
  private direction: "asc" | "desc" = "asc";
  private max = Number.MAX_SAFE_INTEGER;
  private cursorId?: string;
  constructor(
    private rows: Array<{ id: string; data: Record<string, unknown> }>,
    private stallAfterCursor = false,
  ) {}
  get hasCursor() { return Boolean(this.cursorId); }
  select(..._fields: string[]) { return this; }
  where(field: string, op: string, value: unknown) {
    this.filters.push((row) => {
      const actual = row.data[field];
      if (op === ">=") return actual !== undefined && (actual as any) >= (value as any);
      if (op === "<=") return actual !== undefined && (actual as any) <= (value as any);
      if (op === "<") return actual !== undefined && (actual as any) < (value as any);
      return actual === value;
    });
    return this;
  }
  orderBy(field: unknown, direction: "asc" | "desc" = "asc") {
    this.orderField = typeof field === "string" ? field : "__name__";
    this.direction = direction;
    return this;
  }
  startAfter(cursor: { id: string }) { this.cursorId = cursor.id; return this; }
  limit(max: number) { this.max = max; return this; }
  async get() {
    if (this.stallAfterCursor && this.cursorId) return await new Promise<{ docs: any[] }>(() => {});
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    rows = rows.sort((a, b) => {
      const av = this.orderField === "__name__" ? a.id : a.data[this.orderField];
      const bv = this.orderField === "__name__" ? b.id : b.data[this.orderField];
      const result = av === bv ? a.id.localeCompare(b.id) : (av as any) < (bv as any) ? -1 : 1;
      return this.direction === "asc" ? result : -result;
    });
    if (this.cursorId) {
      const cursorIndex = rows.findIndex((row) => row.id === this.cursorId);
      rows = cursorIndex >= 0 ? rows.slice(cursorIndex + 1) : rows;
    }
    return fakeSnapshot(rows.slice(0, this.max));
  }
}

function fakeDb(
  data: Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  options?: { stallTelemetryAfterFirstPage?: boolean },
) {
  const query = (path: string) => new FakeQuery(data[path] || [], path === "telemetry_events" && options?.stallTelemetryAfterFirstPage === true);
  return {
    collection(path: string) {
      return {
        select: (...fields: string[]) => query(path).select(...fields),
        where: (field: string, op: string, value: unknown) => query(path).where(field, op, value),
        orderBy: (field: unknown, direction?: "asc" | "desc") => query(path).orderBy(field, direction),
        limit: (max: number) => query(path).limit(max),
        doc: (_id: string) => ({
          collection: (name: string) => ({
            select: (...fields: string[]) => query(`system_config/admin_measurement_reconciliation/entries/report_production/${name}`).select(...fields),
            orderBy: (field: unknown, direction?: "asc" | "desc") => query(`system_config/admin_measurement_reconciliation/entries/report_production/${name}`).orderBy(field, direction),
            limit: (max: number) => query(`system_config/admin_measurement_reconciliation/entries/report_production/${name}`).limit(max),
          }),
          get: async () => ({ exists: false }),
        }),
      };
    },
  };
}

async function run() {
  // More than 500 older records must not push a selected one-row cohort out of view.
  const oldRows = Array.from({ length: 750 }, (_, index) => ({
    id: `old_${String(index).padStart(4, "0")}`,
    data: { eventName: "inside_note_edited", sessionId: `old_session_${index}`, timestamp: started + 20 + index, isFounder: false },
  }));
  const selectedRows = fullJourney("s_google").slice(0, 4).map((event, index) => ({
    id: `new_${index}`,
    data: { ...event, timestamp: started + 2_000 + index },
  }));
  const v2Rows = [
    {
      id: "v2_duplicate_entry",
      data: {
        event_id: "new_0",
        event_name: "entry_viewed",
        session_id: "s_google",
        journey_id: "jny_google",
        degraded_identity: false,
        occurred_at: started + 1_000,
        classification: { role: "customer", reason: "default" },
        properties: { utmSource: "google", utmMedium: "cpc", utmCampaign: "smn_first_sale_v1" },
      },
    },
    {
      id: "v2_only_checkout",
      data: {
        event_id: "v2_checkout",
        event_name: "checkout_created",
        session_id: "s_google",
        journey_id: "jny_google",
        order_id: "order_google",
        degraded_identity: true,
        occurred_at: started + 5_000,
        classification: { role: "customer", reason: "default" },
        properties: { utmSource: "google", utmMedium: "cpc", utmCampaign: "smn_first_sale_v1" },
      },
    },
  ];
  const linkedOrder = verifiedOrder("order_google", "s_google");
  delete linkedOrder.sessionId;
  if (linkedOrder.attribution) delete linkedOrder.attribution.sessionId;
  const orders = [{ id: "order_google", data: linkedOrder as unknown as Record<string, unknown> }];
  const sources = await readWaterfallSources(
    scope.startUtc,
    scope.endUtc,
    scope.startDate,
    scope.endDate,
    fakeDb({
      telemetry_events: [...oldRows, ...selectedRows],
      telemetry_events_v2: v2Rows,
      orders,
      dated_spend_ledger: [],
    })
  );
  assert.equal(sources.telemetry.length, 755, "750 earlier same-day events and the selected journey survive bounded pagination beyond page 1");
  assert.equal(sources.telemetry.filter((event) => event.eventName === "entry_viewed").length, 1, "legacy and V2 records with one stable ID count once");
  assert.ok(sources.telemetry.some((event) => event.eventName === "checkout_created"), "V2-only canonical milestones are included");
  assert.equal(sources.sources.telemetry.status, "complete");
  assert.equal(sources.orders.length, 1);

  const report = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: sources.orders,
    ordersCount: sources.ordersCount,
    ordersCap: 10_000,
    telemetry: sources.telemetry,
    telemetryCount: sources.telemetryCount,
    telemetryCap: 10_000,
    reconciliations: sources.reconciliations,
    adSpendRecords: sources.adSpendRecords,
    sources: sources.sources,
  });
  assert.equal(report.kpis.uniqueSessions, 1);
  assert.equal(report.kpis.paidCustomerOrders, 1);
  assert.equal(report.kpis.capturedRevenueCents, 765);
  assert.equal(report.kpis.conversionRatePct, 100, "only exact session + campaign match can produce conversion rate");
  assert.equal(report.coverage.unmatchedPaidOrders, 0);
  assert.equal(report.coverage.journeyDiagnostics[0]?.linkStatus, "joined");
  assert.equal(report.coverage.journeyDiagnostics[0]?.linkSource, "telemetry_order_id", "canonical checkout order_id is an exact reconciliation key when the order lacks session_id");
  assert.equal(report.coverage.journeyDiagnostics[0]?.journeyId, "jny_google");
  assert.equal(report.coverage.journeyDiagnostics[0]?.degradedIdentity, true);
  assert.equal(report.coverage.degradedIdentityEvents, 1);
  assert.equal(report.coverage.degradedIdentitySessions, 1);
  assert.equal(report.waterfall.find((step) => step.step === "6_PAID")?.sessions, 1);
  assert.equal(report.waterfall.find((step) => step.step === "6_PAID")?.paidOrders, 1);

  const stalledRows = Array.from({ length: 500 }, (_, index) => ({
    id: `stall_${String(index).padStart(4, "0")}`,
    data: { eventName: "landing_viewed", sessionId: `stall_session_${index}`, timestamp: started + index },
  }));
  const deadlineSources = await readWaterfallSources(
    scope.startUtc,
    scope.endUtc,
    scope.startDate,
    scope.endDate,
    fakeDb({ telemetry_events: stalledRows, telemetry_events_v2: [], orders: [], dated_spend_ledger: [] }, { stallTelemetryAfterFirstPage: true })
  );
  assert.equal(deadlineSources.sources.telemetry.status, "partial", "a page deadline after one page stays partial");
  assert.equal(deadlineSources.sources.telemetry.error, "read_deadline");
  const deadlineReport = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: deadlineSources.orders,
    ordersCount: deadlineSources.ordersCount,
    ordersCap: 10_000,
    telemetry: deadlineSources.telemetry,
    telemetryCount: deadlineSources.telemetryCount,
    telemetryCap: 10_000,
    reconciliations: deadlineSources.reconciliations,
    adSpendRecords: deadlineSources.adSpendRecords,
    sources: deadlineSources.sources,
  });
  assert.equal(deadlineReport.kpis.conversionRatePct, null, "deadline-limited reads never publish a denominator rate");
  assert.equal(deadlineReport.waterfall[1]?.pctOfLanded, null);

  // A returning session can have two paid orders while remaining one converted session.
  const repeatOrderReport = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: [verifiedOrder("order_google", "s_google"), verifiedOrder("order_google_2", "s_google")],
    telemetry: fullJourney("s_google"),
    reconciliations: [],
    adSpendRecords: [],
  });
  assert.equal(repeatOrderReport.kpis.paidCustomerOrders, 2);
  assert.equal(repeatOrderReport.kpis.uniqueSessions, 1);
  assert.equal(repeatOrderReport.waterfall.find((step) => step.step === "6_PAID")?.sessions, 1);
  assert.equal(repeatOrderReport.waterfall.find((step) => step.step === "6_PAID")?.paidOrders, 2);

  // No fuzzy campaign join: an order with no session link remains visible and makes rate unknown.
  const unlinked = verifiedOrder("order_unlinked", "s_unobserved");
  delete unlinked.sessionId;
  if (unlinked.attribution) delete unlinked.attribution.sessionId;
  const unlinkedReport = aggregateWaterfallReport({ asOf: now, scope, orders: [unlinked], telemetry: fullJourney("s_google") });
  assert.equal(unlinkedReport.kpis.paidCustomerOrders, 1, "verified payment remains order truth");
  assert.equal(unlinkedReport.coverage.unmatchedPaidOrders, 1);
  assert.equal(unlinkedReport.kpis.conversionRatePct, null);
  assert.equal(unlinkedReport.coverage.journeyDiagnostics[0]?.linkStatus, "missing_session_id");

  const ambiguousOrder = verifiedOrder("order_ambiguous", "s_one");
  delete ambiguousOrder.sessionId;
  if (ambiguousOrder.attribution) delete ambiguousOrder.attribution.sessionId;
  const ambiguousReport = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: [ambiguousOrder],
    telemetry: [
      ...fullJourney("s_one"),
      { sessionId: "s_one", orderId: "order_ambiguous", eventName: "checkout_created", timestamp: started + 6_000 },
      { sessionId: "s_two", orderId: "order_ambiguous", eventName: "checkout_created", timestamp: started + 7_000 },
    ],
  });
  assert.equal(ambiguousReport.coverage.journeyDiagnostics[0]?.linkStatus, "ambiguous_order_id", "one order_id observed in multiple sessions is never guessed");
  assert.equal(ambiguousReport.coverage.unmatchedPaidOrders, 1);
  assert.equal(ambiguousReport.kpis.conversionRatePct, null);

  const mismatchOrder = verifiedOrder("order_session_conflict", "s_one");
  const mismatchReport = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: [mismatchOrder],
    telemetry: [
      ...fullJourney("s_one"),
      { sessionId: "s_other", orderId: "order_session_conflict", eventName: "checkout_created", timestamp: started + 6_000 },
    ],
  });
  assert.equal(mismatchReport.coverage.journeyDiagnostics[0]?.linkStatus, "order_session_mismatch", "conflicting exact keys are surfaced and never silently reconciled");
  assert.equal(mismatchReport.coverage.unmatchedPaidOrders, 1);

  const googleJourney = fullJourney("s_filter_google");
  const directJourney = fullJourney("s_filter_direct").map((event) => ({ ...event, utmSource: "direct", utmMedium: "none", utmCampaign: undefined }));
  const directOrder = verifiedOrder("order_filter_direct", "s_filter_direct");
  directOrder.attribution = { sessionId: "s_filter_direct", source: "direct", medium: "none", campaign: "unknown" };
  const filteredReport = aggregateWaterfallReport({
    asOf: now,
    scope: { ...scope, channel: "google" },
    orders: [verifiedOrder("order_filter_google", "s_filter_google"), directOrder],
    telemetry: [...googleJourney, ...directJourney],
  });
  assert.equal(filteredReport.scope.channel, "google");
  assert.equal(filteredReport.kpis.uniqueSessions, 1, "the selected channel filters the conversion denominator");
  assert.equal(filteredReport.kpis.paidCustomerOrders, 1, "the same channel filters the order KPI");
  assert.equal(filteredReport.kpis.capturedRevenueCents, 765, "the same channel filters revenue");
  assert.deepEqual(filteredReport.originMatrix.map((row) => row.channel), ["google"], "the same channel filters the attribution matrix");
  assert.equal(filteredReport.waterfall.find((step) => step.step === "6_PAID")?.paidOrders, 1);

  // Exact mixed founder/customer cohort proves business denominator AND numerator
  // are owner-excluded in both dashboard audience modes.
  const exactFounderSession = fullJourney("s_exact_founder", true);
  const exactCustomerSessions = [fullJourney("s_exact_customer_paid"), fullJourney("s_exact_customer_abandoned")];
  const exactFounderOrder = verifiedOrder("order_exact_founder", "s_exact_founder");
  exactFounderOrder.isFounderTest = true;
  const exactOrders = [verifiedOrder("order_exact_customer", "s_exact_customer_paid"), exactFounderOrder];
  const exactTelemetry = [...exactCustomerSessions.flat(), ...exactFounderSession];
  const exactCustomers = aggregateWaterfallReport({
    asOf: now,
    scope: { ...scope, audience: "customers" },
    orders: exactOrders,
    telemetry: exactTelemetry,
  });
  const exactAllTraffic = aggregateWaterfallReport({
    asOf: now,
    scope: { ...scope, audience: "all_traffic" },
    orders: exactOrders,
    telemetry: exactTelemetry,
  });
  for (const view of [exactCustomers, exactAllTraffic]) {
    assert.equal(view.kpis.uniqueSessions, 2, "two customer sessions form the conversion denominator; founder session is excluded");
    assert.equal(view.kpis.paidCustomerOrders, 1, "only the verified customer order is in the revenue numerator");
    assert.equal(view.kpis.capturedRevenueCents, 765, "founder order value is excluded from customer revenue");
    assert.equal(view.kpis.conversionRatePct, 50, "exact eligible paid-session numerator / customer-session denominator is 1/2");
    assert.equal(view.waterfall.find((step) => step.step === "1_LANDING")?.sessions, 2);
    assert.equal(view.waterfall.find((step) => step.step === "6_PAID")?.sessions, 1);
    assert.equal(view.waterfall.find((step) => step.step === "6_PAID")?.paidOrders, 1);
    assert.equal(view.deviceBreakdown.founderFilteredCount, 1);
    assert.equal(view.deviceBreakdown.ownerQaSessionCount, 1);
    assert.equal(view.kpis.excludedNonCustomerOrders, 1, "founder test order exclusion is counted explicitly");
  }

  // Owner QA toggling changes only the operational QA comparison, never business metrics.
  const customerTelemetry = fullJourney("s_google");
  const qaTelemetry = fullJourney("s_qa", true);
  const customerView = aggregateWaterfallReport({ asOf: now, scope: { ...scope, audience: "customers" }, orders: [verifiedOrder("order_google", "s_google")], telemetry: [...customerTelemetry, ...qaTelemetry] });
  const qaView = aggregateWaterfallReport({ asOf: now, scope: { ...scope, audience: "all_traffic" }, orders: [verifiedOrder("order_google", "s_google")], telemetry: [...customerTelemetry, ...qaTelemetry] });
  assert.equal(customerView.kpis.uniqueSessions, qaView.kpis.uniqueSessions);
  assert.equal(customerView.kpis.paidCustomerOrders, qaView.kpis.paidCustomerOrders);
  assert.equal(customerView.kpis.capturedRevenueCents, qaView.kpis.capturedRevenueCents);
  assert.equal(qaView.deviceBreakdown.ownerQaSessionCount, 1);

  // Partial reads and missing reconciliation coverage suppress rates rather than returning false zeros.
  const partialView = aggregateWaterfallReport({
    asOf: now,
    scope,
    orders: [verifiedOrder("order_google", "s_google")],
    telemetry: fullJourney("s_google"),
    sources: {
      orders: { status: "complete", recordsRead: 1, maxRecords: 10_000 },
      telemetry: { status: "partial", recordsRead: 10_001, maxRecords: 10_000, error: "read_cap_reached" },
      reconciliation: { status: "complete", recordsRead: 0, maxRecords: 2_000 },
      adSpend: { status: "complete", recordsRead: 0, maxRecords: 2_000 },
    },
  });
  assert.equal(partialView.coverage.status, "partial");
  assert.equal(partialView.kpis.conversionRatePct, null);
  assert.equal(partialView.waterfall[1]?.pctOfLanded, null);

  // Missing attribution is never relabeled as direct.
  const unknown = aggregateWaterfallReport({ asOf: now, scope, orders: [], telemetry: [{ sessionId: "s_unknown", eventName: "entry_viewed", timestamp: started + 1 }] });
  assert.equal(unknown.originMatrix[0]?.channel, "unknown");
  assert.equal(unknown.coverage.unknownAttributionSessions, 1);

  console.log("PASS telemetry waterfall completeness, exact joins, owner QA, and partial-read matrix");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
