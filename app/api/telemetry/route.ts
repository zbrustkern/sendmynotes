import { NextRequest, NextResponse } from "next/server";
import { ingestTelemetryEvent } from "@/lib/metrics-rollup";
import { TelemetryEvent, TelemetryEventName } from "@/lib/types";
import {
  isAuthorityEvent,
  ALLOWED_BROWSER_EVENT_NAMES,
  sanitizeMetadata,
  sanitizeUrlOrPath,
  sanitizeAttribution,
  validateDeviceType,
  sanitizeScreenResolution,
  sanitizeGoogleClientId,
} from "@/lib/telemetry-schema";
import {
  ingestEventV2,
  buildEventV2Envelope,
  recordTelemetryCollectorRejection,
} from "@/lib/telemetry-v2";
import { classifyTrafficProvenance, resolveConsentState } from "@/lib/journey-identity";

const MAX_BODY_BYTES = 4096; // 4KB

// Sliding window rate limiter for telemetry ingestion
const ipStore = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 telemetry pings per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (ipStore.size > 2000) {
    for (const [k, timestamps] of ipStore.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        ipStore.delete(k);
      } else {
        ipStore.set(k, active);
      }
    }
  }

  const timestamps = (ipStore.get(ip) || []).filter((t) => t > windowStart);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  timestamps.push(now);
  ipStore.set(ip, timestamps);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    // 1. IP rate limiting
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "anonymous";
    if (isRateLimited(ip)) {
      await recordTelemetryCollectorRejection("rate_limited");
      return NextResponse.json({ error: "Too many telemetry requests" }, { status: 429 });
    }

    // 2. Body size check (reject > 4KB)
    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
      await recordTelemetryCollectorRejection("payload_too_large");
      return NextResponse.json({ error: "Payload exceeds 4KB limit" }, { status: 413 });
    }

    let body: any;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      await recordTelemetryCollectorRejection("invalid_payload");
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      await recordTelemetryCollectorRejection("invalid_payload");
      return NextResponse.json({ error: "Payload must be a JSON object" }, { status: 400 });
    }

    const eventName = body.eventName || body.event_name;
    const sessionId = body.sessionId || body.session_id;

    if (!eventName || typeof eventName !== "string" || !sessionId || typeof sessionId !== "string") {
      await recordTelemetryCollectorRejection("missing_required_fields");
      return NextResponse.json({ error: "Missing required fields (eventName, sessionId)" }, { status: 400 });
    }

    // 3. Purchase authority check: browser POST of authority events is strictly rejected
    if (isAuthorityEvent(eventName)) {
      await recordTelemetryCollectorRejection("browser_authority_rejected");
      return NextResponse.json(
        { error: "Forbidden: Authority events cannot be ingested via browser telemetry" },
        { status: 403 }
      );
    }

    // 4. Allowed browser event check
    if (!ALLOWED_BROWSER_EVENT_NAMES.has(eventName)) {
      await recordTelemetryCollectorRejection("unknown_event_name");
      return NextResponse.json(
        { error: `Unknown or disallowed browser telemetry event: ${eventName}` },
        { status: 400 }
      );
    }

    // 5. Metadata hygiene: per-event allowlist schemas
    const rawMetadata = body.metadata || body.properties;
    const { sanitized: sanitizedMetadata, error: metadataError } = sanitizeMetadata(
      eventName,
      rawMetadata
    );
    if (metadataError) {
      await recordTelemetryCollectorRejection("invalid_metadata");
      return NextResponse.json({ error: metadataError }, { status: 400 });
    }

    // 6. URL hygiene: path, referrer, landingPath reduced to origin + pathname
    const rawPath = body.path || body.route_template;
    const cleanPath = sanitizeUrlOrPath(rawPath) || "/";
    const cleanReferrer = sanitizeUrlOrPath(body.referrer);
    const cleanLandingPath = sanitizeUrlOrPath(body.landingPath);

    // 7. Attribution hygiene: allowlisted keys, length-bounded, email stripped
    const cleanUtmSource = sanitizeAttribution(body.utmSource);
    const cleanUtmMedium = sanitizeAttribution(body.utmMedium);
    const cleanUtmCampaign = sanitizeAttribution(body.utmCampaign);
    const cleanUtmContent = sanitizeAttribution(body.utmContent);
    const cleanUtmTerm = sanitizeAttribution(body.utmTerm);
    const cleanGclid = sanitizeAttribution(body.gclid, 255);
    const cleanFbclid = sanitizeAttribution(body.fbclid, 255);

    // 8. Common context
    const cleanExpVersion =
      typeof body.experienceVersion === "string"
        ? body.experienceVersion.trim().slice(0, 50)
        : typeof body.experience_version === "string"
        ? body.experience_version.trim().slice(0, 50)
        : undefined;

    const cleanDraftRev =
      typeof body.draftRevision === "number" && Number.isFinite(body.draftRevision)
        ? body.draftRevision
        : undefined;

    // Honor client-supplied eventId / event_id for idempotent retry deduplication
    const rawClientEventId = body.eventId || body.event_id || body.id;
    const clientEventId =
      typeof rawClientEventId === "string" && /^[a-zA-Z0-9_-]{6,100}$/.test(rawClientEventId.trim())
        ? rawClientEventId.trim()
        : undefined;
    const eventId = clientEventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const cookieFounder = req.cookies.get("smn_founder_device")?.value === "1";
    const isFounder = Boolean(body.is_founder || body.isFounder || cookieFounder);
    const rawClientId = body.clientId || body.anonymous_id;
    const clientId = typeof rawClientId === "string" ? rawClientId.slice(0, 100) : undefined;
    const secGpc = req.headers.get("sec-gpc") === "1";

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
    const isBot = /bot|crawler|spider|googlebot|bingbot|yandex|baidu|slurp|duckduckgo|semrush|ahrefs|lighthouse|headless|facebookexternalhit|whatsapp|twitterbot|pingdom|uptimerobot/i.test(
      userAgent || ""
    );

    let ipCity: string | undefined = undefined;
    if (rawCity) {
      try {
        ipCity = decodeURIComponent(rawCity);
      } catch {
        ipCity = rawCity;
      }
    }

    // 9. Build and Ingest Event V2 Envelope with Deduplication
    const classification = classifyTrafficProvenance({
      isFounderFlag: isFounder,
      isBot,
      userAgent,
    });
    const consentState = resolveConsentState({
      secGpcHeader: secGpc ? "1" : null,
    });

    const envelope = buildEventV2Envelope({
      event_name: eventName,
      event_id: eventId,
      session_id: sessionId.trim().slice(0, 100),
      anonymous_id: clientId,
      journey_id: typeof body.journeyId === "string" ? body.journeyId : typeof body.journey_id === "string" ? body.journey_id : undefined,
      order_id: typeof body.orderId === "string" ? body.orderId.trim().slice(0, 100) : typeof body.order_id === "string" ? body.order_id.trim().slice(0, 100) : undefined,
      payment_attempt_id: typeof body.payment_attempt_id === "string" ? body.payment_attempt_id : undefined,
      request_id: typeof body.request_id === "string" ? body.request_id : undefined,
      trace_id: typeof body.trace_id === "string" ? body.trace_id : undefined,
      route_template: cleanPath,
      experience_version: cleanExpVersion,
      degraded_identity: Boolean(body.degradedIdentity || body.degraded_identity),
      classification,
      consent_state: consentState,
      properties: {
        ...sanitizedMetadata,
        ...(cleanUtmSource ? { utmSource: cleanUtmSource } : {}),
        ...(cleanUtmMedium ? { utmMedium: cleanUtmMedium } : {}),
        ...(cleanUtmCampaign ? { utmCampaign: cleanUtmCampaign } : {}),
        ...(cleanReferrer ? { referrer: cleanReferrer } : {}),
      },
      source: "browser",
      occurred_at: typeof body.timestamp === "number" ? body.timestamp : typeof body.occurred_at === "number" ? body.occurred_at : undefined,
    });

    const v2Result = await ingestEventV2(envelope);

    if (v2Result.duplicate) {
      return NextResponse.json({
        received: true,
        accepted: true,
        duplicate: true,
        eventId: v2Result.eventId,
        dedupeKey: v2Result.dedupeKey,
      });
    }

    // 10. Persist Legacy Telemetry Event
    const eventDoc: TelemetryEvent = {
      id: eventId,
      eventName: eventName as TelemetryEventName,
      sessionId: sessionId.trim().slice(0, 100),
      ...(typeof body.step === "number" && Number.isFinite(body.step) ? { step: body.step } : {}),
      ...(typeof body.orderId === "string" ? { orderId: body.orderId.trim().slice(0, 100) } : {}),
      metadata: sanitizedMetadata,
      path: cleanPath,
      timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      createdAt: Date.now(),
      experienceVersion: cleanExpVersion,
      draftRevision: cleanDraftRev,
      // Attribution
      utmSource: cleanUtmSource,
      utmMedium: cleanUtmMedium,
      utmCampaign: cleanUtmCampaign,
      utmContent: cleanUtmContent,
      utmTerm: cleanUtmTerm,
      gclid: cleanGclid,
      fbclid: cleanFbclid,
      referrer: cleanReferrer,
      landingPath: cleanLandingPath,
      // Identity & Tech
      googleClientId: sanitizeGoogleClientId(body.googleClientId),
      deviceType: validateDeviceType(body.deviceType),
      screenResolution: sanitizeScreenResolution(body.screenResolution),
      ipCity,
      ipRegion,
      ipCountry,
      userAgent: userAgent ? userAgent.slice(0, 300) : undefined,
      isBot,
      clientId,
      ...(isFounder ? { isFounder: true, is_founder: true } : {}),
    };

    await ingestTelemetryEvent(eventDoc);

    return NextResponse.json({
      received: true,
      accepted: true,
      duplicate: false,
      eventId,
      dedupeKey: v2Result.dedupeKey,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving telemetry";
    console.error("[Telemetry Ingestion Error]", msg);
    await recordTelemetryCollectorRejection("internal_error");
    return NextResponse.json({ received: false, error: msg }, { status: 500 });
  }
}
