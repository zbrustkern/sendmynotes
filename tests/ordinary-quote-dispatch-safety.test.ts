import assert from "node:assert/strict";
import { processPaidOrder } from "../lib/order-processor";
import { saveDiscountCode, saveOrder, getOrderById } from "../lib/firebase-admin";
import { getOfferQuotesCollection, issueOfferPriceQuote } from "../lib/offer-engine";
import { getFinancialFactsByPaymentIntent } from "../lib/financial-ledger";

async function main() {
  const now = Date.now();
  const code = `QUOTE_HOLD_${now}`;
  await saveDiscountCode({
    id: code, code, type: "PERCENTAGE", value: 0, description: "Quote safety test",
    isActive: true, usedCount: 0, totalDiscountGivenCents: 0, createdAt: now, updatedAt: now,
  } as any);
  const issued = await issueOfferPriceQuote({ code, nowMs: now });
  assert.equal(issued.valid, true);
  const quoteId = issued.quote!.quoteId;

  const baseOrder = (id: string, status = "PENDING_PAYMENT") => ({
    id, status, createdAt: now, updatedAt: now, amountInCents: 900, finalAmountInCents: 900,
    discountCode: code, discountAmountInCents: 0, quoteId,
    quote: { version: "base900-international500-v1", countryCode: "US", basePriceCents: 900, discountCents: 0, internationalSurchargeCents: 0, totalCents: 900, currency: "USD" as const },
    paymentMethod: "STRIPE" as const, frontImageUrl: "https://example.invalid/front.jpg",
    printedMessage: "Hello", handwrittenNote: "A note", fontStyleId: "1",
    recipientAddress: { firstName: "Pat", lastName: "Recipient", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    returnAddress: { firstName: "Alex", lastName: "Sender", street1: "2 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
  });
  const payment = (orderId: string, piId: string) => ({
    id: piId, status: "succeeded", amount: 900, amount_received: 900, currency: "usd", livemode: false,
    metadata: { orderId },
  });

  const expiredOrderId = `expired-quote-${now}`;
  const expiredPiId = `pi-expired-quote-${now}`;
  await saveOrder(baseOrder(expiredOrderId) as any);
  await getOfferQuotesCollection().doc(quoteId).update({ expiresAt: now - 1 });
  const expired = await processPaidOrder(expiredOrderId, expiredPiId, undefined, {
    paymentMode: "stripe_test", verifiedPaymentIntent: payment(expiredOrderId, expiredPiId),
  });
  assert.equal(expired.success, false, "expired quote holds the ordinary-order processor before dispatch");
  assert.equal(expired.requiresPriceReconfirmation, true);
  assert.equal(expired.status, "PAYMENT_RECEIVED");
  const heldOrder = await getOrderById(expiredOrderId);
  assert.equal(heldOrder?.status, "PAYMENT_RECEIVED");
  assert.equal(heldOrder?.fulfillmentStatus, "PRICE_RECONFIRMATION_REQUIRED");
  const capturedFacts = await getFinancialFactsByPaymentIntent(expiredPiId);
  assert.equal(capturedFacts.length, 1, "captured money remains durable evidence despite quote hold");
  assert.equal(capturedFacts[0].amountCents, 900);

  // A valid quote takes the established local test-payment path, which cannot
  // reach the external supplier. Replaying after expiry remains idempotent.
  const validQuote = await issueOfferPriceQuote({ code, nowMs: Date.now() });
  assert.equal(validQuote.valid, true);
  const validOrderId = `valid-quote-${now}`;
  const validPiId = `pi-valid-quote-${now}`;
  await saveOrder({ ...baseOrder(validOrderId), quoteId: validQuote.quote!.quoteId } as any);
  const first = await processPaidOrder(validOrderId, validPiId, undefined, {
    paymentMode: "stripe_test", verifiedPaymentIntent: payment(validOrderId, validPiId),
  });
  assert.equal(first.success, true);
  assert.equal(first.status, "PROCESSING_HANDWRYTTEN");
  assert.ok(first.handwryttenOrderId?.startsWith("test_hw_"), "valid test capture uses a synthetic non-provider result");

  await getOfferQuotesCollection().doc(validQuote.quote!.quoteId).update({ expiresAt: Date.now() - 1 });
  const replay = await processPaidOrder(validOrderId, validPiId, undefined, {
    paymentMode: "stripe_test", verifiedPaymentIntent: payment(validOrderId, validPiId),
  });
  assert.equal(replay.success, true, "already-completed order replay remains idempotent after quote expiry");
  assert.equal(replay.alreadyProcessed, true);
  assert.equal(replay.handwryttenOrderId, first.handwryttenOrderId);
  assert.equal((await getOrderById(validOrderId))?.status, "PROCESSING_HANDWRYTTEN");

  console.log("ordinary quote dispatch safety tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
