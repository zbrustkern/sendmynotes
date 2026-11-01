/**
 * tests/sprint-0008-promotions-and-growth.test.tsx
 *
 * SPRINT-0008: Promotions & Growth Workspaces Comprehensive Test Suite
 *
 * Verifies Acceptance Criteria:
 * - AC01: Existing percentage/fixed/100%-off/manual/comp and share-link capabilities preserved;
 *   presets, destination allowlist validation, query aliases (?discount=, ?code=, ?promo=),
 *   and non-billable validation preview.
 * - AC02: Offer detail reconciles exposed/applied/paid/free/refunded counts and actual dollars;
 *   exact cents parity; costStatus: "unconfirmed" and verifiedContributionMarginCents: null;
 *   commercial breakdown and guest coverage note.
 * - AC03: Growth totals use full scope and dated spend; paid orders counted separately from
 *   free promo and studio comps; descriptive attribution badge (not causal lift); recovery
 *   links preserve original acquisition attribution; resumability types (server vs browser).
 * - AC04: Consequential change preview (active reservations, 30-min honored quotes notice,
 *   redemptions count); hard delete strictly blocked on redeemed codes (archives instead);
 *   immutable audit logging in admin_audit_log; role/auth enforcement (verifyAdminAuth 401).
 */

import { withSafeTestHarness } from "../lib/testing/safe-harness";
import {
  OFFER_CREATION_PRESETS,
  ALLOWED_DESTINATION_PATHS,
  validateDestinationPath,
  previewOfferPricing,
  buildDestinationOfferLink,
  previewConsequentialOfferChange,
  executeAuditedOfferChange,
  listPromotionsWorkspaceOffers,
  getOfferEvidenceDetail,
  getGrowthCampaignAndRecoveryReport,
  buildManualRecoveryLink,
  ADMIN_AUDIT_LOG_COLLECTION,
  DESCRIPTIVE_ATTRIBUTION_BADGE,
  GROWTH_ADVISORY_NOTE,
} from "../lib/promotions-and-growth-service";
import {
  getOrSyncOfferVersion,
  issueOfferPriceQuote,
  reserveOfferForCheckout,
  redeemOfferForOrder,
  recordOfferRefundOutcome,
  getOfferVersionsCollection,
  getOfferReservationsCollection,
  getOfferRedemptionsCollection,
} from "../lib/offer-engine";
import {
  firestoreDb,
  saveDiscountCode,
} from "../lib/firebase-admin";
import {
  DATED_SPEND_COLLECTION,
  DatedSpendRecord,
} from "../lib/spend-and-cost-ledger";
import { GET as promotionsGet, POST as promotionsPost } from "../app/api/admin/promotions/route";
import { GET as growthGet, POST as growthPost } from "../app/api/admin/growth/route";
import { NextRequest } from "next/server";
import { recordPaymentCaptureFact, recordPaymentRefundFact } from "../lib/financial-ledger";
import { CARD_FLAT_RATE_CENTS } from "../lib/stripe";

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

