export interface Adjustment {
  at: number;
  knownAt: number;
  kind: "refund" | "lost" | "cost" | "reacquisition";
  cents: number;
  reversedTaxCents?: number;
}
export interface Purchase {
  id: string;
  buyer: string | null;
  campaign: string | null;
  project: string | null;
  at: number;
  knownAt: number;
  gross: number;
  tax: number | null;
  // Captured variable costs before later adjustments, null if coverage is incomplete.
  cost: number | null;
  adjustments: Adjustment[];
  uncertainPayment: boolean;
}
export interface Budget {
  month: string;
  campaign: string;
  media: number;
  fees: number | null;
  credits: number | null;
  complete: boolean;
}
export interface CohortInput {
  purchases: Purchase[];
  budgets: Budget[];
  asOf: number;
  historyComplete: boolean;
  acquisitionComplete: boolean;
  month?: string;
  campaign?: string;
}
export interface Horizon {
  days: number;
  mature: number | null;
  repeats: number | null;
  ordersPerBuyer: number | null;
  revenuePerBuyer: number | null;
  contributionPerBuyer: number | null;
  gapPerBuyer: number | null; // CAC minus contribution, may be negative
  missingCosts: number | null;
}
export interface CohortSummary {
  earliest: number | null;
  months: string[];
  campaigns: string[];
  buyers: number | null;
  repeatBuyers: number | null;
  medianDaysToSecond: number | null;
  sameProjectRepeats: number | null;
  fullyReversed: number;
  uncertainOrders: number;
  rows: Horizon[];
  grossSpend: number | null;
  mediaSpend: number | null;
  paidReacquisition: number | null;
  credits: number | null;
  cac: number | null;
  paybackDay: number | null;
}
