import assert from "node:assert/strict";
import { calculateOrderQuote, isOrderQuoteValid, isFreeOrderEligible } from "../lib/order-pricing";
import { verifyPaymentIntentForOrder } from "../lib/order-processor";
import { normalizeCountryCode, validateMailingAddress, getEnabledDestination, mailingOptionsResponse, isStagingInternationalCheckoutEnabled, authorizeInternationalCheckout } from "../lib/mailing-destinations";
import { buildSingleStepOrderPayload } from "../lib/handwrytten";

assert.equal(normalizeCountryCode("USA"), "US");
assert.equal(normalizeCountryCode(" United Kingdom "), "GB");
assert.equal(normalizeCountryCode("UK"), "GB");
assert.equal(normalizeCountryCode("Atlantis"), null);
assert.equal(normalizeCountryCode(""), null);
assert.equal(calculateOrderQuote({ countryCode: "US" }).totalCents, 900);
assert.equal(calculateOrderQuote({ countryCode: "CA" }).totalCents, 1400);
assert.equal(calculateOrderQuote({ countryCode: "CA", discountCents: 200 }).totalCents, 1200);
assert.equal(calculateOrderQuote({ countryCode: "CA", discountCents: 900 }).totalCents, 500);
assert.equal(calculateOrderQuote({ countryCode: "US", discountCents: 900 }).totalCents, 0);
const caQuote = calculateOrderQuote({ countryCode: "CA", discountCents: 200 });
assert.equal(isOrderQuoteValid(caQuote), true);
assert.equal(isOrderQuoteValid({ ...caQuote, totalCents: 1399 }), false);
assert.equal(isFreeOrderEligible({ countryCode: "US", amountInCents: 0 }), true);
assert.equal(isFreeOrderEligible({ countryCode: "CA", amountInCents: 0 }), false);
assert.equal(isFreeOrderEligible({ countryCode: "US", amountInCents: 500 }), false);
assert.equal(isFreeOrderEligible({ countryCode: "US", amountInCents: 0, finalAmountInCents: 500 }), false);
assert.equal(isFreeOrderEligible({ countryCode: "US", amountInCents: 0, quoteCountryCode: "CA", quoteTotalCents: 500 }), false);
assert.equal(validateMailingAddress({ street1: "1 Main", city: "Toronto", state: "ON", zip: "A1B 2C3", country: "CA" }).valid, true);
assert.equal(validateMailingAddress({ street1: "1 Main", city: "London", country: "GB" }).valid, false);
assert.equal(validateMailingAddress({ street1: "1 Main", city: "Paris", zip: "75001", country: "FR" }).valid, true);
assert.equal(validateMailingAddress({ street1: "1 Main", city: "Toronto", state: "Atlantis", zip: "A1B 2C3", country: "CA" }).valid, false);
assert.equal(validateMailingAddress({ street1: "1 Main", city: "Kabul", zip: "1001", country: "AF" }).valid, false, "USPS-suspended destinations rejected");
assert.equal(getEnabledDestination("CA"), null, "international checkout is off by default");
const fakeEnv = { NODE_ENV: "test", INTERNATIONAL_MAILING_FAKE_ADAPTERS: "true", ALLOW_LOCAL_MOCK_PAYMENTS: "true" };
assert.equal(authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: fakeEnv, paymentMode: "local_mock" }).allowed, true);
assert.equal(authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: true, env: fakeEnv, paymentMode: "local_mock" }).allowed, false);
assert.equal(authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: fakeEnv, paymentMode: "stripe_test" }).allowed, false);
assert.equal(authorizeInternationalCheckout({ countryCode: "ZZ", addressDeferred: false, env: fakeEnv, paymentMode: "local_mock" }).allowed, false);
assert.equal(authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: { ...fakeEnv, NODE_ENV: "production" }, paymentMode: "local_mock" }).allowed, false);
assert.equal(mailingOptionsResponse().enabled, false);

