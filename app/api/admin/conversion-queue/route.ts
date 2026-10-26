import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });

  try {
    const snapshot = await firestoreDb.collection("telemetry_events").where("orderId", "==", orderId).limit(100).get();
    const latest: Record<string, { state: string; timestamp: number; clientReported: true }> = {};
    snapshot.forEach((doc: any) => {
      const event = doc.data();
      if (event?.eventName !== "conversion_queue_observed" || !["google_ads", "ga4"].includes(event.destination) ||
          !["queued", "retrying", "retry_exhausted", "suppressed"].includes(event.state)) return;
      const timestamp = typeof event.timestamp === "number" ? event.timestamp : 0;
      if (!latest[event.destination] || timestamp > latest[event.destination].timestamp) {
        latest[event.destination] = { state: event.state, timestamp, clientReported: true };
      }
    });
    return NextResponse.json({ observations: latest });
  } catch {
    return NextResponse.json({ error: "Unable to read queue observations" }, { status: 500 });
  }
}
