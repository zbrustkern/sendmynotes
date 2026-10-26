"use client";

import { useState } from "react";
import { AdminMetrics } from "@/lib/types";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";

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
  onUnflagFounderSessions?: () => void;
  isUnflaggingFounder?: boolean;
  unflagFounderSuccess?: string | null;
}

export function VisitorTelemetryDashboard({ metrics, excludeFounder = true, onExcludeFounderChange, onRefresh, isMarkingFounder = false, onMarkFounderDevice, founderMarkedSuccess = false }: VisitorTelemetryDashboardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (!metrics) return null;
  const telemetry = metrics.visitorTelemetry;
  const sessions = telemetry?.recentSessions ?? [];
  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return <section aria-labelledby="visitor-observations-heading" className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 id="visitor-observations-heading" className="text-base font-bold text-stone-900">Visitor observations and founder controls</h2><p className="mt-1 text-sm text-stone-600">Legacy telemetry is a bounded observation sample. These events do not establish unique visitors, step completion, purchases, conversion, or abandonment.</p></div>
      <button type="button" onClick={onRefresh} className="min-h-10 rounded-xl border border-stone-300 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">Refresh legacy observations</button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <p className="rounded-xl bg-stone-50 p-3 text-sm">Human session records in current legacy response: <strong>{telemetry?.humanVisitors ?? "Unavailable"}</strong></p>
      <p className="rounded-xl bg-stone-50 p-3 text-sm">Bot-labeled records: <strong>{telemetry?.botVisitors ?? "Unavailable"}</strong></p>
      <p className="rounded-xl bg-stone-50 p-3 text-sm">Recent session rows returned: <strong>{sessions.length}</strong></p>
    </div>
    <p className="text-xs text-stone-500">Sample counts can be capped, repeated, or incomplete. No rates are calculated from this sample.</p>
    <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={() => onExcludeFounderChange?.(!excludeFounder)} aria-pressed={excludeFounder} className="min-h-10 rounded-xl border border-stone-300 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">{excludeFounder ? "Founder exclusion enabled in legacy filters" : "Founder exclusion disabled in legacy filters"}</button>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={isMarkingFounder} onClick={onMarkFounderDevice} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-900 px-3 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60">{isMarkingFounder ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin"/> : <ShieldCheck aria-hidden="true" className="h-4 w-4"/>}{founderMarkedSuccess ? "This device is marked founder" : "Mark this device as founder"}</button>
      </div>
    </div>
    {sessions.length > 0 && <div className="overflow-x-auto rounded-xl border border-stone-200"><table className="w-full min-w-[42rem] text-left text-sm"><caption className="p-3 text-left text-xs text-stone-600">Recent sessions returned by the legacy telemetry summary</caption><thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-3 py-2">Session</th><th className="px-3 py-2">Recorded source</th><th className="px-3 py-2">Last recorded step</th><th className="px-3 py-2">Founder / bot labels</th></tr></thead><tbody className="divide-y divide-stone-100">{sessions.slice(0, 50).map((session) => <tr key={session.sessionId}><th scope="row" className="px-3 py-3 font-mono text-xs">{session.sessionId}<button type="button" onClick={() => void copy(session.sessionId, session.sessionId)} aria-label={`Copy session ID ${session.sessionId}`} className="ml-2 inline-flex min-h-8 min-w-8 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">{copiedId === session.sessionId ? <Check aria-hidden="true" className="h-4 w-4"/> : <Copy aria-hidden="true" className="h-4 w-4"/>}</button></th><td className="px-3 py-3">{session.source || "Unknown"}{session.medium ? ` / ${session.medium}` : ""}</td><td className="px-3 py-3">{session.highestStepName || "Unknown"}<span className="ml-1 text-xs text-stone-500">(observed label)</span></td><td className="px-3 py-3">{session.isFounder ? "Founder-labeled" : "No founder label"}{session.isBot ? " · Bot-labeled" : ""}</td></tr>)}</tbody></table></div>}
  </section>;
}
