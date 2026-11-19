/**
 * lib/offer-engine.ts
 *
 * SPRINT-0005: Offer Lifecycle, Quotes, Reservations & Redemptions Engine
 * Adheres to Contract 4 in lib/contracts/admin-overhaul.ts:
 * - Versioned offers & backward-compatible bridging with discount_codes
 * - Authoritative server-side price quotes with 30-minute validity
 * - Transactional slot & budget reservations with automatic expiry cleanup
 * - Concurrency protection: under simultaneous final-slot requests, strictly 1 succeeds
 * - Semantic order-linked redemption: exactly-once consumption on verified capture or free order
 * - Explicit refund policy: REFUND_RESTORES_OFFER_USAGE = false
 * - Destination-aware URL parameter extraction (?discount=, ?code=, ?promo=)
 * - Analytics reporting with costStatus: "unconfirmed" when supplier cost is unknown
 */

import { isDeepStrictEqual } from "node:util";
import { firestoreDb, getDiscountCodesCollection, getOrdersCollection, sanitizeFirestoreData } from "./firebase-admin";
import { evaluatePromotion } from "./promotions-v2";
import { promotionReservationsEnabled, readPromotionById, readPromotionUsage } from "./promotions-v2-store";
import { offerBalance, offerBalanceRef, offerAllowanceFits, offerCutoverRef, legacyOfferBaselineRef, promotionCounterDeltas, readOfferCounterDeltas, applyOfferCounterDeltas, type OfferCounterDelta, type OfferCounterLimit } from "./offer-balances";
import type { CreateIntentParams } from "./stripe";
import type { PaymentMode } from "./payment-mode";
import type { Order } from "./types";
import {
  OfferLifecycleStatus,
  OfferVersionRecord,
  OfferPriceQuoteSnapshot,
  OfferReservationRecord,
  OfferRedemptionRecord,
  CommercialKind,
  LEGACY_OFFER_URL_PARAMS,
  DEFAULT_QUOTE_VALIDITY_MS,
  MAX_ACTIVE_OFFERS_PER_ORDER,
  REFUND_RESTORES_OFFER_USAGE,
} from "./contracts/admin-overhaul";
import { DiscountCode } from "./types";
import { CARD_FLAT_RATE_CENTS } from "./stripe";

// Collection names
export const OFFER_VERSIONS_COLLECTION = "offer_versions";
export const OFFER_QUOTES_COLLECTION = "offer_quotes";
export const OFFER_RESERVATIONS_COLLECTION = "offer_reservations";
export const OFFER_REDEMPTIONS_COLLECTION = "offer_redemptions";

export const getOfferVersionsCollection = () => firestoreDb.collection(OFFER_VERSIONS_COLLECTION);
export const getOfferQuotesCollection = () => firestoreDb.collection(OFFER_QUOTES_COLLECTION);
export const getOfferReservationsCollection = () => firestoreDb.collection(OFFER_RESERVATIONS_COLLECTION);
export const getOfferRedemptionsCollection = () => firestoreDb.collection(OFFER_REDEMPTIONS_COLLECTION);

export { recordOfferRefundOutcome } from "./offer-refunds";

export {
  LEGACY_OFFER_URL_PARAMS,
  DEFAULT_QUOTE_VALIDITY_MS,
  MAX_ACTIVE_OFFERS_PER_ORDER,
  REFUND_RESTORES_OFFER_USAGE,
};

// ============================================================================
// 1. URL Parameter Extraction (SPRINT-0005-T01, AC01)
// ============================================================================

/**
 * Extracts and normalizes an offer/promo code from various query input shapes:
 * URLSearchParams, Next.js searchParams object, query string, or plain URL.
 * Checks aliases in priority order: 'discount', 'code', 'promo'.
 * Normalizes to trimmed, uppercase string. Returns null if none found.
 */
export function extractOfferCodeFromUrlParams(
  input?: URLSearchParams | Record<string, string | string[] | undefined> | string | null
): string | null {
  if (!input) return null;

  let params: URLSearchParams;
  if (input instanceof URLSearchParams) {
    params = input;
  } else if (typeof input === "string") {
    try {
      if (input.includes("?")) {
        params = new URL(input, "https://sendmynotes.com").searchParams;
      } else if (input.includes("=")) {
        params = new URLSearchParams(input);
      } else {
        // Plain string code passed directly
        const clean = input.trim().toUpperCase();
        return clean.length >= 2 ? clean : null;
      }
    } catch {
      params = new URLSearchParams(input);
    }
  } else if (typeof input === "object") {
    // Plain object like Next.js page searchParams
    for (const key of LEGACY_OFFER_URL_PARAMS) {
      const val = input[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim().toUpperCase();
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string" && val[0].trim().length > 0) {
        return val[0].trim().toUpperCase();
      }
    }
    return null;
  } else {
    return null;
  }

  for (const key of LEGACY_OFFER_URL_PARAMS) {
    const val = params.get(key);
    if (val && val.trim().length > 0) {
      return val.trim().toUpperCase();
    }
  }

  return null;
}

// ============================================================================
// 2. Offer Lifecycle Status (SPRINT-0005-T01)
// ============================================================================

export interface LifecycleEvaluationInput {
  status?: OfferLifecycleStatus | string;
  isActive?: boolean;
  startsAt?: number | null;
  endsAt?: number | null;
  expiresAt?: number | null;
  maxUses?: number | null;
  usedCount?: number;
  dollarBudgetLimitCents?: number | null;
  totalDiscountGivenCents?: number;
}

/**
 * Authoritatively computes the dynamic lifecycle status of an offer version.
 */
