import test from "node:test";
import assert from "node:assert/strict";
import type { CohortInput, Purchase } from "../lib/repeat-buyers/contract";
import { summarize } from "../lib/repeat-buyers/calculator";
import { exampleInput } from "../lib/repeat-buyers/example";

const day = 24 * 60 * 60 * 1_000;
const t = (value: string) => Date.parse(value);

function order(
  id: string,
  buyer: string | null,
  at: number,
  changes: Partial<Purchase> = {},
): Purchase {
  return {
    id,
    buyer,
    campaign: "campaign-a",
    project: "project-a",
    at,
    knownAt: at,
    gross: 9_00,
    tax: 0,
    cost: 5_00,
    adjustments: [],
    uncertainPayment: false,
    ...changes,
  };
}

function input(purchases: Purchase[], changes: Partial<CohortInput> = {}): CohortInput {
  return {
    purchases,
    budgets: [],
    asOf: t("2025-12-31T12:00:00Z"),
    historyComplete: true,
    acquisitionComplete: true,
    ...changes,
  };
}

function horizon(summary: ReturnType<typeof summarize>, days: number) {
  const row = summary.rows.find((candidate) => candidate.days === days);
  assert.ok(row, `missing ${days}-day horizon`);
  return row;
}

test("example describes four buyers, five $9 purchases, $5 costs, and $80 budget", () => {
  const data = exampleInput();
  assert.equal(data.purchases.length, 5);
  assert.equal(new Set(data.purchases.map((purchase) => purchase.buyer)).size, 4);
  assert.ok(data.purchases.every((purchase) => purchase.gross === 900));
  assert.ok(data.purchases.every((purchase) => purchase.cost === 500));
  assert.equal(data.budgets[0]?.media, 8_000);
  assert.equal(data.budgets[0]?.month, "2025-01");
  assert.equal(data.budgets[0]?.complete, true);
  const summary = summarize(data);
  assert.equal(summary.buyers, 4);
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(summary.medianDaysToSecond, 30);
  assert.equal(summary.grossSpend, 8_000);
  assert.equal(summary.cac, 2_000);
  assert.equal(horizon(summary, 30).repeats, 1);
  assert.equal(horizon(summary, 30).ordersPerBuyer, 1.25);
  assert.equal(horizon(summary, 30).revenuePerBuyer, 1_125);
  assert.equal(horizon(summary, 30).contributionPerBuyer, 500);
  assert.equal(summary.paybackDay, null);
});

test("includes an order exactly on the 30-day horizon", () => {
  const start = t("2025-01-01T12:00:00Z");
  const summary = summarize(input([
    order("first", "buyer", start),
    order("second", "buyer", start + 30 * day),
  ], { asOf: start + 90 * day }));

  assert.equal(horizon(summary, 30).mature, 1);
  assert.equal(horizon(summary, 30).repeats, 1);
});

test("horizons wait for buyer maturity and count a buyer once", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("a1", "a", start), order("a2", "a", start + 10 * day),
    order("b1", "b", start + 20 * day),
  ], { asOf: start + 55 * day }));

  assert.equal(horizon(summary, 30).mature, 2);
  assert.equal(horizon(summary, 30).repeats, 1);
  assert.equal(horizon(summary, 60).mature, 0);
  assert.equal(horizon(summary, 60).repeats, 0);
  assert.equal(summary.medianDaysToSecond, 10);
});

test("fully reversed orders leave the buyer and costs but are removed from retained order count", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("one", "buyer", start, {
      adjustments: [{ at: start + day, knownAt: start + day, kind: "refund", cents: 900 }],
    }),
    order("two", "buyer", start + 40 * day),
  ], { asOf: start + 400 * day }));

  assert.equal(summary.buyers, 1);
  assert.equal(summary.fullyReversed, 1);
  assert.equal(horizon(summary, 30).repeats, 0);
  assert.equal(horizon(summary, 30).ordersPerBuyer, 0);
  assert.equal(horizon(summary, 30).contributionPerBuyer, -500);
});

