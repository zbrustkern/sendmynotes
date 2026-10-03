"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminFeatureFlagsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin?tab=flags");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-4">
      <div className="text-center space-y-3">
        <div className="w-9 h-9 mx-auto border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono font-medium text-stone-600">
          Loading Admin Console &bull; Feature Flags Tab...
        </p>
      </div>
    </div>
  );
}
