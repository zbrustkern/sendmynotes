import crypto from "crypto";
import { firestoreDb } from "../firebase-admin";
import { effectiveOrderEmail, normalizeCheckoutEmail } from "../checkout-contact-policy";
import { getEmailPreference, getSenderKey, maskEmail } from "./preferences";
import { ensureUnsubscribeToken } from "./dispatch";
import type { Order } from "../types";
import type { FollowupTransport } from "./dispatch";

export const MANUAL_MESSAGES = "manual_followup_messages";
export type ManualSourceType = "order" | "feedback" | "account";
export type ManualKind = "service" | "marketing";
export interface ManualDraft {
  id: string; sourceType: ManualSourceType; sourceId: string; orderId?: string; kind: ManualKind; subject: string; body: string;
  revision: number; destinationHash: string; state: "draft" | "dispatching" | "accepted" | "uncertain";
  createdAt: number; updatedAt: number; updatedBy: string; senderKey?: string;
  senderEmail?: string; replyTo?: string; postalAddress?: string;
  dispatchAttemptedAt?: number; acceptedAt?: number; resendId?: string; deliveryOutcome?: string;
}
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const idFor = (sourceId: string, sourceType: ManualSourceType) => `manual_${hash(JSON.stringify([sourceType, sourceId]))}`;
const emailHash = (email: string) => hash(email.trim().toLowerCase());
const refFor = (sourceId: string, sourceType: ManualSourceType) => firestoreDb.collection(MANUAL_MESSAGES).doc(idFor(sourceId, sourceType));
const suppressed = new Set(["denied", "unsubscribed", "bounced", "complained"]);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export function generateManualCopy(order: Order): { subject: string; body: string; sensitiveOccasion: boolean } {
  // Only structured occasion metadata is used; never send private card text to a model.
  const sensitiveOccasion = /sympathy|condolence|bereavement|loss|funeral/i.test(String(order.occasion || order.recipientOccasion?.occasionType || ""));
  const name = String(order.returnAddress?.firstName || "").trim().replace(/[\r\n]/g, " ").slice(0,60);
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return {
    sensitiveOccasion,
    subject: sensitiveOccasion ? "A personal note from Zeke at SendMyNotes" : "A quick note from Zeke at SendMyNotes",
    body: [greeting,
      sensitiveOccasion
        ? "I'm Zeke, the founder of SendMyNotes. I wanted to personally let you know that I'm here if you need any help with your card. There's no need to reply."
        : "I'm Zeke, the founder of SendMyNotes. I wanted to personally check whether you need any help with your card or the sending experience. You can reply directly to me.",
      "Zeke\nSendMyNotes"].join("\n\n"),
  };
}
export function manualReadiness(): string[] {
  const blockers: string[] = [];
  if (process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE !== "true") blockers.push("Manual email sending is not enabled yet.");
  if (process.env.STAGING_REVIEW_ONLY === "true") blockers.push("Staging is preview-only; email sending is blocked.");
  for (const [key, label] of [["POST_PURCHASE_BUSINESS_POSTAL_ADDRESS", "Business postal footer"]]) {
    if (!process.env[key]?.trim()) blockers.push(`${label} is not configured.`);
  }
  if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) blockers.push("Email delivery-status webhook is not configured.");
  for (const [key, label] of [["POST_PURCHASE_SENDER_HMAC_KEY", "Sender identity secret"], ["POST_PURCHASE_UNSUBSCRIBE_SECRET", "Unsubscribe secret"]]) {
    if ((process.env[key]?.length || 0) < 32) blockers.push(`${label} is not configured.`);
  }
  return blockers;
}
function sourceEmail(data: any, sourceType: ManualSourceType): string {
  return sourceType === "order" ? effectiveOrderEmail(data as Order) : normalizeCheckoutEmail(data.email) || "";
}
async function source(sourceId: string, sourceType: ManualSourceType) {
  if (!["order", "feedback", "account"].includes(sourceType)) throw new Error("A valid contact source is required.");
  if (!sourceId || sourceId.length > 160 || sourceId.includes("/")) throw new Error("A valid contact reference is required.");
  const sourceRef = firestoreDb.collection(sourceType === "order" ? "orders" : sourceType === "feedback" ? "user_feedback" : "users").doc(sourceId);
  const snap = await sourceRef.get(); if (!snap.exists) throw new Error("Contact source not found.");
  const data = snap.data() || {}; const email = sourceEmail(data, sourceType);
  if (!email) throw new Error("This record has no usable captured sender email.");
  maskEmail(email);
  const order = sourceType === "order" ? data as Order : null;
  const copy = order ? generateManualCopy(order) : {
    sensitiveOccasion: false,
    subject: "A personal note from Zeke at SendMyNotes",
    body: sourceType === "account" ? "Hi there,\n\nI'm Zeke, the founder of SendMyNotes. If you need any help using your account, you can reply directly to me.\n\nZeke\nSendMyNotes" : "Hi there,\n\nI'm Zeke, the founder of SendMyNotes. Thank you for sharing feedback with us. If there is anything else you'd like me to know or any help you need, you can reply directly to me.\n\nZeke\nSendMyNotes",
  };
  const feedbackContext = sourceType === "feedback" ? {
    text: typeof data.feedback === "string" ? data.feedback.slice(0,5000) : "",
    truncated: typeof data.feedback === "string" && data.feedback.length > 5000,
    category: typeof data.category === "string" ? data.category.slice(0,80) : "general",
    rating: typeof data.rating === "number" && Number.isFinite(data.rating) && data.rating >= 0 && data.rating <= 5 ? data.rating : null,
  } : null;
  return { order, email, sourceRef, copy, feedbackContext };
}
export async function manualOrderView(orderId: string, sourceType: ManualSourceType = "order") {
  const { order, email, copy, feedbackContext } = await source(orderId, sourceType);
  const snap = await refFor(orderId, sourceType).get(); const draft = snap.exists ? snap.data() as ManualDraft : null;
  const pref = await getEmailPreference(email);
  const blockers = manualReadiness();
  if (pref && suppressed.has(pref.state)) blockers.push(`Email is suppressed (${pref.state}).`);
  if (draft?.kind === "marketing" && pref?.state !== "granted") blockers.push("Promotional messages require recorded marketing permission.");
  if (draft && draft.destinationHash !== emailHash(email)) blockers.push("The sender email changed. Save and review this draft before sending.");
  return { feedbackContext, maskedEmail: maskEmail(email), permission: pref?.state || "unknown", sourceType, sensitiveOccasion: copy.sensitiveOccasion,
    isTestOrder: Boolean(order && (order.isTest || order.isFounderTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock")),
    senderEmail: draft?.senderEmail || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", replyTo: draft?.replyTo || process.env.POST_PURCHASE_REPLY_TO || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", postalAddress: draft?.postalAddress || process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS || "",
    blockers, draft: draft ? { id: draft.id, kind: draft.kind, subject: draft.subject, body: draft.body, revision: draft.revision, state: draft.state, acceptedAt: draft.acceptedAt, deliveryOutcome: draft.deliveryOutcome } : null };
}
export async function generateManualDraft(orderId: string, actor: string, sourceType: ManualSourceType = "order") {
  const { email, copy } = await source(orderId, sourceType); const now = Date.now();
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = refFor(orderId, sourceType); const snap = await tx.get(ref); const old = snap.data() as ManualDraft | undefined;
    if (old) return; // Never overwrite edits or create another send from repeated clicks.
    tx.set(ref, { id: idFor(orderId, sourceType), sourceType, sourceId: orderId, ...(sourceType === "order" ? { orderId } : {}), kind: "service", subject: copy.subject, body: copy.body,
      revision: 1, destinationHash: emailHash(email), state: "draft", createdAt: now, updatedAt: now, updatedBy: actor });
  });
  return manualOrderView(orderId, sourceType);
}
function validateCopy(subject: unknown, body: unknown, kind: unknown) {
  if (typeof subject !== "string" || !subject.trim() || subject.length > 160 || /[\r\n]/.test(subject)) throw new Error("Use a subject of 1–160 characters on one line.");
  if (typeof body !== "string" || !body.trim() || body.length > 5000) throw new Error("Use a message of 1–5,000 characters.");
  if (kind !== "service" && kind !== "marketing") throw new Error("Choose a message type.");
  return { subject: subject.trim(), body: body.trim(), kind: kind as ManualKind };
}
export async function saveManualDraft(input: { orderId: string; sourceType?: ManualSourceType; revision: number; subject: unknown; body: unknown; kind: unknown }, actor: string) {
  const sourceType = input.sourceType || "order";
  const { email } = await source(input.orderId, sourceType); const copy = validateCopy(input.subject, input.body, input.kind);
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = refFor(input.orderId, sourceType); const snap = await tx.get(ref); const old = snap.data() as ManualDraft | undefined;
    if (!old || old.state !== "draft" || old.revision !== input.revision) throw new Error("This draft changed or was already sent. Refresh before editing.");
    tx.set(ref, { ...old, ...copy, destinationHash: emailHash(email), revision: old.revision + 1, updatedAt: Date.now(), updatedBy: actor });
  });
  return manualOrderView(input.orderId, sourceType);
}
export async function sendManualDraft(input: { orderId: string; sourceType?: ManualSourceType; revision: number; reviewed: boolean; testAcknowledged?: boolean }, actor: string, options: { transport?: FollowupTransport } = {}) {
  if (!input.reviewed) throw new Error("Review this exact message and recipient before sending.");
  const blockers = manualReadiness(); if (blockers.length) throw new Error(blockers.join(" "));
  if (options.transport && process.env.NODE_ENV !== "test") throw new Error("Test transport is unavailable.");
  const sourceType = input.sourceType || "order";
  const { order, email, sourceRef } = await source(input.orderId, sourceType);
  if (order && (order.isTest || order.isFounderTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock") && !input.testAcknowledged) throw new Error("Confirm that this founder/test order is an intentional email test.");
  const senderKey = getSenderKey(email); const pref = await getEmailPreference(email);
  if (pref && suppressed.has(pref.state)) throw new Error(`Email is suppressed (${pref.state}).`);
  const ref = refFor(input.orderId, sourceType); const snap = await ref.get(); const draft = snap.data() as ManualDraft | undefined;
  if (!draft) throw new Error("Generate and review a draft first.");
  if (draft.state === "accepted") return manualOrderView(input.orderId, sourceType);
  if (draft.state !== "draft" || draft.revision !== input.revision) throw new Error("This draft changed or sending has already started. Refresh its status.");
  if (draft.destinationHash !== emailHash(email)) throw new Error("The destination changed. Save and review the draft again.");
  if (draft.kind === "marketing" && pref?.state !== "granted") throw new Error("Promotional messages require recorded marketing permission.");
  let transport = options.transport;
  if (!transport) {
    if (process.env.DISABLE_LIVE_EXTERNAL_EFFECTS === "true") throw new Error("Live email is disabled.");
    const { getResendApiKey, getResendClient } = await import("../email/resend");
    const key = await getResendApiKey(); if (!key || /^(re_mock|mock_)/i.test(key)) throw new Error("Live email credentials are not configured.");
    const client = await getResendClient(); if (!client) throw new Error("Email provider is unavailable.");
    transport = { async send(payload, idempotencyKey) {
      const result = await client.emails.send(payload as any, { idempotencyKey });
      if (result.error || !result.data?.id) throw new Error("Provider acceptance could not be confirmed.");
      return { id: result.data.id };
    } };
  }
  const token = await ensureUnsubscribeToken(senderKey);
  const site = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com");
  if (site.protocol !== "https:" && process.env.NODE_ENV !== "test") throw new Error("A secure public email-link origin is required.");
  const unsubscribe = new URL(`/email/unsubscribe?token=${encodeURIComponent(token)}`, site).toString();
  const oneClick = new URL(`/api/post-purchase/unsubscribe?token=${encodeURIComponent(token)}`, site).toString();
  const footer = `${draft.kind === "service" ? (sourceType === "feedback" ? "This is a personal note from SendMyNotes about your feedback." : sourceType === "account" ? "This is a personal note from SendMyNotes about your account." : "This is a personal note from SendMyNotes about your card.") : "You chose to receive SendMyNotes follow-ups and offers."}\nStop optional follow-ups: ${unsubscribe}\n${sourceType !== "order" ? "Necessary service messages will continue." : "Order receipts and necessary order updates will continue."}\nSendMyNotes · ${process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS}`;
  const text = `${draft.body}\n\n${footer}`;
  const payload = { from: `Zeke at SendMyNotes <${process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com"}>`, replyTo: process.env.POST_PURCHASE_REPLY_TO || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", to: email,
    subject: draft.subject, text, html: `<div style="max-width:560px;font-family:Arial,sans-serif;line-height:1.65;color:#292524">${escape(draft.body).replace(/\n/g,"<br>")}<hr><small>${escape(footer).replace(escape(unsubscribe), `<a href="${escape(unsubscribe)}">Stop optional follow-ups</a>`).replace(/\n/g,"<br>")}</small></div>`,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "program", value: "manual_followup" }, { name: "message_id", value: draft.id }] };
  // Atomically claim the reviewed revision and suppression record. No scheduler reads this collection.
  const claimed = await firestoreDb.runTransaction(async (tx: any) => {
    const fresh = await tx.get(ref); const preference = await tx.get(firestoreDb.collection("email_preferences").doc(senderKey));
    const sourceOrder = await tx.get(sourceRef);
    const current = fresh.data() as ManualDraft | undefined; const state = preference.data()?.state;
    if (!current || current.state !== "draft" || current.revision !== input.revision) return false;
    if (!sourceOrder.exists || emailHash(sourceEmail(sourceOrder.data(), sourceType)) !== current.destinationHash) throw new Error("The destination changed. Refresh and review again.");
    if (suppressed.has(state) || (current.kind === "marketing" && state !== "granted")) throw new Error("Email permission changed. Refresh before sending.");
    if (manualReadiness().length) throw new Error("Manual email sending was disabled.");
    tx.set(ref, { ...current, state: "dispatching", senderKey, dispatchAttemptedAt: Date.now(), sentBy: actor,
      senderEmail: process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", replyTo: payload.replyTo, postalAddress: process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS,
      reviewedRevision: input.revision, dispatchPayload: payload, payloadHash: hash(JSON.stringify(payload)), idempotencyKey: draft.id, updatedAt: Date.now() });
    return true;
  });
  if (!claimed) throw new Error("Sending already started or the draft changed. Refresh its status.");
  try {
    const sent = await transport.send(payload, draft.id);
    await ref.set({ state: "accepted", resendId: sent.id, acceptedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
  } catch {
    await firestoreDb.runTransaction(async (tx: any) => {
      const current = await tx.get(ref);
      if (current.data()?.state !== "accepted") tx.set(ref, { state: "uncertain", updatedAt: Date.now() }, { merge: true });
    });
    throw new Error("The provider outcome needs checking. Do not resend; this message is held for reconciliation.");
  }
  return manualOrderView(input.orderId, sourceType);
}