export function computeOfferLifecycleStatus(
  offer: LifecycleEvaluationInput,
  nowMs: number = Date.now()
): OfferLifecycleStatus {
  if (offer.status === "archived") return "archived";
  if (offer.status === "draft") return "draft";
  if (offer.isActive === false || offer.status === "paused") return "paused";

  if (offer.startsAt && nowMs < offer.startsAt) {
    return "scheduled";
  }

  const expiration = offer.endsAt ?? offer.expiresAt;
  if (expiration && nowMs >= expiration) {
    return "expired";
  }

  if (offer.maxUses != null && offer.maxUses > 0 && (offer.usedCount || 0) >= offer.maxUses) {
    return "exhausted";
  }

  if (
    offer.dollarBudgetLimitCents != null &&
    offer.dollarBudgetLimitCents > 0 &&
    (offer.totalDiscountGivenCents || 0) >= offer.dollarBudgetLimitCents
  ) {
    return "exhausted";
  }

  return "active";
}

// ============================================================================
// 3. Offer Version Synchronization & Bridging (SPRINT-0005-T01)
// ============================================================================

/**
 * Retrieves an offer version by code, transparently bridging legacy discount_codes
 * into versioned OfferVersionRecord without deleting or mutating existing records.
 */
export async function getOrSyncOfferVersion(
  code: string,
  transaction?: FirebaseFirestore.Transaction
): Promise<OfferVersionRecord | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const versionRef = getOfferVersionsCollection().doc(`offer_${normalized}_v1`);
  const legacyRef = getDiscountCodesCollection().doc(normalized);
  const usageRef = offerBalanceRef("code", normalized);
  const checkpointRef = legacyOfferBaselineRef(normalized);
  const [versionDoc, legacySnap, usageSnap, checkpoint] = await Promise.all(
    [versionRef, legacyRef, usageRef, checkpointRef].map((ref) => transaction ? transaction.get(ref) : ref.get()),
  );
  const legacy = legacySnap.data() as DiscountCode | undefined;
  const offer = (versionDoc.data() as OfferVersionRecord | undefined) ?? (legacy ? legacyOfferTerms(normalized, legacy) : null);
  if (!offer) return null;
  const usage = usageSnap.exists ? offerBalance(usageSnap.data()) : null;
  const merged = {
    ...offer, usedCount: usage?.spentUses ?? offer.usedCount,
    reservedCount: usage?.heldUses ?? offer.reservedCount,
    totalDiscountGivenCents: usage?.spentCents ?? offer.totalDiscountGivenCents,
    heldDiscountCents: usage?.heldCents ?? 0,
  };
  const status = computeOfferLifecycleStatus({
    ...merged, isActive: legacy?.isActive,
    usedCount: merged.usedCount + merged.reservedCount,
    totalDiscountGivenCents: merged.totalDiscountGivenCents + merged.heldDiscountCents,
  });
  return { ...merged, status: checkpoint.data()?.state === "isolated" ? "paused" : status };
}

function legacyOfferTerms(code: string, legacy: DiscountCode, now = Date.now()): OfferVersionRecord {
  return {
    offerId: `offer_${code}`,
    version: 1,
    code,
    purpose: legacy.description || "Promotional Discount",
    destinationPath: "/",
    discountType: legacy.type,
    discountValue: legacy.value,
    startsAt: legacy.createdAt,
    endsAt: legacy.expiresAt || undefined,
    timezone: "UTC",
    status: legacy.isActive ? "active" : "paused",
    maxUses: legacy.maxUses || undefined,
    usedCount: legacy.usedCount || 0,
    reservedCount: 0,
    totalDiscountGivenCents: legacy.totalDiscountGivenCents || 0,
    stackingAllowed: false,
    createdAt: legacy.createdAt || now,
    updatedAt: legacy.updatedAt || now,
  };
}

// ============================================================================
// 4. Authoritative Price Quotes (SPRINT-0005-T02, AC03)
// ============================================================================

export function legacyOfferDiscount(offer: Pick<OfferVersionRecord, "discountType" | "discountValue">) {
  if (offer.discountType === "PERCENTAGE") {
    return Math.round(CARD_FLAT_RATE_CENTS * Math.max(0, Math.min(100, offer.discountValue)) / 100);
  }
  return Math.min(CARD_FLAT_RATE_CENTS, Math.max(0, offer.discountValue));
}

export interface IssueOfferQuoteInput {
  code: string;
  listPriceCents?: number;
  sessionId?: string;
  journeyId?: string;
  nowMs?: number;
}

export interface OfferPriceQuoteResult {
  valid: boolean;
  error?: string;
  quote?: OfferPriceQuoteSnapshot;
  offer?: OfferVersionRecord;
  isFree?: boolean;
  discountAmountInCents?: number;
  finalAmountInCents?: number;
  status?: OfferLifecycleStatus;
}

/**
 * Issues an immutable, authoritative server price quote for an offer.
 * Ignores any client-supplied pricing (always validates against canonical base price 900¢).
 * Persists an OfferPriceQuoteSnapshot valid for 30 minutes.
 */
