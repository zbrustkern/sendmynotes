"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Client-side mount hook for the root route (app/page.tsx).
 * Detects ?auto_select=1 or paid campaign UTM source parameters on client hydration
 * and immediately transitions to /send with preselected Thinking of You note studio.
 */
export function RootAutoSelectRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 1. Inspect searchParams from next/navigation
    const autoParam = searchParams?.get("auto_select");
    const utmSource = searchParams?.get("utm_source")?.toLowerCase();

    // 2. Also inspect window.location.search in case client navigation happened before hook updated
    let windowAuto: string | null = null;
    let windowUtm: string | null = null;
    let windowQuery = "";
    if (typeof window !== "undefined" && window.location?.search) {
      try {
        const parsed = new URLSearchParams(window.location.search);
        windowAuto = parsed.get("auto_select");
        const rawUtm = parsed.get("utm_source");
        windowUtm = rawUtm ? rawUtm.toLowerCase() : null;
        windowQuery = window.location.search.replace(/^\?/, "");
      } catch {
        // ignore malformed URI
      }
    }

    const isAuto =
      autoParam === "1" ||
      windowAuto === "1" ||
      utmSource === "google" ||
      utmSource === "meta" ||
      windowUtm === "google" ||
      windowUtm === "meta";

    if (isAuto) {
      const effectiveQuery = searchParams?.toString() || windowQuery;
      const params = new URLSearchParams(effectiveQuery);
      router.replace(`/send?${params.toString()}`);
    }
  }, [searchParams, router]);

  return null;
}
