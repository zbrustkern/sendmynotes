/**
 * lib/telemetry.ts
 *
 * Client telemetry dispatcher supporting both legacy events and Event V2.
 * Enforces Global Privacy Control (GPC), stable retry event IDs,
 * session rotation, and sanitized gtag forwarding.
 *
 * Reference: SPRINT-0003-T01, T02
 */

import { TelemetryEventName } from "./types";
import { EventV2Name } from "./contracts/admin-overhaul";
import { getStoredAttribution } from "@/components/AttributionTracker";
import {
  isAuthorityEvent,
  sanitizeUrlOrPath,
  sanitizeMetadata,
} from "./telemetry-schema";
import {
  getOrCreateJourneyIdentity,
  resolveConsentState,
} from "./journey-identity";
import { buildEventV2Envelope } from "./telemetry-v2-envelope";

export const TELEMETRY_COLLECTION = "telemetry_events";

/**
 * Returns active session ID using versioned journey identity.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") {
    return "server_session";
  }
  const identity = getOrCreateJourneyIdentity();
  return identity.sessionId;
}

/**
 * Extracts Google Analytics Client ID from document cookies (_ga=GA1.1.XXXX.XXXX)
 */
export function getGoogleClientId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Gets or creates persistent client device ID for browser
 */
export function getClientId(): string {
  if (typeof window === "undefined") {
    return "server_client";
  }
  const identity = getOrCreateJourneyIdentity();
  return identity.anonymousId;
}

/**
 * Checks whether this browser is marked as founder device via localStorage or cookie
 */
export function isFounderDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem("smn_founder_device") === "1" ||
      (typeof document !== "undefined" && document.cookie.includes("smn_founder_device=1"))
    );
  } catch {
    return false;
  }
}

/**
 * Categorizes the visitor's device based on viewport and user agent
 */
export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  try {
    const ua = navigator.userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
    if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
    const width = window.innerWidth || window.screen?.width || 1024;
    if (width < 768) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  } catch {
    return "desktop";
  }
}

/**
 * Returns viewport/screen resolution string (e.g. "390x844")
 */
export function getScreenResolution(): string {
  if (typeof window === "undefined") return "unknown";
  try {
    return `${window.screen?.width || window.innerWidth}x${window.screen?.height || window.innerHeight}`;
  } catch {
    return "unknown";
  }
}

export function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    return /FBAN|FBAV|Instagram/i.test(ua);
  } catch {
    return false;
  }
}

/**
 * Generates a stable event ID for retry deduplication.
 */
export function generateStableEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export type TelemetryDeliveryResult = "accepted" | "permanent_failure" | "retry_exhausted" | "queue_full" | "queue_storage_unavailable";

export interface TelemetryDeliveryDependencies {
  fetcher?: typeof fetch;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
}

const TELEMETRY_MAX_ATTEMPTS = 3;
const TELEMETRY_MAX_PENDING = 20;
const TELEMETRY_RETRY_BASE_MS = 250;
const TELEMETRY_RETRY_MAX_MS = 2_500;
const TELEMETRY_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const TELEMETRY_REQUEST_TIMEOUT_MS = 3_000;
export const TELEMETRY_OUTBOX_SESSION_KEY = "smn_telemetry_outbox_v1";
const TELEMETRY_OUTBOX_MAX_EVENTS = 20;
const TELEMETRY_OUTBOX_TTL_MS = 60 * 60 * 1000;
const TELEMETRY_OUTBOX_MAX_BYTES = 4 * 1024;
const pendingDeliveries = new Map<string, { startedAt: number; promise: Promise<TelemetryDeliveryResult> }>();
let lastDeliveryWarningAt = 0;

function reportDeliveryFailure(result: TelemetryDeliveryResult, now: number): void {
  if (result === "accepted" || now - lastDeliveryWarningAt < 60_000) return;
  lastDeliveryWarningAt = now;
  // Report only a category; never include event contents, IDs, or attribution.
  console.warn(result === "queue_storage_unavailable" ? "[Telemetry] refresh recovery unavailable; delivery remains in memory" : "[Telemetry] delivery incomplete", result);
}

interface PersistedTelemetryDelivery {
  eventId: string;
  payload: string;
  createdAt: number;
}

function currentSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}

function payloadIsPersistableV2(payload: string, eventId: string): boolean {
  try {
    const bytes = new TextEncoder().encode(payload).byteLength;
    if (bytes > TELEMETRY_OUTBOX_MAX_BYTES) return false;
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parsed.schema_version === "v2.0" &&
      parsed.source === "browser" &&
      parsed.consent_state === "granted" &&
      parsed.event_id === eventId &&
      typeof parsed.event_name === "string" &&
      typeof parsed.session_id === "string" &&
      typeof parsed.route_template === "string" &&
      Boolean(parsed.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties));
  } catch {
    return false;
  }
}

