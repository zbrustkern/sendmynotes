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
  if (!Number.isInteger(order.amountInCents) || order.amountInCents <= 0 || capture.amount !== order.amountInCents || capture.amountReceived !== order.amountInCents) return "Captured amount does not match the order total.";
  return null;
}

/** Build a deliberately small browser contract from server-verified Stripe facts. */
export function buildPurchaseMeasurement(
  order: Order,
  capture: VerifiedCapture,
  now = Date.now()
): PurchaseMeasurementSnapshot {
  const fullyRefunded = (order as Order & { fullyRefunded?: boolean }).fullyRefunded === true;
  let reason: PurchaseMeasurementSnapshot["reason"] = "eligible";
  if (capture.paymentIntentId !== order.stripePaymentId) reason = "binding_mismatch";
  else if (capture.currency.toLowerCase() !== "usd") reason = "currency_mismatch";
  else if (!Number.isInteger(capture.amountReceived) || capture.amountReceived <= 0) reason = "invalid_capture";
  else if (capture.amountReceived !== order.amountInCents) reason = "amount_mismatch";
  else if (!capture.livemode || order.isTest || order.paymentMode === "stripe_test" || order.paymentMode === "local_mock") reason = "test_payment";
  else if (order.isComp || order.isFounderTest || order.paymentMethod !== "STRIPE") reason = "non_customer";
  else if (fullyRefunded) reason = "known_refund";

  return {
    version: 1,
    transactionId: order.id,
    amountInCents: capture.amountReceived,
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