export async function issueOfferPriceQuote(
  input: IssueOfferQuoteInput
): Promise<OfferPriceQuoteResult> {
  const nowMs = input.nowMs ?? Date.now();
  const normalized = input.code.trim().toUpperCase();

  const offer = await getOrSyncOfferVersion(normalized);
  if (!offer) {
    return {
      valid: false,
      error: "Discount code not found.",
      finalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountAmountInCents: 0,
    };
  }

  const dynamicStatus = computeOfferLifecycleStatus(offer, nowMs);
  if (dynamicStatus === "paused") {
    return {
      valid: false,
      error: "This discount code is currently inactive.",
      status: "paused",
      finalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountAmountInCents: 0,
    };
  }

  if (dynamicStatus === "scheduled") {
    return {
      valid: false,
      error: "This promotional offer has not started yet.",
      status: "scheduled",
      finalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountAmountInCents: 0,
    };
  }

  if (dynamicStatus === "expired") {
    return {
      valid: false,
      error: "This discount code has expired.",
      status: "expired",
      finalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountAmountInCents: 0,
    };
  }

  if (dynamicStatus === "exhausted") {
    return {
      valid: false,
      error: "This discount code has reached its maximum redemptions limit.",
      status: "exhausted",
      finalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountAmountInCents: 0,
    };
  }

  if (dynamicStatus !== "active") {
    return { valid: false, error: "This discount code is unavailable.", status: dynamicStatus, finalAmountInCents: CARD_FLAT_RATE_CENTS, discountAmountInCents: 0 };
  }

  // Canonical base price: ignore client-supplied prices!
  const basePriceCents = CARD_FLAT_RATE_CENTS; // 900
  const discountAmountCents = legacyOfferDiscount(offer);
  const payableAmountCents = Math.max(0, basePriceCents - discountAmountCents);

  const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const expiresAt = nowMs + DEFAULT_QUOTE_VALIDITY_MS;

  const quote: OfferPriceQuoteSnapshot = {
    quoteId,
    offerId: offer.offerId,
    offerVersion: offer.version,
    code: normalized,
    basePriceCents,
    discountAmountCents,
    payableAmountCents,
    issuedAt: nowMs,
    expiresAt,
    isStale: false,
    currency: "USD",
  };

  try {
    await getOfferQuotesCollection().doc(quoteId).set(quote);
  } catch (error) {
    // A quote must be durable before it can authorize checkout.
    throw new Error("Unable to persist authoritative price quote.");
  }

  return {
    valid: true,
    quote,
    offer,
    isFree: payableAmountCents === 0,
    discountAmountInCents: discountAmountCents,
    finalAmountInCents: payableAmountCents,
    status: "active",
  };
}

// ============================================================================
// 5. Checkout Quote Integrity & Stale-Intent Protection (SPRINT-0005-AC03)
// ============================================================================

export interface VerifyQuoteIntegrityInput {
  quoteId?: string;
  code?: string;
  expectedFinalCents?: number;
  paymentIntentAmountCents?: number;
  /** Destination upgrade added after the offer discount, never discounted. */
  surchargeCents?: number;
  /** Extra cards priced at the base rate; offer still discounts one card only. */
  multiSendCount?: number;
  nowMs?: number;
}

export interface QuoteIntegrityResult {
  valid: boolean;
  requiresPriceReconfirmation?: boolean;
  authoritativeFinalCents?: number;
  staleAmountCents?: number;
  reason?: string;
  quote?: OfferPriceQuoteSnapshot;
}

/**
 * Asserts that the PaymentIntent or expected final amount matches the server-authoritative
 * quote snapshot and that the quote is fresh. If an offer expired or changed price,
 * requires explicit price reconfirmation to prevent charging an undisclosed amount.
 */
export async function verifyCheckoutQuoteIntegrity(
  input: VerifyQuoteIntegrityInput
): Promise<QuoteIntegrityResult> {
  const nowMs = input.nowMs ?? Date.now();

  // If a quoteId is supplied, verify against the immutable quote snapshot
  if (input.quoteId) {
    try {
      const quoteDoc = await getOfferQuotesCollection().doc(input.quoteId).get();
      if (quoteDoc.exists) {
        const quote = quoteDoc.data() as OfferPriceQuoteSnapshot;

        // 1. Expiration check
        const surchargeCents = Math.max(0, Math.floor(input.surchargeCents || 0));
        const authoritativeQuotedTotal = frozenOfferTotal(quote, surchargeCents, input.multiSendCount);
        if (nowMs > quote.expiresAt) {
          return {
            valid: false,
            requiresPriceReconfirmation: true,
            authoritativeFinalCents: authoritativeQuotedTotal,
            staleAmountCents: input.paymentIntentAmountCents ?? input.expectedFinalCents,
            reason: "Price quote has expired. Please reconfirm total before paying.",
            quote,
          };
        }

        // 2. Amount match check
        if (
          (input.paymentIntentAmountCents != null && input.paymentIntentAmountCents !== authoritativeQuotedTotal) ||
          (input.expectedFinalCents != null && input.expectedFinalCents !== authoritativeQuotedTotal)
        ) {
          return {
            valid: false,
            requiresPriceReconfirmation: true,
            authoritativeFinalCents: authoritativeQuotedTotal,
            staleAmountCents: input.paymentIntentAmountCents,
            reason: "Payment intent amount or saved total does not match the immutable base quote plus destination surcharge.",
            quote,
          };
        }

        return {
          valid: true,
          authoritativeFinalCents: authoritativeQuotedTotal,
          quote,
        };
      }
    } catch {
      // In-memory or fallback
    }
  }

  if (input.quoteId || input.code) {
    return { valid: false, requiresPriceReconfirmation: true, reason: "The authoritative offer quote is unavailable." };
  }

  // No discount: destination surcharge is added after the canonical domestic base.
  const noDiscountTotal = CARD_FLAT_RATE_CENTS * Math.max(1, Math.floor(input.multiSendCount || 1)) + Math.max(0, Math.floor(input.surchargeCents || 0));
  if (
    (input.paymentIntentAmountCents != null && input.paymentIntentAmountCents !== noDiscountTotal) ||
    (input.expectedFinalCents != null && input.expectedFinalCents !== noDiscountTotal)
  ) {
    return {
      valid: false,
      requiresPriceReconfirmation: true,
      authoritativeFinalCents: noDiscountTotal,
      staleAmountCents: input.paymentIntentAmountCents ?? input.expectedFinalCents,
      reason: "Standard order price does not match the current destination quote.",
    };
  }

  return {
    valid: true,
    authoritativeFinalCents: noDiscountTotal,
  };
}

