"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Globe,
  ExternalLink,
  Target,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Search,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { AdminMetrics, Order } from "@/lib/types";

interface CampaignPerformanceWidgetProps {
  metrics: AdminMetrics | null;
  orders: Order[];
}

export function CampaignPerformanceWidget({ metrics, orders }: CampaignPerformanceWidgetProps) {
  const [search, setSearch] = useState("");

  const telemetry = metrics?.visitorTelemetry;
  const sessions = telemetry?.recentSessions || [];
  const sources = telemetry?.acquisitionSources || [];

  // Group orders by campaign / channel
  const campaignDataMap = new Map<
    string,
    {
      name: string;
      channel: string;
      visitors: number;
      reachedAddress: number;
      purchases: number;
      revenueDollars: number;
      netMarginDollars: number;
      landingPage?: string;
    }
  >();

  // 1. Populate from sessions
  for (const s of sessions) {
    const campName = s.campaign || (s.gclid ? "Google Ads (Auto-Tagged)" : s.source ? `${s.source} / ${s.medium}` : "Direct / Organic");
    const channel = s.gclid || s.source === "google" && s.medium === "cpc" ? "Google Ads" : s.medium === "organic" ? "Organic" : s.medium === "social" ? "Social" : "Direct";

    if (!campaignDataMap.has(campName)) {
      campaignDataMap.set(campName, {
        name: campName,
        channel,
        visitors: 0,
        reachedAddress: 0,
        purchases: 0,
        revenueDollars: 0,
        netMarginDollars: 0,
        landingPage: s.landingPath,
      });
    }

    const row = campaignDataMap.get(campName)!;
    row.visitors++;
    if (s.highestStep >= 3) {
      row.reachedAddress++;
    }
    if (s.completed) {
      row.purchases++;
      row.revenueDollars += 9.0;
      row.netMarginDollars += 3.56;
    }
  }

  // 2. Also incorporate completed orders that have attribution
  for (const ord of orders) {
    if (ord.status === "PENDING_PAYMENT" || ord.status === "FAILED" || ord.status === "PAYMENT_VERIFICATION_FAILED") continue;
    const camp = ord.attribution?.utmCampaign || (ord.attribution?.gclid ? "Google Ads" : "Direct / Organic");
    if (campaignDataMap.has(camp)) {
      // Ensure orders count matches
      const r = campaignDataMap.get(camp)!;
      if (r.purchases === 0) {
        r.purchases += 1;
        r.revenueDollars += (ord.amountInCents || 900) / 100;
        r.netMarginDollars += 3.56;
      }
    } else {
      campaignDataMap.set(camp, {
        name: camp,
        channel: ord.attribution?.gclid ? "Google Ads" : "Direct",
        visitors: 1,
        reachedAddress: 1,
        purchases: 1,
        revenueDollars: (ord.amountInCents || 900) / 100,
        netMarginDollars: 3.56,
        landingPage: ord.attribution?.landingPath,
      });
    }
  }

  const rows = Array.from(campaignDataMap.values()).filter((r) => {
    if (!search) return true;
    return r.name.toLowerCase().includes(search.toLowerCase()) || r.channel.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-stone-200 shadow-sm space-y-6">
      {/* HEADER & TAG HEALTH STATUS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Live Campaign Performance &amp; Channel Attribution</span>
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Funnel
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Tracks real ad performance, high-intent address entries, and net contribution without opening Google Ads.
          </p>
        </div>

        {/* GOOGLE ADS & GA4 HEALTH STATUS PILLS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Google Ads: AW-18474411963</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>GA4: G-5DV25FZ7Q8</span>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs font-semibold text-stone-700">
          Active Traffic Channels ({rows.length})
        </span>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search campaign or channel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
          />
        </div>
      </div>

      {/* TABLE */}
      {rows.length === 0 ? (
        <div className="text-center py-10 bg-stone-50/60 rounded-2xl border border-stone-200 space-y-2">
          <Activity className="w-6 h-6 text-stone-400 mx-auto animate-pulse" />
          <p className="text-xs font-medium text-stone-700">Awaiting Ad Clicks &amp; Visitor Sessions</p>
          <p className="text-[11px] text-stone-500 max-w-md mx-auto">
            Once ad traffic hits your landing pages, each campaign (e.g. Pet Loss, Anniversary) will display here with live visitor counts, address entries, and purchases.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200">
          <table className="w-full text-left text-xs bg-white">
            <thead className="bg-stone-50/80 border-b border-stone-200 text-stone-400 text-[10px] uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-3">Campaign / Source</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3 text-center">Visitors</th>
                <th className="py-2.5 px-3 text-center">Reached Address (Step 3)</th>
                <th className="py-2.5 px-3 text-center">Purchases</th>
                <th className="py-2.5 px-3 text-right">Conv. Rate</th>
                <th className="py-2.5 px-3 text-right">Gross Revenue</th>
                <th className="py-2.5 px-3 text-right">Net Studio Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((row, idx) => {
                const convRate = row.visitors > 0 ? ((row.purchases / row.visitors) * 100).toFixed(1) : "0.0";
                const highIntentRate = row.visitors > 0 ? Math.round((row.reachedAddress / row.visitors) * 100) : 0;

                return (
                  <tr key={idx} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-semibold text-stone-900 block truncate max-w-[200px]" title={row.name}>
                        {row.name}
                      </span>
                      {row.landingPage && (
                        <span className="text-[10px] text-stone-400 font-mono truncate block max-w-[180px]">
                          {row.landingPage}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.channel === "Google Ads"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : "bg-stone-100 text-stone-700 border border-stone-200"
                        }`}
                      >
                        {row.channel}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center font-medium text-stone-700">
                      {row.visitors}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-800">
                        {row.reachedAddress}
                        <span className="text-[10px] font-normal text-stone-400">
                          ({highIntentRate}%)
                        </span>
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs ${
                          row.purchases > 0
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "text-stone-400"
                        }`}
                      >
                        {row.purchases}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-medium text-stone-800">
                      {convRate}%
                    </td>

                    <td className="py-3 px-3 text-right font-semibold text-stone-900">
                      ${row.revenueDollars.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-700">
                      +${row.netMarginDollars.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
