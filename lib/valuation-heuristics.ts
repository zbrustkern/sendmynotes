import { ValuationHeuristicAssumptions, ValuationHeuristicOutputs } from "./types";

export const DEFAULT_VALUATION_ASSUMPTIONS: ValuationHeuristicAssumptions = {
  annualCardsPerCustomer: 3.0,
  customerLifespanYears: 2.5,
  addressBookAdoptionRate: 0.40,
  addressBookOrderMultiplier: 1.8,
  valuationMultipleSde: 3.5,
  valuationMultipleRevenue: 1.5,
  monthlyFixedOverheadDollars: 25.0,
  targetActiveCustomers: 500,
};

export interface ValuationPreset {
  id: "conservative" | "base" | "growth";
  name: string;
  badge: string;
  description: string;
  assumptions: ValuationHeuristicAssumptions;
}

export const VALUATION_PRESETS: Record<"conservative" | "base" | "growth", ValuationPreset> = {
  conservative: {
    id: "conservative",
    name: "Conservative Case",
    badge: "Cautious",
    description: "Occasional sends (1.8/yr), shorter 1.5 yr retention, and lower multiple (2.5x).",
    assumptions: {
      annualCardsPerCustomer: 1.8,
      customerLifespanYears: 1.5,
      addressBookAdoptionRate: 0.25,
      addressBookOrderMultiplier: 1.4,
      valuationMultipleSde: 2.5,
      valuationMultipleRevenue: 1.0,
      monthlyFixedOverheadDollars: 35.0,
      targetActiveCustomers: 250,
    },
  },
  base: {
    id: "base",
    name: "Base Case (Realistic)",
    badge: "Standard",
    description: "Standard occasion cadence (3 cards/yr), 2.5 yr lifespan, and 3.5x SDE multiple.",
    assumptions: {
      annualCardsPerCustomer: 3.0,
      customerLifespanYears: 2.5,
      addressBookAdoptionRate: 0.40,
      addressBookOrderMultiplier: 1.8,
      valuationMultipleSde: 3.5,
      valuationMultipleRevenue: 1.5,
      monthlyFixedOverheadDollars: 25.0,
      targetActiveCustomers: 500,
    },
  },
  growth: {
    id: "growth",
    name: "Expansion / High LTV Case",
    badge: "Aggressive",
    description: "Address book reminders driving 4.5 cards/yr, 3.5 yr lifespan, and premium multiple (4.5x).",
    assumptions: {
      annualCardsPerCustomer: 4.5,
      customerLifespanYears: 3.5,
      addressBookAdoptionRate: 0.60,
      addressBookOrderMultiplier: 2.2,
      valuationMultipleSde: 4.5,
      valuationMultipleRevenue: 2.2,
      monthlyFixedOverheadDollars: 25.0,
      targetActiveCustomers: 1000,
    },
  },
};

export const STANDARD_RETAIL_PRICE = 9.00;
export const STANDARD_NET_CONTRIBUTION = 3.56;

/**
 * Computes deterministic valuation, CAC, and LTV metrics based on configurable operator assumptions.
 */
