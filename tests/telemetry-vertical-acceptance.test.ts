import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as postTelemetry } from "../app/api/telemetry/route";
import { trackEventV2 } from "../lib/telemetry";
import { firestoreDb, getOrderById, saveOrder } from "../lib/firebase-admin";
import { buildPurchaseMeasurement, persistPurchaseMeasurement } from "../lib/purchase-measurement";
import { getFinancialFactsByOrder } from "../lib/financial-ledger";
import { processPaidOrder } from "../lib/order-processor";
import { readWaterfallSources } from "../lib/admin-waterfall-source";
import { aggregateWaterfallReport, chicagoMidnight, normalizeWaterfallScope } from "../lib/admin-waterfall-report";
import { withSafeTestHarness, registerFakeHandler, getBlockedExternalCalls } from "../lib/testing/safe-harness";

type Row = { id: string; data: Record<string, unknown> };

class Query {
  private filters: Array<(row: Row) => boolean> = [];
  private sortField = "__name__";
  private direction: "asc" | "desc" = "asc";
  private cursorId = "";
  private max = Number.MAX_SAFE_INTEGER;
  constructor(private rows: Row[]) {}
  select(..._fields: string[]) { return this; }
  where(field: string, op: string, value: unknown) {
    this.filters.push((row) => {
      const actual = row.data[field];
      if (op === ">=") return actual !== undefined && (actual as any) >= (value as any);
      if (op === "<") return actual !== undefined && (actual as any) < (value as any);
      if (op === "<=") return actual !== undefined && (actual as any) <= (value as any);
      return actual === value;
    });
    return this;
  }
  orderBy(field: unknown, direction: "asc" | "desc" = "asc") {
    this.sortField = typeof field === "string" ? field : "__name__";
    this.direction = direction;
    return this;
  }
  startAfter(cursor: { id?: string }) { this.cursorId = cursor.id || ""; return this; }
  limit(max: number) { this.max = max; return this; }
  async get() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    rows.sort((a, b) => {
      const av = this.sortField === "__name__" ? a.id : a.data[this.sortField];
      const bv = this.sortField === "__name__" ? b.id : b.data[this.sortField];
      const result = av === bv ? a.id.localeCompare(b.id) : (av as any) < (bv as any) ? -1 : 1;
      return this.direction === "asc" ? result : -result;
    });
    if (this.cursorId) {
      const cursor = rows.findIndex((row) => row.id === this.cursorId);
      if (cursor >= 0) rows = rows.slice(cursor + 1);
    }
    return { docs: rows.slice(0, this.max).map((row) => ({ id: row.id, data: () => row.data })) };
  }
}

function adapterFromStoredCollections() {
  const rowsByCollection = new Map<string, Row[]>();
  const collection = (path: string) => {
    let rows = rowsByCollection.get(path);
    if (!rows) {
      rows = [];
      rowsByCollection.set(path, rows);
    }
    const query = new Query(rows);
    return {
      select: (...fields: string[]) => query.select(...fields),
      where: (field: string, op: string, value: unknown) => query.where(field, op, value),
      orderBy: (field: unknown, direction?: "asc" | "desc") => query.orderBy(field, direction),
      limit: (max: number) => query.limit(max),
      doc: (id: string) => ({
        collection: (name: string) => collection(`${path}/${id}/${name}`),
      }),
    };
  };
  return {
    async load(path: string) {
      const snapshot = await firestoreDb.collection(path).get();
      rowsByCollection.set(path, snapshot.docs.map((doc: any) => ({ id: doc.id, data: doc.data() || {} })));
    },
    collection,
  };
}