const previous = { preview: process.env.INTERNATIONAL_MAILING_PREVIEW, review: process.env.STAGING_REVIEW_ONLY };
process.env.INTERNATIONAL_MAILING_PREVIEW = "true";
process.env.STAGING_REVIEW_ONLY = "true";
assert.equal(mailingOptionsResponse().previewAvailable, true, "staging preview makes the UI reviewable without payment credentials");
assert.equal(mailingOptionsResponse().enabled, false, "live/unconfigured payment never enables checkout");
assert.equal(mailingOptionsResponse().previewOnly, true);
assert.ok(mailingOptionsResponse().destinations.length > 150);
assert.ok(!mailingOptionsResponse().destinations.some((d) => d.countryCode === "AF"));
assert.equal(getEnabledDestination("CA")?.supplierCountryId, 2);
assert.equal(isStagingInternationalCheckoutEnabled({
  INTERNATIONAL_MAILING_PREVIEW: "true",
  STAGING_REVIEW_ONLY: "true",
  NODE_ENV: "production",
  FIREBASE_PROJECT_ID: "sendmynotes-staging",
  STRIPE_SECRET_KEY: "sk_test_review_fixture",
}), true);
const stageTestEnv = {
  INTERNATIONAL_MAILING_PREVIEW: "true", STAGING_REVIEW_ONLY: "true", NODE_ENV: "production",
  FIREBASE_PROJECT_ID: "sendmynotes-staging", STRIPE_SECRET_KEY: "sk_test_review_fixture",
};
assert.equal(mailingOptionsResponse(stageTestEnv).enabled, true, "Stripe test mode exposes test checkout in preview");
assert.equal(mailingOptionsResponse({ ...stageTestEnv, STRIPE_SECRET_KEY: "sk_live_review_fixture" }).previewOnly, true);
assert.equal(mailingOptionsResponse({ ...stageTestEnv, STRIPE_SECRET_KEY: "sk_live_review_fixture" }).enabled, false);
assert.equal(isStagingInternationalCheckoutEnabled({
  INTERNATIONAL_MAILING_PREVIEW: "true",
  STAGING_REVIEW_ONLY: "true",
  NODE_ENV: "production",
  FIREBASE_PROJECT_ID: "sendmynotes-staging",
  STRIPE_SECRET_KEY: "sk_live_review_fixture",
}), false);
if (previous.preview === undefined) delete process.env.INTERNATIONAL_MAILING_PREVIEW; else process.env.INTERNATIONAL_MAILING_PREVIEW = previous.preview;
if (previous.review === undefined) delete process.env.STAGING_REVIEW_ONLY; else process.env.STAGING_REVIEW_ONLY = previous.review;

const payload = buildSingleStepOrderPayload({
  imageUrl: "https://example.invalid/card.png", handwrittenMessage: "Hello", fontId: "1",
  recipient: { firstName: "A", lastName: "B", street1: "1 Main", city: "Toronto", state: "ON", zip: "A1B 2C3", country: "CA" },
  returnAddress: { firstName: "Sender", lastName: "Person", street1: "2 Main", city: "Chicago", state: "IL", zip: "60601", country: "US" },
}, 999, true);
assert.equal(payload.recipient_country_id, 2);
assert.equal(payload.recipient_country, "Canada");
assert.equal(payload.sender_country_id, 1);
assert.equal(payload.sender_country, "United States");
assert.equal(payload.test_mode, 1);
const gbPayload = buildSingleStepOrderPayload({
  imageUrl: "https://example.invalid/card.png", handwrittenMessage: "Hello", fontId: "1",
  recipient: { firstName: "A", lastName: "B", street1: "1 Main", city: "London", state: "Greater London", zip: "SW1A 1AA", country: "GB" },
  returnAddress: { firstName: "Sender", lastName: "Person", street1: "2 Main", city: "Chicago", state: "IL", zip: "60601" },
}, 1000, false);
assert.equal(gbPayload.recipient_country_id, 4);
assert.equal(gbPayload.recipient_state, "Greater London", "non-US region text stays unchanged");
assert.equal(gbPayload.recipient_zip, "SW1A 1AA");

const order = {
  id: "order_fixture", amountInCents: 1200, finalAmountInCents: 1200,
  recipientAddress: { firstName: "A", lastName: "B", street1: "1 Main", city: "Toronto", state: "ON", zip: "A1B 2C3", country: "CA" },
  supplierCountryId: 2, quote: caQuote,
};
const matchingIntent = { status: "succeeded", amount: 1200, amount_received: 1200, currency: "usd", metadata: { orderId: "order_fixture", recipientCountryCode: "CA", quotedTotalCents: "1200", quoteVersion: caQuote.version } };
assert.equal(verifyPaymentIntentForOrder({ paymentIntent: matchingIntent, orderId: "order_fixture", order: order as any }).valid, true);
assert.equal(verifyPaymentIntentForOrder({ paymentIntent: { ...matchingIntent, amount: 1300, amount_received: 1300 }, orderId: "order_fixture", order: order as any }).valid, false, "amount tampering rejected");
assert.equal(verifyPaymentIntentForOrder({ paymentIntent: { ...matchingIntent, metadata: { ...matchingIntent.metadata, recipientCountryCode: "GB" } }, orderId: "order_fixture", order: order as any }).valid, false, "destination tampering rejected");
assert.equal(verifyPaymentIntentForOrder({ paymentIntent: matchingIntent, orderId: "wrong-order", order: order as any }).valid, false, "payment/order association mismatch rejected");
const historicalUsa = { id: "legacy", amountInCents: 900, recipientAddress: { firstName: "A", lastName: "B", street1: "1 Main", city: "Chicago", state: "IL", zip: "60601", country: "USA" } };
assert.equal(verifyPaymentIntentForOrder({ paymentIntent: { status: "succeeded", amount: 900, currency: "usd", metadata: { orderId: "legacy" } }, orderId: "legacy", order: historicalUsa as any }).valid, true, "legacy USA remains domestic");
console.log("International pricing, staging controls, and supplier payload checks passed.");
