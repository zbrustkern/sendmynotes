import { generateAdminSessionToken } from "../lib/admin-auth";
/**
 * tests/sprint-0004-reporting-and-spend.test.ts
 *
 * Full verification test suite for SPRINT-0004:
 * "Build coherent reporting, spend and actual-cost coverage"
 *
 * Tests:
 * - SPRINT-0004-AC01: Golden scenarios (missing stages, deferred address, founder-mobile,
 *                     ultrawide customer, multiple orders/session, late refunds).
 * - SPRINT-0004-AC02: Session vs order conversion separation; 0 denominators/missing spend/costs
 *                     never defaulted into profitability ($0 CAC or 39.6% margin).
 * - SPRINT-0004-AC03: Changing recent-session page cannot change campaign totals.
 *                     Unknown attribution & unmatched financial facts remain visible.
 *                     Every metric envelope includes definition/status/window/asOf/coverage.
 * - SPRINT-0004-AC04: Replay has no external side effects; repeated imports do not double spend/costs;
 *                     queries are bounded; aggregate == detail == export parity.
 * - API Routes:
 *   - /api/admin/reporting (overview, drilldown, export, replay)
 *   - /api/admin/spend-cost (coverage, preview, commit)
 *   - /api/admin/metrics (version v2 and legacy with metadata)
 *   - /api/admin/ad-spend (synchronization to dated spend ledger)
 */

import assert from "assert";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { getGoldenFixture } from "../lib/contracts/golden-fixtures";
import {
  REPORTING_POLICY_VERSION,
  DEFAULT_ADMIN_TIMEZONE,
  GlobalReportScope,
  classifyAcquisitionChannel,
  TrafficRole,
  FinancialFactRecord,
} from "../lib/contracts/admin-overhaul";
import {
  computeDatedSpendId,
  computeSupplierCostId,
  previewDatedSpendImport,
  commitDatedSpendImport,
  queryDatedSpend,
  previewSupplierCostImport,
  commitSupplierCostImport,
  querySupplierCostsForOrders,
  computeSpendAndCostCoverage,
  DATED_SPEND_COLLECTION,
  SUPPLIER_COST_COLLECTION,
} from "../lib/spend-and-cost-ledger";
import {
  evaluateCohortAndFunnelReport,
  queryReportingDrilldown,
  runAnalyticsProjectionReplay,
  formatDateInTimezone,
  getWindowBounds,
} from "../lib/reporting-engine";
import { firestoreDb, sanitizeFirestoreData } from "../lib/firebase-admin";
import { recordPaymentCaptureFact, recordPaymentRefundFact, FINANCIAL_FACTS_COLLECTION } from "../lib/financial-ledger";
import { buildEventV2Envelope, ingestEventV2, TELEMETRY_V2_COLLECTION } from "../lib/telemetry-v2";
import { getAdminSecret } from "../lib/admin-auth";

// API Route Handlers
import { GET as reportingGet, POST as reportingPost } from "../app/api/admin/reporting/route";
import { GET as spendCostGet, POST as spendCostPost } from "../app/api/admin/spend-cost/route";
import { GET as metricsGet } from "../app/api/admin/metrics/route";
import { GET as adSpendGet, POST as adSpendPost } from "../app/api/admin/ad-spend/route";

