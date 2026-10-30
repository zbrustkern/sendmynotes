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
  sanitizeGoogleClientIdNormalized,
} from "@/lib/telemetry-schema";

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
      return NextResponse.json({ error: "Too many telemetry requests" }, { status: 429 });
    }

    // 2. Body size check (reject > 4KB)
    const rawText = await req.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload exceeds 4KB limit" }, { status: 413 });
    }

    let body: any;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Payload must be a JSON object" }, { status: 400 });
    }

    // The current browser emitter uses the V2 envelope. Normalize its naming
    // before the same authority, size, event and metadata checks as legacy pings.
    if (body.schema_version === "v2.0") {
      body = {
        eventId: body.event_id, eventName: body.event_name, sessionId: body.session_id,
        orderId: body.order_id, timestamp: body.occurred_at, path: body.route_template,
        experienceVersion: body.experience_version, clientId: body.anonymous_id,
        metadata: body.properties,
        utmSource: body.properties?.utmSource, utmMedium: body.properties?.utmMedium,
        utmCampaign: body.properties?.utmCampaign, referrer: body.properties?.referrer,
        deviceType: body.properties?.device_category,
      };
    }

    const {
      eventName,
      sessionId,
      step,
      orderId,
      metadata,
      timestamp,
      path,
      experienceVersion,
      draftRevision,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      gclid,
      wbraid,
      gbraid,
      fbclid,
      referrer,
      landingPath,
      googleClientId,
      googleClientIdNormalized,
      deviceType,
      screenResolution,
      clientId: rawClientId,
      is_founder: rawIsFounder,
      isFounder: rawIsFounderAlt,
    } = body;

    const cookieFounder = req.cookies.get("smn_founder_device")?.value === "1";
    const isFounder = Boolean(rawIsFounder || rawIsFounderAlt || cookieFounder);
    const clientId = typeof rawClientId === "string" ? rawClientId.slice(0, 100) : undefined;

    if (!eventName || typeof eventName !== "string" || !sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing required fields (eventName, sessionId)" }, { status: 400 });
    }

    // 3. Purchase authority check: browser POST of authority events is strictly rejected
    if (isAuthorityEvent(eventName)) {
      return NextResponse.json(
        { error: "Forbidden: Authority events cannot be ingested via browser telemetry" },
        { status: 403 }
      );
    }

    // 4. Allowed browser event check
    if (!ALLOWED_BROWSER_EVENT_NAMES.has(eventName as TelemetryEventName)) {
      return NextResponse.json(
        { error: `Unknown or disallowed browser telemetry event: ${eventName}` },
        { status: 400 }
      );
    }

    // 5. Metadata hygiene: per-event allowlist schemas
    const { sanitized: sanitizedMetadata, error: metadataError } = sanitizeMetadata(
      eventName,
      metadata
    );
    if (metadataError) {
      return NextResponse.json({ error: metadataError }, { status: 400 });
    }

    // 6. URL hygiene: path, referrer, landingPath reduced to origin + pathname
    const cleanPath = sanitizeUrlOrPath(path) || "/";
    const cleanReferrer = sanitizeUrlOrPath(referrer);
    const cleanLandingPath = sanitizeUrlOrPath(landingPath);

    // 7. Attribution hygiene: allowlisted keys, length-bounded, email stripped
    const cleanUtmSource = sanitizeAttribution(utmSource);
    const cleanUtmMedium = sanitizeAttribution(utmMedium);
    const cleanUtmCampaign = sanitizeAttribution(utmCampaign);
    const cleanUtmContent = sanitizeAttribution(utmContent);
    const cleanUtmTerm = sanitizeAttribution(utmTerm);
    const cleanGclid = sanitizeAttribution(gclid, 255);
    const cleanWbraid = sanitizeAttribution(wbraid, 255);
    const cleanGbraid = sanitizeAttribution(gbraid, 255);
    const cleanFbclid = sanitizeAttribution(fbclid, 255);

    // 8. Common context
    const cleanExpVersion = typeof experienceVersion === "string" ? experienceVersion.trim().slice(0, 50) : undefined;
    const cleanDraftRev = typeof draftRevision === "number" && Number.isFinite(draftRevision) ? draftRevision : undefined;

    const eventId = typeof body.eventId === "string" && /^[a-zA-Z0-9_-]{6,100}$/.test(body.eventId)
      ? body.eventId : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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

    const eventDoc: TelemetryEvent = {
      id: eventId,
      eventName: eventName as TelemetryEventName,
      sessionId: sessionId.trim().slice(0, 100),
      ...(typeof step === "number" && Number.isFinite(step) ? { step } : {}),
      ...(typeof orderId === "string" ? { orderId: orderId.trim().slice(0, 100) } : {}),
      metadata: sanitizedMetadata,
      path: cleanPath,
      timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
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
      wbraid: cleanWbraid,
      gbraid: cleanGbraid,
      fbclid: cleanFbclid,
      referrer: cleanReferrer,
      landingPath: cleanLandingPath,
      // Identity & Tech
      googleClientId: sanitizeGoogleClientId(googleClientId),
      googleClientIdNormalized: sanitizeGoogleClientIdNormalized(googleClientIdNormalized),
      deviceType: validateDeviceType(deviceType),
      screenResolution: sanitizeScreenResolution(screenResolution),
      ipCity,
      ipRegion,
      ipCountry,
      userAgent: userAgent ? userAgent.slice(0, 300) : undefined,
      isBot,
      clientId,
      ...(isFounder ? { isFounder: true, is_founder: true } : {}),
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
