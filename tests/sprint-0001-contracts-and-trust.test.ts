import assert from "node:assert";
import {
  REPORTING_POLICY_VERSION,
  SESSION_INACTIVITY_WINDOW_MS,
  ACTIVE_JOURNEY_THRESHOLD_MS,
  SESSION_CONVERSION_HORIZON_MS,
  ATTRIBUTION_LOOKBACK_WINDOW_MS,
  DEFAULT_ADMIN_TIMEZONE,
  MAX_ACTIVE_OFFERS_PER_ORDER,
  REFUND_RESTORES_OFFER_USAGE,
  LEGACY_OFFER_URL_PARAMS,
  isFinancialAuthorityEventV2,
  isBrowserAllowedEventV2,
  classifyAcquisitionChannel,
} from "../lib/contracts/admin-overhaul";
import { GOLDEN_FIXTURES } from "../lib/contracts/golden-fixtures";
import {
  withSafeTestHarness,
  getBlockedExternalCalls,
  ExternalEffectDeniedError,
} from "../lib/testing/safe-harness";
import {
  isAuthorityEvent,
  isVerifiedServerPaymentEvent,
  ALLOWED_BROWSER_EVENT_NAMES,
} from "../lib/telemetry-schema";
import {
  ingestTelemetryEvent,
  getAdminDashboardMetrics,
  matchesChannelFilter,
  isExcludedOrderCohort,
  FOUNDER_REGISTRY_CONFIG_KEY,
} from "../lib/metrics-rollup";
import { getOrdersCollection, setSystemConfig } from "../lib/firebase-admin";
import { Order, TelemetryEvent } from "../lib/types";

