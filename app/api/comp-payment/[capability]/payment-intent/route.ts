import { NextRequest, NextResponse } from "next/server";
import { createCompPaymentIntent } from "@/lib/admin-comp-service";

export async function POST(_req: NextRequest, context: { params: Promise<{ capability: string }> }) {
  try {
    const { capability } = await context.params;
    const result = await createCompPaymentIntent(capability);
    if (!result) return NextResponse.json({ error: "Payment request is unavailable or expired." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare payment.";
    return NextResponse.json({ error: message }, { status: /staging|disabled|minimum/.test(message) ? 409 : 400 });
  }
}
