import { NextRequest, NextResponse } from "next/server";
import { ingestTelemetryEvent } from "@/lib/metrics-rollup";
import { TelemetryEvent } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventName, sessionId, step, orderId, metadata, timestamp, path } = body;

    if (!eventName || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const eventDoc: TelemetryEvent = {
      id: eventId,
      eventName,
      sessionId,
      step: typeof step === "number" ? step : undefined,
      orderId: orderId || undefined,
      metadata: metadata || {},
      path: path || "/",
      timestamp: timestamp || Date.now(),
      createdAt: Date.now(),
    };

    // Persist event and update aggregated summary atomically
    await ingestTelemetryEvent(eventDoc);

    return NextResponse.json({ received: true, eventId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving telemetry";
    console.debug("[Telemetry Ingestion Error]", msg);
    return NextResponse.json({ received: false, error: msg }, { status: 500 });
  }
}
