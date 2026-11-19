import type { CohortInput } from "./contract";

const day = 24 * 60 * 60 * 1_000;
const capturedAt = Date.parse("2025-01-01T18:00:00Z");
const knownAt = capturedAt;

/** A four-buyer cohort with one additional purchase exactly 30 days later. */
export function exampleInput(): CohortInput {
  const purchase = (
    id: string,
    buyer: string,
    at: number,
  ): CohortInput["purchases"][number] => ({
    id,
    buyer,
    campaign: "winter-launch",
    project: "project-a",
    at,
    knownAt: at,
    gross: 900,
    tax: 0,
    cost: 500,
    adjustments: [],
    uncertainPayment: false,
  });

  return {
    purchases: [
      purchase("order-a1", "buyer-a", capturedAt),
      purchase("order-b1", "buyer-b", capturedAt + 1_000),
      purchase("order-c1", "buyer-c", capturedAt + 2_000),
      purchase("order-d1", "buyer-d", capturedAt + 3_000),
      purchase("order-a2", "buyer-a", capturedAt + 30 * day),
    ],
    budgets: [
      {
        month: "2025-01",
        campaign: "winter-launch",
        media: 8_000,
        fees: 0,
        credits: 0,
        complete: true,
      },
    ],
    asOf: Date.parse("2026-01-01T00:00:00Z"),
    historyComplete: true,
    acquisitionComplete: true,
    month: "2025-01",
    campaign: "winter-launch",
  };
}
