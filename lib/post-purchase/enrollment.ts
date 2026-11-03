import crypto from "crypto";
import type { Order } from "../types";
import { getOrderById, firestoreDb } from "../firebase-admin";
import { getPublishedPostPurchaseConfig, getPostPurchaseConfig, getPostPurchaseVersion } from "./config";
import { getEmailPreference, getSenderKey, recordPostPurchaseConsent } from "./preferences";
import { nextStepFor, schedulePostPurchaseStep } from "./schedule";
import { enrollmentRef, messageRef } from "./repository";
import type { FollowupStep, PostPurchaseEligibility, PostPurchaseEnrollment, PostPurchaseMessage, PostPurchasePublishedVersion } from "./contracts";
import { effectiveOrderEmail } from "../checkout-contact-policy";
import { getPaymentIntentRefundFacts } from "../financial-ledger";

export function getPostPurchaseEligibility(order: Order, permission: string | undefined, alreadyEnrolled = false): PostPurchaseEligibility {
  if (!order.purchaseMeasurement?.eligible) return { eligible: false, reason: order.purchaseMeasurement ? "excluded_test_comp_refund" : "payment_unverified" };
  if (order.isTest || order.isComp || order.isFounderTest || order.origin === "ADMIN_COMP" || order.amountInCents <= 0 || order.paymentMode === "local_mock" || order.paymentMode === "stripe_test" || order.purchaseMeasurement.refundStatus === "fully_refunded") return { eligible: false, reason: "excluded_test_comp_refund" };
  if (!effectiveOrderEmail(order)) return { eligible: false, reason: "missing_email" };
  if (["unsubscribed", "bounced", "complained", "denied"].includes(permission || "")) return { eligible: false, reason: "unsubscribed" };
  if (permission !== "granted") return { eligible: false, reason: "permission_unknown" };
  if (alreadyEnrolled) return { eligible: false, reason: "already_enrolled" };
  if (order.fulfillmentError || /fail|support|hold|cancel/i.test(`${order.status} ${order.fulfillmentStatus || ""}`)) return { eligible: false, reason: "paused_for_support" };
  if (order.addressDeferred || order.address_deferred || order.status === "AWAITING_RECIPIENT_ADDRESS") return { eligible: false, reason: "address_pending" };
  const country = (order.quote?.countryCode || order.recipientAddress?.country || "US").toUpperCase();
  if (order.isInternationalPreview || !["US", "USA", "UNITED STATES"].includes(country)) return { eligible: false, reason: "mailing_unknown" };
  if (!parseVerifiedMailDate(order)) return { eligible: false, reason: "mailing_unknown" };
  return { eligible: true, reason: "ready" };
}
export function parseVerifiedMailDate(order: Order): number | null {
  const value = order.postPurchaseMailedAt;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= Date.now() && Boolean(order.postPurchaseMailingEvidence?.source) ? value : null;
}
/** Operational lookup; no claim of identity beyond the captured, normalized email. */
export async function hasOtherVerifiedPurchase(senderKey: string, sourceOrderId: string, sourceVerifiedAt: number, direction: "earlier" | "later" = "later"): Promise<boolean> {
  const source = await getOrderById(sourceOrderId);
  const results = [await firestoreDb.collection("orders").where("postPurchaseSenderKey", "==", senderKey).limit(100).get()];
  if (source?.customerEmail) results.push(await firestoreDb.collection("orders").where("customerEmail", "==", source.customerEmail.trim().toLowerCase()).limit(100).get());
  for (const result of results) {
    if (result.size === 100) return true; // Conservatively review a truncated history.
    for (const doc of result.docs) {
      const other = doc.data() as Order;
      if (doc.id === sourceOrderId || !other.purchaseMeasurement?.eligible || other.isTest || other.isComp || other.isFounderTest) continue;
      const time = other.purchaseMeasurement.verifiedAt;
      if (direction === "earlier" ? time < sourceVerifiedAt || (time === sourceVerifiedAt && doc.id < sourceOrderId) : time > sourceVerifiedAt || (time === sourceVerifiedAt && doc.id > sourceOrderId)) return true;
    }
  }
  return false;
}
export async function hasPostPurchaseRefund(order: Order): Promise<boolean> {
  if (order.purchaseMeasurement?.refundStatus === "fully_refunded") return true;
  if (!order.stripePaymentId) return false;
  const facts = await getPaymentIntentRefundFacts(order.stripePaymentId);
  return facts.some(f => (f as any).provider === "stripe" && (f as any).providerRelationshipStatus === "linked" && (f as any).providerRefundStatus === "succeeded" && f.amountCents > 0);
}
async function cancelForRepeat(enrollment: PostPurchaseEnrollment): Promise<void> {
  await enrollmentRef(enrollment.id).set({ state: "cancelled", updatedAt: Date.now(), cancellationReason: "purchased_again" }, { merge: true });
  const pending = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", enrollment.id).limit(10).get();
  for (const doc of pending.docs) if (["draft", "scheduled", "held", "claimed"].includes(doc.data().state)) await doc.ref.set({ state: "cancelled", suppressionReason: "purchased_again" }, { merge: true });
}
const firstStep = (version: PostPurchasePublishedVersion): FollowupStep | null => version.steps.check_in.enabled ? "check_in" : version.steps.offer.enabled && version.anchor === "mailing_business_days" ? "offer" : null;

