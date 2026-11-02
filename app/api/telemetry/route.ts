import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";
import { ingestTelemetryEvent } from "@/lib/metrics-rollup";
import { TelemetryEvent } from "@/lib/types";
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
import {
  ingestEventV2,
  buildEventV2Envelope,
  recordTelemetryCollectorRejection,
  TELEMETRY_V2_COLLECTION,
} from "@/lib/telemetry-v2";
import { classifyTrafficProvenance, resolveConsentState } from "@/lib/journey-identity";

const MAX_BODY_BYTES = 4096; // 4KB

// Sliding window rate limiter for telemetry ingestion
const ipStore = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 telemetry pings per minute per IP
const LEGACY_PROJECTION_LEASE_MS = 30_000;

type LegacyProjectionClaim =
  | { state: "claimed"; eventDoc: TelemetryEvent }
  | { state: "complete" | "busy" };
const ACQUISITION_METADATA_KEYS = new Set([
  "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "wbraid", "gbraid", "fbclid", "emailClickId", "referrer",
]);

function omitAcquisitionMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !ACQUISITION_METADATA_KEYS.has(key)));
}

/**
 * Complete the compatibility projection once per V2 event. The legacy raw
 * event document doubles as the durable idempotency marker, so a replay can
 * distinguish an unstarted write from a projection already committed by the
 * V2 bridge or a previous request. The V2 envelope remains the source record.
 */
async function claimLegacyProjection(eventDoc: TelemetryEvent): Promise<LegacyProjectionClaim> {
  const eventId = eventDoc.id;
  const ref = firestoreDb.collection("telemetry_events").doc(eventId);
  const now = Date.now();
  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() as (Record<string, unknown> & { eventName?: string; _telemetryProjectionState?: string; _telemetryProjectionLeaseUntil?: number; _telemetryProjectionPayload?: TelemetryEvent }) | undefined;

    // The raw event already exists. This includes semantic records written by
    // the V2 bridge. Never call the incrementing legacy rollup a second time.
    if (existing?.eventName) {
      return { state: "complete" as const };
    }

    if (
      existing?._telemetryProjectionState === "processing" &&
      typeof existing._telemetryProjectionLeaseUntil === "number" &&
      existing._telemetryProjectionLeaseUntil > now
    ) {
      return { state: "busy" as const };
    }

    // Keep the original sanitized compatibility payload until the projection
    // commits. A retry with the same V2 ID can then finish the exact adapter
    // write without trusting changed fields from a later request.
    const projectionPayload = existing?._telemetryProjectionPayload || eventDoc;
    transaction.set(ref, {
      _telemetryProjectionState: "processing",
      _telemetryProjectionLeaseUntil: now + LEGACY_PROJECTION_LEASE_MS,
      _telemetryProjectionPayload: projectionPayload,
    }, { merge: true });
    return { state: "claimed" as const, eventDoc: projectionPayload };
  });
}

