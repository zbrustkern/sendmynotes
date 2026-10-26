import { NextRequest, NextResponse } from "next/server";
import { normalizeReportScope, InvalidReportScope, aggregateMeasurementReport } from "@/lib/admin-measurement-report";
import type { MeasurementSources } from "@/lib/admin-measurement-source";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Cookie, x-admin-key" };

export async function handleAdminMeasurementReport(
  req: NextRequest,
  dependencies: {
    authorize: () => boolean | Promise<boolean>;
    readSources: (startUtc: string | null, endUtc: string | null) => Promise<MeasurementSources>;
    clock?: () => Date;
  }
) {
  if (!(await dependencies.authorize())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const asOf = (dependencies.clock ?? (() => new Date()))();
  let scope;
  try { scope = normalizeReportScope(req.nextUrl.searchParams, asOf); }
  catch (error) {
    if (error instanceof InvalidReportScope) return NextResponse.json({ error: "Invalid report scope" }, { status: 400, headers: PRIVATE_HEADERS });
    return NextResponse.json({ error: "Invalid report scope" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  try {
    const sources = await dependencies.readSources(scope.startUtc, scope.endUtc);
    const report = aggregateMeasurementReport({ asOf, dataEnvironment: sources.dataEnvironment, scope, orders: sources.orders,
      orderCoverage: sources.coverage.orders, telemetryCoverage: sources.coverage.telemetry,
      reconciliationCoverage: sources.coverage.reconciliation, reconciliations: sources.reconciliations,
      telemetry: sources.telemetry, telemetrySampled: sources.coverage.telemetry.status !== "complete" });
    if (sources.coverage.orders.status === "unavailable") return NextResponse.json({ ...report, status: "unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
    return NextResponse.json(report, { status: 200, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "measurement_report_unavailable", asOf: asOf.toISOString() }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
