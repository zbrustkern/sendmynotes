import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await getSystemConfig<{ amountCents: number; updatedAt: number }>("admin_ad_spend");
    return NextResponse.json({
      adSpendCents: doc?.amountCents || 0,
      updatedAt: doc?.updatedAt || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error reading ad spend";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const adSpendCents = typeof body.adSpendCents === "number" ? Math.max(0, Math.round(body.adSpendCents)) : 0;

    await setSystemConfig("admin_ad_spend", {
      amountCents: adSpendCents,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      adSpendCents,
      updatedAt: Date.now(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error updating ad spend";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
