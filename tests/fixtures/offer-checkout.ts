import assert from "node:assert/strict";
import { getOrdersCollection, saveOrder } from "../../lib/firebase-admin";
import { recordPaymentCaptureFact } from "../../lib/financial-ledger";
import { calculateOrderQuote } from "../../lib/order-pricing";
import { bindOfferReservationIntent, issueOfferPriceQuote, reserveOfferForCheckout, type RedeemOfferInput } from "../../lib/offer-engine";
import type { Order } from "../../lib/types";

export async function offerCheckoutFixture(input: {
  code: string; orderId: string; now: number; live?: boolean; reserveTtl?: number; ownerId?: string; create?: boolean;
}) {
  const { code, orderId, now, live = false } = input;
  const result = await issueOfferPriceQuote({ code, nowMs: now });
  assert(result.valid && result.quote);
  const quote = result.quote;
  const amount = quote.payableAmountCents;
  const paymentIntent = {
    id: `pi_${orderId}`,
    status: "succeeded",
    amount,
    amount_received: amount,
    currency: "usd",
    livemode: live,
    metadata: { orderId, quoteId: quote.quoteId, checkoutRevision: orderId, discountCode: code, discountAmountCents: String(quote.discountAmountCents) },
  };
  const request = amount > 0 ? { orderId, idempotencyKey: `create_${orderId}`, amountInCents: amount, metadata: paymentIntent.metadata } : undefined;
  const held = await reserveOfferForCheckout({
    code, orderId, sessionId: `session_${orderId}`, ownerId: input.ownerId, ownerKey: `owner_${orderId}`, checkoutRevision: orderId,
    expectedTotalCents: amount, quoteId: quote.quoteId, reservationTtlMs: input.reserveTtl, nowMs: now,
    paymentMode: live ? "live" : "stripe_test", creationRequest: request,
  });
  if (!held.reserved) throw new Error(held.error || "Fixture reservation failed.");
  const order = {
    id: orderId, status: "PENDING_PAYMENT",
    recipientAddress: { country: "US" }, quoteId: quote.quoteId, quote: calculateOrderQuote({ countryCode: "US", discountCents: quote.discountAmountCents }),
    amountInCents: amount, finalAmountInCents: amount, discountAmountInCents: quote.discountAmountCents, discountCode: code,
    paymentMode: live ? "live" : "stripe_test", paymentMethod: amount > 0 ? "STRIPE" : "PROMO_CODE", checkoutRevision: orderId,
    checkoutOwnerKey: `owner_${orderId}`, createdAt: now, updatedAt: now, ...(request ? { checkoutPaymentRequest: request } : {}),
  } as Order;
  await saveOrder(order);
  if (amount > 0 && input.create !== false) {
    assert(await bindOfferReservationIntent({ orderId, paymentIntentId: paymentIntent.id, checkoutRevision: orderId }));
    await getOrdersCollection().doc(orderId).update({ stripePaymentId: paymentIntent.id });
    order.stripePaymentId = paymentIntent.id;
    await recordPaymentCaptureFact({
      paymentIntentId: paymentIntent.id, amountCents: amount, currency: paymentIntent.currency, livemode: live,
      orderId, commercialKind: "discounted_paid", occurredAt: now + 10,
    });
  }
  const redemption: RedeemOfferInput = {
    code, orderId, quoteId: quote.quoteId, finalAmountCents: amount, discountAmountCents: quote.discountAmountCents,
    isFreePromo: amount === 0,
    ...(amount > 0 ? { paymentIntent, verifiedCaptureId: paymentIntent.id, captureTime: { earliestAt: now + 10, latestAt: now + 10 } } : {}),
    nowMs: now + 10,
  };
  return { order, quote, request, held, paymentIntent, redemption };
}
