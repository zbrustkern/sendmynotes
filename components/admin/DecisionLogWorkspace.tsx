"use client";

import React, { useCallback, useEffect, useState } from "react";

type Decision = { id: string; hypothesis: string; observation: string; cohort: string; alternatives: string[]; owner: string; proposedChange: string; buildId: string; primaryMetric: string; guardrails: string[]; reviewDate: string; status: string; experimentId?: string };
type Payload = { decisions: Decision[]; exposureSummaries: Array<{ decisionId: string; renderedExposureCount: number; countsByVariant: Record<string, number>; outcomeStatus: string; liftStatus: string }>; scopeCoverage: { recordsRead: number; readCap: number; truncatedPossible: boolean }; interpretation: string };

const initial: Payload = { decisions: [], exposureSummaries: [], scopeCoverage: { recordsRead: 0, readCap: 5000, truncatedPossible: false }, interpretation: "" };

export default function DecisionLogWorkspace() {
  const [data, setData] = useState<Payload>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/decisions", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load decision log.");
    setData(body);
  }, []);
  useEffect(() => { load().catch((err) => setError(err.message)); }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const decision = {
      hypothesis: form.get("hypothesis"), observation: form.get("observation"), cohort: form.get("cohort"),
      alternatives: String(form.get("alternatives") || "").split("\n").map((v) => v.trim()).filter(Boolean),
      owner: form.get("owner"), proposedChange: form.get("proposedChange"), buildId: form.get("buildId"),
      primaryMetric: form.get("primaryMetric"), guardrails: String(form.get("guardrails") || "").split("\n").map((v) => v.trim()).filter(Boolean),
      reviewDate: form.get("reviewDate"), experimentId: form.get("experimentId") || undefined, status: "gathering_evidence",
    };
    try {
      const response = await fetch("/api/admin/decisions", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ action: "create", decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save decision.");
      formElement.reset(); setMessage("Decision saved in gathering-evidence state."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save decision."); }
    finally { setBusy(false); }
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true); setError("");
    try {
      const note = window.prompt(`Reason for changing status to ${status.replaceAll("_", " ")}:`);
      if (!note?.trim()) return;
      const response = await fetch("/api/admin/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_status", id, status, note }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to update decision."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update decision."); }
    finally { setBusy(false); }
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm" aria-labelledby="decision-log-title">
    <header><h2 id="decision-log-title" className="text-xl font-semibold">Decision log</h2><p className="mt-1 text-sm text-slate-600">Record what was observed and what would change. Exposure counts are descriptive; outcomes and causal lift are not connected.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Hypothesis<input name="hypothesis" required maxLength={1200} className={field} /></label>
      <label className="text-sm">Observed evidence<textarea name="observation" required maxLength={1200} className={field} /></label>
      <label className="text-sm">Supporting cohort<textarea name="cohort" required maxLength={1200} className={field} /></label>
      <label className="text-sm">Alternative explanations<textarea name="alternatives" placeholder="One per line" className={field} /></label>
      <label className="text-sm">Owner<input name="owner" required className={field} /></label>
      <label className="text-sm">Proposed change<textarea name="proposedChange" required className={field} /></label>
      <label className="text-sm">Build or release<input name="buildId" required className={field} /></label>
      <label className="text-sm">Primary outcome<textarea name="primaryMetric" required className={field} /></label>
      <label className="text-sm">Guardrails<textarea name="guardrails" placeholder="One per line" className={field} /></label>
      <label className="text-sm">Review date<input name="reviewDate" required type="date" className={field} /></label>
      <label className="text-sm">Experiment ID (optional)<input name="experimentId" className={field} /></label>
      <div className="md:col-span-2"><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save decision</button></div>
    </form>
    <p className="text-xs text-slate-500">Exposure read: {data.scopeCoverage.recordsRead} of a {data.scopeCoverage.readCap} event cap{data.scopeCoverage.truncatedPossible ? " (truncation possible)" : ""}. {data.interpretation}</p>
    <div className="space-y-3">{data.decisions.length === 0 ? <p className="text-sm text-slate-500">No decisions recorded.</p> : data.decisions.map((d) => {
      const evidence = data.exposureSummaries.find((x) => x.decisionId === d.id);
      return <article key={d.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{d.hypothesis}</h3><p className="mt-1 text-xs text-slate-500">{d.status.replaceAll("_", " ")} · owner {d.owner} · review {d.reviewDate}</p></div><select aria-label={`Update status for ${d.id}`} disabled={busy} value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)} className="rounded border border-slate-300 p-2 text-sm">{["proposed", "gathering_evidence", "ready_to_review", "accepted", "rejected"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="font-medium">Observation</dt><dd className="text-slate-700">{d.observation}</dd></div><div><dt className="font-medium">Cohort</dt><dd className="text-slate-700">{d.cohort}</dd></div><div><dt className="font-medium">Proposed change</dt><dd className="text-slate-700">{d.proposedChange}</dd></div><div><dt className="font-medium">Primary outcome and guardrails</dt><dd className="text-slate-700">{d.primaryMetric}; {d.guardrails.join("; ") || "none recorded"}</dd></div></dl>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{evidence?.renderedExposureCount || 0} observed rendered exposures{evidence?.countsByVariant ? ` · ${Object.entries(evidence.countsByVariant).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}. {evidence?.outcomeStatus === "exposure_only_outcomes_unavailable" ? "Outcomes unavailable; no lift estimated." : "No observed exposure; no lift estimated."}</p>
      </article>;
    })}</div>
  </section>;
}
