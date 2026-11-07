import { Suspense } from "react";
import { EntryPrototypeClient } from "./client";
import { getFeatureFlagsState } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
  title: "SendMyNotes - Choose a Card (Prototype)",
};

export default async function EntryPreviewPage() {
  const flags = await getFeatureFlagsState();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-emerald-700 rounded-full animate-spin mx-auto" />
            <p className="text-xs uppercase tracking-widest text-stone-500">
              Loading preview...
            </p>
          </div>
        </div>
      }
    >
      <EntryPrototypeClient multiSendEnabled={flags.flags.multiSendEnabled === true} />
    </Suspense>
  );
}
