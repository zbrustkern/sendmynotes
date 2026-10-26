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

import { firestoreDb, getDiscountCodesCollection, getDiscountCode, saveDiscountCode } from "./firebase-admin";
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
  if (expiration && nowMs > expiration) {
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
  const versionDoc = transaction ? await transaction.get(versionRef) : await versionRef.get();

  if (versionDoc.exists) {
    const data = versionDoc.data() as OfferVersionRecord;
    const dynamicStatus = computeOfferLifecycleStatus(data);
    return {
      ...data,
      status: dynamicStatus,
    };
  }

  // Fallback to legacy discount_codes collection
  const legacyDoc = await getDiscountCode(normalized);
  if (!legacyDoc) return null;

  // Bridge legacy document to version 1 record
  const bridged: OfferVersionRecord = {
    offerId: `offer_${normalized}`,
    version: 1,
    code: normalized,
    purpose: legacyDoc.description || "Promotional Discount",
    destinationPath: "/",
    discountType: legacyDoc.type,
    discountValue: legacyDoc.value,
    startsAt: legacyDoc.createdAt || Date.now(),
    endsAt: legacyDoc.expiresAt || undefined,
    timezone: "UTC",
    status: computeOfferLifecycleStatus({
      isActive: legacyDoc.isActive,
      expiresAt: legacyDoc.expiresAt,
      maxUses: legacyDoc.maxUses,
      usedCount: legacyDoc.usedCount,
      totalDiscountGivenCents: legacyDoc.totalDiscountGivenCents,
    }),
    maxUses: legacyDoc.maxUses || undefined,
    usedCount: legacyDoc.usedCount || 0,
    reservedCount: 0,
    dollarBudgetLimitCents: undefined,
    totalDiscountGivenCents: legacyDoc.totalDiscountGivenCents || 0,
    stackingAllowed: false,
    createdAt: legacyDoc.createdAt || Date.now(),
    updatedAt: legacyDoc.updatedAt || Date.now(),
  };

  try {
    if (transaction) {
      transaction.set(versionRef, bridged);
    } else {
      await versionRef.set(bridged);
    }
  } catch {
    // Non-fatal write failure, bridged object still usable in-memory
  }

  return bridged;
}

