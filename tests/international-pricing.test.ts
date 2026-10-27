import assert from "node:assert/strict";
import { calculateOrderQuote, isOrderQuoteValid, isFreeOrderEligible } from "../lib/order-pricing";
import { verifyPaymentIntentForOrder } from "../lib/order-processor";
import {
  normalizeCountryCode,
  validateMailingAddress,
  getEnabledDestination,
  listEnabledInternationalDestinations,
  mailingOptionsResponse,
  isStagingInternationalPreview,
  isProductionInternationalEnabled,
  isInternationalFeatureEnabled,
  isStagingInternationalCheckoutEnabled,
  isInternationalCheckoutEnabled,
  authorizeInternationalCheckout,
} from "../lib/mailing-destinations";
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

// --- TASK 3.1: Default production environment rejects non-US checkout while allowing domestic US (900 cents) ---
const defaultProdEnv = { NODE_ENV: "production" };
assert.equal(isProductionInternationalEnabled(defaultProdEnv), false, "production international is disabled by default");
assert.equal(isInternationalFeatureEnabled(defaultProdEnv), false, "feature is disabled in default production");
assert.equal(isInternationalCheckoutEnabled(defaultProdEnv), false, "checkout is disabled in default production");
assert.equal(getEnabledDestination("CA", defaultProdEnv), null, "CA destination is null in default production");
assert.equal(getEnabledDestination("GB", defaultProdEnv), null, "GB destination is null in default production");
assert.equal(getEnabledDestination("AU", defaultProdEnv), null, "AU destination is null in default production");
assert.equal(listEnabledInternationalDestinations(defaultProdEnv).length, 0, "destination list is empty in default production");

// Non-US checkout rejected in default production
assert.equal(
  authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: defaultProdEnv, paymentMode: "stripe_live" }).allowed,
  false,
  "default production rejects CA checkout"
);
assert.equal(
  authorizeInternationalCheckout({ countryCode: "GB", addressDeferred: false, env: defaultProdEnv, paymentMode: "stripe_live" }).allowed,
  false,
  "default production rejects GB checkout"
);
assert.equal(
  authorizeInternationalCheckout({ countryCode: "AU", addressDeferred: false, env: defaultProdEnv, paymentMode: "stripe_live" }).allowed,
  false,
  "default production rejects AU checkout"
);

// Domestic US is allowed and priced at 900 cents
assert.equal(
  authorizeInternationalCheckout({ countryCode: "US", addressDeferred: false, env: defaultProdEnv, paymentMode: "stripe_live" }).allowed,
  true,
  "default production allows domestic US checkout"
);
assert.equal(calculateOrderQuote({ countryCode: "US" }).totalCents, 900, "domestic US quote is 900 cents");
assert.equal(calculateOrderQuote({ countryCode: "US" }).basePriceCents, 900);
assert.equal(calculateOrderQuote({ countryCode: "US" }).internationalSurchargeCents, 0);

// Default production mailing options response
const defaultProdOptions = mailingOptionsResponse(defaultProdEnv);
assert.equal(defaultProdOptions.enabled, false);
assert.equal(defaultProdOptions.checkoutEnabled, false);
assert.equal(defaultProdOptions.previewAvailable, false);
assert.equal(defaultProdOptions.previewOnly, false);


// --- TASK 3.2: Production environment with ENABLE_INTERNATIONAL_MAILING: "true" and paymentMode: "stripe_live" ---
const prodEnabledEnv = {
  NODE_ENV: "production",
  ENABLE_INTERNATIONAL_MAILING: "true",
  STRIPE_SECRET_KEY: "sk_live_production_fixture_test_key",
};
assert.equal(isProductionInternationalEnabled(prodEnabledEnv), true, "isProductionInternationalEnabled returns true");
assert.equal(isInternationalFeatureEnabled(prodEnabledEnv), true, "isInternationalFeatureEnabled returns true in production");
assert.equal(isInternationalCheckoutEnabled(prodEnabledEnv), true, "isInternationalCheckoutEnabled returns true with live key");

// Authorizes enabled international countries (CA, GB, AU), calculates 1400 cents, enforces base-only discounts, rejects addressDeferred
const testCountries = [
  { code: "CA", supplierId: 2, name: "Canada" },
  { code: "GB", supplierId: 4, name: "United Kingdom" },
  { code: "AU", supplierId: 5, name: "Australia" },
];

