import { createHmac, randomBytes } from "node:crypto";
import { firestoreDb, getOrderById, getOrdersCollection } from "./firebase-admin";
import { getOfferQuotesCollection, getOfferReservationsCollection, releaseOfferReservation } from "./offer-engine";
import type { OfferPriceQuoteSnapshot } from "./contracts/admin-overhaul";
import { calculateOrderQuote } from "./order-pricing";
import { getStripeClient, createCardPaymentIntent } from "./stripe";
import type { Order } from "./types";
import type { PaymentMode } from "./payment-mode";

// Keep the random draft credential and the unhashed note/address out of the index.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, canonical(item)]));
}
export function checkoutBinding(key: unknown, snapshot: object) {
  if (typeof key !== "string" || !/^[0-9a-f]{48}$/.test(key)) return null;
  const id = createHmac("sha256", key).update(JSON.stringify(canonical(snapshot))).digest("hex");
  return firestoreDb.collection("checkout_bindings").doc(id);
}
type BindingRef = NonNullable<ReturnType<typeof checkoutBinding>>;
export type CheckoutSeed = {
  orderId: string; operationId: string; viewToken: string;
  offer: OfferPriceQuoteSnapshot | null;
};
export function checkoutSeed(operationId: string, offer: CheckoutSeed["offer"]): CheckoutSeed {
  return { orderId: "order_" + randomBytes(16).toString("hex"), operationId,
    viewToken: "tok_" + randomBytes(16).toString("hex"), offer };
}
/** Older tabs only saved the order ID and its private view token. Adopt an exact,
 * verifiable order once. Some older optimized/private covers cannot be matched. */
export async function legacyCheckoutSeed(proof: { orderId?: unknown; viewToken?: unknown }, expected: object) {
  if (typeof proof.orderId !== "string" || !/^order_[a-f0-9]{32}$/.test(proof.orderId) ||
      typeof proof.viewToken !== "string" || !/^tok_[a-f0-9]{32}$/.test(proof.viewToken)) return null;
  const order = await getOrderById(proof.orderId);
  if (!order || order.viewToken !== proof.viewToken || order.checkoutResumeVersion || order.uploadMaster ||
      order.isComp || !["STRIPE", "PROMO_CODE"].includes(order.paymentMethod || "") || !order.quote) return null;
  const snapshot = {
    frontImageUrl: order.frontImageUrl, printedMessage: order.printedMessage, handwrittenNote: order.handwrittenNote,
    fontStyleId: order.fontStyleId, recipientAddress: order.recipientAddress, returnAddress: order.returnAddress,
    occasion: order.occasion, scheduledSendDate: order.scheduledSendDate, recipientOccasion: order.recipientOccasion,
    userId: order.userId, accountOccasionId: order.accountOccasionId, occasionOccurrenceDate: order.occasionOccurrenceDate,
    addressDeferred: Boolean(order.addressDeferred || order.address_deferred), discountCode: order.discountCode || "",
    contactPolicyVersion: order.contactPolicyVersion, customerEmail: order.contactPolicyVersion === 1 ? undefined : order.customerEmail,
    isFounderTest: Boolean(order.isFounderTest), isInternationalPreview: Boolean(order.isInternationalPreview),
    priceVersion: order.quote.version, privacyRestricted: Boolean(order.attribution?.optOut || order.attribution?.gpc),
  };
  if (JSON.stringify(canonical(snapshot)) !== JSON.stringify(canonical(expected))) return null;
  const offer = order.quoteId ? (await getOfferQuotesCollection().doc(order.quoteId).get()).data() as OfferPriceQuoteSnapshot | undefined : null;
  if (order.discountCode && !offer) throw new CheckoutResumeError("The previous offer could not be verified. Review your discount before paying.");
  return { orderId: order.id, viewToken: proof.viewToken, operationId: order.operationId || "checkout_" + order.id, offer: offer || null };
}
export async function claimCheckout(ref: BindingRef | null, candidate: CheckoutSeed): Promise<CheckoutSeed> {
  if (!ref) return candidate;
  return firestoreDb.runTransaction(async tx => {
    const saved = await tx.get(ref);
    if (saved.data()?.orderId) return saved.data() as CheckoutSeed;
    tx.set(ref, candidate);
    return candidate;
  });
}

export class CheckoutResumeError extends Error {
  constructor(message: string, readonly order?: Order) { super(message); }
}

