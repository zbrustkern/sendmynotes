import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  calculateAdminCompQuote,
  getAdminCompCatalog,
  issueAdminCompQuote,
  isAdminCompQuoteSnapshotValid,
  publicAdminCompQuote,
  resolveAdminCompAsset,
} from "../lib/admin-comp-pricing";
import { firestoreDb } from "../lib/firebase-admin";
import { createAdminCompOrder, createAdminCompPaymentRequest, createCompPaymentIntent, getAdminCompOrderStatus, getCompPaymentPage, makeAdminCompCapability } from "../lib/admin-comp-service";
import { generateAdminSessionToken } from "../lib/admin-auth";
import { NextRequest } from "next/server";
import { POST as legacyDispatch } from "../app/api/admin/dispatch-comp/route";
import { processAdminCompOrder, processPaidOrder, verifyPaymentIntentForOrder } from "../lib/order-processor";
import { getOrderById } from "../lib/firebase-admin";
import { sendMetaCapiPurchaseEvent } from "../lib/meta-conversions-api";
import { isExcludedOrderCohort } from "../lib/metrics-rollup";
import { deriveCommercialKind, recordPaymentCaptureFact } from "../lib/financial-ledger";
import { POST as stripeWebhook } from "../app/api/webhooks/stripe/route";
import { GET as publicOrderGet } from "../app/api/orders/[id]/route";
import { isCustomerPurchaseOrder } from "../lib/customer-purchase-classification";

