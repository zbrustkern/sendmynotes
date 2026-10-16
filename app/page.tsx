import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { isReworkV3Enabled } from "@/lib/feature-flags";
import { ExperienceRouter } from "@/components/ExperienceRouter";
import { RootAutoSelectRedirect } from "@/components/RootAutoSelectRedirect";

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawAuto = resolvedParams["auto_select"];
  const autoParam = Array.isArray(rawAuto) ? rawAuto[0] : rawAuto;
  const rawUtm = resolvedParams["utm_source"];
  const utmSource =
    typeof rawUtm === "string"
      ? rawUtm.trim().toLowerCase()
      : Array.isArray(rawUtm) && typeof rawUtm[0] === "string"
      ? rawUtm[0].trim().toLowerCase()
      : undefined;

  const isAuto = autoParam === "1" || utmSource === "google" || utmSource === "meta";

  // 1. Server-side redirect: if auto_select=1 or paid campaign UTM source is present,
  // immediately redirect to /send with all search parameters preserved.
  if (isAuto) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(resolvedParams)) {
      if (typeof value === "string") {
        params.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      }
    }
    if (!params.has("auto_select")) {
      params.set("auto_select", "1");
    }
    redirect(`/send?${params.toString()}`);
  }

  const isV3 = await isReworkV3Enabled({ searchParams: resolvedParams });

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-800 rounded-full animate-spin mx-auto" />
            <p className="text-xs font-serif uppercase tracking-widest text-stone-600">
              Opening SendMyNotes...
            </p>
          </div>
        </div>
      }
    >
      <RootAutoSelectRedirect />
      <ExperienceRouter
        initialIsV3={isAuto ? true : isV3}
        initialOccasion={isAuto ? "Thinking of You" : undefined}
        initialCoverUrl={isAuto ? "/presets/thinking-of-you-quiet-cup.jpg" : undefined}
        initialHandwrittenNote={
          isAuto
            ? "Just wanted to send a little piece of sunshine your way. Hope today treats you kindly. Thinking of you and can't wait to catch up soon!"
            : undefined
        }
        scenarioTitle={isAuto ? "A Quiet Cup" : undefined}
        embedded={false}
        initialStep={isAuto ? "note" : undefined}
      />
    </Suspense>
  );
}
