"use client";

import React, { useEffect, useRef, useState } from "react";
type Draft = { id: string; kind: "service" | "marketing"; subject: string; body: string; revision: number; state: string; acceptedAt?: number; deliveryOutcome?: string };
type View = { feedbackContext?: { text: string; truncated: boolean; category: string; rating: number | null } | null; senderEmail: string; replyTo: string; postalAddress: string; maskedEmail: string; permission: string; sensitiveOccasion: boolean; isTestOrder: boolean; blockers: string[]; draft: Draft | null };

export function ManualFollowupPanel({ orderId, sourceId, sourceType = "order" }: { orderId?: string; sourceId?: string; sourceType?: "order" | "feedback" | "account" }) {
  const contactId = sourceId || orderId || "";
  const query = `sourceType=${sourceType}&sourceId=${encodeURIComponent(contactId)}`;
  const feedback = sourceType === "feedback";
  const requestEpoch = useRef(0);
  const [view, setView] = useState<View | null>(null);
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [kind, setKind] = useState<"service" | "marketing">("service");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false); const [testAcknowledged, setTestAcknowledged] = useState(false);
  const [notice, setNotice] = useState("");
  function install(next: View) { setView(next); setSubject(next.draft?.subject || ""); setBody(next.draft?.body || ""); setKind(next.draft?.kind || "service"); setReviewed(false); }
  useEffect(() => {
    const epoch = ++requestEpoch.current;
    const controller = new AbortController(); setView(null); setBusy(false); setSubject(""); setBody(""); setKind("service"); setError(""); setNotice(""); setTestAcknowledged(false); setReviewed(false);
    fetch(`/api/admin/manual-followup?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const result = await r.json(); if (!r.ok) throw new Error(result.error); if (!controller.signal.aborted && requestEpoch.current === epoch) install(result.data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || "Unable to load email details."); });
    return () => { requestEpoch.current++; controller.abort(); };
  }, [contactId, sourceType]);
  async function action(actionName: "generate" | "save" | "send" | "refresh") {
    const epoch = requestEpoch.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = actionName === "refresh" ? await fetch(`/api/admin/manual-followup?${query}`, { cache: "no-store" }) : await fetch("/api/admin/manual-followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, orderId: contactId, sourceId: contactId, sourceType, revision: view?.draft?.revision, subject, body, kind, reviewed, testAcknowledged }) });
      const result = await response.json(); if (requestEpoch.current !== epoch) return; if (!response.ok) throw new Error(result.error || "Email action failed.");
      install(result.data); setNotice(actionName === "refresh" ? "Email status refreshed." : actionName === "send" ? "Accepted by the email provider. This does not confirm inbox delivery." : actionName === "save" ? "Draft saved. Review it below before sending." : "Your draft is ready to review and edit. Nothing has been sent.");
    } catch (e) {
      if (actionName === "send" && requestEpoch.current === epoch) {
        try { const refreshed = await fetch(`/api/admin/manual-followup?${query}`, { cache: "no-store" }); const result = await refreshed.json(); if (refreshed.ok && requestEpoch.current === epoch) install(result.data); } catch { /* Original send failure remains visible. */ }
      }
      if (requestEpoch.current === epoch) setError(e instanceof Error ? e.message : "Email action failed.");
    }
    finally { if (requestEpoch.current === epoch) setBusy(false); }
  }
  const draft = view?.draft;
  const dirty = Boolean(draft && (subject !== draft.subject || body !== draft.body || kind !== draft.kind));
  const locked = !!draft && draft.state !== "draft";
  const permissionBlocked = kind === "marketing" && view?.permission !== "granted";
  return <section aria-label="Personal follow-up email" className="space-y-4 rounded-xl border border-emerald-200 bg-white p-4">
    <div><h3 className="font-semibold text-stone-900">Personal email from you</h3><p className="mt-1 text-sm text-stone-600">Choose whether and when to write. Generating a draft never sends or starts an automatic sequence.</p></div>
    {view && <p className="text-sm text-stone-700">To: <strong>{view.maskedEmail}</strong> · Marketing permission: {view.permission}</p>}
    {view?.feedbackContext && <aside aria-label="Submitted feedback" className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm"><h4 className="font-semibold">Submitted feedback</h4><p className="mt-1 text-xs text-stone-600">Category: {view.feedbackContext.category}{view.feedbackContext.rating !== null ? ` · Rating: ${view.feedbackContext.rating}/5` : ""}</p><p className="mt-2 whitespace-pre-wrap break-words">{view.feedbackContext.text || "No feedback text available."}</p>{view.feedbackContext.truncated && <p className="mt-1 text-xs text-stone-600">Showing the first 5,000 characters.</p>}<p className="mt-2 text-xs text-stone-600">Private context for your review. This text is not inserted into the email.</p></aside>}
    {view?.sensitiveOccasion && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">This is a sympathy or loss occasion. The draft is quiet and offers help, with no coupon or request for a celebration. You can choose not to send it.</p>}
    {!draft && view && <button disabled={busy} onClick={() => void action("generate")} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Generating…" : "Generate personal note"}</button>}
    {draft && <>
      {locked ? <div role="status" className="rounded-lg bg-stone-100 p-3 text-sm"><strong>{draft.state === "accepted" ? "Accepted by email provider" : "Sending outcome needs checking"}</strong>{draft.acceptedAt && <p>{new Date(draft.acceptedAt).toLocaleString()}</p>}{draft.deliveryOutcome && <p>Delivery: {draft.deliveryOutcome}</p>}{draft.state !== "accepted" && <p>Do not resend. Refresh to check for provider confirmation; otherwise reconcile this message before taking further action.</p>}</div> : <>
        <label className="block text-sm font-medium text-stone-800">Message purpose<select disabled={busy} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setReviewed(false); }} className="mt-1 block w-full rounded-lg border border-stone-300 p-2"><option value="service">{feedback ? "Personal reply about feedback" : sourceType === "account" ? "Personal account help" : "Personal help with this card"}</option><option value="marketing">Promotional follow-up (requires opt-in)</option></select></label>
        <p className="text-xs text-stone-600">{feedback ? "Personal help is about the feedback they submitted." : sourceType === "account" ? "Personal help is about using their account." : "Personal help is about this card or sending experience."} Select promotional follow-up if you add an offer, sales pitch, or invitation to buy again. Capturing an email does not enroll someone in marketing.</p>
      </>}
      <label className="block text-sm font-medium text-stone-800">Subject<input disabled={busy || locked} value={subject} maxLength={160} onChange={e => { setSubject(e.target.value); setReviewed(false); }} className="mt-1 block w-full rounded-lg border border-stone-300 p-2" /></label>
      <label className="block text-sm font-medium text-stone-800">Your note<textarea disabled={busy || locked} value={body} rows={9} maxLength={5000} onChange={e => { setBody(e.target.value); setReviewed(false); }} className="mt-1 block w-full rounded-lg border border-stone-300 p-2 font-normal leading-relaxed" /></label>
      <p className="text-xs text-stone-600">Sent from Zeke at SendMyNotes, with your reply-to mailbox, business footer, and a link to stop optional follow-ups. No offer code is generated by this editor.</p>
      <details className="rounded-lg border border-stone-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-stone-800">Preview email</summary><div className="mt-3 space-y-3 text-sm"><p className="text-xs text-stone-500">From: Zeke at SendMyNotes &lt;{view?.senderEmail}&gt;<br/>Reply to: {view?.replyTo}<br/>To: {view?.maskedEmail}</p><p className="font-semibold">{subject}</p><div className="whitespace-pre-wrap leading-relaxed">{body}</div><hr/><p className="text-xs leading-relaxed text-stone-500">{kind === "service" ? (feedback ? "This is a personal note from SendMyNotes about your feedback." : sourceType === "account" ? "This is a personal note from SendMyNotes about your account." : "This is a personal note from SendMyNotes about your card.") : "You chose to receive SendMyNotes follow-ups and offers."}<br/>Stop optional follow-ups: [personal unsubscribe link added when sent]<br/>{sourceType !== "order" ? "Necessary service messages will continue." : "Order receipts and necessary order updates will continue."}<br/>SendMyNotes · {view?.postalAddress || "[business postal footer needed]"}</p>{dirty && <p className="text-xs text-amber-900">Unsaved preview. Save your changes before sending.</p>}</div></details>
      {locked && <button disabled={busy} onClick={() => void action("refresh")} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">Refresh email status</button>}
      {!locked && <>
        {dirty && <button disabled={busy} onClick={() => void action("save")} className="rounded-lg border border-stone-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">Save changes for review</button>}
        {view?.blockers.length ? <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">Drafting is ready. Before sending:</p><ul className="mt-1 list-disc pl-5">{view.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul></div> : null}
        {permissionBlocked && <p className="text-sm text-amber-900">This contact has no recorded marketing opt-in. You can keep the draft, or write a personal service note instead.</p>}
        {view?.isTestOrder && <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={testAcknowledged} onChange={e => setTestAcknowledged(e.target.checked)} className="mt-1"/>This founder/test order is an intentional email test. Its purchase classification will not change.</label>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy || dirty} checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1"/>I reviewed this recipient, message, and occasion and choose to send this one email now.</label>
        <button disabled={busy || dirty || !reviewed || permissionBlocked || !!view?.blockers.length || (view?.isTestOrder && !testAcknowledged)} onClick={() => void action("send")} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Working…" : "Send this email now"}</button>
      </>}
    </>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
  </section>;
}
