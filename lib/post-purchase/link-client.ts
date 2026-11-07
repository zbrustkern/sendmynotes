import { resolveConsentState } from "../journey-identity";

export const STORED_FOLLOWUP_LINK_KEY = "smn_followup_link_v1";
export const FOLLOWUP_LINK_CLIENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REF_RE = /^[A-Za-z0-9_-]{40,64}$/;
export interface StoredFollowupLink { reference: string; observedAt: number }

function gpcActive(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** Returns a recent, session-only reference; never returns a coupon or order identity. */
export function getStoredFollowupLink(now = Date.now()): StoredFollowupLink | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORED_FOLLOWUP_LINK_KEY);
    if (!raw) return undefined;
    if (gpcActive() || resolveConsentState({ gpc: false }) !== "granted") {
      window.sessionStorage.removeItem(STORED_FOLLOWUP_LINK_KEY);
      return undefined;
    }
    const item = JSON.parse(raw) as Partial<StoredFollowupLink>;
    if (typeof item.reference !== "string" || !REF_RE.test(item.reference) || !Number.isSafeInteger(item.observedAt) || !item.observedAt || item.observedAt > now + 5 * 60_000 || item.observedAt < now - FOLLOWUP_LINK_CLIENT_WINDOW_MS) {
      window.sessionStorage.removeItem(STORED_FOLLOWUP_LINK_KEY);
      return undefined;
    }
    return { reference: item.reference, observedAt: item.observedAt };
  } catch { return undefined; }
}

/** Explicitly consent-gated browser observation. It never records a conversion. */
export async function observeFollowupLink(reference: string): Promise<StoredFollowupLink | undefined> {
  if (typeof window === "undefined" || !REF_RE.test(reference) || gpcActive() || resolveConsentState({ gpc: false }) !== "granted") return undefined;
  try {
    const response = await fetch("/api/post-purchase/link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, analyticsAllowed: true }),
      cache: "no-store", credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok || body?.observed !== true || body?.reference !== reference || !Number.isSafeInteger(body?.observedAt)) return undefined;
    const stored = { reference, observedAt: body.observedAt as number };
    try { window.sessionStorage.setItem(STORED_FOLLOWUP_LINK_KEY, JSON.stringify(stored)); } catch { /* privacy/storage restrictions */ }
    return stored;
  } catch { return undefined; }
}
