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
let lastNoteEditTelemetryAt = 0;

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
    const eventId = options?.eventId || generateStableEventId();
    const cleanPath = sanitizeUrlOrPath(window.location.pathname) || "/";
    const inApp = isInAppBrowser();
    const attribution = getStoredAttribution();

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
        in_app_browser: inApp,
        attribution_observed: true,
        utmSource: attribution?.utmSource,
        utmMedium: attribution?.utmMedium,
        utmCampaign: attribution?.utmCampaign,
        referrer: sanitizeUrlOrPath(attribution?.referrer || document.referrer),
        device_category: getDeviceType(),
        ...(properties || {}),
      },
      source: "browser",
      isFounderFlag: isFounderDevice(),
    });

    const payload = JSON.stringify(envelope);

    // Send via sendBeacon first, fallback to fetch with keepalive using the exact same eventId
    let sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        sent = navigator.sendBeacon("/api/telemetry", blob);
      } catch {
        sent = false;
      }
    }

    if (!sent) {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
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

  // Keystrokes must not exhaust the collector's 60/minute budget before checkout.
  // note_completed separately records the final character count.
  if (eventName === "inside_note_edited") {
    const now = Date.now();
    if (now - lastNoteEditTelemetryAt < 3000 && !metadata?.has_unresolved_bracket) return;
    lastNoteEditTelemetryAt = now;
  }

  // Authority events are server-only; browser emitter skips sending them
  if (isAuthorityEvent(eventName)) {
    return;
  }

  const identity = getOrCreateJourneyIdentity();
  const consentState = resolveConsentState();
  const eventId = generateStableEventId();

  try {
    const attr = getStoredAttribution();
    const googleClientId = getGoogleClientId();
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
      ...(founder ? { is_founder: true, isFounder: true } : {}),
      metadata: {
        in_app_browser: inApp,
        ...(founder ? { is_founder: true, isFounder: true } : {}),
        ...(metadata || {}),
      },
      timestamp: Date.now(),
      path: cleanPath,
      // Visitor acquisition attribution
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
      // Technology & Google Analytics identity
      googleClientId,
      googleClientIdNormalized: attr?.googleClientIdNormalized,
      deviceType,
      screenResolution,
    };

    // Try sendBeacon first, fallback to fetch with keepalive
    let sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        sent = navigator.sendBeacon("/api/telemetry", blob);
      } catch {
        sent = false;
      }
    }
    if (!sent) {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }

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
