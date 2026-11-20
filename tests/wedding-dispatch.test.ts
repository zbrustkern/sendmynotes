import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import {
  newWeddingHousehold,
  weddingApprovalFingerprint,
  type WeddingActor,
  type WeddingProject,
} from "../lib/wedding/domain";

async function main() {
  if (!process.env.SMN_TEST_DATA_DIR) {
    process.env.SMN_TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "wedding-dispatch-"));
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    WEDDING_PROJECTS_ENABLED: "true",
    WEDDING_CHECKOUT_ENABLED: "true",
    PROMOTION_WEDDING_CHECKOUT_READY: "true",
    ENABLE_INTERNATIONAL_MAILING: "true",
    STAGING_REVIEW_ONLY: "false",
    STRIPE_SECRET_KEY: "sk_live_wedding_dispatch_fixture",
    STRIPE_PUBLISHABLE_KEY: "pk_live_wedding_dispatch_fixture",
  });
  delete process.env.HANDWRYTTEN_TEST_MODE;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.WEDDING_DISPATCH_MODE;
  delete process.env.WEDDING_STAGING_HANDWRYTTEN_TEST_DISPATCH;

  const { firestoreDb: db, isFirestoreMock } = await import("../lib/firebase-admin");
  assert.ok(isFirestoreMock, "Isolated mock Firestore is required.");

  const {
    prepareHandwryttenCustomCard,
    submitPreparedHandwryttenOrder,
  } = await import("../lib/handwrytten");
  const {
    assertWeddingRuntime,
    isWeddingStagingRuntime,
    weddingStorageEnvironment,
  } = await import("../lib/wedding/server");
  const {
    resolveWeddingPaymentRuntime,
    quoteWeddingSelection,
    advanceWeddingPreparation,
    issueWeddingIntent,
    settleWeddingIntent,
    confirmWeddingPayment,
    weddingBatchRef,
    checkWeddingIntent,
  } = await import("../lib/wedding/checkout");
  const {
    enqueueWeddingBatchDispatch,
    runWeddingDispatchPass,
    releaseWeddingBatch,
    retryRejectedWeddingCards,
    syncWeddingDeliveryStatuses,
    pauseWeddingDispatch,
    resumeWeddingDispatch,
    getWeddingDispatchControl,
    listWeddingBatchesForAdmin,
    getWeddingBatchDetailForAdmin,
  } = await import("../lib/wedding/dispatch");
  const {
    sendWeddingBatchConfirmationEmail,
    buildWeddingConfirmationEmailContent,
  } = await import("../lib/wedding/email");
  const { getStripeClient, setStripeClientFactoryForTests } = await import("../lib/stripe");
  const { NextRequest } = await import("next/server");
  const { POST: receiveStripeWebhook } = await import("../app/api/webhooks/stripe/route");
  const { POST: runReconcileCron } = await import("../app/api/cron/wedding-reconcile/route");
  const { applyWeddingRefund } = await import("../lib/wedding/refunds");
  const { FINANCIAL_FACTS_COLLECTION } = await import("../lib/financial-ledger");
  const { artworkProjectSegment } = await import("../lib/wedding/artwork-storage");

  // 1. Runtime parameterization & mode mismatch rejection
  assert.equal(isWeddingStagingRuntime(), false);
  assert.equal(weddingStorageEnvironment(), "production");
  assert.equal(resolveWeddingPaymentRuntime()?.paymentMode, "live");
  assert.equal(resolveWeddingPaymentRuntime()?.expectedLivemode, true);
  assert.equal(resolveWeddingPaymentRuntime()?.storageEnv, "production");

  // Mode mismatches fail closed
  {
    const prevPk = process.env.STRIPE_PUBLISHABLE_KEY;
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_mismatch";
    assert.equal(resolveWeddingPaymentRuntime(), null, "pk_test with sk_live must be rejected");
    process.env.STRIPE_PUBLISHABLE_KEY = prevPk;

    process.env.STAGING_REVIEW_ONLY = "true";
    assert.equal(resolveWeddingPaymentRuntime(), null, "sk_live with STAGING_REVIEW_ONLY=true must be rejected");
    assert.equal(isWeddingStagingRuntime(), true);
    assert.equal(weddingStorageEnvironment(), "staging");
    process.env.STAGING_REVIEW_ONLY = "false";

    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    assert.equal(resolveWeddingPaymentRuntime(), null, "mock Firestore must fail closed in NODE_ENV=production");
    assert.throws(() => assertWeddingRuntime(), { code: "wedding_disabled" });
    (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
  }

  // 2. prepareHandwryttenCustomCard: private SHA-256 verified PNG bytes + allowTestMode guards
  {
    process.env.HANDWRYTTEN_API_KEY = "hw_test_key_never_networked";
    process.env.HANDWRYTTEN_BACKPLATE_IMAGE_ID = "999";
    const pngBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const pngSha = createHash("sha256").update(pngBytes).digest("hex");

    // Bad SHA-256 must fail closed before any fetch
    let fetchCalls = 0;
    const badShaRes = await prepareHandwryttenCustomCard(
      {
        orderId: "wb_sha_fail",
        imageUrl: "",
        rawCoverBytes: { bytes: pngBytes, sha256: "0".repeat(64) },
      },
      async () => {
        fetchCalls++;
        return new Response("{}", { status: 200 });
      },
    );
    assert.equal(badShaRes.success, false);
    assert.equal(fetchCalls, 0);

    // Valid SHA-256 uploads PNG and creates custom card (dimension_id: 4)
    const uploadCalls: Array<{ url: string; body: unknown }> = [];
    const okPrep = await prepareHandwryttenCustomCard(
      {
        orderId: "wb_sha_ok",
        imageUrl: "",
        rawCoverBytes: { bytes: pngBytes, sha256: pngSha, mimeType: "image/png", fileName: "wb_sha_ok.png" },
      },
      async (url, init) => {
        uploadCalls.push({ url: String(url), body: init?.body });
        if (String(url).includes("uploadCustomLogo")) {
          return new Response(JSON.stringify({ status: "ok", id: 7711 }), { status: 200 });
        }
        const parsed = JSON.parse(String(init?.body));
        assert.equal(parsed.dimension_id, 4);
        assert.equal(parsed.cover_id, 7711);
        assert.equal(parsed.back_logo_id, 999);
        return new Response(JSON.stringify({ status: "ok", card_id: 8822 }), { status: 200 });
      },
    );
    assert.equal(okPrep.success, true);
    if (okPrep.success) {
      assert.equal(okPrep.cardId, "8822");
      assert.equal(okPrep.environment, "live");
    }
    assert.equal(uploadCalls.length, 2);

    // allowTestMode behavior: multi-send default blocks HANDWRYTTEN_TEST_MODE=true; wedding test dispatch sends test_mode: 1
    process.env.HANDWRYTTEN_TEST_MODE = "true";
    process.env.STAGING_REVIEW_ONLY = "true";
    process.env.WEDDING_STAGING_HANDWRYTTEN_TEST_DISPATCH = "true";

    const multiSendBlocked = await submitPreparedHandwryttenOrder(
      {
        orderId: "ms_1",
        imageUrl: "/presets/thank-you-botanical.jpg",
        handwrittenMessage: "Hello",
        fontId: "hwDavid",
        recipient: { firstName: "Maya", lastName: "Lin", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
        returnAddress: { firstName: "Sam", lastName: "Lee", street1: "2 Oak St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
      },
      "8822",
      async () => new Response(JSON.stringify({ status: "ok", order_id: "should_not_run" }), { status: 200 }),
    );
    assert.equal(multiSendBlocked.success, false, "Multi-send without allowTestMode remains blocked in test mode");

    let capturedTestModePayload: Record<string, unknown> | null = null;
    const weddingTestSent = await submitPreparedHandwryttenOrder(
      {
        orderId: "wb_test_1",
        imageUrl: "/presets/thank-you-botanical.jpg",
        handwrittenMessage: "Thank you!",
        fontId: "hwDavid",
        recipient: { firstName: "Maya", lastName: "Lin", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
        returnAddress: { firstName: "Sam", lastName: "Lee", street1: "2 Oak St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
      },
      "8822",
      async (_url, init) => {
        capturedTestModePayload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ status: "ok", order_id: "hw_test_901" }), { status: 200 });
      },
      { allowTestMode: true },
    );
    assert.equal(weddingTestSent.success, true);
    assert.equal((capturedTestModePayload as Record<string, unknown> | null)?.test_mode, 1);

    // Safety guard: if STAGING_REVIEW_ONLY=true and HANDWRYTTEN_TEST_MODE is unset, even allowTestMode fails closed
    delete process.env.HANDWRYTTEN_TEST_MODE;
    const stagingLiveBlocked = await submitPreparedHandwryttenOrder(
      {
        orderId: "wb_test_2",
        imageUrl: "/presets/thank-you-botanical.jpg",
        handwrittenMessage: "Thank you!",
        fontId: "hwDavid",
        recipient: { firstName: "Maya", lastName: "Lin", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
        returnAddress: { firstName: "Sam", lastName: "Lee", street1: "2 Oak St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
      },
      "8822",
      async () => new Response(JSON.stringify({ status: "ok", order_id: "forbidden" }), { status: 200 }),
      { allowTestMode: true },
    );
    assert.equal(stagingLiveBlocked.success, false);

    process.env.STAGING_REVIEW_ONLY = "false";
    delete process.env.WEDDING_STAGING_HANDWRYTTEN_TEST_DISPATCH;
    delete process.env.HANDWRYTTEN_TEST_MODE;
  }

  // Mock Stripe SDK for live mode checkout & webhook tests
  const intents = new Map<string, Stripe.PaymentIntent>();
  const intentCreateParams: Array<Stripe.PaymentIntentCreateParams> = [];
  let intentSeq = 0;
  const sdk = {
    paymentIntents: {
      create: async (p: Stripe.PaymentIntentCreateParams) => {
        intentCreateParams.push(p);
        const id = `pi_live_${++intentSeq}`;
        const pi = {
          id,
          client_secret: `cs_live_${id}`,
          amount: p.amount,
          currency: p.currency,
          status: "requires_payment_method",
          amount_received: 0,
          livemode: true,
          receipt_email: p.receipt_email ?? null,
          metadata: p.metadata,
        } as unknown as Stripe.PaymentIntent;
        intents.set(id, pi);
        return pi;
      },
      retrieve: async (id: string) => intents.get(id)!,
      cancel: async (id: string) => {
        const pi = intents.get(id)!;
        pi.status = "canceled";
        return pi;
      },
    },
    refunds: {
      create: async () => { throw new Error("not used here"); },
      retrieve: async () => { throw new Error("not used here"); },
    },
  };
  setStripeClientFactoryForTests(() => sdk as unknown as Stripe);

  async function seedProject(count: number, withUploadCover = false) {
    const projectId = `wp_${randomUUID()}`;
    const sessionId = randomUUID();
    const actor: WeddingActor = {
      projectId,
      actorId: "owner",
      role: "owner",
      verified: true,
      uid: `uid_${projectId}`,
      pilot: true,
      canPay: true,
      canExport: true,
      sessionId,
    };
    const address = {
      address1: "100 Peachtree St",
      address2: "",
      city: "Atlanta",
      state: "GA",
      country: "US",
      zip: "30303",
    };
    const coverBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const coverSha = createHash("sha256").update(coverBytes).digest("hex");
    const project: WeddingProject = {
      id: projectId,
      ownerId: "owner",
      revision: 1,
      sharedBody: "Thank you so much for celebrating with us and for your thoughtful gift.",
      signOff: "With love,\nJordan & Taylor",
      handwriting: "hwDavid",
      cover: withUploadCover
        ? {
            kind: "upload",
            id: "art_cover_1",
            url: "/api/wedding/artwork?id=art_cover_1",
            hash: coverSha,
            masterKey: `wedding-normalized/production/${artworkProjectSegment(projectId)}/${coverSha}.png`,
          }
        : { kind: "preset", id: "preset-thankyou-botanical", url: "/presets/thank-you-botanical.jpg" },
      returnAddress: { ...address, firstName: "Jordan", lastName: "Taylor" },
      templates: [],
      purchasedCount: 0,
      activeBatchId: null,
      householdCount: count,
      writingMode: "shared",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      claimedAt: null,
      expiresAt: Date.now() + 86400000,
    };
    const ref = db.collection("weddingProjects").doc(projectId);
    await ref.set(project);
    await ref.collection("members").doc("owner").set({
      id: "owner",
      uid: actor.uid,
      role: "owner",
      canPay: true,
      canExport: true,
      revoked: false,
    });
    await db.collection("weddingSessions").doc(sessionId).set({
      projectId,
      actorId: "owner",
      expiresAt: Date.now() + 86400000,
      revoked: false,
    });

    const selection: Array<{ id: string; revision: number }> = [];
    for (let i = 1; i <= count; i++) {
      const hid = `H${String(i).padStart(3, "0")}`;
      const row = newWeddingHousehold(hid);
      Object.assign(row, {
        insideNameConfirmed: true,
        identityConfirmed: true,
        insideName: `Guest ${i}`,
        envelopeName: `Guest ${i} Household`,
        firstName: `Guest${i}`,
        lastName: "Family",
        address: i === count && count >= 3
          ? { address1: "10 Downing St", address2: "", city: "London", state: "", country: "GB", zip: "SW1A 2AA" }
          : { ...address, address1: `${100 + i} Oak Lane` },
        addressConfirmed: true,
      });
      row.approvedFingerprint = weddingApprovalFingerprint(project, row);
      await ref.collection("households").doc(hid).set(row);
      selection.push({ id: hid, revision: 1 });
    }
    return { actor, ref, project, selection, coverBytes, coverSha };
  }

  try {
    // 3. Live checkout with buyerEmail, attribution, automatic_payment_methods, financial_facts, and email receipt
    {
      const { actor, selection } = await seedProject(3, false);

      await assert.rejects(
        quoteWeddingSelection(actor, selection, undefined, undefined, { buyerEmail: "not-an-email" }),
        /valid email/i,
      );

      const { quote } = await quoteWeddingSelection(actor, selection, undefined, undefined, {
        buyerEmail: "Couple@Example.COM ",
      });
      const reserved = await quoteWeddingSelection(actor, selection, quote.id, undefined, {
        buyerEmail: "Couple@Example.COM ",
        attribution: {
          utmSource: "meta",
          utmMedium: "paid_social",
          utmCampaign: "wedding_q4",
          fbclid: "fb.1.12345",
        },
      });
      assert.equal("batchId" in reserved, true);
      const batchId = (reserved as { batchId: string }).batchId;
      assert.equal((reserved as { buyerEmail: string | null }).buyerEmail, "couple@example.com");
      assert.equal((reserved as { paymentMode: string }).paymentMode, "live");
      assert.equal((reserved as { stagingReviewOnly: boolean }).stagingReviewOnly, false);

      await advanceWeddingPreparation(actor, batchId);
      const payInit = await issueWeddingIntent(actor, batchId);
      assert.ok((payInit as { clientSecret?: string }).clientSecret);
      const lastPiCreate = intentCreateParams.at(-1)!;
      assert.deepEqual(lastPiCreate.automatic_payment_methods, { enabled: true });
      assert.equal(lastPiCreate.payment_method_types, undefined);
      assert.equal(lastPiCreate.receipt_email, "couple@example.com");

      const batchDocBefore = (await weddingBatchRef(batchId).get()).data()!;
      assert.equal(batchDocBefore.attribution?.utmCampaign, "wedding_q4");
      assert.equal(batchDocBefore.attribution?.fbclid, "fb.1.12345");
      assert.equal(batchDocBefore.paymentMode, "live");

      const pi = intents.get(batchDocBefore.paymentIntentId)!;
      // Mode mismatch check on checkWeddingIntent
      assert.throws(() => checkWeddingIntent(batchDocBefore as any, { ...pi, livemode: false }), /match/);

      // Succeed live PI and confirm
      pi.status = "succeeded";
      pi.amount_received = pi.amount;
      await confirmWeddingPayment(actor, batchId);

      // Verify financial_facts has livemode: true and commercialKind: "paid_customer"
      const factSnap = await db.collection(FINANCIAL_FACTS_COLLECTION).doc(`fact_cap_${pi.id}`).get();
      assert.equal(factSnap.data()?.livemode, true);
      assert.equal(factSnap.data()?.commercialKind, "paid_customer");

      // Email confirmation: test HTML escaping, canonical copy, and idempotency
      const htmlContent = buildWeddingConfirmationEmailContent({
        batchId,
        buyerEmail: "couple@example.com",
        cardCount: 3,
        internationalCount: 1,
        totalCents: pi.amount,
        recoveryUrl: "https://sendmynotes.com/thank-you/wedding?x=<script>",
      });
      assert.ok(htmlContent.html.includes("&lt;script&gt;"));
      assert.ok(htmlContent.text.includes("1-2 business days"));
      assert.ok(htmlContent.text.includes("2-7 business days"));
      assert.ok(htmlContent.text.includes("Phoenix, AZ"));
      assert.ok(!/human handwriting|letterpress/i.test(htmlContent.html));

      let emailSendCount = 0;
      const sentEmail1 = await sendWeddingBatchConfirmationEmail(batchId, {
        sendEmail: async (payload) => {
          emailSendCount++;
          assert.deepEqual(payload.to, ["couple@example.com"]);
          return { data: { id: "re_email_1" }, error: null };
        },
      });
      assert.equal(sentEmail1.sent, true);
      const sentEmail2 = await sendWeddingBatchConfirmationEmail(batchId, {
        sendEmail: async () => {
          emailSendCount++;
          return { data: { id: "re_email_2" }, error: null };
        },
      });
      assert.equal(sentEmail2.sent, false);
      assert.equal(sentEmail2.skipped, "already_sent");
      assert.equal(emailSendCount, 1);

      // Single cover upload + cardId reuse across all 3 recipients (including GB international)
      let prepareCalls = 0;
      const submittedOrders: Array<{ cardId: string; orderId: string; country: string }> = [];
      const pass1 = await runWeddingDispatchPass(
        { targetBatchId: batchId, maxCardsPerPass: 8 },
        {
          prepareCard: async (p) => {
            prepareCalls++;
            assert.equal(p.imageUrl, "/presets/thank-you-botanical.jpg");
            return { success: true, cardId: "hw_card_shared_1", environment: "live" };
          },
          submitOrder: async (params, cardId) => {
            submittedOrders.push({
              cardId,
              orderId: params.orderId || "",
              country: params.recipient.country || "",
            });
            return { success: true, order_id: `hw_ord_${submittedOrders.length}` };
          },
        },
      );
      assert.equal(pass1.state, "succeeded");
      assert.equal(pass1.accepted, 3);
      assert.equal(prepareCalls, 1, "Cover must be prepared once per batch");
      assert.equal(submittedOrders.length, 3);
      assert.ok(submittedOrders.every((o) => o.cardId === "hw_card_shared_1"));
      assert.ok(submittedOrders.some((o) => o.country === "GB"));

      // Second pass must not re-prepare or re-submit accepted cards
      const pass2 = await runWeddingDispatchPass(
        { targetBatchId: batchId, maxCardsPerPass: 8 },
        {
          prepareCard: async () => {
            prepareCalls++;
            return { success: true, cardId: "unexpected", environment: "live" };
          },
          submitOrder: async () => {
            submittedOrders.push({ cardId: "bad", orderId: "bad", country: "US" });
            return { success: true, order_id: "bad" };
          },
        },
      );
      assert.equal(pass2.dispatched, 0);
      assert.equal(prepareCalls, 1);
      assert.equal(submittedOrders.length, 3);

      // syncWeddingDeliveryStatuses transitions completed orders to mailed on delivery AND household
      const syncRes = await syncWeddingDeliveryStatuses(
        { batchId },
        {
          fetchStatus: async (orderId) => {
            if (orderId === "hw_ord_1") {
              return { success: true, status: "mailed", trackingNumber: "TRK123", dateSent: "2026-11-20" };
            }
            return { success: true, status: "processing" };
          },
        },
      );
      assert.equal(syncRes.checked, 3);
      assert.equal(syncRes.mailed, 1);
      const del1 = (await weddingBatchRef(batchId).collection("deliveries").doc("H001").get()).data()!;
      assert.equal(del1.state, "mailed");
      assert.equal(del1.trackingNumber, "TRK123");
      const hh1 = (await db.collection("weddingProjects").doc(actor.projectId).collection("households").doc("H001").get()).data()!;
      assert.equal(hh1.dispatchStatus, "mailed");
      assert.equal(hh1.handwryttenOrderId, "hw_ord_1");

      // Admin list & detail APIs
      const list = await listWeddingBatchesForAdmin();
      assert.ok(list.batches.some((b) => b.batchId === batchId && b.counts.mailed === 1 && b.counts.accepted === 2));
      const detail = await getWeddingBatchDetailForAdmin(batchId);
      assert.equal(detail.preparedCardId, "hw_card_shared_1");
      assert.equal(detail.deliveries.length, 3);
    }

    // 4. Uploaded cover private PNG SHA-256 verification + manual_release -> releaseWeddingBatch
    {
      process.env.WEDDING_DISPATCH_MODE = "manual_release";
      const { actor, selection, coverBytes, coverSha } = await seedProject(2, true);
      const { quote } = await quoteWeddingSelection(actor, selection);
      const reserved = await quoteWeddingSelection(actor, selection, quote.id);
      const batchId = (reserved as { batchId: string }).batchId;
      await advanceWeddingPreparation(actor, batchId);

      // Manually pin artPin onto batch before issuing intent (simulating GCS pin without live bucket)
      const pinKey = `wedding-paid-retained/production/${artworkProjectSegment(actor.projectId)}/${batchId}.png`;
      await weddingBatchRef(batchId).update({
        artPin: { id: "art_cover_1", sha256: coverSha, storageKey: pinKey },
      });
      await issueWeddingIntent(actor, batchId);
      const bBefore = (await weddingBatchRef(batchId).get()).data()!;
      const pi = intents.get(bBefore.paymentIntentId)!;
      pi.status = "succeeded";
      pi.amount_received = pi.amount;
      await confirmWeddingPayment(actor, batchId);

      const heldBatch = (await weddingBatchRef(batchId).get()).data()!;
      assert.equal(heldBatch.dispatchStatus, "awaiting_release");

      // Dispatch pass does not touch awaiting_release batch
      const preRelease = await runWeddingDispatchPass({ targetBatchId: batchId });
      assert.equal(preRelease.dispatched, 0);

      // Admin clicks Dispatch Batch (releaseWeddingBatch)
      const released = await releaseWeddingBatch(batchId, "admin@sendmynotes.com");
      assert.equal(released.dispatchStatus, "queued");
      assert.equal(released.releasedCount, 2);

      let readKeyChecked = "";
      const afterRelease = await runWeddingDispatchPass(
        { targetBatchId: batchId },
        {
          readRetainedCover: async (storageKey, expectedSha) => {
            readKeyChecked = storageKey;
            assert.equal(expectedSha, coverSha);
            return coverBytes;
          },
          prepareCard: async (p) => {
            assert.ok(p.rawCoverBytes, "Must pass rawCoverBytes for private uploaded cover");
            assert.equal(p.rawCoverBytes.sha256, coverSha);
            return { success: true, cardId: "hw_private_card_1", environment: "live" };
          },
          submitOrder: async () => ({ success: true, order_id: `hw_priv_${randomUUID().slice(0, 6)}` }),
        },
      );
      assert.equal(readKeyChecked, pinKey);
      assert.equal(afterRelease.accepted, 2);
      delete process.env.WEDDING_DISPATCH_MODE;
    }

    // 5. Systemic 401/402/403 circuit breaker, ambiguous quarantine, expired lease quarantine, and retryRejectedWeddingCards
    {
      const { actor, selection } = await seedProject(4, false);
      const { quote } = await quoteWeddingSelection(actor, selection);
      const reserved = await quoteWeddingSelection(actor, selection, quote.id);
      const batchId = (reserved as { batchId: string }).batchId;
      await advanceWeddingPreparation(actor, batchId);
      await issueWeddingIntent(actor, batchId);
      const bData = (await weddingBatchRef(batchId).get()).data()!;
      const pi = intents.get(bData.paymentIntentId)!;
      pi.status = "succeeded";
      pi.amount_received = pi.amount;
      await confirmWeddingPayment(actor, batchId);

      // Simulate expired lease on H001 (was dispatching and crashed)
      await weddingBatchRef(batchId).collection("deliveries").doc("H001").update({
        state: "dispatching",
        status: "dispatching",
        dispatchAttemptId: "crashed_attempt",
        dispatchStartedAt: Date.now() - 10 * 60_000,
        leaseExpiresAt: Date.now() - 1000,
      });

      const alerts: Array<{ batchId: string; statusCode?: number }> = [];
      let submitIdx = 0;
      const passCircuit = await runWeddingDispatchPass(
        { targetBatchId: batchId, maxCardsPerPass: 8 },
        {
          prepareCard: async () => ({ success: true, cardId: "hw_cb_card", environment: "live" }),
          submitOrder: async (params) => {
            submitIdx++;
            if (params.orderId?.endsWith("-H002")) {
              return { success: false, error: "Explicitly rejected", details: { providerRejected: true, providerOutcome: "not_sent" } };
            }
            if (params.orderId?.endsWith("-H003")) {
              return {
                success: false,
                error: "Insufficient balance",
                details: { providerSystemicFailure: true, providerOutcome: "unknown", providerStatusCode: 402 },
              };
            }
            return { success: true, order_id: "should_not_reach_H004" };
          },
          alertFounder: async (info) => {
            alerts.push({ batchId: info.batchId, statusCode: info.statusCode });
          },
        },
      );

      assert.equal(passCircuit.systemicPause, true);
      assert.equal(submitIdx, 2, "Must stop immediately after 402 without submitting H004");
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0].statusCode, 402);

      const control = await getWeddingDispatchControl();
      assert.equal(control.paused, true);

      const d1 = (await weddingBatchRef(batchId).collection("deliveries").doc("H001").get()).data()!;
      const d2 = (await weddingBatchRef(batchId).collection("deliveries").doc("H002").get()).data()!;
      const d3 = (await weddingBatchRef(batchId).collection("deliveries").doc("H003").get()).data()!;
      const d4 = (await weddingBatchRef(batchId).collection("deliveries").doc("H004").get()).data()!;
      assert.equal(d1.state, "quarantined", "Expired lease must quarantine");
      assert.equal(d2.state, "rejected", "Deterministic rejection must become rejected");
      assert.equal(d3.state, "quarantined", "HTTP 402 outcome is unconfirmed -> quarantine");
      assert.equal(d4.state, "pending", "Unsent sibling remains pending");

      // While globally paused, worker pass does nothing
      const whilePaused = await runWeddingDispatchPass({ targetBatchId: batchId });
      assert.equal(whilePaused.state, "paused");
      assert.equal(whilePaused.dispatched, 0);

      // Resume global dispatch, test 401 (not_sent keeps card pending), and test retryRejectedWeddingCards
      await resumeWeddingDispatch({ reason: "Topped up balance", actor: "founder" });
      const pass401 = await runWeddingDispatchPass(
        { targetBatchId: batchId },
        {
          submitOrder: async () => ({
            success: false,
            error: "Unauthorized",
            details: { providerSystemicFailure: true, providerOutcome: "not_sent", providerStatusCode: 401 },
          }),
          alertFounder: async (info) => { alerts.push({ batchId: info.batchId, statusCode: info.statusCode }); },
        },
      );
      assert.equal(pass401.systemicPause, true);
      const d4After401 = (await weddingBatchRef(batchId).collection("deliveries").doc("H004").get()).data()!;
      assert.equal(d4After401.state, "pending", "HTTP 401 known not_sent keeps card pending");

      // retryRejectedWeddingCards resets ONLY rejected (H002), never quarantined (H001, H003)
      const retried = await retryRejectedWeddingCards(batchId, "founder");
      assert.equal(retried.retriedCount, 1);
      assert.equal((await weddingBatchRef(batchId).collection("deliveries").doc("H002").get()).data()?.state, "pending");
      assert.equal((await weddingBatchRef(batchId).collection("deliveries").doc("H001").get()).data()?.state, "quarantined");
      assert.equal((await weddingBatchRef(batchId).collection("deliveries").doc("H003").get()).data()?.state, "quarantined");

      // Clean up global pause for subsequent tests
      await resumeWeddingDispatch({ reason: "Test cleanup", actor: "founder" });
      await pauseWeddingDispatch({ reason: "Verify pause", actor: "founder" });
      assert.equal((await getWeddingDispatchControl()).paused, true);
      await resumeWeddingDispatch({ reason: "Ready", actor: "founder" });
    }

    // 6. Webhook and Cron livemode / runtime checks
    {
      const secret = randomBytes(32).toString("hex");
      process.env.STRIPE_WEBHOOK_SECRET = secret;
      process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
      const wrongModeEvent = {
        id: `evt_${randomUUID()}`,
        type: "payment_intent.succeeded",
        livemode: false,
        data: { object: { id: "pi_test_bad", metadata: { weddingBatchId: "wb_nonexistent" } } },
      };
      const whRes = await receiveStripeWebhook(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify(wrongModeEvent),
        }),
      );
      assert.equal(whRes.status, 500, "Test Stripe webhook event in live runtime must be rejected");
      delete process.env.TEST_BYPASS_WEBHOOK_SIGNATURE;

      // Test applyWeddingRefund mode mismatch rejection
      await assert.rejects(
        applyWeddingRefund({
          id: "re_bad_mode",
          amount: 900,
          currency: "usd",
          status: "succeeded",
          payment_intent: "pi_live_missing",
          metadata: { weddingRefundId: "wr_missing", weddingBatchId: "wb_missing" },
        } as unknown as Stripe.Refund),
      );

      // Cron route returns 401 without scheduler auth and 503/200 when runtime checks
      const unauthCron = await runReconcileCron(
        new NextRequest("http://localhost/api/cron/wedding-reconcile", { method: "POST" }),
      );
      assert.equal(unauthCron.status, 401);
    }

    console.log("Wedding dispatch, buyer email, circuit breaker, manual_release, status sync, and live/staging runtime checks passed.");
  } finally {
    setStripeClientFactoryForTests(null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
