"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { UploadAccess, UploadSelection, UploadTreatment } from "@/lib/upload/contracts";
import { STARTER_LETTERING, beginStudioGeneration, heicGuidance, promptRequestsText, studioCancelDestination } from "@/lib/upload/studio-guidance";

const treatments: { id: UploadTreatment; label: string; sample: string }[] = [
  { id: "playful-stack", label: "Playful stack", sample: "Thank\nYou" },
  { id: "gentle-arch", label: "Gentle arch", sample: "Thank You" },
  { id: "classic-serif", label: "Classic serif", sample: "Thank You" },
];
type Version = { designId: string; generationId: string; assetId: string; revision: number; masterSha256: string; prompt: string; exactText: string; treatmentId: UploadTreatment; createdAt: number; expiresAt: number; accepted: boolean };
type EditContext = Version & { sessionId: string };
type CompareMode = "original" | "result";

export function UploadStudio() {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editDesignQuery = searchParams.get("editDesign") || "";
  const returnToQuery = searchParams.get("returnTo");
  const libraryAssetQuery = searchParams.get("asset") || "";
  const editMode = Boolean(editDesignQuery);
  const [access, setAccess] = useState<UploadAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [status, setStatus] = useState("");
  const [exactText, setExactText] = useState("");
  const [treatment, setTreatment] = useState<UploadTreatment>("playful-stack");
  const [designId, setDesignId] = useState("");
  const [designRevision, setDesignRevision] = useState(1);
  const [designHash, setDesignHash] = useState("");
  const [selection, setSelection] = useState<UploadSelection | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [conflictResolved, setConflictResolved] = useState(false);
  const [librarySaveMessage, setLibrarySaveMessage] = useState("");
  const [librarySaveKey, setLibrarySaveKey] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewKind, setPreviewKind] = useState<"asset" | "generation" | "design">("asset");
  const [compareMode, setCompareMode] = useState<CompareMode>("result");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(true);
  const exactTextInput = useRef<HTMLTextAreaElement>(null);
  const objectUrl = useRef("");
  const previewRequest = useRef(0);
  const latestUid = useRef(user?.uid || "");
  latestUid.current = user?.uid || "";
  const exactTextGraphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(exactText)].length;
  const exactTextLineCount = exactText.split(/\r?\n/).length;
  const letteringValid = exactTextGraphemes <= 40 && exactTextLineCount <= 3;
  const promptConflict = promptRequestsText(prompt);
  const savedVersion = versions.find(item => item.designId === selectedVersionId);
  const hasChangedArtwork = Boolean(savedVersion && (savedVersion.exactText !== exactText || savedVersion.treatmentId !== treatment || savedVersion.prompt !== prompt));

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

  const loadPreview = useCallback(async (kind: "asset" | "generation" | "design", id: string) => {
    if (!user || !id) throw new Error("This private preview is no longer available.");
    const requestUser = user;
    const requestId = ++previewRequest.current;
    const token = await requestUser.getIdToken();
    const response = await fetch(`/api/upload/previews/${kind}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (latestUid.current !== requestUser.uid || requestId !== previewRequest.current) throw new Error("Your studio selection changed. Reopen the preview to continue.");
    if (!response.ok) throw new Error("This private preview is no longer available. Save the source image before it expires.");
    const blob = await response.blob();
    if (latestUid.current !== requestUser.uid || requestId !== previewRequest.current) throw new Error("Your studio selection changed. Reopen the preview to continue.");
    const next = URL.createObjectURL(blob);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = next;
    setPreviewUrl(next);
    setPreviewKind(kind);
  }, [user]);

  const refreshVersions = useCallback(async (id: string) => {
    const data = await api(`/api/upload/studio/versions?assetId=${encodeURIComponent(id)}`);
    setVersions(Array.isArray(data.versions) ? data.versions : []);
    if (data.selectedDesignId) setSelectedVersionId(data.selectedDesignId);
    return data;
  }, [api]);

  const showEdit = useCallback(async (id: string) => {
    const data = await api(`/api/upload/designs/${encodeURIComponent(id)}/edit`);
    const edit = data.edit as EditContext;
    setAssetId(edit.assetId); setGenerationId(edit.generationId); setStatus("ready");
    setPrompt(edit.prompt); setExactText(edit.exactText); setTreatment(edit.treatmentId);
    setDesignId(edit.designId); setDesignRevision(edit.revision); setDesignHash(edit.masterSha256);
    setSelectedVersionId(edit.designId); setConflictResolved(false);
    await Promise.all([loadPreview("design", edit.designId), refreshVersions(edit.assetId)]);
    // The tray pointer may reflect a previously cancelled edit attempt. The
    // builder's active accepted front is the authority when opening Edit again.
    setSelectedVersionId(edit.designId); setDesignId(edit.designId);
  }, [api, loadPreview, refreshVersions]);

  useEffect(() => {
    setAccess(null); setBusy(false); setAssetId(""); setGenerationId(""); setStatus(""); setDesignId(""); setSelection(null);
    previewRequest.current++;
    setVersions([]); setSelectedVersionId(""); setFile(null); setPreviewUrl(""); setError("");
    if (!user) return;
    let active = true;
    void api("/api/upload/access").then(async data => {
      if (!active) return;
      setAccess(data);
      if (editDesignQuery) {
        try { await showEdit(editDesignQuery); } catch (e) { if (active) setError(e instanceof Error ? e.message : "This front could not be reopened for editing."); }
        return;
      }
      const savedAsset = libraryAssetQuery || (() => {
        try {
          const raw = sessionStorage.getItem(`smn_upload_pending_${user.uid}`);
          const saved = raw ? JSON.parse(raw) : null;
          return saved?.uid === user.uid ? saved.assetId || "" : "";
        } catch { return ""; }
      })();
      if (!savedAsset) return;
      setAssetId(savedAsset);
      try {
        const raw = sessionStorage.getItem(`smn_upload_pending_${user.uid}`);
        const pending = raw ? JSON.parse(raw) : null;
        if (pending?.uid === user.uid && pending.assetId === savedAsset) {
          setPrompt(pending.prompt || ""); setGenerationId(pending.generationId || "");
          setStatus(pending.status === "pending" && !pending.generationId ? "retryable" : pending.status || "");
        }
        await refreshVersions(savedAsset);
        const current = pending?.generationId && pending?.status === "ready" ? pending.generationId : savedAsset;
        await loadPreview(pending?.generationId && pending?.status === "ready" ? "generation" : "asset", current);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "This private studio session could not be restored."); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, [api, user?.uid, editDesignQuery, libraryAssetQuery, showEdit, refreshVersions, loadPreview]);

  const act = async (work: () => Promise<void>) => {
    const requestUid = user?.uid || "";
    setBusy(true); setError("");
    try { await work(); } catch (e) { if (latestUid.current === requestUid) setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { if (latestUid.current === requestUid) setBusy(false); }
  };

  const upload = () => act(async () => {
    if (!file) throw new Error("Choose a JPEG, PNG, or WebP image first.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image under 15 MB.");
    const data = await api("/api/upload/assets", { method: "POST", body: (() => { const form = new FormData(); form.append("file", file); return form; })() });
    setAssetId(data.asset.id); setGenerationId(""); setStatus(""); setDesignId(""); setSelection(null);
    if (user) try { sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId: data.asset.id, prompt, key: "", status: "" })); } catch { /* session persistence is optional */ }
    await loadPreview("asset", data.asset.id);
    await refreshVersions(data.asset.id);
  });

  const generate = () => act(async () => {
    if (!assetId) throw new Error("Upload or reopen a saved source image first.");
    if (promptConflict && !conflictResolved) throw new Error("Confirm whether your cover words belong in Exact Lettering before creating an illustration.");
    const raw = user ? sessionStorage.getItem(`smn_upload_pending_${user.uid}`) : null;
    const prior = raw ? JSON.parse(raw) : null;
    const key = prior?.uid === user?.uid && prior?.assetId === assetId && prior?.prompt === prompt && prior?.status === "pending" && !prior?.generationId && prior?.key ? prior.key : crypto.randomUUID();
    // Keep the current accepted version visible while exploring another
    // candidate. Only composing changed artwork clears that version's
    // acceptance; a failed or unresolved generation must not strand it.
    const started = beginStudioGeneration({ status, generationId, designId, selectedVersionId, selection });
    setStatus(started.status); setGenerationId(started.generationId);
    if (user) sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId, prompt, key, status: "pending" }));
    let data;
    try { data = await api("/api/upload/generations", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ assetId, imagePrompt: prompt }) }); }
    catch (e) { if (latestUid.current === user?.uid) setStatus("retryable"); throw e; }
    setGenerationId(data.generation.id); setStatus(data.generation.status);
    if (user) sessionStorage.setItem(`smn_upload_pending_${user.uid}`, JSON.stringify({ uid: user.uid, assetId, prompt, key, generationId: data.generation.id, status: data.generation.status }));
    await refreshAccess();
    if (data.generation.status === "ready") { await loadPreview("generation", data.generation.id); setCompareMode("result"); }
  });

  const refreshAccess = async () => { const data = await api("/api/upload/access"); setAccess(data); };
  const clearSelectionForChange = () => setSelection(null);

  useEffect(() => {
    if (!generationId || status === "ready" || status === "failed" || status === "unresolved") return;
    const pollUid = user?.uid || "";
    const timer = window.setInterval(() => {
      void api(`/api/upload/generations/${encodeURIComponent(generationId)}`).then(async data => {
        setStatus(data.generation.status);
        if (["ready", "failed", "unresolved"].includes(data.generation.status)) await refreshAccess();
        if (data.generation.status === "ready") { await loadPreview("generation", generationId); setCompareMode("result"); }
        if (["ready", "failed", "unresolved"].includes(data.generation.status)) window.clearInterval(timer);
      }).catch(e => { if (latestUid.current === pollUid) setError(e.message); window.clearInterval(timer); });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [api, generationId, status, loadPreview, user]);

  const compose = () => act(async () => {
    if (!generationId || status !== "ready") throw new Error("Wait for your illustration to finish first.");
    if (promptConflict && !conflictResolved) throw new Error("Confirm whether your cover words belong in Exact Lettering before composing the front.");
    const data = await api("/api/upload/compositions", { method: "POST", body: JSON.stringify({ generationId, exactText, treatmentId: treatment }) });
    setDesignId(data.design.designId); setDesignRevision(data.design.revision); setDesignHash(data.design.masterSha256);
    setSelectedVersionId(data.design.designId); setSelection(null); setCompareMode("result");
    await loadPreview("design", data.design.designId);
    await refreshVersions(assetId);
  });

  const chooseVersion = (version: Version) => act(async () => {
    await api("/api/upload/studio/versions", { method: "POST", body: JSON.stringify({ assetId: version.assetId, designId: version.designId }) });
    setSelectedVersionId(version.designId); setDesignId(version.designId); setDesignRevision(version.revision); setDesignHash(version.masterSha256);
    setPrompt(version.prompt); setExactText(version.exactText); setTreatment(version.treatmentId); setConflictResolved(false);
    await loadPreview("design", version.designId); setCompareMode("result");
    try {
      const data = await api(`/api/upload/designs/${encodeURIComponent(version.designId)}`);
      setSelection(data.selection || null);
    } catch { setSelection(null); }
  });

  const accept = () => act(async () => {
    if (!designId) throw new Error("Choose a complete cover to review.");
    const data = await api(`/api/upload/designs/${encodeURIComponent(designId)}/accept`, { method: "POST", body: JSON.stringify({ revision: designRevision, masterSha256: designHash }) });
    setSelection(data.selection);
    setVersions(current => current.map(version => version.designId === designId ? { ...version, accepted: true } : version));
  });

  const saveToLibrary = (kind: "source" | "front") => act(async () => {
    if (!user || !assetId) throw new Error("Sign in and choose an image before saving it.");
    if (kind === "front" && !selection) throw new Error("Accept this front before saving it.");
    const key = librarySaveKey || crypto.randomUUID(); if (!librarySaveKey) setLibrarySaveKey(key);
    setLibrarySaveMessage("");
    const result = await api("/api/account/images", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(kind === "source" ? { sourceAssetId: assetId, title: file?.name?.replace(/\.[^.]+$/, "") || "Saved source image" } : { uploadSelection: selection, title: "Saved card front" }) });
    setLibrarySaveMessage(kind === "source" ? "Source saved for later. It stays in your account until you remove it." : "Card front saved. It is ready to reuse from Saved images.");
    setLibrarySaveKey("");
    return result;
  });

  const continueToNote = () => {
    if (!selection || !designId) return;
    try { sessionStorage.setItem("smn_upload_selection_v1", JSON.stringify(selection)); } catch { /* authenticated handoff remains in URL */ }
    const query = new URLSearchParams({ uploadDesign: selection.designId });
    if (editMode) query.set("uploadEdit", "1");
    router.push(`/new?${query.toString()}`);
  };
  const cancelEdit = () => {
    if (editMode) {
      const returnToBuilder = () => {
        if (studioCancelDestination(returnToQuery, document.referrer, window.location.origin) === "back") router.back();
        else router.push("/new");
      };
      if (!user || !assetId || !editDesignQuery) { returnToBuilder(); return; }
      // Restore the session's tray pointer too; cancellation leaves the
      // builder's previously accepted design as the current choice.
      void api("/api/upload/studio/versions", { method: "POST", body: JSON.stringify({ assetId, designId: editDesignQuery }) })
        .catch(() => undefined).finally(returnToBuilder);
      return;
    }
    router.push("/new");
  };
  const selectFile = (next: File | null, input: HTMLInputElement) => {
    if (!next) return;
    if (heicGuidance(next.name, next.type)) {
      setError("This version accepts JPEG, PNG, or WebP. Export this photo as JPEG from Photos or choose a compatible copy; changing Camera settings affects future photos only.");
      input.value = "";
      return;
    }
    setError(""); setFile(next);
  };
  const chooseStarter = (value: string) => {
    if (exactText && exactText !== value && !window.confirm("Replace the exact cover words with this starter?")) return;
    setExactText(value); setSelection(null); setConflictResolved(false);
  };
  const previewSource = compareMode === "original" ? "Original photo" : previewKind === "design" ? "Selected card front" : previewKind === "generation" ? "Illustration result" : "Private image";
  const previewPanel = (compact = false) => <div className={compact ? "mx-auto w-full max-w-[150px]" : "w-full max-w-[365px]"}>
    <div className="relative aspect-[17/22] overflow-hidden rounded-2xl bg-[#f5f0e5] shadow-[0_22px_55px_rgba(40,35,25,.16)]">
      {previewUrl ? <img src={previewUrl} alt={compareMode === "original" ? "Original private source image, shown without the final card crop" : "Private 17 by 22 card front preview"} className={compareMode === "original" ? "h-full w-full object-contain" : "h-full w-full object-cover"} /> : <div className="flex h-full flex-col items-center justify-center p-5 text-center text-stone-400"><span className="font-serif text-4xl">✳</span><span className="mt-2 text-sm">Your card front appears here</span><span className="mt-1 text-xs">A 17:22 portrait preview</span></div>}
    </div>
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-stone-500"><span>{previewSource}</span><span>A2 · 17:22</span></div>
  </div>;

  return <main className="min-h-screen bg-[#f7f5ef] text-stone-900">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><Link href="/" className="font-serif text-xl tracking-tight">SendMyNotes</Link><button type="button" onClick={cancelEdit} className="text-sm text-stone-600 hover:text-stone-950">{editMode ? "Cancel and return to card" : "Back to card designs"}</button></header>
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-3">
      <div className="mb-5 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-emerald-800">Your private card studio</p><h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">{editMode ? "Edit your card front." : "Make it personal from the very front."}</h1><p className="mt-3 text-stone-600">Start with a photo, shape a little illustration, then add the words you want printed on the cover.</p></div>
      {authLoading || (user && !access) ? <div className="rounded-3xl bg-white p-8 text-stone-600">Checking your studio access…</div> : !user ? <section className="max-w-xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm"><h2 className="font-serif text-2xl">Sign in to open your studio</h2><p className="mt-2 text-sm text-stone-600">Upload access is private to invited accounts. Your image stays out of the public card gallery.</p><button onClick={() => void signInWithGoogle()} className="mt-6 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white">Sign in with Google</button></section> : !access?.allowed ? <section className="max-w-xl rounded-3xl border border-stone-200 bg-white p-8"><h2 className="font-serif text-2xl">Studio access isn’t available</h2><p className="mt-2 text-stone-600">{access?.paused ? "The studio is taking a short pause. Your current card remains available when you return." : "This account doesn’t have an active studio invitation. Your current card remains unchanged."}</p><Link href="/new" className="mt-6 inline-flex rounded-full bg-stone-900 px-6 py-3 text-sm text-white">Return to your card</Link></section> : <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
        <div className="lg:hidden sticky top-0 z-20 -mx-5 border-b border-stone-200 bg-[#f7f5ef]/95 px-5 py-2 backdrop-blur" style={{ paddingTop: "max(.5rem, env(safe-area-inset-top))" }}>
          <button type="button" aria-expanded={mobilePreviewOpen} onClick={() => setMobilePreviewOpen(value => !value)} className="mb-2 text-xs font-semibold text-stone-700">{mobilePreviewOpen ? "Hide preview" : "Show card preview"} · {previewSource}</button>
          {mobilePreviewOpen && <div className="flex items-center gap-3">{previewPanel(true)}<div className="flex flex-col gap-2"><button type="button" aria-pressed={compareMode === "result"} onClick={() => { setCompareMode("result"); if (selectedVersionId) void loadPreview("design", selectedVersionId); else if (generationId && status === "ready") void loadPreview("generation", generationId); }} className="rounded-full border px-3 py-2 text-xs">Result</button><button type="button" aria-pressed={compareMode === "original"} onClick={() => { setCompareMode("original"); if (assetId) void loadPreview("asset", assetId); }} className="rounded-full border px-3 py-2 text-xs">Original</button></div></div>}
        </div>
        <section className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="block"><span className="text-sm font-semibold">1. Choose a personal image</span><span className="mt-1 block text-xs text-stone-500">JPEG, PNG or WebP · up to 15 MB. It remains private to your account.</span><input className="mt-3 block w-full rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-900 file:px-4 file:py-2 file:text-white" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e => selectFile(e.target.files?.[0] || null, e.currentTarget)} /></label>
          <button onClick={() => void upload()} disabled={busy || !file} className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium disabled:opacity-40">{busy && !assetId ? "Saving privately…" : "Upload image"}</button>
          <label className="block"><span className="text-sm font-semibold">2. Describe the illustration</span><textarea disabled={busy} value={prompt} maxLength={1000} onChange={e => { setPrompt(e.target.value); clearSelectionForChange(); setConflictResolved(false); }} placeholder="Keep the little garden and warm evening colors; make it feel like a loose watercolor illustration." className="mt-2 min-h-28 w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm outline-none focus:border-emerald-800" /><span className="mt-1 block text-xs text-stone-500">The image is used as a visual reference. Don’t include private details you don’t want transformed.</span></label>
          {promptConflict && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p>It sounds like you may want words on the cover. For crisp printed words, use Exact Lettering below. We won’t change your prompt.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} aria-pressed={conflictResolved} aria-controls="upload-exact-cover-words" onClick={() => { setConflictResolved(true); exactTextInput.current?.focus({ preventScroll: true }); exactTextInput.current?.scrollIntoView({ block: "center" }); }} className="rounded-full border border-amber-800 px-3 py-2 text-xs">Use Exact Lettering for cover words</button><span className="self-center text-xs">or edit the illustration prompt yourself</span></div>{!conflictResolved && <p className="mt-2 text-xs">Choose how to handle possible cover words before continuing.</p>}</div>}
          <button onClick={() => void generate()} disabled={busy || status === "pending" || status === "unresolved" || !assetId || !access.allowed || access.paused || access.used >= access.dailyLimit || promptConflict && !conflictResolved} className="w-full rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{status === "pending" ? "Creating your illustration…" : status === "retryable" ? "Retry saved request" : "Create illustration"}</button>
          <div className="text-xs text-stone-500">{Math.max(0, access.dailyLimit - access.used)} generations remaining today · access expires {access.expiresAt ? new Date(access.expiresAt).toLocaleDateString() : "as scheduled"}</div>
          <div className="space-y-4 border-t border-stone-100 pt-5"><h2 className="text-sm font-semibold">3. Add your exact cover words <span className="font-normal text-stone-500">(optional)</span></h2><label htmlFor="upload-exact-cover-words" className="sr-only">Exact cover words</label><textarea ref={exactTextInput} id="upload-exact-cover-words" aria-describedby="upload-cover-words-help" disabled={busy} value={exactText} onChange={e => { setExactText(e.target.value); clearSelectionForChange(); }} maxLength={160} rows={2} placeholder="Write your own, or leave blank" className="w-full resize-y rounded-xl border border-stone-200 px-4 py-3 text-sm" /><p id="upload-cover-words-help" className={`text-xs ${letteringValid ? "text-stone-500" : "text-rose-700"}`}>Optional · up to 40 characters across 3 lines · {exactTextGraphemes}/40. Blank keeps the illustration without printed words.</p><div className="flex flex-wrap gap-2" aria-label="Starter cover words">{STARTER_LETTERING.map(value => <button key={value} type="button" disabled={busy} onClick={() => chooseStarter(value)} className="rounded-full border border-stone-300 px-3 py-2 text-xs">{value}</button>)}</div><div className="grid grid-cols-3 gap-2">{treatments.filter(t => access.standards.enabledTreatments.includes(t.id)).map(t => <button type="button" disabled={busy} key={t.id} onClick={() => { setTreatment(t.id); clearSelectionForChange(); }} aria-pressed={treatment === t.id} className={`rounded-xl border p-3 text-left ${treatment === t.id ? "border-emerald-800 bg-emerald-50" : "border-stone-200"}`}><span className="block whitespace-pre-line font-serif text-lg">{t.sample}</span><span className="mt-2 block text-xs">{t.label}</span></button>)}</div>{(!generationId || status !== "ready") && <p className="text-xs text-stone-500">You can enter your cover words now. Create an illustration above before previewing the complete cover.</p>}<button onClick={() => void compose()} disabled={busy || !generationId || status !== "ready" || !letteringValid || promptConflict && !conflictResolved} className="w-full rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold">{busy && generationId && status === "ready" ? "Composing…" : "Preview this cover"}</button></div>
          {versions.length > 0 && <section aria-label="Saved private versions" className="space-y-3 border-t border-stone-100 pt-5"><div><h2 className="text-sm font-semibold">Your recent versions</h2><p className="text-xs text-stone-500">Up to three successful fronts for this private source. Switching versions does not create another image.</p></div><div className="grid grid-cols-3 gap-2">{versions.map((version, index) => <button key={version.designId} type="button" aria-pressed={selectedVersionId === version.designId} disabled={busy} onClick={() => void chooseVersion(version)} className={`rounded-xl border p-3 text-left ${selectedVersionId === version.designId ? "border-emerald-800 bg-emerald-50" : "border-stone-200"}`}><span className="block text-xs font-semibold">Version {index + 1}</span><span className="mt-1 block truncate text-xs">{version.exactText || "No lettering"}</span><span className="mt-1 block text-[10px] text-stone-500">{version.accepted ? "Accepted before" : "Needs review"}</span></button>)}</div></section>}
          {designId && <div className="space-y-3 border-t border-stone-100 pt-5"><p className="text-sm font-semibold">{selection && !hasChangedArtwork ? "Accepted front" : "Review the complete front"}</p>{selection && !hasChangedArtwork ? <><button onClick={continueToNote} disabled={busy} className="w-full rounded-full bg-emerald-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{editMode ? "Use this updated front" : "Accept & write my note"}</button><button type="button" onClick={() => void saveToLibrary("front")} disabled={busy} className="w-full rounded-full border border-stone-300 px-6 py-3 text-sm font-medium">Save this card front to my images</button></> : <button onClick={() => void accept()} disabled={busy || hasChangedArtwork} className="w-full rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white">Accept this cover</button>}</div>}
          {assetId && <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void saveToLibrary("source")} className="text-xs font-medium text-emerald-900 underline">Save source image for later</button><button type="button" disabled={busy} onClick={() => void act(async () => { await api(`/api/upload/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" }); setAssetId(""); setGenerationId(""); setStatus(""); setDesignId(""); setSelection(null); setPreviewUrl(""); if (user) sessionStorage.removeItem(`smn_upload_pending_${user.uid}`); setFile(null); })} className="text-xs text-stone-500 underline">Delete image and unused artwork</button></div>}
          {librarySaveMessage && <p role="status" className="text-xs text-emerald-800">{librarySaveMessage}</p>}
          {status === "failed" && <p role="alert" className="text-sm text-rose-700">We couldn’t create artwork from this image and request. Edit the prompt or try another image. Earlier versions remain available.</p>}
          {status === "unresolved" && <p role="alert" className="text-sm text-amber-800">This request needs to be resolved before it can be retried. Your image, prompt and earlier versions are still here.</p>}
          {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}{editMode && /source|expired/i.test(error) && <p className="mt-2"><Link href="/account/images" className="underline">If you saved this source earlier, look in Saved images.</Link></p>}</div>}
        </section>
        <section className="hidden min-h-[460px] flex-col items-center justify-center gap-4 rounded-[2rem] bg-[#e9e6dd] p-6 sm:p-10 lg:flex"><div className="flex gap-2"><button type="button" aria-pressed={compareMode === "result"} onClick={() => { setCompareMode("result"); if (selectedVersionId) void loadPreview("design", selectedVersionId); else if (generationId && status === "ready") void loadPreview("generation", generationId); }} className="rounded-full border border-stone-400 px-4 py-2 text-xs">Card result</button><button type="button" aria-pressed={compareMode === "original"} onClick={() => { setCompareMode("original"); if (assetId) void loadPreview("asset", assetId); }} className="rounded-full border border-stone-400 px-4 py-2 text-xs">Original photo</button></div>{previewPanel(false)}</section>
      </div>}
    </div>
  </main>;
}
