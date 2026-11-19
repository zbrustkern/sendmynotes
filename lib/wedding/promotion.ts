import type { Transaction } from "firebase-admin/firestore";
import { firestoreDb } from "../firebase-admin";
import { evaluatePromotion, type PromotionBasket } from "../promotions-v2";
import { readPromotionById, readPromotionForCode, readPromotionUsage } from "../promotions-v2-store";
import {
  applyOfferCounterDeltas, offerAllowanceFits, promotionCounterDeltas, readOfferCounterDeltas,
  type OfferCounterDelta,
} from "../offer-balances";
import type { WeddingActor } from "./domain";
import { digest, type WeddingQuote } from "./finance";
import { WeddingError } from "./server";

export function weddingPromotionBasket(actor: WeddingActor, quote: WeddingQuote): PromotionBasket {
  return {
    workflow: "wedding", scheduleVersion: quote.pricingVersion, currency: quote.currency,
    revision: quote.id, projectId: actor.projectId, canPayProject: actor.role === "owner" || !!actor.canPay,
    ...(actor.verified && actor.uid ? { ownerUid: actor.uid } : {}),
    lines: quote.lines.map(line => ({
      id: line.householdId, productType: "card", countryCode: line.country, projectOrdinal: line.ordinal,
      components: [
        { id: "card", chargeType: "card_base", grossCents: line.baseCents, taxPolicyVersion: quote.tax.version },
        ...(line.mailingCents ? [{ id: "mailing", chargeType: "destination_surcharge", grossCents: line.mailingCents, taxPolicyVersion: quote.tax.version }] : []),
      ],
    })),
  };
}

export async function prepareWeddingPromotion(tx: Transaction, actor: WeddingActor, base: WeddingQuote, code: string | { issuedId: string }) {
  if (base.tax.calculation !== "unassessed" || base.tax.mode !== "inclusive")
    throw new WeddingError("promotion_tax", "This price schedule cannot accept an offer.", 409);
  const resolved = typeof code === "string" ? await readPromotionForCode(code, tx) : await readPromotionById(code.issuedId, tx);
  const unavailable = () => new WeddingError("offer_unavailable", "This offer is unavailable for these envelopes. Remove it to review regular pricing.", 409);
  if (!resolved || process.env.PROMOTION_WEDDING_CHECKOUT_READY !== "true") throw unavailable();
  const basket = weddingPromotionBasket(actor, base);
  const { usage, balances } = await readPromotionUsage(resolved, basket, tx);
  const decision = evaluatePromotion(resolved.policy, basket, Date.now(), usage);
  if (!decision.eligible || !decision.discountCents || decision.netCents < 50) throw unavailable();
  const deltas = promotionCounterDeltas(balances, decision.discountCents, decision.selectedUnits);
  if (!balances.every((balance, i) => offerAllowanceFits(balance, deltas[i]))) throw unavailable();
  const promotion = {
    campaignId: resolved.campaign.id, codeId: resolved.code.id, policyVersionId: resolved.policy.id,
    savingsCents: decision.discountCents, remainingProjectUnits: decision.remainingProjectUnits ?? null,
    remainingProjectCents: decision.remainingProjectCents ?? null,
  };
  const byId = new Map(decision.lines.map(line => [line.id, line]));
  const lines = base.lines.map(line => {
    const priced = byId.get(line.householdId);
    if (!priced || priced.grossCents !== line.totalCents) throw unavailable();
    return { ...line, totalCents: priced.netCents, allocatedPromotion: priced.components };
  });
  const quote: WeddingQuote = {
    ...base, appliedPromotions: decision.appliedPromotions, promotion, lines, totalCents: decision.netCents,
    id: digest([base.id, promotion, lines.map(l => [l.householdId, l.totalCents, l.allocatedPromotion])]),
  };
  return { quote, deltas, reserve: () => applyOfferCounterDeltas(tx, deltas, new Map(balances.map(b => [b.ref.id,b])), "hold") };
}

export async function finalizeWeddingPromotion(tx: Transaction, batch: {
  id: string; quote: WeddingQuote; promotionDeltas?: OfferCounterDelta[];
}, operation: "consume" | "release", captureId?: string) {
  if (!batch.quote.promotion) return;
  const deltas = batch.promotionDeltas;
  if (!deltas?.length) throw new Error("Missing reserved wedding promotion balances.");
  const previous = await readOfferCounterDeltas(tx, deltas);
  applyOfferCounterDeltas(tx, deltas, previous, operation);
  if (operation === "consume") {
    const p = batch.quote.promotion;
    tx.create(firestoreDb.collection("offer_redemptions").doc("redemption_" + batch.id), {
      orderId: batch.id, offerId: p.campaignId, campaignId: p.campaignId, codeId: p.codeId,
      policyVersionId: p.policyVersionId, quoteId: batch.quote.id, verifiedCaptureId: captureId,
      discountAmountCents: p.savingsCents, payableAmountCents: batch.quote.totalCents,
      redeemedAt: Date.now(), commercialKind: "discounted_paid", refunded: false, refundRestoredUsage: false,
    });
  }
}
