"use client";

import React, { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { privateOrderPath } from "@/lib/order-tracking-links";

export function CopyPrivateOrderLink({
  orderId,
  readToken,
  compact = false,
}: {
  orderId: string;
  readToken?: string | null;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");

  if (!readToken) return null;

  const copy = async () => {
    setCopied(false);
    setFallbackUrl("");
    const privateUrl = new URL(privateOrderPath(orderId, readToken), window.location.origin).toString();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(privateUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFallbackUrl(privateUrl);
    }
  };

  return (
    <section className={`rounded-2xl border border-emerald-200 bg-emerald-50/80 ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-stone-900">Keep a private link to this order</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">Anyone with this private link can view this order. Save it somewhere you can find it again.</p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Private link copied" : "Copy private order link"}
          </button>
          {fallbackUrl && (
            <div className="mt-3">
              <label htmlFor={`private-order-link-${orderId}`} className="mb-1 block text-xs text-stone-700">Select and copy this private link:</label>
              <input
                id={`private-order-link-${orderId}`}
                type="text"
                readOnly
                value={fallbackUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-[11px] text-stone-900"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
