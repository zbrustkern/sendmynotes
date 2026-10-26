import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

async function main() {
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smn-ads-measurement-"));
  process.chdir(tempDir);
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.FIREBASE_CONFIG;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.K_SERVICE;

  try {
    const [{ saveOrder, getOrderById, firestoreDb }, { POST: confirmPost }, { POST: webhookPost }, { POST: queuePost }, measurement] = await Promise.all([
      import("@/lib/firebase-admin"),
      import("@/app/api/checkout/confirm-order/route"),
      import("@/app/api/webhooks/stripe/route"),
      import("@/app/api/telemetry/conversion-queue/route"),
      import("@/lib/purchase-measurement"),
    ]);

    const queueResponse = await queuePost(new NextRequest("https://sendmynotes.com/api/telemetry/conversion-queue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order_queue_fixture", destination: "google_ads", state: "queued", timestamp: Date.now(), customerEmail: "not-stored@example.test", gclid: "not-stored" }),
    }));
    assert.equal(queueResponse.status, 200, "bounded queue observation is accepted as first-party telemetry");
    const queueRef = firestoreDb.collection("telemetry_events").doc("queue_order_queue_fixture_google_ads");
    const queueEvent = (await queueRef.get()).data();
    assert.equal(queueEvent?.eventName, "conversion_queue_observed", "queue observation is explicitly non-authoritative telemetry");
    assert.equal(queueEvent?.state, "queued", "the submitted state is persisted");
    assert.equal(queueEvent?.customerEmail, undefined, "queue telemetry never persists customer email");
    assert.equal(queueEvent?.gclid, undefined, "queue telemetry never persists raw attribution IDs");

    const originalDateNow = Date.now;
    const tiedTimestamp = originalDateNow();
    Date.now = () => tiedTimestamp;
    try {
      for (const state of ["retrying", "queued", "retrying"]) {
        await queuePost(new NextRequest("https://sendmynotes.com/api/telemetry/conversion-queue", {
          method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" },
          body: JSON.stringify({ orderId: "order_queue_tie", destination: "google_ads", state, timestamp: tiedTimestamp }),
        }));
      }
    } finally { Date.now = originalDateNow; }
    assert.equal((await firestoreDb.collection("telemetry_events").doc("queue_order_queue_tie_google_ads").get()).data()?.state, "queued", "same-millisecond diagnostics never downgrade an accepted conversion");
    await queuePost(new NextRequest("https://sendmynotes.com/api/telemetry/conversion-queue", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" },
      body: JSON.stringify({ orderId: "order_queue_tie", destination: "google_ads", state: "retrying", timestamp: Date.now() + 1000 }),
    }));
    assert.equal((await firestoreDb.collection("telemetry_events").doc("queue_order_queue_tie_google_ads").get()).data()?.state, "queued", "a later stale retry cannot regress the authoritative client observation");

    const oversized = await queuePost(new NextRequest("https://sendmynotes.com/api/telemetry/conversion-queue", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" }, body: JSON.stringify({ padding: "x".repeat(5000) }),
    }));
    assert.equal(oversized.status, 413, "queue telemetry rejects request bodies above 4KB");
    let rateLimitResponse: Response | undefined;
    for (let i = 0; i < 61; i++) {
      rateLimitResponse = await queuePost(new NextRequest("https://sendmynotes.com/api/telemetry/conversion-queue", {
        method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.43" }, body: "{}",
      }));
    }
    assert.equal(rateLimitResponse?.status, 429, "queue telemetry rate-limits repeated requests per IP");

    for (let i = 0; i < 150; i++) {
      await firestoreDb.collection("telemetry_events").doc(`queue_unrelated_${i}_google_ads`).set({ orderId: `unrelated_${i}`, eventName: "conversion_queue_observed", destination: "google_ads", state: "queued", timestamp: i, createdAt: i });
    }
    const { GET: adminQueueGet } = await import("@/app/api/admin/conversion-queue/route");
    const unauthQueueResponse = await adminQueueGet(new NextRequest("https://sendmynotes.com/api/admin/conversion-queue?orderId=order_queue_fixture"));
    assert.equal(unauthQueueResponse.status, 401, "queue observations are not exposed without admin authorization");
    const { generateAdminSessionToken, ADMIN_COOKIE_NAME } = await import("@/lib/admin-auth");
    const adminToken = generateAdminSessionToken("zbrustkern@gmail.com");
    const authenticatedProjection = await adminQueueGet(new NextRequest("https://sendmynotes.com/api/admin/conversion-queue?orderId=order_queue_fixture", {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${adminToken}` },
    }));
    const projected = await authenticatedProjection.json();
    assert.equal(projected.observations.google_ads.state, "queued", "bounded direct reads return this order's latest observation regardless of unrelated volume");

    const order = {
      id: "order_fixture_capture",
      stripePaymentId: "pi_fixture_capture",
      customerEmail: "fixture@example.test",
      frontImageUrl: "fixture",
      printedMessage: "fixture",
      handwrittenNote: "fixture",
      fontStyleId: "1",
      recipientAddress: { firstName: "A", lastName: "B", street1: "1 Main", city: "Austin", state: "TX", zip: "78701" },
      returnAddress: { firstName: "C", lastName: "D", street1: "2 Main", city: "Austin", state: "TX", zip: "78701" },
      status: "PENDING_PAYMENT" as const,
      amountInCents: 765,
      paymentMethod: "STRIPE" as const,
      isFounderTest: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    assert.equal(measurement.validateVerifiedCapture(order, {
      paymentIntentId: order.stripePaymentId,
      amount: 765,
      amountReceived: 765,
      currency: "usd",
      livemode: true,
    }), null, "discounted actual capture validates against the stored payable total");
    assert.ok(measurement.validateVerifiedCapture(order, {
      paymentIntentId: order.stripePaymentId,
      amount: 900,
      amountReceived: 900,
      currency: "usd",
      livemode: true,
    }), "base price cannot replace a discounted order total");
    const excluded = measurement.buildPurchaseMeasurement({ ...order, isFounderTest: true }, {
      paymentIntentId: order.stripePaymentId,
      amount: 765,
      amountReceived: 765,
      currency: "usd",
      livemode: true,
    });
    assert.equal(excluded.eligible, false, "founder test classification suppresses a customer conversion");
    assert.equal(measurement.buildPurchaseMeasurement({ ...order, isComp: true }, {
      paymentIntentId: order.stripePaymentId, amount: 765, amountReceived: 765, currency: "usd", livemode: true,
    }).eligible, false, "comp orders are excluded");
    assert.equal(measurement.buildPurchaseMeasurement({ ...order, isTest: true }, {
      paymentIntentId: order.stripePaymentId, amount: 765, amountReceived: 765, currency: "usd", livemode: true,
    }).eligible, false, "test orders are excluded");
    assert.equal(measurement.buildPurchaseMeasurement({ ...order, amountInCents: 0 }, {
      paymentIntentId: order.stripePaymentId, amount: 0, amountReceived: 0, currency: "usd", livemode: true,
    }).eligible, false, "zero-total/free orders are excluded");
    const refunded = measurement.buildPurchaseMeasurement({ ...order, fullyRefunded: true } as any, {
      paymentIntentId: order.stripePaymentId, amount: 765, amountReceived: 765, currency: "usd", livemode: true,
    });
    assert.equal(refunded.reason, "known_refund", "an explicitly trusted full-refund marker suppresses conversion");
    assert.equal(measurement.buildPurchaseMeasurement(order, {
      paymentIntentId: order.stripePaymentId, amount: 765, amountReceived: 0, currency: "usd", livemode: true,
    }).reason, "invalid_capture", "uncaptured or zero-captured payments are excluded");

    await saveOrder(order);
    const syncMismatch = await confirmPost(new NextRequest("https://sendmynotes.com/api/checkout/confirm-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id, paymentIntentId: "pi_other_order" }),
    }));
    assert.equal(syncMismatch.status, 400, "synchronous confirmation rejects a PaymentIntent not bound to the order before retrieval");
    assert.equal((await getOrderById(order.id))?.purchaseMeasurement, undefined, "mismatched confirmation does not persist a measurement snapshot");

    const invalidWebhookOrder = { ...order, id: "order_fixture_webhook_mismatch", stripePaymentId: "pi_fixture_webhook_mismatch" };
    await saveOrder(invalidWebhookOrder);
    const invalidEvent = {
      id: "evt_fixture_webhook_mismatch", object: "event", api_version: "2025-01-27.acacia",
      created: Math.floor(Date.now() / 1000), livemode: true, pending_webhooks: 0, request: null,
      type: "payment_intent.succeeded",
      data: { object: {
        id: invalidWebhookOrder.stripePaymentId, object: "payment_intent", amount: 900,
        amount_received: 900, currency: "usd", status: "succeeded", livemode: true,
        receipt_email: null, metadata: { orderId: invalidWebhookOrder.id },
      } },
    };
    const invalidWebhookResponse = await webhookPost(new NextRequest("https://sendmynotes.com/api/webhooks/stripe", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(invalidEvent),
    }));
    assert.equal(invalidWebhookResponse.status, 200, "Stripe receives an acknowledgement for a rejected mismatched capture");
    assert.equal((await getOrderById(invalidWebhookOrder.id))?.purchaseMeasurement, undefined, "webhook amount mismatch is rejected before snapshot or fulfillment");

    const webhookOrder = {
      ...order,
      id: "order_fixture_webhook_processed",
      stripePaymentId: "pi_fixture_webhook_processed",
      status: "PROCESSING_HANDWRYTTEN" as const,
      receiptEmailSentAt: Date.now(),
    };
    await saveOrder(webhookOrder as any);
    const event = {
      id: "evt_fixture_webhook_processed",
      object: "event",
      api_version: "2025-01-27.acacia",
      created: Math.floor(Date.now() / 1000),
      livemode: true,
      pending_webhooks: 0,
      request: null,
      type: "payment_intent.succeeded",
      data: { object: {
        id: webhookOrder.stripePaymentId,
        object: "payment_intent",
        amount: 765,
        amount_received: 765,
        currency: "usd",
        status: "succeeded",
        livemode: true,
        receipt_email: null,
        metadata: { orderId: webhookOrder.id },
      } },
    };
    const webhookResponse = await webhookPost(new NextRequest("https://sendmynotes.com/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    }));
    assert.equal(webhookResponse.status, 200, "verified webhook for an already-processed order is idempotent");
    const saved = await getOrderById(webhookOrder.id);
    assert.equal(saved?.status, "PROCESSING_HANDWRYTTEN", "early fulfillment return preserves the existing order state");
    assert.equal(saved?.purchaseMeasurement?.eligible, true, "webhook persists the verified capture snapshot before the idempotent fulfillment return");
    console.log("google-purchase-measurement: all fixture assertions passed");
  } finally {
    process.chdir(originalCwd);
    await new Promise((resolve) => setTimeout(resolve, 150));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
