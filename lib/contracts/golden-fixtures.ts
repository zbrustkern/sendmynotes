/**
 * lib/contracts/golden-fixtures.ts
 *
 * Deterministic synthetic fixtures and expected assertion outcomes for
 * cross-lane verification in the SendMyNotes Admin Overhaul (SPRINT-0001-T02).
 *
 * Each golden scenario tests an explicit boundary condition or edge case
 * identified in the overhaul specification, preventing regressions in:
 * - Founder vs Customer classification (especially on mobile ads or ultrawide screens)
 * - Browser paid alias forgery rejection
 * - Paid capture counting regardless of fulfillment status (failed or deferred address)
 * - Observed vs inferred funnel milestone accounting
 * - Truth in unit economics (explicit null/unavailable states rather than false defaults)
 * - Reconciliation of historical unresolved orders
 * - Concurrency control on scarce offers & idempotent redemption
 */

import {
  ClassificationProvenance,
  CommercialKind,
  EventV2Envelope,
  FinancialFactRecord,
  MetricStatus,
  OfferReservationRecord,
  OfferVersionRecord,
  REPORTING_POLICY_VERSION,
  TrafficRole,
} from "./admin-overhaul";

export type GoldenScenarioId =
  | "scen_founder_mobile_ad"
  | "scen_ultrawide_customer"
  | "scen_browser_paid_alias_forgery"
  | "scen_paid_fulfillment_failed"
  | "scen_paid_address_deferred"
  | "scen_skipped_funnel_stages"
  | "scen_unknown_cost_and_zero_spend"
  | "scen_historical_unresolved_order"
  | "scen_concurrent_last_slot_offer";

export interface GoldenFixtureScenario<TInput = Record<string, unknown>, TExpected = Record<string, unknown>> {
  id: GoldenScenarioId;
  title: string;
  description: string;
  input: TInput;
  expected: TExpected;
}

// ----------------------------------------------------------------------------
// Scenario 1: scen_founder_mobile_ad
// ----------------------------------------------------------------------------
export interface ScenFounderMobileAdInput {
  sessionId: string;
  clientId: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  gclid?: string;
  isFounderFlag?: boolean;
  registeredFounderClientIds: string[];
}

export interface ScenFounderMobileAdExpected {
  classificationRole: TrafficRole;
  includedInCustomerReporting: boolean;
  provenanceReason: string;
}

// ----------------------------------------------------------------------------
// Scenario 2: scen_ultrawide_customer
// ----------------------------------------------------------------------------
export interface ScenUltrawideCustomerInput {
  sessionId: string;
  clientId: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  utmSource: string;
  utmMedium: string;
  isFounderFlag?: boolean;
  registeredFounderClientIds: string[];
}

export interface ScenUltrawideCustomerExpected {
  classificationRole: TrafficRole;
  includedInCustomerReporting: boolean;
  isExcludedDueToResolution: boolean;
}

// ----------------------------------------------------------------------------
// Scenario 3: scen_browser_paid_alias_forgery
// ----------------------------------------------------------------------------
export interface ScenBrowserPaidAliasForgeryInput {
  sessionId: string;
  orderId: string;
  browserEvents: Array<{
    eventName: string;
    occurredAt: number;
    properties: Record<string, unknown>;
  }>;
  serverFinancialFacts: FinancialFactRecord[];
}

export interface ScenBrowserPaidAliasForgeryExpected {
  verifiedPaidOrders: number;
  verifiedRevenueCents: number;
  browserConfirmationObserved: boolean;
  rejectionReason: string;
}

// ----------------------------------------------------------------------------
// Scenario 4: scen_paid_fulfillment_failed
// ----------------------------------------------------------------------------
export interface ScenPaidFulfillmentFailedInput {
  orderId: string;
  paymentFact: FinancialFactRecord;
  fulfillmentStatus: "FAILED";
  fulfillmentError: string;
}

