import { createHash, createHmac, randomBytes } from "node:crypto";
import { firestoreDb, getOrderById, getOrdersCollection, updateOrderStatus } from "./firebase-admin";
import { bindOfferReservationIntent, getActiveOfferReservation, getOfferQuotesCollection, releaseOfferReservation, verifyCheckoutQuoteIntegrity } from "./offer-engine";
import type { OfferPriceQuoteSnapshot } from "./contracts/admin-overhaul";
import { isOrderQuoteValid } from "./order-pricing";
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
      order.isComp || order.multiSend || !["STRIPE", "PROMO_CODE"].includes(order.paymentMethod || "") || !order.quote) return null;
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

export async function clearClosedCheckoutBinding(ref: BindingRef, seed: CheckoutSeed): Promise<boolean> {
  return firestoreDb.runTransaction(async (transaction) => {
    const saved = (await transaction.get(ref)).data();
    if (saved?.orderId !== seed.orderId) return Boolean(saved?.retiredOrderId === seed.orderId);
    const order = (await transaction.get(getOrdersCollection().doc(seed.orderId))).data() as Order | undefined;
    if (order?.viewToken !== seed.viewToken || order.status !== "FAILED" || !["CHECKOUT_REPLACED", "OFFER_QUOTE_EXPIRED", "OFFER_RESERVATION_RELEASED"].includes(order.fulfillmentStatus || "")) return false;
    transaction.set(ref, { retiredOrderId: seed.orderId });
    return true;
  });
}

export class CheckoutResumeError extends Error {
  constructor(message: string, readonly order?: Order) { super(message); }
}

export const singleCheckoutOwnerKey = (viewToken: string) => createHash("sha256").update(`single-checkout:${viewToken}`).digest("hex");

export async function verifyCheckoutHold(order: Order): Promise<boolean> {
  if (!order.discountCode) return true;
  const hold = await getActiveOfferReservation(order.id);
  const integrity = await verifyCheckoutQuoteIntegrity({
    quoteId: order.quoteId, code: order.discountCode, expectedFinalCents: order.amountInCents,
    paymentIntentAmountCents: order.amountInCents, surchargeCents: order.quote?.internationalSurchargeCents,
    multiSendCount: order.multiSend?.recipients.length,
  });
  return Boolean(integrity.valid && hold && hold.status === "active" && hold.quoteId === order.quoteId && hold.expiresAt > Date.now() &&
    (hold.checkoutRevision === undefined || hold.checkoutRevision === (order.checkoutRevision ?? order.multiSend?.contentRevision)) &&
    (hold.expectedTotalCents === undefined || hold.expectedTotalCents === order.amountInCents) &&
    (hold.currency === undefined || hold.currency === "USD") &&
    (hold.ownerKey === undefined || hold.ownerKey === order.checkoutOwnerKey) &&
    (hold.paymentMode === undefined || hold.paymentMode === order.paymentMode) &&
    (hold.paymentIntentId === undefined || !order.stripePaymentId || hold.paymentIntentId === order.stripePaymentId));
}

export function verifyCheckoutIntent(order: Order, intent: {
  metadata: Record<string, string>; amount: number; currency: string; livemode?: boolean;
}, mode: PaymentMode) {
  return intent.metadata.orderId === order.id && intent.amount === order.amountInCents && intent.currency === "usd" &&
    Boolean(intent.livemode) === (mode === "live") && (!order.quoteId || intent.metadata.quoteId === order.quoteId) &&
    (!order.checkoutRevision || intent.metadata.checkoutRevision === order.checkoutRevision) &&
    (!order.multiSend || (intent.metadata.contentRevision === order.multiSend.contentRevision && intent.metadata.itemCount === String(order.multiSend.recipients.length)));
}

export async function openCheckoutPayment(order: Order) {
  if (!order.checkoutPaymentRequest) throw new CheckoutResumeError("The saved payment could not be verified.");
  const payment = await createCardPaymentIntent(order.checkoutPaymentRequest);
  if (order.discountCode && !await bindOfferReservationIntent({ orderId: order.id, paymentIntentId: payment.paymentIntentId, checkoutRevision: order.checkoutRevision })) throw new CheckoutResumeError("The payment could not be securely linked. Please retry checkout.");
  await updateOrderStatus(order.id, { stripePaymentId: payment.paymentIntentId });
  return payment;
}

