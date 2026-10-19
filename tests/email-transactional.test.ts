import assert from "assert";
import { getResendApiKey, getResendClient, resend } from "@/lib/email/resend";
import {
  sendDeferredAddressReceiptEmail,
  sendOrderPenningReceiptEmail,
} from "@/lib/email/transactional";
import { Order } from "@/lib/types";

console.log("=================================================");
console.log("🧪 RUNNING RESEND & TRANSACTIONAL EMAIL TEST SUITE");
console.log("=================================================");

async function runTests() {
  // Test 1: Helper utility retrieves key from GSM or env fallback and caches in memory
  console.log("\n--- 1. Testing Resend API Key Retrieval & In-Memory Caching ---");
  const key1 = await getResendApiKey();
  console.log("Key retrieval result:", key1 ? `${key1.slice(0, 5)}...` : "(none)");
  
  // Call a second time - should hit the cache immediately
  const key2 = await getResendApiKey();
  assert.strictEqual(key1, key2, "Second retrieval must return identical cached key");
  console.log("✅ PASS: In-memory key caching verified");

  // Test 2: Resend Singleton Client Export & Safe Proxy
  console.log("\n--- 2. Testing Resend Singleton Client Initialization ---");
  const client = await getResendClient();
  console.log("getResendClient() returned:", client ? "Resend instance" : "null (safe fallback)");
  assert(resend !== undefined, "Exported resend client must be defined");
  assert(typeof resend.emails?.send === "function", "resend.emails.send must be a function");
  console.log("✅ PASS: Singleton Resend client and proxy successfully initialized without boot crash");

  // Mock Order for testing
  const mockDeferredOrder: Order = {
    id: "order_test_abc12345",
    stripePaymentId: "pi_test_12345",
    customerEmail: "sender@example.com",
    recipientAddress: {
      firstName: "Eleanor",
      lastName: "Vance",
      street1: "",
      city: "",
      state: "",
      zip: "",
    },
    returnAddress: {
      firstName: "Arthur",
      lastName: "Dent",
      street1: "42 Galaxy Way",
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    handwrittenNote: "Dear Eleanor,\nWishing you peace and quiet this weekend!\n\nWarmly, Arthur",
    printedMessage: "",
    fontStyleId: "1",
    frontImageUrl: "https://sendmynotes.com/presets/thinking-of-you.jpg",
    status: "AWAITING_RECIPIENT_ADDRESS",
    addressDeferred: true,
    address_deferred: true,
    viewToken: "tok_secure_view_9988",
    amountInCents: 900,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Test 3: Scenario A Email Generation
  console.log("\n--- 3. Testing Scenario A (address_deferred === true) Email ---");
  const resScenarioA = await sendDeferredAddressReceiptEmail({
    order: mockDeferredOrder,
    customerEmail: "sender@example.com",
  });

  assert.strictEqual(resScenarioA.success, true, "Scenario A email dispatch must succeed");
  console.log("Scenario A Dispatch result:", resScenarioA);
  console.log("✅ PASS: Scenario A receipt email generated and dispatched successfully");

  // Test 4: Scenario B Email Generation
  console.log("\n--- 4. Testing Scenario B (address completed) Email ---");
  const mockCompletedOrder: Order = {
    ...mockDeferredOrder,
    recipientAddress: {
      firstName: "Eleanor",
      lastName: "Vance",
      street1: "742 Evergreen Terrace",
      city: "Springfield",
      state: "OR",
      zip: "97477",
    },
    addressDeferred: false,
    address_deferred: false,
    status: "PROCESSING_HANDWRYTTEN",
  };

  const resScenarioB = await sendOrderPenningReceiptEmail({
    order: mockCompletedOrder,
    customerEmail: "sender@example.com",
  });

  assert.strictEqual(resScenarioB.success, true, "Scenario B email dispatch must succeed");
  console.log("Scenario B Dispatch result:", resScenarioB);
  console.log("✅ PASS: Scenario B penning confirmation email generated and dispatched successfully");

  // Test 5: Re-export compatibility check
  console.log("\n--- 5. Testing src/lib/email/resend.ts Re-export Parity ---");
  const srcResend = await import("@/src/lib/email/resend");
  assert(srcResend.getResendApiKey !== undefined, "src/lib/email/resend must export getResendApiKey");
  assert(srcResend.resend !== undefined, "src/lib/email/resend must export resend");
  console.log("✅ PASS: src/lib/email/resend parity verified");

  // Test 6: Stripe Webhook Integration for Scenario A and Scenario B
  console.log("\n--- 6. Testing Stripe Webhook Handler Wiring ---");
  const { POST: stripeWebhookPost } = await import("@/app/api/webhooks/stripe/route");
  const { saveOrder, getOrderById } = await import("@/lib/firebase-admin");
  const { NextRequest } = await import("next/server");

  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";

  // 6A. Deferred address order in webhook
  const webhookOrderA: Order = {
    ...mockDeferredOrder,
    id: `order_webhook_a_${Date.now()}`,
    status: "PENDING_PAYMENT",
    addressDeferred: true,
    address_deferred: true,
  };
  await saveOrder(webhookOrderA);

  const reqA = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "payment_intent.succeeded",
      livemode: false,
      data: {
        object: {
          id: `pi_webhook_a_${Date.now()}`,
          amount: 900,
          receipt_email: "customer_a@example.com",
          metadata: {
            orderId: webhookOrderA.id,
            address_deferred: "true",
          },
        },
      },
    }),
  });

  const resA = await stripeWebhookPost(reqA);
  const dataA = await resA.json();
  assert.strictEqual(dataA.received, true, "Webhook A response must have received: true");
  assert.strictEqual(dataA.orderId, webhookOrderA.id, "Webhook A must process correct orderId");

  const updatedOrderA = await getOrderById(webhookOrderA.id);
  assert(updatedOrderA !== null, "Order A must exist in database");
  assert.strictEqual(updatedOrderA?.status, "AWAITING_RECIPIENT_ADDRESS", "Order A status must be AWAITING_RECIPIENT_ADDRESS");
  assert((updatedOrderA as any)?.receiptEmailSentAt !== undefined, "Order A must record receiptEmailSentAt");
  console.log("✅ PASS: Webhook correctly dispatched Scenario A receipt and recorded timestamp");

  // 6B. Completed address order in webhook
  const webhookOrderB: Order = {
    ...mockCompletedOrder,
    id: `order_webhook_b_${Date.now()}`,
    status: "PENDING_PAYMENT",
    addressDeferred: false,
    address_deferred: false,
  };
  await saveOrder(webhookOrderB);

  const reqB = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "payment_intent.succeeded",
      livemode: false,
      data: {
        object: {
          id: `pi_webhook_b_${Date.now()}`,
          amount: 900,
          receipt_email: "customer_b@example.com",
          metadata: {
            orderId: webhookOrderB.id,
            address_deferred: "false",
          },
        },
      },
    }),
  });

  const resB = await stripeWebhookPost(reqB);
  const dataB = await resB.json();
  assert.strictEqual(dataB.received, true, "Webhook B response must have received: true");
  assert.strictEqual(dataB.orderId, webhookOrderB.id, "Webhook B must process correct orderId");

  const updatedOrderB = await getOrderById(webhookOrderB.id);
  assert(updatedOrderB !== null, "Order B must exist in database");
  assert((updatedOrderB as any)?.receiptEmailSentAt !== undefined, "Order B must record receiptEmailSentAt");
  console.log("✅ PASS: Webhook correctly dispatched Scenario B receipt and recorded timestamp");

  console.log("\n=================================================");
  console.log("🎉 ALL RESEND & TRANSACTIONAL EMAIL TESTS PASSED!");
  console.log("=================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
