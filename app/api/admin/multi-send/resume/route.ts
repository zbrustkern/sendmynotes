import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { resumeHeldMultiSend } from "@/lib/multi-send/orders";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await req.json();
    const result = await resumeHeldMultiSend({ orderId: String(body.orderId || ""), reason: String(body.reason || ""), idempotencyKey: String(body.idempotencyKey || ""), actor });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume requires operator review." }, { status: 409 });
  }
}
