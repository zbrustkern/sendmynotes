import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import {
  evaluateCohortAndFunnelReport,
  queryReportingDrilldown,
  runAnalyticsProjectionReplay,
} from "@/lib/reporting-engine";
import { GlobalReportScope, ReportingMode } from "@/lib/contracts/admin-overhaul";
import { adminEnvironmentMatches, configuredAdminEnvironment } from "@/lib/admin-environment";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to reporting API" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const requestedEnvironment = searchParams.get("environment") || configuredAdminEnvironment();
    if (!adminEnvironmentMatches(requestedEnvironment as any)) {
      return NextResponse.json({ error: "Requested environment is not available from this configured datastore.", requestedEnvironment }, { status: 409 });
    }
    const view = searchParams.get("view") || "overview";
    const dateRange = searchParams.get("dateRange") || "oct13";
    const excludeFounderParam = searchParams.get("excludeFounder");
    const excludeFounder = excludeFounderParam !== null ? excludeFounderParam === "true" : true;
    const channel = searchParams.get("channel") || "all";
    const mode = (searchParams.get("mode") as ReportingMode) || "customer_reporting";
    const deviceParam = searchParams.get("device");
    const deviceCategory = deviceParam === "mobile" || deviceParam === "desktop" || deviceParam === "tablet"
      ? deviceParam
      : "all";
    const timezoneParam = searchParams.get("timezone") || "America/Chicago";
    let timezone = "America/Chicago";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezoneParam });
      timezone = timezoneParam;
    } catch {
      // Use the canonical default for invalid timezone input.
    }
    const metricKey = searchParams.get("metricKey") || "all_sessions";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const cursor = searchParams.get("cursor") || undefined;

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const scope: GlobalReportScope = {
      window: {
        start: fromParam || "",
        end: toParam || "",
        label: dateRange,
      },
      timezone,
      environment: requestedEnvironment as GlobalReportScope["environment"],
      mode,
      channel: channel !== "all" ? channel : undefined,
      deviceCategory,
      experienceVersion: searchParams.get("experienceVersion") || undefined,
      excludeFounder,
    };

    if (view === "drilldown") {
      const drilldown = await queryReportingDrilldown({
        metricKey,
        scope,
        limit,
        cursor,
      });
      return NextResponse.json(drilldown);
    }

    if (view === "export") {
      const drilldown = await queryReportingDrilldown({
        metricKey,
        scope,
        limit: 1000,
      });

      const exportFormat = searchParams.get("format") || "json";
      if (exportFormat === "csv") {
        // Return simple CSV representation of items
        const items = drilldown.items;
        if (items.length === 0) {
          return new NextResponse("empty_export", {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="report_${metricKey}.csv"`,
            },
          });
        }
        const headers = Object.keys(items[0]).join(",");
        const rows = items.map((it) =>
          Object.values(it)
            .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
            .join(",")
        );
        const csvContent = [headers, ...rows].join("\n");
        return new NextResponse(csvContent, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="report_${metricKey}.csv"`,
          },
        });
      }

      return NextResponse.json(drilldown);
    }

    // Default overview
    const overview = await evaluateCohortAndFunnelReport({
      scope,
      sessionLimit: limit,
    });

    return NextResponse.json(overview);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing reporting query";
    console.error("[Reporting API Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to reporting actions" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || "replay";

    if (action === "replay") {
      const result = await runAnalyticsProjectionReplay({
        from: typeof body.from === "number" ? body.from : undefined,
        to: typeof body.to === "number" ? body.to : undefined,
        dryRun: Boolean(body.dryRun),
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown reporting action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing reporting action";
    console.error("[Reporting API Action Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
