import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getAdminDashboardMetrics } from "@/lib/metrics-rollup";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to admin metrics" }, { status: 401 });
    }

    const dateRange = req.nextUrl.searchParams.get("dateRange") || "oct13";
    const excludeFounderParam = req.nextUrl.searchParams.get("excludeFounder");
    const excludeFounder = excludeFounderParam !== null ? excludeFounderParam === "true" : true;
    const channel = req.nextUrl.searchParams.get("channel") || "all";
    const customFromStr = req.nextUrl.searchParams.get("from");
    const customToStr = req.nextUrl.searchParams.get("to");
    const customFrom = customFromStr ? Number(customFromStr) : undefined;
    const customTo = customToStr ? Number(customToStr) : undefined;

    const metrics = await getAdminDashboardMetrics({
      dateRange,
      excludeFounder,
      channel,
      customFrom,
      customTo,
    });

    return NextResponse.json(metrics);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error compiling admin metrics";
    console.error("[Admin Metrics Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
