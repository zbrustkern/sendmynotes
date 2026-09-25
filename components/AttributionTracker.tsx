"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { OrderAttribution } from "@/lib/types";

export const SMN_ATTRIBUTION_KEY = "smn_attribution";

export function getStoredAttribution(): OrderAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SMN_ATTRIBUTION_KEY) || localStorage.getItem(SMN_ATTRIBUTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OrderAttribution;
  } catch {
    return null;
  }
}

function AttributionTrackerInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const utmSource = searchParams.get("utm_source") || undefined;
      const utmMedium = searchParams.get("utm_medium") || undefined;
      const utmCampaign = searchParams.get("utm_campaign") || undefined;
      const utmContent = searchParams.get("utm_content") || undefined;
      const utmTerm = searchParams.get("utm_term") || undefined;
      const gclid = searchParams.get("gclid") || undefined;

      const hasCampaignParams = Boolean(utmSource || utmMedium || utmCampaign || gclid || utmContent || utmTerm);

      // If user landed with campaign parameters, overwrite or set attribution
      if (hasCampaignParams) {
        const attribution: OrderAttribution = {
          utmSource: utmSource || (gclid ? "google" : undefined),
          utmMedium: utmMedium || (gclid ? "cpc" : undefined),
          utmCampaign: utmCampaign || (gclid ? "Google Ads" : undefined),
          utmContent,
          utmTerm,
          gclid,
          referrer: document.referrer || undefined,
          landingPath: pathname || window.location.pathname,
          capturedAt: Date.now(),
        };

        sessionStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution));
        localStorage.setItem(SMN_ATTRIBUTION_KEY, JSON.stringify(attribution));
        return;
      }

      // If no campaign params, check if we already have an attribution stored in this session
      const existing = sessionStorage.getItem(SMN_ATTRIBUTION_KEY) || localStorage.getItem(SMN_ATTRIBUTION_KEY);
      if (existing) {
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
            } else if (refHost.includes("facebook.") || refHost.includes("fb.com") || refHost.includes("instagram.")) {
              detectedSource = "meta";
              detectedMedium = "social";
            } else if (refHost.includes("t.co") || refHost.includes("twitter.") || refHost.includes("x.com")) {
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
