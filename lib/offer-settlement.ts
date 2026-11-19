import type Stripe from "stripe";
import { firestoreDb, getOrdersCollection } from "./firebase-admin";
import { getStripeClient } from "./stripe";
import { getActiveOfferReservation, offerIntentMatches, redeemOfferForOrder, type OfferHold, type OfferIntentEvidence, type OfferReleaseAuthority } from "./offer-engine";
import type { Order } from "./types";
import type { PaymentMode } from "./payment-mode";

export function providerCaptureWindow(eventTime: number) {
  return Number.isSafeInteger(eventTime) && eventTime > 0
    ? { earliestAt: eventTime, latestAt: eventTime + 999 }
    : undefined;
}

/** Stripe's intent creation time only bounds how early capture could have occurred. */
export async function verifyOfferCaptureTiming(
  hold: OfferHold,
  intent: OfferIntentEvidence,
  observedAt: number,
  eventTime?: number,
  events: Pick<Stripe["events"], "list"> = getStripeClient().events,
) {
  if (eventTime !== undefined) return providerCaptureWindow(eventTime);
  if (observedAt <= hold.expiresAt) {
    return { earliestAt: hold.reservedAt, latestAt: observedAt };
  }
  const from = Math.floor(Math.max(hold.reservedAt, (intent.created ?? 0) * 1_000) / 1_000);
  const through = Math.floor(hold.expiresAt / 1_000);
  if (from > through) return undefined;
  let cursor: string | undefined;
  // A busy Stripe account or an unavailable Events API leaves exposure intact.
  for (let page = 0; page < 4; page++) {
    const found = await events.list({ type: "payment_intent.succeeded", created: { gte: from, lte: through }, limit: 100, starting_after: cursor });
    const matching = found.data.find((event) => {
      const object = event.data.object as Stripe.PaymentIntent;
      return event.type === "payment_intent.succeeded" && event.livemode === intent.livemode &&
        object.id === intent.id && object.status === "succeeded" && object.amount_received === intent.amount_received &&
        offerIntentMatches(hold, object, { canBind: true });
    });
    if (matching) return providerCaptureWindow(matching.created * 1_000);
    const last = found.data.at(-1);
    if (!found.has_more || !last) return undefined;
    cursor = last.id;
  }
  return undefined;
}

export async function settlePaidOrderPromotion(input: {
  order: Order;
  intent: OfferIntentEvidence;
  paymentMode?: PaymentMode;
  providerEventAt?: number;
  observedAt?: number;
  hold?: OfferHold;
  lease?: NonNullable<OfferReleaseAuthority["lease"]>;
}) {
  const { order, intent, paymentMode, lease } = input;
  if (order.origin === "ADMIN_COMP" || !order.discountCode || !(order.discountAmountInCents && order.discountAmountInCents > 0)) {
    return { status: "not_applicable" as const };
  }
  const hold = input.hold ?? await getActiveOfferReservation(order.id);
  const observedAt = input.observedAt ?? Date.now();
  let captureTime;
  if (hold) {
    try {
      captureTime = paymentMode === "local_mock"
        ? { earliestAt: observedAt, latestAt: observedAt }
        : await verifyOfferCaptureTiming(hold, intent, observedAt, input.providerEventAt);
    } catch {
      // A provider read error is retryable; the capture fact still survives.
    }
  }
  const result = await redeemOfferForOrder({
    code: order.discountCode,
    orderId: order.id,
    quoteId: order.quoteId,
    discountAmountCents: order.discountAmountInCents,
    finalAmountCents: order.finalAmountInCents ?? order.amountInCents,
    destinationSurchargeCents: order.quote?.internationalSurchargeCents,
    multiSendCount: order.multiSend?.recipients.length,
    verifiedCaptureId: intent.id,
    captureTime,
    paymentIntent: intent,
    paymentMode,
    lease,
  });
  return result.redeemed
    ? { status: "redeemed" as const }
    : { status: "reconciliation_required" as const, error: result.error || "Offer redemption could not be confirmed." };
}

export async function markOfferCaptureReconciliation(orderId: string, paymentIntentId: string, reason: string) {
  return firestoreDb.runTransaction(async (tx) => {
    const ref = getOrdersCollection().doc(orderId);
    const current = (await tx.get(ref)).data() as Order | undefined;
    if (!current || ["DISPATCHING", "DISPATCH_UNCERTAIN", "PROCESSING_HANDWRYTTEN", "MAILED", "AWAITING_RECIPIENT_ADDRESS"].includes(current.status)) return false;
    const settled = await tx.get(firestoreDb.collection("offer_redemptions").doc(`redemption_${orderId}`));
    if (settled.data()?.verifiedCaptureId === paymentIntentId) return false;
    const transitioned = current.fulfillmentStatus !== "OFFER_RECONCILIATION_REQUIRED";
    if (transitioned || current.fulfillmentError !== reason) {
      tx.update(ref, { status: "PAYMENT_RECEIVED", fulfillmentStatus: "OFFER_RECONCILIATION_REQUIRED", fulfillmentError: reason, updatedAt: Date.now() });
    }
    return transitioned;
  });
}
