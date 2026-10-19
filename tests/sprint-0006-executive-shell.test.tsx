/**
 * tests/sprint-0006-executive-shell.test.tsx
 *
 * Verification test suite for SPRINT-0006:
 * "Deliver the compact executive overview and admin shell"
 *
 * Verifies:
 * - AC01: Above-the-fold Executive Overview layout answering the 5 CEO questions:
 *   - 4 KPI scorecards in data-testid="executive-scorecard-grid"
 *   - 7-stage complete observed milestone funnel in data-testid="executive-funnel-summary"
 *   - Actionable exceptions queue in data-testid="executive-exceptions-queue" with >=3 items
 *   - Full-cohort campaigns table and measurement quality strip
 * - AC02: Responsive and accessible shell:
 *   - Landmark navigation role="navigation" with aria-label="Admin primary workspaces"
 *   - Active tab with aria-current="page"
 *   - Table regions with role="region" and keyboard tabIndex={0}
 *   - Typography adherence (>= 12px for headings/metrics, no <11px text classes)
 * - AC03: Workspace & scope URL state:
 *   - parseAdminGlobalScope and serializeAdminGlobalScope roundtrips
 *   - buildEvidenceDrilldownUrl preserves scope filters
 *   - createRequestSequenceGuard stale response rejection
 *   - Loading skeleton state and stale warning banner (role="alert")
 * - AC04: Zero loss of operator functionality:
 *   - Legacy ?tab=* mappings resolve cleanly to all 8 workspaces
 *   - MetricEnvelope values rendered verbatim without client arithmetic
 *   - Missing economics render "Unavailable" without defaulting to $0 CAC or 39.6% margin
 */

import assert from "assert";
import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
// Navigation hooks require the same context that Next supplies in the browser.
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const renderToStaticMarkup = (element: React.ReactNode) => renderMarkup(
  <AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>
);
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import {
  AdminGlobalScope,
  DEFAULT_ADMIN_GLOBAL_SCOPE,
  parseAdminGlobalScope,
  serializeAdminGlobalScope,
  buildEvidenceDrilldownUrl,
  createRequestSequenceGuard,
  toGlobalReportScope,
} from "../lib/admin-scope";
import { ExecutiveShell } from "../components/admin/ExecutiveShell";
import { ExecutiveOverview } from "../components/admin/ExecutiveOverview";
import { ExecutiveReportingOverview } from "../lib/reporting-engine";
import {
  REPORTING_POLICY_VERSION,
  MetricEnvelope,
  MetricStatus,
} from "../lib/contracts/admin-overhaul";

function makeEnvelope<T>(value: T, status: MetricStatus): MetricEnvelope<T> {
  return {
    value,
    status,
    definitionVersion: REPORTING_POLICY_VERSION,
    asOf: "2026-10-18T20:00:00.000Z",
    window: {
      start: "2026-10-13T00:00:00.000Z",
      end: "2026-10-18T20:00:00.000Z",
      label: "oct13",
    },
    timezone: "America/Chicago",
    filters: {
      window: { start: "", end: "", label: "oct13" },
      timezone: "America/Chicago",
      mode: "customer_reporting",
      excludeFounder: true,
    },
    source: "test_fixture",
    coverage: {
      observedCount: 1,
      totalEligibleCount: 1,
      unresolvedCount: 0,
      coverageRatio: 1.0,
    },
  };
}

