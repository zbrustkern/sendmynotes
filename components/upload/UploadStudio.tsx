"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { UploadAccess, UploadSelection, UploadTreatment } from "@/lib/upload/contracts";

const treatments: { id: UploadTreatment; label: string; sample: string }[] = [
  { id: "playful-stack", label: "Playful stack", sample: "Thank\nYou" },
  { id: "gentle-arch", label: "Gentle arch", sample: "Thank You" },
  { id: "classic-serif", label: "Classic serif", sample: "Thank You" },
];

export function UploadStudio() {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<UploadAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [status, setStatus] = useState("");
  const [exactText, setExactText] = useState("Thank You");
  const [treatment, setTreatment] = useState<UploadTreatment>("playful-stack");
  const [designId, setDesignId] = useState("");
  const [designRevision, setDesignRevision] = useState(1);
  const [designHash, setDesignHash] = useState("");
  const [selection, setSelection] = useState<UploadSelection | null>(null);
  const [preview, setPreview] = useState("");
  const exactTextGraphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(exactText)].length;
  const exactTextLineCount = exactText.split(/\r?\n/).length;
  const letteringValid = exactTextGraphemes <= 40 && exactTextLineCount <= 3;
  const objectUrl = useRef("");
  const userUid = user?.uid || "";
  const latestUid = useRef(userUid);
  latestUid.current = userUid;

  const api = useCallback(async (url: string, init: RequestInit = {}) => {
    if (!user) throw new Error("Sign in to use your private studio.");
    const requestUser = user;
    const token = await requestUser.getIdToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    if (latestUid.current !== requestUser.uid) throw new Error("Your account changed. Reopen the studio to continue.");
    const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || "We couldn’t complete that step. Please try again.");
    return data;
  }, [user]);

  const refreshPreview = useCallback(async (kind: "asset" | "generation" | "design", id: string) => {
    if (!user) return;
    const requestUser = user;
    const token = await requestUser.getIdToken();
    const response = await fetch(`/api/upload/previews/${kind}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (latestUid.current !== requestUser.uid) throw new Error("Your account changed. Reopen the studio to continue.");
    if (!response.ok) throw new Error("This private preview is no longer available.");
    const next = URL.createObjectURL(await response.blob());
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = next;
    setPreview(next);
  }, [user]);

  useEffect(() => {
    setAssetId(""); setGenerationId(""); setStatus(""); setDesignId(""); setSelection(null); setFile(null); setPreview(""); setError("");
    if (!user) { setAccess(null); return; }
    let active = true;
    void api("/api/upload/access").then((data) => { if (active) { setAccess(data); try { const saved = sessionStorage.getItem(`smn_upload_pending_${user.uid}`); if (saved) { const pending = JSON.parse(saved); if (pending.uid === user.uid) { setAssetId(pending.assetId); setPrompt(pending.prompt); setGenerationId(pending.generationId || ""); setStatus(pending.status === "pending" && !pending.generationId ? "retryable" : pending.status || ""); if (pending.generationId && pending.status === "ready") void refreshPreview("generation", pending.generationId); else void refreshPreview("asset", pending.assetId); } } } catch { setError("This browser could not restore the private studio session. Please upload your image again."); } } }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, [api, userUid]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  const upload = () => act(async () => {
    if (!file) throw new Error("Choose a JPEG, PNG, or WebP image first.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image under 15 MB.");
    const data = await api("/api/upload/assets", { method: "POST", body: (() => { const form = new FormData(); form.append("file", file); return form; })() });
    setAssetId(data.asset.id); setGenerationId(""); setStatus(""); clearDesign();
    if (user) try { sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId: data.asset.id, prompt, key: "", status: "" })); } catch { /* session persistence is optional */ }
    await refreshPreview("asset", data.asset.id);
  });

  const generate = () => act(async () => {
    if (!assetId) throw new Error("Upload your image first.");
    const saved = user ? sessionStorage.getItem(`smn_upload_pending_${user.uid}`) : null;
    const prior = saved ? JSON.parse(saved) : null;
    const key = prior?.uid === user?.uid && prior?.assetId === assetId && prior?.prompt === prompt && prior?.status === "pending" && !prior?.generationId && prior?.key ? prior.key : crypto.randomUUID();
    clearDesign(); setStatus("pending");
    if (user) sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId, prompt, key, status: "pending" }));
    let data;
    try { data = await api("/api/upload/generations", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ assetId, imagePrompt: prompt }) }); } catch (error) { setStatus("retryable"); throw error; }
    setGenerationId(data.generation.id); setStatus(data.generation.status);
    if (user) sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId, prompt, key, generationId: data.generation.id, status: data.generation.status }));
    await refreshAccess();
    if (data.generation.status === "ready") await refreshPreview("generation", data.generation.id);
  });

  const refreshAccess = async () => { const data = await api("/api/upload/access"); setAccess(data); };
  const clearDesign = () => { setDesignId(""); setDesignHash(""); setSelection(null); };

  useEffect(() => {
    if (!generationId || status === "ready" || status === "failed" || status === "unresolved") return;
    const timer = window.setInterval(() => {
      void api(`/api/upload/generations/${encodeURIComponent(generationId)}`).then(async data => {
        setStatus(data.generation.status);
        if (["ready", "failed", "unresolved"].includes(data.generation.status)) await refreshAccess();
        if (data.generation.status === "ready") await refreshPreview("generation", generationId);
        if (["ready", "failed", "unresolved"].includes(data.generation.status)) window.clearInterval(timer);
      }).catch(e => { setError(e.message); window.clearInterval(timer); });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [api, generationId, status, refreshPreview, user]);

  const compose = () => act(async () => {
    if (!generationId || status !== "ready") throw new Error("Wait for your illustration to finish first.");
    const data = await api("/api/upload/compositions", { method: "POST", body: JSON.stringify({ generationId, exactText, treatmentId: treatment }) });
    setDesignId(data.design.designId); setDesignRevision(data.design.revision); setDesignHash(data.design.masterSha256); setSelection(null); await refreshPreview("design", data.design.designId);
  });

  const accept = () => act(async () => {
    const data = await api(`/api/upload/designs/${encodeURIComponent(designId)}/accept`, { method: "POST", body: JSON.stringify({ revision: designRevision, masterSha256: designHash }) });
    setSelection(data.selection);
  });

  const continueToNote = () => {
    if (!selection) return;
    try { sessionStorage.setItem("smn_upload_selection_v1", JSON.stringify(selection)); } catch { /* authenticated handoff remains in URL */ }
    router.push(`/new?uploadDesign=${encodeURIComponent(selection.designId)}`);
  };

  return <main className="min-h-screen bg-[#f7f5ef] text-stone-900">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><Link href="/" className="font-serif text-xl tracking-tight">SendMyNotes</Link><Link href="/new" className="text-sm text-stone-600 hover:text-stone-950">Back to card designs</Link></header>
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-5">
      <div className="mb-8 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-800">Your private card studio</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Make it personal from the very front.</h1><p className="mt-3 text-stone-600">Start with a photo, shape a little illustration, then add the words you want printed on the cover.</p></div>
      {authLoading || (user && !access) ? <div className="rounded-3xl bg-white p-8 text-stone-600">Checking your studio access…</div> : !user ? <section className="max-w-xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm"><h2 className="font-serif text-2xl">Sign in to open your studio</h2><p className="mt-2 text-sm text-stone-600">Upload access is private to invited accounts. Your image stays out of the public card gallery.</p><button onClick={() => void signInWithGoogle()} className="mt-6 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white">Sign in with Google</button></section> : !access?.allowed ? <section className="max-w-xl rounded-3xl border border-stone-200 bg-white p-8"><h2 className="font-serif text-2xl">Studio access isn’t available</h2><p className="mt-2 text-stone-600">{access?.paused ? "The studio is taking a short pause. You can still choose a card and send a note." : "This account doesn’t have an active studio invitation. You can still choose a card and send a note."}</p><Link href="/new" className="mt-6 inline-flex rounded-full bg-stone-900 px-6 py-3 text-sm text-white">Choose a card</Link></section> : <div className="grid gap-7 lg:grid-cols-[1fr_1.05fr]">
        <section className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="block"><span className="text-sm font-semibold">1. Choose a personal image</span><span className="mt-1 block text-xs text-stone-500">JPEG, PNG or WebP · up to 15 MB. It remains private to your account.</span><input className="mt-3 block w-full rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:text-white" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0] || null); setAssetId(""); setGenerationId(""); setStatus(""); clearDesign(); if (user) sessionStorage.removeItem(`smn_upload_pending_${user.uid}`); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; setPreview(""); }} /></label>
          <button onClick={() => void upload()} disabled={busy || !file} className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium disabled:opacity-40">{busy && !assetId ? "Saving privately…" : "Upload image"}</button>
          <label className="block"><span className="text-sm font-semibold">2. Describe the illustration</span><textarea disabled={busy} value={prompt} maxLength={1000} onChange={e => { setPrompt(e.target.value); clearDesign(); }} placeholder="Keep the little garden and warm evening colors; make it feel like a loose watercolor illustration." className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm outline-none focus:border-emerald-800" /><span className="mt-1 block text-xs text-stone-500">The image is used as a visual reference. Don’t include private details you don’t want transformed.</span></label>
          <button onClick={() => void generate()} disabled={busy || status === "pending" || status === "unresolved" || !assetId || !access.allowed || access.paused || access.used >= access.dailyLimit} className="w-full rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{status === "pending" ? "Creating your illustration…" : status === "retryable" ? "Retry saved request" : "Create illustration"}</button>
          <div className="text-xs text-stone-500">{Math.max(0, access.dailyLimit - access.used)} generations remaining today · access expires {access.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : "as scheduled"}</div>
          {assetId && <button type="button" onClick={() => void act(async () => { await api(`/api/upload/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" }); setAssetId(""); setGenerationId(""); setStatus(""); clearDesign(); if (user) sessionStorage.removeItem(`smn_upload_pending_${user.uid}`); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ""; setPreview(""); setFile(null); })} className="text-xs text-stone-500 underline">Delete image and unused artwork</button>}
          {status === "failed" && <p role="alert" className="text-sm text-rose-700">We couldn’t create artwork from this image and request. Edit the prompt or try another image.</p>}
          {status === "unresolved" && <p role="alert" className="text-sm text-amber-800">This request needs to be resolved before it can be retried. Your image and prompt are still here.</p>}
          {generationId && status === "ready" && <div className="space-y-4 border-t border-stone-100 pt-5"><h2 className="text-sm font-semibold">3. Add your exact cover words <span className="font-normal text-stone-500">(optional)</span></h2><label htmlFor="upload-exact-cover-words" className="sr-only">Exact cover words</label><textarea id="upload-exact-cover-words" aria-describedby="upload-cover-words-help" disabled={busy} value={exactText} onChange={e => { setExactText(e.target.value); clearDesign(); }} maxLength={160} rows={2} placeholder="Thank You" className="w-full resize-y rounded-xl border border-stone-200 px-4 py-3 text-sm" /><p id="upload-cover-words-help" className={`text-xs ${letteringValid ? "text-stone-500" : "text-rose-700"}`}>Optional · up to 40 characters across 3 lines · {exactTextGraphemes}/40</p><div className="grid grid-cols-3 gap-2">{treatments.filter(t => access.standards.enabledTreatments.includes(t.id)).map(t => <button type="button" disabled={busy} key={t.id} onClick={() => { setTreatment(t.id); clearDesign(); }} aria-pressed={treatment === t.id} className={`rounded-xl border p-3 text-left ${treatment === t.id ? "border-emerald-800 bg-emerald-50" : "border-stone-200"}`}><span className="block whitespace-pre-line font-serif text-lg">{t.sample}</span><span className="mt-2 block text-xs">{t.label}</span></button>)}</div><button onClick={() => void compose()} disabled={busy || !letteringValid} className="w-full rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold">{busy ? "Composing…" : "Preview this cover"}</button></div>}
          {designId && <div className="space-y-3 border-t border-stone-100 pt-5"><p className="text-sm font-semibold">Review the complete front</p>{selection ? <button onClick={continueToNote} className="w-full rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white">Accept & write my note</button> : <button onClick={() => void accept()} disabled={busy} className="w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white">Accept this cover</button>}</div>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        </section>
        <section className="flex min-h-[460px] items-center justify-center rounded-[2rem] bg-[#e9e6dd] p-6 sm:p-10"><div className="w-full max-w-[365px] overflow-hidden rounded-2xl bg-white shadow-[0_22px_55px_rgba(40,35,25,.16)]"><div className="relative aspect-[17/22] bg-[#f5f0e5]">{preview ? <img src={preview} alt={designId ? "Private card front preview" : "Private image or illustration preview"} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center p-8 text-center text-stone-400"><span className="font-serif text-5xl">✳</span><span className="mt-4 text-sm">Your card front appears here</span><span className="mt-1 text-xs">A 17:22 portrait preview</span></div>}</div><div className="flex items-center justify-between px-4 py-3 text-xs text-stone-500"><span>{designId ? "Complete cover" : "Private preview"}</span><span>A2 folded · portrait</span></div></div></section>
      </div>}
    </div>
  </main>;
}
