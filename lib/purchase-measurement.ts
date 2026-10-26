import { firestoreDb, getOrdersCollection } from "@/lib/firebase-admin";
import { Order, PurchaseMeasurementSnapshot } from "@/lib/types";

export type VerifiedCapture = {
  paymentIntentId: string;
  amount: number;
  amountReceived: number;
  currency: string;
  livemode?: boolean;
};

export function validateVerifiedCapture(order: Order, capture: VerifiedCapture): string | null {
  const payableAmountInCents = Number.isInteger(order.finalAmountInCents)
    ? order.finalAmountInCents as number
    : order.amountInCents;
  if (!order.stripePaymentId || capture.paymentIntentId !== order.stripePaymentId) return "PaymentIntent does not match this order.";
  if (capture.currency.toLowerCase() !== "usd") return "Payment currency is not USD.";
  if (!Number.isInteger(capture.amountReceived) || capture.amountReceived <= 0) return "Payment has no positive captured amount.";
  if (!Number.isInteger(payableAmountInCents) || payableAmountInCents <= 0 || capture.amount !== payableAmountInCents || capture.amountReceived !== payableAmountInCents) return "Captured amount does not match the order total.";
  return null;
}

/** Build a deliberately small browser contract from server-verified Stripe facts. */
export function buildPurchaseMeasurement(
  order: Order,
  capture: VerifiedCapture,
  now = Date.now()
): PurchaseMeasurementSnapshot {
  const knownFullyRefunded = (order as Order & { fullyRefunded?: boolean }).fullyRefunded === true;
  const payableAmountInCents = Number.isInteger(order.finalAmountInCents)
    ? order.finalAmountInCents as number
    : order.amountInCents;
  let reason: PurchaseMeasurementSnapshot["reason"] = "eligible";
  if (capture.paymentIntentId !== order.stripePaymentId) reason = "binding_mismatch";
  else if (capture.currency.toLowerCase() !== "usd") reason = "currency_mismatch";
  else if (!Number.isInteger(capture.amountReceived) || capture.amountReceived <= 0) reason = "invalid_capture";
  else if (capture.amountReceived !== payableAmountInCents || capture.amount !== payableAmountInCents) reason = "amount_mismatch";
  else if (!capture.livemode || order.isTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock") reason = "test_payment";
  else if (order.isComp || order.isFounderTest || order.paymentMethod !== "STRIPE" || order.isInternationalPreview || order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD") reason = "non_customer";
  else if (knownFullyRefunded) reason = "known_refund";

  return {
    version: 1,
    transactionId: order.id,
    amountInCents: Number.isInteger(capture.amountReceived) ? capture.amountReceived : 0,
    currency: "USD",
    verifiedAt: now,
    eligible: reason === "eligible",
    reason,
    refundStatus: knownFullyRefunded ? "fully_refunded" : "unknown",
  };
}

/** First verified snapshot wins, so repeat webhook/confirmation requests are idempotent. */
export async function persistPurchaseMeasurement(
  orderId: string,
  candidate: PurchaseMeasurementSnapshot
): Promise<PurchaseMeasurementSnapshot> {
  return firestoreDb.runTransaction(async (transaction: any) => {
    const ref = getOrdersCollection().doc(orderId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error(`Order ${orderId} not found`);
    const order = snapshot.data() as Order;
    if (order.purchaseMeasurement) return order.purchaseMeasurement;
    transaction.update(ref, { purchaseMeasurement: candidate, updatedAt: Date.now() });
    return candidate;
  });
}
