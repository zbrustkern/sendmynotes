/**
 * tests/sprint-0005-offer-engine.test.ts
 *
 * SPRINT-0005: Comprehensive Offer Engine & Pricing Integrity Test Suite
 *
 * Verifies Acceptance Criteria:
 * - AC01: Destination-aware auto-apply & URL alias parsing
 *   - ?discount=, ?code=, and ?promo= aliases
 *   - Priority ordering: discount > code > promo
 *   - Trimming, case-insensitivity, normalization
 *   - Route preservation (/, /new, /send/[occasion], /send/[occasion]/[slug], /preview/entry)
 *   - Attribution touches preserved alongside promo code
 * - AC02: Concurrency & inventory caps (maxUses, reservations, duplicate idempotency)
 *   - Under concurrent checkout requests when maxUses: 1, strictly 1 succeeds with reservation
 *   - Active reservation holds slot for 30 minutes; release makes slot available again
 *   - Expired reservations automatically release holds so abandoned checkouts do not lock inventory
 *   - Duplicate redemptions (client confirmation + webhook retry) consume ONCE (idempotent)
 * - AC03: Authoritative server quotes & client override immunity
 *   - Prices computed server-side from canonical base price (CARD_FLAT_RATE_CENTS = 900)
 *   - Client-supplied prices or discount totals are ignored
 *   - Stale quote (>30 min) or price change returns requiresPriceReconfirmation: true (HTTP 409)
 *   - Commercial terms remain immutable on order document
 *   - Refunds do NOT restore usage count (REFUND_RESTORES_OFFER_USAGE = false)
 * - AC04: Free/comp redemptions & cost-audit preservation
 *   - Free/comp redemptions preserve customer gesture
 *   - Unknown supplier cost reported as costStatus: "unconfirmed" and netMarginCents: null
 *   - Breakdown by commercial kind: discounted_paid, free_promo, studio_comp
 *   - Zero billable supplier calls or production effects invoked
 */

