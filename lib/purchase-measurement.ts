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
  if (!order.stripePaymentId || capture.paymentIntentId !== order.stripePaymentId) return "PaymentIntent does not match this order.";
  if (capture.currency.toLowerCase() !== "usd") return "Payment currency is not USD.";
  if (!Number.isInteger(capture.amountReceived) || capture.amountReceived <= 0) return "Payment has no positive captured amount.";
  const payableAmountInCents =
    order.quote && Number.isInteger(order.quote.totalCents)
      ? order.quote.totalCents
      : typeof order.finalAmountInCents === "number" && order.finalAmountInCents >= 0
      ? order.finalAmountInCents
      : order.amountInCents;
  if (!Number.isInteger(payableAmountInCents) || payableAmountInCents <= 0 || capture.amount !== payableAmountInCents || capture.amountReceived !== payableAmountInCents) return "Captured amount does not match the order total.";
  return null;
}

/** Build a deliberately small browser contract from server-verified Stripe facts. */
export function buildPurchaseMeasurement(
  order: Order,
  capture: VerifiedCapture,
  now = Date.now()
): PurchaseMeasurementSnapshot {
  const fullyRefunded = (order as Order & { fullyRefunded?: boolean }).fullyRefunded === true;
  const payableAmountInCents =
    order.quote && Number.isInteger(order.quote.totalCents)
      ? order.quote.totalCents
      : typeof order.finalAmountInCents === "number" && order.finalAmountInCents >= 0
      ? order.finalAmountInCents
      : order.amountInCents;
  let reason: PurchaseMeasurementSnapshot["reason"] = "eligible";
  if (capture.paymentIntentId !== order.stripePaymentId) reason = "binding_mismatch";
  else if (capture.currency.toLowerCase() !== "usd") reason = "currency_mismatch";
  else if (!Number.isInteger(capture.amountReceived) || capture.amountReceived <= 0) reason = "invalid_capture";
  else if (capture.amountReceived !== payableAmountInCents || capture.amount !== payableAmountInCents) reason = "amount_mismatch";
  else if (!capture.livemode || order.isTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock") reason = "test_payment";
  else if (order.origin === "ADMIN_COMP" || order.isComp || order.isFounderTest || order.paymentMethod !== "STRIPE" || order.isInternationalPreview || order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD") reason = "non_customer";
  else if (fullyRefunded) reason = "known_refund";

  return {
    version: 1,
    transactionId: order.id,
    amountInCents: Number.isInteger(capture.amountReceived) ? capture.amountReceived : 0,
    currency: "USD",
    verifiedAt: now,
    eligible: reason === "eligible",
    reason,
    refundStatus: fullyRefunded ? "fully_refunded" : "unknown",
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

/** Apply linked refund facts only to a returned view; the verified capture stays immutable. */
export async function projectPurchaseMeasurementForOrder(
  _order: Order,
  measurement: PurchaseMeasurementSnapshot | null | undefined
): Promise<PurchaseMeasurementSnapshot | null> {
  if (!measurement) return null;
  if (measurement.refundStatus === "fully_refunded") {
    return { ...measurement, eligible: false, reason: "known_refund", refundStatus: "fully_refunded" };
  }
  return measurement;
}
