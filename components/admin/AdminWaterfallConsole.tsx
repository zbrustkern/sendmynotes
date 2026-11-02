"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Package,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Filter,
  Send,
  Clock,
  Target,
  Smartphone,
  Monitor,
  Tablet,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Flame,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import {
  AdminWaterfallReport,
  StandardFunnelStep,
  WaterfallAudience,
  WaterfallChannel,
  WaterfallScope,
  WaterfallWindow,
  WATERFALL_CHANNELS,
  WATERFALL_WINDOWS,
} from "@/lib/contracts/admin-waterfall";

export interface AdminWaterfallConsoleProps {
  initialWindow?: WaterfallWindow;
  initialChannel?: WaterfallChannel;
  initialAudience?: WaterfallAudience;
  onScopeChange?: (scope: WaterfallScope) => void;
  className?: string;
}

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Not logged";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "Unknown";
  return `${rate.toFixed(1)}%`;
}

function formatObservedCount(value: number | undefined, status: "complete" | "partial" | "unavailable" | undefined): string {
  if (value === undefined || status === "unavailable") return "Unavailable";
  return status === "partial" ? `≥${value.toLocaleString("en-US")}` : value.toLocaleString("en-US");
}

function formatObservedMoney(value: number | undefined, status: "complete" | "partial" | "unavailable" | undefined): string {
  if (value === undefined || status === "unavailable") return "Unavailable";
  const money = formatCents(value);
  return status === "partial" ? `≥ ${money}` : money;
}

function formatAsOfChicago(asOfIso?: string): string {
  if (!asOfIso) return "";
  try {
    const d = new Date(asOfIso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " CT";
  } catch {
    return asOfIso;
  }
}

const WINDOW_LABELS: Record<WaterfallWindow, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  since_oct13: "Since Oct 13",
  all: "All Time",
  custom: "Custom Range",
};

const CHANNEL_LABELS: Record<WaterfallChannel, string> = {
  all: "All Channels",
  meta: "Meta (Facebook / IG)",
  google: "Google Ads (CPC)",
  direct: "Direct Traffic",
  unknown: "Unknown Attribution",
  organic: "Organic Search",
  email: "Email Marketing",
  referral: "Referral / Affiliate",
};