for (const { code, supplierId, name } of testCountries) {
  // Authorizes enabled international country
  const destination = getEnabledDestination(code, prodEnabledEnv);
  assert.ok(destination, `destination ${code} is enabled in production`);
  assert.equal(destination.supplierCountryId, supplierId, `${code} maps to supplierCountryId ${supplierId}`);
  assert.equal(destination.supplierCountryName, name);

  const authLive = authorizeInternationalCheckout({
    countryCode: code,
    addressDeferred: false,
    env: prodEnabledEnv,
    paymentMode: "stripe_live",
  });
  assert.equal(authLive.allowed, true, `${code} checkout authorized with stripe_live`);

  // Calculates 1400 cents ($9 base + $5 surcharge)
  const standardQuote = calculateOrderQuote({ countryCode: code });
  assert.equal(standardQuote.totalCents, 1400, `${code} standard total is 1400 cents`);
  assert.equal(standardQuote.basePriceCents, 900);
  assert.equal(standardQuote.internationalSurchargeCents, 500);
  assert.equal(isOrderQuoteValid(standardQuote), true);

  // Enforces base-only discounts (100% base discount leaves 500 cents payable via Stripe)
  const fullDiscountQuote = calculateOrderQuote({ countryCode: code, discountCents: 900 });
  assert.equal(fullDiscountQuote.totalCents, 500, `${code} with 100% base discount leaves 500 cents payable`);
  assert.equal(fullDiscountQuote.basePriceCents, 900);
  assert.equal(fullDiscountQuote.discountCents, 900);
  assert.equal(fullDiscountQuote.internationalSurchargeCents, 500);
  assert.equal(isOrderQuoteValid(fullDiscountQuote), true);
  assert.equal(isFreeOrderEligible({ countryCode: code, amountInCents: 500 }), false, "international order with $5 surcharge is never free");

  // Partial base discount: e.g. 200 cents off leaves 1200 cents
  const partialDiscountQuote = calculateOrderQuote({ countryCode: code, discountCents: 200 });
  assert.equal(partialDiscountQuote.totalCents, 1200, `${code} with $2 discount leaves 1200 cents`);

  // Rejects addressDeferred: true
  const authDeferred = authorizeInternationalCheckout({
    countryCode: code,
    addressDeferred: true,
    env: prodEnabledEnv,
    paymentMode: "stripe_live",
  });
  assert.equal(authDeferred.allowed, false, `${code} rejects addressDeferred: true`);
  assert.equal(authDeferred.reason, "International mailing requires a complete recipient address.");
}

// Builds Handwrytten v2 payload with recipient_country_id and recipient_country
const auPayload = buildSingleStepOrderPayload({
  imageUrl: "https://example.invalid/card.png",
  handwrittenMessage: "Warm wishes from across the sea",
  fontId: "hwDavid",
  recipient: {
    firstName: "Oliver",
    lastName: "Taylor",
    street1: "123 Collins St",
    city: "Melbourne",
    state: "VIC",
    zip: "3000",
    country: "AU",
  },
  returnAddress: {
    firstName: "Sarah",
    lastName: "Miller",
    street1: "500 Elm St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    country: "US",
  },
}, 4567, false);
assert.equal(auPayload.recipient_country_id, 5, "AU recipient_country_id is 5");
assert.equal(auPayload.recipient_country, "Australia", "AU recipient_country is Australia");
assert.equal(auPayload.recipient_zip, "3000");
assert.equal(auPayload.recipient_state, "VIC");
assert.equal(auPayload.sender_country_id, 1);
assert.equal(auPayload.sender_country, "United States");

const gbV2Payload = buildSingleStepOrderPayload({
  imageUrl: "https://example.invalid/card.png",
  handwrittenMessage: "Cheerio",
  fontId: "1",
  recipient: {
    firstName: "Emma",
    lastName: "Watson",
    street1: "10 Downing St",
    city: "London",
    state: "Westminster",
    zip: "SW1A 2AA",
    country: "GB",
  },
  returnAddress: {
    firstName: "Sender",
    lastName: "Person",
    street1: "2 Main",
    city: "Chicago",
    state: "IL",
    zip: "60601",
    country: "US",
  },
}, 4568, false);
assert.equal(gbV2Payload.recipient_country_id, 4, "GB recipient_country_id is 4");
assert.equal(gbV2Payload.recipient_country, "United Kingdom", "GB recipient_country is United Kingdom");

