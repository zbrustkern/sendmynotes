import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getFeatureFlagsState, updateFeatureFlag } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const state = await getFeatureFlagsState();

    return NextResponse.json({
      flags: state.flags,
      updatedAt: state.updatedAt,
      updatedBy: state.updatedBy,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching feature flags";
    console.error("[Admin Feature Flags GET Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { flagKey, enabled } = body;

    if (typeof flagKey !== "string" || !flagKey.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'flagKey'. String expected." },
        { status: 400 }
      );
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Missing or invalid 'enabled'. Boolean expected." },
        { status: 400 }
      );
    }

    const updatedFlags = await updateFeatureFlag(flagKey.trim(), enabled, "admin");

    return NextResponse.json({
      success: true,
      flags: updatedFlags,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error updating feature flag";
    console.error("[Admin Feature Flags POST Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
