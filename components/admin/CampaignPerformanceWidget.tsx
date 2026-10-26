"use client";

import type { AdminMeasurementReport } from "@/lib/contracts/admin-measurement-report";

interface CampaignPerformanceWidgetProps {
  report: AdminMeasurementReport | null;
}

const money = (cents: number | null) => cents === null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function CampaignPerformanceWidget({ report }: CampaignPerformanceWidgetProps) {
  if (!report) return null;
  const campaigns = report.campaigns;

  return (
    <section aria-labelledby="campaign-report-heading" className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4">
        <h3 id="campaign-report-heading" className="font-semibold text-stone-900">Recorded campaign attribution</h3>
        <p className="mt-1 text-sm text-stone-600">Orders and captured amounts are grouped by campaign recorded on the order. This does not confirm Google Ads attribution.</p>
      </div>
      {campaigns.length === 0 ? (
        report.sources?.orders?.status === "unavailable" || report.sources?.telemetry?.status === "unavailable" || !report.sources?.orders || !report.sources?.telemetry ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Campaign records unavailable for part or all of this scope. Orders source: {report.sources?.orders?.status ?? "unavailable"}; observed telemetry source: {report.sources?.telemetry?.status ?? "unavailable"}.</p>
        ) : report.sources.orders.status === "partial" || report.sources.telemetry.status === "partial" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">No campaign records observed in the loaded sample. Campaign coverage is partial; see source coverage above.</p>
        ) : (
          <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No campaign records recorded in this scope.</p>
        )
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {campaigns.map((row) => <article key={row.key} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <h4 className="break-words font-semibold text-stone-900">{row.label}</h4>
              <p className="mt-1 break-words text-xs text-stone-600">{[row.source, row.medium, row.campaign].filter(Boolean).join(" / ") || row.channel}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-stone-600">Observed session records{report.activity?.sampled ? " (sample)" : ""}</dt><dd className="font-semibold tabular-nums">{row.observedSessions ?? "Unavailable"}</dd></div>
                <div><dt className="text-xs text-stone-600">Verified customer orders</dt><dd className="font-semibold tabular-nums">{row.orders ?? "Unavailable"}</dd></div>
                <div><dt className="text-xs text-stone-600">Captured customer revenue</dt><dd className="font-semibold tabular-nums">{money(row.capturedCents)}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-stone-600">Observed events{report.activity?.sampled ? " (sample)" : ""}</dt><dd className="break-words text-xs">{row.eventCounts ? Object.entries(row.eventCounts).map(([name,count]) => `${name}: ${count}`).join(" · ") || "None" : "Unavailable"}</dd></div>
              </dl>
            </article>)}
          </div>
        <div className="hidden overflow-x-auto rounded-xl border border-stone-200 sm:block">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2.5">Recorded source / campaign</th><th className="px-3 py-2.5 text-right">Observed session records{report.activity?.sampled ? " (sample)" : ""}</th><th className="px-3 py-2.5 text-right">Observed events{report.activity?.sampled ? " (sample)" : ""}</th><th className="px-3 py-2.5 text-right">Verified customer orders</th><th className="px-3 py-2.5 text-right">Captured customer revenue</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {campaigns.map((row) => <tr key={row.key}>
                <th scope="row" className="max-w-[18rem] break-words px-3 py-3 font-medium text-stone-800">{row.label}<span className="block text-xs font-normal text-stone-500">{[row.source, row.medium, row.campaign].filter(Boolean).join(" / ") || row.channel}</span></th>
                <td className="px-3 py-3 text-right tabular-nums">{row.observedSessions ?? "Unavailable"}</td>
                <td className="max-w-[15rem] break-words px-3 py-3 text-right text-xs">{row.eventCounts ? Object.entries(row.eventCounts).map(([name,count]) => `${name}: ${count}`).join(" · ") || "None" : "Unavailable"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.orders === null ? "Unavailable" : row.orders}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(row.capturedCents)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}
