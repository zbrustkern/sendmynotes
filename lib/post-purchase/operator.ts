import { firestoreDb, getOrderById, getOrdersCollection } from "../firebase-admin";
import { renderPostPurchaseEmail } from "../email/post-purchase";
import { getPublishedPostPurchaseConfig } from "./config";
import { getPostPurchaseEligibility, parseVerifiedMailDate } from "./enrollment";
import { ENROLLMENTS, getMessage, MESSAGES } from "./repository";
import { getEmailPreference, maskEmail } from "./preferences";
import { GRANTS, type FollowupOfferGrant } from "./offers";
import type { Order } from "../types";
import type { FollowupStep, PostPurchaseEligibility, PostPurchaseEnrollment, PostPurchaseMessage, PostPurchasePublishedVersion } from "./contracts";

export interface PostPurchaseCandidate {
  orderId: string;
  maskedEmail?: string;
  paymentEvidence: "verified" | "unverified";
  mailingEvidence?: string;
  permissionState: string;
  eligibility: PostPurchaseEligibility;
  stage?: FollowupStep | "complete";
  dueAt?: number;
  state?: string;
  offerStatus?: string;
}
function safeMaskEmail(email: string): string | undefined {
  try { return maskEmail(email); } catch { return undefined; }
}

export async function listPostPurchaseCandidates(options: { limit?: number } = {}): Promise<{ items: PostPurchaseCandidate[]; count: number; scanned: number; truncated: boolean }> {
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 25)));
  // Bound reads while finding paid-capture candidates; permission and order
  // eligibility are checked below from authoritative order/preference data.
  const scanLimit = Math.min(400, limit * 4);
  const snapshot = await getOrdersCollection().orderBy("createdAt", "desc").limit(scanLimit).get();
  const items: PostPurchaseCandidate[] = [];
  for (const doc of snapshot.docs) {
    const order = doc.data() as Order;
    let pref: Awaited<ReturnType<typeof getEmailPreference>> = null;
    if (typeof order.customerEmail === "string" && order.customerEmail) {
      try { pref = await getEmailPreference(order.customerEmail); } catch { /* Missing HMAC configuration fails closed as unknown. */ }
    }
    const permission = pref?.state || "unknown";
    const enrollmentSnapshot = await firestoreDb.collection(ENROLLMENTS)
      .where("sourceOrderId", "==", doc.id).where("programId", "==", "post_purchase_v1").limit(1).get();
    const enrolled = !enrollmentSnapshot.empty;
    const eligibility = getPostPurchaseEligibility(order, permission, enrolled);
    const enrollment = enrolled ? enrollmentSnapshot.docs[0].data() as PostPurchaseEnrollment : undefined;
    let message: PostPurchaseMessage | undefined;
    if (enrollment?.id) {
      const messageSnapshot = await firestoreDb.collection(MESSAGES).where("enrollmentId", "==", enrollment.id).limit(10).get();
      message = messageSnapshot.docs.map(entry => entry.data() as PostPurchaseMessage).sort((a, b) => Number(b.dueAt || 0) - Number(a.dueAt || 0))[0];
    }
    let offerStatus: string | undefined;
    if (enrollment?.offerGrantId) {
      const grant = await firestoreDb.collection(GRANTS).doc(enrollment.offerGrantId).get();
      if (grant.exists) {
        const data = grant.data() as FollowupOfferGrant;
        offerStatus = data.expiresAt <= Date.now() ? "expired" : "issued";
      }
    }
    const mailedAt = parseVerifiedMailDate(order);
    items.push({
      orderId: doc.id,
      ...(order.customerEmail && safeMaskEmail(order.customerEmail) ? { maskedEmail: safeMaskEmail(order.customerEmail) } : {}),
      paymentEvidence: order.purchaseMeasurement?.eligible === true ? "verified" : "unverified",
      ...(mailedAt ? { mailingEvidence: `Verified mailed ${new Date(mailedAt).toISOString()}` } : {}),
      permissionState: permission,
      eligibility,
      ...(enrollment ? { stage: enrollment.stage, state: enrollment.state } : {}),
      ...(message?.dueAt ? { dueAt: message.dueAt } : {}),
      ...(offerStatus ? { offerStatus } : {}),
    });
    if (items.length >= limit) break;
  }
  return { items, count: items.length, scanned: snapshot.size, truncated: snapshot.size === scanLimit };
}

