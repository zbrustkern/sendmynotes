import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runMultiSendWorkerPass } from "@/lib/multi-send/orders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req, "MULTI_SEND_WORKER_SECRET")) return NextResponse.json({ error: "Multi-send worker authorization is required.", code: "unauthorized" }, { status: 401, headers });
  try {
    const outcome = await runMultiSendWorkerPass();
    return NextResponse.json({ data: outcome.data }, { status: outcome.status, headers });
  } catch {
    return NextResponse.json({ error: "Multi-send queue needs operator attention.", code: "queue_unavailable" }, { status: 503, headers });
  }
}