async function retire(ref: BindingRef, seed: CheckoutSeed): Promise<never> {
  const retired = await firestoreDb.runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.orderId !== seed.orderId) return false;
    const order = (await tx.get(getOrdersCollection().doc(seed.orderId))).data() as Order | undefined;
    if (order && order.status !== "PENDING_PAYMENT") {
      throw new CheckoutResumeError("This order already has a payment outcome.", order);
    }
    tx.set(ref, { retiredOrderId: seed.orderId });
    return true;
  });
  if (retired && seed.offer) await releaseOfferReservation(seed.orderId, "expired");
  throw new CheckoutResumeError("This checkout has expired. Retry checkout to review the current total.");
}

export async function resumeCheckout(ref: BindingRef, seed: CheckoutSeed, mode: PaymentMode | null, publishableKey: string | null, verifySelection: (order: Order) => Promise<void>) {
  const order = await getOrderById(seed.orderId);
  if (!order) {
    if (seed.offer && seed.offer.expiresAt <= Date.now()) return retire(ref, seed);
    return null;
  }
  if (order.viewToken !== seed.viewToken) throw new CheckoutResumeError("Checkout could not be verified.");
  if (order.status !== "PENDING_PAYMENT") throw new CheckoutResumeError("This order already has a payment outcome.", order);
  const currentQuote = calculateOrderQuote({ countryCode: order.quote?.countryCode || "US", discountCents: seed.offer?.discountAmountCents });
  if (order.amountInCents !== currentQuote.totalCents || order.quoteId !== seed.offer?.quoteId) {
    throw new CheckoutResumeError("The saved total no longer matches this checkout.");
  }
  await verifySelection(order);
  const isFree = order.amountInCents === 0;
  const isMock = !isFree && mode === "local_mock";
  let clientSecret: string | null = null;
  let provider: ReturnType<typeof getStripeClient> | undefined;
  if (!isFree) {
    if (!order.stripePaymentId || !mode || (order.paymentMode && order.paymentMode !== mode))
      throw new CheckoutResumeError("The saved payment could not be verified.");
    if (isMock) {
      if (order.stripePaymentId !== "pi_mock_" + order.id) throw new CheckoutResumeError("Payment mode changed.");
      clientSecret = (await createCardPaymentIntent({ orderId: order.id, amountInCents: order.amountInCents })).clientSecret;
    } else {
      provider = getStripeClient();
      const pi = await provider.paymentIntents.retrieve(order.stripePaymentId);
      if (pi.metadata.orderId !== order.id || pi.amount !== order.amountInCents || pi.currency !== "usd" ||
          pi.livemode !== (mode === "live") || (order.quoteId && pi.metadata.quoteId !== order.quoteId))
        throw new CheckoutResumeError("The saved payment no longer matches the order.");
      if (pi.status === "canceled") return retire(ref, seed);
      if (!["requires_payment_method", "requires_confirmation"].includes(pi.status))
        throw new CheckoutResumeError("Check the status of your existing payment before trying again.", order);
      if (!pi.client_secret) throw new CheckoutResumeError("The saved payment cannot be opened.");
      clientSecret = pi.client_secret;
    }
  }
  if (order.discountCode) {
    const [quote, hold] = await Promise.all([
      order.quoteId ? getOfferQuotesCollection().doc(order.quoteId).get() : null,
      getOfferReservationsCollection().doc("res_" + order.id + "_" + order.discountCode).get(),
    ]);
    const q = quote?.data() as OfferPriceQuoteSnapshot | undefined;
    const h = hold.data();
    if (!q || q.code !== order.discountCode || q.expiresAt <= Date.now() ||
        calculateOrderQuote({countryCode: order.quote?.countryCode || "US", discountCents: q.discountAmountCents}).totalCents !== order.amountInCents ||
        h?.status !== "active" || h.quoteId !== order.quoteId || h.expiresAt <= Date.now()) {
      // Never replace a still-payable intent, even if confirmation races this read.
      if (provider && order.stripePaymentId) await provider.paymentIntents.cancel(order.stripePaymentId);
      return retire(ref, seed);
    }
  }
  return {
    orderId: order.id, operationId: order.operationId || seed.operationId, viewToken: order.viewToken,
    amountInCents: order.amountInCents, originalAmountInCents: order.originalAmountInCents, finalAmountInCents: order.finalAmountInCents,
    quote: order.quote, discountCode: order.discountCode, discountAmountInCents: order.discountAmountInCents || 0, quoteId: order.quoteId,
    appliedOfferId: order.appliedOfferId, appliedOfferVersion: order.appliedOfferVersion,
    clientSecret, paymentIntentId: order.stripePaymentId || null, publishableKey: isFree ? null : publishableKey, isFree, isMock,
  };
}
