import { Suspense } from "react";
import { TargetPurchaseExperience } from "@/components/v3/TargetPurchaseExperience";

export const metadata = {
  title: "Send a Real Handwritten Card in 60 Seconds | SendMyNotes",
  description:
    "Curated stationery cards written in real ballpoint pen by automated precision plotters. Mailed via USPS First-Class with your personal return address for $9.00 flat rate.",
};

export default function NewCardPage() {
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
      <TargetPurchaseExperience />
    </Suspense>
  );
}
