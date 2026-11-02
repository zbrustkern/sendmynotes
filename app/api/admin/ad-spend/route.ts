import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";
import {
  commitDatedSpendImport,
  queryDatedSpend,
} from "@/lib/spend-and-cost-ledger";
import { formatDateInTimezone } from "@/lib/reporting-engine";
import { REPORTING_POLICY_VERSION } from "@/lib/contracts/admin-overhaul";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await getSystemConfig<{ amountCents: number; updatedAt: number }>("admin_ad_spend");
    const today = formatDateInTimezone(Date.now(), "America/Chicago");
    const datedSpend = await queryDatedSpend({ startDate: today, endDate: today });
    const todaySpendCents = datedSpend.reduce((acc, r) => acc + r.amountCents, 0);

    return NextResponse.json({
      adSpendCents: doc?.amountCents || todaySpendCents || 0,
      todaySpendCents,
      updatedAt: doc?.updatedAt || null,
      reportingPolicyVersion: REPORTING_POLICY_VERSION,
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
    const channel = body.channel || "Google CPC";
    const date = body.date || formatDateInTimezone(Date.now(), "America/Chicago");

    // 1. Update legacy system config
    await setSystemConfig("admin_ad_spend", {
      amountCents: adSpendCents,
      updatedAt: Date.now(),
    });

    // 2. Synchronize to dated spend ledger
    await commitDatedSpendImport(
      [
        {
          date,
          channel,
          amountCents: adSpendCents,
          source: "manual_entry",
          isEstimate: false,
          notes: "Synchronized from admin ad-spend API",
        },
      ],
      "admin_api"
    );

    return NextResponse.json({
      success: true,
      adSpendCents,
      date,
      channel,
      updatedAt: Date.now(),
      reportingPolicyVersion: REPORTING_POLICY_VERSION,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error updating ad spend";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
