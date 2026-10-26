import { NextRequest } from "next/server";
import { POST as createIntentPost } from "../app/api/checkout/create-intent/route";
import { POST as stripeWebhookPost } from "../app/api/webhooks/stripe/route";
import { POST as confirmOrderPost } from "../app/api/checkout/confirm-order/route";
import { POST as completeFreeOrderPost } from "../app/api/checkout/complete-free-order/route";
import { processPaidOrder } from "../lib/order-processor";
import {
  resolvePaymentMode,
  isLocalMockAllowed,
  evaluateCheckoutInitTransition,
  evaluatePaymentSubmission,
  PaymentModeConfigError,
} from "../lib/payment-mode";
import {
  saveOrder,
  getOrderById,
  saveDiscountCode,
} from "../lib/firebase-admin";
import { Order, DiscountCode } from "../lib/types";
import { CARD_FLAT_RATE_CENTS } from "../lib/stripe";

async function runPaymentModeSafetyTests() {
  console.log("=================================================");
  console.log("🔒 RUNNING PAYMENT MODE & CHECKOUT SAFETY TESTS (S0-04)");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  const originalEnv = { ...process.env };

  try {
    // ---------------------------------------------------------------------------
    // TEST SUITE 1: Server-Side Payment Mode Resolver Invariants
    // ---------------------------------------------------------------------------
    console.log("--- 1. Testing resolvePaymentMode Invariants ---");

    // 1A. Production with missing key throws 503 PaymentModeConfigError
    assert(
      (() => {
        try {
          resolvePaymentMode({ NODE_ENV: "production" });
          return false;
        } catch (err) {
          return err instanceof PaymentModeConfigError && err.statusCode === 503;
        }
      })(),
      "Missing Stripe key in production throws PaymentModeConfigError (503)"
    );

    // 1B. Production with placeholder key throws 503
    assert(
      (() => {
        try {
          resolvePaymentMode({
            NODE_ENV: "production",
            STRIPE_SECRET_KEY: "sk_test_placeholder_key_for_dev",
          });
          return false;
        } catch (err) {
          return err instanceof PaymentModeConfigError && err.statusCode === 503;
        }
      })(),
      "Placeholder key in production throws PaymentModeConfigError (503)"
    );

    // 1C. Production with test key (sk_test_) throws 503
    assert(
      (() => {
        try {
          resolvePaymentMode({
            NODE_ENV: "production",
            STRIPE_SECRET_KEY: "sk_test_real_test_key_123",
          });
          return false;
        } catch (err) {
          return err instanceof PaymentModeConfigError && err.statusCode === 503;
        }
      })(),
      "Stripe test key in production throws PaymentModeConfigError (503)"
    );

    // 1D. Production with ALLOW_LOCAL_MOCK_PAYMENTS=true CANNOT enable local_mock
    assert(
      (() => {
        try {
          resolvePaymentMode({
            NODE_ENV: "production",
            ALLOW_LOCAL_MOCK_PAYMENTS: "true",
          });
          return false;
        } catch (err) {
          return err instanceof PaymentModeConfigError && err.statusCode === 503;
        }
      })(),
      "ALLOW_LOCAL_MOCK_PAYMENTS is strictly impossible in production"
    );

    // 1E. Production with sk_live_ resolves to 'live'
    assert(
      resolvePaymentMode({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_live_valid_prod_key_123",
      }) === "live",
      "sk_live_ key in production resolves to 'live'"
    );

    // 1E-2. Production with rk_live_ (Restricted Key) resolves to 'live'
    assert(
      resolvePaymentMode({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "rk_live_valid_restricted_key_456",
      }) === "live",
      "rk_live_ restricted key in production resolves to 'live'"
    );

    // 1E-3. Production with quoted keys resolves to 'live'
    assert(
      resolvePaymentMode({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: '"sk_live_quoted_key_789"',
      }) === "live",
      "Quoted \"sk_live_\" key in production resolves to 'live'"
    );

    assert(
      resolvePaymentMode({
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "'rk_live_single_quoted_key_101'",
      }) === "live",
      "Single-quoted 'rk_live_' key in production resolves to 'live'"
    );

    // 1F. Development with sk_test_ resolves to 'stripe_test'
    assert(
      resolvePaymentMode({
        NODE_ENV: "development",
        STRIPE_SECRET_KEY: "sk_test_dev_key_456",
      }) === "stripe_test",
      "sk_test_ in development resolves to 'stripe_test'"
    );

    // 1G. Development with ALLOW_LOCAL_MOCK_PAYMENTS=true resolves to 'local_mock'
    assert(
      resolvePaymentMode({
        NODE_ENV: "development",
        ALLOW_LOCAL_MOCK_PAYMENTS: "true",
      }) === "local_mock",
      "ALLOW_LOCAL_MOCK_PAYMENTS=true in development resolves to 'local_mock'"
    );

    // 1H. Development with missing key and no ALLOW_LOCAL_MOCK_PAYMENTS throws 503
    assert(
      (() => {
        try {
          resolvePaymentMode({ NODE_ENV: "development" });
          return false;
        } catch (err) {
          return err instanceof PaymentModeConfigError && err.statusCode === 503;
        }
      })(),
      "Missing Stripe key in development without explicit opt-in throws 503"
    );

    // ---------------------------------------------------------------------------
    // TEST SUITE 2: Extracted Pure Decision Logic (UI Safety Invariants)
    // ---------------------------------------------------------------------------
    console.log("\n--- 2. Testing Pure Decision Logic (Init & Submit Safety) ---");

    // 2A. Checkout init failure stays on review and cannot advance
    const failedInit = evaluateCheckoutInitTransition(false);
    assert(
      failedInit.canAdvance === false && Boolean(failedInit.errorMessage),
      "Init failure blocks advance to payment step with clear error"
    );

    const successfulInit = evaluateCheckoutInitTransition(true);
    assert(
      successfulInit.canAdvance === true && !successfulInit.errorMessage,
      "Successful init permits advancing to payment step"
    );

    // 2B. Missing Stripe / Elements outside local_mock blocks submission and cannot call onPaymentSuccess
    const missingStripeSubmit = evaluatePaymentSubmission({
      isZeroCost: false,
      isMock: false,
      hasStripe: false,
      hasElements: false,
    });
    assert(
      missingStripeSubmit.mode === "blocked_error" &&
        missingStripeSubmit.canCallPaymentSuccessImmediately === false &&
        Boolean(missingStripeSubmit.errorMessage),
      "Missing Stripe/Elements is blocked with error, NEVER onPaymentSuccess"
    );

    // 2C. Missing Elements only blocks submission
    const missingElementsSubmit = evaluatePaymentSubmission({
      isZeroCost: false,
      isMock: false,
      hasStripe: true,
      hasElements: false,
    });
    assert(
      missingElementsSubmit.mode === "blocked_error",
      "Missing Elements when Stripe present is blocked as error"
    );

    // 2D. Zero cost order routes to free flow
    const zeroCostSubmit = evaluatePaymentSubmission({
      isZeroCost: true,
      isMock: false,
      hasStripe: false,
      hasElements: false,
    });
    assert(
      zeroCostSubmit.mode === "free",
      "Zero cost order routes strictly to free mode"
    );

    // 2E. Local mock routes to mock mode
    const mockSubmit = evaluatePaymentSubmission({
      isZeroCost: false,
      isMock: true,
      hasStripe: false,
      hasElements: false,
    });
    assert(
      mockSubmit.mode === "local_mock",
      "Explicit local_mock routes to local_mock mode"
    );

    // ---------------------------------------------------------------------------
    // TEST SUITE 3: POST /api/checkout/create-intent Safety & Mode Rejection
    // ---------------------------------------------------------------------------
    console.log("\n--- 3. Testing POST /api/checkout/create-intent Safety ---");

    const sampleOrderPayload = {
      frontImageUrl: "https://example.com/cover.jpg",
      printedMessage: "Hello",
      handwrittenNote: "Note text",
      recipientAddress: {
        firstName: "Jane",
        lastName: "Doe",
        street1: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      returnAddress: {
        firstName: "Thomas",
        lastName: "Miller",
        street1: "456 Oak St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      customerEmail: "sender@example.com",
    };

    // 3A. Missing live config in production returns 503, no mock intent
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env["stripe-secret-key"];

    const missingConfigReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleOrderPayload),
    });

    const missingConfigRes = await createIntentPost(missingConfigReq);
    const missingConfigData = await missingConfigRes.json();
    assert(
      missingConfigRes.status === 503 && !missingConfigData.clientSecret,
      `Missing live config in production returns 503 (got: ${missingConfigRes.status}, no mock secret)`
    );
    assert(
      !missingConfigData.error.includes("Invalid Stripe live secret key") &&
        !missingConfigData.error.includes("configured in production") &&
        missingConfigData.error.includes("Payment is temporarily unavailable"),
      "Error returned to client is masked and customer-safe"
    );

    // 3B. Placeholder key with NODE_ENV=production returns 503
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder_key_for_dev";
    const placeholderReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleOrderPayload),
    });

    const placeholderRes = await createIntentPost(placeholderReq);
    assert(
      placeholderRes.status === 503,
      `Placeholder key in production returns 503 (got: ${placeholderRes.status})`
    );

    // 3C. Client-sent mode flag (isMock: true, x-mock-mode) has NO effect
    const clientFlagReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-mode": "true",
      },
      body: JSON.stringify({
        ...sampleOrderPayload,
        isMock: true, // Forged client mode flag
      }),
    });

    const clientFlagRes = await createIntentPost(clientFlagReq);
    assert(
      clientFlagRes.status === 503,
      `Client-sent isMock: true flag has no effect and cannot bypass production failure (status: ${clientFlagRes.status})`
    );

    // 3D. Valid comp / zero-cost order completes via its own path
    const compCodeId = `COMP100_${Date.now()}`;
    const compDoc: DiscountCode = {
      id: compCodeId,
      code: compCodeId,
      type: "PERCENTAGE",
      value: 100,
      isActive: true,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveDiscountCode(compDoc);

    const compReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sampleOrderPayload,
        discountCode: compCodeId,
      }),
    });

    const compRes = await createIntentPost(compReq);
    const compData = await compRes.json();
    assert(
      compRes.status === 200 &&
        compData.isFree === true &&
        compData.amountInCents === 0 &&
        compData.clientSecret === null,
      `Valid comp 100% order completes via free path without Stripe intent (isFree: ${compData.isFree}, amount: ${compData.amountInCents})`
    );

    // ---------------------------------------------------------------------------
    // TEST SUITE 4: Webhook Signature Checks & Test/Live Dispatch Boundary
    // ---------------------------------------------------------------------------
    console.log("\n--- 4. Testing Webhook & Fulfillment Test/Live Safety Boundary ---");

    // 4A. Unsigned webhook event outside NODE_ENV=test bypass returns 4xx
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_valid_looking_secret_12345";
    delete process.env.TEST_BYPASS_WEBHOOK_SIGNATURE;

    const unsignedWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test_123", amount: 900 } },
      }),
    });

    const unsignedWebhookRes = await stripeWebhookPost(unsignedWebhookReq);
    assert(
      unsignedWebhookRes.status >= 400 && unsignedWebhookRes.status < 500,
      `Unsigned webhook event returns 4xx outside test bypass (got: ${unsignedWebhookRes.status})`
    );

    // 4B. livemode: false event with a live-looking supplier key present:
    // Order must NOT call live Handwrytten submission; must be labelled test.
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
    process.env.HANDWRYTTEN_API_KEY = "live_supplier_key_handwrytten_real_looking";

    // Track whether any live fetch was made to api.handwrytten.com
    const originalFetch = global.fetch;
    let liveSupplierFetchCalled = false;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("api.handwrytten.com")) {
        liveSupplierFetchCalled = true;
      }
      return originalFetch(input, init);
    };

    const testOrderId = `order_testmode_safety_${Date.now()}`;
    const testOrder: Order = {
      id: testOrderId,
      stripePaymentId: `pi_test_${testOrderId}`,
      customerEmail: "buyer@example.com",
      frontImageUrl: "https://example.com/cover.jpg",
      printedMessage: "Happy Day",
      handwrittenNote: "All the best",
      fontStyleId: "1",
      recipientAddress: {
        firstName: "Alice",
        lastName: "Smith",
        street1: "100 Pine St",
        city: "Seattle",
        state: "WA",
        zip: "98101",
      },
      returnAddress: {
        firstName: "Bob",
        lastName: "Jones",
        street1: "200 Elm St",
        city: "Seattle",
        state: "WA",
        zip: "98101",
      },
      status: "PENDING_PAYMENT",
      amountInCents: CARD_FLAT_RATE_CENTS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveOrder(testOrder);

    const testPaymentWebhookReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_intent.succeeded",
        livemode: false, // Stripe TEST payment
        data: {
          object: {
            id: `pi_test_${testOrderId}`,
            amount: CARD_FLAT_RATE_CENTS,
            amount_received: CARD_FLAT_RATE_CENTS,
            currency: "usd",
            status: "succeeded",
            livemode: false,
            metadata: { orderId: testOrderId },
            receipt_email: "buyer@example.com",
          },
        },
      }),
    });

    const testPaymentWebhookRes = await stripeWebhookPost(testPaymentWebhookReq);
    const testPaymentWebhookData = await testPaymentWebhookRes.json();

    assert(
      testPaymentWebhookRes.status === 200 && testPaymentWebhookData.received === true,
      "Test payment webhook processed without error"
    );

    assert(
      liveSupplierFetchCalled === false,
      "Live Handwrytten API was NOT called for livemode: false payment"
    );

    const processedOrder = (await getOrderById(testOrderId)) as any;
    assert(
      processedOrder?.status === "PROCESSING_HANDWRYTTEN" &&
        processedOrder?.isTest === true &&
        processedOrder?.paymentMode === "stripe_test" &&
        processedOrder?.handwryttenOrderId?.startsWith("test_hw_"),
      `Order is labelled as test order in database (isTest: ${processedOrder?.isTest}, paymentMode: ${processedOrder?.paymentMode}, HW ID: ${processedOrder?.handwryttenOrderId})`
    );

    global.fetch = originalFetch;

  } finally {
    process.env = { ...originalEnv };
  }

  console.log("\n=================================================");
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPaymentModeSafetyTests().catch((err) => {
  console.error("Test execution exception:", err);
  process.exit(1);
});
