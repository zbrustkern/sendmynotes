import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getScenarioPerformanceMetrics } from "@/lib/metrics-rollup";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { scenarios, totalViews, totalOrders } = await getScenarioPerformanceMetrics();

    const overallConversion =
      totalViews > 0 ? ((totalOrders / totalViews) * 100).toFixed(1) : "0.0";

    const topPerformer =
      scenarios.find((m) => m.status === "top_performer")?.title ||
      scenarios[0]?.title ||
      "Job Interview Follow-Up";

    return NextResponse.json({
      metrics: scenarios,
      summary: {
        totalViews,
        totalOrders,
        overallConversionRate: overallConversion,
        topScenario: topPerformer,
        activeScenariosCount: scenarios.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching scenario analytics";
    console.error("[Admin Scenario Analytics Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