test("partial refunds deduct the documented returned tax and costs can exceed revenue", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("partial", "buyer", start, {
      gross: 1_000,
      tax: 100,
      cost: 1_200,
      adjustments: [{ at: start + day, knownAt: start + day, kind: "refund", cents: 500, reversedTaxCents: 50 }],
    }),
  ], { asOf: start + 400 * day }));

  assert.equal(summary.fullyReversed, 0);
  assert.equal(horizon(summary, 30).revenuePerBuyer, 450);
  assert.equal(horizon(summary, 30).contributionPerBuyer, -750);
});

test("missing cost suppresses contribution only", () => {
  const start = t("2025-01-01T00:00:00Z");
  const row = horizon(summarize(input([
    order("one", "buyer", start, { cost: null }),
  ], { asOf: start + 400 * day })), 30);

  assert.equal(row.revenuePerBuyer, 900);
  assert.equal(row.contributionPerBuyer, null);
  assert.equal(row.missingCosts, 1);
});

test("filters cohort by earliest identity purchase, excluding prior purchasers", () => {
  const jan = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("old", "prior", t("2024-12-01T12:00:00Z"), { campaign: "campaign-a" }),
    order("prior-in-cohort", "prior", jan),
    order("new", "new", jan + 1_000),
  ], { month: "2025-01", campaign: "campaign-a" }));

  assert.equal(summary.buyers, 1);
  assert.deepEqual(summary.months, ["2024-12", "2025-01"]);
  assert.deepEqual(summary.campaigns, ["campaign-a"]);
});

test("uses stable order IDs for same-time identity anchors", () => {
  const start = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("z-parent", "buyer", start, { campaign: "later-sort" }),
    order("a-parent", "buyer", start, { campaign: "first-sort" }),
  ], { month: "2025-01", campaign: "first-sort" }));

  assert.equal(summary.buyers, 1);
  assert.deepEqual(summary.campaigns, ["first-sort"]);
});

test("aligns the cohort to the anchor purchase while retaining later campaign orders", () => {
  const start = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("anchor", "buyer", start, { campaign: "launch" }),
    order("later-other-campaign", "buyer", start + 40 * day, { campaign: "retarget" }),
    order("other-anchor", "other", start + 1_000, { campaign: "retarget" }),
  ], { month: "2025-01", campaign: "launch" }));

  assert.equal(summary.buyers, 1);
  assert.equal(horizon(summary, 30).repeats, 0);
  assert.equal(horizon(summary, 60).repeats, 1);
  assert.deepEqual(summary.campaigns, ["launch", "retarget"]);
});

test("keeps campaign cohorts separate and requires a single matching budget for CAC", () => {
  const start = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("a", "a", start, { campaign: "opaque|A" }),
    order("b", "b", start + 1_000, { campaign: "opaque|B" }),
  ], {
    month: "2025-01",
    budgets: [
      { month: "2025-01", campaign: "opaque|A", media: 1_000, fees: 100, credits: 900, complete: true },
      { month: "2025-01", campaign: "opaque|B", media: 1_000, fees: 100, credits: 0, complete: true },
    ],
  }));

  assert.equal(summary.buyers, 2);
  assert.deepEqual(summary.campaigns, ["opaque|A", "opaque|B"]);
  assert.equal(summary.grossSpend, 2_200);
  assert.equal(summary.cac, null);
});

test("missing identity is not combined into a shared buyer", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("unknown-1", null, start),
    order("unknown-2", null, start + 10 * day),
  ]));

  assert.equal(summary.buyers, 0);
  assert.equal(summary.repeatBuyers, 0);
});

test("preserves opaque campaign strings and labels a missing campaign as unknown", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("opaque", "buyer-a", start, { campaign: "unknown / paid|social" }),
    order("missing", "buyer-b", start + 1_000, { campaign: null }),
  ]));

  assert.deepEqual(summary.campaigns, ["unknown", "unknown / paid|social"]);
});

test("campaign options are stable across input order", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("z", "z", start, { campaign: "z-campaign" }),
    order("a", "a", start + day, { campaign: "a-campaign" }),
  ]));
  assert.deepEqual(summary.campaigns, ["a-campaign", "z-campaign"]);
});

