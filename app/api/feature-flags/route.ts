import { NextRequest, NextResponse } from "next/server";
import { getFeatureFlagsState, isReworkV3Enabled } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    const state = await getFeatureFlagsState();
    const reworkV3Effective = await isReworkV3Enabled(req);

    return NextResponse.json({
      flags: state.flags,
      reworkV3Effective,
      updatedAt: state.updatedAt,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error reading feature flags";
    console.error("[Public Feature Flags GET Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
