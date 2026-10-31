"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { UploadGrant, UploadStandards, UploadTreatment } from "@/lib/upload/contracts";

const treatmentNames: Record<UploadTreatment, string> = { "playful-stack": "Playful stack", "gentle-arch": "Gentle arch", "classic-serif": "Classic serif" };

export default function UploadAdminPage() {
  const { user, signInWithGoogle } = useAuth();
  const [grants, setGrants] = useState<UploadGrant[]>([]);
  const [standards, setStandards] = useState<UploadStandards | null>(null);
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [dailyLimit, setDailyLimit] = useState(20);
  const [guidance, setGuidance] = useState("");
  const [enabled, setEnabled] = useState<UploadTreatment[]>(["playful-stack", "gentle-arch", "classic-serif"]);
  const [defaultTreatment, setDefaultTreatment] = useState<UploadTreatment>("playful-stack");
  const [paused, setPaused] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [grantData, standardData] = await Promise.all([fetch("/api/admin/upload-access", { cache: "no-store" }), fetch("/api/admin/upload-standards", { cache: "no-store" })]);
    if (grantData.status === 401 || standardData.status === 401) throw new Error("Administrator sign-in is required.");
    if (!grantData.ok || !standardData.ok) throw new Error("Could not load upload studio settings.");
    const g = await grantData.json(); const s = await standardData.json();
    setGrants(g.grants || []); setStandards(s.standards || null);
    if (s.standards) { setGuidance(s.standards.creativeGuidance); setEnabled(s.standards.enabledTreatments); setDefaultTreatment(s.standards.defaultTreatment); setPaused(s.standards.paused); }
  }, []);

  useEffect(() => { void load().catch(e => setMessage(e.message)); }, [load]);

  const authenticate = async () => {
    let currentUser = user;
    if (!currentUser) {
      await signInWithGoogle();
      const { getFirebaseAuth } = await import("@/lib/firebase-client");
      currentUser = getFirebaseAuth().currentUser;
    }
    if (!currentUser) throw new Error("Administrator sign-in was not completed.");
    const idToken = await currentUser.getIdToken(true);
    const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    if (!response.ok) throw new Error("This account cannot administer the upload studio.");
    await load(); setMessage("Administrator access confirmed.");
  };
  const mutate = async (url: string, method: string, body: unknown) => {
    setLoading(true); setMessage("");
    try { const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not save changes."); await load(); setMessage("Saved."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not save changes."); }
    finally { setLoading(false); }
  };
  const grant = () => mutate("/api/admin/upload-access", "POST", { email, expiresAt: new Date(`${expiresAt}T23:59:59`).getTime(), dailyLimit });
  const publish = () => {
    if (!standards || !reviewConfirmed) { setMessage("Review the complete composed previews and confirm before publishing."); return; }
    void mutate("/api/admin/upload-standards", "POST", { expectedVersion: standards.version, creativeGuidance: guidance, enabledTreatments: enabled, defaultTreatment, paused, reviewConfirmed: true });
  };

  return <main className="min-h-screen bg-[#f7f5ef] text-stone-900"><header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><Link href="/admin" className="font-serif text-xl">SendMyNotes · Admin</Link><span className="text-sm text-stone-500">Upload studio</span></header><div className="mx-auto max-w-6xl space-y-8 px-5 pb-16">
    <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">Private beta controls</p><h1 className="mt-2 font-serif text-4xl">Upload studio</h1><p className="mt-2 text-stone-600">Manage invitations, generation limits, and the versioned creative standards for personal card fronts.</p></div>
    {!standards && <button onClick={() => void authenticate().catch(e => setMessage(e.message))} className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white">Sign in as administrator</button>}
    {message && <p role="status" className="rounded-xl bg-white px-4 py-3 text-sm text-stone-700">{message}</p>}
    <section className="grid gap-7 lg:grid-cols-[.85fr_1.15fr]">
      <div className="rounded-3xl border border-stone-200 bg-white p-6"><h2 className="font-serif text-2xl">Invite an account</h2><p className="mt-1 text-sm text-stone-500">The email must already belong to a verified account.</p><label className="mt-5 block text-sm">Account email<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm">Expires<input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label><label className="text-sm">Daily limit<input type="number" min={1} max={100} value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label></div><button disabled={loading || !email.includes("@")} onClick={() => void grant()} className="mt-5 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Grant private access</button>
        <h3 className="mt-8 border-t border-stone-100 pt-5 text-sm font-semibold">Current access</h3><div className="mt-3 space-y-2">{grants.map(g => <div key={g.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"><div><div className="text-sm font-medium">{g.email}</div><div className="text-xs text-stone-500">{g.revoked ? "Revoked" : `Until ${new Date(g.expiresAt).toLocaleDateString()} · ${g.dailyLimit}/day`}</div></div><button onClick={() => void mutate(`/api/admin/upload-access`, "PATCH", { uid: g.uid, revoked: !g.revoked })} className="rounded-full border border-stone-300 px-3 py-1.5 text-xs">{g.revoked ? "Restore" : "Revoke"}</button></div>)}{grants.length === 0 && <p className="text-sm text-stone-500">No grants yet.</p>}</div>
      </div>
      <div className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl">Card standards</h2><p className="mt-1 text-sm text-stone-500">Version {standards?.version ?? "—"} · changes publish as a new version</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />Pause new work</label></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Required format · locked</h3><p className="mt-2 text-sm text-emerald-950">17:22 portrait artwork, complete flat image, no mockup or frame, private source, and sender-approved cover words rendered separately. These production rules cannot be changed here.</p></div><label className="block text-sm font-semibold">Creative guidance · editable<textarea value={guidance} onChange={e => setGuidance(e.target.value)} maxLength={4000} className="mt-2 min-h-36 w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm" /></label><fieldset><legend className="text-sm font-semibold">Lettering treatments</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{(Object.keys(treatmentNames) as UploadTreatment[]).map(id => <label key={id} className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 text-sm"><input type="checkbox" checked={enabled.includes(id)} onChange={e => setEnabled(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))} />{treatmentNames[id]}</label>)}</div></fieldset><label className="block text-sm">Default treatment<select value={defaultTreatment} onChange={e => setDefaultTreatment(e.target.value as UploadTreatment)} className="ml-3 rounded-lg border border-stone-200 px-3 py-2">{enabled.map(id => <option value={id} key={id}>{treatmentNames[id]}</option>)}</select></label><label className="flex items-start gap-2 text-sm text-stone-700"><input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} className="mt-1" /><span>I reviewed the complete composed previews, including short and long words, and approve this version for the staging beta.</span></label><button onClick={publish} disabled={loading || !standards || enabled.length === 0 || !enabled.includes(defaultTreatment)} className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Publish reviewed version</button></div>
    </section></div></main>;
}
