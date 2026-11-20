import { NextRequest, NextResponse } from "next/server";
import { weddingSchedulerAuthorized } from "@/lib/wedding/scheduler-auth";
import {
  resolveWeddingPaymentRuntime,
  runWeddingReconciliation,
} from "@/lib/wedding/checkout";
import { reconcilePendingWeddingRefunds } from "@/lib/wedding/refunds";
import {
  runWeddingDispatchPass,
  syncWeddingDeliveryStatuses,
} from "@/lib/wedding/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  if (!(await weddingSchedulerAuthorized(req)))
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers },
    );
  if (!resolveWeddingPaymentRuntime())
    return NextResponse.json(
      { error: "Wedding payment runtime is unavailable." },
      { status: 503, headers },
    );
  try {
    const [batches, refunds] = await Promise.all([
      runWeddingReconciliation(),
      reconcilePendingWeddingRefunds(),
    ]);
    const dispatch = await runWeddingDispatchPass();
    const statusSync = await syncWeddingDeliveryStatuses();
    return NextResponse.json(
      { batches, refunds, dispatch, statusSync },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Wedding reconciliation requires attention." },
      { status: 503, headers },
    );
  }
}
