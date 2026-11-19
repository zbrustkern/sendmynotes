import { firestoreDb, getOrdersCollection, sanitizeFirestoreData } from "./firebase-admin";
import { FINANCIAL_FACTS_COLLECTION } from "./financial-ledger";
import type { Order } from "./types";
import type { Delivery } from "./multi-send/orders";

export interface OfferRefundEvidence {
  refundId: string;
  paymentIntentId: string;
  orderId?: string;
  recipientId?: string;
  amountCents: number;
  currency: string;
  livemode: boolean;
  status: string | null | undefined;
  occurredAt?: number;
}

/** Project one successful provider refund against immutable checkout amounts. */
export async function recordOfferRefundOutcome(input: OfferRefundEvidence) {
  if (input.status !== "succeeded") return false;
  if (input.currency.toLowerCase() !== "usd" || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 ||
      !/^[A-Za-z0-9_-]+$/.test(input.refundId) || (input.recipientId && !/^[A-Za-z0-9_-]{1,80}$/.test(input.recipientId))) {
    throw new Error("Invalid provider refund allocation evidence.");
  }
  return firestoreDb.runTransaction(async (tx) => {
    const factRef = firestoreDb.collection(FINANCIAL_FACTS_COLLECTION);
    const capture = (await tx.get(factRef.doc(`fact_cap_${input.paymentIntentId}`))).data();
    if (!capture?.orderId) {
      if (input.recipientId) throw new Error("Child refund requires verified captured payment.");
      return false;
    }
    if (input.orderId && capture.orderId !== input.orderId) throw new Error("Refund order does not match captured payment.");
    const orderId = capture.orderId as string;
    const parentRef = getOrdersCollection().doc(orderId);
    const order = (await tx.get(parentRef)).data() as (Order & { refundSettledCents?: number }) | undefined;
    if (!order || order.origin === "ADMIN_COMP") return false;
    const amount = order.finalAmountInCents ?? order.amountInCents;
    if (order.stripePaymentId !== input.paymentIntentId || capture.amountCents !== amount || capture.currency !== "usd" ||
        capture.livemode !== input.livemode || (order.quote && order.quote.totalCents !== amount)) throw new Error("Refund does not match the frozen parent capture.");
    const refundRef = firestoreDb.collection("offer_refunds").doc(input.refundId);
    const prior = (await tx.get(refundRef)).data();
    if (prior) {
      if (prior.orderId !== orderId || prior.paymentIntentId !== input.paymentIntentId || prior.amountCents !== input.amountCents ||
          (input.recipientId && prior.recipientId && prior.recipientId !== input.recipientId)) throw new Error("Conflicting provider refund replay.");
      if (prior.recipientId || !input.recipientId) return true;
    }
    const childRef = input.recipientId ? parentRef.collection("deliveries").doc(input.recipientId) : undefined;
    const child = childRef ? (await tx.get(childRef)).data() as (Delivery & { refundSettledCents?: number }) | undefined : undefined;
    const childAmount = order.multiSend?.recipients.find((line) => line.id === input.recipientId)?.amountInCents;
    if (input.recipientId && (!child || child.amountInCents !== childAmount || child.parentOrderId !== orderId)) {
      throw new Error("Child refund does not match a frozen delivery allocation.");
    }
    const redemptionRef = firestoreDb.collection("offer_redemptions").doc(`redemption_${orderId}`);
    const redemption = await tx.get(redemptionRef);
    const now = Date.now();
    const parentRefunded = (order.refundSettledCents ?? 0) + (prior ? 0 : input.amountCents);
    const childRefunded = (child?.refundSettledCents ?? 0) + input.amountCents;
    if (parentRefunded > amount || (childAmount !== undefined && childRefunded > childAmount)) throw new Error("Refund exceeds frozen parent or child net amount.");
    if (prior) tx.update(refundRef, { recipientId: input.recipientId, allocatedAt: now });
    else {
      tx.set(refundRef, sanitizeFirestoreData({ ...input, orderId, occurredAt: input.occurredAt ?? now }));
      tx.update(parentRef, { refundSettledCents: parentRefunded, updatedAt: now });
    }
    if (child && childRef) {
      tx.update(childRef, {
        refundSettledCents: childRefunded, refundStatus: "succeeded", updatedAt: now,
        ...(childRefunded === childAmount ? { state: "REFUNDED", stateVersion: child.stateVersion + (child.state === "REFUNDED" ? 0 : 1), refundId: input.refundId } : {}),
      });
    }
    if (redemption.exists) {
      tx.update(redemptionRef, { refunded: true, refundAmountCents: parentRefunded, refundRestoredUsage: false, refundedAt: now });
    }
    return true;
  });
}