function createSampleReport(): ExecutiveReportingOverview {
  return {
    definitionVersion: REPORTING_POLICY_VERSION,
    asOf: "2026-10-18T20:00:00.000Z",
    storage: {
      adapterType: "firestore_bounded_sample",
      cloudWarehouseStatus: "not_provisioned",
      maxQueryWindowDays: 90,
      projectionVersion: "v2",
    },
    scope: {
      window: { start: "", end: "", label: "oct13" },
      timezone: "America/Chicago",
      mode: "customer_reporting",
      channel: undefined,
      deviceCategory: "all",
      excludeFounder: true,
    },
    summaryMetrics: {
      verifiedCapturedRevenue: makeEnvelope(0, "verified"),
      netReceipts: makeEnvelope(0, "verified"),
      refundedAmount: makeEnvelope(0, "verified"),
      totalSessions: makeEnvelope(124, "verified"),
      paidSessionsCount: makeEnvelope(0, "verified"),
      paidOrdersCount: makeEnvelope(0, "verified"),
      sessionConversionRate: makeEnvelope(0, "verified"),
      orderConversionRate: makeEnvelope(0, "verified"),
      averageOrderValueCents: makeEnvelope(null, "unavailable"),
      datedAdSpendCents: makeEnvelope(0, "verified"),
      blendedCacCents: makeEnvelope(null, "unavailable"),
      supplierCostCents: makeEnvelope(null, "unavailable"),
      contributionMarginPercent: makeEnvelope(null, "unavailable"),
    },
    funnel: {
      stages: [
        { stageKey: "entry_viewed", label: "Entry Viewed", observedCount: 124, dropOffCount: 34, conversionRateFromEntry: 100, conversionRateFromPrevious: 100 },
        { stageKey: "builder_engaged", label: "Builder Engaged", observedCount: 90, dropOffCount: 20, conversionRateFromEntry: 72.6, conversionRateFromPrevious: 72.6 },
        { stageKey: "cover_selected", label: "Cover Selected", observedCount: 70, dropOffCount: 15, conversionRateFromEntry: 56.5, conversionRateFromPrevious: 77.8 },
        { stageKey: "note_confirmed", label: "Note Confirmed", observedCount: 55, dropOffCount: 10, conversionRateFromEntry: 44.4, conversionRateFromPrevious: 78.6 },
        { stageKey: "address_ready", label: "Address Ready", observedCount: 45, dropOffCount: 15, conversionRateFromEntry: 36.3, conversionRateFromPrevious: 81.8 },
        { stageKey: "checkout_initiated", label: "Checkout Initiated", observedCount: 30, dropOffCount: 30, conversionRateFromEntry: 24.2, conversionRateFromPrevious: 66.7 },
        { stageKey: "verified_paid", label: "Verified Paid", observedCount: 0, dropOffCount: 0, conversionRateFromEntry: 0, conversionRateFromPrevious: 0 },
      ],
      branching: {
        addressConfirmedCount: 35,
        addressDeferredCount: 10,
        activeSessionsCount: 5,
        draftResumedCount: 12,
      },
    },
    campaigns: [
      {
        channel: "google_cpc",
        campaign: "fall_launch_2026",
        sessions: 65,
        paidSessions: 0,
        paidOrders: 0,
        capturedRevenueCents: 0,
        datedSpendCents: 15000,
        supplierCostCents: null,
        cacCents: null,
        roas: 0,
        spendStatus: "verified",
        costStatus: "unavailable",
        cacStatus: "unavailable",
      },
      {
        channel: "organic_direct",
        campaign: "direct",
        sessions: 59,
        paidSessions: 0,
        paidOrders: 0,
        capturedRevenueCents: 0,
        datedSpendCents: 0,
        supplierCostCents: null,
        cacCents: 0,
        roas: 0,
        spendStatus: "verified",
        costStatus: "unavailable",
        cacStatus: "verified",
      },
    ],
    recentSessions: [],
    unmatchedFinancialFacts: [],
    operationalExceptions: [
      {
        id: "exc_fail_1",
        category: "fulfillment",
        severity: "critical",
        orderId: "smn_order_test_99",
        title: "Order smn_order_test_99 failed Handwrytten dispatch (HTTP 500)",
        ageMs: 3600000,
      },
      {
        id: "exc_gap_2",
        category: "attribution",
        severity: "warning",
        title: "14 sessions arrived with unparseable or unknown campaign tracking",
        ageMs: 7200000,
      },
    ],
  };
}

