import { createHash } from "node:crypto";
import {
  quoteWeddingBatch,
  WEDDING_PRICE_BANDS,
  WEDDING_PRICE_VERSION,
} from "../wedding-pricing";
import { INTERNATIONAL_SURCHARGE_CENTS } from "../order-pricing";
import { MAILING_DESTINATIONS_VERSION } from "../mailing-destinations";

export type TaxPolicy = {
  version: string;
  provider: string | null;
  mode: "inclusive" | "added";
  calculation: "unassessed" | "calculated";
};
type TaxAmounts = {
  includedTaxCents: number | null;
  addedTaxCents: number;
  calculationRef: string | null;
  expiresAt: number | null;
};
export type PriceInput = {
  id: string;
  country: string;
  region: string;
  postal: string;
  contentHash: string;
  revision: number;
};
export interface WeddingTaxCalculator {
  policy: TaxPolicy;
  /**
   * Pure allocation of an already obtained provider calculation. A future network
   * adapter fetches and stores that short-lived calculation before entering the
   * Firestore reservation transaction, then rechecks expiry and content revisions.
   */
  calculate(
    inputs: ReadonlyArray<
      PriceInput & { baseCents: number; mailingCents: number }
    >,
  ): TaxAmounts[];
}
const pilotTax: WeddingTaxCalculator = {
  policy: {
    version: "pilot-all-in-1",
    mode: "inclusive",
    provider: null,
    calculation: "unassessed",
  },
  calculate: (rows) =>
    rows.map(() => ({
      includedTaxCents: null,
      addedTaxCents: 0,
      calculationRef: null,
      expiresAt: null,
    })),
};

// Firestore does not preserve the insertion order of map keys. Hash explicit canonical data.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}
export function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function priceWeddingSelection(
  projectId: string,
  purchased: number,
  rows: PriceInput[],
  tax = pilotTax,
) {
  if (
    !rows.length ||
    rows.length > 100 ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    throw new Error("Select 1 to 100 different households.");
  const bandQuote = quoteWeddingBatch(rows.length, purchased);
  const prices = rows.map((r, i) => {
    const ordinal = purchased + i + 1;
    const band = WEDDING_PRICE_BANDS.find(
      (b) => b.last === null || ordinal <= b.last,
    )!;
    return {
      ...r,
      ordinal,
      baseCents: band.unitCents,
      mailingCents: r.country === "US" ? 0 : INTERNATIONAL_SURCHARGE_CENTS,
    };
  });
  const allocations = tax.calculate(prices);
  if (allocations.length !== prices.length)
    throw new Error("Tax could not be calculated for every household.");
  const lines = prices.map((r, i) => {
    const a = allocations[i];
    const listedCents = r.baseCents + r.mailingCents;
    if (
      !a ||
      !Number.isSafeInteger(a.addedTaxCents) ||
      a.addedTaxCents < 0 ||
      (a.includedTaxCents !== null &&
        (!Number.isSafeInteger(a.includedTaxCents) ||
          a.includedTaxCents < 0 ||
          a.includedTaxCents > listedCents)) ||
      (tax.policy.mode === "inclusive" && a.addedTaxCents !== 0) ||
      (tax.policy.calculation === "calculated" &&
        (a.includedTaxCents === null || !a.calculationRef)) ||
      (a.expiresAt !== null && a.expiresAt <= Date.now())
    )
      throw new Error("Tax calculation requires a new quote.");
    return {
      householdId: r.id,
      ordinal: r.ordinal,
      country: r.country,
      expectedRevision: r.revision,
      contentHash: r.contentHash,
      components: { card: r.baseCents, internationalMailing: r.mailingCents },
      jurisdictionRef: r.contentHash,
      baseCents: r.baseCents,
      mailingCents: r.mailingCents,
      listedCents,
      ...a,
      totalCents: listedCents + a.addedTaxCents,
    };
  });
  const quote = {
    schemaVersion: 1 as const,
    pricingVersion: WEDDING_PRICE_VERSION,
    destinationVersion: MAILING_DESTINATIONS_VERSION,
    currency: "USD" as const,
    tax: tax.policy,
    previouslyPurchased: purchased,
    count: rows.length,
    bands: bandQuote.lines,
    lines,
    baseCents: bandQuote.subtotalCents,
    mailingCents: lines.reduce((n, line) => n + line.mailingCents, 0),
    includedTaxCents:
      tax.policy.calculation === "unassessed"
        ? null
        : lines.reduce((n, line) => n + (line.includedTaxCents ?? 0), 0),
    addedTaxCents: lines.reduce((n, line) => n + line.addedTaxCents, 0),
    totalCents: lines.reduce((n, line) => n + line.totalCents, 0),
  };
  return { ...quote, id: digest([projectId, quote]) };
}
export type WeddingQuote = ReturnType<typeof priceWeddingSelection>;
export type WeddingQuoteLine = WeddingQuote["lines"][number];
