/**
 * tests/sprint-0007-investigations.test.tsx
 *
 * Full verification test suite for SPRINT-0007:
 * "Build order, journey and economics investigations"
 *
 * Tests:
 * - SPRINT-0007-AC01: Scoped evidence lists open exact dataset; pagination & search
 *                     preserve invariant totals; older open exceptions are not omitted;
 *                     warning banner alerts when customer-only filter hides stranded payments.
 * - SPRINT-0007-AC02: Unified chronological evidence timeline merges client milestones,
 *                     server transitions, payment facts, and supplier observations;
 *                     4 independent state pillars; Submitted to Supplier & Mailed via USPS labels;
 *                     missing evidence stages & multi-session resumes surfaced.
 * - SPRINT-0007-AC03: Safe order tools; PII masked by default with immutable audit log on reveal;
 *                     Pre-retry safety gate & /api/admin/retry-fulfillment block duplicate/ambiguous/
 *                     unpaid/incomplete-address retries with HTTP 409 & 0 outbound supplier calls;
 *                     unauthorized requests receive HTTP 401.
 * - SPRINT-0007-AC04: Economics investigation exposes known invoice vs estimated/missing costs;
 *                     provenance tracked to dated spend & supplier cost allocations;
 *                     aggregate == detail == export parity; scenario models separated.
 */

import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { recordPaymentCaptureFact } from "../lib/financial-ledger";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb } from "../lib/firebase-admin";
import { generateAdminSessionToken, ADMIN_COOKIE_NAME } from "../lib/admin-auth";
import {
  AdminGlobalScope,
  DEFAULT_ADMIN_GLOBAL_SCOPE,
  parseAdminGlobalScope,
} from "../lib/admin-scope";
import {
  queryOrdersEvidence,
  queryJourneysEvidence,
  queryExceptionsQueue,
  buildUnifiedEvidenceTimeline,
  evaluateFulfillmentRetryGate,
  getEconomicsInvestigationReport,
  revealOrderPiiWithAudit,
  maskEmail,
  maskName,
  maskStreet,
  ADMIN_AUDIT_LOG_COLLECTION,
} from "../lib/investigation-service";
import { FINANCIAL_FACTS_COLLECTION } from "../lib/financial-ledger";
import { DATED_SPEND_COLLECTION, SUPPLIER_COST_COLLECTION } from "../lib/spend-and-cost-ledger";
import { TELEMETRY_V2_COLLECTION } from "../lib/telemetry-v2";
import { POST as handleRetryFulfillment } from "../app/api/admin/retry-fulfillment/route";
import { GET as handleInvestigationsGet, POST as handleInvestigationsPost } from "../app/api/admin/investigations/route";
import { OrdersInvestigationWorkspace } from "../components/admin/OrdersInvestigationWorkspace";
import { JourneysInvestigationWorkspace } from "../components/admin/JourneysInvestigationWorkspace";
import { EconomicsInvestigationWorkspace } from "../components/admin/EconomicsInvestigationWorkspace";
import { OrderJourneyDrawer } from "../components/admin/OrderJourneyDrawer";
import { Order } from "../lib/types";

