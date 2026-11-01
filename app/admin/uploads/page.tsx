"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { UploadGrant, UploadStandards, UploadTreatment } from "@/lib/upload/contracts";

const treatmentNames: Record<UploadTreatment, string> = { "playful-stack": "Playful stack", "gentle-arch": "Gentle arch", "classic-serif": "Classic serif" };

export default function UploadAdminPage() {
  const { user, signInWithGoogle, signOut, loading: authLoading } = useAuth();
  const [authState, setAuthState] = useState<"checking" | "signed-out" | "signed-in" | "authorized" | "insufficient" | "error">("checking");
  const [adminEmail, setAdminEmail] = useState("");
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
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const clearAdminData = () => { setGrants([]); setStandards(null); };
  const load = useCallback(async () => {
    const [grantData, standardData] = await Promise.all([fetch("/api/admin/upload-access", { cache: "no-store" }), fetch("/api/admin/upload-standards", { cache: "no-store" })]);
    const [g, s] = await Promise.all([grantData.json().catch(() => ({})), standardData.json().catch(() => ({}))]);
    const failed = !grantData.ok ? { response: grantData, body: g } : !standardData.ok ? { response: standardData, body: s } : null;
    if (failed) {
      clearAdminData();
      if (failed.response.status === 401) setAuthState("signed-out");
      else if (failed.response.status === 403) setAuthState("insufficient");
      else setAuthState("error");
      throw new Error(failed.body?.error || `Upload administration could not be loaded (HTTP ${failed.response.status}).`);
    }
    setGrants(g.grants || []); setStandards(s.standards || null);
    if (s.standards) { setGuidance(s.standards.creativeGuidance); setEnabled(s.standards.enabledTreatments); setDefaultTreatment(s.standards.defaultTreatment); setPaused(s.standards.paused); }
    setAuthState("authorized");
  }, []);

  const checkAdminSession = useCallback(async () => {
    setAuthState("checking"); setMessage("");
    try {
      const response = await fetch("/api/admin/auth", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || !response.ok || data.authenticated !== true) {
        clearAdminData(); setAuthState(response.status === 403 ? "insufficient" : response.status === 401 || data.authenticated === false ? "signed-out" : "error");
        if (response.status === 403) setAdminEmail(data.email || user?.email || "");
        if (!response.ok && response.status !== 401) setMessage(data.error || `Could not check administrator access (HTTP ${response.status}).`);
        return;
      }
      setAdminEmail(data.email || ""); setAuthState("signed-in");
      await load();
    } catch (e) {
      setAuthState(current => current === "insufficient" || current === "signed-out" ? current : "error");
      setMessage(e instanceof Error ? e.message : "Could not check administrator access.");
    }
  }, [load, user?.email]);

  useEffect(() => { void checkAdminSession(); }, [checkAdminSession]);

  const authenticate = async () => {
    let currentUser = user;
    if (!currentUser) {
      await signInWithGoogle();
      const { getFirebaseAuth } = await import("@/lib/firebase-client");
      currentUser = getFirebaseAuth().currentUser;
    }
    if (!currentUser) throw new Error("Google sign-in was not completed. Try again.");
    const idToken = await currentUser.getIdToken(true);
    const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      clearAdminData();
      setAuthState(response.status === 403 ? "insufficient" : response.status === 401 ? "signed-out" : "error");
      if (response.status === 403) setAdminEmail(data.email || currentUser.email || "");
      throw new Error(data.error || `Administrator access could not be confirmed (HTTP ${response.status}).`);
    }
    setAdminEmail(data.email || currentUser.email || ""); setAuthState("signed-in");
    await load(); setMessage("Upload administration access confirmed.");
  };
  const switchAccount = async () => {
    if (switchingAccount) return;
    setSwitchingAccount(true); setMessage(""); setAdminEmail(""); setAuthState("checking"); clearAdminData();
    try {
      await signOut();
      await signInWithGoogle();
      const { getFirebaseAuth } = await import("@/lib/firebase-client");
      const nextUser = getFirebaseAuth().currentUser;
      if (!nextUser) { setAuthState("signed-out"); throw new Error("Google account switching was cancelled. Choose an account and try again."); }
      const idToken = await nextUser.getIdToken(true);
      const exchange = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const exchangeData = await exchange.json().catch(() => ({}));
      if (!exchange.ok) {
        setAdminEmail(exchangeData.email || nextUser.email || "");
        setAuthState(exchange.status === 403 ? "insufficient" : exchange.status === 401 ? "signed-out" : "error");
        throw new Error(exchangeData.error || `Administrator sign-in could not be completed (HTTP ${exchange.status}).`);
      }
      const session = await fetch("/api/admin/auth", { cache: "no-store" });
      const sessionData = await session.json().catch(() => ({}));
      if (!session.ok || sessionData.authenticated !== true) throw new Error(sessionData.error || "The new administrator session could not be verified.");
      setAdminEmail(sessionData.email || exchangeData.email || nextUser.email || ""); setAuthState("signed-in");
      await load(); setMessage("Administrator account switched and verified.");
    } catch (e) {
      setAuthState(current => current === "insufficient" || current === "signed-out" ? current : "error");
      setMessage(e instanceof Error ? e.message : "Could not switch administrator accounts.");
    } finally { setSwitchingAccount(false); }
  };
  const mutate = async (url: string, method: string, body: unknown) => {
    setLoading(true); setMessage("");
    try { const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await res.json().catch(() => ({})); if (!res.ok) { if (res.status === 401 || res.status === 403) { clearAdminData(); setAuthState(res.status === 401 ? "signed-out" : "insufficient"); } throw new Error(data.error || `Could not save changes (HTTP ${res.status}).`); } await load(); setMessage("Saved."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not save changes."); }
    finally { setLoading(false); }
  };
  const grant = () => mutate("/api/admin/upload-access", "POST", { email, expiresAt: new Date(`${expiresAt}T23:59:59`).getTime(), dailyLimit });
  const publish = () => {
    if (!standards || !reviewConfirmed) { setMessage("Review the complete composed previews and confirm before publishing."); return; }
    void mutate("/api/admin/upload-standards", "POST", { expectedVersion: standards.version, creativeGuidance: guidance, enabledTreatments: enabled, defaultTreatment, paused, reviewConfirmed: true });
  };

  return <main className="min-h-screen bg-[#f7f5ef] text-stone-900"><header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5"><Link href="/admin" className="font-serif text-lg sm:text-xl">SendMyNotes · Admin</Link><span className="text-right text-xs font-medium text-stone-500 sm:text-sm">Upload administration</span></header><div className="mx-auto max-w-6xl space-y-6 px-5 pb-16">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">Private beta controls</p><h1 className="mt-2 font-serif text-4xl">Upload administration</h1><p className="mt-2 max-w-2xl text-stone-600">Manage invitations, generation limits, and the versioned creative standards for personal card fronts.</p></div><Link href="/create/upload" className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white shadow-sm">Open upload studio</Link></div>
    <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">Grant access to the sender’s verified account email below. After a grant is active, that person signs into the regular Upload studio with the same account.</p>
    {authState === "checking" && <section role="status" className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">Checking administrator session and upload permissions…</section>}
    {authState === "signed-out" && <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="font-serif text-xl">Administrator sign-in required</h2><p className="mt-1 text-sm text-stone-600">Sign in with the authorized Google account to manage Upload studio grants and standards.</p>{message && <p role="alert" className="mt-3 text-sm text-rose-800">{message}</p>}<div className="mt-4 flex flex-wrap gap-3"><button disabled={authLoading || switchingAccount} onClick={() => void authenticate().catch(e => setMessage(e.message))} className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{authLoading ? "Checking signed-in account…" : user?.email ? `Continue as ${user.email}` : "Sign in with Google"}</button>{user && <button disabled={switchingAccount} onClick={() => void switchAccount()} className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 disabled:opacity-50">{switchingAccount ? "Switching account…" : "Switch account"}</button>}</div></section>}
    {authState === "signed-in" && <section role="status" className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">Signed in{adminEmail ? ` as ${adminEmail}` : ""}. Verifying Upload administration permission…</section>}
    {authState === "insufficient" && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-serif text-xl text-amber-950">This account can’t manage Upload studio</h2><p className="mt-1 text-sm text-amber-950">{message || `You are signed in${adminEmail ? ` as ${adminEmail}` : ""}, but this account does not have the required owner permission.`} Contact the account owner to request access. Regular Upload studio access is granted separately to each verified sender account.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/admin" className="rounded-full border border-amber-900/30 px-5 py-2.5 text-sm font-semibold text-amber-950">Return to admin dashboard</Link><button onClick={() => void checkAdminSession()} className="rounded-full border border-amber-900/30 px-5 py-2.5 text-sm font-semibold text-amber-950">Check access again</button><button disabled={switchingAccount} onClick={() => void switchAccount()} className="rounded-full bg-amber-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{switchingAccount ? "Switching account…" : "Switch account"}</button></div></section>}
    {authState === "error" && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-serif text-xl text-rose-950">Couldn’t verify Upload administration</h2><p role="alert" className="mt-1 text-sm text-rose-900">{message || "An unexpected error prevented the permission check."}</p><button onClick={() => void checkAdminSession()} className="mt-4 rounded-full border border-rose-900/30 px-5 py-2.5 text-sm font-semibold text-rose-950">Retry permission check</button></section>}
    {authState === "authorized" && !standards && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-serif text-xl text-rose-950">Upload standards aren’t available</h2><p role="alert" className="mt-1 text-sm text-rose-900">No editable controls were opened because the active standards record is missing. {message}</p><button onClick={() => void checkAdminSession()} className="mt-4 rounded-full border border-rose-900/30 px-5 py-2.5 text-sm font-semibold text-rose-950">Reload administration</button></section>}
    {authState === "authorized" && <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"><div><p className="text-sm font-semibold">Administrator session: {adminEmail || "Verified"}</p><p className="mt-0.5 text-xs text-stone-600">Current Google account for regular Upload studio: {user?.email || "Signed out"}{user?.email && adminEmail && user.email.toLowerCase() !== adminEmail.toLowerCase() ? " · This is a different account." : ""}</p></div><button disabled={switchingAccount} onClick={() => void switchAccount()} className="rounded-full border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50">{switchingAccount ? "Switching account…" : "Switch account"}</button></section>}
    {authState === "authorized" && message && <p role="status" className="rounded-xl bg-white px-4 py-3 text-sm text-stone-700">{message}</p>}
    {authState === "authorized" && standards && <section className="grid gap-7 lg:grid-cols-[.85fr_1.15fr]">
      <div className="rounded-3xl border border-stone-200 bg-white p-6"><h2 className="font-serif text-2xl">Invite an account</h2><p className="mt-1 text-sm text-stone-500">The email must already belong to a verified account.</p><label className="mt-5 block text-sm">Account email<input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="min-w-0 text-sm">Expires<input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="mt-2 block w-full min-w-0 max-w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label><label className="min-w-0 text-sm">Daily limit<input type="number" min={1} max={100} value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} className="mt-2 block w-full min-w-0 max-w-full rounded-xl border border-stone-200 px-3 py-2.5" /></label></div><button disabled={loading || !email.includes("@")} onClick={() => void grant()} className="mt-5 rounded-full bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Grant private access</button>
        <h3 className="mt-8 border-t border-stone-100 pt-5 text-sm font-semibold">Current access</h3><div className="mt-3 space-y-2">{grants.map(g => <div key={g.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"><div><div className="text-sm font-medium">{g.email}</div><div className="text-xs text-stone-500">{g.revoked ? "Revoked" : `Until ${new Date(g.expiresAt).toLocaleDateString()} · ${g.dailyLimit}/day`}</div></div><button onClick={() => void mutate(`/api/admin/upload-access`, "PATCH", { uid: g.uid, revoked: !g.revoked })} className="rounded-full border border-stone-300 px-3 py-1.5 text-xs">{g.revoked ? "Restore" : "Revoke"}</button></div>)}{grants.length === 0 && <p className="text-sm text-stone-500">No grants yet.</p>}</div>
      </div>
      <div className="space-y-5 rounded-3xl border border-stone-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl">Card standards</h2><p className="mt-1 text-sm text-stone-500">Version {standards?.version ?? "—"} · changes publish as a new version</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} />Pause new work</label></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Required format · locked</h3><p className="mt-2 text-sm text-emerald-950">17:22 portrait artwork, complete flat image, no mockup or frame, private source, and sender-approved cover words rendered separately. These production rules cannot be changed here.</p></div><label className="block text-sm font-semibold">Creative guidance · editable<textarea value={guidance} onChange={e => setGuidance(e.target.value)} maxLength={4000} className="mt-2 min-h-36 w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm" /></label><fieldset><legend className="text-sm font-semibold">Lettering treatments</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{(Object.keys(treatmentNames) as UploadTreatment[]).map(id => <label key={id} className="flex items-center gap-2 rounded-xl border border-stone-200 p-3 text-sm"><input type="checkbox" checked={enabled.includes(id)} onChange={e => setEnabled(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))} />{treatmentNames[id]}</label>)}</div></fieldset><label className="block text-sm">Default treatment<select value={defaultTreatment} onChange={e => setDefaultTreatment(e.target.value as UploadTreatment)} className="ml-3 rounded-lg border border-stone-200 px-3 py-2">{enabled.map(id => <option value={id} key={id}>{treatmentNames[id]}</option>)}</select></label><label className="flex items-start gap-2 text-sm text-stone-700"><input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} className="mt-1" /><span>I reviewed the complete composed previews, including short and long words, and approve this version for the staging beta.</span></label><button onClick={publish} disabled={loading || !standards || enabled.length === 0 || !enabled.includes(defaultTreatment)} className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Publish reviewed version</button></div>
    </section>}
  </div></main>;
}
