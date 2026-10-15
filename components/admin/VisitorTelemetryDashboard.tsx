"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Search,
  Activity,
  Globe,
  Compass,
  Bot,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Laptop,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { AdminMetrics, VisitorSessionRecord } from "@/lib/types";

interface VisitorTelemetryDashboardProps {
  metrics: AdminMetrics | null;
  filterDateRange?: string;
  onDateRangeChange?: (range: string) => void;
  excludeFounder?: boolean;
  onExcludeFounderChange?: (exclude: boolean) => void;
  filterChannel?: string;
  onChannelChange?: (channel: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomDateChange?: (from: string, to: string) => void;
  onRefresh?: () => void;
  isMarkingFounder?: boolean;
  onMarkFounderDevice?: () => void;
  founderMarkedSuccess?: boolean;
}

export function VisitorTelemetryDashboard({
  metrics,
  filterDateRange = "oct13",
  onDateRangeChange,
  excludeFounder = true,
  onExcludeFounderChange,
  filterChannel = "all",
  onChannelChange,
  customFrom = "",
  customTo = "",
  onCustomDateChange,
  onRefresh,
  isMarkingFounder = false,
  onMarkFounderDevice,
  founderMarkedSuccess = false,
}: VisitorTelemetryDashboardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");

  if (!metrics) return null;

  const isFounderDeviceSaved =
    typeof window !== "undefined" &&
    (localStorage.getItem("smn_founder_device") === "1" ||
      document.cookie.includes("smn_founder_device=1"));

  const telemetry = metrics.visitorTelemetry;
  const funnelLeaks = telemetry?.funnelLeaks || [];
  const acquisitionSources = telemetry?.acquisitionSources || [];
  const deviceBreakdown = telemetry?.deviceBreakdown || {
    mobile: 0,
    desktop: 0,
    tablet: 0,
    mobilePercent: 0,
    desktopPercent: 0,
    tabletPercent: 0,
  };
  const topLocations = telemetry?.topLocations || [];
  const recentSessions = telemetry?.recentSessions || [];
  const highIntentAbandoners = metrics.highIntentAbandoners || [];
  const botVisitors = telemetry?.botVisitors || 0;
  const humanVisitors = telemetry?.humanVisitors !== undefined ? telemetry.humanVisitors : (metrics.funnel?.totalSessions || 1);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSessions = recentSessions.filter((s) => {
    if (!sessionSearch) return true;
    const q = sessionSearch.toLowerCase();
    return (
      s.source.toLowerCase().includes(q) ||
      s.medium.toLowerCase().includes(q) ||
      (s.campaign && s.campaign.toLowerCase().includes(q)) ||
      (s.city && s.city.toLowerCase().includes(q)) ||
      (s.googleClientId && s.googleClientId.toLowerCase().includes(q)) ||
      s.highestStepName.toLowerCase().includes(q)
    );
  });

  const totalSessions = metrics.funnel?.totalSessions || 1;
  const paidCount = metrics.funnel?.paid || 0;
  const overallConversion = ((paidCount / totalSessions) * 100).toFixed(1);

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-stone-200 shadow-sm space-y-6 sm:space-y-8 w-full min-w-0 overflow-hidden">
      {/* 0. STICKY TOP FILTER CONTROL BAR */}
      <div className="sticky top-0 z-30 bg-stone-900 text-stone-100 rounded-2xl p-3.5 sm:p-5 shadow-lg border border-stone-800 space-y-3.5">
        {/* Row 1: Date Range & Founder Device Management */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              Window:
            </span>
            {[
              { id: "oct13", label: "Since UX Overhaul (Oct 13+)" },
              { id: "today", label: "Today" },
              { id: "last7", label: "Last 7 Days" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => onDateRangeChange?.(btn.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  filterDateRange === btn.id
                    ? "bg-amber-500 text-stone-950 shadow-xs font-bold"
                    : "bg-stone-800/90 text-stone-300 hover:bg-stone-700 hover:text-white"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            <button
              type="button"
              onClick={() => onExcludeFounderChange?.(!excludeFounder)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition border cursor-pointer ${
                excludeFounder
                  ? "bg-emerald-950/80 text-emerald-300 border-emerald-600/70"
                  : "bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200"
              }`}
              title="Exclude founder browser test checkouts and developer sessions"
            >
              <span className={`w-2 h-2 rounded-full ${excludeFounder ? "bg-emerald-400" : "bg-stone-500"}`} />
              <span>{excludeFounder ? "✓ Exclude Founder & Test Sessions" : "Include Founder & Test Sessions"}</span>
            </button>

            <button
              type="button"
              onClick={onMarkFounderDevice}
              disabled={isMarkingFounder}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition border cursor-pointer ${
                isFounderDeviceSaved || founderMarkedSuccess
                  ? "bg-stone-800 text-emerald-300 border-emerald-500/50"
                  : "bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700 hover:text-white"
              }`}
              title="Tag this browser as founder device so test checkouts and sessions are cleanly excluded"
            >
              {isMarkingFounder ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : isFounderDeviceSaved || founderMarkedSuccess ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Laptop className="w-3.5 h-3.5 text-stone-400" />
              )}
              <span>{isFounderDeviceSaved || founderMarkedSuccess ? "Founder Device Marked" : "Mark My Current Browser as Founder Device"}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {filterDateRange === "custom" && (
          <div className="flex items-center gap-2 pt-2 border-t border-stone-800 text-xs">
            <span className="text-stone-400">From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomDateChange?.(e.target.value, customTo)}
              className="px-2 py-1 rounded bg-stone-800 text-white border border-stone-700 text-xs"
            />
            <span className="text-stone-400">To:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomDateChange?.(customFrom, e.target.value)}
              className="px-2 py-1 rounded bg-stone-800 text-white border border-stone-700 text-xs"
            />
          </div>
        )}

        {/* Row 2: Channel Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-800/80">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            Channel:
          </span>
          {[
            { id: "all", label: "All Traffic" },
            { id: "paid", label: "Paid Only (Google + Meta)" },
            { id: "google_cpc", label: "Google CPC" },
            { id: "meta_paid", label: "Meta Paid" },
            { id: "organic_direct", label: "Organic / Direct" },
          ].map((chan) => (
            <button
              key={chan.id}
              type="button"
              onClick={() => onChannelChange?.(chan.id)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                filterChannel === chan.id
                  ? "bg-indigo-500 text-white shadow-xs font-bold"
                  : "bg-stone-800/70 text-stone-400 hover:bg-stone-700 hover:text-stone-200"
              }`}
            >
              {chan.label}
            </button>
          ))}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="ml-auto text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 transition cursor-pointer"
              title="Refresh Telemetry Metrics"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Header & Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Conversion Waterfall &amp; Real Visitor Telemetry</span>
            </h2>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Telemetry
            </span>
            {botVisitors > 0 && (
              <span
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                title={`${botVisitors} automated search engine crawlers or indexer bots identified`}
              >
                <Bot className="w-3 h-3 text-amber-600" />
                <span>{botVisitors} Bot{botVisitors === 1 ? "" : "s"} Filtered</span>
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Monotonically validated 7-stage conversion progression with single-glance founder exclusion.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-stone-400 uppercase font-semibold tracking-wider block">
              Conversion Rate
            </span>
            <span className="font-serif text-lg font-bold text-stone-900">{overallConversion}%</span>
          </div>
          <div className="h-8 w-px bg-stone-200" />
          <div className="text-right">
            <span className="text-[11px] text-stone-400 uppercase font-semibold tracking-wider block">
              Active Ingested
            </span>
            <span className="font-serif text-lg font-bold text-stone-900">{totalSessions} Visits</span>
          </div>
        </div>
      </div>

      {/* 2. Micro-Funnel Waterfall Leak Detector (7 Stages) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-stone-400" />
            7-Stage Drop-Off Waterfall (Strict Cohort Math)
          </h3>
          <span className="text-[11px] text-stone-400">
            Leak % indicates visitors who abandoned before advancing to next step
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
          {funnelLeaks.map((step, idx) => {
            const isLast = idx === funnelLeaks.length - 1;
            const hasHighLeak = step.leakToNext >= 40 && !isLast;
            const stepLabel = step.stepName.split(".")[0];
            const title = step.stepName.replace(/^\d+[A-Za-z]?\.\s*/, "");

            return (
              <div
                key={idx}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  isLast
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                    : hasHighLeak
                    ? "bg-amber-50/40 border-amber-200/80 text-stone-800"
                    : "bg-stone-50/60 border-stone-200 text-stone-800"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    <span>Step {stepLabel}</span>
                    {idx > 0 && (
                      <span className="text-stone-500 font-mono font-medium">
                        {step.conversionFromPrior}% retained
                      </span>
                    )}
                  </div>
                  <span className="block font-semibold text-xs text-stone-800 mt-0.5 truncate" title={title}>
                    {title}
                  </span>
                  <div className="font-serif text-2xl font-bold my-1 text-stone-900">
                    {step.visitors}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200/50 mt-2">
                  {isLast ? (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Converted Orders</span>
                    </div>
                  ) : (
                    <div
                      className={`text-[11px] font-medium flex items-center justify-between ${
                        hasHighLeak ? "text-amber-800 font-semibold" : "text-stone-500"
                      }`}
                    >
                      <span>Drop-off leak:</span>
                      <span className="font-mono">{step.leakToNext}%</span>
                    </div>
                  )}

                  {!isLast && hasHighLeak && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>High drop-off leak</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2.5 HIGH-INTENT ABANDONERS LIVE INSPECTOR TABLE */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                High-Intent Abandoners (Reached Note or Address)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                {highIntentAbandoners.length} Sessions
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Last 25 visitors who wrote a note or reached the address form but abandoned before payment completion.
            </p>
          </div>
        </div>

        {highIntentAbandoners.length === 0 ? (
          <div className="text-center py-8 bg-stone-50/50 rounded-2xl border border-stone-200/80">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5 opacity-80" />
            <p className="text-xs font-semibold text-stone-700">No High-Intent Abandoners Detected</p>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Zero visitors who reached Step 3 (Note Typed) or Step 4A (Address Form) abandoned under the current filter window.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50/90 border-b border-stone-200 text-stone-500 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Time Ago</th>
                  <th className="py-2.5 px-3">Source / Campaign (UTM)</th>
                  <th className="py-2.5 px-3">Device / Browser</th>
                  <th className="py-2.5 px-3">Landing Path</th>
                  <th className="py-2.5 px-3">Furthest Step Reached</th>
                  <th className="py-2.5 px-3">Note Length</th>
                  <th className="py-2.5 px-3">Validation Error Hit</th>
                  <th className="py-2.5 px-3 text-right">Session ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {highIntentAbandoners.map((session, idx) => {
                  const timeAgo = formatTimeAgo(session.lastSeenAt);

                  return (
                    <tr key={idx} className="hover:bg-amber-50/20 transition-colors">
                      {/* Time Ago */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono text-stone-700 font-medium">{timeAgo}</span>
                      </td>

                      {/* Source / Campaign */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-stone-900">{session.source}</span>
                          <span className="text-stone-400">/ {session.medium}</span>
                          {session.gclid && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                              gclid
                            </span>
                          )}
                          {session.fbclid && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                              fbclid
                            </span>
                          )}
                        </div>
                        {session.campaign && (
                          <span className="text-[10px] text-stone-500 block truncate max-w-[150px]">
                            {session.campaign}
                          </span>
                        )}
                      </td>

                      {/* Device / Browser */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 text-stone-700 capitalize">
                          {session.deviceType === "mobile" && <Smartphone className="w-3 h-3 text-stone-400 shrink-0" />}
                          {session.deviceType === "desktop" && <Monitor className="w-3 h-3 text-stone-400 shrink-0" />}
                          {session.deviceType === "tablet" && <Tablet className="w-3 h-3 text-stone-400 shrink-0" />}
                          <span>{session.deviceType}</span>
                        </div>
                        {session.inAppBrowser ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Instagram / FB Webview
                          </span>
                        ) : session.screenResolution ? (
                          <span className="text-[10px] font-mono text-stone-400 block">
                            {session.screenResolution}
                          </span>
                        ) : null}
                      </td>

                      {/* Landing Path */}
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[11px] text-stone-700 truncate max-w-[140px] block" title={session.landingPath}>
                          {session.landingPath || "/"}
                        </span>
                      </td>

                      {/* Furthest Step Reached */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-800 border border-stone-200">
                          Step {session.highestStep}: {session.highestStepName}
                        </span>
                      </td>

                      {/* Note Length */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {session.noteLength !== undefined && session.noteLength > 0 ? (
                          <span className="font-mono font-medium text-stone-800 text-[11px]">
                            {session.noteLength} chars
                          </span>
                        ) : (
                          <span className="text-stone-400 text-[11px] italic">Typed / Prompt</span>
                        )}
                      </td>

                      {/* Validation Error Hit */}
                      <td className="py-2.5 px-3">
                        {session.lastValidationError ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200 max-w-[180px] truncate" title={session.lastValidationError}>
                            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                            {session.lastValidationError}
                          </span>
                        ) : (
                          <span className="text-stone-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Session ID Copy */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleCopy(session.sessionId, session.sessionId)}
                          className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 transition cursor-pointer"
                          title="Copy Session ID"
                        >
                          {copiedId === session.sessionId ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-stone-400" />
                              <span className="truncate max-w-[70px]">{session.sessionId}</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Traffic Sources & Technology Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Sources & Campaigns */}
        <div className="bg-stone-50/50 rounded-2xl p-5 border border-stone-200/80 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-stone-500" />
              Acquisition Channels &amp; Campaigns
            </h3>
            <span className="text-[11px] text-stone-400">UTMs &amp; GCLID</span>
          </div>

          {acquisitionSources.length === 0 ? (
            <p className="text-xs text-stone-400 py-6 text-center">
              Awaiting inbound tagged traffic sessions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-stone-400 uppercase font-semibold text-[10px] border-b border-stone-200/60">
                    <th className="pb-2">Source / Medium</th>
                    <th className="pb-2 text-right">Sessions</th>
                    <th className="pb-2 text-left pl-3">Top Drop-off Step</th>
                    <th className="pb-2 text-right">Paid</th>
                    <th className="pb-2 text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/40">
                  {acquisitionSources.slice(0, 6).map((src, i) => (
                    <tr key={i} className="hover:bg-white/60 transition-colors">
                      <td className="py-2.5 font-medium text-stone-900 truncate max-w-[130px]">
                        <span className="font-semibold">{src.source}</span>
                        <span className="text-stone-400"> / {src.medium}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-stone-700">{src.sessions}</td>
                      <td className="py-2.5 pl-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200 truncate max-w-[120px]">
                          {src.topDropOffStep}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-700">
                        {src.completedOrders}
                      </td>
                      <td className="py-2.5 text-right font-mono text-stone-800">
                        {src.conversionRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Device Categories & Top Geographies */}
        <div className="bg-stone-50/50 rounded-2xl p-5 border border-stone-200/80 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-stone-500" />
              Device Category &amp; Metro Geographies
            </h3>
            <span className="text-[11px] text-stone-400">Edge Headers</span>
          </div>

          {/* Device Split Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-stone-700">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-stone-500" />
                Mobile ({deviceBreakdown.mobilePercent}%)
              </span>
              <span className="flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-stone-500" />
                Desktop ({deviceBreakdown.desktopPercent}%)
              </span>
              <span className="flex items-center gap-1.5">
                <Tablet className="w-3.5 h-3.5 text-stone-500" />
                Tablet ({deviceBreakdown.tabletPercent}%)
              </span>
            </div>

            <div className="w-full h-2.5 bg-stone-200/70 rounded-full flex overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-500"
                style={{ width: `${deviceBreakdown.mobilePercent}%` }}
                title={`Mobile: ${deviceBreakdown.mobilePercent}%`}
              />
              <div
                className="bg-indigo-600 h-full transition-all duration-500"
                style={{ width: `${deviceBreakdown.desktopPercent}%` }}
                title={`Desktop: ${deviceBreakdown.desktopPercent}%`}
              />
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${deviceBreakdown.tabletPercent}%` }}
                title={`Tablet: ${deviceBreakdown.tabletPercent}%`}
              />
            </div>
          </div>

          {/* Top Geographies */}
          <div className="pt-2 border-t border-stone-200/60">
            <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block mb-2">
              Top Metro Locations
            </span>
            {topLocations.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-2">
                Ingesting edge location headers...
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topLocations.slice(0, 8).map((loc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white text-stone-700 border border-stone-200 shadow-2xs"
                  >
                    <MapPin className="w-3 h-3 text-stone-400" />
                    {loc.city}
                    {loc.region && <span className="text-stone-400">, {loc.region}</span>}
                    <span className="ml-1 text-[10px] font-mono text-stone-400 bg-stone-100 px-1.5 rounded-full">
                      {loc.count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Live Visitor Session Stream */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-stone-500" />
              Live Visitor Session Stream
            </h3>
            <p className="text-[11px] text-stone-400">
              Recent visitor journeys with acquisition source, device, city, and GA Client ID.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search source, city, or _ga ID..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-800"
            />
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <p className="text-xs text-stone-400 py-8 text-center bg-stone-50/50 rounded-2xl border border-stone-200">
            {recentSessions.length === 0
              ? "No visitor telemetry events recorded yet. Browse the site to see real-time sessions appear."
              : "No visitor sessions match your search filter."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200">
            <table className="w-full text-left text-xs bg-white">
              <thead className="bg-stone-50/80 border-b border-stone-200 text-stone-400 text-[10px] uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Visitor / Source</th>
                  <th className="py-2.5 px-3">Device &amp; Geo</th>
                  <th className="py-2.5 px-3">Deepest Step</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">GA Client ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredSessions.slice(0, 15).map((session, idx) => {
                  const timeAgo = formatTimeAgo(session.lastSeenAt);

                  return (
                    <tr key={idx} className="hover:bg-stone-50/50 transition-colors">
                      {/* Visitor / Source */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-stone-900">{session.source}</span>
                          <span className="text-stone-400">/ {session.medium}</span>
                          {session.isBot && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-0.5">
                              <Bot className="w-2.5 h-2.5 text-amber-600" />
                              Bot
                            </span>
                          )}
                          {session.gclid && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                              gclid
                            </span>
                          )}
                        </div>
                        {session.campaign && (
                          <span className="text-[10px] text-stone-500 block truncate max-w-[160px]">
                            camp: {session.campaign}
                          </span>
                        )}
                        <span className="text-[10px] text-stone-400 block">{timeAgo}</span>
                      </td>

                      {/* Device & Geo */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 text-stone-700 capitalize">
                          {session.deviceType === "mobile" && <Smartphone className="w-3 h-3 text-stone-400" />}
                          {session.deviceType === "desktop" && <Monitor className="w-3 h-3 text-stone-400" />}
                          {session.deviceType === "tablet" && <Tablet className="w-3 h-3 text-stone-400" />}
                          <span>{session.deviceType}</span>
                          {session.screenResolution && (
                            <span className="text-[10px] font-mono text-stone-400">
                              ({session.screenResolution})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                          <span className="truncate max-w-[140px]">
                            {session.city ? `${session.city}${session.region ? ", " + session.region : ""}` : "US Metro"}
                          </span>
                        </div>
                      </td>

                      {/* Deepest Step */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-200">
                          Step {session.highestStep}: {session.highestStepName}
                        </span>
                      </td>

                      {/* Outcome */}
                      <td className="py-3 px-3">
                        {session.completed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Paid ($9.00)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-50 text-stone-600 border border-stone-200">
                            Dropped: {session.dropOffStep || session.highestStepName}
                          </span>
                        )}
                      </td>

                      {/* GA Client ID */}
                      <td className="py-3 px-3 text-right">
                        {session.googleClientId ? (
                          <button
                            type="button"
                            onClick={() => handleCopy(session.sessionId, session.googleClientId!)}
                            className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded-md bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 transition-colors"
                            title="Click to copy Google Analytics Client ID"
                          >
                            {copiedId === session.sessionId ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-stone-400" />
                                <span className="truncate max-w-[100px]">{session.googleClientId}</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-stone-300 font-mono text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
