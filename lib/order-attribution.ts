import { OrderAttribution } from "@/lib/types";
import {
  ATTRIBUTION_CLASSIFIER_VERSION,
  ATTRIBUTION_SCHEMA_VERSION,
  FIRST_OBSERVED_WINDOW_MS,
  AttributionMissingReason,
  AttributionSnapshotV2,
  AttributionTouchV2,
} from "@/lib/attribution-contract";
import { classifyAttributionProperties } from "@/lib/attribution-classifier";

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/[\r\n\0]/g, "");
  if (!clean || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(clean)) return undefined;
  return clean.slice(0, max);
}

function boundedClickId(value: unknown): string | undefined {
  const clean = boundedText(value, 255);
  return clean && /^[A-Za-z0-9._~-]+$/.test(clean) ? clean : undefined;
}

function safeReferrer(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return new URL(value).origin.slice(0, 300); } catch { return undefined; }
}

function safeLandingPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.split(/[?#]/, 1)[0];
  if (!path.startsWith("/") || path.length > 200 || path.includes("..")) return undefined;
  return path;
}

const SESSION_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const TOUCH_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const MISSING_REASONS = new Set<AttributionMissingReason>([
  "consent_denied", "gpc_restricted", "entry_not_observed", "session_unavailable",
  "storage_unavailable", "expired", "invalid_evidence", "legacy_touch_role_unknown",
]);

function safeSessionId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && SESSION_ID_RE.test(value) ? value : undefined;
}

export function isAttributionV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ATTRIBUTION_V2_ENABLED === "true";
}

