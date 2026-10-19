"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Users,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Globe,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { AdminGlobalScope } from "@/lib/admin-scope";
import type { InvestigationJourneySummary } from "@/lib/investigation-service";
import { OrderJourneyDrawer } from "./OrderJourneyDrawer";

export interface JourneysInvestigationWorkspaceProps {
  scope: AdminGlobalScope;
  onScopeChange: (newScope: AdminGlobalScope) => void;
  onInspectProof?: (orderId: string) => void;
}

export function JourneysInvestigationWorkspace({
  scope,
  onScopeChange,
  onInspectProof,
}: JourneysInvestigationWorkspaceProps) {
  const [journeys, setJourneys] = useState<InvestigationJourneySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  // Scoped Aggregate Totals
  const [scopedTotalJourneys, setScopedTotalJourneys] = useState(0);
  const [scopedConvertedJourneys, setScopedConvertedJourneys] = useState(0);
  const [scopedConversionRate, setScopedConversionRate] = useState(0);
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);

  const fetchJourneys = useCallback(async (currentCursor?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("domain", "journeys");
      params.set("datePreset", scope.datePreset || scope.window || "since_oct13");
      params.set("timezone", scope.timezone);
      params.set("environment", scope.environment);
      if (scope.customFrom || scope.from) params.set("from", scope.customFrom || scope.from!);
      if (scope.customTo || scope.to) params.set("to", scope.customTo || scope.to!);
      params.set("mode", scope.mode);
      if (scope.drilldownMetric) params.set("drilldownMetric", scope.drilldownMetric);
      if (scope.drilldownStage) params.set("drilldownStage", scope.drilldownStage);
      if (scope.channel && scope.channel !== "all") params.set("channel", scope.channel);
      if (scope.device && scope.device !== "all") params.set("device", scope.device);
      if (scope.inAppBrowserOnly) params.set("inApp", "true");
      if (search) params.set("search", search);
      if (currentCursor) params.set("cursor", currentCursor);
      params.set("limit", "25");

      const res = await fetch(`/api/admin/investigations?${params.toString()}`);
      if (!res.ok) { const failure = await res.json().catch(() => ({})); throw new Error(failure.error || "Evidence source unavailable"); }
      if (res.ok) {
        const data = await res.json();
        setJourneys(data.journeys || []);
        setScopedTotalJourneys(data.scopedTotalJourneys || 0);
        setScopedConvertedJourneys(data.scopedConvertedJourneys || 0);
        setScopedConversionRate(data.scopedConversionRate || 0);
        setTotalMatchingCount(data.totalMatchingCount || 0);
        setHasMore(data.hasMore || false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Evidence source unavailable");
      console.error("Failed to load journeys evidence:", err);
    } finally {
      setLoading(false);
    }
  }, [scope, search]);

  useEffect(() => {
    fetchJourneys(cursor);
  }, [fetchJourneys, cursor]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setCursorHistory([]);
    fetchJourneys(undefined);
  };

  const handleNextPage = () => {
    if (journeys.length > 0) {
      const lastId = journeys[journeys.length - 1].journeyId;
      setCursorHistory((prev) => [...prev, cursor || ""]);
      setCursor(lastId);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, prev.length - 1));
      setCursor(prevCursor || undefined);
    }
  };

  return (
    <div className="space-y-6">
      {loadError && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Evidence unavailable or stale: {loadError}</p>}
      {/* 1. SCOPED JOURNEY AGGREGATE METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Scoped Total Journeys
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            {scopedTotalJourneys}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Converted Paid Journeys
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            {scopedConvertedJourneys}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Observed Conversion Rate
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-emerald-950">
            {scopedConversionRate}%
          </span>
        </div>
      </div>

      {/* 2. SEARCH TOOLBAR */}
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Journey ID, session ID, channel, campaign..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition cursor-pointer shrink-0"
          >
            Search
          </button>
        </form>

        <button
          type="button"
          onClick={() => fetchJourneys(cursor)}
          disabled={loading}
          className="p-2 border border-stone-200 hover:bg-stone-100 rounded-xl transition text-stone-600 cursor-pointer disabled:opacity-60"
          title="Refresh Journeys"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
        </button>
      </div>

      {/* 3. JOURNEYS TABLE */}
      <div
        className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
        role="region"
        aria-label="Visitor journeys investigation dataset"
        tabIndex={0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200/80 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                <th className="py-3 px-4">Journey / Session ID</th>
                <th className="py-3 px-3">First Seen</th>
                <th className="py-3 px-3">Channel &amp; Campaign</th>
                <th className="py-3 px-3">Device</th>
                <th className="py-3 px-3">Completed Stage</th>
                <th className="py-3 px-3">Identity Status</th>
                <th className="py-3 px-3">Multi-Session</th>
                <th className="py-3 px-4 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading && journeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 italic">
                    Loading scoped visitor journeys...
                  </td>
                </tr>
              ) : journeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 italic">
                    No matching journeys found in current scope.
                  </td>
                </tr>
              ) : (
                journeys.map((j) => {
                  const isSelected = selectedJourneyId === j.journeyId;
                  return (
                    <React.Fragment key={j.journeyId}>
                      <tr
                        onClick={() => setSelectedJourneyId(isSelected ? null : j.journeyId)}
                        className={`hover:bg-amber-50/40 transition cursor-pointer ${
                          isSelected ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-stone-900">
                          <span className="truncate max-w-[160px] block" title={j.journeyId}>
                            {j.journeyId.slice(0, 16)}...
                          </span>
                          <span className="text-[10px] text-stone-400 font-normal">
                            Session: {j.sessionId.slice(0, 10)}...
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono text-stone-600">
                          {new Date(j.firstSeenAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="py-3 px-3 text-stone-700">
                          <p className="font-semibold text-stone-900">{j.channel}</p>
                          <p className="text-[10px] text-stone-400 truncate max-w-[140px]">
                            {j.campaign || "Direct"}
                          </p>
                        </td>

                        <td className="py-3 px-3 text-stone-600 capitalize">
                          {j.deviceCategory}
                        </td>

                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-800 capitalize">
                            {j.completedStage.replace(/_/g, " ")}
                          </span>
                          {j.dropOffStage && (
                            <span className="text-[10px] text-rose-600 block mt-0.5">
                              Drop: {j.dropOffStage.replace(/_/g, " ")}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                              j.identityStatus === "verified"
                                ? "bg-emerald-100 text-emerald-900"
                                : j.identityStatus === "degraded_storage"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {j.identityStatus.replace(/_/g, " ")}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          {j.resumedSessionCount > 1 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              {j.resumedSessionCount} sessions
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[11px]">Single</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {j.isPaid ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900">
                              Paid Order
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[11px]">Abandoned</span>
                          )}
                        </td>
                      </tr>

                      {isSelected && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-stone-50">
                            <OrderJourneyDrawer
                              order={{
                                id: j.orderId || `journey_${j.journeyId}`,
                                amountInCents: j.revenueCents,
                                status: j.isPaid ? "PAYMENT_RECEIVED" : "PENDING_PAYMENT",
                                customerEmail: "",
                                frontImageUrl: "",
                                printedMessage: "",
                                handwrittenNote: "",
                                fontStyleId: "hwDavid",
                                recipientAddress: { firstName: "", lastName: "", street1: "", city: "", state: "", zip: "" },
                                returnAddress: { firstName: "", lastName: "", street1: "", city: "", state: "", zip: "" },
                                sessionId: j.sessionId,
                              } as any}
                              onInspectProof={onInspectProof}
                              onClose={() => setSelectedJourneyId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-stone-50 border-t border-stone-200/80 p-3 flex items-center justify-between text-xs text-stone-600">
          <span>
            Showing <strong className="text-stone-900">{journeys.length}</strong> of{" "}
            <strong className="text-stone-900">{totalMatchingCount}</strong> matching journeys
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!hasMore}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
