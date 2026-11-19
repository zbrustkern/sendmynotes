import { NextRequest, NextResponse } from "next/server";
import { weddingSchedulerAuthorized } from "@/lib/wedding/scheduler-auth";
import {
  heldPaymentRuntime,
  runWeddingReconciliation,
} from "@/lib/wedding/checkout";
import { reconcilePendingWeddingRefunds } from "@/lib/wedding/refunds";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: NextRequest) {
  if (!(await weddingSchedulerAuthorized(req)))
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers },
    );
  if (!heldPaymentRuntime())
    return NextResponse.json(
      { error: "Staging test payments are required." },
      { status: 503, headers },
    );
  try {
    const [batches, refunds] = await Promise.all([
      runWeddingReconciliation(),
      reconcilePendingWeddingRefunds(),
    ]);
    return NextResponse.json({ batches, refunds }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Wedding reconciliation requires attention." },
      { status: 503, headers },
    );
  }
}
