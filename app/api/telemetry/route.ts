import { NextRequest, NextResponse } from "next/server";
import { ingestTelemetryEvent } from "@/lib/metrics-rollup";
import { TelemetryEvent } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    }

    const {
      eventName,
      sessionId,
      step,
      orderId,
      metadata,
      timestamp,
      path,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      gclid,
      referrer,
      landingPath,
      googleClientId,
      deviceType,
      screenResolution,
    } = body || {};

    if (!eventName || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Extract Edge Geo headers (Vercel, Cloudflare, etc.)
    const rawCity =
      req.headers.get("x-vercel-ip-city") ||
      req.headers.get("cf-ipcity") ||
      undefined;
    const ipRegion =
      req.headers.get("x-vercel-ip-country-region") ||
      req.headers.get("cf-region") ||
      undefined;
    const ipCountry =
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("cf-ipcountry") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    let ipCity: string | undefined = undefined;
    if (rawCity) {
      try {
        ipCity = decodeURIComponent(rawCity);
      } catch {
        ipCity = rawCity;
      }
    }

    const eventDoc: TelemetryEvent = {
      id: eventId,
      eventName,
      sessionId,
      ...(typeof step === "number" ? { step } : {}),
      ...(orderId ? { orderId } : {}),
      metadata: metadata || {},
      path: path || "/",
      timestamp: timestamp || Date.now(),
      createdAt: Date.now(),
      // Attribution
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      gclid,
      referrer,
      landingPath,
      // Identity & Tech
      googleClientId,
      deviceType,
      screenResolution,
      ipCity,
      ipRegion,
      ipCountry,
      userAgent,
    };

    // Persist event and update aggregated summary atomically
    await ingestTelemetryEvent(eventDoc);

    return NextResponse.json({ received: true, eventId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving telemetry";
    console.error("[Telemetry Ingestion Error]", msg);
    return NextResponse.json({ received: false, error: msg }, { status: 500 });
  }
}
