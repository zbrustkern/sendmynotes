"use client";
import React, { useEffect, useState } from "react";

type Name = "checkout" | "fulfillment" | "generation";
type Control = { paused: boolean; reason?: string; actor?: string; version: number; updatedAt?: number };
const TITLES: Record<Name, string> = { checkout: "Checkout", fulfillment: "Supplier submissions", generation: "Custom artwork generation" };

export function OperationalControlsPanel() {
  const [controls, setControls] = useState<Record<Name, Control> | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [previews, setPreviews] = useState<Partial<Record<Name, any>>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Name | null>(null);
  const [message, setMessage] = useState("");
  async function refresh() {
    const response = await fetch("/api/admin/operational-controls", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load operational controls");
    setControls((await response.json()).controls);
    const diagnostics = await fetch("/api/admin/reliability", { cache: "no-store" });
    if (diagnostics.ok) setHealth(await diagnostics.json());
  }
  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);
  async function change(name: Name) {
    if (!controls || !reason.trim()) return;
    setBusy(name); setMessage("");
    try {
      const response = await fetch("/api/admin/operational-controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ control: name, paused: !controls[name].paused, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update control");
      setControls(result.controls); setReason(""); setMessage(`${TITLES[name]} ${!controls[name].paused ? "paused" : "resumed"}.`);
      setPreviews((current) => ({ ...current, [name]: undefined }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update control"); }
    finally { setBusy(null); }
  }
  async function preview(name: Name) {
    const response = await fetch(`/api/admin/operational-controls?preview=${name}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setPreviews((current) => ({ ...current, [name]: data.preview }));
    else setMessage(data.error || "Unable to preview control effect");
  }
  return <section className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4" aria-labelledby="operational-controls-title">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs font-bold uppercase text-stone-500">Measured health</p><p className="mt-1 text-sm font-semibold capitalize text-stone-900">{health?.health?.status || "unknown"}</p><p className="text-xs text-stone-500">{health?.health?.checkedAt ? `Last check ${new Date(health.health.checkedAt).toLocaleString()}` : "No recent positive synthetic check"}</p></div>
      <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs font-bold uppercase text-stone-500">Open incidents</p><p className="mt-1 text-sm font-semibold text-stone-900">{health?.incidents?.openCount ?? "unknown"}</p><p className="text-xs text-stone-500">Queried independently from recent history</p></div>
      <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs font-bold uppercase text-stone-500">Worker queue</p><p className="mt-1 text-sm font-semibold capitalize text-stone-900">{health?.consumers?.status || "unknown"}</p><p className="text-xs text-stone-500">{health?.consumers?.lagMs == null ? "No measured worker success or lag" : `${Math.round(health.consumers.lagMs / 1000)}s since oldest queued item`}</p></div>
    </div>
    <div><h2 id="operational-controls-title" className="font-bold text-stone-900">Operational pause controls</h2><p className="mt-1 text-xs text-stone-500">Changes require an operator reason and are recorded in the audit log.</p></div>
    <div className="grid gap-3 md:grid-cols-3">
      {(["checkout", "fulfillment", "generation"] as Name[]).map((name) => {
        const control = controls?.[name]; const impact = previews[name];
        return <div key={name} className="rounded-xl border border-stone-200 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2"><strong className="text-sm">{TITLES[name]}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${control?.paused ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600"}`}>{control ? control.paused ? "PAUSED" : "ACTIVE" : "LOADING"}</span></div>
          {control?.paused && <p className="text-xs text-stone-600">{control.reason} · v{control.version}</p>}
          <button onClick={() => preview(name)} className="text-xs underline text-stone-700">Preview effect</button>
          {impact && <p className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">Affects: {impact.affected}. Open incidents: {impact.openIncidentCount}; pending queue entries: {impact.pendingOutboxCount}. Existing paid orders are preserved.</p>}
          <button disabled={!controls || !reason.trim() || busy !== null} onClick={() => change(name)} className="block w-full rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy === name ? "Saving…" : control?.paused ? "Resume" : "Pause"}</button>
        </div>;
      })}
    </div>
    <label className="block text-xs font-medium text-stone-700">Reason for next change<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" placeholder="Describe the operational issue" /></label>
    {message && <p role="status" className="text-xs text-stone-700">{message}</p>}
  </section>;
}
