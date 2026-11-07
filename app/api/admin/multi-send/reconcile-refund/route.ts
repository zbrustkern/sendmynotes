import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { reconcileMultiSendRefund } from "@/lib/multi-send/refunds";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await req.json();
    const result = await reconcileMultiSendRefund({ orderId: String(body.orderId || ""), recipientId: String(body.recipientId || ""), actor });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refund reconciliation needs operator attention." }, { status: 409 });
  }
}
