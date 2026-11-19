import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireAccountActor } from './account/http';
import type { OfferPriceQuoteSnapshot } from './contracts/admin-overhaul';
import { BASE_PRICE_CENTS, INTERNATIONAL_SURCHARGE_CENTS, ORDER_PRICE_VERSION } from './order-pricing';
import { computeOfferLifecycleStatus, getOfferQuotesCollection, getOrSyncOfferVersion } from './offer-engine';
import { evaluatePromotion, MULTISEND_PROMOTION_SCHEDULE, type PromotionBasket, type PromotionEvaluation } from './promotions-v2';
import { readPromotionForCode, readPromotionFromRequestReference, readPromotionUsage, readPromotionV2Ready, promotionReservationsEnabled } from './promotions-v2-store';
import { allocateTotalCents } from './multi-send/contracts';

import { takePromotionAttempt } from './checkout-promotion-limiter';

export const MULTI_SEND_PRICE_VERSION = MULTISEND_PROMOTION_SCHEDULE;
const MAILING_TAX_POLICY = 'included-v1';
const QUOTE_LIFETIME_MS = 30 * 60_000;
export const UNAVAILABLE_PROMOTION = 'This offer is unavailable.';

export function normalizeCheckoutCode(value: unknown) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{2,128}$/.test(code) ? code : '';
}

export async function verifiedPromotionOwner(req: NextRequest) {
  if (!req.headers.has('authorization')) return undefined;
  const actor = await requireAccountActor(req);
  return actor.emailVerified ? actor.uid : undefined;
}

export function checkoutPromotionBasket(input: { recipients: { id: string; countryCode: string | null }[]; workflow: 'single' | 'multisend'; revision: string; ownerUid?: string }): PromotionBasket {
  return {
    currency: 'USD',
    workflow: input.workflow,
    scheduleVersion: input.workflow === 'single' ? ORDER_PRICE_VERSION : MULTI_SEND_PRICE_VERSION,
    revision: input.revision,
    ...(input.ownerUid ? { ownerUid: input.ownerUid } : {}),
    lines: input.recipients.map(({ id, countryCode }) => ({
      id, countryCode, productType: 'card',
      components: [
        { id: `${id}:base`, chargeType: 'card_base', grossCents: BASE_PRICE_CENTS, taxPolicyVersion: MAILING_TAX_POLICY },
        ...(countryCode && countryCode !== 'US' ? [{ id: `${id}:mailing`, chargeType: 'destination_surcharge', grossCents: INTERNATIONAL_SURCHARGE_CENTS, taxPolicyVersion: MAILING_TAX_POLICY }] : []),
      ],
    })),
  };
}

export type CheckoutPriceComponents = ReturnType<typeof checkoutPriceComponents>;

export function checkoutPriceComponents(basket: PromotionBasket, countryCode: string | null, offer?: { discountCents: number; evaluation?: PromotionEvaluation }) {
  const discountCents = offer?.discountCents || 0;
  const basePriceCents = basket.lines.reduce((total, line) => total + line.components.filter((component) => component.chargeType === 'card_base').reduce((sum, component) => sum + component.grossCents, 0), 0);
  const internationalSurchargeCents = basket.lines.reduce((total, line) => total + line.components.filter((component) => component.chargeType === 'destination_surcharge').reduce((sum, component) => sum + component.grossCents, 0), 0);
  const totalCents = basePriceCents + internationalSurchargeCents - discountCents;
  const legacyAllocations = allocateTotalCents(totalCents, basket.lines.length);
  return {
    version: basket.scheduleVersion, countryCode: countryCode || 'US', basePriceCents,
    internationalSurchargeCents, discountCents, totalCents, currency: 'USD' as const,
    lines: offer?.evaluation?.lines || basket.lines.map((line, index) => {
      const grossCents = line.components.reduce((sum, component) => sum + component.grossCents, 0);
      const netCents = legacyAllocations[index];
      const lineDiscountCents = grossCents - netCents;
      return { ...line, grossCents, netCents, discountCents: lineDiscountCents, components: line.components.map((component) => {
        const componentDiscount = component.chargeType === 'card_base' ? lineDiscountCents : 0;
        return { ...component, discountCents: componentDiscount, netCents: component.grossCents - componentDiscount };
      }) };
    }),
  };
}

export function promotionReasonMessage(reason: string, scope?: { countries?: string[]; minimumQuantity?: number; workflow?: string }) {
  switch (reason.toLowerCase()) {
    case 'unknown_country': case 'destination_required': case 'country_required': return 'Choose a destination to check this offer.';
    case 'minimum_quantity': return 'Add one more eligible card to check this offer.';
    case 'minimum_spend': return 'Add eligible cards to reach this offer’s minimum.';
    case 'identity_required': case 'sender_required': return 'Verify to use this offer.';
    case 'sender_limit': case 'customer_limit': return 'You’ve already used this offer the maximum number of times.';
    case 'exhausted': case 'budget_exhausted': case 'use_limit': case 'budget_limit': return 'This offer has reached its redemption limit.';
    case 'expired': return 'This offer has expired.';
    case 'scheduled': case 'not_started': return 'This offer hasn’t started yet.';
    case 'country': case 'wrong_country': case 'country_mismatch': case 'destination_ineligible': return `This offer applies to ${scope?.countries?.join(', ') || 'eligible'} destinations.`;
    case 'workflow': case 'wrong_workflow': case 'workflow_mismatch': return scope?.workflow === 'multisend' ? 'This offer applies to multiple cards sent together.' : 'This offer applies to an eligible single card.';
    case 'rate_limit': return 'Too many offer attempts. Please try again shortly.';
    default: return UNAVAILABLE_PROMOTION;
  }
}

