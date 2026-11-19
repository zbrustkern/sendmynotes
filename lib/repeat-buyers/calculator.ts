import type { CohortInput, CohortSummary, Horizon, Purchase } from "./contract";

const HORIZONS = [30, 60, 90, 180, 365] as const;
const DAY = 86_400_000;
const UNKNOWN = "unknown";

type Observed = { purchase: Purchase };
type Anchor = { buyer: string; first: Observed };
type Outcome = { observed: Observed; retained: boolean; revenue: number | null; cost: number | null };

const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit" });
function monthAt(at: number): string {
  const parts = monthFormat.formatToParts(at);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

function compare(a: Observed, b: Observed): number {
  return a.purchase.at - b.purchase.at || (a.purchase.id < b.purchase.id ? -1 : a.purchase.id > b.purchase.id ? 1 : 0);
}

function adjustmentTotals(p: Purchase, asOf: number, end: number) {
  let reversal = 0;
  let extraCost = 0;
  let reversedTax: number | null = 0;
  for (const a of p.adjustments) {
    if (a.knownAt > asOf || a.at > end) continue;
    if (a.kind === "refund" || a.kind === "lost") {
      reversal += a.cents;
      if (p.tax && a.cents > 0) {
        if (reversedTax === null || !Number.isSafeInteger(a.reversedTaxCents) ||
            a.reversedTaxCents! < 0 || a.reversedTaxCents! > a.cents) reversedTax = null;
        else reversedTax += a.reversedTaxCents!;
      }
    } else extraCost += a.cents;
  }
  return { reversal: Math.min(Math.max(0, p.gross), reversal), reversedTax, extraCost };
}

function outcome(observed: Observed, asOf: number, end: number): Outcome {
  const p = observed.purchase;
  const { reversal, reversedTax, extraCost } = adjustmentTotals(p, asOf, end);
  const retained = !p.uncertainPayment && reversal < p.gross;
  const revenue = reversal === p.gross ? 0 : p.tax === null || reversedTax === null || reversedTax > p.tax ||
    p.tax - reversedTax > p.gross - reversal ? null : p.gross - reversal - (p.tax - reversedTax);
  return { observed, retained, revenue, cost: p.cost === null ? null : p.cost + extraCost };
}

function metric(anchors: Anchor[], grouped: Map<string, Observed[]>, days: number,
  input: CohortInput, cac: number | null): Horizon {
  const mature = anchors.filter((a) => input.asOf >= a.first.purchase.at + days * DAY);
  if (!input.historyComplete) return {
    days, mature: null, repeats: null, ordersPerBuyer: null, revenuePerBuyer: null,
    contributionPerBuyer: null, gapPerBuyer: null, missingCosts: null,
  };

  const endFor = (a: Anchor) => a.first.purchase.at + days * DAY;
  const scopes = mature.map((a) => {
    const orders = (grouped.get(a.buyer) ?? []).filter((o) => compare(o, a.first) >= 0 &&
      o.purchase.knownAt <= input.asOf && o.purchase.at <= endFor(a))
      .map((o) => outcome(o, input.asOf, endFor(a)));
    const repeatOrders = orders.filter((o) => compare(o.observed, a.first) > 0);
    const hasRetainedRepeat = repeatOrders.some((o) => o.retained && !o.observed.purchase.uncertainPayment);
    const unknownRepeat = !hasRetainedRepeat && repeatOrders.some((o) => o.observed.purchase.uncertainPayment);
    return { orders, repeatOrders, hasRetainedRepeat, unknownRepeat };
  });
  const repeats = scopes.some((s) => s.unknownRepeat) ? null :
    scopes.filter((s) => s.hasRetainedRepeat).length;
  const retainedUnknown = scopes.some((s) => s.orders.some((o) => o.observed.purchase.uncertainPayment));
  const ordersPerBuyer = retainedUnknown || !scopes.length ? null : scopes.reduce((sum, s) =>
    sum + s.orders.filter((o) => o.retained).length, 0) / scopes.length;
  const moneyUnknown = scopes.some((s) => s.orders.some((o) =>
    o.observed.purchase.uncertainPayment || o.revenue === null));
  const missingCosts = scopes.reduce((sum, s) => sum + s.orders.filter((o) => o.cost === null).length, 0);
  const revenuePerBuyer = moneyUnknown || !scopes.length ? null : scopes.reduce((sum, s) =>
    sum + s.orders.reduce((n, o) => n + (o.revenue ?? 0), 0), 0) / scopes.length;
  const contributionPerBuyer = moneyUnknown || missingCosts > 0 || !scopes.length ? null : scopes.reduce((sum, s) =>
    sum + s.orders.reduce((n, o) => n + (o.revenue ?? 0) - (o.cost ?? 0), 0), 0) / scopes.length;
  const gapPerBuyer = cac === null || contributionPerBuyer === null || scopes.length !== anchors.length
    ? null : cac - contributionPerBuyer;
  return { days, mature: scopes.length, repeats, ordersPerBuyer, revenuePerBuyer,
    contributionPerBuyer, gapPerBuyer, missingCosts };
}

export function summarize(input: CohortInput): CohortSummary {
  // Preserve first-seen order for duplicate IDs and order equal timestamps by parent ID.
  const ids = new Set<string>();
  const verified: Observed[] = [];
  input.purchases.forEach((purchase) => {
    if (ids.has(purchase.id)) return;
    ids.add(purchase.id);
    if (purchase.at <= input.asOf && purchase.knownAt <= input.asOf) verified.push({ purchase });
  });
  const grouped = new Map<string, Observed[]>();
  for (const observed of verified) {
    const buyer = observed.purchase.buyer;
    if (buyer === null) continue;
    const list = grouped.get(buyer) ?? [];
    list.push(observed);
    grouped.set(buyer, list);
  }
  for (const list of grouped.values()) list.sort(compare);

  const allAnchors: Anchor[] = [...grouped].map(([buyer, orders]) => ({ buyer, first: orders[0] }));
  const selected = allAnchors.filter(({ first }) =>
    (!input.month || monthAt(first.purchase.at) === input.month) &&
    (!input.campaign || (first.purchase.campaign ?? UNKNOWN) === input.campaign));
  selected.sort((a, b) => compare(a.first, b.first));

  // These option lists describe all available cohorts, regardless of active filters.
  const months = [...new Set([...allAnchors.map(a => monthAt(a.first.purchase.at)), ...input.budgets.map(b => b.month)])].sort();
  const campaigns = [...new Set([...allAnchors.map(a => a.first.purchase.campaign ?? UNKNOWN), ...input.budgets.map(b => b.campaign)])].sort();
  const matching = input.budgets.filter(b => (!input.month || b.month === input.month) &&
    (!input.campaign || b.campaign === input.campaign));
  const uniquePeriods = new Set(matching.map(b => JSON.stringify([b.month, b.campaign]))).size === matching.length;
  const knownSpend = matching.length > 0 && uniquePeriods;
  const mediaSpend = knownSpend ? matching.reduce((n, b) => n + b.media, 0) : null;
  const grossSpend = mediaSpend !== null && matching.every(b => b.fees !== null)
    ? matching.reduce((n, b) => n + b.fees!, mediaSpend) : null;
  const credits = knownSpend && matching.every(b => b.credits !== null)
    ? matching.reduce((n, b) => n + b.credits!, 0) : null;
  const budget = input.month && input.campaign && matching.length === 1 ? matching[0] : null;
  const closed = input.month !== undefined && monthAt(input.asOf) > input.month;
  // Unknown identity or campaign attribution in the selected acquisition month makes
  // the filtered buyer denominator incomplete, even if an exact budget is present.
  const unknownScope = verified.some(o => o.purchase.buyer === null && monthAt(o.purchase.at) === input.month) ||
    allAnchors.some(a => monthAt(a.first.purchase.at) === input.month && !a.first.purchase.campaign);
  const cacEligible = input.historyComplete && input.acquisitionComplete && closed &&
    input.campaign !== UNKNOWN && selected.length > 0 && !unknownScope && budget?.complete === true && grossSpend !== null;
  const cac = cacEligible ? grossSpend! / selected.length : null;

  const rows = HORIZONS.map((days) => metric(selected, grouped, days, input, cac));
  const payback = rows.find((row) => row.gapPerBuyer !== null && row.gapPerBuyer <= 0);
  const paybackDay = payback?.days ?? null;

  let fullyReversed = 0;
  let uncertainOrders = 0;
  for (const observed of verified) {
    if (observed.purchase.uncertainPayment) uncertainOrders++;
    if (!observed.purchase.uncertainPayment && !outcome(observed, input.asOf, input.asOf).retained) fullyReversed++;
  }

  // Summary repeaters are observed through the cutoff, with no 365-day restriction.
  const repeatFlags = selected.map((a) => {
    const later = (grouped.get(a.buyer) ?? []).filter((o) => compare(o, a.first) > 0)
      .map((o) => outcome(o, input.asOf, input.asOf));
    const retained = later.filter((o) => o.retained && !o.observed.purchase.uncertainPayment);
    const uncertain = later.some((o) => o.observed.purchase.uncertainPayment);
    return { a, later, retained, uncertain };
  });
  const summaryRepeatUnknown = !input.historyComplete || repeatFlags.some((f) => !f.retained.length && f.uncertain);
  const repeatBuyers = summaryRepeatUnknown ? null : repeatFlags.filter((f) => f.retained.length > 0).length;
  const repeatOrders = repeatFlags.flatMap((f) => f.retained.map((o) => ({ anchor: f.a, order: o })));
  const secondDays = repeatFlags.flatMap((f) => f.retained.length ? [f.retained
    .sort((x, y) => compare(x.observed, y.observed))[0].observed.purchase.at - f.a.first.purchase.at] : [])
    .sort((a, b) => a - b);
  const secondTimeUncertain = repeatFlags.some(f => f.later.some(o => o.observed.purchase.uncertainPayment &&
    (!f.retained.length || compare(o.observed, f.retained[0].observed) < 0)));
  const medianDaysToSecond = summaryRepeatUnknown || secondTimeUncertain ? null : secondDays.length ?
    (secondDays.length % 2 ? secondDays[(secondDays.length - 1) / 2] :
      (secondDays[secondDays.length / 2 - 1] + secondDays[secondDays.length / 2]) / 2) / DAY : null;
  const projectKnown = selected.some((a) => a.first.purchase.project !== null) ||
    repeatOrders.some(({ order }) => order.observed.purchase.project !== null);
  const projectUnknown = repeatFlags.some((f) =>
    (f.retained.length > 0 && f.a.first.purchase.project === null) ||
    f.later.some((o) => (o.retained || o.observed.purchase.uncertainPayment) &&
      o.observed.purchase.project === null));
  const sameProjectRepeats = !input.historyComplete || summaryRepeatUnknown || !projectKnown || projectUnknown ? null :
    repeatOrders.filter(({ anchor, order }) => anchor.first.purchase.project !== null &&
      order.observed.purchase.project === anchor.first.purchase.project).length;

  const paidReacquisition = input.historyComplete ? selected.reduce((sum, anchor) =>
    sum + (grouped.get(anchor.buyer) ?? []).reduce((n, o) => n + o.purchase.adjustments
      .filter(a => a.kind === "reacquisition" && a.knownAt <= input.asOf && a.at <= input.asOf)
      .reduce((total, a) => total + a.cents, 0), 0), 0) : null;
  return {
    earliest: verified.length ? Math.min(...verified.map((o) => o.purchase.at)) : null,
    months: input.historyComplete ? months : [...new Set(input.budgets.map(b => b.month))], campaigns: input.historyComplete ? campaigns : [...new Set(input.budgets.map(b => b.campaign))],
    buyers: input.historyComplete ? selected.length : null, repeatBuyers, medianDaysToSecond,
    sameProjectRepeats, fullyReversed, uncertainOrders, rows, grossSpend, mediaSpend, paidReacquisition, credits, cac, paybackDay,
  };
}
