"use client";

import React, { useEffect, useRef, useState } from "react";
import type { PromotionEvaluation } from "@/lib/promotions-v2";

type Workflow = "multisend" | "single" | "wedding";
type Terms = {
  name: string; code: string; distribution: "public" | "private"; workflow: Workflow;
  countries: string; match: "all" | "matching"; audience: "any" | "verified" | "project";
  projectId: string; startsAt: string; endsAt: string; minQuantity: string; minSpendCents: string;
  chargeTypes: string; benefit: "percentage" | "fixed_unit" | "fixed_order"; value: string;
  maxUnits: string; maxCents: string; maxProjectUnits: string; maxProjectCents: string;
  perSenderLimit: string; maxUses: string; budgetCents: string;
  allowFreeDomesticSingle: boolean; payableFloor: "reject" | "cap";
};
type Scenario = { country: string; missingDestination: boolean; count: string; verified: boolean; wrongProject: boolean; priorPurchases: string; usedUnits: string; usedCents: string };
type CampaignItem = { campaign: any; draft: any; policy: any; balance: any; codes: any[] };
type Preview = { revision: number; previewToken: string; previews: Record<string, PromotionEvaluation>; maximumOrderSubsidyCents: number | null; maximumCampaignSubsidyCents: number | null; weddingCheckoutAvailable: boolean; publicationAvailable: boolean; publicationBlockReason: string | null };

const schedules: Record<Workflow, string> = { multisend: "multi-send-900-v1", single: "base900-international500-v1", wedding: "wedding-graduated-pilot-v1" };
const blank: Terms = { name: "", code: "", distribution: "public", workflow: "multisend", countries: "US", match: "matching", audience: "any", projectId: "", startsAt: "", endsAt: "", minQuantity: "5", minSpendCents: "", chargeTypes: "card_base", benefit: "percentage", value: "20", maxUnits: "", maxCents: "900", maxProjectUnits: "", maxProjectCents: "", perSenderLimit: "", maxUses: "", budgetCents: "", allowFreeDomesticSingle: false, payableFloor: "reject" };
const templates: Array<{ label: string; terms: Terms; scenario: Scenario }> = [
  { label: "Multisend · 5+ cards · 20% base, $9 cap", terms: { ...blank, name: "Multisend 5+", workflow: "multisend" }, scenario: { country: "US", missingDestination: false, count: "5", verified: true, wrongProject: false, priorPurchases: "0", usedUnits: "0", usedCents: "0" } },
  { label: "Single Canada · $3 mailing surcharge", terms: { ...blank, name: "Canada mailing credit", workflow: "single", countries: "CA", minQuantity: "1", chargeTypes: "destination_surcharge", benefit: "fixed_order", value: "300", maxCents: "", }, scenario: { country: "CA", missingDestination: false, count: "1", verified: true, wrongProject: false, priorPurchases: "0", usedUnits: "0", usedCents: "0" } },
  { label: "Wedding · first 25 project cards · $1 base", terms: { ...blank, name: "Wedding first 25", workflow: "wedding", countries: "US,CA", distribution: "private", audience: "project", minQuantity: "1", chargeTypes: "card_base", benefit: "fixed_unit", value: "100", maxCents: "", maxProjectUnits: "25", budgetCents: "2500" }, scenario: { country: "US", missingDestination: false, count: "1", verified: true, wrongProject: false, priorPurchases: "0", usedUnits: "0", usedCents: "0" } },
];
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `$${(value / 100).toFixed(2)}` : "—";
const optionalNumber = (value: string) => value.trim() === "" ? undefined : Number(value);
const localDate = (value: unknown) => typeof value === "number" ? new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
const dateValue = (value: string) => value ? new Date(value).getTime() : undefined;
const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function policyFromTerms(t: Terms) {
  return {
    workflow: t.workflow, scheduleVersion: schedules[t.workflow], countryCodes: t.countries.split(",").map(c => c.trim().toUpperCase()).filter(Boolean),
    match: t.match, minimumQuantity: optionalNumber(t.minQuantity), minimumSpendCents: optionalNumber(t.minSpendCents),
    audience: t.audience, projectId: t.audience === "project" ? t.projectId || undefined : undefined,
    startsAt: dateValue(t.startsAt), endsAt: dateValue(t.endsAt), chargeTypes: t.chargeTypes.split(","),
    benefit: t.benefit === "percentage" ? { type: "percentage", basisPoints: Number(t.value) * 100 } : { type: t.benefit, amountCents: Number(t.value) },
    maxUnitsPerOrder: optionalNumber(t.maxUnits), maxDiscountCentsPerOrder: optionalNumber(t.maxCents),
    maxUnitsPerProject: optionalNumber(t.maxProjectUnits), maxDiscountCentsPerProject: optionalNumber(t.maxProjectCents),
    perSenderLimit: optionalNumber(t.perSenderLimit), allowFreeDomesticSingle: t.allowFreeDomesticSingle, payableFloor: t.payableFloor,
  };
}

