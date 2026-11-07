import crypto from "crypto";
import { firestoreDb } from "../firebase-admin";
import type { OfferVersionRecord } from "../contracts/admin-overhaul";

export const GRANTS = "post_purchase_offer_grants";
export interface FollowupOfferGrant {
  id: string; enrollmentId: string; sourceOrderId: string; messageId: string;
  campaignId: "post_purchase_v1"; code: string; offerId: string; offerUrl: string;
  amountCents: number; createdAt: number; expiresAt: number;
}
/** Create the private association and existing-engine coupon atomically. Retries reuse frozen terms. */
export async function ensureFollowupOffer(input: { enrollmentId: string; sourceOrderId: string; messageId: string; at?: number; amountCents: number; validDays: number }): Promise<FollowupOfferGrant> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 100 || !Number.isSafeInteger(input.validDays) || input.validDays < 1 || input.validDays > 60) throw new Error("Follow-up offers are capped at $1 and 60 days.");
  const id = crypto.createHash("sha256").update(`post_purchase_v1:${input.enrollmentId}`).digest("hex");
  const ref = firestoreDb.collection(GRANTS).doc(id);
  const at = input.at ?? Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `NOTE${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
    const offerId = `offer_${code}`;
    const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com");
    if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("Invalid offer destination");
    const url = new URL("/new", base); url.searchParams.set("discount", code);
    const grant: FollowupOfferGrant = { id, enrollmentId: input.enrollmentId, sourceOrderId: input.sourceOrderId, messageId: input.messageId, campaignId: "post_purchase_v1", code, offerId, offerUrl: url.toString(), amountCents: input.amountCents, createdAt: at, expiresAt: at + input.validDays * 86400000 };
    const result = await firestoreDb.runTransaction(async (tx: any) => {
      const old = await tx.get(ref);
      if (old.exists) return old.data() as FollowupOfferGrant;
      const versionRef = firestoreDb.collection("offer_versions").doc(`${offerId}_v1`);
      const codeRef = firestoreDb.collection("discount_codes").doc(code);
      const [version, legacy] = await Promise.all([tx.get(versionRef), tx.get(codeRef)]);
      if (version.exists || legacy.exists) return null;
      const offer: OfferVersionRecord = { offerId, version: 1, code, purpose: "A thank-you for sending a card", campaignId: "post_purchase_v1", destinationPath: "/new", discountType: "FIXED_AMOUNT", discountValue: input.amountCents, startsAt: at, endsAt: grant.expiresAt, timezone: "America/Chicago", status: "active", maxUses: 1, usedCount: 0, reservedCount: 0, dollarBudgetLimitCents: input.amountCents, totalDiscountGivenCents: 0, stackingAllowed: false, createdAt: at, updatedAt: at };
      tx.create(ref, grant);
      tx.create(versionRef, offer);
      tx.create(codeRef, { id: code, code, type: "FIXED_AMOUNT", value: input.amountCents, description: offer.purpose, isActive: true, maxUses: 1, usedCount: 0, totalDiscountGivenCents: 0, expiresAt: grant.expiresAt, createdAt: at, updatedAt: at });
      // Lookup uses a hash so raw coupons need not appear in operational query paths.
      tx.create(firestoreDb.collection("post_purchase_offer_lookup").doc(crypto.createHash("sha256").update(code).digest("hex")), { grantId: id });
      return grant;
    });
    if (result) return result;
  }
  throw new Error("Could not allocate an unused offer code.");
}

export async function getFollowupOfferForEnrollment(enrollmentId: string): Promise<FollowupOfferGrant | null> {
  const id = crypto.createHash("sha256").update(`post_purchase_v1:${enrollmentId}`).digest("hex");
  const snap = await firestoreDb.collection(GRANTS).doc(id).get();
  return snap.exists ? snap.data() as FollowupOfferGrant : null;
}
export async function isFollowupOfferAvailable(enrollmentId: string, now = Date.now()): Promise<boolean> {
  const grant = await getFollowupOfferForEnrollment(enrollmentId);
  if (!grant || grant.expiresAt <= now) return false;
  const snap = await firestoreDb.collection("offer_versions").doc(`${grant.offerId}_v1`).get();
  const offer = snap.data() as OfferVersionRecord | undefined;
  return Boolean(offer && offer.status === "active" && offer.usedCount === 0 && (offer.startsAt || 0) <= now && (offer.endsAt || 0) > now && offer.maxUses === 1);
}