function readPersistedDeliveries(now = Date.now()): PersistedTelemetryDelivery[] {
  const storage = currentSessionStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(TELEMETRY_OUTBOX_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((entry): entry is PersistedTelemetryDelivery => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as PersistedTelemetryDelivery;
      return typeof candidate.eventId === "string" &&
        typeof candidate.payload === "string" &&
        typeof candidate.createdAt === "number" &&
        now - candidate.createdAt <= TELEMETRY_OUTBOX_TTL_MS &&
        now >= candidate.createdAt &&
        payloadIsPersistableV2(candidate.payload, candidate.eventId);
    }).slice(-TELEMETRY_OUTBOX_MAX_EVENTS);
    if (valid.length !== parsed.length) {
      if (valid.length) storage.setItem(TELEMETRY_OUTBOX_SESSION_KEY, JSON.stringify(valid));
      else storage.removeItem(TELEMETRY_OUTBOX_SESSION_KEY);
    }
    return valid;
  } catch {
    reportDeliveryFailure("queue_storage_unavailable", Date.now());
    return [];
  }
}

function writePersistedDeliveries(entries: PersistedTelemetryDelivery[]): boolean {
  const storage = currentSessionStorage();
  if (!storage) {
    reportDeliveryFailure("queue_storage_unavailable", Date.now());
    return false;
  }
  try {
    if (!entries.length) storage.removeItem(TELEMETRY_OUTBOX_SESSION_KEY);
    else storage.setItem(TELEMETRY_OUTBOX_SESSION_KEY, JSON.stringify(entries.slice(-TELEMETRY_OUTBOX_MAX_EVENTS)));
    return true;
  } catch {
    reportDeliveryFailure("queue_storage_unavailable", Date.now());
    return false;
  }
}

function persistV2Delivery(payload: string, eventId: string): boolean {
  if (!payloadIsPersistableV2(payload, eventId)) return false;
  const entries = readPersistedDeliveries();
  if (entries.some((entry) => entry.eventId === eventId)) return true;
  entries.push({ eventId, payload, createdAt: Date.now() });
  if (entries.length > TELEMETRY_OUTBOX_MAX_EVENTS) {
    entries.splice(0, entries.length - TELEMETRY_OUTBOX_MAX_EVENTS);
    reportDeliveryFailure("queue_full", Date.now());
  }
  return writePersistedDeliveries(entries);
}

function removePersistedDelivery(eventId: string): void {
  const entries = readPersistedDeliveries().filter((entry) => entry.eventId !== eventId);
  writePersistedDeliveries(entries);
}

function clearPersistedDeliveries(): void {
  const storage = currentSessionStorage();
  if (!storage) return;
  try { storage.removeItem(TELEMETRY_OUTBOX_SESSION_KEY); } catch {
    reportDeliveryFailure("queue_storage_unavailable", Date.now());
  }
}

/**
 * Replays sanitized V2 envelopes after a refresh, but only when consent is
 * currently granted. The tab-scoped outbox is capped at 20 events/4 KiB each
 * and expires after one hour. Denied/GPC/not-required traffic stays memory-only.
 */
export async function flushPendingTelemetry(
  consentState: ReturnType<typeof resolveConsentState> = resolveConsentState(),
  dependencies: TelemetryDeliveryDependencies = {}
): Promise<void> {
  if (consentState !== "granted") {
    clearPersistedDeliveries();
    return;
  }

  const attempted = new Set<string>();
  while (true) {
    const batch = readPersistedDeliveries().filter((entry) => !attempted.has(entry.eventId));
    if (!batch.length) return;
    await Promise.all(batch.map(async (entry) => {
      attempted.add(entry.eventId);
      const result = await dispatchTelemetryPayload(entry.payload, entry.eventId, dependencies);
      if (result === "accepted" || result === "permanent_failure") removePersistedDelivery(entry.eventId);
    }));
  }
}

function retryDelayMs(response: Response | undefined, retryIndex: number, now: number): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(TELEMETRY_RETRY_MAX_MS, Math.max(0, retryAt - now));
    }
  }
  return Math.min(TELEMETRY_RETRY_MAX_MS, TELEMETRY_RETRY_BASE_MS * 2 ** retryIndex);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Send one immutable payload with bounded retries. The same event ID and body
 * are reused so the collector's create-if-absent write can safely ACK replays.
 */