function termsFromItem(item: CampaignItem): Terms {
  const p = item.draft?.policy ?? item.policy ?? {};
  const d = item.draft ?? {};
  const c = item.campaign ?? {};
  return {
    ...blank, name: d.name ?? c.name ?? "", code: d.code ?? "", distribution: d.distribution ?? "public",
    workflow: p.workflow ?? "multisend", countries: (p.countryCodes ?? ["US"]).join(","), match: p.match ?? "matching",
    audience: p.audience ?? "any", projectId: p.projectId ?? "", startsAt: localDate(p.startsAt), endsAt: localDate(p.endsAt),
    minQuantity: p.minimumQuantity == null ? "" : String(p.minimumQuantity), minSpendCents: p.minimumSpendCents == null ? "" : String(p.minimumSpendCents),
    chargeTypes: (p.chargeTypes ?? ["card_base"]).join(","), benefit: p.benefit?.type ?? "fixed_order",
    value: String(p.benefit?.type === "percentage" ? p.benefit.basisPoints / 100 : p.benefit?.amountCents ?? 0),
    maxUnits: p.maxUnitsPerOrder == null ? "" : String(p.maxUnitsPerOrder), maxCents: p.maxDiscountCentsPerOrder == null ? "" : String(p.maxDiscountCentsPerOrder),
    maxProjectUnits: p.maxUnitsPerProject == null ? "" : String(p.maxUnitsPerProject), maxProjectCents: p.maxDiscountCentsPerProject == null ? "" : String(p.maxDiscountCentsPerProject),
    perSenderLimit: p.perSenderLimit == null ? "" : String(p.perSenderLimit), maxUses: d.maxUses == null ? "" : String(d.maxUses),
    budgetCents: d.budgetCents == null ? "" : String(d.budgetCents), allowFreeDomesticSingle: p.allowFreeDomesticSingle === true, payableFloor: p.payableFloor ?? "reject",
  };
}

function scenarioBody(s: Scenario) {
  return { countryCode: s.missingDestination ? null : s.country.trim().toUpperCase(), count: Number(s.count), verified: s.verified,
    wrongProject: s.wrongProject, previouslyPurchased: Number(s.priorPurchases), previouslyUsedUnits: Number(s.usedUnits), previouslyUsedCents: Number(s.usedCents) };
}

function Field({ label, value, onChange, type = "text", hint, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; hint?: string; min?: number }) {
  return <label className="block text-xs font-medium text-stone-700">{label}<input aria-label={label} type={type} min={min} step={type === "number" ? 1 : undefined} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />{hint && <span className="mt-1 block text-[11px] text-stone-500">{hint}</span>}</label>;
}
function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="block text-xs font-medium text-stone-700">{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">{options.map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs font-medium text-stone-700"><input aria-label={label} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
}
function PreviewCard({ title, value }: { title: string; value: PromotionEvaluation }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs">
    <div className="flex justify-between gap-2 font-semibold"><span>{title}</span><span>{value.eligible ? "Eligible" : value.reason}</span></div>
    <p className="mt-2">Base {money(value.cardBaseCents)} · Surcharge {money(value.surchargeCents)} · Eligible {value.eligibleUnits} · Selected {value.selectedUnits}</p>
    <p>Gross {money(value.grossCents)} · Savings {money(value.discountCents)} · Final {money(value.netCents)}</p>
    {value.lines?.length > 0 && <details className="mt-2"><summary>Line allocations ({value.lines.length})</summary><ol className="mt-1 max-h-40 space-y-1 overflow-auto">{value.lines.map(line => <li key={line.id}>{line.id} ({line.countryCode ?? "no destination"}): {money(line.grossCents)} − {money(line.discountCents)} = {money(line.netCents)}<ul className="ml-3">{line.components.map(part => <li key={part.id}>{part.chargeType}: {money(part.grossCents)} − {money(part.discountCents)}</li>)}</ul></li>)}</ol></details>}
  </div>;
}

