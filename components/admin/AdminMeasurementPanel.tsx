"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AdminMeasurementReport, ReportChannel, ReportPeriod, ReportRecordMode } from "@/lib/contracts/admin-measurement-report";
import { CampaignPerformanceWidget } from "@/components/admin/CampaignPerformanceWidget";

interface AdminMeasurementPanelProps {
  filterDateRange?: string;
  onDateRangeChange?: (range: string) => void;
  filterChannel?: string;
  onChannelChange?: (channel: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomDateChange?: (from: string, to: string) => void;
  records?: ReportRecordMode;
  onRecordsChange?: (records: ReportRecordMode) => void;
  onInspectOrder?: (orderId: string) => void;
}

const periods: Record<string, ReportPeriod> = { today: "today", last7: "last7", oct13: "since_oct13", since_oct13: "since_oct13", all: "all", custom: "custom" };
const channels: Record<string, ReportChannel> = { all: "all", google: "google_paid", google_cpc: "google_paid", google_paid: "google_paid", email: "email", organic: "organic", meta: "social_meta", social_meta: "social_meta", referral: "referral", direct: "direct", unknown: "unknown" };
const scopeLabel = (report: AdminMeasurementReport) => {
  const range = report.scope.period === "all" ? `All available (${report.sources?.orders?.count ?? "unknown"} order records covered)` : `${report.scope.startDate ?? "?"} to ${report.scope.endDate ?? "?"}`;
  const channel = report.scope.channel === "all" ? "all channels" : report.scope.channel.replaceAll("_", " ");
  return `${range} · ${channel} · ${report.scope.records === "customers" ? "customer reporting" : "all operational records"}`;
};
const money = (cents: number | null) => cents === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const isReportPayload = (value: unknown): value is AdminMeasurementReport => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AdminMeasurementReport>;
  return typeof candidate.asOf === "string" && typeof candidate.scopeKey === "string" && !!candidate.scope && !!candidate.totals && !!candidate.sources && ["complete", "partial", "unavailable"].includes(String(candidate.status));
};

