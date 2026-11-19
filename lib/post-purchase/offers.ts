import crypto from "node:crypto";
import { firestoreDb } from "../firebase-admin";
import type { OfferVersionRecord } from "../contracts/admin-overhaul";
import { offerCutoverRef } from "../offer-balances";
import { getOrSyncOfferVersion } from "../offer-engine";
import { ORDER_PRICE_VERSION } from "../order-pricing";
import { getSupplierCountry, VERIFIED_SUPPLIER_COUNTRY_IDS } from "../mailing-destinations";
import { EMPTY_PROMOTION_BALANCE, PROMOTION_SELECTION, type PromotionPolicy } from "../promotions-v2";
import {
  openPromotionCode, promotionCodeId, promotionCodeReferences, promotionLink, promotionUsageRef, readPromotionBalance,
  readPromotionById, readPromotionV2Ready, sealPromotionCode, PROMOTION_CAMPAIGNS, PROMOTION_POLICIES, PROMOTION_CODES,
  type PromotionCampaign, type PromotionCode,
} from "../promotions-v2-store";

export const GRANTS = "post_purchase_offer_grants";
export const GRANT_LOOKUP = "post_purchase_offer_lookup";

export interface FollowupOfferGrant {
  id: string; enrollmentId: string; sourceOrderId: string; messageId: string;
  campaignId: "post_purchase_v1"; code: string; offerId: string; offerUrl: string;
  amountCents: number; createdAt: number; expiresAt: number; codeId?: string;
}
type StoredGrant = Omit<FollowupOfferGrant, "code" | "offerUrl"> & ({ code: string; offerUrl: string } | { sealedCode: string });

function grantId(enrollmentId: string) {
  return crypto.createHash("sha256").update(`post_purchase_v1:${enrollmentId}`).digest("hex");
}

