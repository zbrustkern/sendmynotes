import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getAdminDashboardMetrics } from "@/lib/metrics-rollup";
import { evaluateCohortAndFunnelReport } from "@/lib/reporting-engine";
import { REPORTING_POLICY_VERSION, GlobalReportScope } from "@/lib/contracts/admin-overhaul";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to admin metrics" }, { status: 401 });
    }

    const version = req.nextUrl.searchParams.get("version");
    const dateRange = req.nextUrl.searchParams.get("dateRange") || "oct13";
    const excludeFounderParam = req.nextUrl.searchParams.get("excludeFounder");
    const excludeFounder = excludeFounderParam !== null ? excludeFounderParam === "true" : true;
    const channel = req.nextUrl.searchParams.get("channel") || "all";
    const customFromStr = req.nextUrl.searchParams.get("from");
    const customToStr = req.nextUrl.searchParams.get("to");
    const customFrom = customFromStr ? Number(customFromStr) : undefined;
    const customTo = customToStr ? Number(customToStr) : undefined;

    if (version === "v2") {
      const scope: GlobalReportScope = {
        window: {
          start: customFromStr || "",
          end: customToStr || "",
          label: dateRange,
        },
        timezone: "America/Chicago",
        mode: "customer_reporting",
        channel: channel !== "all" ? channel : undefined,
        excludeFounder,
      };

      const overview = await evaluateCohortAndFunnelReport({ scope });
      return NextResponse.json(overview);
    }

    const metrics = await getAdminDashboardMetrics({
      dateRange,
      excludeFounder,
      channel,
      customFrom,
      customTo,
    });

    // Attach reporting policy version and storage disclosure metadata
    const responseWithMetadata = {
      ...metrics,
      reportingPolicyVersion: REPORTING_POLICY_VERSION,
      storage: {
        adapterType: "firestore_bounded",
        cloudWarehouseStatus: "not_provisioned",
      },
    };

    return NextResponse.json(responseWithMetadata);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error compiling admin metrics";
    console.error("[Admin Metrics Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