export async function postTelemetryWithRetry(
  payload: string,
  dependencies: TelemetryDeliveryDependencies = {}
): Promise<TelemetryDeliveryResult> {
  const fetcher = dependencies.fetcher || fetch;
  const wait = dependencies.wait || ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const now = dependencies.now || Date.now;
  let response: Response | undefined;

  for (let attempt = 0; attempt < TELEMETRY_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEMETRY_REQUEST_TIMEOUT_MS);
    try {
      response = await fetcher("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        signal: controller.signal,
      });

      if (response.ok) {
        const acknowledgement = await response.clone().json().catch(() => null);
        if (acknowledgement?.received === true && acknowledgement?.accepted === true) {
          return "accepted";
        }
        // A 2xx without an ACK is ambiguous: replay the same idempotent request.
        response = undefined;
      } else if (!isRetryableStatus(response.status)) {
        return "permanent_failure";
      }
    } catch {
      // Network failures are transient; the retry below uses the identical body.
      response = undefined;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < TELEMETRY_MAX_ATTEMPTS - 1) {
      await wait(retryDelayMs(response, attempt, now()));
    }
  }
  return "retry_exhausted";
}

/**
 * Coalesce concurrent sends for the same event and bound in-memory pending
 * requests. Refresh recovery is handled separately by the consent-gated,
 * bounded V2 sessionStorage outbox above; legacy traffic remains memory-only.
 */
export function dispatchTelemetryPayload(
  payload: string,
  eventId: string,
  dependencies: TelemetryDeliveryDependencies = {}
): Promise<TelemetryDeliveryResult> {
  const now = dependencies.now || Date.now;
  for (const [id, pending] of pendingDeliveries) {
    if (now() - pending.startedAt > TELEMETRY_PENDING_TTL_MS) pendingDeliveries.delete(id);
  }

  const existing = pendingDeliveries.get(eventId);
  if (existing) return existing.promise;
  if (pendingDeliveries.size >= TELEMETRY_MAX_PENDING) {
    reportDeliveryFailure("queue_full", now());
    return Promise.resolve("queue_full");
  }

  const promise = postTelemetryWithRetry(payload, dependencies).finally(() => {
    pendingDeliveries.delete(eventId);
  });
  pendingDeliveries.set(eventId, { startedAt: now(), promise });
  void promise.then((result) => reportDeliveryFailure(result, now()));
  return promise;
}

export interface TrackEventV2Options {
  experienceVersion?: string;
  eventId?: string;
  orderId?: string;
  paymentAttemptId?: string;
  requestId?: string;
  traceId?: string;
  draftId?: string;
  step?: number;
}

/**
 * Dispatches an Event V2 telemetry payload with envelope validation,
 * retry stability, and consent/GPC enforcement.
 */
export async function trackEventV2(
  eventName: EventV2Name | string,
  properties?: Record<string, unknown>,
  options?: TrackEventV2Options
): Promise<void> {
  if (typeof window === "undefined") return;

  if (isAuthorityEvent(eventName)) {
    return;
  }

  try {
    const identity = getOrCreateJourneyIdentity({ draftId: options?.draftId });
    const consentState = resolveConsentState();
    const attributionAllowed = consentState !== "denied" && consentState !== "gpc_restricted";
    const eventId = options?.eventId || generateStableEventId();
    const cleanPath = sanitizeUrlOrPath(window.location.pathname) || "/";
    const inApp = isInAppBrowser();
    const attribution = getStoredAttribution();
    const cleanCallerProperties = sanitizeMetadata(eventName, properties || {}).sanitized;
    const eventProperties = attributionAllowed
      ? cleanCallerProperties
      : {};

    const envelope = buildEventV2Envelope({
      event_name: eventName,
      experience_version: options?.experienceVersion,
      event_id: eventId,
      session_id: identity.sessionId,
      anonymous_id: identity.anonymousId,
      journey_id: identity.journeyId,
      order_id: options?.orderId,
      payment_attempt_id: options?.paymentAttemptId,
      request_id: options?.requestId,
      trace_id: options?.traceId,
      route_template: cleanPath,
      degraded_identity: identity.degradedIdentity,
      consent_state: consentState,
      properties: {
        ...(attributionAllowed ? {
          in_app_browser: inApp,
          attribution_observed: true,
          utmSource: attribution?.utmSource,
          utmMedium: attribution?.utmMedium,
          utmCampaign: attribution?.utmCampaign,
          referrer: sanitizeUrlOrPath(attribution?.referrer || document.referrer),
          device_category: getDeviceType(),
          ...eventProperties,
        } : eventProperties),
      },
      source: "browser",
      isFounderFlag: isFounderDevice(),
    });

    const payload = JSON.stringify(envelope);

    // Fetch for an explicit collector ACK; sendBeacon only reports that a
    // request was queued, not that the server accepted or persisted it.
    if (!persistV2Delivery(payload, eventId)) {
      void flushPendingTelemetry(consentState);
      void dispatchTelemetryPayload(payload, eventId);
    } else {
      void flushPendingTelemetry(consentState);
    }

    // Consent enforcement: if consent is denied or gpc_restricted, NEVER call window.gtag!
    if (consentState !== "denied" && consentState !== "gpc_restricted") {
      if (typeof window !== "undefined") {
        const win = window as unknown as { gtag?: (...args: unknown[]) => void };
        if (typeof win.gtag === "function") {
          const { sanitized } = sanitizeMetadata(eventName, properties || {});
          win.gtag("event", eventName, {
            event_category: "visitor_telemetry_v2",
            event_id: eventId,
            order_id: options?.orderId,
            ...sanitized,
          });
        }
      }
    }
  } catch (err) {
    console.debug("[Telemetry V2] Failed to dispatch event:", err);
  }
}

