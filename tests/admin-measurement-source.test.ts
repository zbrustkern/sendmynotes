import assert from "node:assert/strict";
import { boundedSourceCoverage, readMeasurementSources, reportRuntimeIssue, ORDER_CAP, TELEMETRY_CAP, RECONCILIATION_CAP } from "@/lib/admin-measurement-source";

type FakeConfig = { counts?: Record<string, number>; failures?: Set<string>; delays?: Record<string, number>; records?: Record<string, Array<Record<string, unknown>>> };
class FakeQuery {
  private cap = 100;
  constructor(private readonly path: string, private readonly config: FakeConfig, private readonly calls: string[]) {}
  select(...fields: string[]) { this.calls.push(`select:${this.path}:${fields.join(",")}`); return this; }
  where(...args: unknown[]) { this.calls.push(`where:${this.path}:${String(args[0])}`); return this; }
  orderBy(...args: unknown[]) { this.calls.push(`order:${this.path}`); return this; }
  limit(n: number) { this.cap = n; this.calls.push(`limit:${this.path}:${n}`); return this; }
  async get() {
    this.calls.push(`get:${this.path}`);
    if (this.config.delays?.[this.path]) await new Promise((resolve) => setTimeout(resolve, this.config.delays![this.path]));
    if (this.config.failures?.has(this.path)) throw new Error("fixture read denied");
    const fixtureRows = this.config.records?.[this.path];
    const size = this.config.counts?.[this.path] ?? fixtureRows?.length ?? 0;
    const rows = fixtureRows
      ? fixtureRows.slice(0, this.cap).map((record, i) => ({ id: typeof record.id === "string" ? record.id : `${this.path.replaceAll("/", "_")}_${i}`, data: () => record }))
      : Array.from({ length: Math.min(size, this.cap) }, (_, i) => ({
          id: `${this.path.replaceAll("/", "_")}_${i}`,
          data: () => this.path === "telemetry_events" ? { eventName: "step_navigated", sessionId: `s${i}`, timestamp: Date.now(), utmSource: "google", utmMedium: "cpc", utmCampaign: "fixture" } : { orderId: `recon_${i}`, revision: 1 },
        }));
    return { docs: rows, size };
  }
}
class FakeDb {
  calls: string[] = [];
  writes = 0;
  constructor(private readonly config: FakeConfig = {}) {}
  collection(path: string) {
    const db = this;
    return {
      select(...fields: string[]) { return new FakeQuery(path, db.config, db.calls).select(...fields); },
      orderBy(...args: unknown[]) { return new FakeQuery(path, db.config, db.calls).orderBy(...args); },
      where(...args: unknown[]) { return new FakeQuery(path, db.config, db.calls).where(...args); },
      limit(n: number) { return new FakeQuery(path, db.config, db.calls).limit(n); },
      doc(id: string) { const docPath = `${path}/${id}`; return { collection(name: string) { return { select(...fields: string[]) { return new FakeQuery(`${docPath}/${name}`, db.config, db.calls).select(...fields); }, where(...args: unknown[]) { return new FakeQuery(`${docPath}/${name}`, db.config, db.calls).where(...args); }, orderBy(...args: unknown[]) { return new FakeQuery(`${docPath}/${name}`, db.config, db.calls).orderBy(...args); }, limit(n: number) { return new FakeQuery(`${docPath}/${name}`, db.config, db.calls).limit(n); }, get() { return new FakeQuery(`${docPath}/${name}`, db.config, db.calls).get(); } }; } }; },
      get() { return new FakeQuery(path, db.config, db.calls).get(); },
      add() { db.writes++; throw new Error("unexpected write"); },
    };
  }
}

