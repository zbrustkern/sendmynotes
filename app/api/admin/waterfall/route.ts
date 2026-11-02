import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import {
  aggregateWaterfallReport,
  InvalidWaterfallScope,
  normalizeWaterfallScope,
} from "@/lib/admin-waterfall-report";
import {
  readWaterfallSources,
  WATERFALL_ORDER_CAP,
  WATERFALL_TELEMETRY_CAP,
} from "@/lib/admin-waterfall-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, x-admin-key",
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }

  const asOf = new Date();
  let scope;
  try {
    scope = normalizeWaterfallScope(req.nextUrl.searchParams, asOf);
  } catch (error) {
    if (error instanceof InvalidWaterfallScope) {
      return NextResponse.json(
        { error: error.message || "Invalid report scope" },
        { status: 400, headers: PRIVATE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: "Invalid report scope" },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }

  try {
    const sources = await readWaterfallSources(
      scope.startUtc,
      scope.endUtc,
      scope.startDate,
      scope.endDate
    );

    const report = aggregateWaterfallReport({
      asOf,
      scope,
      orders: sources.orders,
      ordersCount: sources.ordersCount,
      ordersCap: WATERFALL_ORDER_CAP,
      telemetry: sources.telemetry,
      telemetryCount: sources.telemetryCount,
      telemetryCap: WATERFALL_TELEMETRY_CAP,
      reconciliations: sources.reconciliations,
      adSpendRecords: sources.adSpendRecords,
      sources: sources.sources,
    });

    return NextResponse.json(report, { status: 200, headers: PRIVATE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error generating waterfall report";
    return NextResponse.json(
      { error: message, asOf: asOf.toISOString() },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}