export interface ScenPaidFulfillmentFailedExpected {
  verifiedCapturedRevenueCents: number;
  countsAsPaidOrder: boolean;
  surfacesAsOperationalException: boolean;
  exceptionCategory: "paid_fulfillment_failed";
  exceptionSeverity: "critical";
}

// ----------------------------------------------------------------------------
// Scenario 5: scen_paid_address_deferred
// ----------------------------------------------------------------------------
export interface ScenPaidAddressDeferredInput {
  orderId: string;
  paymentFact: FinancialFactRecord;
  orderStatus: "AWAITING_RECIPIENT_ADDRESS";
}

export interface ScenPaidAddressDeferredExpected {
  verifiedCapturedRevenueCents: number;
  countsAsPaidOrder: boolean;
  pathBranch: "deferred_address";
  requiresAddressFollowUp: boolean;
}

// ----------------------------------------------------------------------------
// Scenario 6: scen_skipped_funnel_stages
// ----------------------------------------------------------------------------
export interface ScenSkippedFunnelStagesInput {
  sessionId: string;
  observedEvents: string[]; // e.g. ["entry_viewed", "draft_resumed", "checkout_requested", "payment_attempted"]
}

export interface ScenSkippedFunnelStagesExpected {
  observedMilestones: string[];
  skippedMilestones: string[];
  noteEditCount: number;
  propagatedSupersetCount: number;
}

// ----------------------------------------------------------------------------
// Scenario 7: scen_unknown_cost_and_zero_spend
// ----------------------------------------------------------------------------
export interface ScenUnknownCostAndZeroSpendInput {
  orderId: string;
  verifiedCapturedCents: number;
  stripeFeeCents: number;
  supplierInvoiceConfirmed: boolean;
  datedAdSpendAvailable: boolean;
}

export interface ScenUnknownCostAndZeroSpendExpected {
  revenueStatus: MetricStatus;
  revenueValueCents: number;
  supplierCostStatus: MetricStatus;
  supplierCostValueCents: null;
  contributionMarginStatus: MetricStatus;
  contributionMarginPercent: null;
  cacStatus: MetricStatus;
  cacValue: null;
  neverDisplaysDefaultMargin: boolean; // cannot display 39.6%
  neverDisplaysZeroCac: boolean; // cannot display $0.00 CAC
}

// ----------------------------------------------------------------------------
// Scenario 8: scen_historical_unresolved_order
// ----------------------------------------------------------------------------
export interface ScenHistoricalUnresolvedOrderInput {
  orderId: string;
  displayedCreatedAt: string; // "2026-10-18"
  canonicalBaselineDate: string; // "2026-10-11"
  reconciliationStatus: "pending_founder_verification";
}

export interface ScenHistoricalUnresolvedOrderExpected {
  classification: "unresolved";
  promotedToIndependentCustomer: boolean;
  visibleInOperationalExceptionQueue: boolean;
  preservedInHistoricalLedger: boolean;
}

// ----------------------------------------------------------------------------
// Scenario 9: scen_concurrent_last_slot_offer
// ----------------------------------------------------------------------------
export interface ScenConcurrentLastSlotOfferInput {
  offer: OfferVersionRecord;
  simultaneousReservationAttempts: Array<{
    reservationId: string;
    orderId: string;
    sessionId: string;
  }>;
  simultaneousWebhookCaptures: Array<{
    webhookEventId: string;
    orderId: string;
    amountCents: number;
  }>;
}

export interface ScenConcurrentLastSlotOfferExpected {
  successfulReservationsCount: number;
  rejectedReservationsCount: number;
  recordedRedemptionsCount: number;
  finalUsedCount: number;
}

// ============================================================================
// Concrete Golden Fixtures Registry
// ============================================================================

