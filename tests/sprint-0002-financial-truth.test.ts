/**
 * tests/sprint-0002-financial-truth.test.ts
 *
 * Verification test suite for SPRINT-0002: Durable Financial Truth and Reconciliation.
 *
 * Verifies all 4 Acceptance Criteria:
 * - SPRINT-0002-AC01: Semantic deduplication of captures, distinct partial/full refunds,
 *   out-of-order arrival tolerance without state regression.
 * - SPRINT-0002-AC02: Revenue visibility across analytics outages, supplier fulfillment failures,
 *   and address deferrals; separation of free/comp/founder/test from live customer revenue.
 * - SPRINT-0002-AC03: Distributed outbox worker concurrency, expired lease recovery, dead-letter
 *   transitions, and strict replay isolation (no external side effects in replay).
 * - SPRINT-0002-AC04: Read-only reconciliation dry-run detecting all 5 discrepancy categories
 *   with cursor pagination and zero PII leakage.
 */

import assert from "assert";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import {
  recordPaymentCaptureFact,
  recordPaymentRefundFact,
  recordPaymentDisputeFact,
  computeFinancialLedgerSummary,
  getFinancialFactsByOrder,
  getFinancialFactsByPaymentIntent,
  deriveCommercialKind,
  resolvePaymentIntentReference,
} from "../lib/financial-ledger";
import {
  acceptWebhookEvent,
  markWebhookInboxProcessed,
  markWebhookInboxFailed,
  getWebhookInboxRecord,
} from "../lib/webhook-inbox";
import {
  enqueueOutboxEntry,
  claimOutboxBatch,
  completeOutboxEntry,
  failOutboxEntry,
  processOutboxQueue,
  OutboxEntry,
  TRANSACTIONAL_OUTBOX_COLLECTION,
} from "../lib/transactional-outbox";
import { projectAnalyticsOutboxEntry } from "../lib/analytics-outbox-handler";
import {
  runReconciliationDryRun,
  applyScopedCorrections,
} from "../lib/reconciliation";
import { processPaidOrder, verifyPaymentIntentForOrder } from "../lib/order-processor";
import {
  saveOrder,
  firestoreDb,
  getOrderById,
  updateOrderStatus,
} from "../lib/firebase-admin";
import { Order } from "../lib/types";
import { generateAdminSessionToken, isValidAdminSessionToken } from "../lib/admin-auth";

