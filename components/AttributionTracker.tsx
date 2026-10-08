"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { OrderAttribution } from "@/lib/types";
import { getGoogleClientId } from "@/lib/telemetry";
import { trackMetaPageView, getMetaBrowserCookie, buildMetaFbcString } from "@/lib/meta-ads";

export const SMN_ATTRIBUTION_KEY = "smn_attribution";

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
    const raw =
      sessionStorage.getItem(SMN_ATTRIBUTION_KEY) ||
      localStorage.getItem(SMN_ATTRIBUTION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as OrderAttribution;

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
      sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(parsed));
      localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch {
    return null;
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

      const utmSource = searchParams.get("utm_source") || undefined;
      const utmMedium = searchParams.get("utm_medium") || undefined;
      const utmCampaign = searchParams.get("utm_campaign") || undefined;
      const utmContent = searchParams.get("utm_content") || undefined;
      const utmTerm = searchParams.get("utm_term") || undefined;
      const gclid = searchParams.get("gclid") || undefined;
      const fbclid = searchParams.get("fbclid") || undefined;

      const hasCampaignParams = Boolean(
        utmSource || utmMedium || utmCampaign || gclid || fbclid || utmContent || utmTerm
      );

      // Extract Meta cookies
      const fbp = getMetaBrowserCookie("_fbp") || getDocumentCookie("_fbp");
      let fbc = getMetaBrowserCookie("_fbc") || getDocumentCookie("_fbc");
      if (!fbc && fbclid) {
        fbc = buildMetaFbcString(fbclid) || undefined;
      }

      // If user landed with campaign parameters, overwrite or set attribution
      if (hasCampaignParams) {
        const defaultSource = gclid ? "google" : fbclid ? "meta" : undefined;
        const defaultMedium = gclid || fbclid ? "cpc" : undefined;
        const defaultCampaign = gclid ? "Google Ads" : fbclid ? "Meta Ads" : undefined;

        const attribution: OrderAttribution = {
          utmSource: utmSource || defaultSource,
          utmMedium: utmMedium || defaultMedium,
          utmCampaign: utmCampaign || defaultCampaign,
          utmContent,
          utmTerm,
          gclid,
          fbclid,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
          referrer: document.referrer || undefined,
          landingPath: pathname || window.location.pathname,
          googleClientId: getGoogleClientId(),
          gpc: isGpcActive || undefined,
          capturedAt: Date.now(),
        };

        sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution));
        localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution));
        return;
      }

      // If no campaign params, check if we already have an attribution stored in this session
      const existing =
        sessionStorage.getItem(SMN_ATTRIBUTION_KEY) ||
        localStorage.getItem(SMN_ATTRIBUTION_KEY);
      if (existing) {
        // Just make sure fbp/fbc are augmented if they were populated after script init
        try {
          const parsed = JSON.parse(existing) as OrderAttribution;
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
            sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(parsed));
            localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(parsed));
          }
        } catch {
          // ignore
        }
        return;
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
      };

      sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(defaultAttribution));
      localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(defaultAttribution));
    } catch (e) {
      console.warn("[Attribution Tracker] Non-fatal capture notice:", e);
    }
  }, [searchParams, pathname]);

  return null;
}

export function AttributionTracker() {
  return (
    <Suspense fallback={null}>
      <AttributionTrackerInner />
    </Suspense>
  );
}
