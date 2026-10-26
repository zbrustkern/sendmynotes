import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminMeasurementReport } from "@/lib/admin-measurement-handler";
import type { MeasurementSources } from "@/lib/admin-measurement-source";

const sourceFixture: MeasurementSources = {
  orders: [], telemetry: [], reconciliations: [], dataEnvironment: "synthetic",
  coverage: { orders: { status: "complete", count: 0, cap: 2000 }, telemetry: { status: "complete", count: 0, cap: 500 }, reconciliation: { status: "complete", count: 0, cap: 100 } },
};

async function run() {
  let reads = 0;
  let authorized = false;
  let frozenClockCalls = 0;
  const clock = () => { frozenClockCalls++; return new Date("2026-03-08T16:00:00Z"); };
  const readSources = async () => { reads++; return sourceFixture; };
  const unauthorized = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?invalid=1"), { authorize: () => authorized, readSources, clock });
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0);
  const malformed = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?period=today&period=all"), { authorize: () => true, readSources, clock });
  assert.equal(malformed.status, 400);
  assert.equal(reads, 0);
  const extra = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?period=today&surprise=1"), { authorize: () => true, readSources, clock });
  assert.equal(extra.status, 400);
  assert.equal(reads, 0);
  const wrongBounds = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?period=today&start=2026-03-08&end=2026-03-08"), { authorize: () => true, readSources, clock });
  assert.equal(wrongBounds.status, 400);
  assert.equal(reads, 0);
  const response = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?period=custom&start=2026-03-08&end=2026-03-08"), { authorize: () => true, readSources, clock });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.dataEnvironment, "synthetic");
  assert.equal(body.scope.startUtc, "2026-03-08T06:00:00.000Z");
  assert.equal(reads, 1);
  assert.equal(frozenClockCalls, 4);
  const failed = await handleAdminMeasurementReport(new NextRequest("http://localhost/api/admin/measurement-report?period=all"), { authorize: () => true, readSources: async () => { throw new Error("fixture unavailable"); }, clock });
  assert.equal(failed.status, 503);
  process.stdout.write("admin measurement handler tests passed\n");
}

run().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; });