test("incomplete history suppresses buyer-derived metrics", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("one", "buyer", start),
  ], { historyComplete: false }));

  assert.equal(summary.buyers, null);
  assert.equal(summary.repeatBuyers, null);
  assert.equal(summary.medianDaysToSecond, null);
  assert.equal(horizon(summary, 30).mature, null);
  assert.equal(horizon(summary, 30).repeats, null);
});

test("as-of controls financial knowledge and uses late-posted events by effective date", () => {
  const start = t("2025-01-01T00:00:00Z");
  const knownAt = start + 60 * day;
  const source = order("one", "buyer", start, {
    adjustments: [{ at: start + 10 * day, knownAt, kind: "refund", cents: 300 }],
  });
  const before = summarize(input([source], { asOf: knownAt - 1 }));
  const after = summarize(input([source], { asOf: knownAt + 1 }));

  assert.equal(horizon(before, 30).revenuePerBuyer, 900);
  assert.equal(horizon(after, 30).revenuePerBuyer, 600);
});

test("as-of excludes a captured order before its capture record is known", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("known", "buyer", start),
    order("not-yet-known", "buyer", start + 10 * day, { knownAt: start + 60 * day }),
  ], { asOf: start + 30 * day }));

  assert.equal(horizon(summary, 30).repeats, 0);
  assert.equal(horizon(summary, 30).ordersPerBuyer, 1);
});

test("unknown financial outcome on a later order suppresses repeat metrics", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("first", "buyer", start),
    order("later", "buyer", start + 10 * day, { uncertainPayment: true }),
  ], { asOf: start + 400 * day }));

  assert.equal(horizon(summary, 30).repeats, null);
  assert.equal(horizon(summary, 30).ordersPerBuyer, null);
  assert.equal(horizon(summary, 30).revenuePerBuyer, null);
});

test("CAC requires complete single-month, single-campaign attribution; credits do not reduce it", () => {
  const start = t("2025-01-05T12:00:00Z");
  const base = input([order("one", "buyer", start)], {
    month: "2025-01",
    campaign: "campaign-a",
    budgets: [
      { month: "2025-01", campaign: "campaign-a", media: 8_000, fees: 500, credits: 7_000, complete: true },
      { month: "2025-02", campaign: "campaign-a", media: 9_000, fees: 600, credits: 0, complete: true },
    ],
  });
  assert.equal(summarize(base).grossSpend, 8_500);
  assert.equal(summarize(base).credits, 7_000);
  assert.equal(summarize(base).cac, 8_500);

  const missingFees = { ...base, budgets: [{ ...base.budgets[0]!, fees: null }] };
  assert.equal(summarize(missingFees).grossSpend, null);
  assert.equal(summarize(missingFees).mediaSpend, 8_000);
  assert.equal(summarize(missingFees).cac, null);
});

test("Chicago month labels follow America/Chicago boundaries", () => {
  const summary = summarize(input([
    order("edge", "buyer", t("2025-02-01T01:30:00Z")),
  ]));

  assert.deepEqual(summary.months, ["2025-01"]);
});

test("day 40 order is outside the 30-day horizon", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("first", "buyer", start), order("day-40", "buyer", start + 40 * day),
  ], { asOf: start + 400 * day }));
  assert.equal(horizon(summary, 30).repeats, 0);
  assert.equal(horizon(summary, 30).ordersPerBuyer, 1);
  assert.equal(horizon(summary, 60).repeats, 1);
});

test("summary repeats include immature and post-365-day repeaters", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("old", "old", start), order("old-repeat", "old", start + 400 * day),
    order("recent", "recent", start + 500 * day), order("recent-repeat", "recent", start + 501 * day),
  ], { asOf: start + 510 * day }));
  assert.equal(summary.repeatBuyers, 2);
  assert.equal(summary.medianDaysToSecond, 200.5);
});

test("a retained repeat establishes repeat status despite another uncertain order", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("first", "buyer", start),
    order("confirmed", "buyer", start + day),
    order("uncertain", "buyer", start + 2 * day, { uncertainPayment: true }),
  ], { asOf: start + 400 * day }));
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(horizon(summary, 30).repeats, 1);
  assert.equal(horizon(summary, 30).ordersPerBuyer, null);
});