// ============================================================================
// 4. Authoritative Price Quotes (SPRINT-0005-T02, AC03)
// ============================================================================

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

  // Canonical base price: ignore client-supplied prices!
  const basePriceCents = CARD_FLAT_RATE_CENTS; // 900
  let discountAmountCents = 0;

  if (offer.discountType === "PERCENTAGE") {
    const pct = Math.max(0, Math.min(100, offer.discountValue));
    discountAmountCents = Math.round((basePriceCents * pct) / 100);
  } else if (offer.discountType === "FIXED_AMOUNT") {
    discountAmountCents = Math.max(0, offer.discountValue);
  }

  // Clamp discount so it cannot exceed base price
  discountAmountCents = Math.min(discountAmountCents, basePriceCents);
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
        const authoritativeQuotedTotal = quote.payableAmountCents + surchargeCents;
        if (nowMs > quote.expiresAt) {
          // Re-evaluate fresh base pricing, then reapply the immutable destination surcharge.
          const fresh = await issueOfferPriceQuote({ code: quote.code, nowMs });
          return {
            valid: false,
            requiresPriceReconfirmation: true,
            authoritativeFinalCents: (fresh.finalAmountInCents ?? CARD_FLAT_RATE_CENTS) + surchargeCents,
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

  // If no quoteId but code is supplied, re-evaluate fresh quote
  if (input.code) {
    const fresh = await issueOfferPriceQuote({ code: input.code, nowMs });
    if (!fresh.valid || fresh.finalAmountInCents == null) {
      return {
        valid: false,
        requiresPriceReconfirmation: true,
        authoritativeFinalCents: CARD_FLAT_RATE_CENTS + Math.max(0, Math.floor(input.surchargeCents || 0)),
        staleAmountCents: input.paymentIntentAmountCents ?? input.expectedFinalCents,
        reason: fresh.error || "Discount code is no longer valid.",
      };
    }

    const authoritativeTotal = fresh.finalAmountInCents + Math.max(0, Math.floor(input.surchargeCents || 0));
    if (
      (input.paymentIntentAmountCents != null && input.paymentIntentAmountCents !== authoritativeTotal) ||
      (input.expectedFinalCents != null && input.expectedFinalCents !== authoritativeTotal)
    ) {
      return {
        valid: false,
        requiresPriceReconfirmation: true,
        authoritativeFinalCents: authoritativeTotal,
        staleAmountCents: input.paymentIntentAmountCents ?? input.expectedFinalCents,
        reason: "Payment amount does not match current discounted base plus destination surcharge.",
        quote: fresh.quote,
      };
    }

    return { valid: true, authoritativeFinalCents: authoritativeTotal, quote: fresh.quote };
  }

  // No discount: destination surcharge is added after the canonical domestic base.
  const noDiscountTotal = CARD_FLAT_RATE_CENTS + Math.max(0, Math.floor(input.surchargeCents || 0));
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
  nowMs?: number;
  reservationTtlMs?: number;
}

export interface ReservationResult {
  reserved: boolean;
  duplicate?: boolean;
  error?: string;
  status?: OfferLifecycleStatus;
  reservation?: OfferReservationRecord;
}

/**
 * Reserves a scarce redemption slot and budget for an in-flight checkout.
 * Runs inside firestoreDb.runTransaction to guarantee concurrency boundaries.
 * Under concurrent contention for the last slot (maxUses: 1), strictly 1 succeeds.
 * Automatically cleans up expired reservations so abandoned checkouts release their hold.
 */
export async function reserveOfferForCheckout(
  input: ReserveOfferInput
): Promise<ReservationResult> {
  const nowMs = input.nowMs ?? Date.now();
  const normalized = input.code.trim().toUpperCase();
  const reservationDocId = `res_${input.orderId}_${normalized}`;
  const ttl = input.reservationTtlMs || DEFAULT_QUOTE_VALIDITY_MS;
  const expiresAt = nowMs + ttl;

  return await firestoreDb.runTransaction(async (transaction: any) => {
    // 1. Check existing reservation for this order
    const resRef = getOfferReservationsCollection().doc(reservationDocId);
    const existingResSnap = await transaction.get(resRef);

    if (existingResSnap.exists) {
      const existing = existingResSnap.data() as OfferReservationRecord;
      if (existing.status === "active" && existing.expiresAt > nowMs && (!input.quoteId || existing.quoteId === input.quoteId)) {
        return {
          reserved: true,
          duplicate: true,
          reservation: existing,
        };
      }
    }

    // 2. Load authoritative quote and its offer version before any transaction writes.
    const quoteSnap = input.quoteId
      ? await transaction.get(getOfferQuotesCollection().doc(input.quoteId))
      : null;
    const quote = quoteSnap?.exists ? (quoteSnap.data() as OfferPriceQuoteSnapshot) : undefined;
    if (input.quoteId && (!quote || quote.code !== normalized || quote.expiresAt < nowMs)) {
      return { reserved: false, error: "Authoritative offer quote is missing or expired." };
    }
    const versionNumber = quote?.offerVersion || 1;
    const versionRef = getOfferVersionsCollection().doc(`offer_${normalized}_v${versionNumber}`);
    const versionSnap = await transaction.get(versionRef);

    const legacyRef = getDiscountCodesCollection().doc(normalized);
    const legacySnap = await transaction.get(legacyRef);

    if (!versionSnap.exists && !legacySnap.exists) {
      return {
        reserved: false,
        error: "Discount code not found.",
        status: "archived",
      };
    }

    let offerData: OfferVersionRecord;
    if (versionSnap.exists) {
      offerData = versionSnap.data() as OfferVersionRecord;
    } else {
      const leg = legacySnap.data() as DiscountCode;
      offerData = {
        offerId: `offer_${normalized}`,
        version: 1,
        code: normalized,
        purpose: leg.description || "Promotional Discount",
        destinationPath: "/",
        discountType: leg.type,
        discountValue: leg.value,
        status: leg.isActive ? "active" : "paused",
        maxUses: leg.maxUses || undefined,
        usedCount: leg.usedCount || 0,
        reservedCount: 0,
        totalDiscountGivenCents: leg.totalDiscountGivenCents || 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: leg.createdAt || nowMs,
        updatedAt: nowMs,
      };
    }

    // Check basic lifecycle
    const status = computeOfferLifecycleStatus(offerData, nowMs);
    if (status !== "active") {
      return {
        reserved: false,
        error: `Discount code is not active (status: ${status}).`,
        status,
      };
    }

    // 3. Count active reservations and prune expired reservations
    const reservationsQuery = await getOfferReservationsCollection()
      .where("code", "==", normalized)
      .get();

    let activeReservationsCount = 0;
    const expiredReservationRefs: any[] = [];
    for (const doc of reservationsQuery.docs) {
      const r = doc.data() as OfferReservationRecord;
      if (r.status !== "active") continue;
      // Skip reservation belonging to current orderId
      if (r.orderId === input.orderId) continue;

      if (r.expiresAt <= nowMs) {
        // Expired reservation hold: release it!
        expiredReservationRefs.push(doc.ref);
      } else {
        activeReservationsCount++;
      }
    }

    // 4. Concurrency check: usedCount + activeReservationsCount < maxUses
    const maxUses = offerData.maxUses ?? (legacySnap.exists ? legacySnap.data()?.maxUses : undefined);
    const currentUsed = offerData.usedCount || (legacySnap.exists ? legacySnap.data()?.usedCount : 0) || 0;

    if (maxUses != null && maxUses > 0 && currentUsed + activeReservationsCount >= maxUses) {
      return {
        reserved: false,
        error: "This discount code has reached its maximum redemptions limit.",
        status: "exhausted",
      };
    }

    // All transaction reads are complete before the first write.
    for (const expiredRef of expiredReservationRefs) {
      transaction.update(expiredRef, {
        status: "expired",
        releasedReason: "ttl_expired",
      });
    }

    // 5. Create active reservation
    const newReservation: OfferReservationRecord & { code: string } = {
      reservationId: reservationDocId,
      offerId: offerData.offerId,
      offerVersion: offerData.version,
      orderId: input.orderId,
      code: normalized,
      sessionId: input.sessionId,
      quoteId: input.quoteId,
      reservedAt: nowMs,
      expiresAt,
      status: "active",
    };

    transaction.set(resRef, newReservation);

    // Atomically increment reserved count
    const newReservedCount = activeReservationsCount + 1;
    transaction.set(
      versionRef,
      {
        ...offerData,
        reservedCount: newReservedCount,
        updatedAt: nowMs,
      },
      { merge: true }
    );

    return {
      reserved: true,
      duplicate: false,
      reservation: newReservation,
    };
  });
}

/**
 * Releases an active reservation hold (e.g. on order cancellation, payment failure, or promo removal).
 */
export async function releaseOfferReservation(
  orderId: string,
  reason: "canceled" | "payment_failed" | "removed" | "expired" = "removed"
): Promise<boolean> {
  const snapshot = await getOfferReservationsCollection()
    .where("orderId", "==", orderId)
    .get();
  const activeDocs = snapshot.docs.filter((d) => (d.data() as OfferReservationRecord).status === "active");
  if (activeDocs.length === 0) return false;

  await firestoreDb.runTransaction(async (transaction: any) => {
    const versionRefs = new Map<string, any>();
    for (const doc of activeDocs) {
      const data = doc.data() as OfferReservationRecord & { code?: string };
      if (data.offerId) {
        const ref = getOfferVersionsCollection().doc(`offer_${data.code || ""}_v${data.offerVersion || 1}`);
        versionRefs.set(ref.id || `${data.code}:${data.offerVersion}`, ref);
      }
    }
    const versionSnapshots = new Map<any, any>();
    for (const ref of versionRefs.values()) {
      versionSnapshots.set(ref, await transaction.get(ref));
    }
    for (const doc of activeDocs) {
      transaction.update(doc.ref, {
        status: "released",
        releasedReason: reason,
        releasedAt: Date.now(),
      });
    }
    for (const [ref, vSnap] of versionSnapshots.entries()) {
      if (vSnap.exists) {
        const vData = vSnap.data() as OfferVersionRecord;
        transaction.update(ref, {
          reservedCount: Math.max(0, (vData.reservedCount || 1) - 1),
          updatedAt: Date.now(),
        });
      }
    }
  });
  return true;
}

// ============================================================================
// 7. Semantic Order-Linked Redemption (SPRINT-0005-T04, AC02, AC04)
// ============================================================================

export interface RedeemOfferInput {
  code: string;
  orderId: string;
  sessionId?: string;
  journeyId?: string;
  quoteId?: string;
  discountAmountCents: number;
  finalAmountCents: number;
  /** Amount added outside the discountable offer base, such as the destination upgrade. */
  destinationSurchargeCents?: number;
  isFreePromo?: boolean;
  isStudioComp?: boolean;
  verifiedCaptureId?: string;
  requireAuthoritativeBinding?: boolean;
  nowMs?: number;
}

export interface RedemptionResult {
  redeemed: boolean;
  duplicate?: boolean;
  error?: string;
  redemption?: OfferRedemptionRecord;
}

/**
 * Executes a deterministic, exactly-once offer redemption.
 * Runs inside a transaction keyed by `redemption_${orderId}`.
 * Duplicate calls (client confirmation + webhook retry) consume ONCE and return duplicate: true.
 * Marks corresponding reservation as consumed and atomically increments usedCount.
 */
export async function redeemOfferForOrder(
  input: RedeemOfferInput
): Promise<RedemptionResult> {
  const nowMs = input.nowMs ?? Date.now();
  const normalized = input.code.trim().toUpperCase();
  const surchargeCents = input.destinationSurchargeCents ?? 0;
  const basePayableCents = input.finalAmountCents - surchargeCents;
  if (!Number.isSafeInteger(surchargeCents) || surchargeCents < 0 || !Number.isSafeInteger(basePayableCents) || basePayableCents < 0) {
    return { redeemed: false, error: "Checkout amount breakdown is invalid." };
  }
  const redemptionDocId = `redemption_${input.orderId}`;

  return await firestoreDb.runTransaction(async (transaction: any) => {
    const redRef = getOfferRedemptionsCollection().doc(redemptionDocId);
    const existingSnap = await transaction.get(redRef);

    // 1. Idempotency Guard: if already redeemed for this order, do NOT consume twice!
    if (existingSnap.exists) {
      const existing = existingSnap.data() as OfferRedemptionRecord;
      const sameTerms =
        existing.offerId === `offer_${normalized}` &&
        existing.discountAmountCents === input.discountAmountCents &&
        existing.payableAmountCents === basePayableCents &&
        (!input.quoteId || existing.quoteId === input.quoteId) &&
        (!input.verifiedCaptureId || existing.verifiedCaptureId === input.verifiedCaptureId);
      if (!sameTerms) return { redeemed: false, error: "Order already has a redemption with different terms." };
      return { redeemed: true, duplicate: true, redemption: existing };
    }

    // Load authoritative quote before selecting the versioned offer document.
    let quoteSnap: any = null;
    let quote: OfferPriceQuoteSnapshot | undefined;
    if (input.quoteId) {
      quoteSnap = await transaction.get(getOfferQuotesCollection().doc(input.quoteId));
      if (quoteSnap.exists) quote = quoteSnap.data() as OfferPriceQuoteSnapshot;
    }
    if (input.requireAuthoritativeBinding && !quote) {
      return { redeemed: false, error: "Authoritative checkout quote is missing." };
    }
    if (input.requireAuthoritativeBinding && quote && (quote.code !== normalized || quote.payableAmountCents !== basePayableCents || quote.discountAmountCents !== input.discountAmountCents || quote.expiresAt < nowMs)) {
      return { redeemed: false, error: "Checkout terms do not match the authoritative quote." };
    }

    if (input.requireAuthoritativeBinding) {
      const orderSnap = await transaction.get(firestoreDb.collection("orders").doc(input.orderId));
      const boundOrder = orderSnap.exists ? orderSnap.data() as any : null;
      const totalSnapshotMatches = surchargeCents > 0
        ? boundOrder?.amountInCents === input.finalAmountCents && boundOrder?.quote?.totalCents === input.finalAmountCents && boundOrder?.quote?.discountCents === input.discountAmountCents && boundOrder?.quote?.internationalSurchargeCents === surchargeCents
        : (!boundOrder?.quote || (boundOrder.quote.totalCents === input.finalAmountCents && boundOrder.quote.discountCents === input.discountAmountCents));
      if (!boundOrder || String(boundOrder.discountCode || "").toUpperCase() !== normalized || boundOrder.quoteId !== input.quoteId || boundOrder.finalAmountInCents !== input.finalAmountCents || !totalSnapshotMatches || boundOrder.discountAmountInCents !== input.discountAmountCents) {
        return { redeemed: false, error: "Persisted order terms do not match the checkout quote." };
      }
    }
    const versionNumber = quote?.offerVersion || 1;
    const versionRef = getOfferVersionsCollection().doc(`offer_${normalized}_v${versionNumber}`);
    const versionSnap = await transaction.get(versionRef);

    const legacyRef = getDiscountCodesCollection().doc(normalized);
    const legacySnap = await transaction.get(legacyRef);

    if (!versionSnap.exists && !legacySnap.exists) {
      return {
        redeemed: false,
        error: "Discount code not found.",
      };
    }

    let offerId = `offer_${normalized}`;
    let version = 1;
    let currentUsed = 0;
    let currentTotalDiscount = 0;
    let maxUses: number | undefined = undefined;

    if (versionSnap.exists) {
      const vData = versionSnap.data() as OfferVersionRecord;
      offerId = vData.offerId;
      version = vData.version;
      currentUsed = vData.usedCount || 0;
      currentTotalDiscount = vData.totalDiscountGivenCents || 0;
      maxUses = vData.maxUses;
    } else if (legacySnap.exists) {
      const leg = legacySnap.data() as DiscountCode;
      currentUsed = leg.usedCount || 0;
      currentTotalDiscount = leg.totalDiscountGivenCents || 0;
      maxUses = leg.maxUses || undefined;
    }

    // If there is no existing reservation for this order, check maxUses
    const resDocId = `res_${input.orderId}_${normalized}`;
    const resRef = getOfferReservationsCollection().doc(resDocId);
    const resSnap = await transaction.get(resRef);

    if (input.requireAuthoritativeBinding && (!resSnap.exists || (resSnap.data() as OfferReservationRecord).quoteId !== input.quoteId || (resSnap.data() as OfferReservationRecord).offerVersion !== versionNumber)) {
      return { redeemed: false, error: "Offer reservation does not match the checkout quote." };
    }
    if (input.requireAuthoritativeBinding && input.finalAmountCents > 0) {
      if (!input.verifiedCaptureId) return { redeemed: false, error: "Verified payment capture is required for offer redemption." };
      const captureSnap = await transaction.get(firestoreDb.collection("financial_facts").doc(`fact_cap_${input.verifiedCaptureId}`));
      const capture = captureSnap.data() as any;
      if (!captureSnap.exists || capture?.orderId !== input.orderId || capture?.amountCents !== input.finalAmountCents) {
        return { redeemed: false, error: "Verified capture does not match the order and quoted amount." };
      }
    }

    if (!resSnap.exists && maxUses != null && maxUses > 0 && currentUsed >= maxUses) {
      return {
        redeemed: false,
        error: "This discount code has reached its maximum redemptions limit.",
      };
    }

    // Determine Commercial Kind
    let commercialKind: CommercialKind = "discounted_paid";
    if (input.isStudioComp) {
      commercialKind = "studio_comp";
    } else if (input.isFreePromo || input.finalAmountCents === 0) {
      commercialKind = "free_promo";
    }

    // 3. Mark reservation as consumed if exists
    if (resSnap.exists) {
      transaction.update(resRef, {
        status: "consumed",
        consumedAt: nowMs,
      });
    }

    // 4. Create Immutable Redemption Audit Record
    const redemption: OfferRedemptionRecord = {
      redemptionId: redemptionDocId,
      offerId,
      offerVersion: version,
      orderId: input.orderId,
      commercialKind,
      quoteId: input.quoteId || `quote_${input.orderId}`,
      discountAmountCents: input.discountAmountCents,
      payableAmountCents: basePayableCents,
      verifiedCaptureId: input.verifiedCaptureId,
      redeemedAt: nowMs,
      refunded: false,
      refundRestoredUsage: false, // REFUND_RESTORES_OFFER_USAGE = false
    };

    transaction.set(redRef, redemption);

    // 5. Atomically update counters on offer_versions & legacy discount_codes
    const newUsed = currentUsed + 1;
    const newDiscountTotal = currentTotalDiscount + input.discountAmountCents;

    if (versionSnap.exists) {
      transaction.update(versionRef, {
        usedCount: newUsed,
        totalDiscountGivenCents: newDiscountTotal,
        reservedCount: Math.max(0, (versionSnap.data()?.reservedCount || 1) - 1),
        updatedAt: nowMs,
      });
    }

    if (legacySnap.exists) {
      transaction.update(legacyRef, {
        usedCount: newUsed,
        totalDiscountGivenCents: newDiscountTotal,
        updatedAt: nowMs,
      });
    }

    return {
      redeemed: true,
      duplicate: false,
      redemption,
    };
  });
}

// ============================================================================
// 8. Explicit Refund Outcome (SPRINT-0005-T02, AC03)
// ============================================================================

/**
 * Records a refund against an offer redemption record.
 * In strict adherence to REFUND_RESTORES_OFFER_USAGE = false, does NOT increment
 * or restore the offer's available usage capacity. Preserves original commercial terms.
 */
export async function recordOfferRefundOutcome(
  param1: string | { orderId: string; refundAmountCents?: number },
  param2?: number
): Promise<boolean> {
  const orderId = typeof param1 === "string" ? param1 : param1.orderId;
  const refundAmountCents = typeof param1 === "string" ? (param2 ?? 0) : (param1.refundAmountCents ?? 0);
  const redemptionDocId = `redemption_${orderId}`;
  const redRef = getOfferRedemptionsCollection().doc(redemptionDocId);
  const snap = await redRef.get();

  if (!snap.exists) return false;

  await redRef.update({
    refunded: true,
    refundAmountCents,
    refundRestoredUsage: false, // REFUND_RESTORES_OFFER_USAGE = false
    refundedAt: Date.now(),
  });

  return true;
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