export const GOLDEN_FIXTURES = {
  // 1. Founder mobile ad visit
  scen_founder_mobile_ad: {
    id: "scen_founder_mobile_ad",
    title: "Founder visiting on mobile with ad tags must be classified as founder",
    description:
      "When a device flagged in founderClientIds visits via mobile user agent with gclid/utm_source=meta, explicit identity must outrank ad tags and mobile device category.",
    input: {
      sessionId: "sess_founder_mobile_001",
      clientId: "client_founder_device_primary",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      screenWidth: 390,
      screenHeight: 844,
      utmSource: "meta",
      utmMedium: "paid_social",
      utmCampaign: "birthday_launch_cpc",
      gclid: undefined,
      isFounderFlag: true,
      registeredFounderClientIds: ["client_founder_device_primary"],
    },
    expected: {
      classificationRole: "founder" as TrafficRole,
      includedInCustomerReporting: false,
      provenanceReason: "matched_founder_client_registry",
    },
  } satisfies GoldenFixtureScenario<ScenFounderMobileAdInput, ScenFounderMobileAdExpected>,

  // 2. Real customer on ultrawide resolution
  scen_ultrawide_customer: {
    id: "scen_ultrawide_customer",
    title: "Real customer on 3440x1440 ultrawide monitor must be counted as customer",
    description:
      "A desktop visitor on 3440x1440 resolution without founder registry matches must NOT be excluded by an arbitrary screen-resolution heuristic.",
    input: {
      sessionId: "sess_customer_ultrawide_002",
      clientId: "client_independent_buyer_99",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      screenWidth: 3440,
      screenHeight: 1440,
      utmSource: "google",
      utmMedium: "cpc",
      isFounderFlag: false,
      registeredFounderClientIds: ["client_founder_device_primary"],
    },
    expected: {
      classificationRole: "customer" as TrafficRole,
      includedInCustomerReporting: true,
      isExcludedDueToResolution: false,
    },
  } satisfies GoldenFixtureScenario<ScenUltrawideCustomerInput, ScenUltrawideCustomerExpected>,

  // 3. Browser paid alias forgery
  scen_browser_paid_alias_forgery: {
    id: "scen_browser_paid_alias_forgery",
    title: "Browser paid alias without server payment capture cannot count as paid",
    description:
      "A client that emits step_6_paid_order or payment_confirmation_observed without server payment capture or purchase_verified fact must produce 0 verified paid orders and 0 verified revenue.",
    input: {
      sessionId: "sess_forgery_probe_003",
      orderId: "ord_forgery_probe_003",
      browserEvents: [
        {
          eventName: "step_6_paid_order",
          occurredAt: 1729290000000,
          properties: { amount: 900, orderId: "ord_forgery_probe_003" },
        },
        {
          eventName: "payment_confirmation_observed",
          occurredAt: 1729290001000,
          properties: { orderId: "ord_forgery_probe_003" },
        },
      ],
      serverFinancialFacts: [],
    },
    expected: {
      verifiedPaidOrders: 0,
      verifiedRevenueCents: 0,
      browserConfirmationObserved: true,
      rejectionReason: "lacks_authoritative_server_payment_fact",
    },
  } satisfies GoldenFixtureScenario<ScenBrowserPaidAliasForgeryInput, ScenBrowserPaidAliasForgeryExpected>,

  // 4. Paid order with failed fulfillment
  scen_paid_fulfillment_failed: {
    id: "scen_paid_fulfillment_failed",
    title: "Captured payment with failed Handwrytten fulfillment counts as revenue and flags exception",
    description:
      "A verified Stripe live capture ($9.00) whose Handwrytten API submission failed remains captured revenue ($9.00) and must surface as a critical operational exception.",
    input: {
      orderId: "ord_paid_hw_failed_004",
      paymentFact: {
        factId: "fact_cap_hw_failed_004",
        factType: "capture",
        commercialKind: "paid_customer",
        orderId: "ord_paid_hw_failed_004",
        provider: "stripe",
        providerObjectId: "pi_live_captured_004",
        amountCents: 900,
        currency: "usd",
        stripeFeeCents: 56,
        supplierCostCents: null,
        netRevenueCents: null,
        livemode: true,
        occurredAt: 1729291000000,
        recordedAt: 1729291002000,
      },
      fulfillmentStatus: "FAILED",
      fulfillmentError: "Handwrytten HTTP 500: internal supplier timeout",
    },
    expected: {
      verifiedCapturedRevenueCents: 900,
      countsAsPaidOrder: true,
      surfacesAsOperationalException: true,
      exceptionCategory: "paid_fulfillment_failed",
      exceptionSeverity: "critical",
    },
  } satisfies GoldenFixtureScenario<ScenPaidFulfillmentFailedInput, ScenPaidFulfillmentFailedExpected>,

  // 5. Paid order with deferred address
  scen_paid_address_deferred: {
    id: "scen_paid_address_deferred",
    title: "Captured payment awaiting recipient address counts as paid and branches to deferred address",
    description:
      "A verified Stripe capture ($9.00) with status AWAITING_RECIPIENT_ADDRESS counts as verified revenue ($9.00) and enters the deferred-address path.",
    input: {
      orderId: "ord_paid_deferred_addr_005",
      paymentFact: {
        factId: "fact_cap_deferred_005",
        factType: "capture",
        commercialKind: "paid_customer",
        orderId: "ord_paid_deferred_addr_005",
        provider: "stripe",
        providerObjectId: "pi_live_captured_005",
        amountCents: 900,
        currency: "usd",
        stripeFeeCents: 56,
        supplierCostCents: null,
        netRevenueCents: null,
        livemode: true,
        occurredAt: 1729292000000,
        recordedAt: 1729292001000,
      },
      orderStatus: "AWAITING_RECIPIENT_ADDRESS",
    },
    expected: {
      verifiedCapturedRevenueCents: 900,
      countsAsPaidOrder: true,
      pathBranch: "deferred_address",
      requiresAddressFollowUp: true,
    },
  } satisfies GoldenFixtureScenario<ScenPaidAddressDeferredInput, ScenPaidAddressDeferredExpected>,

  // 6. Skipped funnel stages on draft resume
  scen_skipped_funnel_stages: {
    id: "scen_skipped_funnel_stages",
    title: "Draft resume jumping directly to checkout reports observed events only",
    description:
      "When a session resumes a saved draft and goes directly to checkout without editing the note in this session, the funnel counts only observed events; it never back-fills unobserved stages via superset propagation.",
    input: {
      sessionId: "sess_draft_resumer_006",
      observedEvents: [
        "entry_viewed",
        "draft_resumed",
        "checkout_requested",
        "payment_attempted",
      ],
    },
    expected: {
      observedMilestones: [
        "entry_viewed",
        "draft_resumed",
        "checkout_requested",
        "payment_attempted",
      ],
      skippedMilestones: [
        "cover_selected",
        "note_edit_started",
        "note_confirmed",
        "address_confirmed",
      ],
      noteEditCount: 0,
      propagatedSupersetCount: 0,
    },
  } satisfies GoldenFixtureScenario<ScenSkippedFunnelStagesInput, ScenSkippedFunnelStagesExpected>,

  // 7. Unknown cost and zero spend
  scen_unknown_cost_and_zero_spend: {
    id: "scen_unknown_cost_and_zero_spend",
    title: "Paid order with unconfirmed supplier cost and missing ad spend reports unknown economics",
    description:
      "A verified captured order ($9.00) with known Stripe fee ($0.56), but unconfirmed supplier invoice and no dated ad spend, must report supplier cost, contribution margin, and CAC as unavailable/null, NEVER 39.6% or $0.00 CAC.",
    input: {
      orderId: "ord_unknown_costs_007",
      verifiedCapturedCents: 900,
      stripeFeeCents: 56,
      supplierInvoiceConfirmed: false,
      datedAdSpendAvailable: false,
    },
    expected: {
      revenueStatus: "verified" as MetricStatus,
      revenueValueCents: 900,
      supplierCostStatus: "unavailable" as MetricStatus,
      supplierCostValueCents: null,
      contributionMarginStatus: "unavailable" as MetricStatus,
      contributionMarginPercent: null,
      cacStatus: "unavailable" as MetricStatus,
      cacValue: null,
      neverDisplaysDefaultMargin: true,
      neverDisplaysZeroCac: true,
    },
  } satisfies GoldenFixtureScenario<ScenUnknownCostAndZeroSpendInput, ScenUnknownCostAndZeroSpendExpected>,

  // 8. Historical unresolved order
  scen_historical_unresolved_order: {
    id: "scen_historical_unresolved_order",
    title: "October 18 displayed paid order must remain unresolved until reconciled",
    description:
      "The single displayed paid order on October 18 must be classified as unresolved and kept in an operational reconciliation queue; it cannot be silently promoted to an independent customer conversion.",
    input: {
      orderId: "ord_oct18_displayed_008",
      displayedCreatedAt: "2026-10-18T14:30:00Z",
      canonicalBaselineDate: "2026-10-11T00:00:00Z",
      reconciliationStatus: "pending_founder_verification",
    },
    expected: {
      classification: "unresolved",
      promotedToIndependentCustomer: false,
      visibleInOperationalExceptionQueue: true,
      preservedInHistoricalLedger: true,
    },
  } satisfies GoldenFixtureScenario<ScenHistoricalUnresolvedOrderInput, ScenHistoricalUnresolvedOrderExpected>,

  // 9. Concurrent last slot offer
  scen_concurrent_last_slot_offer: {
    id: "scen_concurrent_last_slot_offer",
    title: "Offer with 1 slot remaining allows at most 1 reservation and 1 redemption",
    description:
      "An offer with maxUses=1 and usedCount=0 subjected to 2 concurrent checkout reservations and duplicate webhook callbacks allows exactly 1 reservation to succeed and exactly 1 redemption to be recorded.",
    input: {
      offer: {
        offerId: "off_scare_promo_009",
        version: 1,
        code: "LAUNCH50",
        purpose: "Launch single slot promotion",
        destinationPath: "/send/birthday",
        discountType: "PERCENTAGE",
        discountValue: 50,
        timezone: "America/Chicago",
        status: "active",
        maxUses: 1,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        createdAt: 1729290000000,
        updatedAt: 1729290000000,
      },
      simultaneousReservationAttempts: [
        {
          reservationId: "res_009_a",
          orderId: "ord_009_a",
          sessionId: "sess_009_a",
        },
        {
          reservationId: "res_009_b",
          orderId: "ord_009_b",
          sessionId: "sess_009_b",
        },
      ],
      simultaneousWebhookCaptures: [
        {
          webhookEventId: "evt_stripe_webhook_009_first",
          orderId: "ord_009_a",
          amountCents: 450,
        },
        {
          webhookEventId: "evt_stripe_webhook_009_duplicate_retry",
          orderId: "ord_009_a",
          amountCents: 450,
        },
      ],
    },
    expected: {
      successfulReservationsCount: 1,
      rejectedReservationsCount: 1,
      recordedRedemptionsCount: 1,
      finalUsedCount: 1,
    },
  } satisfies GoldenFixtureScenario<ScenConcurrentLastSlotOfferInput, ScenConcurrentLastSlotOfferExpected>,
} as const;

/**
 * Retrieves a golden fixture scenario by its unique scenario ID.
 */
export function getGoldenFixture<K extends GoldenScenarioId>(
  scenarioId: K
): (typeof GOLDEN_FIXTURES)[K] {
  const fixture = GOLDEN_FIXTURES[scenarioId];
  if (!fixture) {
    throw new Error(`Unknown golden fixture scenario ID: ${scenarioId}`);
  }
  return fixture;
}
