import { Suspense } from "react";
import { isReworkV3Enabled } from "@/lib/feature-flags";
import { ExperienceRouter } from "@/components/ExperienceRouter";

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const isV3 = await isReworkV3Enabled({ searchParams: resolvedParams });
  const autoParam = resolvedParams["auto_select"];
  const utmSource = typeof resolvedParams["utm_source"] === "string" ? resolvedParams["utm_source"].toLowerCase() : undefined;
  const isAuto = autoParam === "1" || utmSource === "google" || utmSource === "meta";

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
      <ExperienceRouter initialIsV3={isV3} initialStep={isAuto ? "note" : undefined} />
    </Suspense>
  );
}
