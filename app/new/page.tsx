import { Suspense } from "react";
import { EntryPrototypeClient } from "@/app/preview/entry/client";
import { getFeatureFlagsState } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Send a Real Handwritten Card Online | SendMyNotes",
  description:
    "Curated greeting cards written in real ballpoint pen ink. Mailed via USPS First-Class with your return address for $9.00 total.",
};

export default async function NewCardPage() {
  const flags = await getFeatureFlagsState();
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
      <EntryPrototypeClient multiSendEnabled={flags.flags.multiSendEnabled === true} />
    </Suspense>
  );
}
