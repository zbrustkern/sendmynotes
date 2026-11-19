"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trackEventV2 } from "@/lib/telemetry";

export function WeddingLink({ href = "/thank-you", children = "Thank-you notes", className = "" }: { href?: string; children?: React.ReactNode; className?: string }) {
  const source = useSearchParams();
  const query = new URLSearchParams();
  source?.forEach((value, key) => {
    if (/^(utm_(source|medium|campaign|term|content)|gclid|fbclid)$/.test(key)) query.set(key,value);
  });
  return <Link href={href + (query.size ? "?" + query.toString() : "")} className={className}
    onClick={() => { void trackEventV2("wedding_portal_opened"); }}>{children}</Link>;
}
export function WeddingEntry() {
  return <nav aria-label="Thank-you projects" className="border-b border-stone-200 bg-[#f4f2e9] px-4 py-2 text-center text-sm text-stone-700">
    Sending wedding thank-yous? <WeddingLink className="ml-1 font-semibold text-emerald-900 underline underline-offset-4" />
  </nav>;
}
