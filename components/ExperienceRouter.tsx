"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EntryPrototypeClient } from "@/app/preview/entry/client";
import { VendingMachineBuilder } from "@/components/VendingMachineBuilder";

export interface ExperienceRouterProps {
  initialIsV3?: boolean;
  initialOccasion?: string;
  initialCoverUrl?: string;
  initialPrintedGreeting?: string;
  initialHandwrittenNote?: string;
  initialFontStyleId?: string;
  scenarioSlug?: string;
  scenarioTitle?: string;
  embedded?: boolean;
  initialStep?: "card" | "note" | "address" | "pay";
}

export function ExperienceRouter({
  initialIsV3 = true,
  initialOccasion,
  initialCoverUrl,
  initialPrintedGreeting,
  initialHandwrittenNote,
  initialFontStyleId,
  scenarioSlug,
  scenarioTitle,
  embedded,
  initialStep,
}: ExperienceRouterProps) {
  const searchParams = useSearchParams();

  const isV3 = useMemo(() => {
    // 1. Client query override check: ?v3=1 -> true, ?v3=0 -> false
    if (searchParams) {
      const v3Param = searchParams.get("v3");
      if (v3Param === "1" || v3Param === "true") return true;
      if (v3Param === "0" || v3Param === "false") return false;
    }
    // 2. Fallback to server-resolved feature flag state (defaults to true)
    return initialIsV3;
  }, [searchParams, initialIsV3]);

  const isAutoSelect = useMemo(() => {
    if (!searchParams) return false;
    const utm = searchParams.get("utm_source")?.toLowerCase();
    const auto = searchParams.get("auto_select");
    return auto === "1" || utm === "google" || utm === "meta";
  }, [searchParams]);

  const effectiveEmbedded = isAutoSelect ? false : embedded;
  const effectiveInitialStep = isAutoSelect ? "note" : initialStep;

  // Active Studio component requirement: auto-selected flows MUST run on the active V3 studio
  const effectiveIsV3 = isAutoSelect ? true : isV3;

  const effectiveOccasion = initialOccasion || (isAutoSelect ? "Thinking of You" : undefined);
  const effectiveCoverUrl = initialCoverUrl || (isAutoSelect ? "/presets/thinking-of-you-quiet-cup.jpg" : undefined);
  const effectiveHandwrittenNote =
    initialHandwrittenNote ||
    (isAutoSelect
      ? "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Thinking of you and can't wait to catch up soon!"
      : undefined);
  const effectiveScenarioTitle = scenarioTitle || (isAutoSelect ? "A Quiet Cup" : undefined);

  if (effectiveIsV3) {
    return (
      <EntryPrototypeClient
        initialOccasion={effectiveOccasion}
        initialCoverUrl={effectiveCoverUrl}
        initialPrintedGreeting={initialPrintedGreeting}
        initialHandwrittenNote={effectiveHandwrittenNote}
        initialFontStyleId={initialFontStyleId}
        scenarioSlug={scenarioSlug}
        scenarioTitle={effectiveScenarioTitle}
        embedded={effectiveEmbedded}
        initialStep={effectiveInitialStep}
      />
    );
  }

  return (
    <VendingMachineBuilder
      initialOccasion={effectiveOccasion}
      initialCoverUrl={effectiveCoverUrl}
      initialPrintedGreeting={initialPrintedGreeting}
      initialHandwrittenNote={effectiveHandwrittenNote}
      initialFontStyleId={initialFontStyleId}
      scenarioSlug={scenarioSlug}
      initialStep={effectiveInitialStep === "note" ? 2 : 1}
    />
  );
}

