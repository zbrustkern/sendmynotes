import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";

const DESTINATIONS = new Set(["google_ads", "ga4"]);
const STATES = new Set(["queued", "retrying", "retry_exhausted", "suppressed"]);
const MAX_BODY_BYTES = 4096;
const requestTimesByIp = new Map<string, number[]>();

function isRateLimited(ip: string, now: number): boolean {
  const cutoff = now - 60_000;
  if (requestTimesByIp.size > 2000) {
    for (const [key, entries] of requestTimesByIp) {
      const live = entries.filter((entry) => entry > cutoff);
      if (live.length) requestTimesByIp.set(key, live);
      else requestTimesByIp.delete(key);
    }
  }
  const entries = (requestTimesByIp.get(ip) || []).filter((entry) => entry > cutoff);
  if (entries.length >= 60) return true;
  entries.push(now);
  requestTimesByIp.set(ip, entries);
  return false;
}

const stateRank: Record<string, number> = { retrying: 1, suppressed: 2, retry_exhausted: 2, queued: 3 };

/** First-party, non-authoritative queue observation. Deliberately excludes attribution and identity fields. */
export async function POST(req: NextRequest) {
  try {
    const now = Date.now();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
    if (isRateLimited(ip, now)) return NextResponse.json({ received: false }, { status: 429 });
    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ received: false }, { status: 413 });
    let body: any;
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { return NextResponse.json({ received: false }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ received: false }, { status: 400 });
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const destination = typeof body?.destination === "string" ? body.destination : "";
    const state = typeof body?.state === "string" ? body.state : "";
    const timestamp = typeof body?.timestamp === "number" && Number.isFinite(body.timestamp)
      ? Math.min(now, Math.max(now - 5 * 60_000, body.timestamp))
      : now;

    if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId) || !DESTINATIONS.has(destination) || !STATES.has(state)) {
      return NextResponse.json({ received: false }, { status: 400 });
    }

    // One bounded document per order/destination; client retries cannot create an unbounded write stream.
    const id = `queue_${orderId}_${destination}`;
    const ref = firestoreDb.collection("telemetry_events").doc(id);
    await firestoreDb.runTransaction(async (transaction: any) => {
      const existingSnapshot = await transaction.get(ref);
      const previous = existingSnapshot.exists ? existingSnapshot.data() : null;
      const queuedCannotRegress = previous?.state === "queued" && state !== "queued";
      const newer = !queuedCannotRegress && (!previous || now > (previous.createdAt || 0) ||
        (now === (previous.createdAt || 0) && (stateRank[state] || 0) > (stateRank[previous.state] || 0)));
      if (!newer) return;
      transaction.set(ref, {
        id,
        eventName: "conversion_queue_observed",
        orderId,
        destination,
        state,
        path: "/api/telemetry/conversion-queue",
        timestamp,
        createdAt: now,
      });
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