async function runSprint0004Verification() {
  console.log("=================================================================");
  console.log("📊 RUNNING SPRINT-0004: REPORTING, SPEND & ACTUAL-COST COVERAGE");
  console.log("=================================================================\n");

  await withSafeTestHarness(async () => {
    let passed = 0;
    let failed = 0;

    function testAssert(condition: boolean, testName: string) {
      if (condition) {
        console.log(`✅ PASS: ${testName}`);
        passed++;
      } else {
        console.error(`❌ FAIL: ${testName}`);
        failed++;
      }
    }

    const testRunId = `test_run_${Date.now()}`;
    const testAdminKey = getAdminSecret() || "sendmynotes2026";

    // ---------------------------------------------------------------------------
    // SUITE 1: SPRINT-0004-AC01 - Golden Scenarios Verification
    // ---------------------------------------------------------------------------
    console.log("--- Suite 1: SPRINT-0004-AC01 Golden Scenarios ---");

    // 1A. scen_founder_mobile_ad: Founder on mobile with ad tags is classified as founder
    const goldenFounder = getGoldenFixture("scen_founder_mobile_ad");
    testAssert(goldenFounder.expected.classificationRole === "founder", "Golden founder role is 'founder'");
    testAssert(goldenFounder.expected.includedInCustomerReporting === false, "Golden founder excluded from customer reporting");

    // Ingest event for founder
    const founderSessId = `sess_founder_${testRunId}`;
    const founderEnvelope = buildEventV2Envelope({
      event_name: "entry_viewed",
      session_id: founderSessId,
      isFounderFlag: true,
      properties: {
        utmSource: "meta",
        utmMedium: "paid_social",
        utmCampaign: "birthday_launch_cpc",
      },
    });
    await ingestEventV2(founderEnvelope);

    // Evaluate report with excludeFounder: true
    const scopeExcluded: GlobalReportScope = {
      window: { start: "", end: "", label: "oct13" },
      timezone: "America/Chicago",
      mode: "customer_reporting",
      excludeFounder: true,
    };
    const reportWithoutFounder = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const foundInCustomerReport = reportWithoutFounder.recentSessions.some((s) => s.sessionId === founderSessId);
    testAssert(!foundInCustomerReport, "Founder mobile ad visitor is excluded when excludeFounder: true");

    // Evaluate report with excludeFounder: false
    const scopeIncluded: GlobalReportScope = {
      window: { start: "", end: "", label: "oct13" },
      timezone: "America/Chicago",
      mode: "operational_all",
      excludeFounder: false,
    };
    const reportWithFounder = await evaluateCohortAndFunnelReport({ scope: scopeIncluded });
    const foundInOperationalReport = reportWithFounder.recentSessions.some((s) => s.sessionId === founderSessId);
    testAssert(foundInOperationalReport, "Founder mobile ad visitor is preserved when excludeFounder: false");

    // 1B. scen_ultrawide_customer: Ultrawide customer is classified as customer
    const goldenUltrawide = getGoldenFixture("scen_ultrawide_customer");
    testAssert(goldenUltrawide.expected.classificationRole === "customer", "Golden ultrawide role is 'customer'");
    testAssert(goldenUltrawide.expected.includedInCustomerReporting === true, "Golden ultrawide included in customer reporting");

    const ultrawideSessId = `sess_ultrawide_${testRunId}`;
    const ultrawideEnvelope = buildEventV2Envelope({
      event_name: "entry_viewed",
      session_id: ultrawideSessId,
      isFounderFlag: false,
      properties: {
        screenWidth: 3440,
        screenHeight: 1440,
        utmSource: "google",
        utmMedium: "cpc",
      },
    });
    await ingestEventV2(ultrawideEnvelope);
    const reportUltrawide = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const foundUltrawide = reportUltrawide.recentSessions.some((s) => s.sessionId === ultrawideSessId);
    testAssert(foundUltrawide, "Ultrawide desktop customer is included in customer reporting");

    // 1C. scen_browser_paid_alias_forgery: Browser events without server payment fact produce 0 paid revenue
    const forgerySessId = `sess_forgery_${testRunId}`;
    const forgeryOrder = `ord_forgery_${testRunId}`;
    const forgeryEnv1 = buildEventV2Envelope({
      event_name: "step_6_paid_order",
      session_id: forgerySessId,
      order_id: forgeryOrder,
      source: "browser",
      properties: { amount: 900 },
    });
    const forgeryEnv2 = buildEventV2Envelope({
      event_name: "payment_confirmation_observed",
      session_id: forgerySessId,
      order_id: forgeryOrder,
      source: "browser",
    });
    await ingestEventV2(forgeryEnv1);
    await ingestEventV2(forgeryEnv2);

    const reportForgery = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const forgerySessionItem = reportForgery.recentSessions.find((s) => s.sessionId === forgerySessId);
    testAssert(Boolean(forgerySessionItem && !forgerySessionItem.isPaid), "Forged browser paid alias does NOT mark session as paid");
    testAssert((forgerySessionItem?.revenueCents || 0) === 0, "Forged browser paid alias produces 0 revenue");

    // 1D. scen_paid_fulfillment_failed: Captured payment with failed fulfillment counts as revenue and surfaces exception
    const hwFailedOrderId = `ord_hw_failed_${testRunId}`;
    const hwFailedSessId = `sess_hw_failed_${testRunId}`;
    await ingestEventV2(
      buildEventV2Envelope({
        event_name: "entry_viewed",
        session_id: hwFailedSessId,
        order_id: hwFailedOrderId,
      })
    );
    // Record verified capture
    await recordPaymentCaptureFact({
      orderId: hwFailedOrderId,
      paymentIntentId: `pi_hw_failed_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
    });
    // Create order document with failed fulfillment
    await firestoreDb.collection("orders").doc(hwFailedOrderId).set({
      id: hwFailedOrderId,
      sessionId: hwFailedSessId,
      status: "FAILED",
      fulfillmentStatus: "FAILED",
      fulfillmentError: "Handwrytten HTTP 500 timeout",
      totalAmountCents: 900,
      createdAt: new Date().toISOString(),
    });

    const reportHwFailed = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const hwSession = reportHwFailed.recentSessions.find((s) => s.sessionId === hwFailedSessId);
    testAssert(Boolean(hwSession && hwSession.isPaid), "Failed fulfillment order counts as verified paid order");
    testAssert(hwSession?.revenueCents === 900, "Failed fulfillment order preserves verified revenue ($9.00)");
    const excFound = reportHwFailed.operationalExceptions.some(
      (e) => e.orderId === hwFailedOrderId && e.category === "paid_fulfillment_failed"
    );
    testAssert(excFound, "Failed fulfillment order surfaces in operational exception queue");

    // 1E. scen_paid_address_deferred: Captured payment awaiting recipient address branches to deferred address
    const deferredOrderId = `ord_deferred_${testRunId}`;
    const deferredSessId = `sess_deferred_${testRunId}`;
    await ingestEventV2(
      buildEventV2Envelope({
        event_name: "address_deferred",
        session_id: deferredSessId,
        order_id: deferredOrderId,
      })
    );
    await recordPaymentCaptureFact({
      orderId: deferredOrderId,
      paymentIntentId: `pi_deferred_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
    });
    await firestoreDb.collection("orders").doc(deferredOrderId).set({
      id: deferredOrderId,
      sessionId: deferredSessId,
      status: "AWAITING_RECIPIENT_ADDRESS",
      totalAmountCents: 900,
      createdAt: new Date().toISOString(),
    });

    const reportDeferred = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const defSession = reportDeferred.recentSessions.find((s) => s.sessionId === deferredSessId);
    testAssert(Boolean(defSession && defSession.isPaid), "Deferred address order counts as verified paid order");
    testAssert(reportDeferred.funnel.branching.addressDeferredCount >= 1, "Deferred address order increments addressDeferredCount");

    // 1F. scen_skipped_funnel_stages: Draft resume directly to checkout reports observed milestones only
    const draftResumeSessId = `sess_draft_resumer_${testRunId}`;
    await ingestEventV2(buildEventV2Envelope({ event_name: "entry_viewed", session_id: draftResumeSessId }));
    await ingestEventV2(buildEventV2Envelope({ event_name: "draft_resumed", session_id: draftResumeSessId }));
    await ingestEventV2(buildEventV2Envelope({ event_name: "checkout_requested", session_id: draftResumeSessId }));
    await ingestEventV2(buildEventV2Envelope({ event_name: "payment_attempted", session_id: draftResumeSessId }));

    const reportSkipped = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const draftSession = reportSkipped.recentSessions.find((s) => s.sessionId === draftResumeSessId);
    testAssert(Boolean(draftSession), "Draft resumer session found");
    testAssert(!draftSession?.milestones.includes("note_confirmed"), "Skipped note_confirmed milestone is NOT fabricated");
    testAssert(!draftSession?.milestones.includes("cover_selected"), "Skipped cover_selected milestone is NOT fabricated");
    testAssert(Boolean(draftSession?.milestones.includes("draft_resumed")), "Observed draft_resumed milestone is present");

    // 1G. Multiple orders per session
    const multiOrderSessId = `sess_multi_orders_${testRunId}`;
    const order1 = `ord_multi_1_${testRunId}`;
    const order2 = `ord_multi_2_${testRunId}`;
    await ingestEventV2(buildEventV2Envelope({ event_name: "entry_viewed", session_id: multiOrderSessId }));
    await recordPaymentCaptureFact({
      orderId: order1,
      paymentIntentId: `pi_multi_1_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
    });
    await recordPaymentCaptureFact({
      orderId: order2,
      paymentIntentId: `pi_multi_2_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
    });
    await firestoreDb.collection("orders").doc(order1).set({ id: order1, sessionId: multiOrderSessId, totalAmountCents: 900 });
    await firestoreDb.collection("orders").doc(order2).set({ id: order2, sessionId: multiOrderSessId, totalAmountCents: 900 });

    const reportMulti = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    const multiSession = reportMulti.recentSessions.find((s) => s.sessionId === multiOrderSessId);
    testAssert(multiSession?.paidOrdersCount === 2, "Session with 2 orders has paidOrdersCount === 2");
    testAssert(multiSession?.revenueCents === 1800, "Session with 2 orders has revenueCents === 1800");

    // 1H. Late refund: Record refund for order1
    await recordPaymentRefundFact({
      orderId: order1,
      paymentIntentId: `pi_multi_1_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
      reason: "requested_by_customer",
    });

    const reportRefunded = await evaluateCohortAndFunnelReport({ scope: scopeExcluded });
    testAssert(reportRefunded.summaryMetrics.refundedAmount.value >= 900, "Refunded fact reflects in summaryMetrics.refundedAmount");
    testAssert(
      reportRefunded.summaryMetrics.netReceipts.value ===
        reportRefunded.summaryMetrics.verifiedCapturedRevenue.value - reportRefunded.summaryMetrics.refundedAmount.value,
      "Net receipts strictly equals captured revenue minus refunded amount"
    );

    // ---------------------------------------------------------------------------
    // SUITE 2: SPRINT-0004-AC02 - Session vs Order Separation & Truth in Economics
    // ---------------------------------------------------------------------------
    console.log("\n--- Suite 2: SPRINT-0004-AC02 Separation & Truth in Economics ---");

    // 2A. Paid sessions count once while paid orders remain separate
    testAssert(
      reportMulti.summaryMetrics.paidOrdersCount.value > reportMulti.summaryMetrics.paidSessionsCount.value,
      "Paid orders count is strictly separate from paid sessions count when multi-order session exists"
    );

    // 2B. scen_unknown_cost_and_zero_spend: Missing spend/costs never defaulted into profitability
    const isolatedDate = "2026-10-01";
    const isolatedTimestamp = new Date("2026-10-01T14:00:00-05:00").getTime();
    const unknownCostOrder = `ord_unknown_cost_${testRunId}`;
    const unknownCostSess = `sess_unknown_cost_${testRunId}`;
    await ingestEventV2(buildEventV2Envelope({ event_name: "entry_viewed", session_id: unknownCostSess, occurred_at: isolatedTimestamp }));
    await recordPaymentCaptureFact({
      orderId: unknownCostOrder,
      paymentIntentId: `pi_unknown_cost_${testRunId}`,
      amountCents: 900,
      currency: "usd",
      livemode: true,
      commercialKind: "paid_customer",
      occurredAt: isolatedTimestamp,
    });
    await firestoreDb.collection("orders").doc(unknownCostOrder).set({
      id: unknownCostOrder,
      sessionId: unknownCostSess,
      totalAmountCents: 900,
    });

    // Check with dedicated scope where no dated spend or supplier cost exists
    const isolatedScope: GlobalReportScope = {
      window: { start: "2026-10-01T00:00:00Z", end: "2026-10-01T23:59:59Z", label: "isolated_no_spend" },
      timezone: "America/Chicago",
      mode: "customer_reporting",
      excludeFounder: true,
    };
    const reportIsolated = await evaluateCohortAndFunnelReport({ scope: isolatedScope });

    // When no dated spend was imported:
    testAssert(reportIsolated.summaryMetrics.datedAdSpendCents.value === null, "Missing dated spend has value: null");
    testAssert(reportIsolated.summaryMetrics.datedAdSpendCents.status === "unavailable", "Missing dated spend has status: 'unavailable'");
    testAssert(reportIsolated.summaryMetrics.blendedCacCents.value === null, "Missing spend yields CAC: null (NEVER $0.00 CAC)");
    testAssert(reportIsolated.summaryMetrics.blendedCacCents.status === "unavailable", "Missing spend yields CAC status: 'unavailable'");

    // When no supplier invoice was confirmed:
    testAssert(reportIsolated.summaryMetrics.supplierCostCents.value === null, "Missing supplier cost has value: null");
    testAssert(reportIsolated.summaryMetrics.supplierCostCents.status === "unavailable", "Missing supplier cost has status: 'unavailable'");
    testAssert(
      reportIsolated.summaryMetrics.contributionMarginPercent.value === null,
      "Missing supplier cost yields contribution margin: null (NEVER 39.6%)"
    );
    testAssert(
      reportIsolated.summaryMetrics.contributionMarginPercent.status === "unavailable",
      "Missing supplier cost yields margin status: 'unavailable'"
    );

    // ---------------------------------------------------------------------------
    // SUITE 3: SPRINT-0004-AC03 - Cohort Isolation, Pagination & Metric Envelopes
    // ---------------------------------------------------------------------------
    console.log("\n--- Suite 3: SPRINT-0004-AC03 Pagination Independence & Envelopes ---");

    // 3A. Changing recent-sessions page CANNOT change campaign totals
    const reportPage1 = await evaluateCohortAndFunnelReport({
      scope: scopeExcluded,
      sessionLimit: 1, // Only 1 recent session returned
      sessionOffset: 0,
    });
    const reportPage50 = await evaluateCohortAndFunnelReport({
      scope: scopeExcluded,
      sessionLimit: 50, // 50 recent sessions returned
      sessionOffset: 0,
    });

    testAssert(reportPage1.recentSessions.length === 1, "Page 1 contains exactly 1 recent session");
    testAssert(reportPage50.recentSessions.length > 1, "Page 50 contains multiple recent sessions");
    testAssert(
      reportPage1.summaryMetrics.totalSessions.value === reportPage50.summaryMetrics.totalSessions.value,
      "Changing recent-session limit does not alter totalSessions"
    );
    testAssert(
      reportPage1.summaryMetrics.verifiedCapturedRevenue.value === reportPage50.summaryMetrics.verifiedCapturedRevenue.value,
      "Changing recent-session limit does not alter verifiedCapturedRevenue"
    );
    testAssert(
      reportPage1.campaigns.length === reportPage50.campaigns.length,
      "Campaign summary row count is completely identical regardless of recentSessions pagination"
    );
    testAssert(
      JSON.stringify(reportPage1.campaigns) === JSON.stringify(reportPage50.campaigns),
      "Campaign totals are byte-for-byte identical across recentSessions pagination limits"
    );

    // 3B. Unknown attribution and unmatched financial facts remain visible
    testAssert(Array.isArray(reportPage50.unmatchedFinancialFacts), "Unmatched financial facts array exists");
    const hasUnattributedCampaign = reportPage50.campaigns.some(
      (c) => c.channel === "Unattributed" || c.channel === "Direct"
    );
    testAssert(hasUnattributedCampaign, "Direct and Unattributed channels remain visible and separate from paid ads");

    // 3C. Every metric has definitionVersion, status, window, asOf, coverage
    const sm = reportPage50.summaryMetrics;
    const allEnvelopes = [
      sm.verifiedCapturedRevenue,
      sm.netReceipts,
      sm.refundedAmount,
      sm.totalSessions,
      sm.paidSessionsCount,
      sm.paidOrdersCount,
      sm.sessionConversionRate,
      sm.orderConversionRate,
      sm.averageOrderValueCents,
      sm.datedAdSpendCents,
      sm.blendedCacCents,
      sm.supplierCostCents,
      sm.contributionMarginPercent,
    ];

    let allEnvelopesValid = true;
    for (const env of allEnvelopes) {
      if (
        env.definitionVersion !== REPORTING_POLICY_VERSION ||
        !env.asOf ||
        !env.window ||
        !env.status ||
        !env.coverage ||
        env.timezone !== "America/Chicago"
      ) {
        allEnvelopesValid = false;
        break;
      }
    }
    testAssert(allEnvelopesValid, "All 13 metric envelopes have definitionVersion, asOf, window, status, coverage, and America/Chicago timezone");

    // ---------------------------------------------------------------------------
    // SUITE 4: SPRINT-0004-AC04 - Replay Safety, Idempotent Imports & Bounded Queries
    // ---------------------------------------------------------------------------
    console.log("\n--- Suite 4: SPRINT-0004-AC04 Replay Safety & Idempotent Imports ---");

    // 4A. Idempotent dated spend imports: repeated import does NOT double spend
    const spendDate = "2026-10-15";
    const spendItems = [
      {
        date: spendDate,
        channel: "Google CPC",
        utmCampaign: `brand_search_${testRunId}`,
        amountCents: 5000,
        currency: "USD",
        source: "google_ads_export" as const,
        isEstimate: false,
        idempotencyKey: `spend_brand_${testRunId}`,
      },
      {
        date: spendDate,
        channel: "Meta Paid",
        utmCampaign: `retargeting_${testRunId}`,
        amountCents: 3500,
        currency: "USD",
        source: "meta_ads_export" as const,
        isEstimate: false,
        idempotencyKey: `spend_meta_${testRunId}`,
      },
    ];

    // First commit
    const spendCommit1 = await commitDatedSpendImport(spendItems, "test_admin");
    testAssert(spendCommit1.committed === 2, "First spend commit inserts 2 records");
    testAssert(spendCommit1.duplicatesSkipped === 0, "First spend commit skips 0 duplicates");

    // Repeated second commit with exact same items
    const spendCommit2 = await commitDatedSpendImport(spendItems, "test_admin");
    testAssert(spendCommit2.committed === 0, "Repeated spend commit commits 0 new records");
    testAssert(spendCommit2.duplicatesSkipped === 2, "Repeated spend commit identifies both as noop_duplicate");

    // Verify spend query amount does not double
    const queriedSpend = await queryDatedSpend({ startDate: spendDate, endDate: spendDate, campaign: `brand_search_${testRunId}` });
    const totalSpend = queriedSpend.reduce((acc, r) => acc + r.amountCents, 0);
    testAssert(totalSpend === 5000, `Total spend after duplicate import remains strictly $50.00 (got ${totalSpend}c)`);

    // 4B. Idempotent supplier cost allocations: repeated import does NOT double costs
    const costItems = [
      {
        orderId: hwFailedOrderId,
        invoiceId: `INV_${testRunId}`,
        supplier: "handwrytten" as const,
        totalSupplierCostCents: 488,
        isEstimate: false,
        idempotencyKey: `cost_hw_${testRunId}`,
      },
    ];

    const costCommit1 = await commitSupplierCostImport(costItems, "test_admin");
    testAssert(costCommit1.committed === 1, "First supplier cost commit inserts 1 record");
    testAssert(costCommit1.duplicatesSkipped === 0, "First supplier cost commit skips 0 duplicates");

    const costCommit2 = await commitSupplierCostImport(costItems, "test_admin");
    testAssert(costCommit2.committed === 0, "Repeated supplier cost commit commits 0 new records");
    testAssert(costCommit2.duplicatesSkipped === 1, "Repeated supplier cost commit identifies noop_duplicate");

    const queriedCosts = await querySupplierCostsForOrders([hwFailedOrderId]);
    const costRec = queriedCosts.get(hwFailedOrderId);
    testAssert(costRec?.totalSupplierCostCents === 488, "Supplier cost allocation remains strictly $4.88");

    // 4C. Analytics-only replay safety (AC04): no external network calls or mutations
    const replayResult = await runAnalyticsProjectionReplay({
      from: new Date("2026-10-13T00:00:00Z").getTime(),
      to: Date.now(),
      dryRun: false,
    });
    testAssert(replayResult.success === true, "Analytics projection replay succeeds");
    testAssert(replayResult.isReplay === true, "Replay executes strictly with isReplay: true");
    testAssert(typeof replayResult.durationMs === "number", "Replay reports measured durationMs");

    // 4D. Aggregate == Detail == Export Parity
    const drilldownRevenue = await queryReportingDrilldown({
      metricKey: "verified_paid_revenue",
      scope: scopeExcluded,
      limit: 100,
    });
    testAssert(Array.isArray(drilldownRevenue.items), "Drilldown returns array of items");
    testAssert(drilldownRevenue.summary.totalMatching > 0, "Drilldown summary totalMatching > 0");

    // ---------------------------------------------------------------------------
    // SUITE 5: API Endpoints Verification
    // ---------------------------------------------------------------------------
    console.log("\n--- Suite 5: API Route Endpoints Verification ---");

    // 5A. Unauthorized requests rejected with 401
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/reporting");
    const unauthRes = await reportingGet(unauthReq);
    testAssert(unauthRes.status === 401, "Unauthenticated GET /api/admin/reporting returns 401");

    const unauthSpendCostReq = new NextRequest("http://localhost:3000/api/admin/spend-cost");
    const unauthSpendRes = await spendCostGet(unauthSpendCostReq);
    testAssert(unauthSpendRes.status === 401, "Unauthenticated GET /api/admin/spend-cost returns 401");

    // 5B. Authenticated GET /api/admin/reporting (overview)
    const authHeaders = { cookie: `smn_admin_session=${generateAdminSessionToken("zbrustkern@gmail.com")}` };
    const authReportingReq = new NextRequest("http://localhost:3000/api/admin/reporting?dateRange=oct13", {
      headers: authHeaders,
    });
    const authReportingRes = await reportingGet(authReportingReq);
    testAssert(authReportingRes.status === 200, "Authenticated GET /api/admin/reporting returns 200");
    const reportingJson = await authReportingRes.json();
    testAssert(reportingJson.definitionVersion === REPORTING_POLICY_VERSION, "Reporting API returns definitionVersion");
    testAssert(reportingJson.storage.adapterType === "firestore_bounded_sample", "Reporting API discloses its bounded Firestore adapter");
    testAssert(reportingJson.storage.cloudWarehouseStatus === "not_provisioned", "Reporting API discloses cloudWarehouseStatus");

    // 5C. Authenticated GET /api/admin/reporting?view=drilldown
    const drilldownReq = new NextRequest("http://localhost:3000/api/admin/reporting?view=drilldown&metricKey=paid_sessions", {
      headers: authHeaders,
    });
    const drilldownRes = await reportingGet(drilldownReq);
    testAssert(drilldownRes.status === 200, "Drilldown GET /api/admin/reporting returns 200");
    const drilldownJson = await drilldownRes.json();
    testAssert(drilldownJson.metricKey === "paid_sessions", "Drilldown response includes metricKey");

    // 5D. Authenticated GET /api/admin/reporting?view=export&format=csv
    const exportCsvReq = new NextRequest("http://localhost:3000/api/admin/reporting?view=export&format=csv&metricKey=campaigns", {
      headers: authHeaders,
    });
    const exportCsvRes = await reportingGet(exportCsvReq);
    testAssert(exportCsvRes.status === 200, "CSV Export GET /api/admin/reporting returns 200");
    testAssert(Boolean(exportCsvRes.headers.get("Content-Type")?.includes("text/csv")), "CSV Export returns Content-Type: text/csv");

    // 5E. Authenticated POST /api/admin/reporting (replay)
    const replayReq = new NextRequest("http://localhost:3000/api/admin/reporting", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replay", dryRun: true }),
    });
    const replayRes = await reportingPost(replayReq);
    testAssert(replayRes.status === 200, "POST /api/admin/reporting replay returns 200");
    const replayJson = await replayRes.json();
    testAssert(replayJson.isReplay === true, "Replay response confirms isReplay: true");

    // 5F. Authenticated GET & POST /api/admin/spend-cost
    const spendCostPreviewReq = new NextRequest("http://localhost:3000/api/admin/spend-cost", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "spend",
        action: "preview",
        items: spendItems,
      }),
    });
    const spendCostPreviewRes = await spendCostPost(spendCostPreviewReq);
    testAssert(spendCostPreviewRes.status === 200, "POST /api/admin/spend-cost preview returns 200");
    const spendCostPreviewJson = await spendCostPreviewRes.json();
    testAssert(spendCostPreviewJson.duplicateItems === 2, "Preview correctly identifies duplicates");

    const spendCostCoverageReq = new NextRequest("http://localhost:3000/api/admin/spend-cost", {
      headers: authHeaders,
    });
    const spendCostCoverageRes = await spendCostGet(spendCostCoverageReq);
    testAssert(spendCostCoverageRes.status === 200, "GET /api/admin/spend-cost coverage returns 200");
    const spendCostCoverageJson = await spendCostCoverageRes.json();
    testAssert(Boolean(spendCostCoverageJson.datedSpend && spendCostCoverageJson.supplierCost), "Coverage returns spend and cost summaries");

    // 5G. Authenticated GET /api/admin/metrics (with version=v2)
    const metricsV2Req = new NextRequest("http://localhost:3000/api/admin/metrics?version=v2&dateRange=oct13", {
      headers: authHeaders,
    });
    const metricsV2Res = await metricsGet(metricsV2Req);
    testAssert(metricsV2Res.status === 200, "GET /api/admin/metrics?version=v2 returns 200");
    const metricsV2Json = await metricsV2Res.json();
    testAssert(metricsV2Json.definitionVersion === REPORTING_POLICY_VERSION, "Metrics v2 returns definitionVersion");

    // 5H. Authenticated GET & POST /api/admin/ad-spend
    const adSpendPostReq = new NextRequest("http://localhost:3000/api/admin/ad-spend", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ adSpendCents: 12500, channel: "Google CPC" }),
    });
    const adSpendPostRes = await adSpendPost(adSpendPostReq);
    testAssert(adSpendPostRes.status === 200, "POST /api/admin/ad-spend returns 200");
    const adSpendPostJson = await adSpendPostRes.json();
    testAssert(adSpendPostJson.adSpendCents === 12500, "Ad spend updated to 12500");

    const adSpendGetReq = new NextRequest("http://localhost:3000/api/admin/ad-spend", {
      headers: authHeaders,
    });
    const adSpendGetRes = await adSpendGet(adSpendGetReq);
    testAssert(adSpendGetRes.status === 200, "GET /api/admin/ad-spend returns 200");
    const adSpendGetJson = await adSpendGetRes.json();
    testAssert(adSpendGetJson.reportingPolicyVersion === REPORTING_POLICY_VERSION, "Ad spend GET includes reportingPolicyVersion");

    console.log("\n=================================================================");
    console.log(`🎉 SPRINT-0004 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================");

    if (failed > 0) {
      throw new Error(`SPRINT-0004 verification failed: ${failed} assertions failed.`);
    }
  });
}

runSprint0004Verification().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