/**
 * Legacy telemetry dispatch function with backward compatibility,
 * stable event IDs, and GPC consent enforcement.
 */
export async function trackEvent(
  eventName: TelemetryEventName,
  step?: number,
  metadata?: Record<string, unknown>,
  orderId?: string
): Promise<void> {
  if (typeof window === "undefined") return;

  // Authority events are server-only; browser emitter skips sending them
  if (isAuthorityEvent(eventName)) {
    return;
  }

  const identity = getOrCreateJourneyIdentity();
  const consentState = resolveConsentState();
  const attributionAllowed = consentState !== "denied" && consentState !== "gpc_restricted";
  const eventId = generateStableEventId();

  try {
    const attr = getStoredAttribution();
    const googleClientId = attributionAllowed ? getGoogleClientId() : undefined;
    const deviceType = getDeviceType();
    const screenResolution = getScreenResolution();
    const inApp = isInAppBrowser();

    const rawReferrer = attr?.referrer || (document.referrer ? document.referrer : undefined);
    const cleanReferrer = sanitizeUrlOrPath(rawReferrer);
    const cleanPath = sanitizeUrlOrPath(window.location.pathname) || "/";
    const cleanLandingPath = sanitizeUrlOrPath(attr?.landingPath || window.location.pathname) || "/";

    const founder = isFounderDevice();

    const payload = {
      eventId,
      eventName,
      step,
      sessionId: identity.sessionId,
      anonymousId: identity.anonymousId,
      journeyId: identity.journeyId,
      orderId,
      clientId: identity.anonymousId,
      degradedIdentity: identity.degradedIdentity,
      consent_state: consentState,
      ...(founder ? { is_founder: true, isFounder: true } : {}),
      metadata: attributionAllowed ? {
        in_app_browser: inApp,
        ...(founder ? { is_founder: true, isFounder: true } : {}),
        ...sanitizeMetadata(eventName, metadata || {}).sanitized,
      } : {},
      timestamp: Date.now(),
      path: cleanPath,
      // Visitor acquisition attribution
      ...(attributionAllowed ? {
        utmSource: attr?.utmSource,
        utmMedium: attr?.utmMedium,
        utmCampaign: attr?.utmCampaign,
        utmContent: attr?.utmContent,
        utmTerm: attr?.utmTerm,
        gclid: attr?.gclid,
        wbraid: attr?.wbraid,
        gbraid: attr?.gbraid,
        fbclid: attr?.fbclid,
        referrer: cleanReferrer,
        landingPath: cleanLandingPath,
        googleClientIdNormalized: attr?.googleClientIdNormalized,
        deviceType,
        screenResolution,
      } : {}),
      // Technology & Google Analytics identity
      ...(googleClientId ? { googleClientId } : {}),
    };

    void flushPendingTelemetry(consentState);
    void dispatchTelemetryPayload(JSON.stringify(payload), eventId);

    // Forward to GA4 / gtag if active and consent is NOT denied or restricted
    if (consentState !== "denied" && consentState !== "gpc_restricted") {
      if (typeof window !== "undefined") {
        const win = window as unknown as { gtag?: (...args: unknown[]) => void };
        if (typeof win.gtag === "function") {
          const { sanitized } = sanitizeMetadata(eventName, metadata || {});
          win.gtag("event", eventName, {
            event_category: "visitor_telemetry",
            step_number: step,
            order_id: orderId,
            ...sanitized,
          });
        }
      }
    }
  } catch (err) {
    // Non-blocking
    console.debug("[Telemetry] Failed to dispatch event:", err);
  }
}
