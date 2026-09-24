import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getAdminDashboardMetrics } from "@/lib/metrics-rollup";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to admin metrics" }, { status: 401 });
    }

    const metrics = await getAdminDashboardMetrics();
    return NextResponse.json(metrics);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error compiling admin metrics";
    console.error("[Admin Metrics Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

