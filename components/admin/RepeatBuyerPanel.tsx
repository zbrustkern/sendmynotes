"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RepeatBuyerReport } from "@/lib/repeat-buyers/report";

const unavailable = "Unavailable";
const money = (v: number | null) => v === null ? unavailable : (v / 100).toLocaleString("en-US", {style: "currency", currency: "USD"});
const count = (v: number | null) => v === null ? unavailable : v.toLocaleString("en-US");
const date = (v: number | string) => new Date(v).toLocaleDateString("en-US", {timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric"});
const selectStyle = "mt-1 block rounded border border-stone-300 bg-white px-3 py-2 font-normal";

export function RepeatBuyerPanel({ staging }: { staging: boolean }) {
  const [example, setExample] = useState(false);
  const [month, setMonth] = useState("");
  const [campaign, setCampaign] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<RepeatBuyerReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    if (campaign) query.set("campaign", campaign);
    if (example) query.set("example", "1");
    setError(""); setData(null);
    fetch("/api/admin/repeat-buyers?" + query, { cache: "no-store", signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has expired." : "The report sources are unavailable.");
        const result: RepeatBuyerReport = await res.json();
        if (!controller.signal.aborted) setData(result);
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [month, campaign, example, attempt]);

  const summary = data?.summary;
  const coverage = data?.coverage;
  const observed = summary?.rows.some(r => r.gapPerBuyer !== null);
  return <main className="mx-auto min-h-screen max-w-7xl space-y-6 bg-stone-50 p-4 text-stone-900 sm:p-8">
    <Link href="/admin/measurement" className="text-sm underline">← Measurement</Link>
    <header><h1 className="text-3xl font-semibold">Repeat buyers</h1>
      <p className="mt-2 text-stone-600">How much have buyers contributed since their first paid order, and when does it cover acquisition cost?</p></header>
    {staging && <label className="block text-sm font-medium">Data source<select className={selectStyle} value={example ? "example" : "staging"} onChange={e => {
      const demo = e.target.value === "example"; setData(null); setExample(demo);
      setMonth(demo ? "2025-01" : ""); setCampaign(demo ? "winter-launch" : "");
    }}><option value="staging">Staging records</option><option value="example">Worked example · synthetic</option></select></label>}
    {error && <p role="alert">{error} <button className="underline" onClick={() => setAttempt(v => v + 1)}>Retry</button></p>}
    {!data && !error && <p role="status">Loading report…</p>}
    {data && summary && coverage && <>
      <div className="rounded-lg border bg-white p-4 text-sm">
        <strong>{data.example ? "Synthetic example" : data.environment === "staging" ? "Staging records" : "Customer records"}</strong>
        <p>Observed {date(data.asOf)} · Earliest verified capture {summary.earliest === null ? "unavailable" : date(summary.earliest)} · Chicago time</p>
        {data.example && <p>Four fabricated buyers and five purchases illustrate the calculation.</p>}
      </div>
      <section><h2 className="mb-2 text-lg font-semibold">All-history coverage</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
          ["Verified independent orders", coverage.verified], ["Orders eligible for matching", coverage.matchable],
          ["Unresolved paid orders", coverage.unresolved], ["Friends and family excluded", coverage.friendsFamily],
        ].map(([label, value]) => <div key={label} className="rounded-lg border bg-white p-3"><dt className="text-sm text-stone-600">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl>
        {!data.historyComplete && <p className="mt-2 text-sm">Coverage is incomplete. Counts show the records located so far. First-purchase metrics are unavailable.</p>}
      </section>
      {!data.example && <details className="rounded-lg border bg-white p-4"><summary className="cursor-pointer font-semibold">Coupon use and recorded source</summary>
        <p className="my-2 text-sm">All-history order counts. Coupon and Google paid columns can overlap. Source comes from the recorded attribution on each order.</p>
        <div className="overflow-x-auto"><table className="min-w-[580px] w-full text-left text-sm">
          <thead><tr>{["Order classification","Used coupon","Google paid","Both","Unknown source"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{([["independent","Verified independent"],["unresolved","Awaiting review"],["family","Friends and family"]] as const).map(([group,label]) => {
            const s = coverage.signals[group];
            return <tr key={group} className="border-t"><th scope="row" className="p-2">{label}</th>{[s.coupon,s.googlePaid,s.both,s.unknownSource].map((n,i) => <td className="p-2" key={i}>{n}</td>)}</tr>;
          })}</tbody></table></div></details>}
      <section className="space-y-3"><h2 className="text-lg font-semibold">Acquisition cohort</h2>
        <div className="flex flex-wrap gap-4"><label className="text-sm font-medium">First-purchase month<select className={selectStyle} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All months</option>{summary.months.map(m => <option key={m}>{m}</option>)}</select></label>
          <label className="text-sm font-medium">First-purchase campaign<select className={selectStyle} value={campaign} onChange={e => setCampaign(e.target.value)}>
          <option value="">All campaigns</option>{Array.from(new Set([...summary.campaigns, "unknown"])).map(c => <option key={c} value={c}>{data.campaignNames[c] ?? "Unknown"}</option>)}</select></label></div>
        <p><strong>{count(summary.buyers)}</strong> matched buyers · <strong>{count(summary.repeatBuyers)}</strong> bought again</p>
        <p className="text-sm text-stone-600">Median days to second purchase among repeat buyers ({count(summary.repeatBuyers)}): {summary.medianDaysToSecond === null ? unavailable : summary.medianDaysToSecond.toFixed(1)}. Identified same-project reorders: {count(summary.sameProjectRepeats)}.</p>
      </section>
      <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[780px] text-left text-sm">
        <caption className="p-3 text-left font-semibold">Observed value per mature buyer (USD)</caption>
        <thead className="border-y bg-stone-100"><tr>{["Buyer age","Repeat buyers","Retained orders / buyer","Net revenue / buyer","Contribution / buyer","CAC less contribution","Orders missing costs"].map(x => <th scope="col" className="p-3" key={x}>{x}</th>)}</tr></thead>
        <tbody>{summary.rows.map(r => <tr key={r.days} className="border-b"><th scope="row" className="p-3">{r.days} days</th>
          {r.mature === 0 ? <td className="p-3 text-stone-600" colSpan={6}>Not mature</td> : <>
            <td className="p-3">{r.repeats !== null && r.mature ? r.repeats + " of " + r.mature + " (" + Math.round(100 * r.repeats / r.mature) + "%)" : unavailable}</td>
            <td className="p-3">{r.ordersPerBuyer?.toFixed(2) ?? unavailable}</td><td className="p-3">{money(r.revenuePerBuyer)}</td><td className="p-3">{money(r.contributionPerBuyer)}</td>
            <td className="p-3">{money(r.gapPerBuyer)}</td><td className="p-3">{count(r.missingCosts)}</td></>}
        </tr>)}</tbody></table></div>
      <section className="rounded-lg border bg-white p-4"><h2 className="text-lg font-semibold">Acquisition cost and payback</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">{[
          ["Reviewed media spend", money(summary.mediaSpend)], ["Identified paid reacquisition", money(summary.paidReacquisition)], ["Gross spend incl. fees", money(summary.grossSpend)], ["Promotional credits", money(summary.credits)],
          ["Fully loaded CAC", money(summary.cac)], ["First observed payback", summary.paybackDay === null ? observed ? "Not reached" : unavailable : "By day " + summary.paybackDay],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        <p className="mt-2 text-sm text-stone-600">CAC needs a closed campaign month with documented spend, fees and buyer coverage. Payback uses horizons reached by the whole cohort.</p>
      </section>
      <details className="rounded-lg border bg-white p-4" open={coverage.reasons.length > 0}><summary className="cursor-pointer font-semibold">Evidence and limitations</summary>
        <p className="mt-2 text-sm">All records: {coverage.missingIdentity} unmatched orders, {coverage.openDisputes} open disputes, {coverage.unknownAdjustments} uncertain adjustments, {coverage.missingCosts} missing complete costs. Fully reversed in this report: {summary.fullyReversed}.</p>
        {coverage.reasons.map(r => <p key={r} className="mt-1 text-sm">{r}</p>)}
        <p className="mt-2 text-sm">One permitted checkout email represents one observable buyer. Refunds retain the first acquisition. Later-posted evidence can restate earlier ages using the event date. Values describe contribution observed through each age.</p>
      </details>
    </>}
  </main>;
}