async function runSprint0001Tests() {
  console.log("==========================================================");
  console.log("🧪 SPRINT-0001: CONTRACTS, TRUST & SAFE HARNESS TEST SUITE");
  console.log("==========================================================\n");

  await withSafeTestHarness(async () => {
    // -------------------------------------------------------------------------
    // AC01: Frozen Shared Contracts & Golden Fixtures
    // -------------------------------------------------------------------------
    console.log("1️⃣  Verifying SPRINT-0001-AC01 (Frozen Contracts & Golden Fixtures)...");
    assert.strictEqual(REPORTING_POLICY_VERSION, "2026-10-18.v1");
    assert.strictEqual(SESSION_INACTIVITY_WINDOW_MS, 30 * 60 * 1000);
    assert.strictEqual(ACTIVE_JOURNEY_THRESHOLD_MS, 5 * 60 * 1000);
    assert.strictEqual(SESSION_CONVERSION_HORIZON_MS, 24 * 60 * 60 * 1000);
    assert.strictEqual(ATTRIBUTION_LOOKBACK_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
    assert.strictEqual(DEFAULT_ADMIN_TIMEZONE, "America/Chicago");
    assert.strictEqual(MAX_ACTIVE_OFFERS_PER_ORDER, 1);
    assert.strictEqual(REFUND_RESTORES_OFFER_USAGE, false);
    assert.deepStrictEqual([...LEGACY_OFFER_URL_PARAMS], ["discount", "code", "promo"]);

    assert.strictEqual(Object.keys(GOLDEN_FIXTURES).length, 9);
    assert.ok(GOLDEN_FIXTURES.scen_founder_mobile_ad);
    assert.ok(GOLDEN_FIXTURES.scen_ultrawide_customer);
    assert.ok(GOLDEN_FIXTURES.scen_browser_paid_alias_forgery);
    assert.ok(GOLDEN_FIXTURES.scen_paid_fulfillment_failed);
    assert.ok(GOLDEN_FIXTURES.scen_paid_address_deferred);
    assert.ok(GOLDEN_FIXTURES.scen_skipped_funnel_stages);
    assert.ok(GOLDEN_FIXTURES.scen_unknown_cost_and_zero_spend);
    assert.ok(GOLDEN_FIXTURES.scen_historical_unresolved_order);
    assert.ok(GOLDEN_FIXTURES.scen_concurrent_last_slot_offer);

    assert.strictEqual(isFinancialAuthorityEventV2("payment_captured"), true);
    assert.strictEqual(isFinancialAuthorityEventV2("payment_confirmation_observed"), false);
    assert.strictEqual(isBrowserAllowedEventV2("payment_captured"), false);
    assert.strictEqual(isBrowserAllowedEventV2("payment_confirmation_observed"), true);
    console.log("   ✅ AC01 passed: All 5 shared contracts and 9 golden fixtures verified.\n");

    // -------------------------------------------------------------------------
    // AC02: Financial Alias Closure, Founder Precedence & Note Privacy
    // -------------------------------------------------------------------------
    console.log("2️⃣  Verifying SPRINT-0001-AC02 (Financial Aliases, Founder Filter & Privacy)...");
    assert.strictEqual(isAuthorityEvent("step_6_paid_order"), true);
    assert.strictEqual(isAuthorityEvent("payment_captured"), true);
    assert.strictEqual(isAuthorityEvent("payment_refunded"), true);
    assert.strictEqual(isAuthorityEvent("payment_disputed"), true);
    assert.strictEqual(ALLOWED_BROWSER_EVENT_NAMES.has("payment_confirmation_observed"), true);
    assert.strictEqual(isVerifiedServerPaymentEvent("step_6_paid_order", "/api/server"), false);
    assert.strictEqual(isVerifiedServerPaymentEvent("purchase_verified", "/checkout"), false);
    assert.strictEqual(isVerifiedServerPaymentEvent("purchase_verified", "/api/server"), true);
    assert.strictEqual(isVerifiedServerPaymentEvent("payment_succeeded", "/api/server"), true);

    // Email substring heuristics must NOT exclude real customers named "founder" or "zeke"
    assert.strictEqual(
      isExcludedOrderCohort({
        id: "ord_real_customer_email",
        customerEmail: "zeke.customer@example.com",
        isTest: false,
        isComp: false,
        isFounderTest: false,
        paymentMode: "live",
        paymentMethod: "STRIPE",
      }),
      false,
      "Customer email containing 'zeke' must not be excluded by substring heuristic"
    );

    const baseTs = Date.now() + 50_000;
    const windowFrom = baseTs - 1000;
    const windowTo = baseTs + 50_000;

    await setSystemConfig(FOUNDER_REGISTRY_CONFIG_KEY, {
      clientIds: ["cid_founder_registered"],
      sessionIds: ["sess_founder_registered"],
    });

    // 2a. Browser forgery session attempting step_6_paid_order & payment_confirmation_observed
    const forgerySessionId = `sess_forgery_${baseTs}`;
    const forgeryEvents: TelemetryEvent[] = [
      {
        id: `evt_forgery_1_${baseTs}`,
        sessionId: forgerySessionId,
        eventName: "step_1_landed",
        step: 1,
        path: "/",
        timestamp: baseTs + 100,
        createdAt: baseTs + 100,
      },
      {
        id: `evt_forgery_6_${baseTs}`,
        sessionId: forgerySessionId,
        eventName: "step_6_paid_order",
        step: 5,
        path: "/checkout",
        timestamp: baseTs + 200,
        createdAt: baseTs + 200,
      },
      {
        id: `evt_forgery_obs_${baseTs}`,
        sessionId: forgerySessionId,
        eventName: "payment_confirmation_observed",
        step: 5,
        path: "/checkout/confirmation",
        timestamp: baseTs + 300,
        createdAt: baseTs + 300,
      },
    ];
    for (const evt of forgeryEvents) {
      await ingestTelemetryEvent(evt);
    }

    // 2b. Founder on mobile with gclid/Meta tags (must be EXCLUDED when excludeFounder: true)
    const founderMobileSessionId = `sess_founder_mobile_${baseTs}`;
    await ingestTelemetryEvent({
      id: `evt_fnd_mob_${baseTs}`,
      sessionId: founderMobileSessionId,
      clientId: "cid_founder_registered",
      eventName: "step_1_landed",
      step: 1,
      path: "/send/birthday",
      timestamp: baseTs + 400,
      createdAt: baseTs + 400,
      deviceType: "mobile",
      screenResolution: "390x844",
      utmSource: "meta",
      utmMedium: "paid_social",
      gclid: "gclid_founder_mobile_test",
      isFounder: true,
      is_founder: true,
    });

    // 2c. Real customer on 3440x1440 ultrawide desktop (must be INCLUDED when excludeFounder: true)
    const ultrawideCustomerSessionId = `sess_ultrawide_cust_${baseTs}`;
    await ingestTelemetryEvent({
      id: `evt_uw_cust_${baseTs}`,
      sessionId: ultrawideCustomerSessionId,
      clientId: "cid_independent_ultrawide",
      eventName: "step_1_landed",
      step: 1,
      path: "/",
      timestamp: baseTs + 500,
      createdAt: baseTs + 500,
      deviceType: "desktop",
      screenResolution: "3440x1440",
      isFounder: false,
      is_founder: false,
    });

    // 2d. Seed orders in window:
    // - Order with missing amountInCents (must not default to $9.00, must be tracked in unresolvedOrderCount)
    // - Order with commercialKind = "unresolved_historical" (must be tracked in unresolvedOrderCount & unresolvedRevenueCents)
    // - Order with private handwrittenNote containing "Birthday" & "Christmas" but no occasion field (must be "Unspecified")
    const ordersCol = getOrdersCollection();
    await ordersCol.doc(`ord_missing_amt_${baseTs}`).set({
      id: `ord_missing_amt_${baseTs}`,
      status: "MAILED",
      paymentMode: "live",
      paymentMethod: "STRIPE",
      handwrittenNote: "Happy Birthday and Merry Christmas private letter body!",
      createdAt: baseTs + 600,
      updatedAt: baseTs + 600,
    } as Partial<Order>);

    await ordersCol.doc(`ord_unresolved_hist_${baseTs}`).set({
      id: `ord_unresolved_hist_${baseTs}`,
      status: "MAILED",
      paymentMode: "live",
      paymentMethod: "STRIPE",
      amountInCents: 900,
      commercialKind: "unresolved_historical",
      handwrittenNote: "Thank you for everything!",
      createdAt: baseTs + 700,
      updatedAt: baseTs + 700,
    } as any);

    await setSystemConfig("admin_ad_spend", { amountCents: 0 });

    const metrics = await getAdminDashboardMetrics({
      dateRange: "custom",
      customFrom: windowFrom,
      customTo: windowTo,
      excludeFounder: true,
      channel: "all",
    });

    assert.ok(metrics.visitorTelemetry, "visitorTelemetry must be defined");
    assert.ok(metrics.margins, "margins must be defined");
    assert.ok(metrics.occasionPopularity, "occasionPopularity must be defined");

    // Verify browser paid alias did NOT create any paid conversions
    const stage7 = metrics.visitorTelemetry.funnelLeaks.find((f) => f.stepNumber === 7);
    assert.strictEqual(stage7?.visitors, 0, "Browser step_6_paid_order / payment_confirmation_observed must never increment Stage 7 Paid & Penned");
    assert.strictEqual(metrics.margins.paidCardsCount, 0, "No verified paid cards should exist in window");
    assert.strictEqual(metrics.margins.grossRevenueCents, 0, "Gross revenue must be 0 when only missing-amount or unresolved orders exist");
    assert.strictEqual(metrics.unresolvedOrderCount, 2, "Missing-amount and unresolved_historical orders must be counted in unresolvedOrderCount");
    assert.strictEqual(metrics.unresolvedRevenueCents, 900, "Unresolved historical order amount must be tracked in unresolvedRevenueCents");

    // Verify founder mobile/ad session was excluded and ultrawide customer was included
    const sessionIdsInWindow = new Set(metrics.visitorTelemetry.recentSessions.map((s) => s.sessionId));
    assert.strictEqual(sessionIdsInWindow.has(founderMobileSessionId), false, "Founder mobile/ad session must be excluded when excludeFounder=true");
    assert.strictEqual(sessionIdsInWindow.has(ultrawideCustomerSessionId), true, "Ultrawide 3440x1440 customer session must be included");

    // Verify private note text was NOT inspected for occasion analytics
    const occasions = new Map(metrics.occasionPopularity.map((o) => [o.occasion, o.count]));
    assert.strictEqual(occasions.get("Birthday"), undefined, "Private handwrittenNote text must not be inspected for Birthday occasion");
    assert.strictEqual(occasions.get("Holiday"), undefined, "Private handwrittenNote text must not be inspected for Holiday occasion");
    assert.strictEqual(occasions.get("Thank You"), undefined, "Private handwrittenNote text must not be inspected for Thank You occasion");
    assert.strictEqual(occasions.get("Unspecified"), 2, "Orders without explicit occasion field must be grouped as Unspecified");
    console.log("   ✅ AC02 passed: Browser alias closed, founder precedence fixed, note privacy preserved.\n");

    // -------------------------------------------------------------------------
    // AC03: Honest Unknown Cost/Spend States & Meta Channel Normalization
    // -------------------------------------------------------------------------
    console.log("3️⃣  Verifying SPRINT-0001-AC03 (Honest Zero-State Economics & Meta Classification)...");
    assert.strictEqual(metrics.margins.netContributionMarginPercent, 0, "Zero-revenue margin percent must be 0, never 39.6");
    assert.strictEqual(metrics.margins.targetBreakevenCpaDollars, 0, "Zero-revenue breakeven CPA must be 0, never 3.56");
    assert.strictEqual(metrics.margins.costStatus, "unconfirmed");
    assert.strictEqual(metrics.margins.marginStatus, "unavailable");
    assert.strictEqual(metrics.margins.spendStatus, "missing");
    assert.strictEqual(metrics.funnelMode, "legacy_inferred");

    await setSystemConfig("admin_ad_spend", { amountCents: 2500 });
    const metricsWithScalarSpend = await getAdminDashboardMetrics({
      dateRange: "custom",
      customFrom: windowFrom,
      customTo: windowTo,
      excludeFounder: true,
      channel: "all",
    });
    assert.strictEqual(metricsWithScalarSpend.margins?.spendStatus, "unverified_scalar");
    await setSystemConfig("admin_ad_spend", { amountCents: 0 });

    // Meta Paid vs Organic Social with fbclid
    const metaPaidClass = classifyAcquisitionChannel({
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "launch_q4",
      fbclid: "fbclid_paid_123",
    });
    assert.strictEqual(metaPaidClass.channel, "Meta Paid");
    assert.strictEqual(metaPaidClass.isPaidVerified, true);
    assert.strictEqual(matchesChannelFilter("meta_paid", "meta", "paid_social", "launch_q4", undefined, "fbclid_paid_123"), true);
    assert.strictEqual(matchesChannelFilter("paid", "meta", "paid_social", "launch_q4", undefined, "fbclid_paid_123"), true);

    const fbclidOnlyOrganic = classifyAcquisitionChannel({
      fbclid: "fbclid_organic_share_only",
    });
    assert.strictEqual(fbclidOnlyOrganic.channel, "Organic Social");
    assert.strictEqual(fbclidOnlyOrganic.isPaidVerified, false);
    assert.strictEqual(matchesChannelFilter("meta_paid", undefined, undefined, undefined, undefined, "fbclid_organic_share_only"), false);
    assert.strictEqual(matchesChannelFilter("paid", undefined, undefined, undefined, undefined, "fbclid_organic_share_only"), false);
    assert.strictEqual(matchesChannelFilter("organic_direct", undefined, undefined, undefined, undefined, "fbclid_organic_share_only"), true);
    console.log("   ✅ AC03 passed: Honest zero/unknown states and Meta Paid vs Organic Social classification verified.\n");

    // -------------------------------------------------------------------------
    // AC04: Safe Test Harness External Side-Effect Denial
    // -------------------------------------------------------------------------
    console.log("4️⃣  Verifying SPRINT-0001-AC04 (Safe Test Harness Outbound Protection)...");
    const forbiddenEndpoints = [
      "https://api.handwrytten.com/v1/orders/singleStepOrder",
      "https://api.stripe.com/v1/payment_intents",
      "https://api.resend.com/emails",
      "https://graph.facebook.com/v18.0/12345/events",
    ];
    for (const url of forbiddenEndpoints) {
      let threw = false;
      try {
        await fetch(url, { method: "POST" });
      } catch (err) {
        if (err instanceof ExternalEffectDeniedError) {
          threw = true;
        }
      }
      assert.strictEqual(threw, true, `Safe harness must block outbound call to ${url}`);
    }
    const blockedCalls = getBlockedExternalCalls();
    assert.strictEqual(blockedCalls.length, 4, "All 4 forbidden outbound calls must be recorded");
    console.log("   ✅ AC04 passed: Outbound Handwrytten, Stripe, Resend, and Meta calls blocked and audited.\n");
  });

  console.log("🎉 ALL SPRINT-0001 ACCEPTANCE CRITERIA PASSED!");
}

runSprint0001Tests().catch((err) => {
  console.error("❌ SPRINT-0001 TEST FAILED:", err);
  process.exit(1);
});