export async function previewPostPurchaseEnrollment(orderId: string): Promise<PostPurchaseCandidate> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found");
  let pref: Awaited<ReturnType<typeof getEmailPreference>> = null;
  if (order.customerEmail) {
    try { pref = await getEmailPreference(order.customerEmail); } catch { /* Missing HMAC configuration is permission unknown. */ }
  }
  const existing = await firestoreDb.collection(ENROLLMENTS).where("sourceOrderId", "==", orderId).where("programId", "==", "post_purchase_v1").limit(1).get();
    const enrollment = existing.empty ? undefined : existing.docs[0].data() as PostPurchaseEnrollment;
  const mailedAt = parseVerifiedMailDate(order);
  return {
    orderId,
    ...(order.customerEmail && safeMaskEmail(order.customerEmail) ? { maskedEmail: safeMaskEmail(order.customerEmail) } : {}),
    paymentEvidence: order.purchaseMeasurement?.eligible === true ? "verified" : "unverified",
    ...(mailedAt ? { mailingEvidence: `Verified mailed ${new Date(mailedAt).toISOString()}` } : {}),
    permissionState: pref?.state || "unknown",
    eligibility: getPostPurchaseEligibility(order, pref?.state, Boolean(enrollment)),
    ...(enrollment ? { stage: enrollment.stage, state: enrollment.state } : {}),
  };
}

export async function previewPostPurchaseMessage(input: { orderId?: string; step: FollowupStep; version?: PostPurchasePublishedVersion }): Promise<Record<string, unknown>> {
  const version = input.version || await getPublishedPostPurchaseConfig();
  if (!version) throw new Error("Publish or provide a template version before previewing.");
  let eligibility: PostPurchaseEligibility | undefined;
  if (input.orderId) {
    const order = await getOrderById(input.orderId);
    if (!order) throw new Error("Order not found");
    let pref: Awaited<ReturnType<typeof getEmailPreference>> = null;
    if (order.customerEmail) {
      try { pref = await getEmailPreference(order.customerEmail); } catch { /* Missing HMAC configuration is permission unknown. */ }
    }
    eligibility = getPostPurchaseEligibility(order, pref?.state);
  }
  const rendered = renderPostPurchaseEmail(version, input.step, {
    greeting: "Hi there,",
    cardPhrase: "your card",
    offerAmount: `$${(version.offer.amountCents / 100).toFixed(0)}`,
    offerCode: "EXAMPLE-NOT-A-REAL-CODE",
    offerUrl: "#preview",
    expiryDisplay: "a sample expiration date",
    unsubscribeUrl: "#preview",
    businessPostalAddress: "Example business address",
  });
  return { ...rendered, versionId: version.versionId, eligibility, offerRedeemable: false, recipient: "synthetic@example.invalid" };
}

export async function reconcilePostPurchaseMessage(messageId: string): Promise<Record<string, unknown>> {
  const message = await getMessage(messageId);
  if (!message) throw new Error("Message not found");
  const idempotencyWindowEndsAt = message.dispatchAttemptedAt ? message.dispatchAttemptedAt + 24 * 60 * 60_000 : undefined;
  return {
    messageId: message.id,
    state: message.state,
    step: message.step,
    dueAt: message.dueAt,
    dispatchAttemptedAt: message.dispatchAttemptedAt,
    acceptedAt: message.acceptedAt,
    providerIdPresent: Boolean(message.resendId),
    payloadFrozen: Boolean(message.payloadHash),
    idempotencyWindowEndsAt,
    suppressed: Boolean(message.suppressionReason),
    readOnly: true,
    externalProviderQueried: false,
  };
}