export function BespokeOfferEditor({ environment, onCampaignChange }: { environment?: string; onCampaignChange?: () => void }) {
  const [environmentLabel, setEnvironmentLabel] = useState(environment ?? "Current server environment");
  const [terms, setTerms] = useState<Terms>(templates[0].terms);
  const [scenario, setScenario] = useState<Scenario>(templates[0].scenario);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState("");
  const [savedTermsKey, setSavedTermsKey] = useState("");
  const [issued, setIssued] = useState<Array<{ id: string; code: string; url: string }>>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [inspection, setInspection] = useState<any>(null);
  const [inspectionType, setInspectionType] = useState<"synthetic" | "order">("synthetic");
  const [orderId, setOrderId] = useState("");
  const [issueCount, setIssueCount] = useState("1");
  const [issueRequestId, setIssueRequestId] = useState("");
  const [issueRestrictions, setIssueRestrictions] = useState({ countries: "", ownerUid: "", projectId: "", maxUses: "", budgetCents: "", endsAt: "" });
  const [reason, setReason] = useState("Reviewed in admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const termsRef = useRef(terms);
  const scenarioRef = useRef(scenario);
  const fingerprint = JSON.stringify({ terms, scenario, selectedId, revision });
  const savedTerms = savedTermsKey === JSON.stringify(terms);
  const reviewed = !!preview?.previewToken && previewFingerprint === fingerprint && preview.revision === revision;
  const canPublish = reviewed && preview?.publicationAvailable === true && !!reason.trim() && item?.campaign?.status !== "archived";

  function changeTerms(next: Terms) { termsRef.current = next; setTerms(next); setPreview(null); setPreviewFingerprint(""); }
  function changeScenario(next: Scenario) { scenarioRef.current = next; setScenario(next); setPreview(null); setPreviewFingerprint(""); }
  const edit = (key: keyof Terms, value: string | boolean) => { sequence.current++; changeTerms({ ...termsRef.current, [key]: value }); };
  const editScenario = (key: keyof Scenario, value: string | boolean) => { sequence.current++; changeScenario({ ...scenarioRef.current, [key]: value }); };
  const invalidate = () => { sequence.current++; setPreview(null); setPreviewFingerprint(""); setInspection(null); };
  const apiUrl = (view: string, id?: string) => `/api/admin/promotions?view=${view}${id ? `&campaignId=${encodeURIComponent(id)}` : ""}${environment ? `&environment=${encodeURIComponent(environment)}` : ""}`;
  const postUrl = `/api/admin/promotions${environment ? `?environment=${encodeURIComponent(environment)}` : ""}`;

  async function get(view: string, id?: string) {
    const response = await fetch(apiUrl(view, id));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  }
  async function post(action: string, body: Record<string, unknown>) {
    const response = await fetch(postUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  }
  async function refreshList() {
    const data = await get("campaigns");
    setCampaigns(data.campaigns ?? []);
    if (data.environment) setEnvironmentLabel(data.environment);
  }
  async function selectCampaign(id: string, retainedScenario?: Scenario) {
    invalidate();
    const request = sequence.current;
    setSelectedId(id); setItem(null); setRevision(null); setSavedTermsKey(""); setIssued([]); setHistory([]);
    if (!id) { changeTerms({ ...blank }); return; }
    try {
      const data = await get("campaign", id);
      if (request !== sequence.current) return;
      const detail = data.campaign as CampaignItem;
      setItem(detail); setRevision(detail.campaign?.revision ?? null);
      const loadedTerms = termsFromItem(detail);
      changeTerms(loadedTerms); setSavedTermsKey(detail.draft?.revision === detail.campaign.revision ? JSON.stringify(loadedTerms) : "");
      changeScenario(retainedScenario ?? { ...templates[loadedTerms.workflow === "single" ? 1 : loadedTerms.workflow === "wedding" ? 2 : 0].scenario,
        country: loadedTerms.countries.split(",")[0] || "US" });
      if (data.environment) setEnvironmentLabel(data.environment);
    } catch (e) { if (request === sequence.current) setError((e as Error).message); }
  }
  useEffect(() => {
    const host = window.location.hostname;
    setIssueRequestId(newRequestId());
    if (!environment) setEnvironmentLabel(`${host} (hostname)`);
    void refreshList().catch(e => setError(e.message));
  }, [environment]);

  async function run(action: "save" | "preview" | "publish" | "clone" | "pause" | "issue" | "history" | "inspect") {
    const request = ++sequence.current;
    const id = selectedId;
    const currentTerms = termsRef.current;
    const currentScenario = scenarioRef.current;
    const currentRevision = revision;
    const currentFingerprint = fingerprint;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "save") {
        invalidate();
        const data = await post("draft-save", { ...(id ? { campaignId: id, revision: currentRevision } : {}), name: currentTerms.name, code: currentTerms.code || undefined, distribution: currentTerms.distribution, policy: policyFromTerms(currentTerms), maxUses: optionalNumber(currentTerms.maxUses), budgetCents: optionalNumber(currentTerms.budgetCents) });
        if (request + 1 !== sequence.current) return;
        const newId = data.campaign.id;
        await refreshList();
        if (request + 1 !== sequence.current) return;
        await selectCampaign(newId, currentScenario);
        setNotice("Draft saved. Run a fresh preview before publishing.");
      } else if (action === "preview") {
        if (!id || currentRevision == null || !savedTerms) throw new Error("Save the current terms before previewing.");
        const data = await post("draft-preview", { campaignId: id, revision: currentRevision, scenario: scenarioBody(currentScenario) }) as Preview;
        if (request !== sequence.current || currentFingerprint !== JSON.stringify({ terms: termsRef.current, scenario: scenarioRef.current, selectedId: id, revision: currentRevision })) return;
        setPreview(data); setPreviewFingerprint(currentFingerprint);
      } else if (action === "publish") {
        if (!canPublish || !preview) throw new Error("Preview the saved terms and confirm checkout readiness first.");
        const data = await post("draft-publish", { campaignId: id, revision: currentRevision, previewToken: preview.previewToken, reason });
        onCampaignChange?.();
        if (request !== sequence.current) return;
        setIssued(data.issued?.code ? [data.issued] : []);
        setPreview(null); await refreshList();
        const detail = await get("campaign", id);
        if (request !== sequence.current) return;
        setItem(detail.campaign); setRevision(detail.campaign.draft?.revision ?? detail.campaign.campaign?.revision ?? null);
        setNotice(currentTerms.distribution === "private" ? "Campaign published. Copy the private code and link before switching campaigns." : "Campaign published. The public code is ready to share.");
      } else if (action === "clone") {
        const data = await post("campaign-clone", { campaignId: id, name: `${currentTerms.name} copy`, reason });
        if (request !== sequence.current) return;
        await refreshList(); await selectCampaign(data.campaign.id);
        setNotice("Independent draft cloned.");
      } else if (action === "pause") {
        await post("campaign-pause", { campaignId: id, revision: currentRevision, reason });
        onCampaignChange?.();
        if (request !== sequence.current) return;
        await refreshList(); await selectCampaign(id); setNotice("Campaign paused.");
      } else if (action === "issue") {
        const r = issueRestrictions;
        const restrictions = { countryCodes: r.countries ? r.countries.split(",").map(c => c.trim().toUpperCase()).filter(Boolean) : undefined,
          ownerUid: r.ownerUid || undefined, projectId: r.projectId || undefined, maxUses: optionalNumber(r.maxUses), budgetCents: optionalNumber(r.budgetCents), endsAt: dateValue(r.endsAt) };
        const data = await post("campaign-issue", { campaignId: id, requestId: issueRequestId, count: Number(issueCount), reason, restrictions });
        onCampaignChange?.();
        if (request !== sequence.current) return;
        setIssued(data.issued ?? []); setNotice("Private codes issued. Keep this request ID to retry the identical issuance.");
      } else if (action === "history") {
        const data = await get("history", id);
        if (request === sequence.current) setHistory(data.history ?? []);
      } else if (action === "inspect") {
        const data = await post("campaign-inspect", inspectionType === "order" ? { orderId } : { campaignId: id, revision: currentRevision, scenario: scenarioBody(currentScenario) });
        if (request === sequence.current) setInspection(data.decision);
      }
    } catch (e) {
      if (request === sequence.current || action === "save" && request + 1 === sequence.current) setError((e as Error).message);
    }
    finally { setBusy(false); }
  }

  return <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Bespoke offer editor">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h2 className="text-lg font-bold">Create code · offer editor</h2><p className="text-sm text-stone-500">Save a draft, review fresh checkout scenarios, then publish.</p></div><span className="rounded-full bg-stone-100 px-3 py-1 text-xs">Environment: {environmentLabel}</span></header>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-4 flex flex-wrap gap-2">{templates.map(template => <button key={template.label} type="button" className="rounded-full border px-3 py-2 text-xs font-semibold" onClick={() => { invalidate(); changeTerms({ ...template.terms }); changeScenario({ ...template.scenario }); }}>{template.label}</button>)}</div>
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]"><div className="space-y-5">
      <fieldset className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">Campaign and eligibility</legend>
        <Field label="Campaign name" value={terms.name} onChange={v => edit("name", v)} />
        <Field label="Requested public code (optional)" value={terms.code} onChange={v => edit("code", v)} hint="Leave blank for an automatically generated code. Private codes appear only when published or issued." />
        <Choice label="Checkout workflow" value={terms.workflow} onChange={v => { invalidate(); changeTerms({ ...terms, workflow: v as Workflow, audience: v === "wedding" ? "project" : "any", minQuantity: v === "multisend" ? "5" : "1" }); changeScenario({ ...scenario, count: v === "multisend" ? "5" : "1" }); }} options={[["multisend", "Domestic multisend"], ["single", "Single card"], ["wedding", "Wedding project"]]} />
        <Field label="Pricing schedule" value={schedules[terms.workflow]} onChange={() => {}} hint="Fixed by the current checkout contract." />
        <Field label="Eligible destination country codes" value={terms.countries} onChange={v => edit("countries", v)} hint="Comma separated ISO two letter codes, such as US,CA." />
        <Choice label="Audience" value={terms.audience} onChange={v => edit("audience", v)} options={[["any", "Any eligible sender"], ["verified", "Verified sender"], ["project", "Authorized wedding project"]]} />
        {terms.audience === "project" && <Field label="Wedding project ID" value={terms.projectId} onChange={v => edit("projectId", v)} />}
        <Field label="Minimum eligible cards" type="number" min={1} value={terms.minQuantity} onChange={v => edit("minQuantity", v)} />
        <Field label="Minimum eligible spend (cents)" type="number" min={1} value={terms.minSpendCents} onChange={v => edit("minSpendCents", v)} />
        <Field label="Starts (local date and time)" type="datetime-local" value={terms.startsAt} onChange={v => edit("startsAt", v)} />
        <Field label="Ends (local date and time)" type="datetime-local" value={terms.endsAt} onChange={v => edit("endsAt", v)} />
      </fieldset>
      <fieldset className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">Savings and limits</legend>
        <Choice label="Matching rule" value={terms.match} onChange={v => edit("match", v)} options={[["matching", "Discount matching lines"], ["all", "All cards must qualify"]]} />
        <Choice label="Charge to reduce" value={terms.chargeTypes} onChange={v => edit("chargeTypes", v)} options={[["card_base", "Card base"], ["destination_surcharge", "Mailing surcharge"], ["card_base,destination_surcharge", "Card base and surcharge"]]} />
        <Choice label="Benefit" value={terms.benefit} onChange={v => edit("benefit", v)} options={[["percentage", "Percentage"], ["fixed_order", "Fixed amount per order"], ["fixed_unit", "Fixed amount per eligible card"]]} />
        <Field label={terms.benefit === "percentage" ? "Discount percent" : "Discount amount (cents)"} type="number" min={1} value={terms.value} onChange={v => edit("value", v)} />
        <Field label="Maximum discounted cards per order" type="number" min={1} value={terms.maxUnits} onChange={v => edit("maxUnits", v)} />
        <Field label="Maximum savings per order (cents)" type="number" min={1} value={terms.maxCents} onChange={v => edit("maxCents", v)} />
        {terms.workflow === "wedding" && <><Field label="Maximum discounted cards per project" type="number" min={1} value={terms.maxProjectUnits} onChange={v => edit("maxProjectUnits", v)} /><Field label="Maximum savings per project (cents)" type="number" min={1} value={terms.maxProjectCents} onChange={v => edit("maxProjectCents", v)} /></>}
        <Choice label="Below $0.50 checkout handling" value={terms.payableFloor} onChange={v => edit("payableFloor", v)} options={[["reject", "Reject offer"], ["cap", "Cap discount"]]} />
        {terms.workflow === "single" && <Check label="Allow a free domestic single card" checked={terms.allowFreeDomesticSingle} onChange={v => edit("allowFreeDomesticSingle", v)} />}
      </fieldset>
      <fieldset className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">Distribution and campaign budget</legend>
        <Choice label="Code distribution" value={terms.distribution} onChange={v => edit("distribution", v)} options={[["public", "Public"], ["private", "Private"]]} />
        <Field label="Campaign use limit" type="number" min={1} value={terms.maxUses} onChange={v => edit("maxUses", v)} />
        <Field label="Campaign subsidy budget (cents)" type="number" min={1} value={terms.budgetCents} onChange={v => edit("budgetCents", v)} />
        <Field label="Limit per verified sender" type="number" min={1} value={terms.perSenderLimit} onChange={v => edit("perSenderLimit", v)} />
      </fieldset>
      <Field label="Audit reason" value={reason} onChange={setReason} />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void run("save")} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save draft</button>
        <button disabled={busy || !canPublish} onClick={() => void run("publish")} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Publish reviewed revision</button>
        <button disabled={busy || !selectedId} onClick={() => void run("clone")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Clone to independent draft</button>
        <button disabled={busy} onClick={() => { invalidate(); setSelectedId(""); setItem(null); setRevision(null); setIssued([]); setHistory([]); setSavedTermsKey(""); changeTerms({ ...blank, name: "" }); }} className="rounded-lg border px-4 py-2 text-sm">Clear for new draft</button>
      </div>
    </div><aside className="space-y-4">
      <section className="rounded-2xl bg-stone-50 p-4"><h3 className="font-bold">Scenario preview</h3><p className="text-xs text-stone-500">Preview uses the saved draft. Pending edits or scenario changes invalidate the result.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Destination country" value={scenario.country} onChange={v => editScenario("country", v.toUpperCase())} />
          <Field label="Card count" type="number" min={1} value={scenario.count} onChange={v => editScenario("count", v)} />
          <Check label="Missing destination" checked={scenario.missingDestination} onChange={v => editScenario("missingDestination", v)} />
          <Check label="Verified sender" checked={scenario.verified} onChange={v => editScenario("verified", v)} />
          <Check label="Wrong project" checked={scenario.wrongProject} onChange={v => editScenario("wrongProject", v)} />
          <Field label="Prior project purchases" type="number" min={0} value={scenario.priorPurchases} onChange={v => editScenario("priorPurchases", v)} />
          <Field label="Prior project allowance used (cards)" type="number" min={0} value={scenario.usedUnits} onChange={v => editScenario("usedUnits", v)} />
          <Field label="Prior project allowance used (cents)" type="number" min={0} value={scenario.usedCents} onChange={v => editScenario("usedCents", v)} />
        </div>
        <button disabled={busy || !selectedId || !revision || !savedTerms} onClick={() => void run("preview")} className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Run qualifying, near miss, largest, and custom previews</button>
        {selectedId && !reviewed && <p className="mt-2 text-xs text-amber-800">No current review. Save pending terms and run a fresh preview.</p>}
        {preview && reviewed && <div className="mt-3 space-y-2">{Object.entries(preview.previews).map(([kind, value]) => <PreviewCard key={kind} title={{ qualifying: "Qualifying", nearMiss: "Near miss", largest: "Largest permitted", custom: "Custom" }[kind] ?? kind} value={value} />)}<p className="text-xs">Maximum subsidy per order: {money(preview.maximumOrderSubsidyCents)} · Campaign: {preview.maximumCampaignSubsidyCents == null ? "Uncapped" : money(preview.maximumCampaignSubsidyCents)}</p></div>}
        {preview?.publicationBlockReason && <p className="mt-2 text-xs text-amber-800">Publication blocked: {preview.publicationBlockReason}</p>}
        <div className="mt-4 border-t pt-3">
          <Choice label="Inspect" value={inspectionType} onChange={v => setInspectionType(v as "synthetic" | "order")} options={[["synthetic", "Synthetic scenario"], ["order", "Frozen order decision"]]} />
          {inspectionType === "order" && <Field label="Order ID" value={orderId} onChange={setOrderId} />}
          <button disabled={busy || (inspectionType === "order" ? !orderId : !selectedId)} onClick={() => void run("inspect")} className="mt-2 rounded-lg border px-3 py-2 text-xs">Inspect decision</button>
          {inspection && <p className="mt-2 text-xs">{inspection.reason} · Gross {money(inspection.grossCents)} · Savings {money(inspection.discountCents)} · Final {money(inspection.netCents)}</p>}
        </div>
      </section>
      <section className="rounded-2xl border p-4"><h3 className="font-bold">Saved campaigns</h3><select aria-label="Load campaign" value={selectedId} onChange={e => void selectCampaign(e.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"><option value="">Select saved campaign</option>{campaigns.map(c => <option key={c.campaign.id} value={c.campaign.id}>{c.campaign.name} · {c.campaign.status}</option>)}</select>
        {item && <p className="mt-2 text-xs">Status {item.campaign.status} · Held {money(item.balance?.heldCents)} · Spent {money(item.balance?.spentCents)} · Remaining {item.balance?.remainingCents == null ? "Uncapped" : money(item.balance.remainingCents)}</p>}
        <button disabled={busy || !selectedId || item?.campaign?.status !== "active"} onClick={() => void run("pause")} className="mt-3 mr-2 rounded-lg border px-3 py-2 text-xs disabled:opacity-50">Pause</button><button disabled={busy || !selectedId} onClick={() => void run("history")} className="mt-3 rounded-lg border px-3 py-2 text-xs disabled:opacity-50">Load history</button>
        {history.length > 0 && <ol className="mt-2 max-h-44 space-y-2 overflow-auto text-xs">{history.map(h => <li key={h.id}><b>{h.action}</b> · {h.actorEmail} · {h.environment}<div>{h.oldVersion ?? "—"} → {h.newVersion ?? "—"} · {h.reason}</div><time>{h.timestamp ? new Date(h.timestamp).toLocaleString() : ""}</time></li>)}</ol>}
        <div className="mt-4 border-t pt-3">
          <h4 className="text-sm font-semibold">Issue private codes</h4>
          <p className="text-xs text-stone-500">Keep the request ID unchanged when retrying the same batch and restrictions.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Batch size (1–20)" type="number" min={1} value={issueCount} onChange={setIssueCount} />
            <Field label="Request ID" value={issueRequestId} onChange={setIssueRequestId} />
            <Field label="Restrict countries" value={issueRestrictions.countries} onChange={v => setIssueRestrictions({ ...issueRestrictions, countries: v })} />
            <Field label="Restrict verified sender ID" value={issueRestrictions.ownerUid} onChange={v => setIssueRestrictions({ ...issueRestrictions, ownerUid: v })} />
            <Field label="Restrict project ID" value={issueRestrictions.projectId} onChange={v => setIssueRestrictions({ ...issueRestrictions, projectId: v })} />
            <Field label="Code use limit" type="number" min={1} value={issueRestrictions.maxUses} onChange={v => setIssueRestrictions({ ...issueRestrictions, maxUses: v })} />
            <Field label="Code budget (cents)" type="number" min={1} value={issueRestrictions.budgetCents} onChange={v => setIssueRestrictions({ ...issueRestrictions, budgetCents: v })} />
            <Field label="Code expires (local date and time)" type="datetime-local" value={issueRestrictions.endsAt} onChange={v => setIssueRestrictions({ ...issueRestrictions, endsAt: v })} />
          </div>
          <div className="mt-2 flex gap-2">
            <button disabled={busy || item?.campaign?.status !== "active" || terms.distribution !== "private"} onClick={() => void run("issue")} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">Issue or retry batch</button>
            <button onClick={() => { setIssueRequestId(newRequestId()); setIssued([]); }} className="rounded-lg border px-3 py-2 text-xs">New batch ID</button>
          </div>
        </div>
        {issued.length > 0 && <div className="mt-3 border-t pt-3 text-xs"><b>New private codes and links</b><ul className="mt-2 space-y-2">{issued.map(i => <li key={i.id} className="break-all"><code>{i.code}</code> · <a className="text-blue-700 underline" href={i.url} target="_blank" rel="noreferrer">{i.url}</a></li>)}</ul></div>}
      </section>
    </aside></div>
  </section>;
}

export default BespokeOfferEditor;
