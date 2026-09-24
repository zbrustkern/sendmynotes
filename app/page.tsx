import { Suspense } from "react";
import { VendingMachineBuilder } from "@/components/VendingMachineBuilder";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FCFAF7] flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-700 rounded-full animate-spin mx-auto" />
            <p className="text-xs font-serif uppercase tracking-widest text-stone-500">
              Opening Aster &amp; Blanche Atelier...
            </p>
          </div>
        </div>
      }
    >
      <VendingMachineBuilder />
    </Suspense>
  );
}