async function run() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const values = new Map<string, string>([
    ["smn_privacy_consent", "granted"],
    ["smn_session_v2", JSON.stringify({ sessionId: "sess_vertical_acceptance", startedAt: Date.now(), lastActivityAt: Date.now() })],
    ["smn_anon_id_v2", "anon_vertical_acceptance"],
    ["smn_journey_v2", "jny_vertical_acceptance"],
    ["smn_attribution", JSON.stringify({
      utmSource: "google", utmMedium: "cpc", utmCampaign: "smn_vertical_acceptance",
      capturedAt: Date.now(), expiresAt: Date.now() + 60_000,
    })],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: storage, sessionStorage: storage,
    location: { pathname: "/send" }, innerWidth: 1440,
    screen: { width: 1440, height: 900 },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", referrer: "https://www.google.com/" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", globalPrivacyControl: false } });

  const requestTasks: Promise<Response>[] = [];
  const unregister = registerFakeHandler("/api/telemetry", async (_input, init) => {
    const body = String(init?.body || "");
    const task = postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body,
    }));
    requestTasks.push(task);
    return task;
  });

  try {
    await withSafeTestHarness(async () => {
      const milestones = ["entry_viewed", "cover_selected", "note_confirmed", "address_confirmed"] as const;
      for (const [index, eventName] of milestones.entries()) {
        await trackEventV2(eventName, eventName === "note_confirmed" ? { wasEdited: true, charCount: 36 } : {}, { eventId: `evt_vertical_${index}_001` });
      }
      await trackEventV2("checkout_created", {}, {
        eventId: "evt_vertical_checkout_001",
        orderId: "order_vertical_acceptance",
        paymentAttemptId: "pay_attempt_vertical_001",
      });
      await Promise.all([...requestTasks]);

      const order = {
        id: "order_vertical_acceptance",
        createdAt: Date.now(),
        amountInCents: 900,
        finalAmountInCents: 900,
        paymentMethod: "STRIPE",
        stripePaymentId: "pi_fake_verified_vertical_001",
        status: "PENDING_PAYMENT",
        sessionId: "sess_vertical_acceptance",
        attribution: { source: "google", medium: "cpc", campaign: "smn_vertical_acceptance" },
        experienceVersion: "candidate_v1",
        frontImageUrl: "/presets/acceptance-fixture.jpg",
        printedMessage: "",
        handwrittenNote: "Synthetic test note body.",
        fontStyleId: "1",
        contactPolicyVersion: 0,
        recipientAddress: {
          firstName: "Test", lastName: "Recipient", street1: "1 Fixture Lane",
          city: "Testville", state: "IL", zip: "60601", country: "US",
        },
        returnAddress: {
          firstName: "Fixture", lastName: "Sender", street1: "2 Fixture Lane",
          city: "Testville", state: "IL", zip: "60602", country: "US",
        },
      } as any;
      const fakeVerifiedCapture = {
        paymentIntentId: order.stripePaymentId,
        amount: 900,
        amountReceived: 900,
        currency: "usd",
        livemode: true,
      };
      const snapshot = buildPurchaseMeasurement(order, fakeVerifiedCapture, Date.now());
      assert.equal(snapshot.eligible, true, "synthetic live-mode capture is eligible customer measurement evidence");
      await saveOrder(order);
      await persistPurchaseMeasurement(order.id, snapshot);
      // The processor accepts a synthetic server-verified intent. The safe harness
      // is active and provider secrets are blank, so Handwrytten uses its explicit
      // no-key mock result and no live payment, supplier, email, or Meta call occurs.
      const secretKeys = ["HANDWRYTTEN_API_KEY", "handwrytten-api-key", "META_CONVERSIONS_API_ACCESS_TOKEN", "meta-conversions-api-access-token", "META_ACCESS_TOKEN"];
      const oldSecrets = new Map(secretKeys.map((key) => [key, process.env[key]]));
      for (const key of secretKeys) delete process.env[key];
      let paidResult;
      try {
        paidResult = await processPaidOrder(order.id, order.stripePaymentId, undefined, {
          paymentMode: "live",
          verifiedPaymentIntent: {
            id: order.stripePaymentId,
            status: "succeeded",
            amount: 900,
            amount_received: 900,
            currency: "usd",
            livemode: true,
            metadata: { orderId: order.id },
          },
        });
      } finally {
        for (const [key, value] of oldSecrets) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
      assert.equal(paidResult.success, true, "actual order processor accepts the fake verified capture and fake fulfillment result");
      assert.equal(paidResult.status, "PROCESSING_HANDWRYTTEN");
      assert.match(paidResult.handwryttenOrderId || "", /^mock_hw_/);
      const facts = await getFinancialFactsByOrder(order.id);
      assert.equal(facts.length, 1, "order processor stores one verified synthetic capture fact");
      assert.equal(facts[0]?.livemode, true);
      const completedOrder = await getOrderById(order.id);
      assert.ok(completedOrder);
      delete completedOrder!.sessionId;
      if (completedOrder!.attribution) delete (completedOrder!.attribution as any).sessionId;
      await saveOrder(completedOrder!);

      const eventSnapshot = await firestoreDb.collection("telemetry_events_v2").get();
      const legacySnapshot = await firestoreDb.collection("telemetry_events").get();
      assert.equal(eventSnapshot.size, 5, "five real client-emitter V2 milestones reach canonical storage");
      assert.equal(legacySnapshot.docs.filter((doc: any) => doc.data()?.eventName === "purchase_verified").length, 1, "order processor stores one server payment fact");
      assert.equal(legacySnapshot.docs.filter((doc: any) => doc.data()?.eventName === "fulfillment_submitted").length, 1, "order processor stores one mocked supplier fulfillment fact");
      assert.ok(requestTasks.length >= 5, "all browser calls passed through the actual collector fake handler");
      assert.deepEqual(getBlockedExternalCalls(), [], "safe test harness observed no external provider/email calls");

      const dbAdapter = adapterFromStoredCollections();
      for (const path of ["orders", "telemetry_events", "telemetry_events_v2", "dated_spend_ledger"]) await dbAdapter.load(path);
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      const scope = normalizeWaterfallScope(new URLSearchParams({ window: "custom", start: today, end: today, channel: "google" }), now);
      const sources = await readWaterfallSources(scope.startUtc, scope.endUtc, scope.startDate, scope.endDate, dbAdapter);
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
      assert.equal(report.kpis.uniqueSessions, 1, "emitted landing milestone forms one session denominator");
      assert.equal(report.kpis.paidCustomerOrders, 1, "synthetic verified capture produces one paid customer order");
      assert.equal(report.kpis.capturedRevenueCents, 900, "report amount matches server-verified fake capture");
      assert.equal(report.kpis.conversionRatePct, 100, "exact one-order/one-session join yields 100 percent");
      assert.equal(report.waterfall.find((step) => step.step === "6_PAID")?.sessions, 1);
      assert.equal(report.waterfall.find((step) => step.step === "6_PAID")?.paidOrders, 1);
      assert.equal(report.kpis.dispatchedOrders, 1, "mock fulfillment status remains separately visible");
      assert.equal(report.coverage.unmatchedPaidOrders, 0);
      assert.equal(report.coverage.journeyDiagnostics.length, 1);
      assert.equal(report.coverage.journeyDiagnostics[0]?.orderId, order.id);
      assert.equal(report.coverage.journeyDiagnostics[0]?.sessionId, "sess_vertical_acceptance");
      assert.equal(report.coverage.journeyDiagnostics[0]?.journeyId, "jny_vertical_acceptance");
      assert.equal(report.coverage.journeyDiagnostics[0]?.linkSource, "telemetry_order_id", "same session is reconciled by exact checkout order ID");
      assert.equal(report.coverage.journeyDiagnostics[0]?.linkStatus, "joined");
      assert.equal(report.coverage.journeyDiagnostics[0]?.degradedIdentity, false);
      assert.equal(report.coverage.degradedIdentityEvents, 0);
      assert.equal(report.coverage.status, "complete");
      assert.equal(report.coverage.sources.orders.status, "complete");
      assert.equal(report.coverage.sources.telemetry.status, "complete");
      assert.ok(chicagoMidnight(today), "date bounds resolve to the report's Chicago timezone");

      console.log("PASS telemetry vertical acceptance: browser emitter → collector → mock storage → report; 5 milestones, 1 verified fake order, 1 fake fulfillment, 1/1 conversion");
    });
  } finally {
    unregister();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as any).window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as any).document;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as any).navigator;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