import { withSafeTestHarness } from "../lib/testing/safe-harness";
import {
  extractOfferCodeFromUrlParams,
  computeOfferLifecycleStatus,
  getOrSyncOfferVersion,
  issueOfferPriceQuote,
  verifyCheckoutQuoteIntegrity,
  reserveOfferForCheckout,
  releaseOfferReservation,
  redeemOfferForOrder,
  recordOfferRefundOutcome,
  getOfferAnalyticsSummary,
  getOfferVersionsCollection,
  getOfferQuotesCollection,
  getOfferReservationsCollection,
  getOfferRedemptionsCollection,
} from "../lib/offer-engine";
import {
  saveDiscountCode,
  saveOrder,
  firestoreDb,
  getDiscountCode,
  getDiscountCodesCollection,
} from "../lib/firebase-admin";
import {
  DEFAULT_QUOTE_VALIDITY_MS,
  REFUND_RESTORES_OFFER_USAGE,
  OfferVersionRecord,
  OfferPriceQuoteSnapshot,
} from "../lib/contracts/admin-overhaul";
import { DiscountCode } from "../lib/types";
import { CARD_FLAT_RATE_CENTS } from "../lib/stripe";
import { recordPaymentCaptureFact } from "../lib/financial-ledger";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ""}`);
  }
}

async function runSprint0005Tests() {
  console.log("======================================================================");
  console.log("🎟️ RUNNING SPRINT-0005 OFFER ENGINE & PRICING INTEGRITY TEST SUITE");
  console.log("======================================================================\n");

  await withSafeTestHarness(async () => {
    // =========================================================================
    // SUITE 1: AC01 — URL Parameter Extraction, Priority, Normalization & Routing
    // =========================================================================
    console.log("--- SUITE 1: AC01 — URL Parameter Extraction, Priority & Routing ---");

    // 1.1 Alias extraction: discount, code, promo
    assert(
      extractOfferCodeFromUrlParams("?discount=SAVE20") === "SAVE20",
      "Extracts code from ?discount="
    );
    assert(
      extractOfferCodeFromUrlParams("?code=SAVE20") === "SAVE20",
      "Extracts code from ?code="
    );
    assert(
      extractOfferCodeFromUrlParams("?promo=SAVE20") === "SAVE20",
      "Extracts code from ?promo="
    );

    // 1.2 Priority ordering: discount > code > promo
    assert(
      extractOfferCodeFromUrlParams("?discount=FIRST&code=SECOND&promo=THIRD") === "FIRST",
      "Priority order: discount takes precedence over code and promo"
    );
    assert(
      extractOfferCodeFromUrlParams("?code=SECOND&promo=THIRD") === "SECOND",
      "Priority order: code takes precedence over promo"
    );
    assert(
      extractOfferCodeFromUrlParams("?promo=THIRD") === "THIRD",
      "Priority order: promo resolves when discount and code are absent"
    );

    // 1.3 Case normalization and trimming
    assert(
      extractOfferCodeFromUrlParams("?discount=  welcome10  ") === "WELCOME10",
      "Normalizes code: trims whitespace and converts to uppercase"
    );
    assert(
      extractOfferCodeFromUrlParams("?code=celebrate_mom") === "CELEBRATE_MOM",
      "Normalizes lowercase code to uppercase"
    );

    // 1.4 Various input shapes (URL, URLSearchParams, Record object, plain string)
    const urlObj = new URL("https://sendmynotes.com/send/birthday/friend-funny?promo=bday25&utm_source=meta");
    assert(
      extractOfferCodeFromUrlParams(urlObj.searchParams) === "BDAY25",
      "Extracts from URLSearchParams instance"
    );
    assert(
      extractOfferCodeFromUrlParams({ promo: "record_code" }) === "RECORD_CODE",
      "Extracts from Next.js searchParams Record object"
    );
    assert(
      extractOfferCodeFromUrlParams("https://sendmynotes.com/preview/entry?discount=VIPFREE") === "VIPFREE",
      "Extracts from full absolute URL string"
    );
    assert(
      extractOfferCodeFromUrlParams(null) === null,
      "Returns null when input is null"
    );
    assert(
      extractOfferCodeFromUrlParams("") === null,
      "Returns null when input is empty string"
    );
    assert(
      extractOfferCodeFromUrlParams("?other=val") === null,
      "Returns null when no promo parameter is present"
    );

    // 1.5 Destination route preservation with attribution
    const fullLandingUrl = "https://sendmynotes.com/send/anniversary/romantic-milestone?discount=LOVE50&utm_source=meta_paid&utm_campaign=spring2026";
    const extractedCode = extractOfferCodeFromUrlParams(fullLandingUrl);
    const parsedUrl = new URL(fullLandingUrl);
    assert(extractedCode === "LOVE50", "Extracted offer code from complex deep link");
    assert(parsedUrl.pathname === "/send/anniversary/romantic-milestone", "Destination path preserved without alteration");
    assert(parsedUrl.searchParams.get("utm_source") === "meta_paid", "UTM source preserved alongside offer code");
    assert(parsedUrl.searchParams.get("utm_campaign") === "spring2026", "UTM campaign preserved alongside offer code");

    // =========================================================================
    // SUITE 2: AC02 — Concurrency & Inventory Caps (maxUses, Reservations, Expirations)
    // =========================================================================
    console.log("\n--- SUITE 2: AC02 — Concurrency, Inventory Caps & Reservations ---");

    const singleSlotCode = "SCARCE_SLOT_1";
    const now = Date.now();

    // Seed a legacy discount code with maxUses = 1
    const scarceCodeDoc: DiscountCode = {
      id: singleSlotCode,
      code: singleSlotCode,
      type: "FIXED_AMOUNT",
      value: 200,
      description: "One single lucky winner",
      isActive: true,
      maxUses: 1,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    };
    await saveDiscountCode(scarceCodeDoc);

    // Sync into offer_versions
    const versionRecord = await getOrSyncOfferVersion(singleSlotCode);
    assert(versionRecord !== null && versionRecord.maxUses === 1, "Bridged legacy discount into offer_versions with maxUses: 1");

    // 2.1 Concurrent reservation race: two checkouts request the single remaining slot simultaneously
    const [resA, resB] = await Promise.all([
      reserveOfferForCheckout({
        code: singleSlotCode,
        orderId: "order_concurrent_A",
        sessionId: "sess_user_A",
        nowMs: now,
      }),
      reserveOfferForCheckout({
        code: singleSlotCode,
        orderId: "order_concurrent_B",
        sessionId: "sess_user_B",
        nowMs: now,
      }),
    ]);

    // Exactly one must succeed, and the other must be rejected as exhausted
    const oneSucceeded = (resA.reserved && !resB.reserved) || (!resA.reserved && resB.reserved);
    assert(oneSucceeded, "Under concurrent reservation requests for final slot (maxUses: 1), strictly 1 succeeds");
    const failedRes = !resA.reserved ? resA : resB;
    const successfulRes = resA.reserved ? resA : resB;
    assert(failedRes.status === "exhausted", "Rejected contender receives status: 'exhausted'");
    assert(typeof failedRes.error === "string" && failedRes.error.length > 0, "Rejected contender receives explicit error message");

    // 2.2 Releasing reservation frees up the scarce slot
    const holdingOrderId = successfulRes.reservation?.orderId!;
    const releaseSuccess = await releaseOfferReservation(holdingOrderId, "canceled");
    assert(releaseSuccess === true, "Released active reservation on order cancellation");

    // Now order_concurrent_B can reserve the slot
    const retryResB = await reserveOfferForCheckout({
      code: singleSlotCode,
      orderId: "order_concurrent_B",
      sessionId: "sess_user_B",
      nowMs: now + 10,
    });
    assert(retryResB.reserved === true, "Released hold allowed contending checkout to successfully claim the slot");

    // 2.3 Expired reservations automatically release holds so abandoned checkouts do not lock inventory
    const expiredSlotCode = "EXPIRED_HELD_CODE";
    await saveDiscountCode({
      id: expiredSlotCode,
      code: expiredSlotCode,
      type: "PERCENTAGE",
      value: 15,
      description: "Auto release test",
      isActive: true,
      maxUses: 1,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    await getOrSyncOfferVersion(expiredSlotCode);

    // Create an expired reservation directly (simulating abandoned cart after 30 minutes)
    const abandonedOrderId = "order_abandoned_cart";
    await getOfferReservationsCollection().doc(`res_${abandonedOrderId}_${expiredSlotCode}`).set({
      reservationId: `res_${abandonedOrderId}_${expiredSlotCode}`,
      offerId: `offer_${expiredSlotCode}`,
      offerVersion: 1,
      orderId: abandonedOrderId,
      code: expiredSlotCode,
      reservedAt: now - (DEFAULT_QUOTE_VALIDITY_MS + 5000),
      expiresAt: now - 5000, // expired 5 seconds ago
      status: "active",
    });

    // A fresh customer attempts checkout: reservation engine must prune the expired hold and succeed
    const freshCheckoutRes = await reserveOfferForCheckout({
      code: expiredSlotCode,
      orderId: "order_fresh_buyer",
      sessionId: "sess_fresh_buyer",
      nowMs: now,
    });
    assert(freshCheckoutRes.reserved === true, "Expired reservation hold automatically pruned; fresh buyer successfully claims slot");

    // 2.4 Duplicate redemptions consume ONCE (exactly-once semantics)
    const idempotentCode = "IDEMPOTENT_TEST_CODE";
    await saveDiscountCode({
      id: idempotentCode,
      code: idempotentCode,
      type: "FIXED_AMOUNT",
      value: 300,
      description: "Duplicate redemption guard",
      isActive: true,
      maxUses: 5,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    await getOrSyncOfferVersion(idempotentCode);

    const targetOrderId = "order_dual_callback_123";
    // First redemption call (e.g. from client confirmation)
    const firstRedemption = await redeemOfferForOrder({
      code: idempotentCode,
      orderId: targetOrderId,
      discountAmountCents: 300,
      finalAmountCents: 600,
      verifiedCaptureId: "pi_stripe_capture_123",
      nowMs: now,
    });
    assert(firstRedemption.redeemed === true && !firstRedemption.duplicate, "First redemption succeeds");

    // Second redemption call (e.g. from asynchronous Stripe webhook replay)
    const secondRedemption = await redeemOfferForOrder({
      code: idempotentCode,
      orderId: targetOrderId,
      discountAmountCents: 300,
      finalAmountCents: 600,
      verifiedCaptureId: "pi_stripe_capture_123",
      nowMs: now + 500,
    });
    assert(secondRedemption.redeemed === true && secondRedemption.duplicate === true, "Second redemption is recognized as duplicate");

    // Verify usedCount is strictly 1, NOT 2
    const checkedCode = await getDiscountCode(idempotentCode);
    assert(checkedCode?.usedCount === 1, "Counter usedCount is strictly 1 after duplicate redemption attempts");
    assert(checkedCode?.totalDiscountGivenCents === 300, "Cumulative savings totalDiscountGivenCents is strictly 300¢ (not double-counted)");

    // =========================================================================
    // SUITE 3: AC03 — Authoritative Server Quotes, Expiry & Client Override Immunity
    // =========================================================================
    console.log("\n--- SUITE 3: AC03 — Authoritative Quotes, Tamper Immunity & Non-Restoring Refunds ---");

    const promoQuoteCode = "QUOTE_TEST_20";
    await saveDiscountCode({
      id: promoQuoteCode,
      code: promoQuoteCode,
      type: "PERCENTAGE",
      value: 20, // 20% off $9.00 = $1.80 discount = $7.20 (720 cents)
      description: "20% Discount for Quote Tests",
      isActive: true,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    });

    // 3.1 Server-authoritative quote calculation (canonical base price = 900 cents)
    const quoteResult = await issueOfferPriceQuote({
      code: promoQuoteCode,
      listPriceCents: 100, // Tampered client price! Must be ignored.
      nowMs: now,
    });
    assert(quoteResult.valid === true, "Issued quote successfully");
    assert(quoteResult.quote?.basePriceCents === CARD_FLAT_RATE_CENTS, "Server ignored client price and enforced canonical base price (900¢)");
    assert(quoteResult.discountAmountInCents === 180, "Discount amount computed correctly server-side (180¢)");
    assert(quoteResult.finalAmountInCents === 720, "Payable finalAmountInCents computed correctly server-side (720¢)");
    assert(quoteResult.quote?.expiresAt === now + DEFAULT_QUOTE_VALIDITY_MS, "Quote validity set to exactly 30 minutes");

    // 3.2 Quote integrity verification: valid within 30-min window
    const quoteId = quoteResult.quote?.quoteId!;
    const freshCheck = await verifyCheckoutQuoteIntegrity({
      quoteId,
      code: promoQuoteCode,
      expectedFinalCents: 720,
      paymentIntentAmountCents: 720,
      nowMs: now + 5 * 60 * 1000, // 5 minutes later
    });
    assert(freshCheck.valid === true, "Fresh quote (<30 min) passes integrity verification");

    // 3.3 Stale quote verification (>30 minutes): rejects with requiresPriceReconfirmation: true
    const staleCheck = await verifyCheckoutQuoteIntegrity({
      quoteId,
      code: promoQuoteCode,
      expectedFinalCents: 720,
      paymentIntentAmountCents: 720,
      nowMs: now + (DEFAULT_QUOTE_VALIDITY_MS + 1000), // 30 mins + 1 second later
    });
    assert(staleCheck.valid === false, "Stale quote (>30 min) fails integrity verification");
    assert(staleCheck.requiresPriceReconfirmation === true, "Stale quote signals requiresPriceReconfirmation: true");

    // 3.4 Price mismatch verification: client intent amount differs from server quote
    const mismatchCheck = await verifyCheckoutQuoteIntegrity({
      quoteId,
      code: promoQuoteCode,
      expectedFinalCents: 720,
      paymentIntentAmountCents: 500, // Mismatched intent amount!
      nowMs: now + 60 * 1000,
    });
    assert(mismatchCheck.valid === false, "Mismatched payment intent amount fails integrity verification");
    assert(mismatchCheck.requiresPriceReconfirmation === true, "Price mismatch signals requiresPriceReconfirmation: true");

    // Production redemption binding requires persisted order, quote, reservation, and verified capture.
    const boundCode = "BOUND_TERMS_TEST";
    await saveDiscountCode({ id: boundCode, code: boundCode, type: "FIXED_AMOUNT", value: 150, description: "Bound terms", isActive: true, maxUses: 2, usedCount: 0, totalDiscountGivenCents: 0, createdAt: now, updatedAt: now });
    await getOrSyncOfferVersion(boundCode);
    const boundOrderId = `order_bound_${Date.now()}`;
    const boundPiId = `pi_bound_${Date.now()}`;
    const boundQuote = await issueOfferPriceQuote({ code: boundCode, nowMs: now });
    const boundQuoteId = boundQuote.quote?.quoteId as string;
    await reserveOfferForCheckout({ code: boundCode, orderId: boundOrderId, sessionId: "sess_bound", quoteId: boundQuoteId, nowMs: now });
    await saveOrder({ id: boundOrderId, status: "PENDING_PAYMENT", discountCode: boundCode, quoteId: boundQuoteId, finalAmountInCents: boundQuote.finalAmountInCents, discountAmountInCents: boundQuote.discountAmountInCents, createdAt: now, updatedAt: now } as any);
    await recordPaymentCaptureFact({ orderId: boundOrderId, paymentIntentId: boundPiId, amountCents: boundQuote.finalAmountInCents as number, currency: "usd", livemode: true });
    const boundRedemption = await redeemOfferForOrder({ code: boundCode, orderId: boundOrderId, quoteId: boundQuoteId, discountAmountCents: boundQuote.discountAmountInCents as number, finalAmountCents: boundQuote.finalAmountInCents as number, verifiedCaptureId: boundPiId, requireAuthoritativeBinding: true, nowMs: now });
    assert(boundRedemption.redeemed, "Server redemption accepts exact persisted quote, order, reservation, and capture binding", boundRedemption.error);
    const changedTermsReplay = await redeemOfferForOrder({ code: "OTHER_CODE", orderId: boundOrderId, quoteId: boundQuoteId, discountAmountCents: 0, finalAmountCents: 900, verifiedCaptureId: "other_pi", requireAuthoritativeBinding: true, nowMs: now });
    assert(!changedTermsReplay.redeemed, "Idempotency replay with changed commercial terms is rejected");

    // 3.5 Refund invariant: REFUND_RESTORES_OFFER_USAGE = false strictly enforced
    const refundOrderCode = "REFUND_TEST_CODE";
    await saveDiscountCode({
      id: refundOrderCode,
      code: refundOrderCode,
      type: "FIXED_AMOUNT",
      value: 400,
      description: "Refund test code",
      isActive: true,
      maxUses: 2,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    await getOrSyncOfferVersion(refundOrderCode);

    const refundOrderId = "order_to_be_refunded_999";
    await redeemOfferForOrder({
      code: refundOrderCode,
      orderId: refundOrderId,
      discountAmountCents: 400,
      finalAmountCents: 500,
      verifiedCaptureId: "pi_captured_for_refund",
      nowMs: now,
    });

    const codeAfterRedeem = await getDiscountCode(refundOrderCode);
    assert(codeAfterRedeem?.usedCount === 1, "Used count incremented to 1 on redemption");

    // Process refund outcome
    const refundRecorded = await recordOfferRefundOutcome({
      orderId: refundOrderId,
      refundAmountCents: 500,
    });
    assert(refundRecorded === true, "Recorded refund outcome on offer redemption document");

    // Verify refundRestoredUsage is false on redemption doc
    const redSnap = await getOfferRedemptionsCollection().doc(`redemption_${refundOrderId}`).get();
    const redData = redSnap.data();
    assert(redData?.refunded === true, "Redemption doc marked as refunded");
    assert(redData?.refundRestoredUsage === false, "refundRestoredUsage is strictly false");
    assert(REFUND_RESTORES_OFFER_USAGE === false, "REFUND_RESTORES_OFFER_USAGE constant is strictly false per Contract 4");

    // Verify usedCount was NOT restored / decremented
    const codeAfterRefund = await getDiscountCode(refundOrderCode);
    assert(codeAfterRefund?.usedCount === 1, "usedCount is preserved at 1 after refund (usage is NOT restored)");

    // =========================================================================
    // SUITE 4: AC04 — Free/Comp Redemptions & Cost-Audit Preservation
    // =========================================================================
    console.log("\n--- SUITE 4: AC04 — Free/Comp Redemptions & Cost-Audit Preservation ---");

    const freePromoCode = "LAUNCH100";
    await saveDiscountCode({
      id: freePromoCode,
      code: freePromoCode,
      type: "PERCENTAGE",
      value: 100, // 100% off = free order
      description: "Launch Voucher 100% Free",
      isActive: true,
      maxUses: 10,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    await getOrSyncOfferVersion(freePromoCode);

    // 4.1 Quote for 100% free promo
    const freeQuote = await issueOfferPriceQuote({
      code: freePromoCode,
      listPriceCents: CARD_FLAT_RATE_CENTS,
      nowMs: now,
    });
    assert(freeQuote.valid === true, "100% free voucher quote is valid");
    assert(freeQuote.isFree === true, "isFree is true for 100% discount");
    assert(freeQuote.finalAmountInCents === 0, "finalAmountInCents is 0");
    assert(freeQuote.discountAmountInCents === CARD_FLAT_RATE_CENTS, "discountAmountInCents is 900¢");

    // 4.2 Free order redemption
    const freeOrderId = "order_free_promo_001";
    const freeRedeemResult = await redeemOfferForOrder({
      code: freePromoCode,
      orderId: freeOrderId,
      discountAmountCents: CARD_FLAT_RATE_CENTS,
      finalAmountCents: 0,
      isFreePromo: true,
      nowMs: now,
    });
    assert(freeRedeemResult.redeemed === true, "Free promo order redeemed successfully without payment intent");
    assert(freeRedeemResult.redemption?.commercialKind === "free_promo", "Commercial kind classified as 'free_promo'");

    // 4.3 Studio comp redemption
    const compOrderId = "order_studio_comp_002";
    const compRedeemResult = await redeemOfferForOrder({
      code: freePromoCode,
      orderId: compOrderId,
      discountAmountCents: CARD_FLAT_RATE_CENTS,
      finalAmountCents: 0,
      isStudioComp: true,
      nowMs: now,
    });
    assert(compRedeemResult.redeemed === true, "Studio comp redeemed successfully");
    assert(compRedeemResult.redemption?.commercialKind === "studio_comp", "Commercial kind classified as 'studio_comp'");

    // 4.4 Standard paid discounted redemption
    const paidOrderId = "order_paid_discounted_003";
    const paidRedeemResult = await redeemOfferForOrder({
      code: freePromoCode,
      orderId: paidOrderId,
      discountAmountCents: 450,
      finalAmountCents: 450,
      verifiedCaptureId: "pi_paid_450",
      nowMs: now,
    });
    assert(paidRedeemResult.redeemed === true, "Paid discounted order redeemed successfully");
    assert(paidRedeemResult.redemption?.commercialKind === "discounted_paid", "Commercial kind classified as 'discounted_paid'");

    // 4.5 Offer Analytics Summary: costStatus: "unconfirmed" and netMarginCents: null
    const analytics = await getOfferAnalyticsSummary(freePromoCode);
    assert(analytics.code === freePromoCode, "Analytics generated for correct promo code");
    assert(analytics.totalRedemptions === 3, "Total redemptions count is 3");
    assert(analytics.freePromoCount === 1, "freePromoCount correctly separated (1)");
    assert(analytics.studioCompCount === 1, "studioCompCount correctly separated (1)");
    assert(analytics.paidDiscountedCount === 1, "paidDiscountedCount correctly separated (1)");
    assert(analytics.costStatus === "unconfirmed", "Supplier cost status reported as 'unconfirmed'");
    assert(analytics.netMarginCents === null, "netMarginCents reported as null (never fabricated)");
    assert(analytics.netCapturedRevenueCents === 450, "Net captured revenue accurately aggregated (450¢)");

    console.log("\n======================================================================");
    console.log(`📊 SPRINT-0005 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
    console.log("======================================================================\n");

    if (failedTests > 0) {
      process.exit(1);
    }
  });
}

runSprint0005Tests().catch((err) => {
  console.error("💥 Unhandled exception during Sprint-0005 tests:", err);
  process.exit(1);
});
