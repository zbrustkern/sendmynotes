import crypto from "crypto";
import { firestoreDb, getOrderById } from "../firebase-admin";
import { effectiveOrderEmail } from "../checkout-contact-policy";
import { getEmailPreference, getSenderKey, maskEmail } from "./preferences";
import { ensureUnsubscribeToken } from "./dispatch";
import type { Order } from "../types";
import type { FollowupTransport } from "./dispatch";

export const MANUAL_MESSAGES = "manual_followup_messages";
export type ManualKind = "service" | "marketing";
export interface ManualDraft {
  id: string; orderId: string; kind: ManualKind; subject: string; body: string;
  revision: number; destinationHash: string; state: "draft" | "dispatching" | "accepted" | "uncertain";
  createdAt: number; updatedAt: number; updatedBy: string; senderKey?: string;
  senderEmail?: string; replyTo?: string; postalAddress?: string;
  dispatchAttemptedAt?: number; acceptedAt?: number; resendId?: string; deliveryOutcome?: string;
}
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const idFor = (orderId: string) => `manual_${hash(orderId)}`;
const emailHash = (email: string) => hash(email.trim().toLowerCase());
const refFor = (orderId: string) => firestoreDb.collection(MANUAL_MESSAGES).doc(idFor(orderId));
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
async function source(orderId: string) {
  if (!orderId || orderId.length > 160 || orderId.includes("/")) throw new Error("A valid order is required.");
  const order = await getOrderById(orderId); if (!order) throw new Error("Order not found.");
  const email = effectiveOrderEmail(order);
  if (!email) throw new Error("This order has no captured sender email.");
  maskEmail(email); // Validate before creating a draft.
  return { order, email };
}
export async function manualOrderView(orderId: string) {
  const { order, email } = await source(orderId);
  const snap = await refFor(orderId).get(); const draft = snap.exists ? snap.data() as ManualDraft : null;
  const pref = await getEmailPreference(email);
  const blockers = manualReadiness();
  if (pref && suppressed.has(pref.state)) blockers.push(`Email is suppressed (${pref.state}).`);
  if (draft?.kind === "marketing" && pref?.state !== "granted") blockers.push("Promotional messages require recorded marketing permission.");
  if (draft && draft.destinationHash !== emailHash(email)) blockers.push("The sender email changed. Save and review this draft before sending.");
  return { maskedEmail: maskEmail(email), permission: pref?.state || "unknown", sensitiveOccasion: generateManualCopy(order).sensitiveOccasion,
    isTestOrder: Boolean(order.isTest || order.isFounderTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock"),
    senderEmail: draft?.senderEmail || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", replyTo: draft?.replyTo || process.env.POST_PURCHASE_REPLY_TO || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", postalAddress: draft?.postalAddress || process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS || "",
    blockers, draft: draft ? { id: draft.id, kind: draft.kind, subject: draft.subject, body: draft.body, revision: draft.revision, state: draft.state, acceptedAt: draft.acceptedAt, deliveryOutcome: draft.deliveryOutcome } : null };
}
export async function generateManualDraft(orderId: string, actor: string) {
  const { order, email } = await source(orderId); const copy = generateManualCopy(order); const now = Date.now();
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = refFor(orderId); const snap = await tx.get(ref); const old = snap.data() as ManualDraft | undefined;
    if (old) return; // Never overwrite edits or create another send from repeated clicks.
    tx.set(ref, { id: idFor(orderId), orderId, kind: "service", subject: copy.subject, body: copy.body,
      revision: 1, destinationHash: emailHash(email), state: "draft", createdAt: now, updatedAt: now, updatedBy: actor });
  });
  return manualOrderView(orderId);
}
function validateCopy(subject: unknown, body: unknown, kind: unknown) {
  if (typeof subject !== "string" || !subject.trim() || subject.length > 160 || /[\r\n]/.test(subject)) throw new Error("Use a subject of 1–160 characters on one line.");
  if (typeof body !== "string" || !body.trim() || body.length > 5000) throw new Error("Use a message of 1–5,000 characters.");
  if (kind !== "service" && kind !== "marketing") throw new Error("Choose a message type.");
  return { subject: subject.trim(), body: body.trim(), kind: kind as ManualKind };
}
export async function saveManualDraft(input: { orderId: string; revision: number; subject: unknown; body: unknown; kind: unknown }, actor: string) {
  const { email } = await source(input.orderId); const copy = validateCopy(input.subject, input.body, input.kind);
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = refFor(input.orderId); const snap = await tx.get(ref); const old = snap.data() as ManualDraft | undefined;
    if (!old || old.state !== "draft" || old.revision !== input.revision) throw new Error("This draft changed or was already sent. Refresh before editing.");
    tx.set(ref, { ...old, ...copy, destinationHash: emailHash(email), revision: old.revision + 1, updatedAt: Date.now(), updatedBy: actor });
  });
  return manualOrderView(input.orderId);
}
export async function sendManualDraft(input: { orderId: string; revision: number; reviewed: boolean; testAcknowledged?: boolean }, actor: string, options: { transport?: FollowupTransport } = {}) {
  if (!input.reviewed) throw new Error("Review this exact message and recipient before sending.");
  const blockers = manualReadiness(); if (blockers.length) throw new Error(blockers.join(" "));
  if (options.transport && process.env.NODE_ENV !== "test") throw new Error("Test transport is unavailable.");
  const { order, email } = await source(input.orderId);
  if ((order.isTest || order.isFounderTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock") && !input.testAcknowledged) throw new Error("Confirm that this founder/test order is an intentional email test.");
  const senderKey = getSenderKey(email); const pref = await getEmailPreference(email);
  if (pref && suppressed.has(pref.state)) throw new Error(`Email is suppressed (${pref.state}).`);
  const ref = refFor(input.orderId); const snap = await ref.get(); const draft = snap.data() as ManualDraft | undefined;
  if (!draft) throw new Error("Generate and review a draft first.");
  if (draft.state === "accepted") return manualOrderView(input.orderId);
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
  const footer = `${draft.kind === "service" ? "This is a personal note from SendMyNotes about your card." : "You chose to receive SendMyNotes follow-ups and offers."}\nStop optional follow-ups: ${unsubscribe}\nOrder receipts and necessary order updates will continue.\nSendMyNotes · ${process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS}`;
  const text = `${draft.body}\n\n${footer}`;
  const payload = { from: `Zeke at SendMyNotes <${process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com"}>`, replyTo: process.env.POST_PURCHASE_REPLY_TO || process.env.POST_PURCHASE_SENDER_EMAIL || "orders@sendmynotes.com", to: email,
    subject: draft.subject, text, html: `<div style="max-width:560px;font-family:Arial,sans-serif;line-height:1.65;color:#292524">${escape(draft.body).replace(/\n/g,"<br>")}<hr><small>${escape(footer).replace(escape(unsubscribe), `<a href="${escape(unsubscribe)}">Stop optional follow-ups</a>`).replace(/\n/g,"<br>")}</small></div>`,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "program", value: "manual_followup" }, { name: "message_id", value: draft.id }] };
  // Atomically claim the reviewed revision and suppression record. No scheduler reads this collection.
  const claimed = await firestoreDb.runTransaction(async (tx: any) => {
    const fresh = await tx.get(ref); const preference = await tx.get(firestoreDb.collection("email_preferences").doc(senderKey));
    const sourceOrder = await tx.get(firestoreDb.collection("orders").doc(input.orderId));
    const current = fresh.data() as ManualDraft | undefined; const state = preference.data()?.state;
    if (!current || current.state !== "draft" || current.revision !== input.revision) return false;
    if (!sourceOrder.exists || emailHash(effectiveOrderEmail(sourceOrder.data() as Order)) !== current.destinationHash) throw new Error("The destination changed. Refresh and review again.");
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
  return manualOrderView(input.orderId);
}