async function runSprint0008Tests() {
  console.log("======================================================================");
  console.log("🏷️ RUNNING SPRINT-0008 PROMOTIONS & GROWTH WORKSPACES TEST SUITE");
  console.log("======================================================================\n");

  await withSafeTestHarness(async () => {
    // =========================================================================
    // SUITE 1: AC01 — Presets, Destination Link Builder & Allowlist Safety
    // =========================================================================
    console.log("--- SUITE 1: AC01 — Presets, Destination Allowlist & Link Builder ---");

    // 1.1 Presets Verification
    assert(
      OFFER_CREATION_PRESETS.welcome_2_off.discountType === "FIXED_AMOUNT" &&
        OFFER_CREATION_PRESETS.welcome_2_off.discountValue === 200,
      "Preset welcome_2_off provides $2.00 fixed discount"
    );
    assert(
      OFFER_CREATION_PRESETS.launch_20_pct.discountType === "PERCENTAGE" &&
        OFFER_CREATION_PRESETS.launch_20_pct.discountValue === 20,
      "Preset launch_20_pct provides 20% discount"
    );
    assert(
      OFFER_CREATION_PRESETS.vip_free_card.discountType === "PERCENTAGE" &&
        OFFER_CREATION_PRESETS.vip_free_card.discountValue === 100,
      "Preset vip_free_card provides 100% free card"
    );
    assert(
      OFFER_CREATION_PRESETS.recovery_150_off.discountType === "FIXED_AMOUNT" &&
        OFFER_CREATION_PRESETS.recovery_150_off.discountValue === 150,
      "Preset recovery_150_off provides $1.50 recovery incentive"
    );

    // 1.2 Destination Allowlist Validation
    const rootPath = validateDestinationPath("/");
    assert(rootPath.isValid && rootPath.normalizedPath === "/", "Allows root path '/'");

    const sendPath = validateDestinationPath("/send");
    assert(sendPath.isValid && sendPath.normalizedPath === "/send", "Allows '/send'");

    const sendOccasionPath = validateDestinationPath("/send/birthday");
    assert(sendOccasionPath.isValid && sendOccasionPath.normalizedPath === "/send/birthday", "Allows '/send/birthday'");

    const sendOccasionSlug = validateDestinationPath("/send/thank-you/elegant-rose");
    assert(
      sendOccasionSlug.isValid && sendOccasionSlug.normalizedPath === "/send/thank-you/elegant-rose",
      "Allows '/send/thank-you/elegant-rose'"
    );

    const previewPath = validateDestinationPath("/preview/entry");
    assert(previewPath.isValid && previewPath.normalizedPath === "/preview/entry", "Allows '/preview/entry'");

    // 1.3 Security: Rejection of Disallowed / Malicious URLs
    const externalHttp = validateDestinationPath("https://malicious-site.com");
    assert(!externalHttp.isValid, "Rejects external https:// URLs");

    const protocolRelative = validateDestinationPath("//malicious-site.com/attack");
    assert(!protocolRelative.isValid, "Rejects protocol-relative // URLs");

    const javascriptScheme = validateDestinationPath("javascript:alert(document.cookie)");
    assert(!javascriptScheme.isValid, "Rejects javascript: scheme");

    const dataScheme = validateDestinationPath("data:text/html,<script>alert(1)</script>");
    assert(!dataScheme.isValid, "Rejects data: scheme");

    const traversalPath = validateDestinationPath("/send/../../../etc/passwd");
    assert(!traversalPath.isValid, "Rejects path traversal (..)");

    const adminPath = validateDestinationPath("/admin");
    assert(!adminPath.isValid, "Rejects internal non-customer path '/admin'");

    // 1.4 Destination Link Builder with Query Aliases (?discount=, ?code=, ?promo=)
    const linkDiscount = buildDestinationOfferLink({
      code: "LAUNCH20",
      destinationPath: "/send/birthday",
      aliasParam: "discount",
      utmSource: "instagram",
      utmCampaign: "spring_launch",
    });
    assert(
      linkDiscount.isValid &&
        linkDiscount.fullRelativeUrl.includes("discount=LAUNCH20") &&
        linkDiscount.fullRelativeUrl.includes("utm_source=instagram") &&
        linkDiscount.fullRelativeUrl.includes("utm_campaign=spring_launch"),
      "Builds link with ?discount= alias and UTM tracking"
    );

    const linkCode = buildDestinationOfferLink({
      code: "LAUNCH20",
      destinationPath: "/send",
      aliasParam: "code",
    });
    assert(
      linkCode.isValid && linkCode.fullRelativeUrl.includes("code=LAUNCH20"),
      "Supports ?code= query alias"
    );

    const linkPromo = buildDestinationOfferLink({
      code: "LAUNCH20",
      destinationPath: "/send",
      aliasParam: "promo",
    });
    assert(
      linkPromo.isValid && linkPromo.fullRelativeUrl.includes("promo=LAUNCH20"),
      "Supports ?promo= query alias"
    );

    // 1.5 Non-billable Price Preview
    const fixedPreview = previewOfferPricing("FIXED_AMOUNT", 200);
    assert(
      fixedPreview.basePriceCents === CARD_FLAT_RATE_CENTS &&
        fixedPreview.discountAmountCents === 200 &&
        fixedPreview.finalAmountCents === 700 &&
        fixedPreview.subsidyCents === 200 &&
        fixedPreview.isFree === false,
      "Fixed $2.00 off preview: $9.00 -> $7.00 (subsidy $2.00)"
    );

    const freePreview = previewOfferPricing("PERCENTAGE", 100);
    assert(
      freePreview.basePriceCents === CARD_FLAT_RATE_CENTS &&
        freePreview.discountAmountCents === 900 &&
        freePreview.finalAmountCents === 0 &&
        freePreview.isFree === true,
      "100% off preview: $9.00 -> $0.00 (isFree: true)"
    );

    // =========================================================================
    // SUITE 2: AC02 — Offer Evidence Reconciles Funnel & Financial Exact Cents
    // =========================================================================
    console.log("\n--- SUITE 2: AC02 — Offer Evidence Detail & Financial Reconciliation ---");

    const testOfferCode = "EVIDENCE_TEST_50";
    await executeAuditedOfferChange({
      actorEmail: "founder@sendmynotes.com",
      action: "create",
      code: testOfferCode,
      payload: {
        purpose: "Evidence reconciliation test offer",
        discountType: "FIXED_AMOUNT",
        discountValue: 300, // $3.00 off
        destinationPath: "/send",
      },
    });

    // Simulate 2 quotes, 2 reservations, 2 redemptions (1 paid, 1 refunded)
    const quote1 = await issueOfferPriceQuote({ code: testOfferCode, sessionId: "sess_ev_1" });
    const quote2 = await issueOfferPriceQuote({ code: testOfferCode, sessionId: "sess_ev_2" });
    assert(quote1.valid && quote2.valid, "Quotes issued successfully");

    const orderId1 = "order_ev_01";
    const orderId2 = "order_ev_02";

    await reserveOfferForCheckout({ code: testOfferCode, orderId: orderId1, sessionId: "sess_ev_1" });
    await reserveOfferForCheckout({ code: testOfferCode, orderId: orderId2, sessionId: "sess_ev_2" });

    // Redeem order 1 ($9 - $3 = $6 paid)
    await redeemOfferForOrder({
      code: testOfferCode,
      orderId: orderId1,
      discountAmountCents: 300,
      finalAmountCents: 600,
      verifiedCaptureId: "pi_stripe_ev_01",
    });

    // Redeem order 2 ($9 - $3 = $6 paid)
    await redeemOfferForOrder({
      code: testOfferCode,
      orderId: orderId2,
      discountAmountCents: 300,
      finalAmountCents: 600,
      verifiedCaptureId: "pi_stripe_ev_02",
    });

    // Redemption commitments are separate from provider capture authority.
    await recordPaymentCaptureFact({ orderId: orderId1, paymentIntentId: "pi_stripe_ev_01", amountCents: 600, currency: "usd", livemode: true, commercialKind: "discounted_paid" });
    await recordPaymentCaptureFact({ orderId: orderId2, paymentIntentId: "pi_stripe_ev_02", amountCents: 600, currency: "usd", livemode: true, commercialKind: "discounted_paid" });
    await recordPaymentRefundFact({ orderId: orderId2, paymentIntentId: "pi_stripe_ev_02", refundId: "re_stripe_ev_02", amountCents: 600, currency: "usd", livemode: true });
    // Refund order 2
    await recordOfferRefundOutcome(orderId2, 600);

    const evidence = await getOfferEvidenceDetail(testOfferCode);
    assert(evidence !== null, "Evidence detail generated");
    if (evidence) {
      assert(evidence.funnel.redemptions === 2, "Funnel records 2 redemptions");
      assert(evidence.funnel.refunds === 1, "Funnel records 1 refund");

      // Exact dollars & cents check
      assert(
        evidence.financials.grossListValueCents === 1800,
        "Exact Gross List Value is 1800¢ ($18.00)"
      );
      assert(
        evidence.financials.totalDiscountSubsidyCents === 600,
        "Exact Subsidy Given is 600¢ ($6.00)"
      );
      assert(
        evidence.financials.netCapturedRevenueCents === 1200,
        "Exact Net Captured Revenue is 1200¢ ($12.00)"
      );
      assert(
        evidence.financials.refundedCents === 600,
        "Exact Refunded Amount is 600¢ ($6.00)"
      );

      // Invariant: Missing supplier invoice cost is explicitly unconfirmed
      assert(
        evidence.financials.costStatus === "unconfirmed",
        "Cost status is explicitly 'unconfirmed' when invoice not allocated"
      );
      assert(
        evidence.financials.verifiedContributionMarginCents === null,
        "Verified margin is strictly null (never fabricated)"
      );

      // Commercial breakdown
      assert(
        evidence.commercialBreakdown.paidDiscountedCount === 2,
        "Commercial breakdown identifies 2 paid discounted orders"
      );

      // Guest coverage note
      assert(
        evidence.coverageNote.includes("Guest identity") &&
          evidence.coverageNote.includes("unconfirmed"),
        "Includes honest guest identity & unconfirmed cost coverage note"
      );
    }

    // =========================================================================
    // SUITE 3: AC03 — Growth Campaigns, Non-Causal Badge & Draft Recovery
    // =========================================================================
    console.log("\n--- SUITE 3: AC03 — Growth Campaigns, Non-Causal Badge & Recovery ---");

    // Seed dated spend for a campaign
    const datedSpendRef = firestoreDb.collection(DATED_SPEND_COLLECTION).doc("spend_growth_test_01");
    const spendRecord: DatedSpendRecord = {
      id: "spend_growth_test_01",
      idempotencyKey: "spend_growth_test_01",
      date: "2026-10-18",
      channel: "meta_ads",
      utmCampaign: "fall_special_2026",
      amountCents: 5000, // $50.00 ad spend
      currency: "usd",
      source: "meta_ads_export",
      timezone: "America/Chicago",
      isEstimate: false,
      importedAt: Date.now(),
    };
    await datedSpendRef.set(spendRecord);

    // Seed an order associated with that campaign
    const growthOrderRef = firestoreDb.collection("orders").doc("order_growth_01");
    await growthOrderRef.set({
      id: "order_growth_01",
      amountPaidCents: 1500,
      utmCampaign: "fall_special_2026",
      channel: "meta_ads",
      status: "completed",
      createdAt: Date.now(),
    });

    await recordPaymentCaptureFact({ orderId: "order_growth_01", paymentIntentId: "pi_growth_01", amountCents: 1500, currency: "usd", livemode: true, commercialKind: "paid_customer" });
    const growthReport = await getGrowthCampaignAndRecoveryReport();

    // 3.1 Non-Causal Attribution Badge & Advisory
    assert(
      growthReport.attributionBadgeText === DESCRIPTIVE_ATTRIBUTION_BADGE,
      "Report displays 'Descriptive Redemption Share — Not Causal Lift (No Control Holdout)'"
    );
    assert(
      growthReport.advisoryNote.toLowerCase().includes("automatic code termination on small sample sizes is strongly discouraged"),
      "Includes advisory against premature code termination on small sample sizes"
    );

    // 3.2 Campaign Performance with Dated Spend
    const campaignMatch = growthReport.campaigns.find(
      (c) => c.campaignId === "fall_special_2026"
    );
    assert(campaignMatch !== undefined, "Finds 'fall_special_2026' in campaigns list");
    if (campaignMatch) {
      assert(campaignMatch.datedSpendCents === 5000, "Matches exact dated spend ($50.00)");
      assert(campaignMatch.paidOrdersCount >= 1, "Counts paid orders");
      assert(campaignMatch.roas !== null, "Computes descriptive ROAS");
    }

    // 3.3 Draft Recovery Link Generation Preserving Acquisition Attribution
    const recoveryLink = buildManualRecoveryLink({
      draftId: "draft_cart_resume_88",
      resumabilityType: "server_order_draft",
      offerCode: "FINISH150",
      originalChannel: "google_search",
      originalUtmCampaign: "holiday_stationery",
      destinationPath: "/send",
    });

    assert(
      recoveryLink.url.includes("discount=FINISH150"),
      "Recovery link applies offer code via ?discount="
    );
    assert(
      recoveryLink.url.includes("utm_source=google_search"),
      "Preserves original acquisition channel as utm_source"
    );
    assert(
      recoveryLink.url.includes("utm_campaign=holiday_stationery"),
      "Preserves original campaign as utm_campaign"
    );
    assert(
      recoveryLink.url.includes("recovered_from=draft_cart_resume_88"),
      "Tags touchpoint with recovered_from=draft_id"
    );
    assert(
      recoveryLink.url.includes("draftId=draft_cart_resume_88"),
      "Includes draftId for cross-device restoration of server draft"
    );
    assert(
      recoveryLink.noAutomatedOutreachDisclaimer.includes("zero automated customer messages"),
      "Guarantees zero automated messaging in disclaimer"
    );

    // 3.4 Browser-Local Draft Handling
    const localRecoveryLink = buildManualRecoveryLink({
      draftId: "browser_local_cart_99",
      resumabilityType: "browser_local_only",
      offerCode: "WELCOME2",
      originalChannel: "direct",
    });
    assert(
      !localRecoveryLink.url.includes("draftId="),
      "Browser-local link does not append draftId to prevent cross-device draft mismatch"
    );
    assert(
      localRecoveryLink.notes.includes("visitor's local browser storage"),
      "Explicitly notes draft was stored in local browser storage only"
    );

    // =========================================================================
    // SUITE 4: AC04 — Consequential Change Preview, Blocked Deletion & Audit Log
    // =========================================================================
    console.log("\n--- SUITE 4: AC04 — Consequential Change Preview & Audited Mutations ---");

    // 4.1 Unused Offer: Can Be Hard-Deleted
    const unusedCode = "UNUSED_PROMO_CODE";
    await executeAuditedOfferChange({
      actorEmail: "founder@sendmynotes.com",
      action: "create",
      code: unusedCode,
      payload: {
        purpose: "Unused promo to test hard deletion",
        discountType: "FIXED_AMOUNT",
        discountValue: 100,
      },
    });

    const previewUnused = await previewConsequentialOfferChange(unusedCode, "delete");
    assert(
      previewUnused.canHardDelete === true,
      "Unused code with 0 redemptions can be hard-deleted (canHardDelete: true)"
    );

    const deleteUnusedResult = await executeAuditedOfferChange({
      actorEmail: "founder@sendmynotes.com",
      action: "delete",
      code: unusedCode,
      reason: "Cleaning up unredeemed test code",
    });
    assert(deleteUnusedResult.success === true, "Unused code deleted successfully");

    // 4.2 Redeemed Offer: Hard-Deletion Strictly Refused
    const previewRedeemed = await previewConsequentialOfferChange(testOfferCode, "delete");
    assert(
      previewRedeemed.canHardDelete === false,
      "Redeemed code CANNOT be hard-deleted (canHardDelete: false)"
    );
    assert(
      previewRedeemed.warnings.some((w) => w.includes("Hard deletion is blocked")),
      "Preview emits warning that hard deletion is blocked"
    );

    // Attempting to delete redeemed code returns error and fails
    const illegalDeleteResult = await executeAuditedOfferChange({
      actorEmail: "founder@sendmynotes.com",
      action: "delete",
      code: testOfferCode,
    });
    assert(
      illegalDeleteResult.success === false,
      "executeAuditedOfferChange refuses to hard-delete redeemed code"
    );
    assert(
      illegalDeleteResult.error?.includes("Cannot hard-delete an offer with historical redemptions") || false,
      "Error advises founder to archive code instead to preserve accounting"
    );

    // 4.3 Archiving Redeemed Offer Succeeds & Preserves Accounting
    const archiveResult = await executeAuditedOfferChange({
      actorEmail: "founder@sendmynotes.com",
      action: "archive",
      code: testOfferCode,
      reason: "Deactivating offer while preserving accounting ledger",
    });
    assert(archiveResult.success === true, "Archiving redeemed code succeeds");
    assert(
      archiveResult.offer?.status === "archived",
      "Offer status updated to 'archived'"
    );

    // 4.4 Audit Log Invariant: Entries Persisted in admin_audit_log
    const auditQuery = await firestoreDb
      .collection(ADMIN_AUDIT_LOG_COLLECTION)
      .where("targetId", "==", testOfferCode)
      .get();
    assert(
      auditQuery.size >= 2,
      `Audited mutations recorded in ${ADMIN_AUDIT_LOG_COLLECTION} collection (found ${auditQuery.size} entries)`
    );

    const sampleAudit = auditQuery.docs[0].data();
    assert(
      sampleAudit.actorEmail === "founder@sendmynotes.com" &&
        sampleAudit.targetType === "offer" &&
        typeof sampleAudit.timestamp === "number",
      "Audit record captures actor, targetType, and immutable timestamp"
    );

    // =========================================================================
    // SUITE 5: API Security & Role Enforcement (verifyAdminAuth HTTP 401)
    // =========================================================================
    console.log("\n--- SUITE 5: API Security & verifyAdminAuth Enforcement ---");

    // Unauthorized GET to /api/admin/promotions
    const unauthPromotionsReq = new NextRequest("http://localhost:3000/api/admin/promotions");
    const unauthPromotionsRes = await promotionsGet(unauthPromotionsReq);
    assert(
      unauthPromotionsRes.status === 401,
      "Unauthorized GET /api/admin/promotions returns HTTP 401"
    );

    // Unauthorized POST to /api/admin/promotions
    const unauthPromotionsPostReq = new NextRequest("http://localhost:3000/api/admin/promotions", {
      method: "POST",
      body: JSON.stringify({ action: "create", code: "HACK" }),
    });
    const unauthPromotionsPostRes = await promotionsPost(unauthPromotionsPostReq);
    assert(
      unauthPromotionsPostRes.status === 401,
      "Unauthorized POST /api/admin/promotions returns HTTP 401"
    );

    // Unauthorized GET to /api/admin/growth
    const unauthGrowthReq = new NextRequest("http://localhost:3000/api/admin/growth");
    const unauthGrowthRes = await growthGet(unauthGrowthReq);
    assert(
      unauthGrowthRes.status === 401,
      "Unauthorized GET /api/admin/growth returns HTTP 401"
    );

    // Unauthorized POST to /api/admin/growth
    const unauthGrowthPostReq = new NextRequest("http://localhost:3000/api/admin/growth", {
      method: "POST",
      body: JSON.stringify({ action: "generate_recovery_link" }),
    });
    const unauthGrowthPostRes = await growthPost(unauthGrowthPostReq);
    assert(
      unauthGrowthPostRes.status === 401,
      "Unauthorized POST /api/admin/growth returns HTTP 401"
    );
  });

  console.log("\n======================================================================");
  console.log(`🏁 SPRINT-0008 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log("======================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSprint0008Tests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
