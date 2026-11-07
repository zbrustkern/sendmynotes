"use client";

import React, { useEffect, useState } from "react";
import type { PostPurchaseAdminQueueRow, FollowupStep } from "@/lib/post-purchase/contracts";

type OrderFollowupOrder = Pick<PostPurchaseAdminQueueRow, "orderId" | "maskedEmail"> & { eligibilityReason?: string; eligible?: boolean; eligibility?: PostPurchaseAdminQueueRow["eligibility"]; permission?: { state?: string; evidenceLabel?: string }; permissionState?: string; payment?: { state?: string; paidTotal?: string }; paymentEvidence?: string; mailing?: { state?: string; mailedAt?: number }; mailingEvidence?: string; support?: { paused?: boolean; reason?: string } };
type OrderFollowupData = { order?: OrderFollowupOrder; enrollment?: { id: string; state: string; stage: string; nextDueAt?: number }; messages?: Array<{ id?: string; step?: FollowupStep; stage?: FollowupStep; state: string; dueAt: number; versionId?: string; templateVersion?: string }>; offer?: { status?: string; code?: string; expiresAt?: number } | null; relatedPurchases?: Array<{ orderId: string; paidAt?: number }> };
const reasonLabel: Record<string, string> = { ready: "Ready for review", waiting_for_mailing: "Waiting for verified mailing", missing_email: "Missing sender email", permission_unknown: "Optional email permission is unknown", unsubscribed: "Sender unsubscribed", paused_for_support: "Paused for support", already_enrolled: "Already enrolled", purchased_again: "Purchased again", excluded_test_comp_refund: "Excluded test, comp, or refund", payment_unverified: "Payment is not verified", address_pending: "Mailing address is pending", mailing_unknown: "Mailing evidence is unknown" };