// ============================================================================
// 6. Transactional Reservations (SPRINT-0005-T02, AC02)
// ============================================================================

export interface ReserveOfferInput {
  code: string;
  orderId: string;
  sessionId: string;
  journeyId?: string;
  quoteId?: string;
  ownerId?: string;
  ownerKey?: string;
  checkoutRevision?: string;
  expectedTotalCents?: number;
  paymentMode?: PaymentMode;
  creationRequest?: CreateIntentParams;
  replaceOrderId?: string;
  nowMs?: number;
  reservationTtlMs?: number;
}

export type OfferHold = OfferReservationRecord & {
  code: string;
  schemaVersion?: 2;
  ownerId?: string;
  ownerKey?: string;
  checkoutRevision?: string;
  expectedTotalCents?: number;
  discountCents?: number;
  currency?: "USD";
  paymentMode?: PaymentMode;
  creationRequest?: CreateIntentParams;
  paymentIntentId?: string;
  deltas?: OfferCounterDelta[];
  nextActionAt?: number;
  revision?: number;
  lease?: { token: string; expiresAt: number };
  reconciliationAttempts?: number;
  legacyVersionId?: string;
};

type LegacyOffer = {
  offer: OfferVersionRecord | null;
  legacy?: DiscountCode;
  version?: OfferVersionRecord;
  versionRef: FirebaseFirestore.DocumentReference;
  legacyRef: FirebaseFirestore.DocumentReference;
};

export interface ReservationResult {
  reserved: boolean;
  duplicate?: boolean;
  error?: string;
  status?: OfferLifecycleStatus;
  reservation?: OfferHold;
}

export function frozenOfferTotal(quote: OfferPriceQuoteSnapshot, surcharge = 0, multiSendCount = 1) {
  return quote.promotion
    ? quote.promotion.evaluation.netCents
    : quote.payableAmountCents + Math.max(0, multiSendCount - 1) * CARD_FLAT_RATE_CENTS + surcharge;
}

const reservationPointer = (orderId: string) => firestoreDb.collection("offer_order_holds").doc(orderId);
const legacyHoldRef = (orderId: string, code: string) => getOfferReservationsCollection().doc(`res_${orderId}_${code}`);
const redemptionRef = (orderId: string) => getOfferRedemptionsCollection().doc(`redemption_${orderId}`);

export async function readOfferHold(tx: FirebaseFirestore.Transaction, orderId: string, code?: string) {
  const pointer = await tx.get(reservationPointer(orderId));
  const existingId = pointer.data()?.reservationId as string | undefined;
  const ref = existingId ? getOfferReservationsCollection().doc(existingId) : code ? legacyHoldRef(orderId, code) : null;
  return ref ? await tx.get(ref) : null;
}

export async function getActiveOfferReservation(orderId: string): Promise<OfferHold | null> {
  return firestoreDb.runTransaction(async (tx) => {
    const order = await tx.get(getOrdersCollection().doc(orderId));
    const snap = await readOfferHold(tx, orderId, order.data()?.discountCode);
    const hold = snap?.data() as OfferHold | undefined;
    return hold?.status === "active" ? hold : null;
  });
}

export async function readLegacyOffer(tx: FirebaseFirestore.Transaction, code: string): Promise<LegacyOffer> {
  const versionRef = getOfferVersionsCollection().doc(`offer_${code}_v1`);
  const legacyRef = getDiscountCodesCollection().doc(code);
  const versionSnap = await tx.get(versionRef);
  const legacySnap = await tx.get(legacyRef);
  const version = versionSnap.data() as OfferVersionRecord | undefined;
  const legacy = legacySnap.data() as DiscountCode | undefined;
  return { offer: version ?? (legacy ? legacyOfferTerms(code, legacy) : null), legacy, version, versionRef, legacyRef };
}

export function legacySpentBaseline(terms: LegacyOffer) {
  const version = terms.version;
  const legacy = terms.legacy;
  const spentUses = version?.usedCount ?? legacy?.usedCount ?? 0;
  const spentCents = version?.totalDiscountGivenCents ?? legacy?.totalDiscountGivenCents ?? 0;
  const disagreements = [
    ["uses", version?.usedCount, legacy?.usedCount],
    ["cents", version?.totalDiscountGivenCents, legacy?.totalDiscountGivenCents],
  ].filter(([, left, right]) => left !== undefined && right !== undefined && left !== right).map(([name]) => name);
  return { spentUses, spentCents, disagreements };
}

function ownerMatches(hold: OfferHold, input: Pick<ReserveOfferInput, "ownerId" | "ownerKey"> & { sessionId?: string }) {
  if (hold.ownerKey) return input.ownerKey === hold.ownerKey;
  if (hold.ownerId) return input.ownerId === hold.ownerId;
  return Boolean(hold.sessionId && input.sessionId === hold.sessionId);
}

function expiryForQuote(input: ReserveOfferInput, quote: OfferPriceQuoteSnapshot) {
  return Math.min(quote.expiresAt, (input.nowMs ?? Date.now()) + (input.reservationTtlMs ?? DEFAULT_QUOTE_VALIDITY_MS));
}

