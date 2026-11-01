import React, { Suspense } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-600">Loading admin workspace…</div>}>
      {children}
    </Suspense>
  );
}
