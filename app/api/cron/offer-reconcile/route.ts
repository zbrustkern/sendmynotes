import { NextRequest, NextResponse } from "next/server";
import { offerSchedulerAuthorized } from "@/lib/offer-scheduler-auth";
import { reconcileOfferReservations } from "@/lib/offer-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  if (!await offerSchedulerAuthorized(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    return NextResponse.json(await reconcileOfferReservations(), { headers });
  } catch {
    return NextResponse.json({ error: "Offer reconciliation could not complete." }, { status: 503, headers });
  }
}