export async function reserveOfferForCheckout(input: ReserveOfferInput): Promise<ReservationResult> {
  const now = input.nowMs ?? Date.now();
  const { orderId, quoteId } = input;
  if (!quoteId || input.replaceOrderId) return { reserved: false, error: "Save the checkout terms and cancel any prior payable attempt before reserving." };
  return firestoreDb.runTransaction(async (tx) => {
    const quoteSnap = await tx.get(getOfferQuotesCollection().doc(quoteId));
    const quote = quoteSnap.data() as OfferPriceQuoteSnapshot | undefined;
    const code = quote?.promotion ? input.code : input.code.trim().toUpperCase();
    if (!quote || quote.code !== code || expiryForQuote({ ...input, nowMs: now }, quote) <= now || quote.discountAmountCents <= 0) {
      return { reserved: false, error: "Authoritative offer quote is missing or expired." };
    }
    const holdSnap = await readOfferHold(tx, orderId, code);
    const prior = holdSnap?.data() as OfferHold | undefined;
    const final = input.expectedTotalCents ?? quote.payableAmountCents;
    if (!Number.isSafeInteger(final) || final < 0 || (final > 0 && final < 50) ||
        (quote.promotion && final !== quote.promotion.evaluation.netCents) ||
        (input.creationRequest && (!input.creationRequest.idempotencyKey || input.creationRequest.orderId !== orderId || input.creationRequest.amountInCents !== final ||
          input.creationRequest.metadata?.quoteId !== quoteId ||
          (input.checkoutRevision && input.creationRequest.metadata?.checkoutRevision !== input.checkoutRevision)))) {
      return { reserved: false, error: "The quoted payable amount or payment attempt is invalid." };
    }
    if (prior?.status === "active") {
      if (prior.expiresAt > now && prior.quoteId === quoteId && ownerMatches(prior, input)
        && prior.checkoutRevision === input.checkoutRevision && (prior.expectedTotalCents === undefined || prior.expectedTotalCents === final)) {
        return { reserved: true, duplicate: true, reservation: prior };
      }
      return { reserved: false, error: "A different offer hold is already bound to this order." };
    }
    if (prior) return { reserved: false, error: "Start a new checkout after closing a previous offer reservation." };
    if ((await tx.get(redemptionRef(orderId))).exists) return { reserved: false, error: "This order already settled." };

    const cutover = await tx.get(offerCutoverRef());
    if (cutover.data()?.state === "fenced" || (quote.promotion && (cutover.data()?.state !== "active" || !Number.isSafeInteger(cutover.data()?.cutoverAt)))) {
      return { reserved: false, error: "Offer reservations are temporarily unavailable." };
    }
    let balances: OfferCounterLimit[];
    let units = 1;
    let seedLegacy = false;
    let legacyVersionId: string | undefined;
    if (quote.promotion) {
      const sale = quote.promotion;
      if (!promotionReservationsEnabled(sale.basket.workflow, sale.basket.lines.map((line) => line.countryCode))) {
        return { reserved: false, error: "Offer reservations are temporarily unavailable." };
      }
      const resolved = await readPromotionById(sale.codeId, tx);
      if (!resolved || resolved.campaign.status !== "active" || resolved.campaign.id !== sale.campaignId || resolved.policy.id !== sale.policyVersionId ||
          sale.basket.ownerUid !== input.ownerId || sale.basket.revision !== input.checkoutRevision) {
        return { reserved: false, error: "This offer changed or is unavailable." };
      }
      const current = await readPromotionUsage(resolved, sale.basket, tx);
      const evaluation = evaluatePromotion(resolved.policy, sale.basket, now, current.usage);
      if (!evaluation.eligible || evaluation.discountCents !== quote.discountAmountCents || evaluation.netCents !== final ||
          !isDeepStrictEqual(sanitizeFirestoreData(evaluation.lines), sale.evaluation.lines)) {
        return { reserved: false, error: "This offer can no longer provide the quoted savings." };
      }
      units = evaluation.selectedUnits;
      balances = current.balances.map((balance) => ({ ...balance, data: offerBalance(balance.data) }));
    } else {
      const legacy = await readLegacyOffer(tx, code);
      if (!legacy.offer || legacy.offer.version !== quote.offerVersion || legacy.offer.offerId !== quote.offerId ||
          legacyOfferDiscount(legacy.offer) !== quote.discountAmountCents) {
        return { reserved: false, error: "Discount code not found." };
      }
      const status = computeOfferLifecycleStatus(legacy.offer, now);
      if (status !== "active" || legacy.legacy?.isActive === false) return { reserved: false, error: "This discount code is unavailable.", status };
      const codeRef = offerBalanceRef("code", code);
      const campaignRef = offerBalanceRef("campaign", legacy.offer.campaignId || legacy.offer.offerId);
      const [codeSnap, campaignSnap, migration] = await Promise.all([tx.get(codeRef), tx.get(campaignRef), tx.get(legacyOfferBaselineRef(code))]);
      if (migration.data()?.state === "isolated") return { reserved: false, error: "This discount code is being reconciled." };
      const baseline = legacySpentBaseline(legacy);
      seedLegacy = !migration.exists;
      if (seedLegacy) {
        const active = await tx.get(getOfferReservationsCollection().where("code", "==", code).where("status", "==", "active").limit(1));
        if (active.size || baseline.disagreements.length) {
          return { reserved: false, error: "This discount code is being reconciled." };
        }
      }
      const maxUses = legacy.offer.maxUses || legacy.legacy?.maxUses || undefined;
      const maxCents = legacy.offer.dollarBudgetLimitCents || undefined;
      const campaignBalance = offerBalance(campaignSnap.data());
      const legacyCampaignBalance = seedLegacy ? offerBalance({
        ...campaignBalance, spentUses: campaignBalance.spentUses + baseline.spentUses, spentCents: campaignBalance.spentCents + baseline.spentCents,
      }) : campaignBalance;
      // Legacy campaignId grouped reporting. Its independently issued grants only limited each code.
      balances = [
        { kind: "code", ref: codeRef, data: offerBalance(codeSnap.data() ?? baseline), maxUses, maxCents },
        { kind: "campaign", ref: campaignRef, data: legacyCampaignBalance },
      ];
      const senderLimit = legacy.offer.perCustomerLimit || undefined;
      if (senderLimit && !input.ownerId) return { reserved: false, error: "Verify to use this offer." };
      if (input.ownerId) {
        const ref = offerBalanceRef("sender", legacy.offer.offerId, input.ownerId);
        balances.push({ kind: "sender", ref, data: offerBalance((await tx.get(ref)).data()), maxUses: senderLimit });
      }
      legacyVersionId = legacy.versionRef.id;
    }
    const deltas = promotionCounterDeltas(balances, quote.discountAmountCents, units);
    if (balances.some((counter, index) => !offerAllowanceFits(counter, deltas[index]))) {
      return { reserved: false, error: "This discount code has reached its redemption or spending limit.", status: "exhausted" };
    }
    const expiresAt = expiryForQuote({ ...input, nowMs: now }, quote);
    const ref = holdSnap?.ref ?? legacyHoldRef(orderId, code);
    const hold: OfferHold = {
      reservationId: ref.id, orderId, schemaVersion: 2, code, quoteId,
      offerId: quote.offerId, offerVersion: quote.offerVersion, sessionId: input.sessionId,
      ownerId: input.ownerId, ownerKey: input.ownerKey, checkoutRevision: input.checkoutRevision,
      expectedTotalCents: final, discountCents: quote.discountAmountCents, currency: "USD",
      paymentMode: input.paymentMode, creationRequest: input.creationRequest, reservedAt: now,
      expiresAt, nextActionAt: expiresAt, revision: 1, status: "active",
      deltas, legacyVersionId,
    };
    applyOfferCounterDeltas(tx, deltas, new Map(balances.map((balance) => [balance.ref.id, balance])), "hold");
    if (seedLegacy) tx.set(legacyOfferBaselineRef(code), { state: "initialized", at: now });
    tx.set(reservationPointer(orderId), { reservationId: ref.id });
    tx.set(ref, sanitizeFirestoreData(hold));
    return { reserved: true, reservation: hold };
  });
}