export async function retireCheckoutOrder(order: Order, reason: "expired" | "removed") {
  if (order.status !== "PENDING_PAYMENT") throw new CheckoutResumeError("This order already has a payment outcome.", order);
  const mode = order.paymentMode || (order.stripePaymentId?.startsWith("pi_mock_") ? "local_mock" : undefined);
  const paymentId = order.stripePaymentId || (order.checkoutPaymentRequest ? (await openCheckoutPayment(order)).paymentIntentId : undefined);
  let paymentIntent;
  if (paymentId && mode === "local_mock") {
    if (paymentId !== `pi_mock_${order.id}`) throw new CheckoutResumeError("The previous payment could not be verified.");
    paymentIntent = { id: paymentId, status: "canceled" as const, amount: order.amountInCents, currency: "usd", livemode: false, metadata: {
      orderId: order.id, ...(order.quoteId ? { quoteId: order.quoteId } : {}), ...(order.checkoutRevision ? { checkoutRevision: order.checkoutRevision } : {}), ...(order.multiSend ? { contentRevision: order.multiSend.contentRevision } : {}),
    } };
  } else if (paymentId) {
    if (!mode) throw new CheckoutResumeError("The previous payment mode could not be verified.");
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentId);
    if (!verifyCheckoutIntent(order, intent, mode)) throw new CheckoutResumeError("The previous payment could not be safely matched.");
    if (["succeeded", "processing", "requires_capture"].includes(intent.status)) throw new CheckoutResumeError("Check the status of your existing payment before trying again.", order);
    paymentIntent = intent.status === "canceled" ? intent : await stripe.paymentIntents.cancel(intent.id);
    if (paymentIntent.status !== "canceled" || !verifyCheckoutIntent(order, paymentIntent, mode)) throw new CheckoutResumeError("The payment could not be safely closed.", order);
  } else if (order.amountInCents > 0) {
    throw new CheckoutResumeError("The previous payment could not be safely closed.");
  }
  if (order.discountCode) {
    const hold = await getActiveOfferReservation(order.id);
    if (hold?.status === "active") {
      const released = await releaseOfferReservation(order.id, paymentIntent ? "canceled" : reason, {
        ownerKey: order.checkoutOwnerKey, ownerId: hold.ownerId, sessionId: order.sessionId ?? hold.sessionId,
        checkoutRevision: order.checkoutRevision ?? order.multiSend?.contentRevision, ...(paymentIntent ? { paymentIntent } : {}),
      });
      if (!released && (await getActiveOfferReservation(order.id))?.status === "active") throw new CheckoutResumeError("The previous offer could not be safely released.");
    }
  }
  await firestoreDb.runTransaction(async (transaction) => {
    const ref = getOrdersCollection().doc(order.id);
    const current = (await transaction.get(ref)).data() as Order | undefined;
    if (!current || (current.status !== "PENDING_PAYMENT" && current.status !== "FAILED")) throw new CheckoutResumeError("This order already has a payment outcome.", current);
    if (current.status === "PENDING_PAYMENT") transaction.update(ref, { status: "FAILED", fulfillmentStatus: reason === "expired" ? "OFFER_QUOTE_EXPIRED" : "CHECKOUT_REPLACED", updatedAt: Date.now() });
  });
}

async function retire(ref: BindingRef, seed: CheckoutSeed, order?: Order): Promise<never> {
  if (order) await retireCheckoutOrder(order, "expired");
  await firestoreDb.runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.orderId !== seed.orderId) return;
    tx.set(ref, { retiredOrderId: seed.orderId });
  });
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
  if (!isOrderQuoteValid(order.quote) || order.amountInCents !== order.quote.totalCents || order.quoteId !== seed.offer?.quoteId) throw new CheckoutResumeError("The saved total no longer matches this checkout.");
  await verifySelection(order);
  if (!await verifyCheckoutHold(order)) return retire(ref, seed, order);
  const isFree = order.amountInCents === 0;
  const isMock = !isFree && mode === "local_mock";
  let clientSecret: string | null = null;
  let paymentIntentId = order.stripePaymentId || null;
  if (!isFree) {
    if (!mode || (order.paymentMode && order.paymentMode !== mode)) throw new CheckoutResumeError("The saved payment could not be verified.");
    if (!order.stripePaymentId) {
      const payment = await openCheckoutPayment(order);
      paymentIntentId = payment.paymentIntentId;
      clientSecret = payment.clientSecret;
    } else if (isMock) {
      if (order.stripePaymentId !== "pi_mock_" + order.id) throw new CheckoutResumeError("Payment mode changed.");
      clientSecret = (await createCardPaymentIntent({ orderId: order.id, amountInCents: order.amountInCents })).clientSecret;
    } else {
      const pi = await getStripeClient().paymentIntents.retrieve(order.stripePaymentId);
      if (!verifyCheckoutIntent(order, pi, mode)) throw new CheckoutResumeError("The saved payment no longer matches the order.");
      if (pi.status === "canceled") return retire(ref, seed, order);
      if (!["requires_payment_method", "requires_confirmation"].includes(pi.status)) throw new CheckoutResumeError("Check the status of your existing payment before trying again.", order);
      if (!pi.client_secret) throw new CheckoutResumeError("The saved payment cannot be opened.");
      clientSecret = pi.client_secret;
    }
  }
  return {
    orderId: order.id, operationId: order.operationId || seed.operationId, viewToken: order.viewToken,
    amountInCents: order.amountInCents, originalAmountInCents: order.originalAmountInCents, finalAmountInCents: order.finalAmountInCents,
    quote: order.quote, price: order.checkoutPrice, discountCode: order.discountCode, discountAmountInCents: order.discountAmountInCents || 0, quoteId: order.quoteId,
    appliedOfferId: order.appliedOfferId, appliedOfferVersion: order.appliedOfferVersion,
    clientSecret, paymentIntentId, publishableKey: isFree ? null : publishableKey, isFree, isMock,
  };
}