export function OrderFollowupPanel({ orderId, onClose }: { orderId: string; onClose?: () => void }) {
  const [data, setData] = useState<OrderFollowupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reschedule, setReschedule] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/admin/post-purchase?view=order&orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok || !body?.data) throw new Error(body?.error || "Follow-up details are unavailable."); setData(body.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Follow-up details are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [orderId]);
  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try { const response = await fetch("/api/admin/post-purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error || "That action could not be completed."); setMessage("Follow-up updated."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That action could not be completed."); }
    finally { setBusy(false); }
  }
  if (loading) return <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600" role="status">Loading follow-up eligibility…</section>;
  if (error && !data) return <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}<button className="ml-3 underline" onClick={() => void load()}>Retry</button></section>;
  const row = data?.order;
  const eligibility = row?.eligibility;
  const reason = row?.eligibilityReason || eligibility?.reason;
  const enrollment = data?.enrollment;
  return <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4" aria-label="Order follow-up">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-stone-900">Optional follow-ups</h3><p className="mt-1 text-xs text-stone-600">Destination: {row?.maskedEmail || "Not available"}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row?.eligible ?? eligibility?.eligible ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{reason ? reasonLabel[reason] || reason : "Eligibility unavailable"}</span>{onClose && <button onClick={onClose} className="rounded-lg border border-stone-300 px-2 py-1 text-xs">Close</button>}</div></div>
    <div className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-stone-50 p-3"><span className="text-xs text-stone-500">Payment</span><p className="mt-1 font-medium">{row?.payment?.state || (row?.paymentEvidence === "verified" ? "Verified" : "Unverified")}</p></div><div className="rounded-lg bg-stone-50 p-3"><span className="text-xs text-stone-500">Mailing</span><p className="mt-1 font-medium">{row?.mailing?.state || row?.mailingEvidence || "Not confirmed"}</p></div><div className="rounded-lg bg-stone-50 p-3"><span className="text-xs text-stone-500">Permission</span><p className="mt-1 font-medium">{row?.permission?.state || row?.permissionState || "Unknown"}</p><small className="text-xs text-stone-500">{row?.permission?.evidenceLabel || ""}</small></div></div>
    {enrollment ? <><div className="rounded-lg border border-stone-200 p-3"><p className="text-sm font-medium">Enrollment · {enrollment.state} · {enrollment.stage.replace(/_/g, " ")}</p>{data?.messages?.length ? <div className="mt-3 divide-y divide-stone-100">{data.messages.map((item, index) => <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={item.id || `${item.step || item.stage}-${index}`}><span>{(item.step || item.stage) === "check_in" ? "Experience check-in" : "Next-card offer"} · {item.state}{item.versionId || item.templateVersion ? ` · v${item.versionId || item.templateVersion}` : ""}</span><time className="text-xs text-stone-500">{new Date(item.dueAt).toLocaleString()}</time></div>)}</div> : null}</div>
      {enrollment.state === "review" && <button disabled={busy} onClick={() => void action({ action: "approve", enrollmentId: enrollment.id })} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve and schedule</button>}
      {enrollment.state === "paused" && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>This sequence is paused. Resuming rechecks permission, refund, and repeat-purchase status and returns it to review; it will not send until approved.</p><button disabled={busy} onClick={() => void action({ action: "resume", enrollmentId: enrollment.id, reason: "Operator requested resume from Orders" })} className="mt-2 rounded-lg border border-amber-400 px-3 py-2 font-medium disabled:opacity-50">Resume for review</button></div>}
      <div className="flex flex-wrap gap-2">{!['cancelled', 'complete', 'paused'].includes(enrollment.state) && <button disabled={busy} onClick={() => void action({ action: "pause", enrollmentId: enrollment.id, reason: "Operator paused from Orders" })} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">Pause sequence</button>}<button disabled={busy || ['cancelled', 'complete'].includes(enrollment.state)} onClick={() => void action({ action: "cancel", enrollmentId: enrollment.id, reason: "Operator cancelled from Orders" })} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-800 disabled:opacity-50">Cancel sequence</button>{enrollment.state !== "paused" && data?.messages?.some((item) => item.id && ["scheduled", "held"].includes(item.state)) && <label className="flex flex-wrap items-center gap-2 text-sm"><input type="datetime-local" value={reschedule} onChange={(e) => setReschedule(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-2"/><button disabled={busy || !reschedule} onClick={() => { const next = data.messages?.find((item) => item.id && ["scheduled", "held"].includes(item.state)); if (next?.id) void action({ action: "reschedule", messageId: next.id, dueAt: new Date(reschedule).getTime(), reason: "Operator rescheduled from Orders" }); }} className="rounded-lg border border-stone-300 px-3 py-2 disabled:opacity-50">Reschedule next message</button></label>}</div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Customer replied?</span><button disabled={busy} onClick={() => void action({ action: "record_reply", enrollmentId: enrollment.id, repliedAt: Date.now(), hasIssue: false })} className="rounded-lg border border-stone-300 px-3 py-2 text-sm">Record reply</button><button disabled={busy} onClick={() => void action({ action: "record_reply", enrollmentId: enrollment.id, repliedAt: Date.now(), hasIssue: true })} className="rounded-lg border border-amber-300 px-3 py-2 text-sm text-amber-900">Reply needs support · pause</button></div>
    </> : <button disabled={busy || !(row?.eligible ?? eligibility?.eligible)} onClick={() => void action({ action: "enroll", orderId })} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Enroll and schedule</button>}
    {data?.offer && <p className="text-sm text-stone-700">Offer: {data.offer.status || "not issued"}{data.offer.expiresAt ? ` · expires ${new Date(data.offer.expiresAt).toLocaleDateString()}` : ""}</p>}
    {data?.relatedPurchases?.length ? <p className="text-xs text-stone-600">Related purchases: {data.relatedPurchases.length}. Original acquisition attribution remains attached to its source order.</p> : null}
    <button disabled={busy} onClick={() => void action({ action: "preview", orderId, step: "check_in" })} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">Preview check-in</button>
    {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}{message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
  </section>;
}
