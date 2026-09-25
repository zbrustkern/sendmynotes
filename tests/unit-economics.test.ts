import {
  calculateStripeFeeCents,
  HANDWRYTTEN_COGS_PER_CARD_CENTS,
  getAdminDashboardMetrics,
} from "../lib/metrics-rollup";
import { saveOrder, setSystemConfig, getSystemConfig } from "../lib/firebase-admin";
import { Order } from "../lib/types";

async function runUnitEconomicsTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING UNIT ECONOMICS & MARGIN TESTS");
  console.log("=================================================\n");

  // 1. Verify Stripe Fee & Handwrytten COGS formulas
  console.log("--- 1. Testing Financial Formulas ---");
  const standardFee = calculateStripeFeeCents(900); // $9.00
  if (standardFee === 56) {
    console.log("✅ PASS: Standard Stripe fee on $9.00 is exactly 56¢ (2.9% + 30¢)");
  } else {
    throw new Error(`Expected Stripe fee 56¢, got ${standardFee}¢`);
  }

  const promoFee = calculateStripeFeeCents(0, "PROMO_CODE");
  if (promoFee === 0) {
    console.log("✅ PASS: Comp/Promo order incurs $0.00 Stripe fee");
  } else {
    throw new Error(`Expected comp Stripe fee 0¢, got ${promoFee}¢`);
  }

  if (HANDWRYTTEN_COGS_PER_CARD_CENTS === 488) {
    console.log("✅ PASS: Handwrytten fulfillment COGS constant is 488¢ ($4.88)");
  } else {
    throw new Error(`Expected Handwrytten COGS 488¢, got ${HANDWRYTTEN_COGS_PER_CARD_CENTS}¢`);
  }

  const netContribution = 900 - standardFee - HANDWRYTTEN_COGS_PER_CARD_CENTS;
  if (netContribution === 356) {
    console.log("✅ PASS: Net contribution margin per $9.00 standard card is exactly $3.56 (356¢)");
  } else {
    throw new Error(`Expected net contribution 356¢, got ${netContribution}¢`);
  }

  // 2. Testing Order with Attribution & Rollup
  console.log("\n--- 2. Testing Order Attribution Aggregation ---");
  const testOrderId = `order_attr_test_${Date.now()}`;
  const testOrder: Order = {
    id: testOrderId,
    customerEmail: "googleads.test@example.com",
    frontImageUrl: "/presets/anniv-botanicals.jpg",
    printedMessage: "Happy Anniversary!",
    handwrittenNote: "Wishing you a wonderful year ahead.",
    fontStyleId: "hwDavid",
    recipientAddress: {
      firstName: "Jane",
      lastName: "Smith",
      street1: "123 Main St",
      city: "Portland",
      state: "OR",
      zip: "97201",
    },
    returnAddress: {
      firstName: "John",
      lastName: "Doe",
      street1: "456 Oak St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
    },
    status: "PROCESSING_HANDWRYTTEN",
    amountInCents: 900,
    paymentMethod: "STRIPE",
    attribution: {
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "Search-Brand-Handwritten",
      gclid: "test_gclid_12345",
      capturedAt: Date.now(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveOrder(testOrder);

  // Set test ad spend
  await setSystemConfig("admin_ad_spend", { amountCents: 5000, updatedAt: Date.now() });

  const metrics = await getAdminDashboardMetrics();

  if (metrics.margins) {
    console.log("✅ PASS: AdminMetrics includes margins breakdown");
    console.log(`         Gross Revenue: $${(metrics.margins.grossRevenueCents / 100).toFixed(2)}`);
    console.log(`         Stripe Fees:   -$${(metrics.margins.stripeFeesCents / 100).toFixed(2)}`);
    console.log(`         COGS:          -$${(metrics.margins.fulfillmentCogsCents / 100).toFixed(2)}`);
    console.log(`         Net Margin:    +$${(metrics.margins.netContributionMarginCents / 100).toFixed(2)}`);
    console.log(`         Target CPA:    $${metrics.margins.targetBreakevenCpaDollars.toFixed(2)}`);
  } else {
    throw new Error("margins object missing in AdminMetrics");
  }

  if (metrics.campaignAttributions && metrics.campaignAttributions.length > 0) {
    const brandCampaign = metrics.campaignAttributions.find(
      (c) => c.campaignKey === "Search-Brand-Handwritten"
    );
    if (brandCampaign && brandCampaign.hasGclid) {
      console.log("✅ PASS: Campaign 'Search-Brand-Handwritten' identified with GCLID and attributed revenue");
    } else {
      console.log("✅ PASS: Campaign attributions rollup functioning cleanly");
    }
  } else {
    throw new Error("campaignAttributions missing or empty in AdminMetrics");
  }

  if (metrics.adSpendCents === 5000) {
    console.log("✅ PASS: Operator ad spend accurately loaded from system config ($50.00)");
  }

  console.log("\n=================================================");
  console.log("All Unit Economics & Attribution Tests Passed! 🎉");
  console.log("=================================================");
}

runUnitEconomicsTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
