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
} from "lucide-react";
import { AdminMetrics, VisitorSessionRecord } from "@/lib/types";

interface VisitorTelemetryDashboardProps {
  metrics: AdminMetrics | null;
}

export function VisitorTelemetryDashboard({ metrics }: VisitorTelemetryDashboardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");

  if (!metrics) return null;

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
      {/* 1. Header & Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Traffic Acquisition &amp; Micro-Funnel Drop-Offs</span>
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
            Pinpoints visitor origin, Google Analytics Client IDs, device specs, and exact drop-off steps.
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

      {/* 2. Micro-Funnel Waterfall Leak Detector */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-stone-400" />
            Step-by-Step Drop-Off Waterfall
          </h3>
          <span className="text-[11px] text-stone-400">
            Leak % indicates visitors who abandoned before advancing to next step
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {funnelLeaks.map((step, idx) => {
            const isLast = idx === funnelLeaks.length - 1;
            const hasHighLeak = step.leakToNext >= 40 && !isLast;

            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  isLast
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                    : hasHighLeak
                    ? "bg-amber-50/40 border-amber-200/80 text-stone-800"
                    : "bg-stone-50/60 border-stone-200 text-stone-800"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    <span>Step {step.stepNumber}</span>
                    {step.stepNumber > 1 && (
                      <span className="text-stone-500 font-mono font-medium">
                        {step.conversionFromPrior}% retained
                      </span>
                    )}
                  </div>
                  <span className="block font-semibold text-xs text-stone-800 mt-0.5 truncate">
                    {step.stepName.replace(/^\d+\.\s*/, "")}
                  </span>
                  <div className="font-serif text-2xl font-bold my-1 text-stone-900">
                    {step.visitors}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200/50 mt-2">
                  {isLast ? (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
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
