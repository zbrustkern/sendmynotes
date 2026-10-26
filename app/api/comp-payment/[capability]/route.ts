import { NextRequest, NextResponse } from "next/server";
import { getCompPaymentPage } from "@/lib/admin-comp-service";

export async function GET(_req: NextRequest, context: { params: Promise<{ capability: string }> }) {
  const { capability } = await context.params;
  const page = await getCompPaymentPage(capability);
  if (!page) return NextResponse.json({ error: "Payment request is unavailable or expired." }, { status: 404 });
  return NextResponse.json(page.response);
}