export function AdminMeasurementPanel({ filterDateRange: controlledDateRange, onDateRangeChange, filterChannel: controlledChannel, onChannelChange, customFrom: controlledCustomFrom, customTo: controlledCustomTo, onCustomDateChange, records: controlledRecords, onRecordsChange, onInspectOrder }: AdminMeasurementPanelProps) {
  const [localDateRange, setLocalDateRange] = useState("oct13");
  const [localChannel, setLocalChannel] = useState("all");
  const [localCustomFrom, setLocalCustomFrom] = useState("");
  const [localCustomTo, setLocalCustomTo] = useState("");
  const [localRecords, setLocalRecords] = useState<ReportRecordMode>("customers");
  const filterDateRange = controlledDateRange ?? localDateRange;
  const filterChannel = controlledChannel ?? localChannel;
  const customFrom = controlledCustomFrom ?? localCustomFrom;
  const customTo = controlledCustomTo ?? localCustomTo;
  const records = controlledRecords ?? localRecords;
  const period = periods[filterDateRange] ?? "since_oct13";
  const channel = channels[filterChannel] ?? "all";
  const query = useMemo(() => {
    const params = new URLSearchParams({ period, channel, records });
    if (period === "custom" && customFrom && customTo) {
      params.set("start", customFrom);
      params.set("end", customTo);
    }
    return params.toString();
  }, [period, channel, records, customFrom, customTo]);
  const [report, setReport] = useState<AdminMeasurementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isCurrent = !!report && report.scope.period === period && report.scope.channel === channel && report.scope.records === records && (period !== "custom" || (report.scope.startDate === customFrom && report.scope.endDate === customTo));

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) {
      setLoading(false);
      setFailure("Choose both dates to load a custom reporting window.");
      return;
    }
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    setLoading(true);
    setFailure(null);
    fetch(`/api/admin/measurement-report?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!isReportPayload(body)) throw new Error(response.status === 401 ? "Admin authentication is required." : `Report unavailable (HTTP ${response.status}).`);
        if (!response.ok && !(response.status === 503 && body.status === "unavailable")) throw new Error(response.status === 401 ? "Admin authentication is required." : `Report unavailable (HTTP ${response.status}).`);
        return body;
      })
      .then((next) => {
        if (!active) return;
        if (next.scope.period !== period || next.scope.channel !== channel || next.scope.records !== records || (period === "custom" && (next.scope.startDate !== customFrom || next.scope.endDate !== customTo))) throw new Error("The report response did not match the selected scope.");
        setReport(next);
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailure(error instanceof DOMException && error.name === "AbortError" ? "The report request timed out after 8 seconds." : error instanceof Error ? error.message : "The report could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(deadline); };
  }, [query, period, customFrom, customTo, channel, records, refreshKey]);

  const statusText = report?.status === "complete" ? "Complete source coverage" : report?.status === "partial" ? "Partial source coverage" : report?.status === "unavailable" ? "Report unavailable" : "Loading report";
  const stateClass = report?.status === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950";
  const total = report?.totals;
  const orderDiagnostics = report?.orderDiagnostics ?? [];

  return <section aria-labelledby="measurement-heading" className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:space-y-5 sm:rounded-3xl sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 id="measurement-heading" className="text-lg font-bold text-stone-900">{records === "customers" ? "Customer measurement report" : "Operational records report"}</h2><p className="mt-1 text-sm text-stone-600">Order-created window in America/Chicago. Captured revenue is gross and is not profit.</p></div>
      <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60"><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh report</button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Reporting date range">
      {[['today','Today'],['last7','Last 7 calendar days'],['oct13','Since Oct 13'],['all','All available'],['custom','Custom']].map(([value,label]) => <button key={value} type="button" aria-pressed={filterDateRange === value || (value === "oct13" && period === "since_oct13")} onClick={() => { setLocalDateRange(value); onDateRangeChange?.(value); }} className={`min-h-10 rounded-full border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${filterDateRange === value || (value === "oct13" && period === "since_oct13") ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800"}`}>{label}</button>)}
    </div>
    {period === "custom" && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-stone-700">Start date<input type="date" value={customFrom} onChange={(event) => { setLocalCustomFrom(event.target.value); onCustomDateChange?.(event.target.value, customTo); }} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" /></label><label className="text-sm font-medium text-stone-700">End date<input type="date" value={customTo} onChange={(event) => { setLocalCustomTo(event.target.value); onCustomDateChange?.(customFrom, event.target.value); }} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base" /></label></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-stone-700">Channel<select value={channel} onChange={(event) => { setLocalChannel(event.target.value); onChannelChange?.(event.target.value); }} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base"><option value="all">All recorded channels</option><option value="google_paid">Google paid</option><option value="email">Email</option><option value="organic">Organic</option><option value="social_meta">Meta social</option><option value="referral">Referral</option><option value="direct">Direct</option><option value="unknown">Unknown</option></select></label>
      <label className="text-sm font-medium text-stone-700">Records<select value={records} onChange={(event) => { const next = event.target.value as ReportRecordMode; setLocalRecords(next); onRecordsChange?.(next); }} className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base"><option value="customers">Customer reporting</option><option value="all">All operational records</option></select></label>
    </div>
    {loading && !report && <p role="status" className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">Loading measurement report…</p>}
    {failure && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0"/><span>{failure} Existing operational controls remain available below.</span></div>}
    {report && <>
      <div className={`rounded-xl border p-3 text-sm ${stateClass}`} role="status"><strong>{statusText}</strong>{report.dataEnvironment === "synthetic" && <strong className="ml-2 rounded bg-stone-900 px-2 py-1 text-white">Synthetic fixture data</strong>} · As of {new Date(report.asOf).toLocaleString("en-US", { timeZone: "America/Chicago" })} · {scopeLabel(report)}{(!isCurrent || loading || !!failure) && <span className="ml-1 font-semibold"> · Showing cached report for the scope and time above; it may be stale.</span>}</div>
      {failure && <p className="text-sm font-medium text-amber-900">The numbers below belong to the scope and time shown above. They are not current for the selected date, channel, or record mode.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Verified customer orders", total?.verifiedCustomerOrders], ["Captured customer revenue", total?.capturedCustomerRevenueCents === null ? null : money(total?.capturedCustomerRevenueCents ?? null)], ["Founder/test orders", total?.founderTestOrders], ["Comp orders", total?.compOrders]].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-2 break-words text-2xl font-bold tabular-nums text-stone-900">{value === null || value === undefined ? "Unavailable" : value}</p></div>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
        <p className="rounded-xl bg-white p-3">Admin comp balances: <strong>{total?.adminCompBalanceOrders ?? "Unavailable"}</strong></p><p className="rounded-xl bg-white p-3">Unresolved order records: <strong>{total?.unresolvedOrders ?? "Unavailable"}</strong></p><p className="rounded-xl bg-white p-3">Refunds: <strong>{total?.refunds?.knownOrderCount ?? "Unavailable"}</strong> known · {money(total?.refunds?.knownRefundedCents ?? null)} recorded · {total?.refunds?.unknownOrderCount ?? "Unavailable"} unknown</p><p className="rounded-xl bg-white p-3">Disputes: <strong>{total?.disputes?.knownOrderCount ?? "Unavailable"}</strong> known · {total?.disputes?.unknownOrderCount ?? "Unavailable"} unknown</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm"><p className="rounded-xl border border-stone-200 bg-white p-3">Campaign recorded: <strong>{report.attribution.campaignRecorded ?? "Unavailable"}</strong></p><p className="rounded-xl border border-stone-200 bg-white p-3">Click ID present: <strong>{report.attribution.clickIdPresent ?? "Unavailable"}</strong></p><p className="rounded-xl border border-stone-200 bg-white p-3">Google attribution: <strong>Check in Google Ads · not verified here</strong></p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm"><p className="rounded-xl border border-stone-200 bg-white p-3">Observed session records: <strong>{report.activity?.observedSessions ?? "Unavailable"}</strong>{report.activity?.sampled ? " · sampled" : ""}</p><p className="rounded-xl border border-stone-200 bg-white p-3">Observed event counts: {report.activity?.eventCounts ? Object.entries(report.activity.eventCounts).map(([name,count]) => `${name}: ${count}`).join(" · ") || "None" : "Unavailable"}. Events are observations, not completed steps or purchases.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs text-stone-700">{Object.entries(report.sources ?? {}).map(([name,source]) => <p key={name} className="rounded-xl border border-stone-200 bg-white p-3"><strong className="capitalize">{name} source:</strong> {source.status}; {source.count ?? "unknown"} records observed (cap {source.cap}){source.reason ? ` · ${source.reason.replaceAll("_", " ")}` : ""}</p>)}</div>
      <p className="text-sm text-stone-700">Tag IDs are configured: Google Ads AW-18474411963 and GA4 G-5DV25FZ7Q8. Configuration does not confirm tag health or accepted attribution. Browser Ads/GA4 queue states and timestamps remain in the existing order diagnostics; they are not summarized here.</p>
      {report.reconciliation?.status === "pending" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Founder-confirmed sale reconciliation is pending. It is separate from verified payment totals.</p>}
      <details className="rounded-xl border border-stone-200 bg-white">
        <summary className="cursor-pointer p-3 text-sm font-semibold text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">Payment and customer classification evidence ({orderDiagnostics.length} order records)</summary>
        {orderDiagnostics.length === 0 ? <p className="px-3 pb-3 text-sm text-stone-600">No order diagnostics are available for this scope.</p> : <ul className="space-y-3 p-3 pt-0">{orderDiagnostics.map((item) => {
          const classification = item.classification.replaceAll("_", " ");
          const campaign = [item.campaign.source, item.campaign.medium, item.campaign.campaign].filter(Boolean).join(" / ") || item.campaign.label;
          const paid = item.paymentEvidenceStatus === "verified_capture";
          return <li key={item.orderId} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="break-all font-mono text-xs text-stone-600">Order {item.orderId}{item.createdAt ? ` · Created ${new Date(item.createdAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} America/Chicago` : " · Creation time unavailable"}</p>
                <p className="capitalize text-stone-900">Customer classification: <strong>{classification}</strong></p>
                <p className="text-stone-700">Payment evidence: <strong>{item.paymentEvidenceStatus.replaceAll("_", " ")}</strong> · Source: <strong>{item.paymentEvidenceSource.replaceAll("_", " ")}</strong>{paid && item.amountInCents !== null ? ` · Captured ${new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency ?? "USD" }).format(item.amountInCents / 100)}` : ""}{item.verifiedAt ? ` · Snapshot verified ${new Date(item.verifiedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} America/Chicago` : ""}{item.observedAt ? ` · Reconciliation observed ${new Date(item.observedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} America/Chicago` : ""}</p>
                <p className="break-words text-stone-700">Campaign recorded: <strong>{campaign}</strong> · Click ID present: <strong>{item.clickIdPresent === null ? "Unknown" : item.clickIdPresent ? "Yes" : "No"}</strong></p>
                <p className="text-stone-700">Refund status: <strong>{item.refundStatus.replaceAll("_", " ")}</strong> · Dispute status: <strong>{item.disputeStatus.replaceAll("_", " ")}</strong></p>
              </div>
              {onInspectOrder && <button type="button" onClick={() => onInspectOrder(item.orderId)} className="min-h-10 shrink-0 rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">Open order diagnostics</button>}
            </div>
          </li>;
        })}</ul>}
      </details>
      <CampaignPerformanceWidget report={report} />
    </>}
  </section>;
}
