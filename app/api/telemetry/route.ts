import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";
import { TELEMETRY_COLLECTION } from "@/lib/telemetry";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventName, sessionId, step, orderId, metadata, timestamp, path } = body;

    if (!eventName || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const eventDoc = {
      id: eventId,
      eventName,
      sessionId,
      step: typeof step === "number" ? step : null,
      orderId: orderId || null,
      metadata: metadata || {},
      path: path || "/",
      timestamp: timestamp || Date.now(),
      createdAt: Date.now(),
    };

    // Save to Firestore
    await firestoreDb.collection(TELEMETRY_COLLECTION).doc(eventId).set(eventDoc);

    return NextResponse.json({ received: true, eventId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving telemetry";
    console.debug("[Telemetry Ingestion Error]", msg);
    return NextResponse.json({ received: false, error: msg }, { status: 500 });
  }
}
