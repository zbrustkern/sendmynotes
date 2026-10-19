"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AdminSessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/auth", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (response.ok && data.authenticated === true) {
          setAuthorized(true);
          return;
        }
        const query = searchParams?.toString();
        const returnTo = `${pathname}${query ? `?${query}` : ""}`;
        router.replace(`/admin?returnTo=${encodeURIComponent(returnTo)}`);
      })
      .catch(() => {
        if (!active) return;
        const query = searchParams?.toString();
        const returnTo = `${pathname}${query ? `?${query}` : ""}`;
        router.replace(`/admin?returnTo=${encodeURIComponent(returnTo)}`);
      })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [pathname, router, searchParams]);

  if (checking || !authorized) {
    return <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] text-sm text-stone-600">Checking admin access…</div>;
  }
  return <>{children}</>;
}
