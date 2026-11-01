import assert from "node:assert";
import {
  aggregateWaterfallReport,
  chicagoMidnight,
  classifyChannel,
  classifyDevice,
  isBotEvent,
  isFounderEvent,
  localDate,
  mapEventToFunnelStep,
  normalizeWaterfallScope,
  validDate,
} from "../lib/admin-waterfall-report";
import {
  AdminWaterfallReport,
  WaterfallAdSpendInput,
  WaterfallOrderInput,
  WaterfallScope,
  WaterfallTelemetryEventInput,
} from "../lib/contracts/admin-waterfall";

async function runAdminWaterfallTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING ADMIN WATERFALL & TELEMETRY TESTS");
  console.log("=================================================\n");

  const fixedClock = new Date("2026-10-27T15:00:00.000Z"); // 10:00 AM CT
  const todayCt = localDate(fixedClock);
  assert.strictEqual(todayCt, "2026-10-27", "localDate should return 2026-10-27 in Chicago time");

  // =========================================================================
  // 1. WINDOW NORMALIZATION IN America/Chicago
  // =========================================================================
  console.log("-> 1. Testing Window Normalization across all 7 visibility modes");

  // 1a. Today
  const scopeToday = normalizeWaterfallScope(new URLSearchParams({ window: "today" }), fixedClock);
  assert.strictEqual(scopeToday.window, "today");
  assert.strictEqual(scopeToday.startDate, "2026-10-27");
  assert.strictEqual(scopeToday.endDate, "2026-10-27");
  assert.strictEqual(scopeToday.startUtc, chicagoMidnight("2026-10-27"));
  assert.strictEqual(scopeToday.endUtc, chicagoMidnight("2026-10-28"));

  // 1b. Yesterday
  const scopeYesterday = normalizeWaterfallScope(new URLSearchParams({ window: "yesterday" }), fixedClock);
  assert.strictEqual(scopeYesterday.window, "yesterday");
  assert.strictEqual(scopeYesterday.startDate, "2026-10-26");
  assert.strictEqual(scopeYesterday.endDate, "2026-10-26");
  assert.strictEqual(scopeYesterday.startUtc, chicagoMidnight("2026-10-26"));
  assert.strictEqual(scopeYesterday.endUtc, chicagoMidnight("2026-10-27"));

  // 1c. Last 7 Days
  const scopeLast7 = normalizeWaterfallScope(new URLSearchParams({ window: "last7" }), fixedClock);
  assert.strictEqual(scopeLast7.window, "last7");
  assert.strictEqual(scopeLast7.startDate, "2026-10-21");
  assert.strictEqual(scopeLast7.endDate, "2026-10-27");

  // 1d. Last 30 Days
  const scopeLast30 = normalizeWaterfallScope(new URLSearchParams({ window: "last30" }), fixedClock);
  assert.strictEqual(scopeLast30.window, "last30");
  assert.strictEqual(scopeLast30.startDate, "2026-09-28");
  assert.strictEqual(scopeLast30.endDate, "2026-10-27");

  // 1e. Since Oct 13
  const scopeOct13 = normalizeWaterfallScope(new URLSearchParams({ window: "since_oct13" }), fixedClock);
  assert.strictEqual(scopeOct13.window, "since_oct13");
  assert.strictEqual(scopeOct13.startDate, "2026-10-13");
  assert.strictEqual(scopeOct13.endDate, "2026-10-27");

  // 1f. All Time
  const scopeAll = normalizeWaterfallScope(new URLSearchParams({ window: "all" }), fixedClock);
  assert.strictEqual(scopeAll.window, "all");
  assert.strictEqual(scopeAll.startDate, null);
  assert.strictEqual(scopeAll.endDate, null);
  assert.strictEqual(scopeAll.startUtc, null);
  assert.strictEqual(scopeAll.endUtc, null);

  const unknownAttributionScope = normalizeWaterfallScope(
    new URLSearchParams({ window: "last7", channel: "unknown" }),
    fixedClock
  );
  assert.strictEqual(unknownAttributionScope.channel, "unknown", "Unknown attribution must be a selectable, filterable channel");

  // 1g. Custom Range
  const scopeCustom = normalizeWaterfallScope(
    new URLSearchParams({ window: "custom", start: "2026-10-15", end: "2026-10-20" }),
    fixedClock
  );
  assert.strictEqual(scopeCustom.window, "custom");
  assert.strictEqual(scopeCustom.startDate, "2026-10-15");
  assert.strictEqual(scopeCustom.endDate, "2026-10-20");

  // 1h. Custom Range validation error on reversed dates
  assert.throws(() => {
    normalizeWaterfallScope(
      new URLSearchParams({ window: "custom", start: "2026-10-25", end: "2026-10-10" }),
      fixedClock
    );
  }, /Invalid or reversed custom dates/);

  console.log("   ✓ All 7 window modes normalize correctly with exact America/Chicago midnights");

  // =========================================================================
  // 2. BOT & FOUNDER EXCLUSION IN "customers" AUDIENCE MODE
  // =========================================================================
  console.log("-> 2. Testing Bot & Founder Exclusions");

  const baseScope: WaterfallScope = {
    window: "last7",
    startDate: "2026-10-21",
    endDate: "2026-10-27",
    channel: "all",
    audience: "customers",
    startUtc: chicagoMidnight("2026-10-21"),
    endUtc: chicagoMidnight("2026-10-28"),
  };

  const tsNow = fixedClock.getTime();

  // Test bot event recognition
  assert.strictEqual(isBotEvent({ isBot: true }), true);
  assert.strictEqual(isBotEvent({ userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" }), true);
  assert.strictEqual(isBotEvent({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5)" }), false);

  // Test founder event recognition
  assert.strictEqual(isFounderEvent({ isFounder: true }), true);
  assert.strictEqual(isFounderEvent({ is_founder: true }), true);
  assert.strictEqual(isFounderEvent({ metadata: { is_founder: true } }), true);
  assert.strictEqual(isFounderEvent({ isFounder: false }), false);

  const mixedTelemetry: WaterfallTelemetryEventInput[] = [
    // Session 1: Valid Customer Session
    {
      sessionId: "sess_customer_1",
      eventName: "landing_viewed",
      timestamp: tsNow,
      utmSource: "direct",
      utmMedium: "none",
      deviceType: "mobile",
    },
    {
      sessionId: "sess_customer_1",
      eventName: "step_2_cover_ready",
      timestamp: tsNow + 1000,
    },
    // Session 2: Crawler Bot Session
    {
      sessionId: "sess_bot_crawler",
      eventName: "landing_viewed",
      timestamp: tsNow,
      isBot: true,
      deviceType: "desktop",
    },
    // Session 3: Founder Session
    {
      sessionId: "sess_founder_test",
      eventName: "landing_viewed",
      timestamp: tsNow,
      isFounder: true,
      deviceType: "desktop",
    },
  ];

  const mixedOrders: WaterfallOrderInput[] = [
    // Verified Customer Order
    {
      id: "ord_verified_cust",
      createdAt: tsNow,
      amountInCents: 900,
      paymentMethod: "STRIPE",
      stripePaymentId: "pi_real_customer_123",
      purchaseMeasurement: {
        version: 1,
        transactionId: "ord_verified_cust",
        amountInCents: 900,
        currency: "USD",
        verifiedAt: tsNow,
        eligible: true,
        reason: "eligible",
      },
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: "hw_9999",
    },
    // Founder Test Order
    {
      id: "ord_founder_test",
      createdAt: tsNow,
      amountInCents: 900,
      isFounderTest: true,
      paymentMethod: "STRIPE",
      stripePaymentId: "pi_founder_test",
    },
    // Studio Comp Order
    {
      id: "ord_studio_comp",
      createdAt: tsNow,
      amountInCents: 0,
      isComp: true,
      commercialKind: "studio_comp",
    },
    // Admin Comp Balance Order
    {
      id: "ord_admin_comp",
      createdAt: tsNow,
      amountInCents: 0,
      origin: "ADMIN_COMP",
    },
  ];

  // Run in "customers" audience mode:
  const custReport = aggregateWaterfallReport({
    asOf: fixedClock,
    scope: baseScope,
    orders: mixedOrders,
    telemetry: mixedTelemetry,
  });

  // Verify Bot was filtered out
  assert.strictEqual(custReport.deviceBreakdown.botFilteredCount, 1, "Must filter 1 bot session");
  // Verify Founder was filtered out in customers mode
  assert.strictEqual(custReport.deviceBreakdown.founderFilteredCount, 1, "Must filter 1 founder session in customers mode");
  // Verify 1 customer order counted
  assert.strictEqual(custReport.kpis.paidCustomerOrders, 1, "Must count 1 verified customer order");
  assert.strictEqual(custReport.kpis.netRevenueCents, 900, "Net revenue must be 900 cents");
  assert.strictEqual(custReport.kpis.capturedRevenueCents, 900, "Captured revenue must be 900 cents");
  // Verify 3 non-customer orders excluded
  assert.strictEqual(custReport.kpis.excludedNonCustomerOrders, 3, "Must exclude 3 non-customer orders (founder + comp + admin balance)");
  // Verify fulfillment status
  assert.strictEqual(custReport.kpis.dispatchedOrders, 1, "Must report 1 dispatched order");
  assert.strictEqual(custReport.kpis.heldOrFailedOrders, 0, "Must report 0 held/failed orders");

  // Now run in "all_traffic" audience mode:
  const allTrafficReport = aggregateWaterfallReport({
    asOf: fixedClock,
    scope: { ...baseScope, audience: "all_traffic" },
    orders: mixedOrders,
    telemetry: mixedTelemetry,
  });

  // Owner QA is counted for diagnosis but never mixed into customer KPIs.
  assert.strictEqual(allTrafficReport.deviceBreakdown.botFilteredCount, 1, "Bot is still filtered in all_traffic");
  assert.strictEqual(allTrafficReport.deviceBreakdown.founderFilteredCount, 1, "Founder remains excluded from the business view in all_traffic");
  assert.strictEqual(allTrafficReport.deviceBreakdown.ownerQaSessionCount, 1, "Owner QA is visible as a separate comparison");
  assert.strictEqual(allTrafficReport.kpis.uniqueSessions, custReport.kpis.uniqueSessions, "QA toggle must not change customer session KPI");
  assert.strictEqual(allTrafficReport.kpis.paidCustomerOrders, custReport.kpis.paidCustomerOrders, "QA toggle must not change customer orders");

  console.log("   ✓ Bot and founder sessions and orders are strictly filtered in 'customers' mode");

  // =========================================================================
  // 3. OBSERVED MILESTONES DO NOT BACKFILL MISSING EARLIER STEPS
  // =========================================================================
  console.log("-> 3. Testing independent observed milestone counts");

  // Scenario:
  // User enters directly to Note via /?auto_select=1 (e.g. ad campaign)
  // Session emits only inside_note_edited (3_COMPOSE), note_completed (3_COMPOSE), address_completed (4_ADDRESS)
  // No step 1 or step 2 browser event was emitted.
  const directEntryTelemetry: WaterfallTelemetryEventInput[] = [
    {
      sessionId: "sess_direct_ad_entry",
      eventName: "inside_note_edited",
      timestamp: tsNow,
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "Direct-Note-Ad",
      fbclid: "fb_click_123",
      deviceType: "mobile",
    },
    {
      sessionId: "sess_direct_ad_entry",
      eventName: "note_completed",
      timestamp: tsNow + 500,
    },
    {
      sessionId: "sess_direct_ad_entry",
      eventName: "address_completed",
      timestamp: tsNow + 1000,
    },
    // Another visitor lands and stops at step 1:
    {
      sessionId: "sess_drop_landing",
      eventName: "landing_viewed",
      timestamp: tsNow + 2000,
      utmSource: "direct",
    },
  ];

  const monotonicReport = aggregateWaterfallReport({
    asOf: fixedClock,
    scope: baseScope,
    orders: [],
    telemetry: directEntryTelemetry,
  });

  const wf = monotonicReport.waterfall;
  assert.strictEqual(wf.length, 6, "Must have exactly 6 funnel steps");

  const s1 = wf.find((w) => w.step === "1_LANDING")!;
  const s2 = wf.find((w) => w.step === "2_ITEM_SELECT")!;
  const s3 = wf.find((w) => w.step === "3_COMPOSE")!;
  const s4 = wf.find((w) => w.step === "4_ADDRESS")!;
  const s5 = wf.find((w) => w.step === "5_CHECKOUT")!;
  const s6 = wf.find((w) => w.step === "6_PAID")!;

  // Only the explicit landing event qualifies a landing session. Note and address
  // confirmations stay visible on the direct-entry session without fabricating a
  // card selection or landing record.
  assert.strictEqual(s1.sessions, 1, "Only the explicit landing event counts as a qualified entry session");
  assert.strictEqual(s2.sessions, 0, "Missing card selection is not backfilled from later milestones");
  assert.strictEqual(s3.sessions, 1, "Step 3 must have 1 session");
  assert.strictEqual(s4.sessions, 1, "Step 4 must have 1 session");
  assert.strictEqual(s5.sessions, 0, "Step 5 must have 0 sessions");
  assert.strictEqual(s6.sessions, 0, "Step 6 must have 0 sessions");

  assert.ok(s3.sessions > s2.sessions, "A later observed milestone may exceed missing earlier events");

  // A transition with missing earlier evidence has no derived drop-off.
  assert.strictEqual(s1.dropOffFromPrevPct, null, "Step 1 drop-off is null");
  assert.strictEqual(s2.dropOffFromPrevPct, 100, "The observed landing-to-card transition shows an observed 100% drop");
  assert.strictEqual(s3.dropOffFromPrevPct, null, "Step 3 transition is unknown because Step 2 has no observations");
  assert.strictEqual(s4.dropOffFromPrevPct, 0, "Step 4 is unchanged from the one session with explicit note confirmation");
  assert.strictEqual(s5.dropOffFromPrevPct, 100, "Step 5 drop-off is 100% (0 sessions from 1 session)");
  assert.strictEqual(s6.dropOffFromPrevPct, null, "Step 6 drop-off from 0 sessions is null");

  assert.strictEqual(s2.isBiggestDrop, true, "First complete 100% observed drop is highlighted");
  assert.strictEqual(s4.isBiggestDrop, false, "Missing predecessor evidence is not highlighted as a drop");

  console.log("   ✓ Later milestones do not fabricate missing earlier steps or rates");

  // =========================================================================
  // 4. ORIGIN / ATTRIBUTION MATRIX GROUPING
  // =========================================================================
  console.log("-> 4. Testing Origin & Attribution Matrix Grouping");

  const matrixTelemetry: WaterfallTelemetryEventInput[] = [
    // Meta session via fbclid
    {
      sessionId: "sess_meta_1",
      eventName: "landing_viewed",
      timestamp: tsNow,
      fbclid: "fb_meta_click_777",
      utmCampaign: "fall_special",
      deviceType: "mobile",
    },
    {
      sessionId: "sess_meta_1",
      eventName: "cover_preset_selected",
      timestamp: tsNow + 100,
    },
    // Google session via gclid
    {
      sessionId: "sess_google_1",
      eventName: "step_1_landed",
      timestamp: tsNow,
      gclid: "gclid_google_888",
      utmCampaign: "brand_search",
      deviceType: "desktop",
    },
    // Direct session (no UTMs)
    {
      sessionId: "sess_direct_1",
      eventName: "landing_viewed",
      timestamp: tsNow,
      utmSource: "direct",
      utmMedium: "none",
      deviceType: "desktop",
    },
  ];

  const matrixOrders: WaterfallOrderInput[] = [
    // Paid customer order attributed to Meta
    {
      id: "ord_meta_paid",
      createdAt: tsNow,
      amountInCents: 900,
      paymentMethod: "STRIPE",
      stripePaymentId: "pi_meta_paid_order",
      purchaseMeasurement: {
        version: 1,
        transactionId: "ord_meta_paid",
        amountInCents: 900,
        currency: "USD",
        verifiedAt: tsNow,
        eligible: true,
        reason: "eligible",
      },
      status: "MAILED",
      attribution: {
        fbclid: "fb_meta_click_777",
        campaign: "fall_special",
      },
    },
  ];

  const originReport = aggregateWaterfallReport({
    asOf: fixedClock,
    scope: baseScope,
    orders: matrixOrders,
    telemetry: matrixTelemetry,
  });

  const matrix = originReport.originMatrix;
  assert.ok(matrix.length >= 3, "Matrix must have at least 3 origin rows");

  const metaRow = matrix.find((r) => r.channel === "meta");
  const googleRow = matrix.find((r) => r.channel === "google");
  const directRow = matrix.find((r) => r.channel === "direct");

  assert.ok(metaRow, "Must have Meta origin row");
  assert.ok(googleRow, "Must have Google origin row");
  assert.ok(directRow, "Must have Direct origin row");

  assert.strictEqual(metaRow!.source, "meta");
  assert.strictEqual(metaRow!.medium, "paid_social");
  assert.strictEqual(metaRow!.campaign, "fall_special");
  assert.strictEqual(metaRow!.paidOrders, 1);
  assert.strictEqual(metaRow!.capturedRevenueCents, 900);
  assert.strictEqual(metaRow!.conversionRatePct, null, "Campaign similarity cannot replace the missing exact order/session link");
  assert.strictEqual(originReport.coverage.unmatchedPaidOrders, 1);

  assert.strictEqual(googleRow!.source, "google");
  assert.strictEqual(googleRow!.medium, "cpc");
  assert.strictEqual(googleRow!.campaign, "brand_search");
  assert.strictEqual(googleRow!.sessions, 1);
  assert.strictEqual(googleRow!.paidOrders, 0);

  assert.strictEqual(directRow!.source, "direct");
  assert.strictEqual(directRow!.medium, "none");
  assert.strictEqual(directRow!.sessions, 1);
  assert.strictEqual(directRow!.paidOrders, 0);

  console.log("   ✓ Origin matrix correctly attributes meta, google, direct, campaigns, and orders");

  // =========================================================================
  // 5. ABSENCE OF HARDCODED FAKE COGS / MARGINS & REAL AD SPEND HANDLING
  // =========================================================================
  console.log("-> 5. Testing Absence of Fake COGS/Margins and Real Ad Spend/CPA");

  // Verify schema outputs:
  const serialized = JSON.stringify(originReport);
  assert.strictEqual(serialized.includes('"cogs"'), false, "Must not contain fake 'cogs' property");
  assert.strictEqual(serialized.includes('"margin"'), false, "Must not contain fake 'margin' property");
  assert.strictEqual(serialized.includes("356"), false, "Must not contain hardcoded $3.56");
  assert.strictEqual(serialized.includes("42%"), false, "Must not contain hardcoded 42% margin");

  // When NO ad spend is recorded, recordedAdSpendCents and cpaCents must be null
  assert.strictEqual(originReport.kpis.recordedAdSpendCents, null, "Ad spend must be null when not logged");
  assert.strictEqual(originReport.kpis.cpaCents, null, "CPA must be null when ad spend is not logged");

  // When real ad spend IS recorded:
  const spendRecords: WaterfallAdSpendInput[] = [
    {
      date: "2026-10-25",
      channel: "meta",
      amountCents: 4500, // $45.00
    },
  ];

  const reportWithSpend = aggregateWaterfallReport({
    asOf: fixedClock,
    scope: baseScope,
    orders: matrixOrders, // 1 paid customer order
    telemetry: matrixTelemetry,
    adSpendRecords: spendRecords,
  });

  assert.strictEqual(reportWithSpend.kpis.recordedAdSpendCents, 4500, "Must sum recorded ad spend (4500 cents)");
  assert.strictEqual(reportWithSpend.kpis.cpaCents, 4500, "CPA must be $45.00 for 1 order ($45 / 1)");

  console.log("   ✓ Zero fake COGS or fabricated margins; ad spend and CPA strictly recorded or null");

  console.log("\n=================================================");
  console.log("✅ ALL ADMIN WATERFALL TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runAdminWaterfallTests().catch((err) => {
  console.error("❌ Test run failed:", err);
  process.exit(1);
});