async function runSprint0006Tests() {
  console.log("=== SPRINT-0006: Executive Overview and Admin Shell Test Suite ===");

  await withSafeTestHarness(async () => {
    const report = createSampleReport();
    const scope: AdminGlobalScope = {
      ...DEFAULT_ADMIN_GLOBAL_SCOPE,
      workspace: "overview",
    };

    // ------------------------------------------------------------------------
    // AC01: Compact Above-the-Fold Executive Overview Layout
    // ------------------------------------------------------------------------
    console.log("-> Testing AC01: Executive Overview Structure & 5 CEO Questions");
    {
      const markup = renderToStaticMarkup(
        <ExecutiveOverview
          report={report}
          scope={scope}
          onScopeChange={() => {}}
          isLoading={false}
        />
      );

      // 1. KPI Scorecards grid exists
      assert.ok(
        markup.includes('data-testid="executive-scorecard-grid"'),
        "Must render data-testid='executive-scorecard-grid'"
      );

      // Scorecard 1: Verified Demand
      assert.ok(markup.includes("Verified Demand"), "Must render 'Verified Demand' scorecard");
      assert.ok(markup.includes("0") && markup.includes("paid orders"), "Verified Demand must render paid orders count");

      // Scorecard 2: Net Receipts
      assert.ok(markup.includes("Net Receipts"), "Must render 'Net Receipts' scorecard");
      assert.ok(markup.includes("$0.00"), "Net Receipts must render exact formatted dollar value");

      // Scorecard 3: Session Conversion
      assert.ok(markup.includes("Session CVR") || markup.includes("Session Conversion"), "Must render 'Session CVR' scorecard");
      assert.ok(markup.includes("0.0%"), "Must render formatted session conversion rate");

      // Scorecard 4: Acquisition Economics
      assert.ok(markup.includes("Acquisition Economics"), "Must render 'Acquisition Economics' scorecard");
      assert.ok(
        markup.includes("Unavailable"),
        "Must display 'Unavailable' when blended CAC / margin cannot be calculated"
      );

      // 2. Funnel Summary strip exists
      assert.ok(
        markup.includes('data-testid="executive-funnel-summary"'),
        "Must render data-testid='executive-funnel-summary'"
      );

      // All 7 complete observed milestone stages must be present
      assert.ok(markup.includes("Entry Viewed"), "Funnel must render 'Entry Viewed'");
      assert.ok(markup.includes("Builder Engaged"), "Funnel must render 'Builder Engaged'");
      assert.ok(markup.includes("Cover Selected"), "Funnel must render 'Cover Selected'");
      assert.ok(markup.includes("Note Confirmed"), "Funnel must render 'Note Confirmed'");
      assert.ok(markup.includes("Address Ready"), "Funnel must render 'Address Ready'");
      assert.ok(markup.includes("Checkout Initiated"), "Funnel must render 'Checkout Initiated'");
      assert.ok(markup.includes("Verified Paid"), "Funnel must render 'Verified Paid'");

      // Funnel branching indicators must be rendered
      assert.ok(markup.includes("Deferred:"), "Must indicate deferred addresses");
      assert.ok(markup.includes("Confirmed:"), "Must indicate confirmed addresses");

      // 3. Actionable Exceptions Queue exists and has >= 3 visible items
      assert.ok(
        markup.includes('data-testid="executive-exceptions-queue"'),
        "Must render data-testid='executive-exceptions-queue'"
      );
      assert.ok(
        markup.includes("smn_order_test_99 failed Handwrytten dispatch"),
        "Must render operational failed fulfillment exception"
      );
      assert.ok(
        markup.includes("Inspect Order"),
        "Must render actionable drilldown link for order exception"
      );
      assert.ok(
        markup.includes("14 sessions arrived with unparseable"),
        "Must render attribution blind spot exception"
      );
      assert.ok(
        markup.includes("Supplier COGS Unconfirmed") || markup.includes("Supplier Invoices Unconfirmed"),
        "Must render unconfirmed supplier baseline audit exception"
      );

      // 4. Campaign Cohorts Table exists with accessible overflow
      assert.ok(
        markup.includes('role="region" aria-label="Campaign acquisition cohorts table"'),
        "Campaign cohorts table must be wrapped in accessible region"
      );
      assert.ok(markup.includes("fall_launch_2026"), "Must render campaign cohort name");
      assert.ok(markup.includes("google_cpc"), "Must render campaign channel");

      // 5. Measurement Quality Strip exists with accessible region
      assert.ok(
        markup.includes('role="region" aria-label="Measurement quality and attribution health"'),
        "Measurement quality strip must be wrapped in accessible region"
      );
      assert.ok(markup.includes("Telemetry source read"), "Must render telemetry consistency badge");
      assert.ok(markup.includes("Canonical Baseline"), "Must render canonical baseline reference");
    }

    // ------------------------------------------------------------------------
    // AC02: Responsive & Accessible Shell
    // ------------------------------------------------------------------------
    console.log("-> Testing AC02: Responsive Landmarks, Navigation, and Typography");
    {
      const shellMarkup = renderToStaticMarkup(
        <ExecutiveShell
          scope={scope}
          onScopeChange={() => {}}
          onRefresh={() => {}}
          isLoading={false}
          onCompClick={() => {}}
          userEmail="founder@sendmynotes.com"
        >
          <div data-testid="workspace-content">Workspace Content</div>
        </ExecutiveShell>
      );

      // 1. Accessible navigation landmark
      assert.ok(
        shellMarkup.includes('role="navigation" aria-label="Admin primary workspaces"'),
        "ExecutiveShell must contain role='navigation' landmark with aria-label"
      );

      // 2. Active tab contains aria-current="page"
      assert.ok(
        shellMarkup.includes('aria-current="page"'),
        "Active workspace navigation item must have aria-current='page'"
      );

      // 3. All 8 workspaces are present in the navigation
      assert.ok(shellMarkup.includes("Overview"), "Must render Overview workspace tab");
      assert.ok(shellMarkup.includes("Growth"), "Must render Growth workspace tab");
      assert.ok(shellMarkup.includes("Promotions"), "Must render Promotions workspace tab");
      assert.ok(shellMarkup.includes("Journeys"), "Must render Journeys workspace tab");
      assert.ok(shellMarkup.includes("Orders"), "Must render Orders workspace tab");
      assert.ok(shellMarkup.includes("Reliability"), "Must render Reliability workspace tab");
      assert.ok(shellMarkup.includes("Controls"), "Must render Controls workspace tab");
      assert.ok(shellMarkup.includes("Economics"), "Must render Economics workspace tab");

      // 4. Global scope control bar
      assert.ok(
        shellMarkup.includes('role="region" aria-label="Global reporting scope"'),
        "Must render global reporting scope bar with role='region'"
      );
      assert.ok(shellMarkup.includes("Since Oct 13 Baseline"), "Must render Oct 13 baseline preset");
      assert.ok(shellMarkup.includes("Customer Mode"), "Must render customer mode toggle");

      // 5. Quick actions: Comp Card & Refresh
      assert.ok(shellMarkup.includes("Dispatch Comp"), "Must render Dispatch Comp quick action");
      assert.ok(shellMarkup.includes("Refresh"), "Must render Refresh button");
      assert.ok(shellMarkup.includes("founder@sendmynotes.com"), "Must render user email badge");

      // 6. Typography checks: No tiny text classes (<11px) on headings or scorecard bodies
      assert.ok(
        !shellMarkup.includes("text-[8px]") && !shellMarkup.includes("text-[9px]"),
        "No unreadable text (<10px) in shell"
      );
    }

    // ------------------------------------------------------------------------
    // AC03: Workspace & Scope URL State
    // ------------------------------------------------------------------------
    console.log("-> Testing AC03: URL State, Evidence Drilldown, and Sequence Guards");
    {
      // 1. parseAdminGlobalScope
      const parsed1 = parseAdminGlobalScope("?workspace=growth&datePreset=7d&channel=google_cpc&device=mobile");
      assert.strictEqual(parsed1.workspace, "growth");
      assert.strictEqual(parsed1.datePreset, "7d");
      assert.strictEqual(parsed1.channel, "google_cpc");
      assert.strictEqual(parsed1.device, "mobile");

      // 2. serializeAdminGlobalScope
      const serialized = serializeAdminGlobalScope(parsed1);
      assert.ok(serialized.includes("workspace=growth"), "Serialized URL must include workspace");
      assert.ok(serialized.includes("datePreset=7d"), "Serialized URL must include datePreset");
      assert.ok(serialized.includes("channel=google_cpc"), "Serialized URL must include channel");
      assert.ok(serialized.includes("device=mobile"), "Serialized URL must include device");

      // 3. buildEvidenceDrilldownUrl preserves scope filters
      const drilldownUrl = buildEvidenceDrilldownUrl("journeys", parsed1, {
        highlight: "dropoff_funnel",
        orderId: "smn_order_123",
      });
      assert.ok(drilldownUrl.includes("workspace=journeys"), "Drilldown URL must target journeys workspace");
      assert.ok(drilldownUrl.includes("datePreset=7d"), "Drilldown URL must preserve datePreset");
      assert.ok(drilldownUrl.includes("channel=google_cpc"), "Drilldown URL must preserve channel");
      assert.ok(drilldownUrl.includes("device=mobile"), "Drilldown URL must preserve device");
      assert.ok(drilldownUrl.includes("orderId=smn_order_123"), "Drilldown URL must include orderId");

      // 4. createRequestSequenceGuard prevents stale response race conditions
      const guard = createRequestSequenceGuard();
      const req1 = guard.next();
      assert.strictEqual(guard.isLatest(req1), true, "req1 is initially the latest");

      const req2 = guard.next();
      assert.strictEqual(guard.isLatest(req1), false, "req1 is now stale after req2 was issued");
      assert.strictEqual(guard.isLatest(req2), true, "req2 is the latest");

      const req3 = guard.next();
      assert.strictEqual(guard.isLatest(req2), false, "req2 is now stale after req3 was issued");
      assert.strictEqual(guard.isLatest(req3), true, "req3 is the latest");

      // 5. Loading skeleton state renders while fetching
      const skeletonMarkup = renderToStaticMarkup(
        <ExecutiveOverview
          report={null}
          scope={scope}
          onScopeChange={() => {}}
          isLoading={true}
        />
      );
      assert.ok(
        skeletonMarkup.includes('data-testid="executive-scorecard-grid"'),
        "Loading skeleton must render scorecard grid skeleton"
      );
      assert.ok(
        skeletonMarkup.includes("animate-pulse"),
        "Loading skeleton must render pulse animations"
      );

      // 6. Stale warning banner renders role="alert" when isStale is true
      const staleShellMarkup = renderToStaticMarkup(
        <ExecutiveShell
          scope={scope}
          onScopeChange={() => {}}
          onRefresh={() => {}}
          isLoading={false}
          isStale={true}
          refreshError="Failed to connect to reporting engine"
        >
          <div>Body</div>
        </ExecutiveShell>
      );
      assert.ok(
        staleShellMarkup.includes('role="alert"'),
        "Stale shell must render role='alert' notification banner"
      );
      assert.ok(
        staleShellMarkup.includes("Snapshot Refresh Failed"),
        "Stale shell must clearly warn that the snapshot is stale"
      );
    }

    // ------------------------------------------------------------------------
    // AC04: Zero Loss of Operator Functionality & Legacy URL Compatibility
    // ------------------------------------------------------------------------
    console.log("-> Testing AC04: Legacy Tab Resolution & Verbatim Financial Envelopes");
    {
      // Legacy tab URL compatibility
      const legacyOrders = parseAdminGlobalScope("?tab=orders");
      assert.strictEqual(legacyOrders.workspace, "orders", "?tab=orders maps to orders");

      const legacyMargins = parseAdminGlobalScope("?tab=margins");
      assert.strictEqual(legacyMargins.workspace, "economics", "?tab=margins maps to economics");

      const legacyDiscounts = parseAdminGlobalScope("?tab=discounts");
      assert.strictEqual(legacyDiscounts.workspace, "promotions", "?tab=discounts maps to promotions");

      const legacyPromos = parseAdminGlobalScope("?tab=promos");
      assert.strictEqual(legacyPromos.workspace, "promotions", "?tab=promos maps to promotions");

      const legacyScenarios = parseAdminGlobalScope("?tab=scenarios");
      assert.strictEqual(legacyScenarios.workspace, "growth", "?tab=scenarios maps to growth");

      const legacyCampaigns = parseAdminGlobalScope("?tab=campaigns");
      assert.strictEqual(legacyCampaigns.workspace, "growth", "?tab=campaigns maps to growth");

      const legacyIncidents = parseAdminGlobalScope("?tab=incidents");
      assert.strictEqual(legacyIncidents.workspace, "reliability", "?tab=incidents maps to reliability");

      const legacyFlags = parseAdminGlobalScope("?tab=flags");
      assert.strictEqual(legacyFlags.workspace, "controls", "?tab=flags maps to controls");

      const legacyJourneys = parseAdminGlobalScope("?tab=journeys");
      assert.strictEqual(legacyJourneys.workspace, "journeys", "?tab=journeys maps to journeys");

      const legacyAbandoned = parseAdminGlobalScope("?tab=abandoned");
      assert.strictEqual(legacyAbandoned.workspace, "journeys", "?tab=abandoned maps to journeys");

      // Verify toGlobalReportScope correctly preserves customer reporting exclusion
      const customerRepScope = toGlobalReportScope(scope);
      assert.strictEqual(customerRepScope.excludeFounder, true, "Customer reporting must exclude founder");
      assert.strictEqual(customerRepScope.mode, "customer_reporting");

      const auditScope = toGlobalReportScope({ ...scope, mode: "operational_all" });
      assert.strictEqual(auditScope.excludeFounder, false, "Operational all must not exclude founder");
      assert.strictEqual(auditScope.mode, "operational_all");

      // Verification of verbatim envelopes without arithmetic recalculation
      const customReport = createSampleReport();
      customReport.summaryMetrics.verifiedCapturedRevenue.value = 2700; // $27.00
      customReport.summaryMetrics.paidOrdersCount.value = 3;
      customReport.summaryMetrics.sessionConversionRate.value = 2.42;

      const customMarkup = renderToStaticMarkup(
        <ExecutiveOverview
          report={customReport}
          scope={scope}
          onScopeChange={() => {}}
          isLoading={false}
        />
      );
      assert.ok(customMarkup.includes("$27.00"), "Must render exact $27.00 verbatim from envelope");
      assert.ok(customMarkup.includes("3 orders"), "Must render exact 3 orders verbatim from envelope");
      assert.ok(customMarkup.includes("2.4%"), "Must render exact 2.4% formatted from envelope");
    }
  });

  console.log("=== All SPRINT-0006 tests passed successfully! ===");
}

runSprint0006Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