// Production options reporting: enabled: true, checkoutEnabled: true, previewOnly: false
const prodOptions = mailingOptionsResponse(prodEnabledEnv);
assert.equal(prodOptions.enabled, true, "production mailing options enabled: true");
assert.equal(prodOptions.checkoutEnabled, true, "production mailing options checkoutEnabled: true");
assert.equal(prodOptions.previewOnly, false, "production mailing options previewOnly: false");
assert.equal(prodOptions.previewAvailable, false);
assert.ok(prodOptions.destinations.length > 150);
assert.ok(prodOptions.destinations.every((d) => d.available === true), "all un-suspended destinations available in production");


// --- TASK 3.3: Staging preview environment (INTERNATIONAL_MAILING_PREVIEW: "true", STAGING_REVIEW_ONLY: "true") ---
const stagingEnv = {
  INTERNATIONAL_MAILING_PREVIEW: "true",
  STAGING_REVIEW_ONLY: "true",
  NODE_ENV: "production",
  FIREBASE_PROJECT_ID: "sendmynotes-staging",
  STRIPE_SECRET_KEY: "sk_test_staging_fixture",
};
assert.equal(isProductionInternationalEnabled(stagingEnv), false, "staging review is not production enabled");
assert.equal(isStagingInternationalPreview(stagingEnv), true, "isStagingInternationalPreview is true");
assert.equal(isInternationalFeatureEnabled(stagingEnv), true, "isInternationalFeatureEnabled is true in staging preview");

// Continues to require stripe_test (rejects stripe_live)
assert.equal(
  authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: stagingEnv, paymentMode: "stripe_live" }).allowed,
  false,
  "staging preview rejects stripe_live"
);
assert.equal(
  authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: stagingEnv, paymentMode: "stripe_test" }).allowed,
  true,
  "staging preview authorizes stripe_test"
);

// Staging preview options reporting
const stagingOpts = mailingOptionsResponse(stagingEnv);
assert.equal(stagingOpts.enabled, true, "staging preview with test key has enabled: true");
assert.equal(stagingOpts.checkoutEnabled, true, "staging preview with test key has checkoutEnabled: true");
assert.equal(stagingOpts.previewOnly, true, "staging preview has previewOnly: true");
assert.equal(stagingOpts.previewAvailable, true, "staging preview has previewAvailable: true");

// Fail-closed verification: STAGING_REVIEW_ONLY prevents production activation even if ENABLE_INTERNATIONAL_MAILING is true
const failClosedEnv = {
  ENABLE_INTERNATIONAL_MAILING: "true",
  STAGING_REVIEW_ONLY: "true",
  NODE_ENV: "production",
};
assert.equal(isProductionInternationalEnabled(failClosedEnv), false, "STAGING_REVIEW_ONLY overrides ENABLE_INTERNATIONAL_MAILING");
assert.equal(
  authorizeInternationalCheckout({ countryCode: "CA", addressDeferred: false, env: failClosedEnv, paymentMode: "stripe_live" }).allowed,
  false,
  "fail-closed: cannot authorize live payment when STAGING_REVIEW_ONLY is set"
);

// Staging review hold protections
const stagingCaQuote2 = calculateOrderQuote({ countryCode: "CA" });
const heldOrderFixture = {
  id: "order_held_review_fixture",
  amountInCents: 1400,
  finalAmountInCents: 1400,
  recipientAddress: { firstName: "Taylor", lastName: "Swift", street1: "1 King St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" },
  supplierCountryId: 2,
  quote: stagingCaQuote2,
  isInternationalPreview: true,
  fulfillmentStatus: "INTERNATIONAL_PREVIEW_HOLD",
};
const heldIntent = {
  id: "pi_held_123",
  status: "succeeded",
  amount: 1400,
  amount_received: 1400,
  currency: "usd",
  livemode: false,
  metadata: {
    orderId: "order_held_review_fixture",
    recipientCountryCode: "CA",
    quoteVersion: stagingCaQuote2.version,
    quotedTotalCents: "1400",
  },
};
const verificationResult = verifyPaymentIntentForOrder({
  paymentIntent: heldIntent,
  orderId: "order_held_review_fixture",
  order: heldOrderFixture as any,
});
assert.equal(verificationResult.valid, true, "payment intent verification passes for held preview order");

console.log("International pricing, staging controls, and supplier payload checks passed.");