export interface OfferIntentEvidence {
  id: string;
  status?: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  metadata?: Record<string, string> | null;
  livemode?: boolean;
  created?: number;
}

export function offerIntentMatches(hold: OfferHold, intent: OfferIntentEvidence, { canBind = false } = {}) {
  return (canBind && !hold.paymentIntentId || hold.paymentIntentId === intent.id)
    && intent.metadata?.orderId === hold.orderId && intent.metadata?.quoteId === hold.quoteId
    && (hold.checkoutRevision === undefined || (intent.metadata?.checkoutRevision ?? intent.metadata?.contentRevision) === hold.checkoutRevision)
    && intent.amount === hold.expectedTotalCents && intent.currency?.toLowerCase() === "usd"
    && (hold.paymentMode === undefined || intent.livemode === (hold.paymentMode === "live"));
}

export async function bindOfferReservationIntent(input: { orderId: string; paymentIntentId: string; checkoutRevision?: string }) {
  return firestoreDb.runTransaction(async (tx) => {
    const snap = await readOfferHold(tx, input.orderId);
    const hold = snap?.data() as OfferHold | undefined;
    if (!snap || hold?.status !== "active" || hold.checkoutRevision !== input.checkoutRevision || hold.expectedTotalCents === 0) return false;
    if (hold.paymentIntentId) return hold.paymentIntentId === input.paymentIntentId;
    if (hold.lease || hold.expiresAt <= Date.now()) return false;
    tx.update(snap.ref, { paymentIntentId: input.paymentIntentId, revision: (hold.revision ?? 0) + 1 });
    return true;
  });
}

export type OfferReleaseAuthority = {
  ownerId?: string; ownerKey?: string; sessionId?: string; checkoutRevision?: string;
  paymentIntent?: OfferIntentEvidence;
  lease?: { token: string; revision: number };
  nowMs?: number;
};

export function ownsOfferLease(hold: OfferHold, lease: NonNullable<OfferReleaseAuthority["lease"]>, now: number) {
  return hold.revision === lease.revision && hold.lease?.token === lease.token && hold.lease.expiresAt > now;
}

export async function releaseOfferReservation(
  orderId: string,
  reason: "canceled" | "payment_failed" | "removed" | "expired" = "removed",
  authority: OfferReleaseAuthority = {},
): Promise<boolean> {
  return firestoreDb.runTransaction(async (tx) => {
    const orderSnap = await tx.get(getOrdersCollection().doc(orderId));
    const order = orderSnap.data() as Order | undefined;
    const snap = await readOfferHold(tx, orderId, order?.discountCode);
    const hold = snap?.data() as OfferHold | undefined;
    const now = authority.nowMs ?? Date.now();
    if (!snap || hold?.status !== "active" || !hold.deltas) return false;
    if (authority.lease ? !ownsOfferLease(hold, authority.lease, now) : !ownerMatches(hold, authority) || hold.checkoutRevision !== authority.checkoutRevision) return false;
    const intent = authority.paymentIntent;
    const bound = hold.paymentIntentId || order?.stripePaymentId;
    if (hold.expectedTotalCents !== 0 || bound || hold.creationRequest) {
      if (!intent || intent.status !== "canceled" || !offerIntentMatches({ ...hold, paymentIntentId: bound }, intent, { canBind: Boolean(authority.lease) })) return false;
    }
    const counters = await readOfferCounterDeltas(tx, hold.deltas);
    applyOfferCounterDeltas(tx, hold.deltas, counters, "release");
    tx.update(snap.ref, {
      status: reason === "expired" ? "expired" : "released",
      releasedReason: reason, releasedAt: now, revision: (hold.revision ?? 0) + 1, lease: null,
      ...(intent ? { paymentIntentId: intent.id } : {}),
    });
    if (order && ["PENDING_PAYMENT", "PAYMENT_VERIFICATION_FAILED"].includes(order.status)) {
      tx.update(orderSnap.ref, { status: "FAILED", fulfillmentStatus: "OFFER_RESERVATION_RELEASED", updatedAt: now });
    }
    return true;
  });
}

