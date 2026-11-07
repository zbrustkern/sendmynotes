import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { correctRejectedMultiSendDelivery, type MultiSendRecipient } from "@/lib/multi-send/orders";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await req.json();
    const address = body.address;
    if (!address || typeof address !== "object") return NextResponse.json({ error: "Corrected address is required." }, { status: 400 });
    const result = await correctRejectedMultiSendDelivery({
      orderId: String(body.orderId || ""), recipientId: String(body.recipientId || ""),
      expectedStateVersion: Number(body.expectedStateVersion), address: address as MultiSendRecipient["address"],
      reason: String(body.reason || ""), idempotencyKey: String(body.idempotencyKey || ""), actor,
      confirmBillableDispatch: body.confirmBillableDispatch === true,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Correction was not accepted." }, { status: 409 });
  }
}