export async function onVerifiedPostPurchaseOrder(order: Order): Promise<PostPurchaseEnrollment | null> {
  const email = effectiveOrderEmail(order);
  if (!order.id || !email || !order.purchaseMeasurement?.eligible) return null;
  let senderKey: string; try { senderKey = getSenderKey(email); } catch { return null; }
  const id = crypto.createHash("sha256").update(`post_purchase_v1:${senderKey}`).digest("hex");
  const ref = enrollmentRef(id); const existing = await ref.get();
  if (existing.exists && existing.data()?.sourceOrderId !== order.id) {
    const prior = existing.data() as PostPurchaseEnrollment;
    const source = await getOrderById(prior.sourceOrderId);
    if ((source?.purchaseMeasurement?.verifiedAt || 0) <= order.purchaseMeasurement.verifiedAt && !["cancelled", "complete"].includes(prior.state)) await cancelForRepeat(prior);
    return (await ref.get()).data() as PostPurchaseEnrollment;
  }
  const [pref, published, live] = await Promise.all([getEmailPreference(email), getPublishedPostPurchaseConfig(), getPostPurchaseConfig()]);
  if (!published) return null;
  if (!existing.exists && await hasOtherVerifiedPurchase(senderKey, order.id, order.purchaseMeasurement.verifiedAt, "earlier")) return null;
  const eligibility = getPostPurchaseEligibility(order, pref?.state);
  if (await hasPostPurchaseRefund(order)) { eligibility.eligible = false; eligibility.reason = "excluded_test_comp_refund"; }
  if (await hasOtherVerifiedPurchase(senderKey, order.id, order.purchaseMeasurement.verifiedAt, "later")) { eligibility.eligible = false; eligibility.reason = "purchased_again"; }
  const now = Date.now(); const mailedAt = parseVerifiedMailDate(order);
  const result = await firestoreDb.runTransaction(async (tx: any) => {
    const current = await tx.get(ref);
    const prior = current.exists ? current.data() as PostPurchaseEnrollment : null;
    if (prior && (prior.sourceOrderId !== order.id || ["cancelled", "complete", "paused"].includes(prior.state))) return prior;
    const item: PostPurchaseEnrollment = { ...(prior || {}), id, programId: "post_purchase_v1", versionId: prior?.versionId || published.versionId, sourceOrderId: order.id, senderKey, permissionState: pref?.state || "unknown", ...(pref?.acceptedAt ? { permissionEvidence: { disclosureVersion: pref.disclosureVersion || "unknown", source: pref.source || "unknown", acceptedAt: pref.acceptedAt } } : {}), mode: prior?.mode || published.mode, stage: prior?.stage || firstStep(published) || "complete", state: prior?.state || "review", eligibility, ...(mailedAt ? { mailingEvidence: { kind: "verified_date" as const, mailedAt, source: order.postPurchaseMailingEvidence!.source } } : {}), createdAt: prior?.createdAt || now, updatedAt: now };
    tx.set(ref, item); return item;
  });
  if (result.sourceOrderId !== order.id) return result;
  if (eligibility.reason === "purchased_again") { await cancelForRepeat(result); return { ...result, state: "cancelled" }; }
  const pinned = await getPostPurchaseVersion(result.versionId);
  const automatic = process.env.POST_PURCHASE_AUTO_ENROLL_ACTIVE === "true" && pinned?.mode === "auto" && live.mode === "auto" && order.purchaseMeasurement.verifiedAt >= (pinned.autoActivatedAt || Number.MAX_SAFE_INTEGER);
  if (automatic && result.state === "review" && eligibility.eligible && !live.globalPaused) return activateReviewedEnrollment(result.id, "automatic");
  return result;
}
export async function createScheduledStep(enrollment: PostPurchaseEnrollment, step: FollowupStep, anchorAt: number, pinned?: PostPurchasePublishedVersion): Promise<PostPurchaseMessage> {
  const version = pinned || await getPostPurchaseVersion(enrollment.versionId);
  if (!version || version.versionId !== enrollment.versionId) throw new Error("Pinned version unavailable");
  const id = `${enrollment.id}_${step}`; const dueAt = await schedulePostPurchaseStep(step, anchorAt, Date.now(), version);
  const message: PostPurchaseMessage = { id, enrollmentId: enrollment.id, sourceOrderId: enrollment.sourceOrderId, step, versionId: enrollment.versionId, state: "scheduled", dueAt };
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(messageRef(id)); const current = await tx.get(enrollmentRef(enrollment.id));
    if (snap.exists) return snap.data() as PostPurchaseMessage;
    if (!current.exists || current.data().state !== "active") throw new Error("Enrollment is no longer active");
    tx.create(messageRef(id), message);
    tx.set(enrollmentRef(enrollment.id), { stage: step, nextDueAt: dueAt, updatedAt: Date.now() }, { merge: true });
    return message;
  });
}
export async function activateReviewedEnrollment(enrollmentId: string, actor: string): Promise<PostPurchaseEnrollment> {
  const snap = await enrollmentRef(enrollmentId).get(); if (!snap.exists) throw new Error("Enrollment not found");
  const item = snap.data() as PostPurchaseEnrollment;
  const order = await getOrderById(item.sourceOrderId); if (!order) throw new Error("Source order not found");
  const pref = await getEmailPreference(effectiveOrderEmail(order)); const eligibility = getPostPurchaseEligibility(order, pref?.state);
  if (!eligibility.eligible || await hasPostPurchaseRefund(order)) throw new Error(`Enrollment is held: ${eligibility.reason}`);
  if (await hasOtherVerifiedPurchase(item.senderKey, order.id, order.purchaseMeasurement!.verifiedAt, "later")) throw new Error("The sender purchased again; follow-ups are stopped.");
  const version = await getPostPurchaseVersion(item.versionId); if (!version) throw new Error("Pinned version unavailable");
  let step = item.stage === "offer" ? "offer" as const : firstStep(version); if (!step) throw new Error("No enabled first step in this version.");
  const initialMessage = await messageRef(`${item.id}_${step}`).get();
  let anchorAt = parseVerifiedMailDate(order)!;
  if (initialMessage.exists && initialMessage.data()?.state === "accepted") {
    if (step !== "check_in" || !version.steps.offer.enabled) throw new Error("This sequence has already completed.");
    step = "offer";
    anchorAt = initialMessage.data()!.acceptedAt;
  } else if (step === "offer" && version.anchor === "accepted_check_in") {
    const accepted = await messageRef(`${item.id}_check_in`).get();
    if (accepted.data()?.state !== "accepted" || !accepted.data()?.acceptedAt) throw new Error("Check-in acceptance is required before this offer.");
    anchorAt = accepted.data()!.acceptedAt;
  }
  const live = await getPostPurchaseConfig(); if (!live.steps[step].enabled) throw new Error("This step is currently held.");
  const mailedAt = parseVerifiedMailDate(order)!;
  const dueAt = await schedulePostPurchaseStep(step, anchorAt, Date.now(), version);
  const id = `${item.id}_${step}`; const now = Date.now();
  return firestoreDb.runTransaction(async (tx: any) => {
    const current = await tx.get(enrollmentRef(item.id)); const message = await tx.get(messageRef(id));
    if (current.data()?.state === "active" && message.exists) return current.data() as PostPurchaseEnrollment;
    if (current.data()?.state !== "review") throw new Error("Enrollment changed; review again.");
    const priorMessage = message.exists ? message.data() as PostPurchaseMessage : null;
    if (priorMessage && (!["held", "scheduled"].includes(priorMessage.state) || priorMessage.dispatchAttemptedAt)) throw new Error("This message needs delivery reconciliation before it can resume.");
    const scheduledAt = priorMessage?.dueAt || dueAt;
    const needsReschedule = scheduledAt < now || scheduledAt < Math.max(live.resumedAt || 0, live.stepResumedAt?.[step] || 0);
    const next = { ...current.data(), state: "active", stage: step, nextDueAt: scheduledAt, eligibility, mailingEvidence: { kind: "verified_date", mailedAt, source: order.postPurchaseMailingEvidence!.source }, activatedBy: actor, updatedAt: now } as PostPurchaseEnrollment;
    const scheduled = { ...(priorMessage || {}), id, enrollmentId: item.id, sourceOrderId: item.sourceOrderId, step, versionId: item.versionId, state: needsReschedule ? "held" : "scheduled", dueAt: scheduledAt, suppressionReason: needsReschedule ? "reviewed_reschedule_required" : "", approvedBy: actor, approvedAt: now };
    if (priorMessage) tx.set(messageRef(id), scheduled); else tx.create(messageRef(id), scheduled);
    tx.set(enrollmentRef(item.id), next); return next;
  });
}
/** Explicit operator action approves this eligible order; automatic callbacks remain review-first. */
export async function enrollPostPurchaseOrder(orderId: string, actor: string): Promise<PostPurchaseEnrollment> {
  const order = await getOrderById(orderId); if (!order) throw new Error("Order not found");
  const email = effectiveOrderEmail(order); const consent = order.postPurchaseConsent;
  if (email && consent) await recordPostPurchaseConsent({ orderId, email, optedIn: consent.optedIn, disclosureVersion: consent.disclosureVersion, source: consent.source, at: consent.recordedAt });
  const item = await onVerifiedPostPurchaseOrder(order); if (!item || item.sourceOrderId !== orderId) throw new Error("This order is not an eligible first purchase.");
  if (item.state === "active") return item;
  return activateReviewedEnrollment(item.id, actor);
}
export { nextStepFor };
