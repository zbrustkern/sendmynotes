"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { OrderAttribution } from "@/lib/types";
import { getGoogleClientId } from "@/lib/telemetry";
import { GA4_MEASUREMENT_ID } from "@/lib/google-ads";
import { mayStoreGoogleClientId } from "@/lib/order-attribution";
import { trackMetaPageView, getMetaBrowserCookie, buildMetaFbcString } from "@/lib/meta-ads";

export const SMN_ATTRIBUTION_KEY = "smn_attribution";
let memoryAttribution: OrderAttribution | null = null;

function persistAttribution(attribution: OrderAttribution): void {
  memoryAttribution = attribution;
  try { sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch { /* in-memory fallback */ }
  try { localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch { /* in-memory fallback */ }
}

function boundedParam(value: string | undefined, max = 255): string | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  if (!clean || clean.length > max || /@|[\r\n\0]/.test(clean)) return undefined;
  return clean;
}

function boundedGoogleClickId(value: string | undefined): string | undefined {
  const clean = boundedParam(value, 255);
  return clean && /^[A-Za-z0-9._~-]+$/.test(clean) ? clean : undefined;
}

function normalizedClientIdFromCookie(): string | undefined {
  const raw = getGoogleClientId();
  const match = raw?.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return match?.[1];
}

/**
 * Retrieve first-party cookie by name safely.
 */
function getDocumentCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * Retrieves the stored attribution data from session/local storage,
 * lazily backfilling Meta cookies (_fbp, _fbc) if they were set asynchronously
 * by the Meta Pixel script after initial page load.
 */
export function getStoredAttribution(): OrderAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = (() => { try { return sessionStorage.getItem(SMN_ATTRIBUTION_KEY); } catch { return null; } })() ||
      (() => { try { return localStorage.getItem(SMN_ATTRIBUTION_KEY); } catch { return null; } })();
    if (!raw) return memoryAttribution;

    const parsed = JSON.parse(raw) as OrderAttribution;
    const expiresAt = parsed.expiresAt || (parsed.capturedAt ? parsed.capturedAt + 90 * 24 * 60 * 60 * 1000 : 0);
    if (!expiresAt || expiresAt <= Date.now()) {
      try { sessionStorage.removeItem(SMN_ATTRIBUTION_KEY); } catch { /* storage unavailable */ }
      try { localStorage.removeItem(SMN_ATTRIBUTION_KEY); } catch { /* storage unavailable */ }
      memoryAttribution = null;
      return null;
    }

    // Check if _fbp or _fbc became available after the initial attribution was saved
    let changed = false;
    if (!parsed.fbp) {
      const fbp = getMetaBrowserCookie("_fbp") || getDocumentCookie("_fbp");
      if (fbp) {
        parsed.fbp = fbp;
        changed = true;
      }
    }

    if (!parsed.fbc) {
      const fbc =
        getMetaBrowserCookie("_fbc") ||
        getDocumentCookie("_fbc") ||
        (parsed.fbclid ? buildMetaFbcString(parsed.fbclid) : null);
      if (fbc) {
        parsed.fbc = fbc;
        changed = true;
      }
    }

    if (changed) {
      persistAttribution(parsed);
    }

    return parsed;
  } catch {
    return memoryAttribution;
  }
}

function AttributionTrackerInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  // Track Meta Pixel PageView on client-side route transitions (SPA navigation)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Subsequent client-side route transitions
    trackMetaPageView();
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const isGpcActive =
        typeof navigator !== "undefined" &&
        (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

      if (isGpcActive) {
        const win = window as unknown as { fbq?: (...args: unknown[]) => void };
        if (typeof win.fbq === "function") {
          // Enforce Meta Limited Data Use for GPC compliance
          win.fbq("dataProcessingOptions", ["LDU"], 0, 0);
        }
      }

      const utmSource = boundedParam(searchParams.get("utm_source") || undefined, 100);
      const utmMedium = boundedParam(searchParams.get("utm_medium") || undefined, 100);
      const utmCampaign = boundedParam(searchParams.get("utm_campaign") || undefined, 100);
      const utmContent = boundedParam(searchParams.get("utm_content") || undefined, 100);
      const utmTerm = boundedParam(searchParams.get("utm_term") || undefined, 100);
      const gclid = boundedGoogleClickId(searchParams.get("gclid") || undefined);
      const wbraid = boundedGoogleClickId(searchParams.get("wbraid") || undefined);
      const gbraid = boundedGoogleClickId(searchParams.get("gbraid") || undefined);
      const fbclid = boundedParam(searchParams.get("fbclid") || undefined);

      const hasCampaignParams = Boolean(
        utmSource || utmMedium || utmCampaign || gclid || wbraid || gbraid || fbclid || utmContent || utmTerm
      );

      // Extract Meta cookies
      const fbp = getMetaBrowserCookie("_fbp") || getDocumentCookie("_fbp");
      let fbc = getMetaBrowserCookie("_fbc") || getDocumentCookie("_fbc");
      if (!fbc && fbclid) {
        fbc = buildMetaFbcString(fbclid) || undefined;
      }

      // If user landed with campaign parameters, overwrite or set attribution
      if (hasCampaignParams) {
        const googleClick = gclid || wbraid || gbraid;
        const defaultSource = googleClick ? "google" : fbclid ? "meta" : undefined;
        const defaultMedium = googleClick || fbclid ? "cpc" : undefined;
        const defaultCampaign = googleClick ? "Google Ads" : fbclid ? "Meta Ads" : undefined;

        const attribution: OrderAttribution = {
          utmSource: utmSource || defaultSource,
          utmMedium: utmMedium || defaultMedium,
          utmCampaign: utmCampaign || defaultCampaign,
          utmContent,
          utmTerm,
          gclid: isGpcActive ? undefined : gclid,
          wbraid: isGpcActive ? undefined : wbraid,
          gbraid: isGpcActive ? undefined : gbraid,
          fbclid,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
          referrer: document.referrer || undefined,
          landingPath: pathname || window.location.pathname,
          googleClientId: isGpcActive ? undefined : getGoogleClientId(),
          googleClientIdNormalized: isGpcActive ? undefined : normalizedClientIdFromCookie(),
          gpc: isGpcActive || undefined,
          capturedAt: Date.now(),
          expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
        };

        persistAttribution(attribution);
        return;
      }

      // If no campaign params, check if we already have an attribution stored in this session
      const existing =
        (() => { try { return sessionStorage.getItem(SMN_ATTRIBUTION_KEY); } catch { return null; } })() ||
        (() => { try { return localStorage.getItem(SMN_ATTRIBUTION_KEY); } catch { return null; } })() ||
        (memoryAttribution ? JSON.stringify(memoryAttribution) : null);
      if (existing) {
        // Just make sure fbp/fbc are augmented if they were populated after script init
        try {
          const parsed = JSON.parse(existing) as OrderAttribution;
          const expiresAt = parsed.expiresAt || (parsed.capturedAt ? parsed.capturedAt + 90 * 24 * 60 * 60 * 1000 : 0);
          if (!expiresAt || expiresAt <= Date.now()) {
            try { sessionStorage.removeItem(SMN_ATTRIBUTION_KEY); } catch { /* storage unavailable */ }
            try { localStorage.removeItem(SMN_ATTRIBUTION_KEY); } catch { /* storage unavailable */ }
            memoryAttribution = null;
          } else {
          let updated = false;
          if (!parsed.fbp && fbp) {
            parsed.fbp = fbp;
            updated = true;
          }
          if (!parsed.fbc && fbc) {
            parsed.fbc = fbc;
            updated = true;
          }
          if (updated) {
            persistAttribution(parsed);
          }
          return;
          }
        } catch {
          // ignore
        }
      }

      // First time visitor without UTMs: classify referrer
      const ref = document.referrer;
      let detectedSource = "direct";
      let detectedMedium = "none";

      if (ref) {
        try {
          const refHost = new URL(ref).hostname.toLowerCase();
          if (!refHost.includes(window.location.hostname.toLowerCase())) {
            if (refHost.includes("google.")) {
              detectedSource = "google";
              detectedMedium = "organic";
            } else if (refHost.includes("bing.")) {
              detectedSource = "bing";
              detectedMedium = "organic";
            } else if (refHost.includes("yahoo.")) {
              detectedSource = "yahoo";
              detectedMedium = "organic";
            } else if (
              refHost.includes("facebook.") ||
              refHost.includes("fb.com") ||
              refHost.includes("instagram.")
            ) {
              detectedSource = "meta";
              detectedMedium = "social";
            } else if (
              refHost.includes("t.co") ||
              refHost.includes("twitter.") ||
              refHost.includes("x.com")
            ) {
              detectedSource = "x";
              detectedMedium = "social";
            } else if (refHost.includes("linkedin.")) {
              detectedSource = "linkedin";
              detectedMedium = "social";
            } else if (refHost.includes("reddit.")) {
              detectedSource = "reddit";
              detectedMedium = "social";
            } else {
              detectedSource = refHost;
              detectedMedium = "referral";
            }
          }
        } catch {
          // invalid referrer URL
        }
      }

      const defaultAttribution: OrderAttribution = {
        utmSource: detectedSource,
        utmMedium: detectedMedium,
        utmCampaign: "(direct/organic)",
        referrer: ref || undefined,
        landingPath: pathname || window.location.pathname,
        fbp: fbp || undefined,
        fbc: fbc || undefined,
        gpc: isGpcActive || undefined,
        capturedAt: Date.now(),
        expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      };

      persistAttribution(defaultAttribution);
    } catch (e) {
      console.warn("[Attribution Tracker] Non-fatal capture notice:", e);
    }
  }, [searchParams, pathname]);

  // Keep the historical raw _ga value intact; store Google's normalized client ID separately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attemptBackfill = () => {
      const gpcActive = typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
      if (!active || !mayStoreGoogleClientId(gpcActive, getStoredAttribution())) return;
      attempts++;
      const win = window as unknown as { gtag?: (...args: unknown[]) => void };
      if (typeof win.gtag !== "function") {
        if (attempts < 6) timer = setTimeout(attemptBackfill, 500);
        return;
      }
      try {
        win.gtag("get", GA4_MEASUREMENT_ID, "client_id", (clientId: unknown) => {
          if (!active) return;
          const callbackGpcActive = typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
          const attr = getStoredAttribution();
          if (!mayStoreGoogleClientId(callbackGpcActive, attr)) return;
          if (typeof clientId !== "string" || clientId.length > 100) return;
          if (!attr || attr.googleClientIdNormalized) return;
          persistAttribution({ ...attr, googleClientIdNormalized: clientId });
        });
      } catch { /* tag client ID is optional */ }
    };
    attemptBackfill();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [pathname]);

  return null;
}

export function AttributionTracker() {
  return (
    <Suspense fallback={null}>
      <AttributionTrackerInner />
    </Suspense>
  );
}
