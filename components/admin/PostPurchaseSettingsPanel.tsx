"use client";

import React, { useEffect, useState } from "react";
import type { FollowupStep, PostPurchaseConfig, FollowupStepConfig } from "@/lib/post-purchase/contracts";
import { renderPostPurchaseEmail } from "@/lib/email/post-purchase";

type SettingsData = { config: PostPurchaseConfig; publishedVersion?: string | { versionId?: string }; readiness?: { canSendTest?: boolean; blockers?: string[] } };
const stepNames: Record<FollowupStep, string> = { check_in: "Experience check-in", offer: "Next-card offer" };

export function PostPurchaseSettingsPanel() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<PostPurchaseConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewStep, setPreviewStep] = useState<FollowupStep>("check_in");
  const [renderedPreview, setRenderedPreview] = useState<{ subject?: string; previewText?: string; text?: string; html?: string } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"phone" | "desktop">("phone");

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/admin/post-purchase?view=settings", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.data?.config) throw new Error(body?.error || "Follow-up settings are unavailable.");
      setData(body.data); setDraft(body.data.config);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Follow-up settings are unavailable."); }
  }
  useEffect(() => { void load(); }, []);

  function updateConfig(updater: (config: PostPurchaseConfig) => PostPurchaseConfig) {
    setDraft((current) => current ? updater(current) : current);
  }
  function updateStep(step: FollowupStep, updater: (value: FollowupStepConfig) => FollowupStepConfig) {
    updateConfig((config) => ({ ...config, steps: { ...config.steps, [step]: updater(config.steps[step]) } }));
  }
  const isDirty = Boolean(data && draft && JSON.stringify(draft) !== JSON.stringify(data.config));
  function renderDraftPreview(step: FollowupStep) {
    try {
      const version = { ...draft!, versionId: `preview-${draft!.revision}`, publishedAt: 0, publishedBy: "synthetic-preview" };
      setRenderedPreview(renderPostPurchaseEmail(version, step, {
        greeting: "Hi Alex,", cardPhrase: "your card", offerAmount: "$1", offerCode: "EXAMPLE-NOT-A-REAL-CODE",
        offerUrl: "https://sendmynotes.com/new?discount=EXAMPLE&followupRef=EXAMPLE", expiryDisplay: "January 1, 2027",
        unsubscribeUrl: "https://sendmynotes.com/email/unsubscribe?token=EXAMPLE", businessPostalAddress: "Example business address",
      }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Preview could not be rendered."); }
  }
  useEffect(() => { if (draft) renderDraftPreview(previewStep); }, [draft, previewStep]);
  async function mutate(action: "save_draft" | "publish" | "preview", step?: FollowupStep) {
    if (!draft) return;
    if (action === "preview") { setError(""); renderDraftPreview(step || previewStep); setNotice("Rendered with the production email renderer and synthetic example values. No email was sent."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = action === "save_draft" ? { action, config: draft, expectedRevision: draft.revision } : { action, expectedRevision: draft.revision };
      const response = await fetch("/api/admin/post-purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "That change could not be saved.");
      setNotice(action === "publish" ? "Published version for future enrollments." : "Draft saved. Existing reviewed messages keep their approved version."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That change could not be saved."); }
    finally { setBusy(false); }
  }

  if (error && !draft) return <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}<button className="ml-3 underline" onClick={() => void load()}>Retry</button></section>;
  if (!draft) return <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600" role="status">Loading follow-up settings…</div>;
  const blockers = data?.readiness?.blockers || [];
  return <section className="space-y-5" aria-label="Follow-up settings">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-stone-900">Follow-up settings</h2><p className="mt-1 text-sm text-stone-600">Two optional messages for senders who explicitly chose follow-ups and offers.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{data?.publishedVersion ? `Published ${typeof data.publishedVersion === "string" ? data.publishedVersion : data.publishedVersion.versionId || "version"}` : "No published version"}</span></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="min-w-0 flex-1">{blockers.length ? <>Test delivery is blocked: {blockers.join("; ")}</> : "Test delivery requires a configured allowlisted inbox and synthetic order."} No message has been sent.</p><button type="button" disabled={!data?.readiness?.canSendTest || busy} title="Unavailable in staging review mode" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-60">Send synthetic test</button></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        <fieldset><legend className="text-sm font-semibold text-stone-900">Enrollment</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{(["review", "auto"] as const).map((mode) => <label key={mode} className="flex cursor-pointer gap-3 rounded-lg border border-stone-200 p-3 text-sm"><input type="radio" name="mode" checked={draft.mode === mode} onChange={() => updateConfig((c) => ({ ...c, mode }))}/><span><b>{mode === "review" ? "Review each enrollment" : "Automatically enroll future eligible buyers"}</b><small className="mt-1 block text-xs text-stone-500">{mode === "review" ? "Recommended while the flow is reviewed." : "Applies only to future eligible orders."}</small></span></label>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Send hour (Chicago time)<input type="number" min={9} max={17} value={draft.sendHourLocal} onChange={(e) => updateConfig((c) => ({ ...c, sendHourLocal: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={draft.globalPaused} onChange={(e) => updateConfig((c) => ({ ...c, globalPaused: e.target.checked }))}/>Pause optional delivery</label></div>
        <p className="-mt-2 text-xs text-stone-500">Pausing the flow or disabling a step takes effect as soon as you save the draft. Copy and timing changes affect future enrollments after publish. Unsubscribe remains available while paused.</p>
        <label className="block text-sm">Offer timing anchor<select value={draft.anchor} onChange={(e) => updateConfig((c) => ({ ...c, anchor: e.target.value as PostPurchaseConfig["anchor"] }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="accepted_check_in">Accepted check-in email (default)</option><option value="mailing_business_days">Verified mailing date (when check-in is off)</option></select><small className="mt-1 block text-xs text-stone-500">The check-in timing is always measured from verified mailing. If you turn it off, choose verified mailing as the offer anchor before publishing.</small></label>
        {(Object.keys(draft.steps) as FollowupStep[]).map((step) => { const config = draft.steps[step]; const minimum = step === "check_in" || (step === "offer" && draft.anchor === "mailing_business_days") ? 10 : 7; const delayBasis = step === "check_in" || draft.anchor === "mailing_business_days" ? "business days after verified mailing" : "calendar days after the accepted check-in"; return <fieldset key={step} className="space-y-3 border-t border-stone-200 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><legend className="font-semibold text-stone-900">{stepNames[step]}</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={(e) => updateStep(step, (v) => ({ ...v, enabled: e.target.checked }))}/>Enabled</label></div><label className="block text-sm">Wait ({delayBasis})<input type="number" min={minimum} max={90} value={config.delayDays} onChange={(e) => updateStep(step, (v) => ({ ...v, delayDays: Number(e.target.value) }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label><label className="block text-sm">Subject<input value={config.subject} onChange={(e) => updateStep(step, (v) => ({ ...v, subject: e.target.value }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label><label className="block text-sm">Preview text<input value={config.previewText} onChange={(e) => updateStep(step, (v) => ({ ...v, previewText: e.target.value }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label><label className="block text-sm">Message paragraphs<textarea rows={4} value={config.paragraphs.join("\n\n")} onChange={(e) => updateStep(step, (v) => ({ ...v, paragraphs: e.target.value.split(/\n\s*\n/) }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label><label className="block text-sm">Sign-off<textarea rows={3} value={config.signoff} onChange={(e) => updateStep(step, (v) => ({ ...v, signoff: e.target.value }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label>{step === "offer" && <label className="block text-sm">Button label<input value={config.buttonLabel || ""} onChange={(e) => updateStep(step, (v) => ({ ...v, buttonLabel: e.target.value }))} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"/></label>}</fieldset>; })}
        <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-4"><button disabled={busy || !isDirty} onClick={() => void mutate("save_draft")} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button><button disabled={busy || isDirty} title={isDirty ? "Save the draft before publishing." : undefined} onClick={() => void mutate("publish")} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review &amp; publish</button></div>
      </div>
      <aside className="space-y-4"><section className="rounded-xl border border-stone-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Customer preview</h3><button type="button" onClick={() => setPreviewWidth((v) => v === "phone" ? "desktop" : "phone")} className="rounded border border-stone-300 px-2 py-1 text-xs">{previewWidth === "phone" ? "Desktop width" : "Phone width"}</button></div><label className="mt-3 block text-sm">Message<select value={previewStep} onChange={(e) => setPreviewStep(e.target.value as FollowupStep)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="check_in">Experience check-in</option><option value="offer">Next-card offer</option></select></label><p className="mt-3 text-sm font-semibold">{renderedPreview?.subject || "Preview unavailable"}</p><p className="mt-1 text-xs text-stone-500">{renderedPreview?.previewText}</p>{renderedPreview?.html ? <iframe title={`${stepNames[previewStep]} email preview`} sandbox="" srcDoc={renderedPreview.html} className={`mt-3 h-[480px] rounded border border-stone-200 bg-white ${previewWidth === "phone" ? "mx-auto w-full max-w-[360px]" : "w-full"}`} /> : <div className="mt-3 h-[480px] rounded border border-stone-200 p-4 text-sm text-stone-500">Rendering preview…</div>}<details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-stone-700">Plain-text email</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-stone-50 p-3 font-sans text-xs leading-5">{renderedPreview?.text || ""}</pre></details>{previewStep === "offer" && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">Preview code is inactive and cannot be redeemed.</p>}<button disabled={busy} onClick={() => void mutate("preview", previewStep)} className="mt-3 rounded-lg border border-stone-300 px-3 py-2 text-sm">Refresh exact preview</button></section><p className="text-xs text-stone-500">Published edits apply to new enrollments. Existing reviewed messages retain their approved copy and schedule. Publishing does not enable live sending.</p></aside>
    </div>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
  </section>;
}