async function writeLegacyProjection(eventDoc: TelemetryEvent): Promise<"complete" | "busy"> {
  const claim = await claimLegacyProjection(eventDoc);
  if (claim.state !== "claimed") return claim.state;

  const ref = firestoreDb.collection("telemetry_events").doc(eventDoc.id);
  try {
    await ingestTelemetryEvent({
      ...claim.eventDoc,
      _telemetryProjectionState: "processing",
      _telemetryProjectionLeaseUntil: Date.now() + LEGACY_PROJECTION_LEASE_MS,
    } as TelemetryEvent);
    // Strip the transient idempotency payload/state from successful raw rows;
    // eventName itself is then the durable completion marker for later retries.
    await ref.set(claim.eventDoc);
    return "complete";
  } catch (error) {
    // If the raw event was written before a later summary failure, retaining
    // eventName lets a retry finish without incrementing semantic counts twice.
    await ref.set({ _telemetryProjectionState: "failed", _telemetryProjectionLeaseUntil: 0 }, { merge: true }).catch(() => {});
    throw error;
  }
}

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

    const hasSchemaVersion = Object.prototype.hasOwnProperty.call(body, "schema_version");
    if (hasSchemaVersion && body.schema_version !== "v2.0") {
      await recordTelemetryCollectorRejection("unsupported_schema_version");
      return NextResponse.json({ error: "Unsupported telemetry schema_version" }, { status: 400 });
    }

    const isV2Payload = hasSchemaVersion || Object.prototype.hasOwnProperty.call(body, "event_name") || Object.prototype.hasOwnProperty.call(body, "session_id");
    if (isV2Payload && (typeof body.event_id !== "string" || !/^[a-zA-Z0-9_-]{6,100}$/.test(body.event_id.trim()))) {
      await recordTelemetryCollectorRejection("missing_stable_event_id");
      return NextResponse.json({ error: "V2 telemetry requires a stable event_id" }, { status: 400 });
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

    const secGpc = req.headers.get("sec-gpc") === "1";
    const requestedConsent = body.consent_state || body.consentState;
    const knownConsent = ["granted", "denied", "gpc_restricted", "not_required"].includes(requestedConsent)
      ? requestedConsent
      : undefined;
    const consentState = resolveConsentState({
      secGpcHeader: secGpc ? "1" : null,
      gpc: knownConsent === "gpc_restricted",
      storedConsent: knownConsent,
    });
    const attributionAllowed = consentState !== "denied" && consentState !== "gpc_restricted";

    // 5. Metadata hygiene: per-event allowlist schemas
    const rawProperties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
      ? body.properties
      : {};
    const rawMetadata = body.metadata || rawProperties;
    const { sanitized: sanitizedMetadataRaw, error: metadataError } = sanitizeMetadata(
      eventName,
      rawMetadata
    );
    if (metadataError) {
      await recordTelemetryCollectorRejection("invalid_metadata");
      return NextResponse.json({ error: metadataError }, { status: 400 });
    }
    const sanitizedMetadata = attributionAllowed
      ? sanitizedMetadataRaw
      : omitAcquisitionMetadata(sanitizedMetadataRaw);

    // 6. URL hygiene: path, referrer, landingPath reduced to origin + pathname
    const rawPath = body.path || body.route_template;
    const cleanPath = sanitizeUrlOrPath(rawPath) || "/";
    const cleanReferrer = attributionAllowed
      ? sanitizeUrlOrPath(body.referrer || rawProperties.referrer)
      : undefined;
    const cleanLandingPath = sanitizeUrlOrPath(body.landingPath);

    const readAttributionField = (...values: unknown[]): unknown =>
      values.find((value) => typeof value === "string" && value.trim().length > 0);

    // 7. Attribution hygiene: allowlisted keys, length-bounded, email stripped
    const cleanUtmSource = attributionAllowed ? sanitizeAttribution(readAttributionField(body.utmSource, body.utm_source, rawProperties.utmSource, rawProperties.utm_source)) : undefined;
    const cleanUtmMedium = attributionAllowed ? sanitizeAttribution(readAttributionField(body.utmMedium, body.utm_medium, rawProperties.utmMedium, rawProperties.utm_medium)) : undefined;
    const cleanUtmCampaign = attributionAllowed ? sanitizeAttribution(readAttributionField(body.utmCampaign, body.utm_campaign, rawProperties.utmCampaign, rawProperties.utm_campaign)) : undefined;

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
    const rawClientEventId = isV2Payload ? body.event_id : body.eventId || body.id;
    const clientEventId =
      typeof rawClientEventId === "string" && /^[a-zA-Z0-9_-]{6,100}$/.test(rawClientEventId.trim())
        ? rawClientEventId.trim()
        : undefined;
    const eventId = clientEventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const cookieFounder = req.cookies.get("smn_founder_device")?.value === "1";
    const isFounder = Boolean(body.is_founder || body.isFounder || cookieFounder);
    const rawClientId = body.clientId || body.anonymous_id;
    const clientId = typeof rawClientId === "string" ? rawClientId.slice(0, 100) : undefined;

    const userAgent = req.headers.get("user-agent") || undefined;
    const isBot = /bot|crawler|spider|googlebot|bingbot|yandex|baidu|slurp|duckduckgo|semrush|ahrefs|lighthouse|headless|facebookexternalhit|whatsapp|twitterbot|pingdom|uptimerobot/i.test(
      userAgent || ""
    );

    // 9. Build and Ingest Event V2 Envelope with Deduplication
    const classification = classifyTrafficProvenance({
      isFounderFlag: isFounder,
      isBot,
      userAgent,
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

    // 10. Build a sanitized compatibility projection. A duplicate's canonical
    // V2 envelope is read back so changed retry fields cannot replace it. If a
    // prior projection attempt has a durable retry marker, that first payload
    // takes precedence inside writeLegacyProjection.
    let eventDoc: TelemetryEvent;
    if (v2Result.duplicate) {
      const canonicalSnapshot = await firestoreDb.collection(TELEMETRY_V2_COLLECTION).doc(v2Result.dedupeKey).get();
      const canonical = canonicalSnapshot.data() as {
        event_id?: string;
        event_name?: string;
        session_id?: string;
        anonymous_id?: string;
        order_id?: string;
        occurred_at?: number;
        received_at?: number;
        experience_version?: string;
        route_template?: string;
        classification?: { role?: string };
        properties?: Record<string, unknown>;
      } | undefined;
      if (!canonicalSnapshot.exists || !canonical?.event_id || !canonical.event_name) {
        throw new Error("Persisted V2 telemetry envelope is unavailable for legacy projection");
      }
      const canonicalProperties = canonical.properties || {};
      const role = canonical.classification?.role || "";
      eventDoc = {
        id: canonical.event_id,
        eventName: canonical.event_name as TelemetryEvent["eventName"],
        sessionId: canonical.session_id || "unknown_session",
        ...(canonical.order_id ? { orderId: canonical.order_id } : {}),
        metadata: canonicalProperties,
        path: canonical.route_template || "/",
        timestamp: typeof canonical.occurred_at === "number" ? canonical.occurred_at : Date.now(),
        createdAt: typeof canonical.received_at === "number" ? canonical.received_at : Date.now(),
        experienceVersion: canonical.experience_version,
        draftRevision: typeof canonicalProperties.draftRevision === "number" ? canonicalProperties.draftRevision : undefined,
        utmSource: typeof canonicalProperties.utmSource === "string" ? canonicalProperties.utmSource : undefined,
        utmMedium: typeof canonicalProperties.utmMedium === "string" ? canonicalProperties.utmMedium : undefined,
        utmCampaign: typeof canonicalProperties.utmCampaign === "string" ? canonicalProperties.utmCampaign : undefined,
        referrer: typeof canonicalProperties.referrer === "string" ? canonicalProperties.referrer : undefined,
        clientId: canonical.anonymous_id,
        isBot: ["known_bot", "synthetic"].includes(role),
        ...(role === "founder" ? { isFounder: true, is_founder: true } : {}),
      };
    } else {
      eventDoc = {
        id: eventId,
        eventName: eventName as TelemetryEvent["eventName"],
        sessionId: sessionId.trim().slice(0, 100),
        ...(typeof body.step === "number" && Number.isFinite(body.step) ? { step: body.step } : {}),
        ...(typeof body.orderId === "string" ? { orderId: body.orderId.trim().slice(0, 100) } : typeof body.order_id === "string" ? { orderId: body.order_id.trim().slice(0, 100) } : {}),
        metadata: sanitizedMetadata,
        path: cleanPath,
        timestamp: typeof body.timestamp === "number" ? body.timestamp : typeof body.occurred_at === "number" ? body.occurred_at : Date.now(),
        createdAt: Date.now(),
        experienceVersion: cleanExpVersion,
        draftRevision: cleanDraftRev,
        utmSource: cleanUtmSource,
        utmMedium: cleanUtmMedium,
        utmCampaign: cleanUtmCampaign,
        ...(attributionAllowed ? {
          utmContent: sanitizeAttribution(readAttributionField(body.utmContent, body.utm_content, rawProperties.utmContent, rawProperties.utm_content)),
          utmTerm: sanitizeAttribution(readAttributionField(body.utmTerm, body.utm_term, rawProperties.utmTerm, rawProperties.utm_term)),
          gclid: sanitizeAttribution(readAttributionField(body.gclid, rawProperties.gclid), 255),
          wbraid: sanitizeAttribution(readAttributionField(body.wbraid, rawProperties.wbraid), 255),
          gbraid: sanitizeAttribution(readAttributionField(body.gbraid, rawProperties.gbraid), 255),
          fbclid: sanitizeAttribution(readAttributionField(body.fbclid, rawProperties.fbclid), 255),
          referrer: cleanReferrer,
          landingPath: cleanLandingPath,
          googleClientId: sanitizeGoogleClientId(body.googleClientId),
          googleClientIdNormalized: sanitizeGoogleClientIdNormalized(body.googleClientIdNormalized),
          deviceType: validateDeviceType(body.deviceType),
          screenResolution: sanitizeScreenResolution(body.screenResolution),
          userAgent: userAgent ? userAgent.slice(0, 300) : undefined,
        } : {}),
        isBot,
        clientId,
        ...(isFounder ? { isFounder: true, is_founder: true } : {}),
      };
    }

    const projection = await writeLegacyProjection(eventDoc);
    if (projection === "busy") {
      return NextResponse.json(
        { received: false, accepted: false, retryable: true, eventId: eventDoc.id },
        { status: 503, headers: { "Retry-After": "1" } }
      );
    }

    return NextResponse.json({
      received: true,
      accepted: true,
      duplicate: Boolean(v2Result.duplicate),
      eventId: eventDoc.id,
      dedupeKey: v2Result.dedupeKey,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving telemetry";
    console.error("[Telemetry Ingestion Error]", msg);
    await recordTelemetryCollectorRejection("internal_error");
    return NextResponse.json({ received: false, error: msg }, { status: 500 });
  }
}
