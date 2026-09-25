import { TelemetryEventName } from "./types";

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

export async function trackEvent(
  eventName: TelemetryEventName,
  step?: number,
  metadata?: Record<string, unknown>,
  orderId?: string
): Promise<void> {
  if (typeof window === "undefined") return;

  const sessionId = getSessionId();

  try {
    const payload = {
      eventName,
      step,
      sessionId,
      orderId,
      metadata: metadata || {},
      timestamp: Date.now(),
      path: window.location.pathname,
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
  } catch (err) {
    // Non-blocking
    console.debug("[Telemetry] Failed to dispatch event:", err);
  }
}