function safeReferrerHost(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 253 || /[\/@?#:]/.test(value)) return undefined;
  const host = value.toLowerCase().replace(/\.$/, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(host) ? host : undefined;
}

function safeMissingReason(value: unknown): AttributionMissingReason | undefined {
  return typeof value === "string" && MISSING_REASONS.has(value as AttributionMissingReason)
    ? value as AttributionMissingReason
    : undefined;
}

interface SanitizedTouchResult {
  touch: AttributionTouchV2 | null;
  missingReason?: AttributionMissingReason;
}

function sanitizeV2Touch(
  raw: unknown,
  serverNowMs: number,
  expectedSessionId?: string,
  firstTouch = false,
): SanitizedTouchResult {
  if (raw === null || raw === undefined) return { touch: null };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { touch: null, missingReason: "invalid_evidence" };
  const value = raw as Record<string, unknown>;
  const sessionId = safeSessionId(value.sessionId);
  if (sessionId === undefined || (expectedSessionId && sessionId !== expectedSessionId)) {
    return { touch: null, missingReason: "invalid_evidence" };
  }
  if (typeof value.touchId !== "string" || !TOUCH_ID_RE.test(value.touchId)) {
    return { touch: null, missingReason: "invalid_evidence" };
  }

  const expiresAt = value.expiresAt === null ? null : typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) ? value.expiresAt : undefined;
  if (expiresAt === undefined || firstTouch && (expiresAt === null || expiresAt <= serverNowMs || expiresAt > serverNowMs + FIRST_OBSERVED_WINDOW_MS)) {
    return { touch: null, missingReason: firstTouch && typeof expiresAt === "number" && expiresAt <= serverNowMs ? "expired" : "invalid_evidence" };
  }
  const observedAtClientMs = typeof value.observedAtClientMs === "number" && Number.isFinite(value.observedAtClientMs)
    ? value.observedAtClientMs
    : null;
  const referrerHost = safeReferrerHost(value.referrerHost);
  const canonical = classifyAttributionProperties({
    attributionV2: {
      schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
      currentSessionTouch: {
        ...value,
        referrerHost,
      },
    },
  }, expectedSessionId);
  if (canonical.channel === "unknown" && canonical.reason === "invalid_evidence") {
    return { touch: null, missingReason: "invalid_evidence" };
  }

  return {
    touch: {
      ...canonical,
      touchId: value.touchId,
      sessionId,
      observedAtClientMs,
      expiresAt,
      clockQuality: "client_unanchored",
      ...(safeLandingPath(value.landingPath) ? { landingPath: safeLandingPath(value.landingPath) } : {}),
      ...(referrerHost ? { referrerHost } : {}),
    },
  };
}

function buildAttributionSnapshotV2(
  raw: unknown,
  sessionIdValue: unknown,
  serverNowMs: number,
  restricted: boolean,
  restrictedReason: "gpc_restricted" | "consent_denied",
): AttributionSnapshotV2 {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const input = source.attributionV2 && typeof source.attributionV2 === "object" && !Array.isArray(source.attributionV2)
    ? source.attributionV2 as Record<string, unknown>
    : {};
  const sessionId = safeSessionId(sessionIdValue);
  const sessionIdIsUsable = typeof sessionId === "string";
  const first = restricted ? { touch: null, missingReason: restrictedReason }
    : sanitizeV2Touch(input.firstObservedTouch, serverNowMs, undefined, true);
  const current = restricted || !sessionIdIsUsable
    ? { touch: null, missingReason: restricted ? restrictedReason : "session_unavailable" as const }
    : sanitizeV2Touch(input.currentSessionTouch, serverNowMs, sessionId as string);
  const persistenceValues = new Set(["persistent", "memory_only", "unavailable", "not_attempted"]);
  const persistence = restricted || !sessionIdIsUsable
    ? "not_attempted" as const
    : persistenceValues.has(input.persistence as string) ? input.persistence as AttributionSnapshotV2["persistence"] : "unavailable" as const;
  const inputFirstReason = safeMissingReason(input.firstObservedMissingReason);
  const inputCurrentReason = safeMissingReason(input.currentSessionMissingReason);
  return {
    schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
    classifierVersion: ATTRIBUTION_CLASSIFIER_VERSION,
    firstObservedTouch: first.touch,
    currentSessionTouch: current.touch,
    ...(first.touch ? {} : { firstObservedMissingReason: first.missingReason || inputFirstReason || "entry_not_observed" }),
    ...(current.touch ? {} : { currentSessionMissingReason: current.missingReason || inputCurrentReason || "entry_not_observed" }),
    persistence,
    snapshotStage: "checkout_started",
    snapshotCapturedAtServerMs: serverNowMs,
  };
}

/**
 * Freeze legacy attribution fields unchanged and add a server-stamped V2
 * checkout snapshot only when its staging-controlled server flag is enabled.
 */
export function prepareCheckoutOrderAttribution(
  raw: unknown,
  options: {
    sessionId?: unknown;
    serverNowMs?: number;
    v2Enabled?: boolean;
    globalPrivacyControl?: boolean;
  } = {},
): OrderAttribution | undefined {
  const serverNowMs = Number.isFinite(options.serverNowMs) ? options.serverNowMs as number : Date.now();
  const flat = sanitizeOrderAttribution(raw, serverNowMs);
  const enabled = options.v2Enabled ?? isAttributionV2Enabled();
  if (!enabled) return flat;
  const restricted = options.globalPrivacyControl === true || flat?.gpc === true || flat?.optOut === true;
  const restrictedReason = options.globalPrivacyControl === true || flat?.gpc === true ? "gpc_restricted" : "consent_denied";
  const attributionV2 = buildAttributionSnapshotV2(raw, options.sessionId, serverNowMs, restricted, restrictedReason);
  return { ...(flat ?? {}), attributionV2 };
}

/** Existing frozen order attribution wins on retries or later order updates. */
export function freezeCheckoutOrderAttribution(
  existing: OrderAttribution | undefined,
  raw: unknown,
  options: Parameters<typeof prepareCheckoutOrderAttribution>[1] = {},
): OrderAttribution | undefined {
  if (existing?.attributionV2) return existing;
  return prepareCheckoutOrderAttribution(raw, options);
}

/** Allowlist and bound the browser-selected first touch frozen onto a checkout order. */
export function sanitizeOrderAttribution(raw: unknown, now = Date.now()): OrderAttribution | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const capturedAt = typeof a.capturedAt === "number" && Number.isFinite(a.capturedAt) ? a.capturedAt : now;
  const expiresAt = typeof a.expiresAt === "number" ? a.expiresAt : capturedAt + 90 * 24 * 60 * 60 * 1000;
  if (expiresAt <= now || capturedAt > now + 5 * 60 * 1000) return undefined;
  const result: OrderAttribution = {
    utmSource: boundedText(a.utmSource, 100),
    utmMedium: boundedText(a.utmMedium, 100),
    utmCampaign: boundedText(a.utmCampaign, 100),
    utmContent: boundedText(a.utmContent, 100),
    utmTerm: boundedText(a.utmTerm, 100),
    gclid: boundedClickId(a.gclid),
    wbraid: boundedClickId(a.wbraid),
    gbraid: boundedClickId(a.gbraid),
    fbclid: boundedText(a.fbclid, 255),
    fbp: boundedText(a.fbp, 255),
    fbc: boundedText(a.fbc, 255),
    referrer: safeReferrer(a.referrer),
    landingPath: safeLandingPath(a.landingPath),
    googleClientId: boundedText(a.googleClientId, 100),
    googleClientIdNormalized: boundedText(a.googleClientIdNormalized, 100),
    gpc: a.gpc === true,
    optOut: a.optOut === true,
    capturedAt,
    expiresAt,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined)) as OrderAttribution;
}

export function mayStoreGoogleClientId(
  globalPrivacyControl: boolean,
  attribution?: Pick<OrderAttribution, "gpc" | "optOut"> | null
): boolean {
  return !globalPrivacyControl && !attribution?.gpc && !attribution?.optOut;
}
