import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/upload/http";
import { readWeddingBody } from "@/lib/wedding/server";
import { safeId } from "@/lib/wedding/checkout";
import {
  getWeddingBatchDetailForAdmin,
  listWeddingBatchesForAdmin,
  pauseWeddingDispatch,
  releaseWeddingBatch,
  resumeWeddingDispatch,
  retryRejectedWeddingCards,
  runWeddingDispatchPass,
  syncWeddingDeliveryStatuses,
} from "@/lib/wedding/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authorized admin session required." },
      { status: 403, headers },
    );
  }
  try {
    const batchIdParam = req.nextUrl.searchParams.get("batchId");
    if (batchIdParam) {
      const detail = await getWeddingBatchDetailForAdmin(safeId(batchIdParam));
      return NextResponse.json({ detail }, { headers });
    }
    const list = await listWeddingBatchesForAdmin();
    return NextResponse.json(list, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load wedding batches.";
    return NextResponse.json({ error: message }, { status: 400, headers });
  }
}

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor || !isSameOrigin(req)) {
    return NextResponse.json(
      { error: "Authorized admin session required." },
      { status: 403, headers },
    );
  }
  try {
    const body = await readWeddingBody(req, 16384);
    const action = String(body.action || "");
    switch (action) {
      case "release": {
        const batchId = safeId(body.batchId);
        const released = await releaseWeddingBatch(batchId, actor);
        return NextResponse.json({ ok: true, released }, { headers });
      }
      case "pause": {
        const reason =
          typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : "Paused from admin portal";
        const control = await pauseWeddingDispatch({ reason, actor });
        return NextResponse.json({ ok: true, control }, { headers });
      }
      case "resume": {
        const reason =
          typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : "Resumed from admin portal";
        const control = await resumeWeddingDispatch({ reason, actor });
        return NextResponse.json({ ok: true, control }, { headers });
      }
      case "retry_rejected": {
        const batchId = safeId(body.batchId);
        const householdIds = Array.isArray(body.householdIds)
          ? body.householdIds.map((id) => safeId(id))
          : undefined;
        const retried = await retryRejectedWeddingCards(batchId, actor, householdIds);
        return NextResponse.json({ ok: true, retried }, { headers });
      }
      case "sync_status": {
        const batchId = body.batchId ? safeId(body.batchId) : undefined;
        const sync = await syncWeddingDeliveryStatuses({ batchId });
        return NextResponse.json({ ok: true, sync }, { headers });
      }
      case "run_pass": {
        const batchId = body.batchId ? safeId(body.batchId) : undefined;
        const pass = await runWeddingDispatchPass({ targetBatchId: batchId });
        return NextResponse.json({ ok: true, pass }, { headers });
      }
      default:
        return NextResponse.json({ error: "Unknown wedding batch action." }, { status: 400, headers });
    }
  } catch (error) {
    const status = (error as { status?: number }).status || 400;
    const message = error instanceof Error ? error.message : "Wedding batch action failed.";
    return NextResponse.json({ error: message }, { status, headers });
  }
}