export function legacyGrantLookupId(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function publicGrant(grant: StoredGrant): FollowupOfferGrant {
  if ("code" in grant) return grant;
  const { sealedCode, ...data } = grant;
  const code = openPromotionCode(sealedCode, grant.id);
  return { ...data, code, offerUrl: promotionLink(code, "private") };
}

const FOLLOWUP_PURPOSE = "A thank-you for sending a card";
const FOLLOWUP_COUNTRIES = Object.keys(VERIFIED_SUPPLIER_COUNTRY_IDS).filter((country) => !getSupplierCountry(country)?.suspended);

/** Create the grant and its code atomically. Retries reuse its original terms. */
export async function ensureFollowupOffer(input: { enrollmentId: string; sourceOrderId: string; messageId: string; at?: number; amountCents: number; validDays: number }): Promise<FollowupOfferGrant> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 100 ||
    !Number.isSafeInteger(input.validDays) || input.validDays < 1 || input.validDays > 60) throw new Error("Follow-up offers are capped at $1 and 60 days.");
  const id = grantId(input.enrollmentId);
  const ref = firestoreDb.collection(GRANTS).doc(id);
  const createdAt = input.at ?? Date.now();
  const expiresAt = createdAt + input.validDays * 86_400_000;
  const terms = { id, enrollmentId: input.enrollmentId, sourceOrderId: input.sourceOrderId, messageId: input.messageId,
    campaignId: "post_purchase_v1" as const, amountCents: input.amountCents, createdAt, expiresAt };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `NOTE${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
    const result = await firestoreDb.runTransaction(async (tx) => {
      const old = await tx.get(ref);
      if (old.exists) return old.data() as StoredGrant;
      const migration = (await tx.get(offerCutoverRef())).data();
      if (migration?.state === "fenced") throw new Error("Offer issuance is briefly paused while limits are migrated.");
      const codeRefs = promotionCodeReferences(code);
      const matches = await Promise.all(codeRefs.map((entry) => tx.get(entry)));
      if (matches.some((match) => match.exists)) return null;

      if (migration?.state === "active" && Number.isSafeInteger(migration.cutoverAt)) {
        const codeId = promotionCodeId(code, "private");
        if (!codeId) throw new Error("Private offer issuance is unavailable.");
        const offerId = `retention_${id}`;
        const policy: PromotionPolicy = {
          id: `${offerId}_r1`, campaignId: offerId, version: 1, compatibility: "post_purchase_v1",
          workflow: "single", scheduleVersion: ORDER_PRICE_VERSION, countryCodes: FOLLOWUP_COUNTRIES, match: "all",
          audience: "any", startsAt: createdAt, endsAt: expiresAt, chargeTypes: ["card_base"],
          benefit: { type: "fixed_order", amountCents: input.amountCents }, payableFloor: "reject", selectionStrategy: PROMOTION_SELECTION,
        };
        const campaign: PromotionCampaign = {
          id: offerId, name: FOLLOWUP_PURPOSE, status: "active", revision: 1,
          policyVersionId: policy.id, primaryCodeId: codeId, maxUses: 1, budgetCents: input.amountCents,
          createdAt, updatedAt: createdAt,
        };
        const issued: PromotionCode = { id: codeId, campaignId: offerId, distribution: "private", maxUses: 1, budgetCents: input.amountCents };
        const grant = { ...terms, offerId, codeId, sealedCode: sealPromotionCode(code, id) };
        tx.create(ref, grant);
        tx.create(firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(offerId), campaign);
        tx.create(firestoreDb.collection(PROMOTION_POLICIES).doc(policy.id), policy);
        tx.create(firestoreDb.collection(PROMOTION_CODES).doc(codeId), issued);
        tx.create(firestoreDb.collection(GRANT_LOOKUP).doc(codeId), { grantId: id });
        return grant;
      }

      const offerId = `offer_${code}`;
      const grant = { ...terms, code, offerId, offerUrl: promotionLink(code, "public") };
      const offer: OfferVersionRecord = {
        offerId, version: 1, code, purpose: FOLLOWUP_PURPOSE, campaignId: "post_purchase_v1", destinationPath: "/new",
        discountType: "FIXED_AMOUNT", discountValue: input.amountCents, startsAt: createdAt, endsAt: expiresAt,
        timezone: "America/Chicago", status: "active", maxUses: 1, usedCount: 0, reservedCount: 0,
        dollarBudgetLimitCents: input.amountCents, totalDiscountGivenCents: 0, stackingAllowed: false,
        createdAt, updatedAt: createdAt,
      };
      tx.create(ref, grant);
      tx.create(codeRefs[1], offer);
      tx.create(codeRefs[0], { id: code, code, type: "FIXED_AMOUNT", value: input.amountCents, description: offer.purpose,
        isActive: true, maxUses: 1, usedCount: 0, totalDiscountGivenCents: 0, expiresAt, createdAt, updatedAt: createdAt });
      tx.create(firestoreDb.collection(GRANT_LOOKUP).doc(legacyGrantLookupId(code)), { grantId: id });
      return grant;
    });
    if (result) return publicGrant(result);
  }
  throw new Error("Could not allocate an unused offer code.");
}

export async function getFollowupOfferForEnrollment(enrollmentId: string): Promise<FollowupOfferGrant | null> {
  const snap = await firestoreDb.collection(GRANTS).doc(grantId(enrollmentId)).get();
  return snap.exists ? publicGrant(snap.data() as StoredGrant) : null;
}

export async function isFollowupOfferAvailable(enrollmentId: string, now = Date.now()): Promise<boolean> {
  const snap = await firestoreDb.collection(GRANTS).doc(grantId(enrollmentId)).get();
  const grant = snap.data() as StoredGrant | undefined;
  if (!grant || grant.expiresAt <= now || grant.createdAt > now) return false;
  if (grant.codeId) {
    if (process.env.PROMOTION_V2_RESERVATIONS_DISABLED === "true" || !await readPromotionV2Ready()) return false;
    const resolved = await readPromotionById(grant.codeId);
    if (!resolved || resolved.campaign.status !== "active") return false;
    const [campaign, code] = await Promise.all([
      promotionUsageRef("campaign", resolved.campaign.id).get(), promotionUsageRef("code", grant.codeId).get(),
    ]);
    return [campaign, code].every((snapshot) => {
      const { heldUses, spentUses, heldCents, spentCents } = snapshot.exists ? readPromotionBalance(snapshot) : EMPTY_PROMOTION_BALANCE;
      return heldUses + spentUses === 0 && heldCents + spentCents === 0;
    });
  }
  if (!("code" in grant)) return false;
  const offer = await getOrSyncOfferVersion(grant.code);
  return Boolean(offer && offer.status === "active" && offer.usedCount === 0 && offer.reservedCount === 0 && offer.maxUses === 1);
}