export function calculateValuationHeuristics(
  rawAssumptions: Partial<ValuationHeuristicAssumptions> = {},
  actualCacDollars: number = 0
): ValuationHeuristicOutputs {
  const assumptions: ValuationHeuristicAssumptions = {
    ...DEFAULT_VALUATION_ASSUMPTIONS,
    ...rawAssumptions,
  };

  // 1. Calculate repeat frequency & lifetime orders
  // Blended cards per year takes into account users who save contacts to their address book
  const repeatLift = Math.max(0, assumptions.addressBookOrderMultiplier - 1);
  const blendedAnnualCards =
    assumptions.annualCardsPerCustomer * (1 + assumptions.addressBookAdoptionRate * repeatLift);

  const modeledLifetimeOrders = Number(
    (blendedAnnualCards * Math.max(0.1, assumptions.customerLifespanYears)).toFixed(2)
  );

  const modeledLifetimeRevenue = Number((modeledLifetimeOrders * STANDARD_RETAIL_PRICE).toFixed(2));
  const modeledLtvGrossMargin = Number((modeledLifetimeOrders * STANDARD_NET_CONTRIBUTION).toFixed(2));

  // 2. CAC & Payback metrics
  const effectiveCac = actualCacDollars > 0 ? actualCacDollars : 3.56; // Fallback to breakeven target
  const ltvToCacRatio = Number((modeledLtvGrossMargin / Math.max(0.01, effectiveCac)).toFixed(2));
  const cacPaybackCards = Number((effectiveCac / STANDARD_NET_CONTRIBUTION).toFixed(2));
  const cacPaybackMonths = Number(
    ((cacPaybackCards / Math.max(0.1, blendedAnnualCards)) * 12).toFixed(1)
  );

  // 3. Customer Portfolio Economics (scaled to targetActiveCustomers)
  const activeCustomers = Math.max(1, assumptions.targetActiveCustomers);
  const annualizedCustomerValue = Number((blendedAnnualCards * STANDARD_NET_CONTRIBUTION).toFixed(2));

  const totalAnnualCards = activeCustomers * blendedAnnualCards;
  const annualRunRateRevenue = Number((totalAnnualCards * STANDARD_RETAIL_PRICE).toFixed(2));
  const annualRunRateContribution = Number((totalAnnualCards * STANDARD_NET_CONTRIBUTION).toFixed(2));

  const annualFixedOverhead = Number((assumptions.monthlyFixedOverheadDollars * 12).toFixed(2));
  const annualNetProfitSde = Math.max(0, Number((annualRunRateContribution - annualFixedOverhead).toFixed(2)));

  // 4. Valuation Multiples
  // SDE (Seller's Discretionary Earnings) Multiple Valuation
  const estimatedValuationSde = Number((annualNetProfitSde * assumptions.valuationMultipleSde).toFixed(2));

  // Run-Rate Gross Merchandise Value / Revenue Multiple Valuation
  const estimatedValuationRevenue = Number(
    (annualRunRateRevenue * assumptions.valuationMultipleRevenue).toFixed(2)
  );

  // Customer Equity Valuation (Total active customer cohort × expected lifetime contribution)
  const estimatedCustomerEquity = Number((activeCustomers * modeledLtvGrossMargin).toFixed(2));

  // Blended composite estimate
  const blendedValuationEstimate = Number(
    ((estimatedValuationSde * 0.45) + (estimatedValuationRevenue * 0.25) + (estimatedCustomerEquity * 0.30)).toFixed(2)
  );

  return {
    modeledLifetimeOrders,
    modeledLifetimeRevenue,
    modeledLtvGrossMargin,
    blendedCac: effectiveCac,
    ltvToCacRatio,
    cacPaybackCards,
    cacPaybackMonths,
    annualizedCustomerValue,
    annualRunRateRevenue,
    annualRunRateContribution,
    annualFixedOverhead,
    annualNetProfitSde,
    estimatedValuationSde,
    estimatedValuationRevenue,
    estimatedCustomerEquity,
    blendedValuationEstimate,
  };
}

export interface ScaleSensitivityRow {
  customers: number;
  annualOrders: number;
  annualRevenue: number;
  annualContribution: number;
  annualNetProfitSde: number;
  estimatedValuation: number;
}

export function calculateScaleSensitivityMatrix(
  assumptions: ValuationHeuristicAssumptions,
  scales: number[] = [100, 250, 500, 1000, 2500, 5000]
): ScaleSensitivityRow[] {
  const repeatLift = Math.max(0, assumptions.addressBookOrderMultiplier - 1);
  const blendedAnnualCards =
    assumptions.annualCardsPerCustomer * (1 + assumptions.addressBookAdoptionRate * repeatLift);
  const annualFixedOverhead = assumptions.monthlyFixedOverheadDollars * 12;

  return scales.map((customers) => {
    const annualOrders = Math.round(customers * blendedAnnualCards);
    const annualRevenue = Math.round(annualOrders * STANDARD_RETAIL_PRICE);
    const annualContribution = Math.round(annualOrders * STANDARD_NET_CONTRIBUTION);
    const annualNetProfitSde = Math.max(0, Math.round(annualContribution - annualFixedOverhead));
    const estimatedValuation = Math.round(annualNetProfitSde * assumptions.valuationMultipleSde);

    return {
      customers,
      annualOrders,
      annualRevenue,
      annualContribution,
      annualNetProfitSde,
      estimatedValuation,
    };
  });
}