export function AdminWaterfallConsole({
  initialWindow = "last7",
  initialChannel = "all",
  initialAudience = "customers",
  onScopeChange,
  className = "",
}: AdminWaterfallConsoleProps) {
  const [windowState, setWindowState] = useState<WaterfallWindow>(initialWindow);
  const [channelState, setChannelState] = useState<WaterfallChannel>(initialChannel);
  const [audienceState, setAudienceState] = useState<WaterfallAudience>(initialAudience);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const [report, setReport] = useState<AdminWaterfallReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWaterfallReport = useCallback(
    async (
      win = windowState,
      ch = channelState,
      aud = audienceState,
      start = customStart,
      end = customEnd
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          window: win,
          channel: ch,
          audience: aud,
        });
        if (win === "custom") {
          if (start) params.set("start", start);
          if (end) params.set("end", end);
        }

        const res = await fetch(`/api/admin/waterfall?${params.toString()}`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data: AdminWaterfallReport = await res.json();
        setReport(data);
        if (onScopeChange) {
          onScopeChange(data.scope);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load telemetry waterfall";
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [windowState, channelState, audienceState, customStart, customEnd, onScopeChange]
  );

  useEffect(() => {
    fetchWaterfallReport();
  }, [fetchWaterfallReport]);

  const handleWindowChange = (newWindow: WaterfallWindow) => {
    setWindowState(newWindow);
    if (newWindow === "custom") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      fetchWaterfallReport(newWindow, channelState, audienceState);
    }
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newChannel = e.target.value as WaterfallChannel;
    setChannelState(newChannel);
    fetchWaterfallReport(windowState, newChannel, audienceState);
  };

  const handleAudienceToggle = (newAudience: WaterfallAudience) => {
    setAudienceState(newAudience);
    fetchWaterfallReport(windowState, channelState, newAudience);
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      fetchWaterfallReport(windowState, channelState, audienceState, customStart, customEnd);
    }
  };

  const kpis = report?.kpis;
  const waterfall = report?.waterfall ?? [];
  const matrix = report?.originMatrix ?? [];
  const device = report?.deviceBreakdown;

  return (
    <div className={`space-y-6 ${className}`} data-testid="admin-waterfall-console">
      {/* =========================================================================
          GLOBAL SCOPE CONTROLS & FILTER BAR
          ========================================================================= */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Window Selector Pills */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
              Reporting Window (America/Chicago)
            </span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reporting Window Options">
              {WATERFALL_WINDOWS.map((win) => {
                const isActive = windowState === win;
                return (
                  <button
                    key={win}
                    type="button"
                    onClick={() => handleWindowChange(win)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? "bg-amber-800 text-white shadow-xs"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                    }`}
                  >
                    {WINDOW_LABELS[win]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Controls (Channel dropdown, Audience toggle, Refresh) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Channel filter dropdown */}
            <div>
              <label htmlFor="waterfall-channel-select" className="sr-only">Channel Filter</label>
              <div className="relative">
                <select
                  id="waterfall-channel-select"
                  value={channelState}
                  onChange={handleChannelChange}
                  className="appearance-none bg-stone-50 hover:bg-stone-100/80 border border-stone-200 text-stone-800 text-xs font-semibold rounded-xl pl-3 pr-8 py-2 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-800"
                >
                  {WATERFALL_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABELS[ch]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Owner QA is a diagnostic comparison only; business KPIs stay customer-only. */}
            <div className="inline-flex rounded-xl p-0.5 bg-stone-100 border border-stone-200" role="radiogroup" aria-label="Owner QA comparison">
              <button
                type="button"
                onClick={() => handleAudienceToggle("customers")}
                role="radio"
                aria-checked={audienceState === "customers"}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  audienceState === "customers"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                title="Business view excludes identified owner and staff QA"
              >
                Customer results
              </button>
              <button
                type="button"
                onClick={() => handleAudienceToggle("all_traffic")}
                role="radio"
                aria-checked={audienceState === "all_traffic"}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  audienceState === "all_traffic"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
                title="Show owner/staff QA separately without changing customer results"
              >
                Owner QA
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchWaterfallReport()}
              disabled={isLoading}
              className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
              title="Refresh Telemetry Waterfall"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-700" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Custom Date Range Sub-Bar */}
        {showCustomPicker && (
          <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-700">Custom Date Range:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-stone-50 border border-stone-200 text-xs rounded-lg px-2.5 py-1 text-stone-800"
              placeholder="YYYY-MM-DD"
            />
            <span className="text-stone-400 text-xs">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-stone-50 border border-stone-200 text-xs rounded-lg px-2.5 py-1 text-stone-800"
              placeholder="YYYY-MM-DD"
            />
            <button
              type="button"
              onClick={handleApplyCustom}
              className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              Apply Bounds
            </button>
          </div>
        )}

        {/* Metadata Status Pill Bar */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-medium text-stone-600">
              <Clock className="w-3 h-3 text-stone-400" />
              {report?.asOf ? `As of ${formatAsOfChicago(report.asOf)}` : "Evaluating..."}
            </span>
            {report?.scope && (
              <span className="text-stone-400 font-mono text-[11px]">
                [{report.scope.startDate || "all"} → {report.scope.endDate || "now"}]
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            {device && (
              <>
                <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-sans font-medium">
                  Excluded: <strong className="font-mono text-stone-900">{device.botFilteredCount}</strong> bots ·{" "}
                  <strong className="font-mono text-stone-900">{device.ownerQaSessionCount}</strong> owner QA
                </span>
                <span className="text-stone-400 hidden sm:inline">|</span>
                <span className="text-stone-500 hidden sm:inline">
                  Eligible: {device.mobile} mob · {device.desktop} desk · {device.tablet} tab
                </span>
              </>
            )}
            {report?.coverage && (
              <span className={`px-2 py-0.5 rounded-full font-sans font-semibold ${
                report.coverage.status === "complete"
                  ? "bg-emerald-50 text-emerald-800"
                  : report.coverage.status === "partial"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-rose-100 text-rose-900"
              }`}>
                {report.coverage.status === "complete" ? "Complete read" : report.coverage.status === "partial" ? "Partial read · rates hidden" : "Source unavailable"}
              </span>
            )}
          </div>
        </div>
      </div>

      {audienceState === "all_traffic" && report?.deviceBreakdown && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950" data-testid="owner-qa-comparison">
          <strong>Owner/staff QA comparison:</strong> {report.deviceBreakdown.ownerQaSessionCount} identified QA sessions are available for review. Customer orders, sessions, revenue, and rates above remain unchanged.
        </div>
      )}

      {report?.coverage && (
        <details className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs" data-testid="journey-diagnostics">
          <summary className="cursor-pointer list-none px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-stone-900">Journey & measurement diagnostics</span>
              <span className="block text-xs text-stone-500 mt-0.5">Order/session links, unknown attribution, and source coverage</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              report.coverage.unmatchedPaidOrders > 0 || report.coverage.status !== "complete" || report.coverage.degradedIdentitySessions > 0
                ? "bg-amber-100 text-amber-900"
                : "bg-emerald-50 text-emerald-800"
            }`}>
              {report.coverage.unmatchedPaidOrders > 0
                ? `${report.coverage.unmatchedPaidOrders} payment links need review`
                : report.coverage.status !== "complete" ? `${report.coverage.status} coverage`
                : report.coverage.degradedIdentitySessions > 0 ? `${report.coverage.degradedIdentitySessions} degraded identity sessions`
                : "No integrity flags"}
            </span>
          </summary>
          <div className="border-t border-stone-100 px-4 sm:px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">Unlinked paid orders</div>
                <div className="mt-1 text-lg font-semibold text-stone-900">{report.coverage.unmatchedPaidOrders}</div>
                <div className="text-xs text-stone-500">Exact order or session link; attribution mismatches keep rates unknown</div>
              </div>
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">Unknown acquisition</div>
                <div className="mt-1 text-lg font-semibold text-stone-900">{report.coverage.unknownAttributionSessions} sessions</div>
                <div className="text-xs text-stone-500">Kept separate from direct traffic</div>
              </div>
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">Latest observed event</div>
                <div className="mt-1 text-sm font-semibold text-stone-900">
                  {report.coverage.lastActivityAt ? formatAsOfChicago(report.coverage.lastActivityAt) : "No event in window"}
                </div>
                <div className="text-xs text-stone-500">Report read: {formatAsOfChicago(report.asOf)}</div>
              </div>
              <div className="rounded-xl bg-stone-50 p-3">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">Identity quality</div>
                <div className="mt-1 text-lg font-semibold text-stone-900">{report.coverage.degradedIdentitySessions} sessions degraded</div>
                <div className="text-xs text-stone-500">{report.coverage.degradedIdentityEvents} events used page-memory identity</div>
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-3 py-2 bg-[#FAF8F5] text-xs font-semibold text-stone-700">Paid order reconciliation · identifiers only</div>
              <div className="divide-y divide-stone-100">
                {report.coverage.journeyDiagnostics.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-stone-500">No verified customer orders in this window.</p>
                ) : report.coverage.journeyDiagnostics.map((item) => (
                  <div key={item.orderId} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto_auto] gap-1 sm:gap-3 px-3 py-2.5 text-xs">
                    <span className="font-mono text-stone-800 break-all">Order {item.orderId}</span>
                    <span className="font-mono text-stone-600 break-all">Session {item.sessionId || "missing"}</span>
                    <span className="font-mono text-stone-600 break-all">Journey {item.journeyId || "unobserved"}</span>
                    <span className="text-stone-600">{item.campaign} · {formatCents(item.amountCents)}</span>
                    <span className="text-stone-600">Link: {item.linkSource.replaceAll("_", " ")}</span>
                    <span className={`font-semibold ${item.degradedIdentity ? "text-amber-800" : "text-stone-500"}`}>{item.degradedIdentity === null ? "identity unknown" : item.degradedIdentity ? "identity degraded" : "identity stable"}</span>
                    <span className={`font-semibold ${item.linkStatus === "joined" ? "text-emerald-800" : "text-amber-800"}`}>{item.linkStatus.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {Object.entries(report.coverage.sources).map(([name, source]) => (
                <div key={name} className="rounded-lg bg-stone-50 px-3 py-2 text-stone-600">
                  <div className="capitalize font-semibold text-stone-800">{name}</div>
                  <div>{source.status} · {source.recordsRead}/{source.maxRecords} read</div>
                  {source.error && <div className="text-amber-800">{source.error}</div>}
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* ERROR BANNER */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-950">Waterfall Calculation Error</p>
            <p className="text-rose-800 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          TIER 1: EXECUTIVE KPI STRIP (5 CLEAN CARDS)
          ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4" data-testid="tier-1-kpi-strip">
        {/* KPI 1: Net Customer Revenue */}
        <div className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Net Revenue</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {formatObservedMoney(kpis?.netRevenueCents, report?.coverage?.sources.orders.status)}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              Gross: {formatObservedMoney(kpis?.capturedRevenueCents, report?.coverage?.sources.orders.status)}
              {kpis && kpis.refundedCents > 0 && (
                <span className="text-rose-600 ml-1">(-{formatCents(kpis.refundedCents)})</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
            Cash verified via Stripe
          </div>
        </div>

        {/* KPI 2: Paid Customer Orders */}
        <div className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Customer Orders</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {formatObservedCount(kpis?.paidCustomerOrders, report?.coverage?.sources.orders.status)}{" "}
              <span className="text-xs font-sans font-medium text-stone-500">paid</span>
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              {kpis?.excludedNonCustomerOrders ?? 0} founder/test/comp orders excluded
            </div>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
            Verified customer orders only
          </div>
        </div>

        {/* KPI 3: Conversion Rate */}
        <div className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Conversion Rate</span>
            <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {formatRate(kpis?.conversionRatePct)}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              {formatObservedCount(kpis?.paidCustomerOrders, report?.coverage?.sources.orders.status)} orders / {formatObservedCount(kpis?.uniqueSessions, report?.coverage?.sources.telemetry.status)} qualified sessions
            </div>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
            Observed entry sessions only
          </div>
        </div>

        {/* KPI 4: Fulfillment Status */}
        <div className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Fulfillment</span>
            <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {kpis?.dispatchedOrders ?? 0}{" "}
              <span className="text-xs font-sans font-medium text-stone-500">sent</span>
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              {kpis?.heldOrFailedOrders ?? 0} held or pending
            </div>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
            Handwrytten supplier queue
          </div>
        </div>

        {/* KPI 5: Recorded Ad Spend & CPA */}
        <div className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Ad Spend & CPA</span>
            <div className="w-7 h-7 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {kpis?.recordedAdSpendCents !== null && kpis?.recordedAdSpendCents !== undefined
                ? formatObservedMoney(kpis.recordedAdSpendCents, report?.coverage?.sources.adSpend.status)
                : report?.coverage?.sources.adSpend.status === "unavailable" ? "Unavailable" : "Not logged"}
            </div>
            <div className="text-xs text-stone-500 mt-0.5 truncate">
              {kpis?.cpaCents !== null && kpis?.cpaCents !== undefined
                ? `CPA: ${formatCents(kpis.cpaCents)} / order`
                : "No ad spend recorded"}
            </div>
          </div>
          <div className="text-[11px] text-stone-400 pt-2 border-t border-stone-100">
            Verified ledger only (no fake COGS)
          </div>
        </div>
      </div>

      {/* =========================================================================
          TIER 2: 6-STEP CONVERSION WATERFALL & BOT-FILTERED FUNNEL
          ========================================================================= */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4" data-testid="tier-2-waterfall">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <span>6-Step Conversion Waterfall & Funnel</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-normal">
                Observed milestones
              </span>
            </h3>
            <p className="text-xs text-stone-500">
              Each count is a distinct session with that explicit milestone. Missing earlier steps are left unknown, never filled in.
            </p>
          </div>
          <div className="text-xs text-stone-400">
            Qualified observed sessions: <strong className="text-stone-800">{formatObservedCount(kpis?.uniqueSessions, report?.coverage?.sources.telemetry.status)}</strong>
          </div>
        </div>

        {/* 6 Waterfall Step Rows */}
        <div className="space-y-3 pt-1">
          {waterfall.map((step, idx) => {
            const isLanded = idx === 0;
            const isPaid = idx === waterfall.length - 1;
            const barWidth = Math.max(2, Math.min(100, step.pctOfLanded ?? 0));

            return (
              <div
                key={step.step}
                className={`p-3.5 rounded-xl border transition ${
                  step.isBiggestDrop
                    ? "bg-rose-50/50 border-rose-200 shadow-2xs"
                    : "bg-stone-50/70 border-stone-200/80 hover:bg-stone-50"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  {/* Step Label & Event Count */}
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-stone-200/80 text-stone-800 text-xs font-bold flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-stone-900">
                        {step.label}
                      </span>
                      <span className="text-xs text-stone-400 font-mono ml-2">
                        {step.step === "6_PAID" && <span className="text-xs text-stone-500 ml-2">· {formatObservedCount(step.paidOrders, report?.coverage?.sources.orders.status)} orders</span>}
                      </span>
                    </div>
                  </div>

                  {/* Drop-off & Sessions stats */}
                  <div className="flex items-center gap-3 text-xs">
                    {step.isBiggestDrop && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        <Flame className="w-3.5 h-3.5 text-rose-600" />
                        Largest observed drop ({step.dropOffFromPrevPct}%)
                      </span>
                    )}

                    {!isLanded && step.dropOffFromPrevPct !== null && !step.isBiggestDrop && (
                      <span className="text-stone-500 font-medium">
                        -{step.dropOffFromPrevPct}% from prev
                      </span>
                    )}

                    <div className="text-right">
                      <strong className="text-sm font-bold text-stone-900 font-mono">
                        {step.step === "6_PAID"
                          ? formatObservedCount(step.sessions, report?.coverage?.sources.orders.status)
                          : formatObservedCount(step.sessions, report?.coverage?.sources.telemetry.status)}
                      </strong>{" "}
                      <span className="text-stone-500 text-xs">sessions</span>{" "}
                      <span className="text-stone-400 font-mono">({formatRate(step.pctOfLanded)})</span>
                    </div>
                  </div>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="w-full bg-stone-200/80 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isPaid
                        ? "bg-emerald-600"
                        : step.isBiggestDrop
                        ? "bg-rose-500"
                        : "bg-amber-700"
                    }`}
                    style={{ width: `${step.pctOfLanded === null ? 0 : barWidth}%` }}
                    role="progressbar"
                    aria-valuenow={step.pctOfLanded ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${step.label} conversion reach`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-xs text-stone-600">
        <summary className="cursor-pointer font-semibold text-stone-700">Raw event totals (diagnostic only)</summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {waterfall.map((step) => (
            <div key={step.step} className="rounded-lg bg-white px-3 py-2 border border-stone-100">
              <span className="text-stone-500">{step.label}</span>
              <strong className="block text-stone-800">{step.rawEvents} raw records</strong>
            </div>
          ))}
        </div>
      </details>

      {/* =========================================================================
          TIER 3: ORIGIN & ATTRIBUTION WATERFALL MATRIX
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden" data-testid="tier-3-origin-matrix">
        <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-stone-900">
              Origin & Attribution Waterfall Matrix
            </h3>
            <p className="text-xs text-stone-500">
              Step-by-step funnel volume grouped by UTM source, medium, and campaign.
            </p>
          </div>
          <div className="text-xs text-stone-500">
            {matrix.length} origin cohorts observed
          </div>
        </div>

        {/* Table with horizontal overflow handling */}
        <div className="overflow-x-auto" role="region" aria-label="Origin attribution matrix" tabIndex={0}>
          <table className="w-full text-left text-xs text-stone-700 divide-y divide-stone-100 min-w-[850px]">
            <thead className="bg-[#FAF8F5] text-stone-500 font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Source / Medium</th>
                <th className="py-2.5 px-3">Campaign</th>
                <th className="py-2.5 px-3 text-right">Sessions</th>
                <th className="py-2.5 px-3 text-right">Card</th>
                <th className="py-2.5 px-3 text-right">Note</th>
                <th className="py-2.5 px-3 text-right">Address</th>
                <th className="py-2.5 px-3 text-right">Checkout</th>
                <th className="py-2.5 px-3 text-right">Paid Orders</th>
                <th className="py-2.5 px-3 text-right">Conv %</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {matrix.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-stone-400 italic">
                    No attribution activity recorded for the selected window and channel filter.
                  </td>
                </tr>
              ) : (
                matrix.map((row) => (
                  <tr key={row.originKey} className="hover:bg-stone-50/80 transition">
                    <td className="py-2.5 px-4 font-medium text-stone-900">
                      <div>
                        {row.source} / {row.medium}
                      </div>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider">
                        {row.channel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                      {row.campaign || "none"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                      {row.sessions}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                      {row.itemSelect}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                      {row.compose}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                      {row.address}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                      {row.checkout}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900">
                      {row.paidOrders}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-800">
                      {formatRate(row.conversionRatePct)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-950">
                      {formatCents(row.capturedRevenueCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