async function main() {
  const envKeys = [
    "NODE_ENV",
    "STAGING_REVIEW_ONLY",
    "INTERNATIONAL_MAILING_PREVIEW",
    "FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "ALLOW_LOCAL_MOCK_PAYMENTS",
    "NEXT_PUBLIC_APP_URL",
    "ADMIN_SESSION_SIGNING_KEY",
    "TEST_BYPASS_WEBHOOK_SIGNATURE",
  ];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    Object.defineProperty(process.env, "NODE_ENV", { value: "test", configurable: true, enumerable: true, writable: true });
    process.env.STAGING_REVIEW_ONLY = "true";
    process.env.INTERNATIONAL_MAILING_PREVIEW = "true";
    process.env.FIREBASE_PROJECT_ID = "sendmynotes-staging";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "sendmynotes-staging";

    const domestic = getAdminCompCatalog("US");
    assert.equal(domestic.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0), 900);
    assert.deepEqual(domestic.staging, { reviewOnly: true, canDispatch: false, canCreatePaymentRequest: false });
    assert.ok(domestic.presets.length > 0);
    assert.ok(domestic.presets.every((preset) => resolveAdminCompAsset(preset.assetId)?.url === preset.url));
    assert.equal(resolveAdminCompAsset("https://attacker.example/cover.jpg"), null, "arbitrary external artwork URLs are not accepted as catalog assets");

    const fullDomestic = calculateAdminCompQuote({ countryCode: "US", mode: "full_comp" });
    assert.equal(fullDomestic.grossCents, 900);
    assert.equal(fullDomestic.waivedCents, 900);
    assert.equal(fullDomestic.customerPayableCents, 0);
    const futureCatalogProof = calculateAdminCompQuote({
      countryCode: "US", mode: "full_comp", now: 123,
      catalogLines: [
        { lineId: "card_a2", label: "Folded card", unitPriceCents: 900, quantity: 1, adjustmentEligible: true },
        { lineId: "future_test_fixture_only", label: "Test-only future eligible line", unitPriceCents: 375, quantity: 2, adjustmentEligible: true },
      ],
    });
    assert.equal(futureCatalogProof.issuedAt, 123, "pure quote calculator honors deterministic time input");
    assert.equal(futureCatalogProof.lines[1].waivedCents, 750, "full comp automatically covers eligible future catalog lines");

    const international = calculateAdminCompQuote({ countryCode: "CA", mode: "full_comp" });
    assert.equal(international.grossCents, 1400, "international quote includes the distinct $5 mailing line");
    assert.equal(international.customerPayableCents, 0);
    const partial = calculateAdminCompQuote({
      countryCode: "CA",
      mode: "individual_adjustments",
      adjustments: [{ lineId: "card_a2", waivedCents: 200 }],
    });
    assert.equal(partial.waivedCents, 200);
    assert.equal(partial.customerPayableCents, 1200);
    assert.equal(partial.lines.find((line) => line.lineId === "international_mailing")?.dueCents, 500);

    const invalidCases: Array<[string, () => unknown]> = [
      ["fractional cents", () => calculateAdminCompQuote({ countryCode: "US", mode: "individual_adjustments", adjustments: [{ lineId: "card_a2", waivedCents: 1.5 }] })],
      ["negative cents", () => calculateAdminCompQuote({ countryCode: "US", mode: "individual_adjustments", adjustments: [{ lineId: "card_a2", waivedCents: -1 }] })],
      ["excess cents", () => calculateAdminCompQuote({ countryCode: "US", mode: "individual_adjustments", adjustments: [{ lineId: "card_a2", waivedCents: 901 }] })],
      ["duplicate line", () => calculateAdminCompQuote({ countryCode: "US", mode: "individual_adjustments", adjustments: [{ lineId: "card_a2", waivedCents: 100 }, { lineId: "card_a2", waivedCents: 200 }] })],
      ["unknown line", () => calculateAdminCompQuote({ countryCode: "US", mode: "individual_adjustments", adjustments: [{ lineId: "admin_supplied_price", waivedCents: 900 }] })],
      ["client adjustments on full comp", () => calculateAdminCompQuote({ countryCode: "US", mode: "full_comp", adjustments: [{ lineId: "card_a2", waivedCents: 0 }] })],
    ];
    for (const [label, invalid] of invalidCases) assert.throws(invalid, `${label} must be rejected`);

    assert.throws(() => getAdminCompCatalog("Atlantis"), /valid recipient country/i);
    await assert.rejects(issueAdminCompQuote({ mode: "full_comp", destinationCountryCode: "XX", reason: "testing" }, "admin@example.test"), /not enabled/i);
    await assert.rejects(issueAdminCompQuote({ mode: "full_comp", destinationCountryCode: "US", reason: "   " }, "admin@example.test"), /reason/i);

    const issued = await issueAdminCompQuote({ mode: "individual_adjustments", destinationCountryCode: "US", adjustments: [{ lineId: "card_a2", waivedCents: 250 }], reason: "adversarial fixture" }, "verified.admin@example.test");
    assert.equal(issued.customerPayableCents, 650);
    assert.equal(isAdminCompQuoteSnapshotValid(issued), true);
    const tampered = JSON.parse(JSON.stringify(issued));
    tampered.customerPayableCents = 1;
    assert.equal(isAdminCompQuoteSnapshotValid(tampered), false, "client-tampered total cannot validate against immutable line arithmetic");
    const quoteRecord = (await firestoreDb.collection("admin_comp_quotes").doc(issued.quoteId).get()).data();
    assert.equal(quoteRecord?.issuedToActor, "verified.admin@example.test");
    assert.equal(quoteRecord?.reason, "adversarial fixture");
    const auditRecord = (await firestoreDb.collection("admin_comp_audit").doc(`quote_${issued.quoteId}`).get()).data();
    assert.equal(auditRecord?.actor, "verified.admin@example.test");
    assert.equal(auditRecord?.reason, "adversarial fixture");
    const publicQuote = publicAdminCompQuote(quoteRecord as any);
    assert.equal("issuedToActor" in publicQuote, false, "public quote projection must not leak admin identity");
    assert.equal("reason" in publicQuote, false, "public quote projection must not leak internal comp reason");
    assert.equal("consumedByOrderId" in publicQuote, false, "public quote projection must not leak internal order linkage");

    // Exercise the complete staged order path with the disk-backed mock Firestore.
    // Staging must accept a review fixture but never create a payment capability or dispatch.
    const actor = "zbrustkern@gmail.com";
    const caQuote = await issueAdminCompQuote({ mode: "individual_adjustments", destinationCountryCode: "CA", adjustments: [{ lineId: "card_a2", waivedCents: 200 }] , reason: "route adversarial fixture" }, actor);
    const request = {
      quoteId: caQuote.quoteId,
      idempotencyKey: "admin-comp-adversarial-0001",
      frontImageAssetId: "preset:thank-you-botanical",
      handwrittenNote: "Thinking of you.",
      fontStyleId: "1",
      recipientAddress: { firstName: "Alex", lastName: "Example", street1: "123 King St W", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" },
      returnAddress: { firstName: "Sam", lastName: "Sender", street1: "10 Main St", city: "Seattle", state: "WA", zip: "98101", country: "US" },
      customerEmail: "customer@example.test",
    };
    const staged = await createAdminCompOrder(request, actor);
    assert.equal(staged.response.origin, "ADMIN_COMP");
    assert.equal(staged.response.lifecycleStatus, "review_only_held");
    assert.equal(staged.response.quote.customerPayableCents, 1200);
    assert.equal(staged.response.paymentRequest.status, "review_only_held");
    assert.equal(staged.response.paymentRequest.capabilityUrl, undefined);
    assert.match(staged.response.staging.message || "", /no payment, email, or supplier request/i);
    const stagedOrder = (await firestoreDb.collection("orders").doc(staged.response.orderId).get()).data();
    assert.equal(stagedOrder?.amountInCents, 1200);
    assert.equal(stagedOrder?.finalAmountInCents, 1200);
    assert.equal(stagedOrder?.supplierCountryId, 2);
    assert.equal(stagedOrder?.origin, "ADMIN_COMP");
    assert.equal(stagedOrder?.fulfillmentStatus, "ADMIN_COMP_REVIEW_HOLD");
    assert.equal(stagedOrder?.stripePaymentId, undefined);
    assert.equal(stagedOrder?.handwryttenOrderId, undefined);
    assert.equal(isExcludedOrderCohort(stagedOrder as any), true, "partial admin-origin order is not an independent customer conversion");
    const publicReceiptResponse = await publicOrderGet(new NextRequest(`https://sendmynotes.com/api/orders/${staged.response.orderId}`), { params: Promise.resolve({ id: staged.response.orderId }) });
    assert.equal(publicReceiptResponse.status, 200);
    const publicReceipt = (await publicReceiptResponse.json()).order;
    assert.equal(publicReceipt.origin, "ADMIN_COMP", "redacted receipt retains non-sensitive origin for browser conversion suppression");
    assert.equal(isCustomerPurchaseOrder(publicReceipt), false, "public partial admin receipt cannot trigger browser Meta purchase");
    assert.equal(publicReceipt.adminCompQuote, undefined, "public receipt does not expose private quote snapshot");
    assert.equal(publicReceipt.adminCompQuoteId, undefined, "public receipt does not expose quote ID");
    assert.equal(publicReceipt.adminCompPaymentRequestId, undefined, "public receipt does not expose payment request ID");
    const goodAdminMetadata = {
      orderId: stagedOrder?.id,
      origin: "ADMIN_COMP",
      adminCompQuoteId: caQuote.quoteId,
      adminCompQuoteVersion: caQuote.version,
      adminCompDestinationCountryCode: "CA",
      adminCompTotalCents: "1200",
      adminCompPaymentRequestId: "acpr_fixture",
    };
    await firestoreDb.collection("orders").doc(staged.response.orderId).update({ adminCompPaymentRequestId: "acpr_fixture" });
    const boundOrder = (await firestoreDb.collection("orders").doc(staged.response.orderId).get()).data() as any;
    const validPaymentBinding = verifyPaymentIntentForOrder({ paymentIntent: { status: "succeeded", amount: 1200, amount_received: 1200, currency: "usd", metadata: goodAdminMetadata }, orderId: staged.response.orderId, order: boundOrder });
    assert.equal(validPaymentBinding.valid, true, "exact positive admin balance may verify when every payment-request binding matches");
    const missingMetadata: Record<string, string> = { ...goodAdminMetadata };
    delete missingMetadata.adminCompPaymentRequestId;
    const missingBinding = verifyPaymentIntentForOrder({ paymentIntent: { status: "succeeded", amount: 1200, amount_received: 1200, currency: "usd", metadata: missingMetadata }, orderId: staged.response.orderId, order: boundOrder });
    assert.equal(missingBinding.valid, false, "missing admin PaymentIntent metadata fails closed");
    const tamperedBinding = verifyPaymentIntentForOrder({ paymentIntent: { status: "succeeded", amount: 1200, amount_received: 1200, currency: "usd", metadata: { ...goodAdminMetadata, adminCompTotalCents: "1201" } }, orderId: staged.response.orderId, order: boundOrder });
    assert.equal(tamperedBinding.valid, false, "tampered accepted total cannot verify");
    const adminBalanceKind = deriveCommercialKind({ amountCents: 1200, livemode: true, origin: "ADMIN_COMP", paymentMethod: "STRIPE", explicitKind: "discounted_paid" });
    assert.equal(adminBalanceKind, "admin_comp_balance", "origin overrides discount classification without marking the order isComp");
    const durableAdminCapture = await recordPaymentCaptureFact({ paymentIntentId: "pi_fixture_admin_balance_live", orderId: staged.response.orderId, amountCents: 1200, livemode: true, origin: "ADMIN_COMP", commercialKind: "discounted_paid" });
    assert.equal(durableAdminCapture.fact.commercialKind, "admin_comp_balance", "capture ledger persists the non-customer admin balance class");
    const suppressedCapi = await sendMetaCapiPurchaseEvent({ order: boundOrder });
    assert.equal(suppressedCapi.skipped, true, "admin origin is excluded before any Meta event is built or sent");
    const heldRequest = await createAdminCompPaymentRequest(staged.response.orderId, actor);
    assert.equal(heldRequest.status, "review_only_held");
    assert.equal(heldRequest.capabilityUrl, undefined);
    assert.equal((await getAdminCompOrderStatus(staged.response.orderId))?.lifecycleStatus, "review_only_held");
    process.env.STAGING_REVIEW_ONLY = "false";
    const heldPositivePayment = await processPaidOrder(staged.response.orderId, "pi_staging_held_must_not_capture", undefined, {
      paymentMode: "local_mock",
      verifiedPaymentIntent: { id: "pi_staging_held_must_not_capture", status: "succeeded", amount: 1200, amount_received: 1200,
        currency: "usd", livemode: false, metadata: { orderId: staged.response.orderId } },
    });
    process.env.STAGING_REVIEW_ONLY = "true";
    assert.equal(heldPositivePayment.success, true, "historically held payment callback is acknowledged without reopening the order");
    assert.equal(heldPositivePayment.alreadyProcessed, true);
    assert.match(heldPositivePayment.error || "", /permanently held/i);
    const afterHeldPayment = (await firestoreDb.collection("orders").doc(staged.response.orderId).get()).data();
    assert.equal(afterHeldPayment?.fulfillmentStatus, "ADMIN_COMP_REVIEW_HOLD");
    assert.equal(afterHeldPayment?.adminCompPaymentIntentId, undefined, "held order does not bind a later PaymentIntent");

    const zeroDueQuote = await issueAdminCompQuote({ mode: "full_comp", destinationCountryCode: "US", reason: "review hold replay fixture" }, actor);
    const zeroDueRequest = {
      ...request, quoteId: zeroDueQuote.quoteId, idempotencyKey: "admin-comp-held-replay-0001",
      recipientAddress: { ...request.recipientAddress, country: "US", state: "WA", zip: "98101" },
    };
    const zeroDueStaged = await createAdminCompOrder(zeroDueRequest, actor);
    assert.equal(zeroDueStaged.response.lifecycleStatus, "review_only_held");
    let supplierAdapterCalls = 0;
    process.env.STAGING_REVIEW_ONLY = "false";
    const replayedHeldDispatch = await processAdminCompOrder(zeroDueStaged.response.orderId, async () => {
      supplierAdapterCalls += 1;
      return { success: true, order_id: "must-not-submit" } as any;
    });
    process.env.STAGING_REVIEW_ONLY = "true";
    assert.equal(replayedHeldDispatch.success, false, "an existing staging hold remains non-dispatchable if the flag changes");
    assert.match(replayedHeldDispatch.error || "", /held|preview/i);
    assert.equal(supplierAdapterCalls, 0, "held-order replay must stop before the supplier adapter is called");

    // Simulate a valid externally-held capability record to audit its public projection.
    const requestId = "acpr_public_projection_fixture";
    const expiresAt = Date.now() + 60_000;
    const capability = makeAdminCompCapability(requestId, staged.response.orderId, expiresAt);
    await firestoreDb.collection("admin_comp_payment_requests").doc(requestId).set({
      requestId, orderId: staged.response.orderId, quoteId: caQuote.quoteId,
      capabilityHash: crypto.createHash("sha256").update(capability).digest("hex"), expiresAt,
      status: "payment_pending", amountCents: 1200, createdBy: actor, createdAt: Date.now(), updatedAt: Date.now(),
    });
    await firestoreDb.collection("orders").doc(staged.response.orderId).update({ adminCompPaymentRequestId: requestId, adminCompPaymentRequestStatus: "payment_pending" });
    const paymentPage = await getCompPaymentPage(capability);
    assert.ok(paymentPage);
    assert.equal(paymentPage.response.quote.customerPayableCents, 1200);
    const publicProjection = JSON.stringify(paymentPage.response);
    for (const privateValue of ["Alex", "Example", "123 King St W", "Sam", "Sender", "Thinking of you.", "customer@example.test", "route adversarial fixture", actor]) {
      assert.equal(publicProjection.includes(privateValue), false, `public capability response must not leak ${privateValue}`);
    }
    const stagedPaymentIntentResponse = await (await import("../app/api/comp-payment/[capability]/payment-intent/route")).POST(
      new NextRequest(`https://staging.example/api/comp-payment/${encodeURIComponent(capability)}/payment-intent`, { method: "POST", body: "{}" }),
      { params: Promise.resolve({ capability }) },
    );
    assert.equal(stagedPaymentIntentResponse.status, 409, "public capability cannot create a PaymentIntent during staging review");
    assert.match((await stagedPaymentIntentResponse.json()).error, /staging review only/i);
    assert.equal((await firestoreDb.collection("admin_comp_payment_requests").doc(requestId).get()).data()?.paymentIntentId, undefined);
    assert.equal((await firestoreDb.collection("orders").doc(staged.response.orderId).get()).data()?.stripePaymentId, undefined);

    const duplicate = await createAdminCompOrder(request, actor);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.response.orderId, staged.response.orderId, "idempotent retry must return the original order");
    await assert.rejects(createAdminCompOrder({ ...request, handwrittenNote: "Altered payload" }, actor), /different order content/i);
    await assert.rejects(createAdminCompOrder({ ...request, quoteId: caQuote.quoteId, recipientAddress: { ...request.recipientAddress, country: "US", state: "WA", zip: "98101" }, idempotencyKey: "admin-comp-country-mismatch-1" }, actor), /country differs/i);
    await assert.rejects(createAdminCompOrder({ ...request, frontImageAssetId: "https://attacker.example/card.jpg", idempotencyKey: "admin-comp-unapproved-asset-1" }, actor), /server-approved/i);
    await assert.rejects(issueAdminCompQuote({ mode: "individual_adjustments", destinationCountryCode: "CA", adjustments: [{ lineId: "card_a2", waivedCents: 900 }, { lineId: "international_mailing", waivedCents: 499 }], reason: "below minimum adversarial fixture" }, actor), /below stripe|minimum/i, "balances below Stripe's minimum must fail before issuing an unpayable quote");
    await firestoreDb.collection("admin_comp_quotes").doc(caQuote.quoteId).update({ expiresAt: Date.now() - 1 });
    const expiredExactReplay = await createAdminCompOrder(request, actor);
    assert.equal(expiredExactReplay.duplicate, true, "exact retry of an already accepted order remains idempotent after quote expiry");
    assert.equal(expiredExactReplay.response.orderId, staged.response.orderId);

    const adminToken = generateAdminSessionToken(actor);
    const unauthQuoteResponse = await (await import("../app/api/admin/comp/quotes/route")).POST(new NextRequest("https://staging.example/api/admin/comp/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "full_comp", destinationCountryCode: "US", reason: "unauthorized" }) }));
    assert.equal(unauthQuoteResponse.status, 401, "public callers cannot issue comp quotes");
    const authorizedQuoteResponse = await (await import("../app/api/admin/comp/quotes/route")).POST(new NextRequest("https://staging.example/api/admin/comp/quotes", {
      method: "POST", headers: { "content-type": "application/json", cookie: `smn_admin_session=${adminToken}` },
      body: JSON.stringify({ mode: "full_comp", destinationCountryCode: "US", reason: "verified actor route test", actor: "attacker@example.test", issuedToActor: "attacker@example.test", customerPayableCents: 1 }),
    }));
    assert.equal(authorizedQuoteResponse.status, 201);
    const routedQuote = (await authorizedQuoteResponse.json()).quote;
    assert.equal(routedQuote.grossCents, 900, "route ignores client-supplied total claims");
    const routedRecord = (await firestoreDb.collection("admin_comp_quotes").doc(routedQuote.quoteId).get()).data();
    assert.equal(routedRecord?.issuedToActor, actor, "audit actor derives only from verified admin session");
    assert.equal(routedRecord?.reason, "verified actor route test");
    const legacyResponse = await legacyDispatch(new NextRequest("https://staging.example/api/admin/dispatch-comp", {
      method: "POST", headers: { "content-type": "application/json", cookie: `smn_admin_session=${adminToken}` },
      body: JSON.stringify({ frontImageUrl: "https://attacker.example/card.jpg", recipientAddress: request.recipientAddress, returnAddress: request.returnAddress }),
    }));
    assert.equal(legacyResponse.status, 423, "staging guard must stop the deprecated direct-dispatch endpoint before order creation");
    assert.equal((await legacyResponse.json()).code, "STAGING_REVIEW_ONLY");
    process.env.STAGING_REVIEW_ONLY = "false";
    const quoteCountBeforeLegacyRetry = (await firestoreDb.collection("admin_comp_quotes").get()).docs.length;
    const legacyMissingKeyResponse = await legacyDispatch(new NextRequest("https://staging.example/api/admin/dispatch-comp", {
      method: "POST", headers: { "content-type": "application/json", cookie: `smn_admin_session=${adminToken}` },
      body: JSON.stringify({ frontImageUrl: "/presets/thank-you-botanical.jpg", handwrittenNote: "No dispatch", recipientAddress: { ...request.recipientAddress, country: "US", state: "WA", zip: "98101" }, returnAddress: request.returnAddress }),
    }));
    assert.equal(legacyMissingKeyResponse.status, 400, "legacy route must reject requests without a stable idempotency key outside staging");
    assert.match((await legacyMissingKeyResponse.json()).error, /Idempotency-Key/i);
    assert.equal((await firestoreDb.collection("admin_comp_quotes").get()).docs.length, quoteCountBeforeLegacyRetry, "missing-key legacy call must stop before quote/order creation or supplier execution");

    // Exercise positive-balance capability creation, local fake PI reuse and processor verification.
    // This path is explicitly local_mock and the safe runner denies all external networking.
    process.env.ALLOW_LOCAL_MOCK_PAYMENTS = "true";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.ADMIN_SESSION_SIGNING_KEY = "admin-comp-local-safe-fixture-key";
    const paidQuote = await issueAdminCompQuote({ mode: "individual_adjustments", destinationCountryCode: "US", adjustments: [{ lineId: "card_a2", waivedCents: 100 }], reason: "positive balance local fake fixture" }, actor);
    const paidOrderRequest = {
      ...request, quoteId: paidQuote.quoteId, idempotencyKey: "admin-comp-local-payment-0001", customerEmail: "",
      recipientAddress: { firstName: "Jordan", lastName: "Example", street1: "22 Pine St", city: "Seattle", state: "WA", zip: "98101", country: "US" },
    };
    const paidOrder = await createAdminCompOrder(paidOrderRequest, actor);
    assert.equal(paidOrder.response.quote.customerPayableCents, 800);
    const paymentRequest = await createAdminCompPaymentRequest(paidOrder.response.orderId, actor);
    assert.ok(paymentRequest.capabilityUrl);
    assert.equal(paymentRequest.amountCents, 800);
    const paidCapability = paymentRequest.capabilityUrl!.split("/comp-payment/")[1];
    const firstIntent = await createCompPaymentIntent(paidCapability);
    assert.ok(firstIntent?.clientSecret);
    assert.equal(firstIntent?.amountCents, 800);
    const reusedIntent = await createCompPaymentIntent(paidCapability);
    assert.equal(reusedIntent?.paymentIntentId, firstIntent?.paymentIntentId, "ambiguous local request retries reuse one immutable PaymentIntent");
    process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
    const paidOrderRecord = await getOrderById(paidOrder.response.orderId);
    const acceptedPaymentIntent = {
      id: firstIntent!.paymentIntentId, object: "payment_intent", amount: 800, amount_received: 800,
      currency: "usd", status: "succeeded", livemode: false, receipt_email: null,
      metadata: {
        orderId: paidOrder.response.orderId, origin: "ADMIN_COMP", adminCompQuoteId: paidQuote.quoteId,
        adminCompQuoteVersion: paidQuote.version, adminCompDestinationCountryCode: "US",
        adminCompTotalCents: "800", adminCompPaymentRequestId: paymentRequest.requestId!,
      },
    };
    const webhookPayload = JSON.stringify({
      id: "evt_admin_comp_local_capture", object: "event", api_version: "2025-01-27.acacia", created: Math.floor(Date.now() / 1000),
      data: { object: acceptedPaymentIntent }, livemode: false, pending_webhooks: 1, type: "payment_intent.succeeded",
    });
    const paidWebhookResponse = await stripeWebhook(new NextRequest("https://staging.example/api/webhooks/stripe", { method: "POST", body: webhookPayload }));
    assert.equal(paidWebhookResponse.status, 200);
    assert.equal((await paidWebhookResponse.json()).status, "PROCESSING_HANDWRYTTEN", "signed test-only webhook routes exact balance through verified processor without supplier call");
    const replayWebhookResponse = await stripeWebhook(new NextRequest("https://staging.example/api/webhooks/stripe", { method: "POST", body: webhookPayload }));
    assert.equal((await replayWebhookResponse.json()).duplicate, true, "webhook event replay is idempotent");
    assert.ok(paidOrderRecord);
    const paidStoredOrder = await getOrderById(paidOrder.response.orderId);
    assert.equal(paidStoredOrder?.adminCompPaymentRequestStatus, "paid");
    assert.equal(paidStoredOrder?.metaCapiTrackedAt, undefined, "admin balance never sends a CAPI purchase event");
    const underpaid = verifyPaymentIntentForOrder({ paymentIntent: { status: "succeeded", amount: 799, amount_received: 799, currency: "usd", metadata: { orderId: paidOrder.response.orderId, origin: "ADMIN_COMP", adminCompQuoteId: paidQuote.quoteId, adminCompQuoteVersion: paidQuote.version, adminCompDestinationCountryCode: "US", adminCompTotalCents: "800", adminCompPaymentRequestId: paymentRequest.requestId! } }, orderId: paidOrder.response.orderId, order: paidStoredOrder! });
    assert.equal(underpaid.valid, false, "underpayment cannot authorize an admin order");

    const dispatchQuote = await issueAdminCompQuote({ mode: "full_comp", destinationCountryCode: "US", reason: "fake adapter dispatch-lock fixture" }, actor);
    const dispatchOrderId = "admin-comp-fake-dispatch-concurrency";
    await firestoreDb.collection("orders").doc(dispatchOrderId).set({
      id: dispatchOrderId, origin: "ADMIN_COMP", adminCompQuoteId: dispatchQuote.quoteId, adminCompQuote: dispatchQuote,
      adminCompLifecycle: "dispatching", adminCompPaymentRequestStatus: "not_needed", customerEmail: "", frontImageUrl: "/presets/thank-you-botanical.jpg",
      printedMessage: "", handwrittenNote: "Thinking of you.", fontStyleId: "1",
      recipientAddress: { firstName: "Alex", lastName: "Example", street1: "10 Main St", city: "Seattle", state: "WA", zip: "98101", country: "US" },
      returnAddress: request.returnAddress, status: "PAYMENT_RECEIVED", amountInCents: 0, finalAmountInCents: 0,
      originalAmountInCents: 900, discountAmountInCents: 900, paymentMethod: "STUDIO_COMP", isComp: true,
      supplierCountryId: 1, supplierCountryName: "United States", createdAt: Date.now(), updatedAt: Date.now(),
    });
    let fakeFulfillmentCalls = 0;
    const fakeFulfillmentAdapter = async () => {
      fakeFulfillmentCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { success: true, order_id: "fake_supplier_acceptance_only" } as any;
    };
    process.env.STAGING_REVIEW_ONLY = "false";
    const concurrentDispatchResults = await Promise.all([
      processAdminCompOrder(dispatchOrderId, fakeFulfillmentAdapter),
      processAdminCompOrder(dispatchOrderId, fakeFulfillmentAdapter),
    ]);
    process.env.STAGING_REVIEW_ONLY = "true";
    assert.equal(fakeFulfillmentCalls, 1, "zero-balance admin comp dispatch lock allows only one fake supplier submission");
    assert.equal(concurrentDispatchResults.filter((item) => item.success).length, 2, "the duplicate concurrent request safely reports the already-submitted order");
    const dispatchedFixture = (await firestoreDb.collection("orders").doc(dispatchOrderId).get()).data();
    assert.equal(dispatchedFixture?.fulfillmentStatus, "ADMIN_COMP_SUPPLIER_ACCEPTED");

    console.log("Admin comp adversarial checks passed (integer cents, immutable quotes, auth, actor/reason privacy, staging hold, fixed-country amount, asset allowlist, idempotency, accepted payment binding, capability privacy, and legacy dispatch guards).");
  } finally {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
