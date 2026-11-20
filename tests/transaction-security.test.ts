import { NextRequest } from "next/server";
import { POST as stripeWebhookPost } from "../app/api/webhooks/stripe/route";
import { POST as confirmOrderPost } from "../app/api/checkout/confirm-order/route";
import { POST as completeFreeOrderPost } from "../app/api/checkout/complete-free-order/route";
import { processPaidOrder } from "../lib/order-processor";
import {
  saveOrder,
  getOrderById,
  getOrdersCollection,
  firestoreDb,
} from "../lib/firebase-admin";
import { Order } from "../lib/types";
import { CARD_FLAT_RATE_CENTS } from "../lib/stripe";
import { createOrderReadToken } from "../lib/order-access-credentials";

async function runSecurityTests() {
  console.log("=================================================");
  console.log("🛡️ RUNNING TRANSACTION & CHECKOUT SECURITY TESTS");
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

  // ---------------------------------------------------------------------------
  // VULNERABILITY 1 TESTS: Webhook Spoofing & Signature Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. Testing Vulnerability 1: Webhook Signature Bypass Remediation ---");

  const originalEnv = { ...process.env };

  try {
    // 1A. Attempt spoof with x-mock-payment-intent when webhook secret is missing/placeholder
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env["stripe-webhook-secret"];
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const spoofReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mock-payment-intent": "1", // Malicious header attempting bypass
      },
      body: JSON.stringify({
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_fake_spoofed",
            amount: 900,
            metadata: { orderId: "order_spoof_test" },
          },
        },
      }),
    });

    const spoofRes = await stripeWebhookPost(spoofReq);
    assert(
      spoofRes.status === 500,
      `Caller-controlled 'x-mock-payment-intent' cannot bypass signature (Status: ${spoofRes.status}, expected 500)`
    );

    // 1B. Missing stripe-signature header rejected with 400
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_123456789";

    const noSigReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "payment_intent.succeeded" }),
    });

    const noSigRes = await stripeWebhookPost(noSigReq);
    assert(
      noSigRes.status === 400,
      `Missing stripe-signature header rejected with HTTP 400 (Status: ${noSigRes.status})`
    );

    // 1C. Forged / invalid stripe-signature rejected with 400
    const forgedSigReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=12345678,v1=bad_signature_hash",
      },
      body: JSON.stringify({ type: "payment_intent.succeeded" }),
    });

    const forgedSigRes = await stripeWebhookPost(forgedSigReq);
    assert(
      forgedSigRes.status === 400,
      `Forged signature header rejected cryptographically with HTTP 400 (Status: ${forgedSigRes.status})`
    );

  } finally {
    process.env = { ...originalEnv };
  }

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2 TESTS: Payment Confirmation Fail-Closed & Invariant Checks
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Vulnerability 2: Payment Confirmation Invariant Checks ---");

  const testOrderId = `order_sec_test_${Date.now()}`;
  const baseOrder: Order = {
    id: testOrderId,
    viewToken: "synthetic-checkout-token",
    customerEmail: "victim@example.com",
    frontImageUrl: "https://example.com/cover.jpg",
    printedMessage: "Happy Birthday!",
    handwrittenNote: "Wishing you the best!",
    fontStyleId: "1",
    recipientAddress: {
      firstName: "Jane",
      lastName: "Doe",
      street1: "123 Elm St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    returnAddress: {
      firstName: "Aster",
      lastName: "Press",
      street1: "500 Oak St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    status: "PENDING_PAYMENT",
    amountInCents: CARD_FLAT_RATE_CENTS, // 900 cents
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveOrder(baseOrder);

  const confirmRequest = (body: object, token?: string) => confirmOrderPost(new NextRequest("http://localhost:3000/api/checkout/confirm-order", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-view-token": token } : {}) },
    body: JSON.stringify(body),
  }));
  const { viewToken: _, ...legacyOrder } = { ...baseOrder, id: `legacy_${testOrderId}`, stripePaymentId: "pi_legacy_fixture" };
  await saveOrder(legacyOrder);
  const checkoutOrder = { ...baseOrder, stripePaymentId: "pi_confirm_boundary_fixture" };
  await saveOrder(checkoutOrder);
  for (const [label, target, token, verifyOnly, bodyToken] of [
    ["bare order ID", testOrderId, undefined, false],
    ["bare verify-only", testOrderId, undefined, true],
    ["wrong header proof", testOrderId, "another-order-token", false],
    ["wrong body proof", testOrderId, undefined, false, "another-order-token"],
    ["conflicting header and body", testOrderId, "another-order-token", false, baseOrder.viewToken],
    ["read-only proof", testOrderId, createOrderReadToken(testOrderId, baseOrder.viewToken!)!, true],
    ["tokenless legacy order", legacyOrder.id, baseOrder.viewToken, false],
    ["unknown order", "unknown_order_fixture", baseOrder.viewToken, false],
  ] as const) {
    const denied = await confirmRequest({ orderId: target, verifyOnly, viewToken: bodyToken }, token);
    const deniedBody = await denied.json();
    assert(denied.status === 403 && deniedBody.error === "Checkout proof is required." && !deniedBody.viewToken
      && denied.headers.get("Cache-Control")?.includes("no-store") === true, `Confirmation rejects ${label} uniformly before payment verification`);
  }
  const untouched = await getOrderById(testOrderId);
  assert(untouched?.updatedAt === checkoutOrder.updatedAt && untouched.status === "PENDING_PAYMENT" && !untouched.fulfillmentError,
    "Denied confirmation leaves the stored payment untouched");
  await saveOrder(baseOrder);

  for (const source of ["header", "body"] as const) {
    const missingPi = await confirmRequest({
      orderId: testOrderId,
      ...(source === "body" ? { viewToken: baseOrder.viewToken } : {}),
    }, source === "header" ? baseOrder.viewToken : undefined);
    const body = await missingPi.json();
    assert(missingPi.status === 400 && body.status === "PAYMENT_VERIFICATION_FAILED",
      `An exact ${source} token reaches payment validation while a missing payment intent fails closed`);
  }

  const terminalFree = {
    ...baseOrder, id: `free_${testOrderId}`, status: "PROCESSING_HANDWRYTTEN" as const,
    amountInCents: 0, finalAmountInCents: 0,
  };
  await saveOrder(terminalFree);
  const freeRequest = (viewToken?: string, headerToken?: string) => completeFreeOrderPost(new NextRequest(
    "http://localhost:3000/api/checkout/complete-free-order", {
      method: "POST",
      headers: { "content-type": "application/json", ...(headerToken ? { "x-view-token": headerToken } : {}) },
      body: JSON.stringify({ orderId: terminalFree.id, viewToken }),
    },
  ));
  const freeBodyProof = await freeRequest(terminalFree.viewToken);
  assert(freeBodyProof.status === 200 && (await freeBodyProof.json()).alreadyProcessed,
    "An exact legacy body token can reopen a terminal free checkout");
  assert((await freeRequest()).status === 404, "Free checkout requires proof");
  assert((await freeRequest("another-order-token")).status === 404, "Free checkout rejects incorrect body proof");
  assert((await freeRequest(terminalFree.viewToken, "another-order-token")).status === 404,
    "Incorrect header proof takes precedence over a correct free checkout body token");

  const orderAfterMissingPi = await getOrderById(testOrderId);
  assert(
    orderAfterMissingPi?.status === "PENDING_PAYMENT" && !orderAfterMissingPi?.fulfillmentError,
    `Missing untrusted payment ID is rejected without mutating the pending order (Status: ${orderAfterMissingPi?.status})`
  );

  // ---------------------------------------------------------------------------
  // VULNERABILITY 3 TESTS: Concurrency & Double-Dispatch Race Condition
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Vulnerability 3: Fulfillment Concurrency (Atomic Locking) ---");

  const raceOrderId = `order_race_${Date.now()}`;
  const racePaymentIntentId = `pi_concurrent_test_${raceOrderId}`;
  const raceOrder: Order = {
    ...baseOrder,
    id: raceOrderId,
    status: "PENDING_PAYMENT",
    customerEmail: "racer@example.com",
  };
  await saveOrder(raceOrder);

  // Simulate 10 simultaneous concurrent fulfillment calls (e.g. rapid user clicks + webhooks)
  console.log("Simulating 10 concurrent processPaidOrder requests fired in the exact same millisecond...");

  const concurrentCalls = Array.from({ length: 10 }, () =>
    processPaidOrder(raceOrderId, racePaymentIntentId, "racer@example.com", { paymentMode: "local_mock" })
  );

  const results = await Promise.all(concurrentCalls);

  const dispatchedCount = results.filter(
    (r) => r.success && !r.alreadyProcessed && r.status === "PROCESSING_HANDWRYTTEN"
  ).length;

  const deduplicatedCount = results.filter(
    (r) => r.success && r.alreadyProcessed
  ).length;

  console.log(`Concurrent results: ${dispatchedCount} dispatched, ${deduplicatedCount} deduplicated.`);

  assert(
    dispatchedCount === 1,
    `Exactly 1 concurrent request acquired lock and dispatched (Got: ${dispatchedCount})`
  );

  assert(
    deduplicatedCount === 9,
    `Remaining 9 concurrent requests safely dropped duplicate dispatch (Got: ${deduplicatedCount})`
  );

  const finalRaceOrder = await getOrderById(raceOrderId);
  assert(
    finalRaceOrder?.status === "PROCESSING_HANDWRYTTEN",
    `Final order status in database is PROCESSING_HANDWRYTTEN (Status: ${finalRaceOrder?.status})`
  );

  assert(
    !!finalRaceOrder?.handwryttenOrderId,
    `Order has a valid Handwrytten Order ID recorded (HW ID: ${finalRaceOrder?.handwryttenOrderId})`
  );

  // 3B. Subsequent replay after fulfillment returns alreadyProcessed: true
  const replayResult = await processPaidOrder(raceOrderId, racePaymentIntentId, undefined, { paymentMode: "local_mock" });
  assert(
    replayResult.success === true && replayResult.alreadyProcessed === true,
    `Replay of already completed order returns alreadyProcessed: true without new dispatch`
  );

  console.log(`\n=================================================`);
  if (failed === 0) {
    console.log(`🎉 ALL TRANSACTION & SECURITY AUDIT TESTS PASSED (${passed}/${passed})`);
    console.log(`=================================================\n`);
  } else {
    console.error(`💥 SOME TESTS FAILED (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }
}

runSecurityTests().catch((e) => {
  console.error("Fatal test error:", e);
  process.exit(1);
});
