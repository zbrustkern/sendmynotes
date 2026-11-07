import crypto from "crypto";
import { getResendClient } from "../email/resend";
import { getOrderById, firestoreDb } from "../firebase-admin";
import { getPostPurchaseConfig, getPostPurchaseVersion } from "./config";
import { getEmailPreference, getSenderKey } from "./preferences";
import { getPostPurchaseEligibility, hasOtherVerifiedPurchase, hasPostPurchaseRefund } from "./enrollment";
import { enrollmentRef, listDueMessages, messageRef } from "./repository";
import { renderPostPurchaseEmail } from "../email/post-purchase";
import type { PostPurchaseEnrollment, PostPurchaseMessage } from "./contracts";
import { ensureFollowupOffer, getFollowupOfferForEnrollment, isFollowupOfferAvailable } from "./offers";
import { createScheduledStep, nextStepFor } from "./enrollment";
import { effectiveOrderEmail } from "../checkout-contact-policy";
import { ensureFollowupLink } from "./links";

export interface FollowupTransport { send(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }> }
export interface DispatchResult { accepted: number; held: number; failed: number; uncertain: number; processed: number }
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60_000;
const SAFETY_MS = 60 * 60_000;
const MAX_OVERDUE_MS = 24 * 60 * 60_000;
function strictTransport(): FollowupTransport {
  return { async send(payload, idempotencyKey) {
    if (process.env.STAGING_REVIEW_ONLY === "true" || process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true") throw new Error("delivery_disabled");
    const client = await getResendClient();
    if (!client) throw new Error("resend_credentials_missing");
    const key = await (await import("../email/resend")).getResendApiKey();
    if (!key || /^(re_mock|mock_)/i.test(key)) throw new Error("resend_mock_key_blocked");
    const result = await client.emails.send(payload as any, { idempotencyKey } as any);
    if (result.error) throw new Error(result.error.message || "Resend rejected the request");
    if (!result.data?.id) throw new Error("Resend returned no message ID");
    return { id: result.data.id };
  } };
}
export async function dispatchDuePostPurchase(limit = 25, options: { now?: number; transport?: FollowupTransport } = {}): Promise<DispatchResult> {
  const now = options.now ?? Date.now(); const config = await getPostPurchaseConfig();
  const result: DispatchResult = { accepted: 0, held: 0, failed: 0, uncertain: 0, processed: 0 };
  if (config.globalPaused || process.env.STAGING_REVIEW_ONLY === "true" || process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true") return result;
  await finalizePendingAcceptedCheckIns(25, now);
  const due = await listDueMessages(now, Math.max(1, Math.min(100, limit)));
  for (const message of due) {
    result.processed++;
    try {
      const claim = await claimMessage(message, now);
      if (!claim) continue;
      if (now - claim.dueAt > MAX_OVERDUE_MS) { await setState(claim.id, "held", "overdue_requires_reviewed_reschedule"); result.held++; continue; }
      const enrollmentSnap = await enrollmentRef(claim.enrollmentId).get();
      if (!enrollmentSnap.exists) { await setState(claim.id, "held", "enrollment_missing"); result.held++; continue; }
      const enrollment = enrollmentSnap.data() as PostPurchaseEnrollment;
      const order = await getOrderById(claim.sourceOrderId);
      if (!order) { await setState(claim.id, "held", "source_order_missing"); result.held++; continue; }
      const destination = effectiveOrderEmail(order);
      const pref = destination ? await getEmailPreference(destination) : null;
      const current = getPostPurchaseEligibility(order, pref?.state, false);
      const latestConfig = await getPostPurchaseConfig(); const pinned = await getPostPurchaseVersion(enrollment.versionId);
      const capturedSenderKey = (() => { try { return destination ? getSenderKey(destination) : ""; } catch { return ""; } })();
      if (!current.eligible || pref?.state !== "granted" || latestConfig.globalPaused || !pinned || !latestConfig.steps[claim.step].enabled || enrollment.state !== "active" || !capturedSenderKey || capturedSenderKey !== enrollment.senderKey || capturedSenderKey !== order.postPurchaseSenderKey) {
        await setState(claim.id, "held", current.eligible ? (latestConfig.globalPaused ? "program_paused" : "permission_or_version_changed") : current.reason); result.held++; continue;
      }
      if ((enrollment as any).supportHold) { await setState(claim.id, "held", "paused_for_support"); result.held++; continue; }
      const resumedAt = Number((latestConfig as any).resumedAt || 0); const stepResumedAt = Number((latestConfig as any).stepResumedAt?.[claim.step] || 0);
      const resumeBoundary = Math.max(resumedAt, stepResumedAt);
      if (resumeBoundary && claim.dueAt < resumeBoundary && Number((claim as any).rescheduledAt || 0) < resumeBoundary) { await setState(claim.id, "held", "backlog_requires_reviewed_reschedule"); result.held++; continue; }
      if (await hasPostPurchaseRefund(order).catch(() => true)) { await setState(claim.id, "held", "refund_review_or_refund_evidence_unavailable"); result.held++; continue; }
      const senderKey = (() => { try { return getSenderKey(order.customerEmail); } catch { return ""; } })();
      if (senderKey && await hasOtherVerifiedPurchase(senderKey, order.id, order.purchaseMeasurement?.verifiedAt || 0, "later")) {
        await enrollmentRef(enrollment.id).set({ state: "cancelled", cancellationReason: "purchased_again", updatedAt: now }, { merge: true });
        await cancelPendingEnrollmentMessages(enrollment.id, "purchased_again", claim.id); result.held++; continue;
      }
      if (claim.dispatchAttemptedAt && now - claim.dispatchAttemptedAt >= IDEMPOTENCY_WINDOW_MS - SAFETY_MS) { await setState(claim.id, "uncertain", "idempotency_window_expired"); result.uncertain++; continue; }
      const apiEmail = process.env.POST_PURCHASE_SENDER_EMAIL; const replyTo = process.env.POST_PURCHASE_REPLY_TO; const address = process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS;
      if (!apiEmail || !replyTo || !address) { await setState(claim.id, "held", "sender_reply_to_or_postal_address_unconfigured"); result.held++; continue; }
      if (!options.transport) {
        const apiKey = await (await import("../email/resend")).getResendApiKey();
        if (!apiKey || /^(re_mock|mock_)/i.test(apiKey)) { await setState(claim.id, "held", "resend_credentials_missing_or_mock"); result.held++; continue; }
      }
      let frozen: { payload: Record<string, unknown>; idempotencyKey: string };
      if (claim.dispatchPayload && claim.payloadHash && claim.idempotencyKey) frozen = { payload: claim.dispatchPayload, idempotencyKey: claim.idempotencyKey };
      else {
        const token = await ensureUnsubscribeToken(enrollment.senderKey);
        let offer: Awaited<ReturnType<typeof ensureFollowupOffer>> | null = null;
        let offerUrl: string | undefined;
        if (claim.step === "offer") {
          if (!pinned.steps.offer.enabled) { await setState(claim.id, "held", "offer_disabled_in_pinned_version"); result.held++; continue; }
          offer = await ensureFollowupOffer({ enrollmentId: enrollment.id, sourceOrderId: order.id, messageId: claim.id, at: now, amountCents: pinned.offer.amountCents, validDays: pinned.offer.validDays });
          const followupLink = await ensureFollowupLink({ messageId: claim.id, enrollmentId: enrollment.id, sourceOrderId: order.id, at: now });
          const link = new URL(offer.offerUrl); link.searchParams.set("followupRef", followupLink.reference); offerUrl = link.toString();
        }
        const site = process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com";
        const visibleUnsub = `${site}/email/unsubscribe?token=${encodeURIComponent(token)}`;
        const listUnsub = `${site}/api/post-purchase/unsubscribe?token=${encodeURIComponent(token)}`;
        const expiryDisplay = offer ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/Chicago" }).format(offer.expiresAt) + " CT" : undefined;
        const rendered = renderPostPurchaseEmail(pinned, claim.step, { greeting: "Hi there,", cardPhrase: "your card", unsubscribeUrl: visibleUnsub, businessPostalAddress: address, offerAmount: `$${(pinned.offer.amountCents / 100).toFixed(0)}`, offerCode: offer?.code, offerUrl, expiryDisplay });
        const payload: Record<string, unknown> = { from: `Zeke at SendMyNotes <${apiEmail}>`, replyTo, to: destination, subject: rendered.subject, html: rendered.html, text: rendered.text, headers: { ...rendered.headers, "List-Unsubscribe": `<${listUnsub}>` }, tags: [{ name: "program", value: "post_purchase_v1" }, { name: "stage", value: claim.step }, { name: "template_version", value: pinned.versionId }, { name: "message_id", value: claim.id }] };
        frozen = await freezePayload(claim, payload, `postpurchase_${claim.id}`, now);
      }
      const boundaryFailure = await finalDispatchBoundary(claim, enrollment, destination, order, frozen, now);
      if (boundaryFailure) {
        if (boundaryFailure === "message_already_accepted") { result.accepted++; await finalizeAcceptedPostPurchaseMessage(claim.id, now).catch(() => undefined); }
        else if (boundaryFailure === "message_cancelled_or_changed") result.held++;
        else { await setState(claim.id, "held", boundaryFailure); result.held++; }
        continue;
      }
      const began = await markDispatchAttempt(claim.id, now);
      if (!began) { result.held++; continue; }
      let sent: { id: string };
      try { sent = await (options.transport || strictTransport()).send(frozen.payload, frozen.idempotencyKey); }
      catch (err: any) {
        const error = String(err?.message || err);
        const fresh = await (await messageRef(claim.id).get()).data() as PostPurchaseMessage;
        if (fresh?.state === "accepted") { result.accepted++; await finalizeAcceptedPostPurchaseMessage(claim.id, now).catch(() => undefined); continue; }
        if (fresh?.state === "cancelled") { result.held++; continue; }
        const attempted = fresh?.dispatchAttemptedAt;
        if (/delivery_disabled|credentials_missing|mock_key|rejected/i.test(error)) {
          await setState(claim.id, /credentials_missing|mock_key|delivery_disabled/i.test(error) ? "held" : "failed", error.slice(0,140)); result.held++; continue;
        }
        if (attempted) {
          const safeRetry = now - attempted < IDEMPOTENCY_WINDOW_MS - SAFETY_MS;
          await messageRef(claim.id).set({ state: safeRetry ? "scheduled" : "uncertain", leaseUntil: 0, suppressionReason: safeRetry ? `retryable:${error.slice(0,120)}` : `reconcile:${error.slice(0,120)}` }, { merge: true });
          if (safeRetry) result.failed++; else result.uncertain++;
        } else { await setState(claim.id, "held", error.slice(0, 140)); result.held++; }
        continue;
      }
      // Provider acceptance is durable and final. Follow-up scheduling failures below never retry this message.
      await markMessageAccepted(claim.id, sent.id, now);
      result.accepted++;
      try { await finalizeAcceptedPostPurchaseMessage(claim.id, now); } catch (error) { console.warn("[Post-purchase] Accepted message follow-up scheduling requires reconciliation."); }
    } catch { result.failed++; }
  }
  return result;
}
async function claimMessage(message: PostPurchaseMessage, now: number): Promise<PostPurchaseMessage | null> {
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = messageRef(message.id); const snap = await tx.get(ref); if (!snap.exists) return null;
    const latest = snap.data() as PostPurchaseMessage;
    const staleDispatch = latest.state === "dispatching" && (latest.leaseUntil || 0) <= now;
    if (!(latest.state === "scheduled" || staleDispatch) || latest.dueAt > now || (latest.leaseUntil || 0) > now) return null;
    if (latest.dispatchAttemptedAt && now - latest.dispatchAttemptedAt >= IDEMPOTENCY_WINDOW_MS - SAFETY_MS) { tx.set(ref, { state: "uncertain", leaseUntil: 0, suppressionReason: "idempotency_window_expired" }, { merge: true }); return null; }
    const claimed = { ...latest, state: "dispatching" as const, leaseUntil: now + 5 * 60_000, idempotencyKey: latest.idempotencyKey || `postpurchase_${latest.id}` };
    tx.set(ref, claimed); return claimed;
  });
}
async function finalDispatchBoundary(message: PostPurchaseMessage, enrollment: PostPurchaseEnrollment, destination: string, originalOrder: import("../types").Order, frozen: { payload: Record<string, unknown>; idempotencyKey: string }, now: number): Promise<string | null> {
  if (process.env.STAGING_REVIEW_ONLY === "true" || process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true") return "delivery_disabled";
  const latestMessage = await messageRef(message.id).get();
  if (!latestMessage.exists || latestMessage.data()?.state !== "dispatching") return latestMessage.data()?.state === "accepted" ? "message_already_accepted" : "message_cancelled_or_changed";
  const [currentOrder, currentEnrollment, config, preference] = await Promise.all([
    getOrderById(originalOrder.id), enrollmentRef(enrollment.id).get(), getPostPurchaseConfig(), getEmailPreference(destination),
  ]);
  if (!currentOrder || !currentEnrollment.exists || currentEnrollment.data()?.state !== "active") return "enrollment_or_order_changed";
  if (!preference || preference.state !== "granted") return "permission_changed";
  if (config.globalPaused || !config.steps[message.step].enabled) return "program_or_step_paused";
  const currentKey = (() => { try { return getSenderKey(effectiveOrderEmail(currentOrder)); } catch { return ""; } })();
  if (!currentKey || currentKey !== enrollment.senderKey || currentKey !== currentOrder.postPurchaseSenderKey) return "captured_destination_changed";
  if (frozen.payload.to !== destination) return "frozen_destination_changed";
  const eligibility = getPostPurchaseEligibility(currentOrder, preference.state, false);
  if (!eligibility.eligible) return eligibility.reason;
  if (await hasPostPurchaseRefund(currentOrder).catch(() => true)) return "refund_or_refund_evidence_unavailable";
  if (await hasOtherVerifiedPurchase(currentKey, currentOrder.id, currentOrder.purchaseMeasurement?.verifiedAt || 0, "later")) return "purchased_again";
  if (message.step === "offer" && !await isFollowupOfferAvailable(enrollment.id, now)) return "offer_expired_exhausted_or_paused";
  return null;
}
async function markDispatchAttempt(messageId: string, now: number): Promise<boolean> {
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = messageRef(messageId); const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.state !== "dispatching") return false;
    tx.set(ref, { dispatchAttemptedAt: snap.data()?.dispatchAttemptedAt || now, leaseUntil: now + 5 * 60_000 }, { merge: true });
    return true;
  });
}
export async function finalizeAcceptedPostPurchaseMessage(messageId: string, now = Date.now()): Promise<void> {
  const message = await messageRef(messageId).get(); if (!message.exists) return;
  const record = message.data() as PostPurchaseMessage; if (record.state !== "accepted" || (record as any).followupFinalizedAt) return;
  const enrollmentSnap = await enrollmentRef(record.enrollmentId).get(); if (!enrollmentSnap.exists) return;
  const enrollment = enrollmentSnap.data() as PostPurchaseEnrollment;
  const pinned = await getPostPurchaseVersion(enrollment.versionId); if (!pinned) return;
  if (enrollment.state !== "active") { await messageRef(messageId).set({ followupFinalizedAt: now, followupSuppressedReason: enrollment.state }, { merge: true }); return; }
  const next = nextStepFor(record.step);
  if (!next || !pinned.steps[next].enabled) {
    await firestoreDb.runTransaction(async (tx: any) => {
      const ref = enrollmentRef(enrollment.id); const current = await tx.get(ref);
      if (current.exists && current.data()?.state === "active") tx.set(ref, { stage: "complete", state: "complete", updatedAt: now }, { merge: true });
    });
    await messageRef(messageId).set({ followupFinalizedAt: now }, { merge: true });
    return;
  }
  const order = await getOrderById(enrollment.sourceOrderId); if (!order) return;
  const email = effectiveOrderEmail(order); const preference = email ? await getEmailPreference(email) : null;
  const key = (() => { try { return email ? getSenderKey(email) : ""; } catch { return ""; } })();
  if (!email || preference?.state !== "granted" || key !== enrollment.senderKey || key !== order.postPurchaseSenderKey) { await messageRef(messageId).set({ followupFinalizedAt: now, followupSuppressedReason: "permission_or_destination_changed" }, { merge: true }); return; }
  const nextMessage = await createScheduledStep(enrollment, next, record.acceptedAt || now, pinned);
  await messageRef(messageId).set({ followupFinalizedAt: now }, { merge: true });
}
async function finalizePendingAcceptedCheckIns(limit: number, now: number): Promise<void> {
  const pending = await firestoreDb.collection("post_purchase_messages").where("state", "==", "accepted").where("step", "==", "check_in").where("followupFinalizedAt", "==", null).orderBy("acceptedAt", "asc").limit(Math.max(1, Math.min(100, limit))).get();
  for (const doc of pending.docs) await finalizeAcceptedPostPurchaseMessage(doc.id, now).catch(() => undefined);
}
async function markMessageAccepted(messageId: string, providerId: string, now: number) {
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = messageRef(messageId); const snap = await tx.get(ref); if (!snap.exists) throw new Error("Message disappeared after provider acceptance");
    const old = snap.data();
    tx.set(ref, { state: "accepted", resendId: old.resendId || providerId, acceptedAt: old.acceptedAt || now, leaseUntil: 0, followupFinalizedAt: old.followupFinalizedAt ?? null }, { merge: true });
  });
}
async function freezePayload(message: PostPurchaseMessage, payload: Record<string, unknown>, key: string, now: number): Promise<{ payload: Record<string, unknown>; idempotencyKey: string }> {
  const payloadJson = JSON.stringify(payload); const payloadHash = crypto.createHash("sha256").update(payloadJson).digest("hex");
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = messageRef(message.id); const snap = await tx.get(ref); const current = snap.data() as PostPurchaseMessage;
    if (current.payloadHash && current.payloadHash !== payloadHash) throw new Error("Dispatch payload changed after its first attempt");
    const result = { ...current, payloadHash, dispatchPayload: current.dispatchPayload || payload, idempotencyKey: current.idempotencyKey || key };
    tx.set(ref, result); return { payload: result.dispatchPayload as Record<string, unknown>, idempotencyKey: result.idempotencyKey! };
  });
}
async function setState(id: string, state: string, reason: string) {
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = messageRef(id); const snap = await tx.get(ref); if (!snap.exists) return;
    const current = snap.data(); if (["accepted", "cancelled"].includes(current.state)) return;
    tx.set(ref, { state, suppressionReason: reason, leaseUntil: 0 }, { merge: true });
  });
}
async function ensureUnsubscribeToken(senderKey: string): Promise<string> {
  const secret = process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32) throw new Error("unsubscribe_secret_missing");
  const token = crypto.createHmac("sha256", secret).update(`post-purchase-unsubscribe:${senderKey}`).digest("base64url"); const hash = crypto.createHmac("sha256", secret).update(token).digest("hex");
  const ref = firestoreDb.collection("post_purchase_unsubscribe_tokens").doc(hash);
  await ref.create({ senderKey, createdAt: Date.now(), schemaVersion: 1 }).catch((e: any) => { if (e?.code !== 6) throw e; });
  return token;
}
export async function resolveUnsubscribeToken(token: string): Promise<string | null> {
  const secret = process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET; if (!secret || token.length < 32 || token.length > 128) return null;
  const hash = crypto.createHmac("sha256", secret).update(token).digest("hex"); const doc = await firestoreDb.collection("post_purchase_unsubscribe_tokens").doc(hash).get();
  return doc.exists ? String(doc.data()?.senderKey || "") || null : null;
}
async function cancelPendingEnrollmentMessages(enrollmentId: string, reason: string, currentMessageId?: string) {
  const pending = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", enrollmentId).limit(20).get();
  for (const message of pending.docs) if (["draft", "scheduled", "held", "claimed"].includes(message.data().state) || message.id === currentMessageId) await message.ref.set({ state: "cancelled", suppressionReason: reason, leaseUntil: 0 }, { merge: true });
}