export interface RedeemOfferInput {
  code: string;
  orderId: string;
  sessionId?: string;
  journeyId?: string;
  quoteId?: string;
  discountAmountCents: number;
  finalAmountCents: number;
  destinationSurchargeCents?: number;
  isFreePromo?: boolean;
  isStudioComp?: boolean;
  verifiedCaptureId?: string;
  captureTime?: { earliestAt: number; latestAt: number };
  requireAuthoritativeBinding?: boolean;
  multiSendCount?: number;
  nowMs?: number;
  paymentIntent?: OfferIntentEvidence;
  paymentMode?: PaymentMode;
  lease?: NonNullable<OfferReleaseAuthority["lease"]>;
}

export interface RedemptionResult {
  redeemed: boolean;
  duplicate?: boolean;
  error?: string;
  redemption?: OfferRedemptionRecord;
}

export async function redeemOfferForOrder(input: RedeemOfferInput): Promise<RedemptionResult> {
  return firestoreDb.runTransaction((tx) => redeemOfferInTransaction(tx, input));
}

/** Called at the end of a transaction's read phase before acquiring the free-order dispatch lock. */
export async function redeemOfferInTransaction(tx: FirebaseFirestore.Transaction, input: RedeemOfferInput): Promise<RedemptionResult> {
  const { orderId, quoteId, finalAmountCents, discountAmountCents } = input;
  const now = input.nowMs ?? Date.now();
  const priorSnap = await tx.get(redemptionRef(orderId));
  if (!quoteId) return { redeemed: false, error: "Authoritative checkout quote is missing." };
  const quoteSnap = await tx.get(getOfferQuotesCollection().doc(quoteId));
  const quote = quoteSnap.data() as OfferPriceQuoteSnapshot | undefined;
  const code = quote?.promotion ? input.code : input.code.trim().toUpperCase();
  if (!quote || quote.code !== code || quote.discountAmountCents !== discountAmountCents ||
      frozenOfferTotal(quote, input.destinationSurchargeCents, input.multiSendCount) !== finalAmountCents) {
    return { redeemed: false, error: "Checkout terms do not match the authoritative quote." };
  }
  const prior = priorSnap.data() as (OfferRedemptionRecord & { totalCents?: number }) | undefined;
  if (prior) {
    const same = prior.offerId === quote.offerId && prior.offerVersion === quote.offerVersion && prior.quoteId === quoteId &&
      prior.discountAmountCents === discountAmountCents && (prior.totalCents ?? prior.payableAmountCents) === (prior.totalCents === undefined ? quote.payableAmountCents : finalAmountCents) &&
      prior.verifiedCaptureId === input.verifiedCaptureId;
    return same ? { redeemed: true, duplicate: true, redemption: prior } : { redeemed: false, error: "Order already has a redemption with different terms." };
  }
  const orderSnap = await tx.get(getOrdersCollection().doc(orderId));
  const order = orderSnap.data() as Order | undefined;
  if (!order || order.discountCode !== code || order.quoteId !== quoteId || order.amountInCents !== finalAmountCents ||
      order.finalAmountInCents !== finalAmountCents || order.discountAmountInCents !== discountAmountCents ||
      (order.quote && (order.quote.totalCents !== finalAmountCents || order.quote.discountCents !== discountAmountCents))) {
    return { redeemed: false, error: "Persisted order terms do not match the checkout quote." };
  }

  const holdSnap = await readOfferHold(tx, orderId, code);
  const hold = holdSnap?.data() as OfferHold | undefined;
  if (!holdSnap || hold?.status !== "active" || !hold.deltas || hold.quoteId !== quoteId || hold.offerVersion !== quote.offerVersion ||
      hold.code !== code || hold.expectedTotalCents !== finalAmountCents || hold.discountCents !== discountAmountCents ||
      (hold.checkoutRevision !== undefined && hold.checkoutRevision !== (order.checkoutRevision ?? order.multiSend?.contentRevision)) ||
      (hold.ownerKey !== undefined && hold.ownerKey !== order.checkoutOwnerKey) ||
      (quote.promotion && !isDeepStrictEqual(order.checkoutPrice?.lines, quote.promotion.evaluation.lines))) {
    return { redeemed: false, error: "A bound active offer reservation is required." };
  }
  if (input.lease && !ownsOfferLease(hold, input.lease, now)) return { redeemed: false, error: "Reconciliation lease changed." };
  let settledAt = now;
  let captureTimeBasis = "successful_free_order";
  if (finalAmountCents > 0) {
    const intent = input.paymentIntent;
    if (!input.verifiedCaptureId || !intent || intent.id !== input.verifiedCaptureId || intent.status !== "succeeded" ||
        intent.amount_received !== finalAmountCents ||
        (!input.lease && order.stripePaymentId !== intent.id) ||
        !offerIntentMatches({ ...hold, paymentIntentId: hold.paymentIntentId || order.stripePaymentId }, intent, { canBind: Boolean(input.lease) })) {
      return { redeemed: false, error: "Verified payment capture does not match the quote and bound intent." };
    }
    const capture = (await tx.get(firestoreDb.collection("financial_facts").doc(`fact_cap_${intent.id}`))).data();
    if (!capture || capture.orderId !== orderId || capture.amountCents !== finalAmountCents || capture.currency !== "usd" || capture.livemode !== Boolean(intent.livemode)) {
      return { redeemed: false, error: "Verified capture fact does not match the order, amount, currency and mode." };
    }
    const time = input.captureTime;
    if (!time || time.earliestAt > time.latestAt || time.latestAt > Math.min(hold.expiresAt, quote.expiresAt) || time.latestAt < hold.reservedAt) {
      return { redeemed: false, error: "Payment capture was late or its timing could not be verified." };
    }
    settledAt = time.earliestAt;
    captureTimeBasis = "verified_capture";
  } else if (!input.isFreePromo || order.paymentMethod !== "PROMO_CODE" || order.stripePaymentId || hold.paymentIntentId ||
      order.origin === "ADMIN_COMP" || order.multiSend || order.quote?.countryCode !== "US" ||
      (quote.promotion && quote.promotion.basket.workflow !== "single") ||
      now >= Math.min(quote.expiresAt, hold.expiresAt) || now < hold.reservedAt) {
    return { redeemed: false, error: "This checkout cannot be completed as a free domestic order." };
  }
  const cutoff = (await tx.get(offerCutoverRef())).data()?.cutoverAt as number | undefined;
  if (cutoff !== undefined && input.captureTime && input.captureTime.earliestAt < cutoff && input.captureTime.latestAt >= cutoff &&
      hold.deltas.some(({ kind }) => kind === "sender")) {
    return { redeemed: false, error: "Payment capture timing crosses the sender-limit cutover." };
  }
  const counters = await readOfferCounterDeltas(tx, hold.deltas);
  const commercialKind = input.isStudioComp ? "studio_comp" : finalAmountCents === 0 ? "free_promo" : "discounted_paid";
  const redemption: OfferRedemptionRecord = {
    redemptionId: priorSnap.id, offerId: quote.offerId, offerVersion: quote.offerVersion, orderId,
    commercialKind, quoteId, discountAmountCents, payableAmountCents: quote.payableAmountCents,
    verifiedCaptureId: input.verifiedCaptureId, redeemedAt: settledAt,
    refunded: Boolean((order as Order & { refundSettledCents?: number }).refundSettledCents), refundRestoredUsage: false,
  };
  applyOfferCounterDeltas(tx, hold.deltas, counters, "consume", { countSender: cutoff === undefined || settledAt >= cutoff });
  tx.update(holdSnap.ref, {
    status: "consumed", consumedAt: settledAt, revision: (hold.revision ?? 0) + 1, lease: null,
    nextActionAt: finalAmountCents > 0 ? now : Number.MAX_SAFE_INTEGER,
    ...(input.verifiedCaptureId ? { paymentIntentId: input.verifiedCaptureId } : {}),
  });
  tx.set(priorSnap.ref, sanitizeFirestoreData({
    ...redemption, code, codeId: quote.promotion?.codeId, totalCents: finalAmountCents, captureTimeBasis, deltas: hold.deltas,
    checkoutRevision: hold.checkoutRevision, promotion: quote.promotion,
    refundAmountCents: (order as Order & { refundSettledCents?: number }).refundSettledCents,
  }));
  if (input.lease && input.verifiedCaptureId && !order.stripePaymentId) {
    tx.update(orderSnap.ref, { stripePaymentId: input.verifiedCaptureId, updatedAt: now });
  }
  return { redeemed: true, redemption, duplicate: false };
}