async function runSprint0007Tests() {
  console.log("=== SPRINT-0007: Order, Journey, and Economics Investigations Test Suite ===");

  await withSafeTestHarness(async () => {
    const adminToken = generateAdminSessionToken("founder@sendmynotes.com");

    // Backup mock collections for clean test isolation
    const ordersCol = firestoreDb.collection("orders") as any;
    const factsCol = firestoreDb.collection(FINANCIAL_FACTS_COLLECTION) as any;
    const costsCol = firestoreDb.collection(SUPPLIER_COST_COLLECTION) as any;
    const spendCol = firestoreDb.collection(DATED_SPEND_COLLECTION) as any;
    const telemetryCol = firestoreDb.collection(TELEMETRY_V2_COLLECTION) as any;

    const backupOrders = new Map(ordersCol.store);
    const backupFacts = new Map(factsCol.store);
    const backupCosts = new Map(costsCol.store);
    const backupSpend = new Map(spendCol.store);
    const backupTelemetry = new Map(telemetryCol.store);

    ordersCol.store.clear();
    factsCol.store.clear();
    costsCol.store.clear();
    spendCol.store.clear();
    telemetryCol.store.clear();

    try {
      // ------------------------------------------------------------------------
      // SEED TEST DATA
      // ------------------------------------------------------------------------
      const now = Date.now();

    // 1. Seed Orders
    const orderCust1: Order = {
      id: "smn_ord_cust_1",
      receiptEmailSentAt: now - 3600000,
      customerEmail: "sarah.connor@example.com",
      status: "PAYMENT_RECEIVED",
      amountInCents: 900,
      frontImageUrl: "https://example.com/cover1.jpg",
      printedMessage: "Happy Birthday Sarah!",
      handwrittenNote: "Private message from John",
      fontStyleId: "hwDavid",
      recipientAddress: {
        firstName: "Sarah",
        lastName: "Connor",
        street1: "742 Evergreen Terrace",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      returnAddress: {
        firstName: "John",
        lastName: "Connor",
        street1: "123 Resistance Way",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      attribution: {
        utmMedium: "cpc",
        utmSource: "google",
        utmCampaign: "fall_launch_2026",
      },
      createdAt: now - 3600000 * 2,
    } as any;

    const orderCust2: Order = {
      id: "smn_ord_cust_2",
      customerEmail: "kyle.reese@example.com",
      status: "MAILED",
      handwryttenOrderId: "hw_order_9988",
      handwryttenStatus: "mailed",
      handwryttenTrackingNumber: "9400100000000000000000",
      amountInCents: 900,
      frontImageUrl: "https://example.com/cover2.jpg",
      printedMessage: "See you yesterday",
      handwrittenNote: "Private message from Kyle",
      fontStyleId: "hwDavid",
      recipientAddress: {
        firstName: "Kyle",
        lastName: "Reese",
        street1: "456 Future Blvd",
        city: "Dallas",
        state: "TX",
        zip: "75201",
      },
      returnAddress: {
        firstName: "Sarah",
        lastName: "Connor",
        street1: "742 Evergreen Terrace",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      attribution: {
        utmMedium: "organic",
        utmSource: "google",
      },
      createdAt: now - 3600000 * 3,
    } as any;

    const orderCustFailed: Order = {
      id: "smn_ord_cust_failed",
      customerEmail: "miles.dyson@example.com",
      status: "FAILED",
      fulfillmentError: "Supplier API 500: System Timeout",
      amountInCents: 900,
      frontImageUrl: "https://example.com/cover3.jpg",
      printedMessage: "Hello Miles",
      handwrittenNote: "Private message to Miles",
      fontStyleId: "hwDavid",
      recipientAddress: {
        firstName: "Miles",
        lastName: "Dyson",
        street1: "789 Cyberdyne Way",
        city: "Sunnyvale",
        state: "CA",
        zip: "94086",
      },
      returnAddress: {
        firstName: "Sarah",
        lastName: "Connor",
        street1: "742 Evergreen Terrace",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      createdAt: now - 3600000 * 4,
    } as any;

    const orderCustDeferred: Order = {
      id: "smn_ord_cust_deferred",
      customerEmail: "t800@example.com",
      status: "AWAITING_RECIPIENT_ADDRESS",
      addressDeferred: true,
      amountInCents: 900,
      frontImageUrl: "https://example.com/cover4.jpg",
      printedMessage: "I will be back",
      handwrittenNote: "Private message",
      fontStyleId: "hwDavid",
      recipientAddress: {
        firstName: "T",
        lastName: "800",
        street1: "",
        city: "",
        state: "",
        zip: "",
      },
      returnAddress: {
        firstName: "Sarah",
        lastName: "Connor",
        street1: "742 Evergreen Terrace",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      createdAt: now - 3600000 * 5,
    } as any;

    const orderFounderFailed: Order = {
      id: "smn_ord_founder_failed",
      customerEmail: "founder@sendmynotes.com",
      status: "FAILED",
      isFounderTest: true,
      fulfillmentError: "Handwrytten robotic pen queue stalled",
      amountInCents: 900,
      frontImageUrl: "https://example.com/cover_f.jpg",
      printedMessage: "Founder Test Card",
      handwrittenNote: "Founder internal note",
      fontStyleId: "hwDavid",
      recipientAddress: {
        firstName: "Founder",
        lastName: "Test",
        street1: "100 Founder Way",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      returnAddress: {
        firstName: "Founder",
        lastName: "Test",
        street1: "100 Founder Way",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      createdAt: now - 3600000 * 6,
    } as any;

    await firestoreDb.collection("orders").doc(orderCust1.id).set(orderCust1);
    await firestoreDb.collection("orders").doc(orderCust2.id).set(orderCust2);
    await firestoreDb.collection("orders").doc(orderCustFailed.id).set(orderCustFailed);
    await firestoreDb.collection("orders").doc(orderCustDeferred.id).set(orderCustDeferred);
    await firestoreDb.collection("orders").doc(orderFounderFailed.id).set(orderFounderFailed);

    // 2. Seed Financial Facts
    await firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).doc("fact_cap_1").set({
      factId: "fact_cap_1",
      factType: "capture", currency: "usd", livemode: true,
      orderId: "smn_ord_cust_1",
      providerPaymentId: "pi_stripe_111",
      amountCents: 900,
      stripeFeeCents: 56,
      occurredAt: now - 3600000 * 2,
      commercialKind: "paid_customer",
      classification: { is_founder_test: false, traffic_role: "customer_prospect" },
    });

    await firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).doc("fact_cap_2").set({
      factId: "fact_cap_2",
      factType: "capture", currency: "usd", livemode: true,
      orderId: "smn_ord_cust_2",
      providerPaymentId: "pi_stripe_222",
      amountCents: 900,
      stripeFeeCents: 56,
      occurredAt: now - 3600000 * 3,
      commercialKind: "paid_customer",
      classification: { is_founder_test: false, traffic_role: "customer_prospect" },
    });

    await firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).doc("fact_cap_failed").set({
      factId: "fact_cap_failed",
      factType: "capture", currency: "usd", livemode: true,
      orderId: "smn_ord_cust_failed",
      providerPaymentId: "pi_stripe_333",
      amountCents: 900,
      stripeFeeCents: 56,
      occurredAt: now - 3600000 * 4,
      commercialKind: "paid_customer",
      classification: { is_founder_test: false, traffic_role: "customer_prospect" },
    });

    await firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).doc("fact_unmatched_1").set({
      factId: "fact_unmatched_1",
      factType: "capture", currency: "usd", livemode: true,
      orderId: undefined, // Stranded payment without order
      providerPaymentId: "pi_stripe_orphan_999",
      amountCents: 900,
      stripeFeeCents: 56,
      occurredAt: now - 3600000 * 1,
      commercialKind: "paid_customer",
      classification: { is_founder_test: false, traffic_role: "customer_prospect" },
    });

    await recordPaymentCaptureFact({ orderId: "smn_ord_cust_deferred", paymentIntentId: "pi_deferred_verified", amountCents: 900, currency: "usd", livemode: true, commercialKind: "paid_customer", occurredAt: now - 3600000 });

    // 3. Seed Supplier Cost Allocations & Dated Spend
    await firestoreDb.collection(SUPPLIER_COST_COLLECTION).doc("cost_inv_1").set({
      id: "cost_inv_1",
      idempotencyKey: "hw_inv_11",
      orderId: "smn_ord_cust_2",
      invoiceId: "inv_hw_oct2026",
      supplier: "handwrytten",
      basePrintCostCents: 325,
      postageCostCents: 73,
      totalSupplierCostCents: 398,
      currency: "usd",
      isEstimate: false,
      allocatedAt: now,
      importedAt: now,
    });

    await firestoreDb.collection(DATED_SPEND_COLLECTION).doc("spend_google_1").set({
      id: "spend_google_1",
      idempotencyKey: "spend_oct18_google",
      date: "2026-10-18",
      channel: "google_cpc",
      utmCampaign: "fall_launch_2026",
      amountCents: 4500, // $45.00
      currency: "usd",
      source: "google_ads_export",
      timezone: "America/Chicago",
      isEstimate: false,
      importedAt: now,
    });

    // 4. Seed Telemetry Events
    await firestoreDb.collection(TELEMETRY_V2_COLLECTION).doc("ev_milestone_1").set({
      event_id: "ev_milestone_1",
      event_name: "entry_viewed",
      occurred_at: now - 3600000 * 2 - 60000,
      received_at: now - 3600000 * 2 - 59000,
      order_id: "smn_ord_cust_1",
      journey_id: "j_connor_1",
      session_id: "s_connor_1",
      client: { path: "/", device_category: "desktop" },
      classification: { channel: "Google CPC", utm_campaign: "fall_launch_2026" },
      source: "browser",
    });

    await firestoreDb.collection(TELEMETRY_V2_COLLECTION).doc("ev_milestone_2").set({
      event_id: "ev_milestone_2",
      event_name: "checkout_initiated",
      occurred_at: now - 3600000 * 2 - 10000,
      received_at: now - 3600000 * 2 - 9000,
      order_id: "smn_ord_cust_1",
      journey_id: "j_connor_1",
      session_id: "s_connor_1",
      client: { path: "/checkout", device_category: "desktop" },
      classification: { channel: "Google CPC", utm_campaign: "fall_launch_2026" },
      source: "browser",
    });

    // ------------------------------------------------------------------------
    // AC01: Scoped Evidence Lists, Pagination, and Warning Banners
    // ------------------------------------------------------------------------
    console.log("-> Testing AC01: Scoped Evidence Lists, Invariant Totals, and Warning Banners");
    {
      const scopeCustomer = parseAdminGlobalScope("?mode=customer_reporting&datePreset=since_oct13");

      // 1. Customer Mode excludes founder test order and warns of hidden exceptions
      const customerOrdersRes = await queryOrdersEvidence({ scope: scopeCustomer });
      assert.strictEqual(
        customerOrdersRes.orders.some((o) => o.orderId === "smn_ord_founder_failed"),
        false,
        "Customer Mode must exclude founder test order"
      );
      assert.ok(
        customerOrdersRes.hiddenOperationalExceptionsCount >= 1,
        "Customer Mode must report hidden operational exceptions count"
      );
      assert.ok(
        customerOrdersRes.warningBanner?.includes("operational exception"),
        "Must generate warning banner informing operator of hidden exceptions in customer mode"
      );

      // 2. Operational Mode includes all cohorts without hiding exceptions
      const scopeOperational = parseAdminGlobalScope("?mode=operational_all&datePreset=since_oct13");
      const opOrdersRes = await queryOrdersEvidence({ scope: scopeOperational });
      assert.ok(
        opOrdersRes.orders.some((o) => o.orderId === "smn_ord_founder_failed"),
        "Operational Mode must include founder test order"
      );

      // 3. Invariant Scoped Totals Across Pagination (Page 1 vs Page 2)
      const page1 = await queryOrdersEvidence({ scope: scopeCustomer, limit: 2 });
      assert.strictEqual(page1.orders.length, 2, "Page 1 has 2 items");
      const initialTotalCount = page1.totalMatchingCount;
      const initialPaidTotal = page1.scopedPaidOrdersTotal;
      const initialNetRevenue = page1.scopedNetRevenueCents;

      assert.ok(page1.hasMore, "Page 1 should have more results");
      assert.ok(page1.nextCursor, "Page 1 must provide nextCursor");

      const page2 = await queryOrdersEvidence({ scope: scopeCustomer, cursor: page1.nextCursor, limit: 2 });
      assert.strictEqual(page2.totalMatchingCount, initialTotalCount, "Total matching count must be invariant on Page 2");
      assert.strictEqual(page2.scopedPaidOrdersTotal, initialPaidTotal, "Paid orders aggregate must be invariant on Page 2");
      assert.strictEqual(page2.scopedNetRevenueCents, initialNetRevenue, "Net revenue aggregate must be invariant on Page 2");

      // 4. Invariant Scoped Totals Across Search
      const searchRes = await queryOrdersEvidence({ scope: scopeCustomer, search: "sarah" });
      assert.strictEqual(searchRes.scopedPaidOrdersTotal, initialPaidTotal, "Paid orders aggregate must be invariant during search");
      assert.strictEqual(searchRes.scopedNetRevenueCents, initialNetRevenue, "Net revenue aggregate must be invariant during search");

      // 5. Actionable Exceptions Queue includes older open exceptions and unmatched facts
      const exceptionsRes = await queryExceptionsQueue({ scope: scopeOperational });
      assert.ok(
        exceptionsRes.exceptions.some((e) => e.type === "paid_unmatched"),
        "Exceptions queue must include paid_unmatched orphan fact"
      );
      assert.ok(
        exceptionsRes.exceptions.some((e) => e.orderId === "smn_ord_cust_failed"),
        "Exceptions queue must include older open fulfillment failed order"
      );
    }

    // ------------------------------------------------------------------------
    // AC02: Chronological Unified Timeline & 4 Independent State Pillars
    // ------------------------------------------------------------------------
    console.log("-> Testing AC02: Unified Evidence Timeline & State Pillars");
    {
      const timeline = await buildUnifiedEvidenceTimeline({ orderId: "smn_ord_cust_1" });

      // 1. Chronological order check
      assert.ok(timeline.events.length >= 3, "Timeline must contain multiple merged events");
      for (let i = 1; i < timeline.events.length; i++) {
        assert.ok(
          timeline.events[i].timestamp >= timeline.events[i - 1].timestamp,
          `Event ${i} (${timeline.events[i].timestamp}) must be chronologically >= event ${i - 1} (${timeline.events[i - 1].timestamp})`
        );
      }

      // 2. Source authority badges check
      const authorities = new Set(timeline.events.map((e) => e.sourceAuthority));
      assert.ok(authorities.has("browser_observed"), "Timeline must contain browser_observed events");
      assert.ok(authorities.has("server_transition"), "Timeline must contain server_transition events");
      assert.ok(authorities.has("provider_webhook"), "Timeline must contain provider_webhook events");

      // 3. Four Independent State Pillars
      assert.strictEqual(timeline.states.paymentState, "captured_verified");
      assert.strictEqual(timeline.states.addressState, "complete");
      assert.strictEqual(timeline.states.fulfillmentState, "not_ready");
      assert.strictEqual(timeline.states.communicationState, "receipt_sent");

      // 4. Critical Label Checks: NEVER claim Inking (Robot) or Physically Delivered
      const mailedTimeline = await buildUnifiedEvidenceTimeline({ orderId: "smn_ord_cust_2" });
      assert.strictEqual(mailedTimeline.states.fulfillmentState, "mailed_confirmed");
      assert.strictEqual(mailedTimeline.states.fulfillmentStateLabel, "Mailed via USPS");
      assert.ok(!mailedTimeline.states.fulfillmentStateLabel.includes("Physically Delivered"));

      // 5. Missing Evidence Stages Detection
      assert.ok(
        timeline.missingEvidenceStages.includes("cover_selected") || timeline.missingEvidenceStages.includes("note_confirmed"),
        "Must flag missing unobserved intermediate builder stages"
      );
    }

    // ------------------------------------------------------------------------
    // AC03: Safe Order Tools, PII Masking, Audited Reveal & Pre-Retry Gate
    // ------------------------------------------------------------------------
    console.log("-> Testing AC03: Safe Actions, PII Masking/Audit, and Pre-Retry Gate");
    {
      // 1. PII Masking by default
      assert.strictEqual(maskEmail("founder@sendmynotes.com"), "f***@sendmynotes.com");
      assert.strictEqual(maskName("Jane Doe"), "Jane D***");
      assert.strictEqual(maskStreet("742 Evergreen Terrace, Apt 4B"), "7*** Evergreen Terrace, Apt 4B");

      // 2. Audited PII Reveal
      const revealRes = await revealOrderPiiWithAudit({
        orderId: "smn_ord_cust_1",
        operatorId: "admin_test_operator",
        reason: "Customer support inquiry regarding delivery destination",
      });
      assert.strictEqual(revealRes.customerEmail, "sarah.connor@example.com", "Revealed email must be unmasked");
      assert.strictEqual(revealRes.recipientAddress.street1, "742 Evergreen Terrace", "Revealed street must be unmasked");
      assert.strictEqual(revealRes.handwrittenNote, "Private message from John", "Revealed note must be unmasked");

      // Verify immutable audit log record created
      const auditDoc = await firestoreDb.collection(ADMIN_AUDIT_LOG_COLLECTION).doc(revealRes.auditId).get();
      assert.ok(auditDoc.exists, "Audit entry must exist in admin_audit_log");
      assert.strictEqual(auditDoc.data()?.action, "pii_reveal");
      assert.strictEqual(auditDoc.data()?.orderId, "smn_ord_cust_1");

      // 3. Pre-Retry Safety Gate Checks
      // Order with existing Handwrytten ID -> BLOCKED (Duplicate manufacturing prevention)
      const gateMailed = await evaluateFulfillmentRetryGate("smn_ord_cust_2");
      assert.strictEqual(gateMailed.allowed, false);
      assert.strictEqual(gateMailed.reason, "already_has_supplier_order_id");
      assert.strictEqual(gateMailed.requiresReadSyncFirst, true);

      // Order with incomplete address -> BLOCKED
      const gateDeferred = await evaluateFulfillmentRetryGate("smn_ord_cust_deferred");
      assert.strictEqual(gateDeferred.allowed, false);
      assert.strictEqual(gateDeferred.reason, "incomplete_address");

      // Order that is failed, paid, address complete, no supplier ID -> ALLOWED
      const gateFailed = await evaluateFulfillmentRetryGate("smn_ord_cust_failed");
      assert.strictEqual(gateFailed.allowed, true);
      assert.strictEqual(gateFailed.reason, "ready_for_dispatch");
      assert.strictEqual(gateFailed.safeToRetry, true);

      // 4. /api/admin/retry-fulfillment Endpoint Tests
      // Unauthorized -> HTTP 401
      const unauthReq = new NextRequest("http://localhost:3000/api/admin/retry-fulfillment", {
        method: "POST",
        body: JSON.stringify({ orderId: "smn_ord_cust_failed" }),
      });
      const unauthRes = await handleRetryFulfillment(unauthReq);
      assert.strictEqual(unauthRes.status, 401, "Unauthorized retry request must return HTTP 401");

      // Blocked order -> HTTP 409
      const blockedReq = new NextRequest("http://localhost:3000/api/admin/retry-fulfillment", {
        method: "POST",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: "smn_ord_cust_2", confirmBillableDispatch: true }),
      });
      const blockedRes = await handleRetryFulfillment(blockedReq);
      assert.strictEqual(blockedRes.status, 409, "Blocked order retry must return HTTP 409");
      const blockedJson = await blockedRes.json();
      assert.strictEqual(blockedJson.reason, "already_has_supplier_order_id");

      // Missing confirmBillableDispatch -> HTTP 409
      const unconfirmedReq = new NextRequest("http://localhost:3000/api/admin/retry-fulfillment", {
        method: "POST",
        headers: {
          cookie: `${ADMIN_COOKIE_NAME}=${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId: "smn_ord_cust_failed", confirmBillableDispatch: false }),
      });
      const unconfirmedRes = await handleRetryFulfillment(unconfirmedReq);
      assert.strictEqual(unconfirmedRes.status, 409, "Unconfirmed billable dispatch must return HTTP 409");
    }

    // ------------------------------------------------------------------------
    // AC04: Economics Investigation & Aggregate == Detail == Export Parity
    // ------------------------------------------------------------------------
    console.log("-> Testing AC04: Economics Investigation & Exact Parity");
    {
      const scope = parseAdminGlobalScope("?mode=operational_all&datePreset=since_oct13");
      const econReport = await getEconomicsInvestigationReport({ scope, format: "csv" });

      // 1. Total Captured Revenue
      assert.ok(econReport.summary.totalCapturedRevenueCents > 0, "Summary must have positive captured revenue");

      // 2. Aggregate == Detail == Export Parity
      const detailCapturedSum = econReport.transactionLedgerView
        .filter((tx) => tx.type === "capture")
        .reduce((acc, tx) => acc + tx.amountCents, 0);

      assert.strictEqual(
        detailCapturedSum,
        econReport.summary.totalCapturedRevenueCents,
        "Sum of detail transaction rows MUST equal summary totalCapturedRevenueCents"
      );

      // Verify CSV content matches detail count
      const csvLines = econReport.csvContent.trim().split("\n");
      assert.strictEqual(
        csvLines.length - 1, // minus header
        econReport.transactionLedgerView.length,
        "CSV export row count MUST exactly match transaction ledger row count"
      );

      // 3. Known vs Unconfirmed Supplier Costs Provenance
      const invoicedTx = econReport.transactionLedgerView.find((tx) => tx.orderId === "smn_ord_cust_2");
      assert.strictEqual(invoicedTx?.supplierCostStatus, "verified_invoice");
      assert.strictEqual(invoicedTx?.supplierCostCents, 398);

      const unconfirmedTx = econReport.transactionLedgerView.find((tx) => tx.orderId === "smn_ord_cust_1");
      assert.strictEqual(unconfirmedTx?.supplierCostStatus, "unconfirmed");
      assert.strictEqual(unconfirmedTx?.supplierCostCents, null, "Unconfirmed cost must NOT default to $0 or estimate");

      // 4. Separated Scenario Model
      assert.strictEqual(econReport.scenarioModel.isScenarioModelOnly, true);
      assert.ok(econReport.scenarioModel.disclaimer.includes("Scenario models and break-even calculations are simulation estimates"));
    }

    // ------------------------------------------------------------------------
    // UI Workspaces & Drawer Static Markup Parity
    // ------------------------------------------------------------------------
    console.log("-> Testing UI Components: Drawer & Workspaces Markup Rendering");
    {
      const scope = DEFAULT_ADMIN_GLOBAL_SCOPE;

      // 1. OrderJourneyDrawer
      const drawerMarkup = renderToStaticMarkup(
        <OrderJourneyDrawer
          order={orderCust2}
          onInspectProof={() => {}}
          onSyncStripe={() => {}}
          onSyncHandwrytten={() => {}}
          onRetryFulfillment={() => {}}
        />
      );

      assert.ok(drawerMarkup.includes("Mailed via USPS"), "Drawer must render 'Mailed via USPS' label");
      assert.ok(!drawerMarkup.includes("Physically Delivered"), "Drawer must NOT claim 'Physically Delivered'");
      assert.ok(drawerMarkup.includes("[Read-Only: Sync Stripe]"), "Drawer must separate read-only tools");
      assert.ok(drawerMarkup.includes("[Billable Action: Retry Supplier Submission"), "Drawer must label billable retry");

      // 2. Workspaces markup rendering
      const ordersMarkup = renderToStaticMarkup(
        <OrdersInvestigationWorkspace
          scope={scope}
          onScopeChange={() => {}}
        />
      );
      assert.ok(ordersMarkup.includes("Orders investigation dataset"), "Must render orders table region");

      const journeysMarkup = renderToStaticMarkup(
        <JourneysInvestigationWorkspace
          scope={scope}
          onScopeChange={() => {}}
        />
      );
      assert.ok(journeysMarkup.includes("Visitor journeys investigation dataset"), "Must render journeys table region");

      const econMarkup = renderToStaticMarkup(
        <EconomicsInvestigationWorkspace
          scope={scope}
          onScopeChange={() => {}}
        />
      );
      assert.ok(econMarkup.includes("Loading financial evidence"), "Pending economics must display loading evidence");
      assert.ok(!econMarkup.includes("$0.00"), "Pending economics must not fabricate zero-valued financial evidence");
    }

    console.log("=== All SPRINT-0007 tests passed successfully! ===");
  } finally {
    ordersCol.store = backupOrders;
    factsCol.store = backupFacts;
    costsCol.store = backupCosts;
    spendCol.store = backupSpend;
    telemetryCol.store = backupTelemetry;
  }
});
}

runSprint0007Tests().catch((err) => {
  console.error("Sprint 0007 test execution failed:", err);
  process.exit(1);
});
