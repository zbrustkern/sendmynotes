import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { withSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import { POST as createIntentPost } from "../app/api/checkout/create-intent/route";
import { POST as confirmOrderPost } from "../app/api/checkout/confirm-order/route";
import { POST as completeFreeOrderPost } from "../app/api/checkout/complete-free-order/route";
import { getOrderById, saveDiscountCode, saveOrder } from "../lib/firebase-admin";
import { Order } from "../lib/types";
import { getOfferRedemptionsCollection } from "../lib/offer-engine";

function setEnv(name: string, value?: string) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[name]; else env[name] = value;
}

async function postJson(url: string, payload: unknown) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function run() {
  const previous = Object.fromEntries([
    "NODE_ENV", "STRIPE_SECRET_KEY", "stripe-secret-key", "ALLOW_LOCAL_MOCK_PAYMENTS",
    "INTERNATIONAL_MAILING_FAKE_ADAPTERS", "INTERNATIONAL_MAILING_PREVIEW", "STAGING_REVIEW_ONLY",
    "TEST_BYPASS_WEBHOOK_SIGNATURE", "STRIPE_WEBHOOK_SECRET",
    "FIREBASE_PROJECT_ID",
  ].map((key) => [key, process.env[key]]));
  try {
    await withSafeTestHarness(async () => {
      setEnv("NODE_ENV", "test");
      setEnv("STRIPE_SECRET_KEY", undefined);
      setEnv("stripe-secret-key", undefined);
      setEnv("ALLOW_LOCAL_MOCK_PAYMENTS", "true");
      setEnv("INTERNATIONAL_MAILING_FAKE_ADAPTERS", "true");
      setEnv("INTERNATIONAL_MAILING_PREVIEW", undefined);
      setEnv("STAGING_REVIEW_ONLY", undefined);

      const basePayload = {
        frontImageUrl: "https://assets.example.invalid/card.png",
        handwrittenNote: "Hello from the test harness",
        fontStyleId: "1",
        recipientAddress: { firstName: "Alex", lastName: "Example", street1: "1 Rue Test", city: "Paris", state: "", zip: "75001", country: "FR" },
        returnAddress: { firstName: "Sender", lastName: "Example", street1: "2 Test St", city: "Chicago", state: "IL", zip: "60601", country: "USA" },
      };

      const disabled = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, recipientAddress: { ...basePayload.recipientAddress, country: "AF" } }));
      assert.equal(disabled.status, 503, "suspended destination rejected before payment intent creation");
      const malformed = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, recipientAddress: { ...basePayload.recipientAddress, country: "Atlantis" } }));
      assert.equal(malformed.status, 400, "unrecognized explicit destination does not default to US");
      const deferred = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, addressDeferred: true }));
      assert.equal(deferred.status, 503, "international address deferral rejected");

      setEnv("INTERNATIONAL_MAILING_FAKE_ADAPTERS", undefined);
      setEnv("ALLOW_LOCAL_MOCK_PAYMENTS", undefined);
      setEnv("INTERNATIONAL_MAILING_PREVIEW", "true");
      setEnv("STAGING_REVIEW_ONLY", "true");
      setEnv("FIREBASE_PROJECT_ID", "sendmynotes-staging");
      setEnv("STRIPE_SECRET_KEY", "sk_live_synthetic_review_fixture");
      const liveModeBlocked = await createIntentPost(await postJson("/api/checkout/create-intent", basePayload));
      assert.equal(liveModeBlocked.status, 503, "staging preview rejects international payment while only live Stripe mode is configured");
      setEnv("STRIPE_SECRET_KEY", undefined);
      setEnv("INTERNATIONAL_MAILING_FAKE_ADAPTERS", "true");
      setEnv("ALLOW_LOCAL_MOCK_PAYMENTS", "true");
      setEnv("INTERNATIONAL_MAILING_PREVIEW", undefined);
      setEnv("STAGING_REVIEW_ONLY", undefined);
      setEnv("FIREBASE_PROJECT_ID", undefined);

      const fullPriceResponse = await createIntentPost(await postJson("/api/checkout/create-intent", basePayload));
      assert.equal(fullPriceResponse.status, 200);
      const fullPrice = await fullPriceResponse.json();
      assert.equal(fullPrice.amountInCents, 1400);
      assert.equal(fullPrice.quote.internationalSurchargeCents, 500);
      assert.equal(fullPrice.quote.countryCode, "FR");
      let stored = await getOrderById(fullPrice.orderId) as Order;
      assert.equal(stored.supplierCountryId, 75);
      assert.equal(stored.isInternationalPreview, true, "preview marker is persisted on paid orders");
      assert.equal(stored.recipientAddress.country, "FR");

      const confirm = await confirmOrderPost(await postJson("/api/checkout/confirm-order", {
        orderId: fullPrice.orderId, paymentIntentId: fullPrice.paymentIntentId,
      }));
      assert.equal(confirm.status, 200);
      const confirmBody = await confirm.json();
      assert.equal(confirmBody.status, "QUEUED_FOR_FULFILLMENT", "confirmed preview order is held before supplier fulfillment");
      stored = await getOrderById(fullPrice.orderId) as Order;
      assert.equal(stored.fulfillmentStatus, "INTERNATIONAL_PREVIEW_HOLD");
      assert.equal(stored.receiptEmailSentAt, undefined, "preview confirmation does not send a receipt");

      const fixedCode = `INTL200_${Date.now()}`;
      await saveDiscountCode({ id: fixedCode, code: fixedCode, type: "FIXED_AMOUNT", value: 200, isActive: true, usedCount: 0, totalDiscountGivenCents: 0, createdAt: Date.now(), updatedAt: Date.now() });
      const discountedResponse = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, discountCode: fixedCode }));
      const discounted = await discountedResponse.json();
      assert.equal(discountedResponse.status, 200);
      assert.equal(discounted.amountInCents, 1200, "$2 base discount leaves international upgrade payable");
      assert.equal(discounted.quote.discountCents, 200);
      const discountedConfirmResponse = await confirmOrderPost(await postJson("/api/checkout/confirm-order", {
        orderId: discounted.orderId, paymentIntentId: discounted.paymentIntentId,
      }));
      assert.equal((await discountedConfirmResponse.json()).success, true);
      const discountedRedemption = await getOfferRedemptionsCollection().doc(`redemption_${discounted.orderId}`).get();
      assert.equal(discountedRedemption.data()?.payableAmountCents, 700, "offer redemption retains base payable independently of the $5 surcharge");

      const freeCode = `INTLFREE_${Date.now()}`;
      await saveDiscountCode({ id: freeCode, code: freeCode, type: "PERCENTAGE", value: 100, isActive: true, usedCount: 0, totalDiscountGivenCents: 0, createdAt: Date.now(), updatedAt: Date.now() });
      const freeBaseResponse = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, discountCode: freeCode }));
      const freeBase = await freeBaseResponse.json();
      assert.equal(freeBaseResponse.status, 200);
      assert.equal(freeBase.amountInCents, 500, "100% base discount cannot erase the international surcharge");
      assert.equal(freeBase.isFree, false);
      const freeBaseConfirmResponse = await confirmOrderPost(await postJson("/api/checkout/confirm-order", {
        orderId: freeBase.orderId, paymentIntentId: freeBase.paymentIntentId,
      }));
      assert.equal((await freeBaseConfirmResponse.json()).success, true);
      const freeBaseRedemption = await getOfferRedemptionsCollection().doc(`redemption_${freeBase.orderId}`).get();
      assert.equal(freeBaseRedemption.data()?.payableAmountCents, 0, "100% base discount redeems while the $5 destination upgrade remains paid");
      const bypass = await completeFreeOrderPost(await postJson("/api/checkout/complete-free-order", { orderId: freeBase.orderId, discountCode: freeCode }));
      assert.equal(bypass.status, 400, "free completion endpoint cannot bypass the positive destination surcharge");

      const wrongPayment = await confirmOrderPost(await postJson("/api/checkout/confirm-order", {
        orderId: discounted.orderId, paymentIntentId: "pi_forged_different_order",
      }));
      assert.equal(wrongPayment.status, 400, "unbound PaymentIntent is rejected before any payment-provider retrieval");
      const wrongPaymentBody = await wrongPayment.json();
      assert.equal(wrongPaymentBody.success, false, "caller cannot substitute another PaymentIntent identity");

      const tamperCreateResponse = await createIntentPost(await postJson("/api/checkout/create-intent", basePayload));
      const tamperCreated = await tamperCreateResponse.json();
      const tamperedOrder = await getOrderById(tamperCreated.orderId) as Order;
      await saveOrder({ ...tamperedOrder, recipientAddress: { ...tamperedOrder.recipientAddress, country: "GB" } });
      const tamperConfirmResponse = await confirmOrderPost(await postJson("/api/checkout/confirm-order", {
        orderId: tamperCreated.orderId, paymentIntentId: tamperCreated.paymentIntentId,
      }));
      assert.equal((await tamperConfirmResponse.json()).success, false, "country mutation after quote creation cannot authorize payment processing");

      // Exercise webhook-first processing and replay with an internally bypassed test signature.
      // The route receives only a synthetic test event inside the in-memory safe harness.
      setEnv("TEST_BYPASS_WEBHOOK_SIGNATURE", "true");
      setEnv("STRIPE_WEBHOOK_SECRET", "whsec_integration_test_only");
      const webhookCreateResponse = await createIntentPost(await postJson("/api/checkout/create-intent", { ...basePayload, discountCode: fixedCode }));
      const webhookCreated = await webhookCreateResponse.json();
      assert.equal(webhookCreateResponse.status, 200);
      assert.equal(webhookCreated.amountInCents, 1200);
      const { POST: webhookPost } = await import("../app/api/webhooks/stripe/route");
      const eventId = `evt_intl_preview_${Date.now()}`;
      const webhookEvent = {
        id: eventId,
        type: "payment_intent.succeeded",
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        data: { object: {
          id: webhookCreated.paymentIntentId,
          amount: 1200,
          amount_received: 1200,
          currency: "usd",
          status: "succeeded",
          livemode: false,
          metadata: {
            orderId: webhookCreated.orderId,
            recipientCountryCode: "FR",
            quoteVersion: webhookCreated.quote.version,
            quotedTotalCents: "1200",
          },
        } },
      };
      const webhookRequest = () => new NextRequest("http://localhost:3000/api/webhooks/stripe", {
        method: "POST", headers: { "stripe-signature": "test-only" }, body: JSON.stringify(webhookEvent),
      });
      const webhookResponse = await webhookPost(webhookRequest());
      assert.equal(webhookResponse.status, 200);
      const webhookBody = await webhookResponse.json();
      assert.equal(webhookBody.offerRedemption.status, "redeemed", "webhook-only completion redeems the promotion");
      const webhookRedemption = await getOfferRedemptionsCollection().doc(`redemption_${webhookCreated.orderId}`).get();
      assert.equal(webhookRedemption.data()?.payableAmountCents, 700, "webhook redemption tracks the base payable, separately from international surcharge");
      const webhookStored = await getOrderById(webhookCreated.orderId) as Order;
      assert.equal(webhookStored.fulfillmentStatus, "INTERNATIONAL_PREVIEW_HOLD", "webhook-first payment remains on preview hold");
      assert.equal(webhookStored.receiptEmailSentAt, undefined, "webhook does not send a receipt for preview order");
      const replayResponse = await webhookPost(webhookRequest());
      assert.equal((await replayResponse.json()).duplicate, true, "webhook replay is idempotent");
      assert.deepEqual(getBlockedExternalCalls(), [], "webhook hold and replay made no supplier/payment/email calls");
      assert.deepEqual(getBlockedExternalCalls(), [], "fake checkout, confirmation, and rejection paths made no external calls");
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) setEnv(key, value);
  }
  console.log("International checkout integration checks passed (fake adapters, no external effects).");
}

run().catch((error) => { console.error(error); process.exit(1); });