async function testRuntimeGatesBeforeReads() {
  const db = new FakeDb();
  const mock = await readMeasurementSources(null, null, undefined, { db, isMock: true, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-2a417", nodeEnv: "test" });
  assert.equal(mock.dataEnvironment, "unavailable");
  assert.equal(mock.coverage.orders.reason, "mock_store");
  assert.equal(db.calls.length, 0);
  const mismatch = await readMeasurementSources(null, null, undefined, { db, isMock: false, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-staging", nodeEnv: "production" });
  assert.equal(mismatch.coverage.orders.reason, "project_mismatch");
  assert.equal(db.calls.length, 0);
  assert.equal(reportRuntimeIssue({ isMock: false, expectedProject: "sendmynotes-2a417", nodeEnv: "production" }), "project_mismatch");
  assert.equal(reportRuntimeIssue({ isMock: false, expectedProject: "sendmynotes-staging", actualProject: "sendmynotes-staging", nodeEnv: "production" }), null);
  const staging = await readMeasurementSources(null, null, undefined, { db, isMock: false, expectedProject: "sendmynotes-staging", actualProject: "sendmynotes-staging", nodeEnv: "production" });
  assert.equal(staging.dataEnvironment, "synthetic");
}

async function testIndependentCappedReadsNoWrites() {
  const privatePath = "system_config/admin_measurement_reconciliation/entries/report_production/current";
  const db = new FakeDb({ counts: { orders: ORDER_CAP + 1, telemetry_events: TELEMETRY_CAP + 1, [privatePath]: RECONCILIATION_CAP + 1 } });
  const result = await readMeasurementSources("2026-10-20T05:00:00.000Z", "2026-10-21T05:00:00.000Z", undefined, { db, isMock: false, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-2a417", nodeEnv: "test" });
  assert.equal(result.dataEnvironment, "live");
  assert.deepEqual([result.coverage.orders.status, result.coverage.telemetry.status, result.coverage.reconciliation.status], ["partial", "partial", "partial"]);
  assert.deepEqual([result.orders.length, result.telemetry.length, result.reconciliations.length], [ORDER_CAP, TELEMETRY_CAP, RECONCILIATION_CAP]);
  assert.ok(db.calls.includes(`limit:orders:${ORDER_CAP + 1}`));
  assert.ok(db.calls.includes(`limit:telemetry_events:${TELEMETRY_CAP + 1}`));
  assert.ok(db.calls.includes(`limit:${privatePath}:${RECONCILIATION_CAP + 1}`));
  assert.ok(db.calls.includes("where:telemetry_events:timestamp"));
  assert.equal(db.writes, 0);
  assert.equal(boundedSourceCoverage(ORDER_CAP + 10, ORDER_CAP).count, ORDER_CAP);
}

async function testReadFailureAndDeadlineAreLocalToSource() {
  const privatePath = "system_config/admin_measurement_reconciliation/entries/report_production/current";
  const failedDb = new FakeDb({ failures: new Set(["telemetry_events"]) });
  const failed = await readMeasurementSources(null, null, undefined, { db: failedDb, isMock: false, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-2a417", nodeEnv: "test" });
  assert.equal(failed.coverage.telemetry.status, "unavailable");
  assert.equal(failed.coverage.orders.status, "complete");
  const slowDb = new FakeDb({ delays: { [privatePath]: 40 } });
  const timed = await readMeasurementSources(null, null, undefined, { db: slowDb, isMock: false, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-2a417", nodeEnv: "test", deadlineMs: 1 });
  assert.equal(timed.coverage.reconciliation.status, "unavailable");
  assert.equal(timed.coverage.reconciliation.reason, "deadline");
  assert.equal(slowDb.writes, 0);
}

async function testV2AttributionIsProjectedWithSessionBinding() {
  const sessionId = "sess_current_123";
  const snapshot = {
    schemaVersion: 2,
    classifierVersion: "2026-11-05.1",
    persistence: "persistent",
    firstObservedTouch: { touchId: "touch_first_123", sessionId: "sess_first_123", source: "google", medium: "cpc", campaign: "spring", provenance: "utm", observedAtClientMs: 1792890000000, expiresAt: 1800666000000, clockQuality: "client_unanchored" },
    currentSessionTouch: { touchId: "touch_current_123", sessionId, source: "google", medium: "cpc", campaign: "spring", provenance: "utm", observedAtClientMs: 1792890000000, expiresAt: 1800666000000, clockQuality: "client_unanchored" },
  };
  const db = new FakeDb({ records: {
    orders: [{ id: "ord_v2", sessionId, attribution: { utmSource: "Google", utmMedium: "CPC", utmCampaign: "spring", attributionV2: snapshot } }],
    telemetry_events: [{ id: "evt_v2", eventName: "landing_viewed", sessionId, timestamp: Date.now(), metadata: { attributionV2: snapshot } }],
  } });
  const result = await readMeasurementSources(null, null, undefined, { db, isMock: false, expectedProject: "sendmynotes-2a417", actualProject: "sendmynotes-2a417", nodeEnv: "test" });
  assert.equal(result.orders[0].sessionId, sessionId);
  assert.equal(result.orders[0].attribution?.attributionV2 && (result.orders[0].attribution.attributionV2 as any).firstObservedTouch.campaign, "spring");
  assert.equal(result.telemetry[0].sessionKey, sessionId);
  assert.equal((result.telemetry[0].attributionV2 as any)?.currentSessionTouch.sessionId, sessionId);
  assert.ok(db.calls.some((call) => call.includes("metadata.attributionV2")), "source projection explicitly selects V2 telemetry snapshots");
}

async function main() {
  await testRuntimeGatesBeforeReads();
  await testIndependentCappedReadsNoWrites();
  await testReadFailureAndDeadlineAreLocalToSource();
  await testV2AttributionIsProjectedWithSessionBinding();
  process.stdout.write("admin measurement source tests passed\n");
}
void main();