export async function checkoutPromotionDecision(input: {
  req: NextRequest; code?: unknown; reference?: unknown; basket: PromotionBasket; now?: number; durable?: boolean;
  sessionId?: string; journeyId?: string;
}) {
  const { req, basket, sessionId, journeyId } = input;
  const now = input.now ?? Date.now();
  const code = normalizeCheckoutCode(input.code);
  const reference = typeof input.reference === 'string' && input.reference ? input.reference : undefined;
  const plain = checkoutPriceComponents(basket, basket.lines[0]?.countryCode);
  const decline = (reason: string, error = promotionReasonMessage(reason), details?: { requiresExchange?: boolean }) => ({
    valid: false as const, reason, error, price: plain, ...details,
  });
  if (input.durable && (code || reference) && !(await takePromotionAttempt(req)).allowed) return decline('rate_limit');
  const resolved = reference ? await readPromotionFromRequestReference(req, reference) : code ? await readPromotionForCode(code) : null;
  if (resolved) {
    if (!promotionReservationsEnabled(basket.workflow, basket.lines.map((line) => line.countryCode)) || !await readPromotionV2Ready()) return decline('unavailable');
    if (resolved.code.distribution === 'private' && !reference) return decline('private_link_required', UNAVAILABLE_PROMOTION, { requiresExchange: true });
    const { usage } = await readPromotionUsage(resolved, basket);
    const evaluation = evaluatePromotion(resolved.policy, basket, now, usage);
    if (!evaluation.eligible) {
      const scope = resolved.code.distribution === 'public' ? { countries: resolved.policy.countryCodes, workflow: resolved.policy.workflow } : undefined;
      return decline(evaluation.reason, promotionReasonMessage(evaluation.reason, scope));
    }
    const price = checkoutPriceComponents(basket, basket.lines[0]?.countryCode, { discountCents: evaluation.discountCents, evaluation });
    const snapshot: OfferPriceQuoteSnapshot = {
      quoteId: `quote_${randomUUID()}`, offerId: resolved.campaign.id, offerVersion: resolved.policy.version ?? resolved.campaign.revision,
      code: resolved.code.distribution === 'private' ? resolved.code.id : code || resolved.code.id,
      basePriceCents: price.basePriceCents, discountAmountCents: price.discountCents, payableAmountCents: price.totalCents,
      issuedAt: now, expiresAt: now + QUOTE_LIFETIME_MS, isStale: false, currency: 'USD',
      promotion: { basket, evaluation, campaignId: resolved.campaign.id, codeId: resolved.code.id, policyVersionId: resolved.policy.id },
    };
    if (input.durable) await getOfferQuotesCollection().doc(snapshot.quoteId).set(snapshot);
    return { valid: true as const, price, code: snapshot.code, privateOffer: resolved.code.distribution === 'private', type: 'FIXED_AMOUNT' as const, value: price.discountCents, quote: input.durable ? snapshot : undefined };
  }
  if (reference) return decline('unavailable');
  if (!code) return input.code ? decline('unavailable') : { valid: true as const, price: plain, code: '', privateOffer: false, type: 'FIXED_AMOUNT' as const, value: 0, quote: undefined };

  const legacy = await getOrSyncOfferVersion(code);
  if (!legacy) return decline('unavailable');
  const status = computeOfferLifecycleStatus(legacy, now);
  if (legacy.status !== 'active' || status !== 'active') return decline(legacy.status !== 'active' ? legacy.status : status);
  if (legacy.perCustomerLimit && !basket.ownerUid) return decline('identity_required');
  const benefit = legacy.discountType === 'PERCENTAGE'
    ? Math.round(BASE_PRICE_CENTS * Math.max(0, Math.min(100, legacy.discountValue)) / 100)
    : Math.max(0, legacy.discountValue);
  const discountCents = Math.min(BASE_PRICE_CENTS, benefit);
  if ((legacy.dollarBudgetLimitCents || 0) > 0 && (legacy.totalDiscountGivenCents || 0) + (legacy.heldDiscountCents || 0) + discountCents > legacy.dollarBudgetLimitCents!) return decline('exhausted');
  const price = checkoutPriceComponents(basket, basket.lines[0]?.countryCode, { discountCents });
  if (price.totalCents > 0 && price.totalCents < 50) return decline('unsupported_total');
  if (price.totalCents === 0 && (basket.workflow !== 'single' || basket.lines[0]?.countryCode !== 'US')) return decline(basket.lines[0]?.countryCode ? 'unsupported_total' : 'country_required');
  const snapshot: OfferPriceQuoteSnapshot = {
    quoteId: `quote_${randomUUID()}`, offerId: legacy.offerId, offerVersion: legacy.version, code,
    basePriceCents: BASE_PRICE_CENTS, discountAmountCents: discountCents, payableAmountCents: BASE_PRICE_CENTS - discountCents,
    issuedAt: now, expiresAt: now + QUOTE_LIFETIME_MS, isStale: false, currency: 'USD',
    ...(sessionId ? { sessionId } : {}), ...(journeyId ? { journeyId } : {}),
  };
  if (input.durable) await getOfferQuotesCollection().doc(snapshot.quoteId).set(snapshot);
  return { valid: true as const, price, code, privateOffer: false, type: legacy.discountType, value: legacy.discountValue, description: legacy.purpose, quote: input.durable ? snapshot : undefined };
}
