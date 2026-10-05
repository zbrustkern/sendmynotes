import { TelemetryEventName } from "./types";
import { getStoredAttribution } from "@/components/AttributionTracker";

export const TELEMETRY_COLLECTION = "telemetry_events";

let currentSessionId: string | null = null;

export function getSessionId(): string {
  if (typeof window === "undefined") {
    return "server_session";
  }

  if (!currentSessionId) {
    const existing = window.sessionStorage.getItem("smn_telemetry_session");
    if (existing) {
      currentSessionId = existing;
    } else {
      currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      window.sessionStorage.setItem("smn_telemetry_session", currentSessionId);
    }
  }

  return currentSessionId;
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

export async function trackEvent(
  eventName: TelemetryEventName,
  step?: number,
  metadata?: Record<string, unknown>,
  orderId?: string
): Promise<void> {
  if (typeof window === "undefined") return;

  const sessionId = getSessionId();

  try {
    const attr = getStoredAttribution();
    const googleClientId = getGoogleClientId();
    const deviceType = getDeviceType();
    const screenResolution = getScreenResolution();

    const payload = {
      eventName,
      step,
      sessionId,
      orderId,
      metadata: metadata || {},
      timestamp: Date.now(),
      path: window.location.pathname,
      // Visitor acquisition attribution
      utmSource: attr?.utmSource,
      utmMedium: attr?.utmMedium,
      utmCampaign: attr?.utmCampaign,
      utmContent: attr?.utmContent,
      utmTerm: attr?.utmTerm,
      gclid: attr?.gclid,
      fbclid: attr?.fbclid,
      referrer: attr?.referrer || (document.referrer ? document.referrer : undefined),
      landingPath: attr?.landingPath || window.location.pathname,
      // Technology & Google Analytics identity
      googleClientId,
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

    // Forward to GA4 / gtag if active
    if (typeof window !== "undefined") {
      const win = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof win.gtag === "function") {
        win.gtag("event", eventName, {
          event_category: "visitor_telemetry",
          step_number: step,
          order_id: orderId,
          ...(metadata || {}),
        });
      }
    }
  } catch (err) {
    // Non-blocking
    console.debug("[Telemetry] Failed to dispatch event:", err);
  }
}
