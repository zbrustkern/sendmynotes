import crypto from "crypto";
import { firestoreDb, getOrdersCollection } from "../firebase-admin";
import type { Order } from "../types";
import { getSenderKey } from "./preferences";
import { GRANTS, type FollowupOfferGrant } from "./offers";

/** Operational association only. Never modifies acquisition or sends data to advertising services. */
export async function recordPostPurchaseAttribution(order: Order): Promise<void> {
  if (!order.purchaseMeasurement?.eligible || order.isTest || order.isComp || order.isFounderTest) return;
  const senderKey = order.customerEmail ? getSenderKey(order.customerEmail) : undefined;
  const ref = getOrdersCollection().doc(order.id);
  const code = order.discountCode?.trim().toUpperCase();
  const lookup = code ? await firestoreDb.collection("post_purchase_offer_lookup").doc(crypto.createHash("sha256").update(code).digest("hex")).get() : null;
  const grantSnap = lookup?.exists ? await firestoreDb.collection(GRANTS).doc(lookup.data()!.grantId).get() : null;
  const grant = grantSnap?.exists ? grantSnap.data() as FollowupOfferGrant : null;
  const source = grant ? await getOrdersCollection().doc(grant.sourceOrderId).get() : null;
  const observed = order.postPurchaseLinkObservation;
  const verifiedAt = order.purchaseMeasurement.verifiedAt;
  const validObserved = observed && observed.expiresAt > verifiedAt && observed.observedAt <= verifiedAt + 5 * 60000 && verifiedAt - observed.observedAt <= 7 * 86400000;
  const linkSource = validObserved ? await getOrdersCollection().doc(observed.sourceOrderId).get() : null;
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref); if (!snap.exists) return;
    const current = snap.data() as Order;
    const identity = current.postPurchaseSenderKey || senderKey;
    const redemption = grant ? await tx.get(firestoreDb.collection("offer_redemptions").doc(`redemption_${order.id}`)) : null;
    const patch: Record<string, unknown> = {};
    if (identity && !current.postPurchaseSenderKey) patch.postPurchaseSenderKey = identity;
    // A clicked link or quoted discount is not a redemption or purchase.
    if (grant && redemption?.exists && redemption.data()?.offerId === grant.offerId && current.retentionAttribution?.method !== "redeemed_code") {
      const sourceKey = source?.data()?.postPurchaseSenderKey;
      patch.retentionAttribution = { schemaVersion: 1, campaignId: "post_purchase_v1", enrollmentId: grant.enrollmentId, messageId: grant.messageId, grantId: grant.id, sourceOrderId: grant.sourceOrderId, method: "redeemed_code", observedAt: current.purchaseMeasurement!.verifiedAt, buyerAssociation: !identity || !sourceKey ? "unknown" : identity === sourceKey ? "observed_repeat" : "different_email_possible_referral" };
    }
    if (!patch.retentionAttribution && !current.retentionAttribution && validObserved) {
      const sourceKey = linkSource?.data()?.postPurchaseSenderKey;
      patch.retentionAttribution = { schemaVersion: 1, campaignId: "post_purchase_v1", enrollmentId: observed.enrollmentId, messageId: observed.messageId, sourceOrderId: observed.sourceOrderId, method: "observed_link", observedAt: observed.observedAt, buyerAssociation: !identity || !sourceKey ? "unknown" : identity === sourceKey ? "observed_repeat" : "different_email_possible_referral" };
    }
    if (Object.keys(patch).length) tx.update(ref, patch);
  });
}

/** Optional behavioral association is admitted separately from the acquisition snapshot. */
export async function validateFollowupLinkForCheckout(raw: unknown, analyticsAllowed: boolean, now = Date.now()): Promise<Order["postPurchaseLinkObservation"] | undefined> {
  if (!analyticsAllowed || !raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.reference !== "string" || typeof value.observedAt !== "number") return undefined;
  try {
    const { resolveFollowupLink, hasRecentFollowupLinkObservation } = await import("./links");
    if (!await hasRecentFollowupLinkObservation(value.reference, value.observedAt, now)) return undefined;
    const mapping = await resolveFollowupLink(value.reference, now);
    return mapping ? { ...mapping, observedAt: value.observedAt } : undefined;
  } catch { return undefined; } // Optional analytics cannot block payment.
}