test("same-project summary counts reorder orders and leaves unknown project scope null", () => {
  const start = t("2025-01-01T00:00:00Z");
  const known = summarize(input([
    order("first", "buyer", start, { project: "real" }),
    order("same-1", "buyer", start + day, { project: "real" }),
    order("same-2", "buyer", start + 2 * day, { project: "real" }),
  ], { asOf: start + 400 * day }));
  assert.equal(known.sameProjectRepeats, 2);

  const summary = summarize(input([
    order("first", "buyer", start, { project: "real" }),
    order("null-project", "buyer", start + day, { project: null }),
  ], { asOf: start + 400 * day }));
  assert.equal(summary.sameProjectRepeats, null);
});

test("filter options remain complete and earliest includes verified purchases without identity", () => {
  const old = t("2024-12-01T12:00:00Z");
  const start = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("anonymous", null, old, { campaign: "unattributed" }),
    order("jan", "jan", start, { campaign: "one" }),
    order("feb", "feb", t("2025-02-01T12:00:00Z"), { campaign: "two" }),
  ], { month: "2025-01", campaign: "one" }));
  assert.equal(summary.earliest, old);
  assert.deepEqual(summary.months, ["2025-01", "2025-02"]);
  assert.deepEqual(summary.campaigns, ["one", "two"]);
});

test("stable parent ID resolves same-time order ties", () => {
  const start = t("2025-01-01T00:00:00Z");
  const summary = summarize(input([
    order("anchor", "buyer", start),
    order("same-time-repeat", "buyer", start),
  ], { asOf: start + 400 * day }));
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(summary.medianDaysToSecond, 0);
});

test("payback uses the first displayed known horizon and handles negative contribution", () => {
  const start = t("2025-01-01T12:00:00Z");
  const budget = [{ month: "2025-01", campaign: "campaign-a", media: 500, fees: 0, credits: 0, complete: true }];
  const profitable = summarize(input([
    order("one", "buyer", start), order("two", "buyer", start + 40 * day),
  ], {
    month: "2025-01", campaign: "campaign-a", budgets: budget,
  }));
  assert.equal(horizon(profitable, 30).gapPerBuyer, 100);
  assert.equal(horizon(profitable, 60).gapPerBuyer, -300);
  assert.equal(profitable.paybackDay, 60);

  const loss = summarize(input([order("one", "buyer", start, { cost: 2_000 })], {
    month: "2025-01", campaign: "campaign-a", budgets: budget,
  }));
  assert.equal(horizon(loss, 30).contributionPerBuyer, -1_100);
  assert.equal(loss.paybackDay, null);
});

test("partial maturity suppresses gap and payback until the full cohort reaches a horizon", () => {
  const start = t("2025-01-01T12:00:00Z");
  const summary = summarize(input([
    order("old", "old", start), order("new", "new", start + 20 * day),
  ], { asOf: start + 45 * day, month: "2025-01", campaign: "campaign-a",
    budgets: [{ month: "2025-01", campaign: "campaign-a", media: 100, fees: 0, credits: 0, complete: true }] }));
  assert.equal(horizon(summary, 30).mature, 1);
  assert.equal(horizon(summary, 30).gapPerBuyer, null);
  assert.equal(summary.paybackDay, null);
  assert.equal(horizon(summary, 365).mature, 0);
});

test("unknown attribution prevents CAC after anchoring", () => {
  const start = t("2025-01-05T12:00:00Z");
  const summary = summarize(input([
    order("known", "buyer", start),
    order("unknown-attribution", null, start + 10_000, { campaign: null }),
  ], { month: "2025-01", campaign: "campaign-a", budgets: [
    { month: "2025-01", campaign: "campaign-a", media: 1_000, fees: 0, credits: null, complete: true },
  ] }));
  assert.equal(summary.buyers, 1);
  assert.equal(summary.cac, null);
  assert.equal(summary.credits, null);
});
