import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { createAdminCompPaymentRequest } from "@/lib/admin-comp-service";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await context.params;
    const paymentRequest = await createAdminCompPaymentRequest(id, actor);
    return NextResponse.json({ paymentRequest });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create payment request." }, { status: 400 });
  }
}
