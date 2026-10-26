import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";

const DESTINATIONS = new Set(["google_ads", "ga4"]);
const STATES = new Set(["queued", "retrying", "retry_exhausted", "suppressed"]);

/** First-party, non-authoritative queue observation. Deliberately excludes attribution and identity fields. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const destination = typeof body?.destination === "string" ? body.destination : "";
    const state = typeof body?.state === "string" ? body.state : "";
    const now = Date.now();
    const timestamp = typeof body?.timestamp === "number" && Number.isFinite(body.timestamp)
      ? Math.min(now, Math.max(now - 5 * 60_000, body.timestamp))
      : now;

    if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId) || !DESTINATIONS.has(destination) || !STATES.has(state)) {
      return NextResponse.json({ received: false }, { status: 400 });
    }

    const id = `evt_queue_${crypto.randomUUID()}`;
    await firestoreDb.collection("telemetry_events").doc(id).set({
      id,
      eventName: "conversion_queue_observed",
      orderId,
      destination,
      state,
      path: "/api/telemetry/conversion-queue",
      timestamp,
      createdAt: now,
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