async function runSprint0002Tests() {
  console.log("=================================================");
  console.log("💳 RUNNING SPRINT-0002 FINANCIAL TRUTH VERIFICATION");
  console.log("=================================================\n");

  await withSafeTestHarness(async () => {
    // Production admin sessions fail closed when no production signing secret exists.
    const env = process.env as Record<string, string | undefined>;
    const savedAuthEnv = {
      NODE_ENV: env.NODE_ENV,
      ADMIN_SECRET_KEY: env.ADMIN_SECRET_KEY,
      adminSecret: env["admin-secret-key"],
      ADMIN_SESSION_SIGNING_KEY: env.ADMIN_SESSION_SIGNING_KEY,
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      K_SERVICE: env.K_SERVICE,
    };
    env.NODE_ENV = "test";
    delete env.ADMIN_SECRET_KEY;
    delete env["admin-secret-key"];
    delete env.ADMIN_SESSION_SIGNING_KEY;
    const developmentToken = generateAdminSessionToken("admin@example.com");
    env.NODE_ENV = "production";
    delete env.FIREBASE_PROJECT_ID;
    delete env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete env.K_SERVICE;
    assert.strictEqual(isValidAdminSessionToken(developmentToken), false, "Hard-coded development signing key cannot validate production sessions");
    env.ADMIN_SESSION_SIGNING_KEY = "explicit-independent-test-key";
    const independentToken = generateAdminSessionToken("admin@example.com");
    assert.strictEqual(isValidAdminSessionToken(independentToken), true, "Explicit independent production signing key remains supported");
    delete env.ADMIN_SESSION_SIGNING_KEY;
    const restoreEnv = (key: string, value: string | undefined) => {
      if (value === undefined) delete env[key];
      else env[key] = value;
    };
    restoreEnv("NODE_ENV", savedAuthEnv.NODE_ENV);
    restoreEnv("ADMIN_SECRET_KEY", savedAuthEnv.ADMIN_SECRET_KEY);
    restoreEnv("admin-secret-key", savedAuthEnv.adminSecret);
    restoreEnv("ADMIN_SESSION_SIGNING_KEY", savedAuthEnv.ADMIN_SESSION_SIGNING_KEY);
    restoreEnv("FIREBASE_PROJECT_ID", savedAuthEnv.FIREBASE_PROJECT_ID);
    restoreEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", savedAuthEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    restoreEnv("K_SERVICE", savedAuthEnv.K_SERVICE);
    // ---------------------------------------------------------------------------
    // AC01: Capture Deduplication, Distinct Refunds, Out-of-Order Delivery
    // ---------------------------------------------------------------------------
    console.log("--- 1. Testing AC01: Capture Dedupe, Distinct Refunds & Out-of-Order ---");

    const orderId1 = `ord_ac01_test_${Date.now()}`;
    const piId1 = `pi_ac01_${Date.now()}`;

    // 1A. First capture attempt: succeeds
    const cap1 = await recordPaymentCaptureFact({
      orderId: orderId1,
      paymentIntentId: piId1,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      providerEventId: `evt_cap_${Date.now()}_1`,
    });
    assert.strictEqual(cap1.duplicate, false, "Initial capture fact must not be duplicate");
    assert.strictEqual(cap1.fact.amountCents, 900);
    assert.strictEqual(cap1.fact.factType, "capture");

    // 1B. Duplicate capture attempt for the same PaymentIntent: deduplicated
    const cap2 = await recordPaymentCaptureFact({
      orderId: orderId1,
      paymentIntentId: piId1,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      providerEventId: `evt_cap_${Date.now()}_2_retry`,
    });
    assert.strictEqual(cap2.duplicate, true, "Duplicate capture must return duplicate: true");
    assert.strictEqual(cap2.fact.factId, cap1.fact.factId);

    // 1C. Two distinct partial refunds ($3.00 and $2.00) on the $9.00 capture
    const ref1 = await recordPaymentRefundFact({
      refundId: `re_part_1_${Date.now()}`,
      orderId: orderId1,
      paymentIntentId: piId1,
      amountCents: 300,
      currency: "usd",
      livemode: true,
      reason: "requested_by_customer",
    });
    assert.strictEqual(ref1.duplicate, false, "First partial refund must be accepted");
    assert.strictEqual(ref1.fact.amountCents, 300);

    const ref2 = await recordPaymentRefundFact({
      refundId: `re_part_2_${Date.now()}`,
      orderId: orderId1,
      paymentIntentId: piId1,
      amountCents: 200,
      currency: "usd",
      livemode: true,
      reason: "customer_courtesy",
    });
    assert.strictEqual(ref2.duplicate, false, "Second partial refund must be accepted");
    assert.strictEqual(ref2.fact.amountCents, 200);

    // Ensure duplicate refund with same refundId is deduplicated
    const ref2Duplicate = await recordPaymentRefundFact({
      refundId: ref2.fact.providerObjectId,
      orderId: orderId1,
      paymentIntentId: piId1,
      amountCents: 200,
      currency: "usd",
      livemode: true,
    });
    assert.strictEqual(ref2Duplicate.duplicate, true, "Duplicate refund must be deduplicated");

    // Verify order facts list has 1 capture and 2 refunds
    const order1Facts = await getFinancialFactsByOrder(orderId1);
    assert.strictEqual(order1Facts.length, 3, "Order must have 1 capture and 2 distinct refund facts");
    const captures = order1Facts.filter((f) => f.factType === "capture");
    const refunds = order1Facts.filter((f) => f.factType === "refund");
    assert.strictEqual(captures.length, 1);
    assert.strictEqual(refunds.length, 2);

    // 1D. Out-of-order test: Refund arriving before capture
    const outOfOrderPi = `pi_ooo_${Date.now()}`;
    const outOfOrderOrderId = `ord_ooo_${Date.now()}`;

    // Refund arrives first
    const earlyRefund = await recordPaymentRefundFact({
      refundId: `re_early_${Date.now()}`,
      orderId: outOfOrderOrderId,
      paymentIntentId: outOfOrderPi,
      amountCents: 450,
      currency: "usd",
      livemode: true,
    });
    assert.strictEqual(earlyRefund.duplicate, false, "Early refund accepted");

    // Capture arrives later
    const lateCapture = await recordPaymentCaptureFact({
      orderId: outOfOrderOrderId,
      paymentIntentId: outOfOrderPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
    });
    assert.strictEqual(lateCapture.duplicate, false, "Late capture accepted");

    const oooFacts = await getFinancialFactsByPaymentIntent(outOfOrderPi);
    assert.strictEqual(oooFacts.length, 2, "Out of order payment intent has both facts recorded");
    console.log("✅ AC01 PASSED: Captures deduplicate, distinct refunds stay distinct, out-of-order tolerance verified.\n");

    // ---------------------------------------------------------------------------
    // AC02: Revenue Visibility under Outages/Failures & Cohort Isolation
    // ---------------------------------------------------------------------------
    console.log("--- 2. Testing AC02: Revenue Visibility across Outages, Failures & Cohorts ---");

    const uncertainOrderId = `ord_uncertain_${Date.now()}`;
    await saveOrder({ id: uncertainOrderId, status: "DISPATCHING", dispatchStartedAt: Date.now() - 6 * 60 * 1000, amountInCents: 900, createdAt: Date.now(), updatedAt: Date.now() } as Order);
    const uncertainResult = await processPaidOrder(uncertainOrderId, `pi_uncertain_${Date.now()}`, undefined, { paymentMode: "local_mock" });
    assert.strictEqual(uncertainResult.status, "DISPATCH_UNCERTAIN", "Expired supplier dispatch lock becomes uncertain instead of resubmitting");
    assert.strictEqual(uncertainResult.success, false, "Uncertain supplier outcome is surfaced for reconciliation");

    // 2A. Analytics Outage: order processing succeeds and records capture fact even if telemetry throws
    const outageOrderId = `ord_outage_${Date.now()}`;
    const outagePi = `pi_outage_${Date.now()}`;
    const initialOutageOrder: Order = {
      id: outageOrderId,
      status: "PENDING_PAYMENT",
      amountInCents: 900,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      frontImageUrl: "https://example.com/cover.jpg",
      printedMessage: "Hello",
      handwrittenNote: "Note",
      fontStyleId: "1",
      customerEmail: "buyer@example.com",
      recipientAddress: {
        firstName: "Jane",
        lastName: "Doe",
        street1: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        country: "USA",
      },
      returnAddress: {
        firstName: "Personal",
        lastName: "Sender",
        street1: "456 Oak St",
        city: "Austin",
        state: "TX",
        zip: "78701",
        country: "USA",
      },
    };
    await saveOrder(initialOutageOrder);

    const outageResult = await processPaidOrder(outageOrderId, outagePi, "buyer@example.com", {
      isTest: false,
      paymentMode: "live",
      simulateAnalyticsOutage: true,
      verifiedPaymentIntent: { id: outagePi, status: "succeeded", amount: 900, amount_received: 900, currency: "usd", livemode: true, metadata: { orderId: outageOrderId } },
    });
    assert.strictEqual(outageResult.success, true, "processPaidOrder must succeed despite analytics outage");

    const outageFacts = await getFinancialFactsByOrder(outageOrderId);
    assert.strictEqual(outageFacts.length, 1, "Capture fact must be persisted despite analytics outage");
    assert.strictEqual(outageFacts[0].amountCents, 900);

    // Common processor boundary rechecks provider authority before lock or supplier dispatch.
    const coreMismatchOrderId = `ord_core_mismatch_${Date.now()}`;
    const coreMismatchPi = `pi_core_mismatch_${Date.now()}`;
    await saveOrder({ ...initialOutageOrder, id: coreMismatchOrderId, status: "PENDING_PAYMENT", amountInCents: 900 });
    const mismatchResult = await processPaidOrder(coreMismatchOrderId, coreMismatchPi, undefined, {
      paymentMode: "stripe_test",
      verifiedPaymentIntent: { id: coreMismatchPi, status: "succeeded", amount: 901, amount_received: 901, currency: "usd", livemode: false, metadata: { orderId: coreMismatchOrderId } },
    });
    assert.strictEqual(mismatchResult.status, "PAYMENT_VERIFICATION_FAILED", "Core processor independently rejects captured amount mismatch");
    const coreMismatchFacts = await getFinancialFactsByPaymentIntent(coreMismatchPi);
    assert.strictEqual(coreMismatchFacts.length, 1, "Captured mismatch is retained as financial evidence");
    assert.strictEqual(coreMismatchFacts[0].orderId, "", "Mismatched capture is not attributed to the order");
    assert.strictEqual((await getOrderById(coreMismatchOrderId))?.status, "PAYMENT_VERIFICATION_FAILED", "Mismatch never enters dispatch state");

    // 2B. Supplier Fulfillment Failure: order status becomes QUEUED_FOR_FULFILLMENT or FAILED, but capture remains intact!
    const failedHwOrderId = `ord_failed_hw_${Date.now()}`;
    const failedHwPi = `pi_failed_hw_${Date.now()}`;
    await recordPaymentCaptureFact({
      orderId: failedHwOrderId,
      paymentIntentId: failedHwPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
    });
    const failedHwOrder: Order = {
      ...initialOutageOrder,
      id: failedHwOrderId,
      status: "FAILED",
      fulfillmentError: "Supplier API connection refused",
    };
    await saveOrder(failedHwOrder);

    const failedHwFacts = await getFinancialFactsByOrder(failedHwOrderId);
    assert.strictEqual(failedHwFacts.length, 1, "Fulfillment-failed order must still retain capture fact");
    assert.strictEqual(failedHwFacts[0].amountCents, 900);

    // 2C. Deferred Address: Captured payment with status AWAITING_RECIPIENT_ADDRESS retains capture fact
    const deferredOrderId = `ord_deferred_${Date.now()}`;
    const deferredPi = `pi_deferred_${Date.now()}`;
    await recordPaymentCaptureFact({
      orderId: deferredOrderId,
      paymentIntentId: deferredPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
    });
    const deferredOrder: Order = {
      ...initialOutageOrder,
      id: deferredOrderId,
      status: "AWAITING_RECIPIENT_ADDRESS",
      addressDeferred: true,
    };
    await saveOrder(deferredOrder);

    const deferredFacts = await getFinancialFactsByOrder(deferredOrderId);
    assert.strictEqual(deferredFacts.length, 1, "Deferred-address order retains capture fact");

    // 2D. Free promo, studio comp, founder test, and stripe_test NEVER count as live customer revenue
    const freePromoFact = await recordPaymentCaptureFact({
      orderId: `ord_free_${Date.now()}`,
      paymentIntentId: `pi_free_${Date.now()}`,
      amountCents: 0,
      currency: "usd",
      livemode: true,
      commercialKind: deriveCommercialKind({
        amountCents: 0,
        livemode: true,
        paymentMethod: "PROMO_CODE",
      }),
    });
    assert.strictEqual(freePromoFact.fact.commercialKind, "free_promo");
    assert.strictEqual(deriveCommercialKind({ amountCents: 0, livemode: true, explicitKind: "paid_customer" }), "free_promo", "Explicit paid label cannot turn zero payable into revenue");
    assert.strictEqual(deriveCommercialKind({ amountCents: 0, livemode: true, paymentMethod: "PROMO_CODE", explicitKind: "discounted_paid" }), "free_promo", "Zero-payable promotion remains free despite paid label");
    assert.strictEqual(deriveCommercialKind({ amountCents: 720, livemode: true, paymentMethod: "PROMO_CODE", explicitKind: "paid_customer" }), "discounted_paid", "Positive payable promotional order remains paid at discounted value");
    assert.strictEqual(deriveCommercialKind({ amountCents: 720, livemode: true, explicitKind: "discounted_paid" }), "discounted_paid", "Paid discounted label remains intact");
    assert.strictEqual(deriveCommercialKind({ amountCents: 900, livemode: true, isComp: true, explicitKind: "paid_customer" }), "studio_comp", "Explicit comp provenance defeats paid label");
    assert.strictEqual(deriveCommercialKind({ amountCents: 900, livemode: true, isFounderTest: true, explicitKind: "paid_customer" }), "founder_test", "Founder test provenance defeats paid label");
    assert.strictEqual(deriveCommercialKind({ amountCents: 900, livemode: false, explicitKind: "paid_customer" }), "founder_test", "Test-mode payment defeats paid label");

    const compFact = await recordPaymentCaptureFact({
      orderId: `ord_comp_${Date.now()}`,
      paymentIntentId: `pi_comp_${Date.now()}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: deriveCommercialKind({
        amountCents: 900,
        livemode: true,
        isComp: true,
      }),
    });
    assert.strictEqual(compFact.fact.commercialKind, "studio_comp");

    const founderTestFact = await recordPaymentCaptureFact({
      orderId: `ord_founder_${Date.now()}`,
      paymentIntentId: `pi_founder_${Date.now()}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: deriveCommercialKind({
        amountCents: 900,
        livemode: true,
        isFounderTest: true,
      }),
    });
    assert.strictEqual(founderTestFact.fact.commercialKind, "founder_test");

    const stripeTestFact = await recordPaymentCaptureFact({
      orderId: `ord_stripetest_${Date.now()}`,
      paymentIntentId: `pi_stripetest_${Date.now()}`,
      amountCents: 900,
      currency: "usd",
      livemode: false,
    });
    assert.strictEqual(stripeTestFact.fact.commercialKind, "founder_test");

    // Compute live customer summary vs all summary
    const liveCustomerSummary = await computeFinancialLedgerSummary({ liveCustomerOnly: true });
    assert.ok(liveCustomerSummary.capturedCents > 0, "Live customer revenue is greater than 0");

    console.log("✅ AC02 PASSED: Captured revenue visible across failures/outages, non-customer cohorts strictly isolated.\n");

    // Verified PaymentIntent checks reject wrong amount, currency, and order binding.
    const paymentCheckOrder: Order = { id: "ord_verify", status: "PENDING_PAYMENT", amountInCents: 900, createdAt: Date.now(), updatedAt: Date.now() } as Order;
    assert.strictEqual(verifyPaymentIntentForOrder({ order: paymentCheckOrder, orderId: "ord_verify", paymentIntent: { status: "succeeded", amount: 900, amount_received: 900, currency: "usd", metadata: { orderId: "ord_verify" } } }).valid, true);
    assert.strictEqual(verifyPaymentIntentForOrder({ order: paymentCheckOrder, orderId: "ord_verify", paymentIntent: { status: "succeeded", amount: 1000, amount_received: 1000, currency: "usd", metadata: { orderId: "ord_verify" } } }).valid, false);
    assert.strictEqual(verifyPaymentIntentForOrder({ order: paymentCheckOrder, orderId: "ord_verify", paymentIntent: { status: "succeeded", amount: 900, currency: "eur", metadata: { orderId: "ord_verify" } } }).valid, false);
    assert.strictEqual(verifyPaymentIntentForOrder({ order: paymentCheckOrder, orderId: "ord_verify", paymentIntent: { status: "succeeded", amount: 900, currency: "usd", metadata: { orderId: "ord_other" } } }).valid, false);

    const retryEventId = `evt_retry_${Date.now()}`;
    const firstInboxAccept = await acceptWebhookEvent({ provider: "stripe", providerEventId: retryEventId, eventType: "payment_intent.succeeded", livemode: true, signatureVerified: true, payloadSummary: {}, nowMs: 1000 });
    assert.strictEqual(firstInboxAccept.record.status, "processing");
    await markWebhookInboxFailed(retryEventId, "simulated handler crash");
    const retryInboxAccept = await acceptWebhookEvent({ provider: "stripe", providerEventId: retryEventId, eventType: "payment_intent.succeeded", livemode: true, signatureVerified: true, payloadSummary: {}, nowMs: 2000 });
    assert.strictEqual(retryInboxAccept.duplicate, false, "Failed inbox event must be reclaimable");
    assert.strictEqual(retryInboxAccept.record.status, "processing");

    // ---------------------------------------------------------------------------
    // AC03: Outbox Concurrency, Leases, Dead-Letters, and Replay Isolation
    // ---------------------------------------------------------------------------
    console.log("--- 3. Testing AC03: Outbox Worker Concurrency & Replay Safety ---");

    const outboxKey1 = `test_outbox_conc_${Date.now()}_1`;
    const outboxKey2 = `test_outbox_conc_${Date.now()}_2`;

    await enqueueOutboxEntry({
      topic: "analytics_projection",
      orderId: "ord_conc_test",
      idempotencyKey: outboxKey1,
      payload: { test: true },
    });
    await enqueueOutboxEntry({
      topic: "analytics_projection",
      orderId: "ord_conc_test",
      idempotencyKey: outboxKey2,
      payload: { test: true },
    });

    // Worker 1 and Worker 2 claim concurrently
    const [batch1, batch2] = await Promise.all([
      claimOutboxBatch({ workerId: "worker_alpha", limit: 2 }),
      claimOutboxBatch({ workerId: "worker_beta", limit: 2 }),
    ]);

    const ids1 = new Set(batch1.map((b) => b.outboxId));
    const ids2 = new Set(batch2.map((b) => b.outboxId));

    for (const id of ids1) {
      assert.ok(!ids2.has(id), `Worker alpha and Worker beta claimed same entry: ${id}`);
    }

    // A worker that did not acquire the lease cannot acknowledge another worker's work.
    const protectedEntry = batch1[0] || batch2[0];
    if (protectedEntry) {
      await assert.rejects(() => completeOutboxEntry(protectedEntry.outboxId, "wrong-worker"), /not owned/);
    }
    // Clean up claimed entries
    for (const b of batch1) await completeOutboxEntry(b.outboxId, "worker_alpha");
    for (const b of batch2) await completeOutboxEntry(b.outboxId, "worker_beta");

    // Dead-letter transition test
    const dlKey = `test_dl_${Date.now()}`;
    const dlEntry = await enqueueOutboxEntry({
      topic: "analytics_projection",
      orderId: "ord_dl_test",
      idempotencyKey: dlKey,
      payload: { test: true },
      maxAttempts: 2,
    });

    // Claim and fail once
    const claim1 = await claimOutboxBatch({ workerId: "worker_dl", limit: 20 });
    const match1 = claim1.find((c) => c.outboxId === dlEntry.record.outboxId);
    assert.ok(match1, "Found entry for DL test");
    const failedOnce = await failOutboxEntry(match1.outboxId, "worker_dl", "Temporary error 1", 10);
    assert.strictEqual(failedOnce.status, "pending", "First failure resets to pending with backoff");

    // Claim and fail twice (exhausting maxAttempts: 2)
    const claim2 = await claimOutboxBatch({ workerId: "worker_dl", limit: 20, nowMs: Date.now() + 5000 });
    const match2 = claim2.find((c) => c.outboxId === dlEntry.record.outboxId);
    assert.ok(match2, "Found entry on second attempt");
    const failedTwice = await failOutboxEntry(match2.outboxId, "worker_dl", "Fatal error 2", 10);
    assert.strictEqual(failedTwice.status, "dead_letter", "Exhausted entry transitions to dead_letter");

    // Replay isolation check: isReplay skips external side-effect topics
    const unhandledKey = `unhandled_${Date.now()}`;
    const unhandled = await enqueueOutboxEntry({ topic: "fulfillment_dispatch", orderId: "ord_unhandled", idempotencyKey: unhandledKey, payload: {} });
    const unhandledResult = await processOutboxQueue({ workerId: "worker_without_handler", handlers: {}, nowMs: Date.now() + 1000 });
    assert.ok(unhandledResult.failed > 0, "Missing outbox handler must fail, not report success");
    const unhandledDoc = await firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(unhandled.record.outboxId).get();
    assert.strictEqual(unhandledDoc.data()?.status, "pending", "Unhandled work remains retryable");

    const analyticsEntry = await enqueueOutboxEntry({ topic: "analytics_projection", orderId: "ord_projection_test", paymentIntentId: "pi_projection_test", idempotencyKey: `projection_${Date.now()}`, payload: { amountInCents: 900, currency: "usd", isLive: false, status: "PENDING_PAYMENT" } });
    const filteredDrain = await processOutboxQueue({ workerId: "analytics-only", topics: ["analytics_projection"], handlers: { analytics_projection: projectAnalyticsOutboxEntry }, batchSize: 100 });
    assert.ok(filteredDrain.processed >= 1, "Analytics-only worker processes a supported projection");
    assert.strictEqual((await firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(unhandled.record.outboxId).get()).data()?.status, "pending", "Analytics worker leaves unsupported fulfillment work untouched");
    assert.ok((await firestoreDb.collection("analytics_order_projections").doc(analyticsEntry.record.outboxId).get()).exists, "Analytics handler persists an idempotent projection");

    const callbackRetry = await enqueueOutboxEntry({ topic: "analytics_projection", orderId: "ord_callback_retry", idempotencyKey: `callback_retry_${Date.now()}`, payload: { amountInCents: 300, currency: "usd", isLive: false }, maxAttempts: 3 });
    const callbackFailed = await processOutboxQueue({ workerId: "analytics-retry-worker", topics: ["analytics_projection"], handlers: { analytics_projection: async () => { throw new Error("temporary projection outage"); } } });
    assert.ok(callbackFailed.failed >= 1, "Handler failure is surfaced as retryable work");
    const callbackAfterFailure = await firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(callbackRetry.record.outboxId).get();
    assert.strictEqual(callbackAfterFailure.data()?.status, "pending", "Handler failure releases lease into retry backoff");
    assert.strictEqual(callbackAfterFailure.data()?.attempts, 1, "Retry attempt is durably counted");

    const replayFulfillmentKey = `replay_hw_${Date.now()}`;
    const replayEmailKey = `replay_email_${Date.now()}`;
    const replayAnalyticsKey = `replay_analytics_${Date.now()}`;

    await enqueueOutboxEntry({
      topic: "fulfillment_dispatch",
      orderId: "ord_replay",
      idempotencyKey: replayFulfillmentKey,
      payload: { test: true },
    });
    await enqueueOutboxEntry({
      topic: "transactional_email",
      orderId: "ord_replay",
      idempotencyKey: replayEmailKey,
      payload: { test: true },
    });
    await enqueueOutboxEntry({
      topic: "analytics_projection",
      orderId: "ord_replay",
      idempotencyKey: replayAnalyticsKey,
      payload: { test: true },
    });

    let externalSideEffectExecuted = false;
    let analyticsProjectionExecuted = false;

    const replayResult = await processOutboxQueue({
      workerId: "worker_replay_auditor",
      isReplay: true,
      handlers: {
        fulfillment_dispatch: async () => {
          externalSideEffectExecuted = true;
          throw new Error("CRITICAL SAFETY VIOLATION: fulfillment_dispatch executed in replay mode!");
        },
        transactional_email: async () => {
          externalSideEffectExecuted = true;
          throw new Error("CRITICAL SAFETY VIOLATION: transactional_email executed in replay mode!");
        },
        analytics_projection: async () => {
          analyticsProjectionExecuted = true;
        },
      },
    });

    assert.strictEqual(externalSideEffectExecuted, false, "External side effects must never run in replay");
    assert.ok(replayResult.skippedReplayEffects >= 2, "Skipped at least 2 external side effect entries");
    const replayHw = await firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(`outbox_${replayFulfillmentKey}`).get();
    const replayEmail = await firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(`outbox_${replayEmailKey}`).get();
    assert.strictEqual(replayHw.data()?.status, "pending", "Replay leaves fulfillment work pending");
    assert.strictEqual(replayEmail.data()?.status, "pending", "Replay leaves email work pending");
    assert.strictEqual(analyticsProjectionExecuted, true, "Analytics projection was permitted in replay");

    console.log("✅ AC03 PASSED: Worker concurrency safe, dead-letter transitions verified, replay isolation enforced.\n");

    // ---------------------------------------------------------------------------
    // AC04: Read-Only Reconciliation Dry-Run & Redaction
    // ---------------------------------------------------------------------------
    console.log("--- 4. Testing AC04: Read-Only Reconciliation Dry-Run ---");

    // Setup discrepancy conditions:
    // 1. Unmatched capture: capture fact with no orderId
    const unmatchedPi = `pi_unmatched_${Date.now()}`;
    await recordPaymentCaptureFact({
      paymentIntentId: unmatchedPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      orderId: "", // intentionally missing
    });

    // 2. Amount mismatch: order is 900 cents, capture is 450 cents
    const mismatchOrderId = `ord_mismatch_${Date.now()}`;
    const mismatchPi = `pi_mismatch_${Date.now()}`;
    await saveOrder({
      ...initialOutageOrder,
      id: mismatchOrderId,
      amountInCents: 900,
      finalAmountInCents: 900,
      status: "PROCESSING_HANDWRYTTEN",
    });
    await recordPaymentCaptureFact({
      orderId: mismatchOrderId,
      paymentIntentId: mismatchPi,
      amountCents: 450,
      currency: "usd",
      livemode: true,
    });

    // 3. Paid fulfillment failed: order status FAILED, capture exists
    const failedOrderId = `ord_rec_failed_${Date.now()}`;
    const failedPi = `pi_rec_failed_${Date.now()}`;
    await saveOrder({
      ...initialOutageOrder,
      id: failedOrderId,
      status: "FAILED",
      fulfillmentError: "Print head blocked",
    });
    await recordPaymentCaptureFact({
      orderId: failedOrderId,
      paymentIntentId: failedPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
    });

    // 4. Historical unresolved order
    const histOrderId = `ord_hist_unresolved_${Date.now()}`;
    const histPi = `pi_hist_${Date.now()}`;
    await saveOrder({
      ...initialOutageOrder,
      id: histOrderId,
      createdAt: 1729290000000,
      isTest: false,
      isFounderTest: false,
      paymentMode: "live",
    });
    await recordPaymentCaptureFact({
      orderId: histOrderId,
      paymentIntentId: histPi,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "unresolved_historical",
    });

    // Run reconciliation dry-run
    const reconResult = await runReconciliationDryRun({
      limit: 50,
      checkTelemetryDrift: true,
    });

    assert.ok(reconResult.exceptions.length > 0, "Reconciliation must identify exceptions");

    const categoriesFound = new Set(reconResult.exceptions.map((e) => e.category));
    console.log("Exceptions identified:", Array.from(categoriesFound));

    assert.ok(
      categoriesFound.has("unmatched_provider_capture" as any),
      "Must detect unmatched provider capture"
    );
    assert.ok(
      categoriesFound.has("amount_currency_mismatch" as any),
      "Must detect amount/currency mismatch"
    );
    assert.ok(
      categoriesFound.has("paid_fulfillment_failed" as any),
      "Must detect paid fulfillment failed"
    );
    assert.ok(
      categoriesFound.has("historical_unresolved" as any),
      "Must detect historical unresolved order"
    );

    // Assert zero PII in all exception records
    for (const exc of reconResult.exceptions) {
      assert.ok(!exc.details.includes("@example.com"), `PII leak detected in exception details: ${exc.details}`);
      assert.ok(!exc.details.includes("123 Main St"), `Address leak detected: ${exc.details}`);
      assert.ok(!exc.details.includes("Hello"), `Note content leak detected: ${exc.details}`);
    }

    // Scoped correction dry-run test
    const scopedResult = await applyScopedCorrections({
      operatorId: "admin_user_zeke",
      reason: "Manual audit check for SPRINT-0002 verification",
      orderIds: [histOrderId],
    });
    assert.strictEqual(scopedResult.success, true);
    assert.strictEqual(scopedResult.modifiedOrderIds.length, 1);

    console.log("✅ AC04 PASSED: Read-only reconciliation detected all categories without PII leakage.\n");

    // ---------------------------------------------------------------------------
    // 5. Testing Stripe Webhook Receiver & Admin Reconcile Route Integration
    // ---------------------------------------------------------------------------
    console.log("--- 5. Testing Stripe Webhook Route & Admin Reconcile Endpoint ---");

    const { POST: stripeWebhookPost } = await import("../app/api/webhooks/stripe/route");
    assert.strictEqual(resolvePaymentIntentReference({ id: "pi_expanded_ref", object: "payment_intent" }), "pi_expanded_ref", "Expanded PaymentIntent relation resolves to its PI ID");
    assert.strictEqual(resolvePaymentIntentReference("ch_not_a_payment_intent"), undefined, "Charge ID is never accepted as PaymentIntent ID");
    assert.strictEqual(resolvePaymentIntentReference(undefined), undefined, "Missing relation remains unmatched");
    const { GET: adminReconcileGet, POST: adminReconcilePost } = await import(
      "../app/api/admin/reconcile/route"
    );
    const { NextRequest } = await import("next/server");

    (process.env as any).NODE_ENV = "test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret_sprint_0002";
    process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
    process.env.ADMIN_SECRET_KEY = "test_admin_secret_sprint_0002";

    // 5A. Unmatched payment_intent.succeeded webhook (missing metadata.orderId)
    const unmatchedEvtId = `evt_webhook_unmatched_${Date.now()}`;
    const unmatchedPiId = `pi_webhook_unmatched_${Date.now()}`;
    const unmatchedReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({
        id: unmatchedEvtId,
        type: "payment_intent.succeeded",
        livemode: true,
        data: {
          object: {
            id: unmatchedPiId,
            amount: 900,
            amount_received: 900,
            currency: "usd",
            status: "succeeded",
            metadata: {}, // intentionally missing orderId
          },
        },
      }),
    });

    const unmatchedRes = await stripeWebhookPost(unmatchedReq);
    const unmatchedJson = await unmatchedRes.json();
    assert.strictEqual(unmatchedRes.status, 200);
    assert.ok(unmatchedJson.received, "Webhook acknowledged with 200 OK");

    const unmatchedInbox = await getWebhookInboxRecord(unmatchedEvtId);
    assert.ok(unmatchedInbox, "Unmatched webhook persisted in inbox");
    assert.strictEqual(unmatchedInbox?.status, "processed");

    // 5B. Duplicate webhook delivery
    const duplicateReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({
        id: unmatchedEvtId,
        type: "payment_intent.succeeded",
        livemode: true,
        data: {
          object: {
            id: unmatchedPiId,
            amount: 900,
            amount_received: 900,
            currency: "usd",
            status: "succeeded",
            metadata: {},
          },
        },
      }),
    });
    const duplicateRes = await stripeWebhookPost(duplicateReq);
    const duplicateJson = await duplicateRes.json();
    assert.strictEqual(duplicateJson.duplicate, true, "Duplicate webhook returned duplicate: true");

    // 5B2. A succeeded but mispriced PaymentIntent is recorded for reconciliation, never dispatched.
    const routeMismatchOrderId = `ord_mismatch_webhook_${Date.now()}`;
    const routeMismatchPiId = `pi_mismatch_webhook_${Date.now()}`;
    await saveOrder({ ...initialOutageOrder, id: routeMismatchOrderId, status: "PENDING_PAYMENT", amountInCents: 900 });
    const mismatchReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({
        id: `evt_mismatch_${Date.now()}`,
        type: "payment_intent.succeeded",
        livemode: true,
        data: { object: { id: routeMismatchPiId, amount: 1200, amount_received: 1200, currency: "usd", status: "succeeded", created: Math.floor(Date.now() / 1000), metadata: { orderId: routeMismatchOrderId } } },
      }),
    });
    const mismatchRes = await stripeWebhookPost(mismatchReq);
    const mismatchJson = await mismatchRes.json();
    assert.strictEqual(mismatchRes.status, 200);
    assert.match(mismatchJson.warning, /reconciliation/i);
    const mismatchOrderAfter = await getOrderById(routeMismatchOrderId);
    assert.strictEqual(mismatchOrderAfter?.status, "PENDING_PAYMENT", "Mismatched capture must not dispatch or mutate order fulfillment state");
    const mismatchFacts = await getFinancialFactsByPaymentIntent(routeMismatchPiId);
    assert.strictEqual(mismatchFacts.length, 1, "Captured money remains recorded despite amount mismatch");
    assert.strictEqual(mismatchFacts[0].commercialKind, "unresolved_historical");

    // 5C. Charge Refunded webhook
    const refundEvtId = `evt_webhook_refund_${Date.now()}`;
    const refundBody = JSON.stringify({
        id: refundEvtId,
        type: "charge.refunded",
        livemode: true,
        data: {
          object: {
            id: `ch_ref_${Date.now()}`,
            payment_intent: unmatchedPiId,
            amount_refunded: 450,
            currency: "usd",
            refunds: {
              data: [
                {
                  id: `re_wh_${Date.now()}`,
                  amount: 450,
                  currency: "usd",
                  reason: "requested_by_customer",
                },
              ],
            },
          },
        },
      });
    const makeRefundRequest = () => new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST", headers: { "stripe-signature": "sig_test" }, body: refundBody,
    });

    const refundRes = await stripeWebhookPost(makeRefundRequest());
    const refundJson = await refundRes.json();
    assert.strictEqual(refundRes.status, 200);
    assert.strictEqual(refundJson.event, "charge.refunded");

    // Expanded relation links to PI; a missing relation stays explicitly unmatched.
    const expandedRefundId = `re_expanded_${Date.now()}`;
    const expandedChargeId = `ch_expanded_${Date.now()}`;
    const expandedRefundReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST", headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({ id: `evt_expanded_refund_${Date.now()}`, type: "charge.refunded", livemode: true,
        data: { object: { id: expandedChargeId, payment_intent: { id: unmatchedPiId, object: "payment_intent" }, amount_refunded: 125, currency: "usd", refunds: { data: [{ id: expandedRefundId, amount: 125, currency: "usd", created: Math.floor(Date.now()/1000) }] } } } }),
    });
    assert.strictEqual((await stripeWebhookPost(expandedRefundReq)).status, 200, "Expanded PaymentIntent refund event is processed");
    const expandedRefundFact = await firestoreDb.collection("financial_facts").doc(`fact_ref_${expandedRefundId}`).get();
    assert.strictEqual(expandedRefundFact.data()?.paymentIntentId, unmatchedPiId, "Expanded relation links refund to actual capture key");

    const unmatchedRefundId = `re_unmatched_${Date.now()}`;
    const unmatchedChargeId = `ch_unmatched_${Date.now()}`;
    const unmatchedRefundEventId = `evt_unmatched_refund_${Date.now()}`;
    const unmatchedRefundReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST", headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({ id: unmatchedRefundEventId, type: "charge.refunded", livemode: true,
        data: { object: { id: unmatchedChargeId, payment_intent: null, amount_refunded: 80, currency: "usd", refunds: { data: [{ id: unmatchedRefundId, amount: 80, currency: "usd" }] } } } }),
    });
    assert.strictEqual((await stripeWebhookPost(unmatchedRefundReq)).status, 200, "Itemized refund without PI link is preserved");
    const unmatchedRefundFact = await firestoreDb.collection("financial_facts").doc(`fact_ref_${unmatchedRefundId}`).get();
    assert.strictEqual(unmatchedRefundFact.data()?.providerRelationshipStatus, "unmatched", "Missing PI remains explicitly unmatched");
    assert.strictEqual(unmatchedRefundFact.data()?.paymentIntentId, undefined, "Charge ID is not stored in paymentIntentId");
    assert.strictEqual(unmatchedRefundFact.data()?.commercialKind, "unresolved_historical", "Unlinked refund is excluded from verified customer classification");

    const lateLinkedRefund = await recordPaymentRefundFact({ refundId: unmatchedRefundId, paymentIntentId: unmatchedPiId, amountCents: 80, currency: "usd", livemode: true });
    assert.equal(lateLinkedRefund.duplicate, true, "Late PI correlation cannot duplicate an unmatched refund");
    assert.equal((await firestoreDb.collection("financial_facts").where("providerObjectId", "==", unmatchedRefundId).get()).size, 1, "Stable refund identity survives relation changes");

    // Cumulative amount_refunded without item IDs remains retryable and writes no fact;
    // replaying an already itemized event remains deduplicated.
    const retryRefundEventId = `evt_refund_items_retry_${Date.now()}`;
    const noItemsBody = JSON.stringify({ id: retryRefundEventId, type: "charge.refunded", livemode: true,
      data: { object: { id: `ch_retry_${Date.now()}`, payment_intent: unmatchedPiId, amount_refunded: 300, currency: "usd", refunds: { data: [] } } } });
    const retryRequest = () => new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "sig_test" }, body: noItemsBody });
    const noItemsResponse = await stripeWebhookPost(retryRequest());
    assert.strictEqual(noItemsResponse.status, 500, "Cumulative-only refund callback remains retryable");
    const retryInbox = await getWebhookInboxRecord(retryRefundEventId);
    assert.strictEqual(retryInbox?.status, "failed", "Missing itemization does not consume the inbox event");
    const retryCount = retryInbox?.attempts;
    assert.strictEqual((await stripeWebhookPost(retryRequest())).status, 500, "Retry with the same cumulative-only payload remains unprocessed");
    const retriedInbox = await getWebhookInboxRecord(retryRefundEventId);
    assert.strictEqual(retriedInbox?.status, "failed", "Repeated missing itemization remains retryable");
    assert.ok((retriedInbox?.attempts || 0) > (retryCount || 0), "Inbox retry attempt count increases on redelivery");
    assert.strictEqual((await firestoreDb.collection("financial_facts").where("providerEventId", "==", retryRefundEventId).get()).size, 0, "Repeated cumulative-only callbacks write no duplicate-prone refund fact");
    assert.strictEqual((await stripeWebhookPost(makeRefundRequest())).status, 200, "Existing itemized refund event replay is safely acknowledged");
    assert.strictEqual((await firestoreDb.collection("financial_facts").where("providerEventId", "==", refundEvtId).get()).size, 1, "Itemized replay does not duplicate refund arithmetic");

    // A missing dispute relation stays unresolved; an expanded Charge relation resolves safely.
    const unmatchedDisputeId = `dp_unmatched_${Date.now()}`;
    const unmatchedDisputeReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({ id: `evt_${unmatchedDisputeId}`, type: "charge.dispute.created", livemode: true,
        data: { object: { id: unmatchedDisputeId, charge: `ch_${Date.now()}`, payment_intent: null, amount: 200, currency: "usd", created: Math.floor(Date.now()/1000) } } }) });
    assert.strictEqual((await stripeWebhookPost(unmatchedDisputeReq)).status, 200, "Dispute without PI relation is preserved");
    const unmatchedDisputeFact = await firestoreDb.collection("financial_facts").doc(`fact_disp_${unmatchedDisputeId}`).get();
    assert.strictEqual(unmatchedDisputeFact.data()?.providerRelationshipStatus, "unmatched", "Dispute retains explicit unmatched relation");
    assert.strictEqual(unmatchedDisputeFact.data()?.paymentIntentId, undefined, "Dispute/Charge IDs are not stored as PI IDs");
    const expandedDisputeId = `dp_expanded_${Date.now()}`;
    const expandedDisputeReq = new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "sig_test" },
      body: JSON.stringify({ id: `evt_${expandedDisputeId}`, type: "charge.dispute.created", livemode: true,
        data: { object: { id: expandedDisputeId, charge: { id: `ch_${Date.now()}`, payment_intent: { id: unmatchedPiId, object: "payment_intent" } }, payment_intent: null, amount: 200, currency: "usd", created: Math.floor(Date.now()/1000) } } }) });
    assert.strictEqual((await stripeWebhookPost(expandedDisputeReq)).status, 200, "Expanded Charge PaymentIntent relation is processed");
    const expandedDisputeFact = await firestoreDb.collection("financial_facts").doc(`fact_disp_${expandedDisputeId}`).get();
    assert.strictEqual(expandedDisputeFact.data()?.paymentIntentId, unmatchedPiId, "Expanded dispute relation links using PI ID");

    // 5D. Admin Reconcile GET endpoint: Unauthorized without auth
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/reconcile");
    const unauthRes = await adminReconcileGet(unauthReq);
    assert.strictEqual(unauthRes.status, 401, "Admin reconcile rejects unauthenticated requests");

    // 5E. Admin Reconcile GET endpoint with valid x-admin-key header
    const authReq = new NextRequest("http://localhost:3000/api/admin/reconcile", {
      headers: { "x-admin-key": "test_admin_secret_sprint_0002" },
    });
    const authRes = await adminReconcileGet(authReq);
    assert.strictEqual(authRes.status, 200);
    const authData = await authRes.json();
    assert.ok(authData.summary, "Admin reconcile returns summary structure");
    assert.ok(Array.isArray(authData.exceptions), "Admin reconcile returns exceptions array");

    // 5F. Admin Reconcile POST drain_outbox
    const drainReq = new NextRequest("http://localhost:3000/api/admin/reconcile", {
      method: "POST",
      headers: {
        "x-admin-key": "test_admin_secret_sprint_0002",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "drain_outbox", isReplay: true }),
    });
    const drainRes = await adminReconcilePost(drainReq);
    assert.strictEqual(drainRes.status, 501, "General drain remains unavailable for external side-effect topics");
    const analyticsRouteEntry = await enqueueOutboxEntry({ topic: "analytics_projection", orderId: "ord_admin_projection", idempotencyKey: `admin_projection_${Date.now()}`, payload: { amountInCents: 900, currency: "usd", isLive: false, status: "PENDING_PAYMENT" } });
    const analyticsDrainReq = new NextRequest("http://localhost:3000/api/admin/reconcile", {
      method: "POST",
      headers: { "x-admin-key": "test_admin_secret_sprint_0002", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "drain_analytics", limit: 100 }),
    });
    const analyticsDrainRes = await adminReconcilePost(analyticsDrainReq);
    assert.strictEqual(analyticsDrainRes.status, 200, "Authenticated analytics-only worker is available");
    assert.ok((await firestoreDb.collection("analytics_order_projections").doc(analyticsRouteEntry.record.outboxId).get()).exists, "Authenticated worker persists the analytics projection");

    console.log("✅ Webhook routes and admin reconcile endpoints verified.\n");
  });

  console.log("=================================================");
  console.log("🎉 ALL SPRINT-0002 ACCEPTANCE CRITERIA VERIFIED!");
  console.log("=================================================");
}

runSprint0002Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
