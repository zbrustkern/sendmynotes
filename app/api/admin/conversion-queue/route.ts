import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderId)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });

  try {
    const latest: Record<string, { state: string; timestamp: number; clientReported: true }> = {};
    for (const destination of ["google_ads", "ga4"]) {
      const docId = `queue_${orderId}_${destination}`;
      const snapshot = await firestoreDb.collection("telemetry_events").doc(docId).get();
      if (!snapshot.exists) continue;
      const event = snapshot.data();
      if (event?.eventName !== "conversion_queue_observed" || event.orderId !== orderId || event.destination !== destination ||
          !["queued", "retrying", "retry_exhausted", "suppressed"].includes(event.state)) continue;
      latest[destination] = {
        state: event.state,
        timestamp: typeof event.timestamp === "number" ? event.timestamp : 0,
        clientReported: true,
      };
    }
    return NextResponse.json({ observations: latest });
  } catch {
    return NextResponse.json({ error: "Unable to read queue observations" }, { status: 500 });
  }
}
