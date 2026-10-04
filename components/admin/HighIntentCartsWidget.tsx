"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  Clock,
  ArrowRight,
  Copy,
  Check,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Sparkles,
  Tag,
  DollarSign,
} from "lucide-react";
import { AdminMetrics, VisitorSessionRecord } from "@/lib/types";

interface HighIntentCartsWidgetProps {
  metrics: AdminMetrics | null;
}

export function HighIntentCartsWidget({ metrics }: HighIntentCartsWidgetProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const telemetry = metrics?.visitorTelemetry;
  const sessions = telemetry?.recentSessions || [];

  // Filter for uncompleted sessions that reached Step 3 (Address) or Step 4 (Payment)
  const abandonedCarts = sessions.filter(
    (s) => !s.completed && s.highestStep >= 3 && !s.isBot
  );

  const handleCopyLink = (code: string, id: string) => {
    const link = `https://sendmynotes.com?promo=${code}&utm_source=cart_recovery&utm_medium=email`;
    navigator.clipboard.writeText(link);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const potentialRevenue = abandonedCarts.length * 9.0;

  if (abandonedCarts.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-amber-200/80 shadow-2xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-amber-200/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-950 border border-amber-300">
              High-Intent Recovery
            </span>
            <h3 className="text-base font-bold text-amber-950 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span>{abandonedCarts.length} Abandoned Checkout{abandonedCarts.length === 1 ? "" : "s"}</span>
            </h3>
          </div>
          <p className="text-xs text-amber-900/80 mt-1">
            Visitors who designed a card, crafted a note, and entered the address flow, but did not complete Stripe payment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-amber-800 uppercase font-semibold block">Recoverable Volume</span>
            <span className="text-base font-bold text-amber-950">${potentialRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ABANDONED SESSIONS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {abandonedCarts.slice(0, 6).map((cart, idx) => {
          const timeAgo = formatTimeAgo(cart.lastSeenAt);

          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-4 border border-amber-200 shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-stone-500 text-[11px]">
                  <span className="font-semibold text-stone-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-stone-400" />
                    {timeAgo}
                  </span>
                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-900 border border-amber-300">
                    Step {cart.highestStep}: {cart.highestStepName}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-stone-400 block font-medium">Acquisition Origin</span>
                  <p className="font-semibold text-stone-900 truncate">
                    {cart.campaign || (cart.gclid ? "Google Ads" : `${cart.source} / ${cart.medium}`)}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                  <div className="flex items-center gap-1">
                    {cart.deviceType === "mobile" && <Smartphone className="w-3 h-3 text-stone-400" />}
                    {cart.deviceType === "desktop" && <Monitor className="w-3 h-3 text-stone-400" />}
                    {cart.deviceType === "tablet" && <Tablet className="w-3 h-3 text-stone-400" />}
                    <span className="capitalize">{cart.deviceType}</span>
                  </div>

                  <div className="flex items-center gap-1 truncate max-w-[130px]">
                    <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                    <span className="truncate">{cart.city || "US Metro"}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                <span className="text-[10px] text-stone-400 font-mono truncate max-w-[120px]" title={cart.googleClientId}>
                  {cart.googleClientId ? `_ga: ${cart.googleClientId.slice(0, 10)}...` : "Direct session"}
                </span>

                <button
                  type="button"
                  onClick={() => handleCopyLink("WELCOME10", cart.sessionId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-[11px] font-semibold transition"
                  title="Copy 1-Click Recovery Link ($2 off) to send to customer"
                >
                  {copiedLink === cart.sessionId ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Tag className="w-3 h-3 text-amber-700" />
                      <span>Copy Recovery Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