// ============================================================================
// 9. Offer Analytics Summary (SPRINT-0005-T04, AC04)
// ============================================================================

export interface OfferAnalyticsSummary {
  code: string;
  totalRedemptions: number;
  paidDiscountedCount: number;
  freePromoCount: number;
  studioCompCount: number;
  grossRevenueCents: number;
  totalDiscountGivenCents: number;
  netCapturedRevenueCents: number;
  costStatus: "unconfirmed";
  netMarginCents: null;
}

/**
 * Generates an audit summary for an offer code.
 * Separates paid discounted redemptions from free promotional orders and studio comps.
 * When supplier production costs are unknown, returns costStatus: "unconfirmed" and netMarginCents: null
 * rather than fabricating margins or disabling legitimate promotional codes.
 */
export async function getOfferAnalyticsSummary(
  code: string
): Promise<OfferAnalyticsSummary> {
  const normalized = code.trim().toUpperCase();

  const redemptionsSnap = await getOfferRedemptionsCollection()
    .where("offerId", "==", `offer_${normalized}`)
    .get();

  let paidDiscountedCount = 0;
  let freePromoCount = 0;
  let studioCompCount = 0;
  let grossRevenueCents = 0;
  let totalDiscountGivenCents = 0;
  let netCapturedRevenueCents = 0;

  for (const doc of redemptionsSnap.docs) {
    const r = doc.data() as OfferRedemptionRecord;
    totalDiscountGivenCents += r.discountAmountCents || 0;
    grossRevenueCents += (r.payableAmountCents || 0) + (r.discountAmountCents || 0);
    netCapturedRevenueCents += r.payableAmountCents || 0;

    if (r.commercialKind === "studio_comp") {
      studioCompCount++;
    } else if (r.commercialKind === "free_promo" || r.payableAmountCents === 0) {
      freePromoCount++;
    } else {
      paidDiscountedCount++;
    }
  }

  return {
    code: normalized,
    totalRedemptions: redemptionsSnap.size,
    paidDiscountedCount,
    freePromoCount,
    studioCompCount,
    grossRevenueCents,
    totalDiscountGivenCents,
    netCapturedRevenueCents,
    costStatus: "unconfirmed",
    netMarginCents: null,
  };
}
