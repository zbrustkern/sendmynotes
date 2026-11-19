import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/upload/http";
import { readWeddingBody } from "@/lib/wedding/server";
import { safeId } from "@/lib/wedding/checkout";
import { refundWeddingCard } from "@/lib/wedding/refunds";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor || !isSameOrigin(req))
    return NextResponse.json(
      { error: "Authorized admin session required." },
      { status: 403 },
    );
  try {
    const body = await readWeddingBody(req, 2048);
    const receipt = await refundWeddingCard(
      safeId(body.batchId),
      safeId(body.householdId),
      safeId(body.idempotencyKey),
      actor,
    );
    return NextResponse.json(receipt, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          "Refund was not confirmed. Check the card or reconcile the existing request.",
      },
      { status: (error as { status?: number }).status || 409 },
    );
  }
}
