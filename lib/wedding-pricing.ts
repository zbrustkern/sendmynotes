/** Wedding card rates apply in order of purchase across all eligible destinations. */
export const WEDDING_PRICE_VERSION = "wedding-graduated-pilot-v1";

export const WEDDING_PRICE_BANDS = [
  { first: 1, last: 10, unitCents: 900 },
  { first: 11, last: 25, unitCents: 750 },
  { first: 26, last: 99, unitCents: 700 },
  { first: 100, last: null, unitCents: 650 },
] as const;

export interface WeddingPriceLine {
  first: number;
  last: number;
  quantity: number;
  unitCents: number;
  subtotalCents: number;
}

/** Tax-inclusive USD card subtotal. Destination mailing is allocated per selected household. */
export function quoteWeddingBatch(selected: number, previouslyPurchased = 0) {
  if (
    ![selected, previouslyPurchased].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    )
  ) {
    throw new RangeError("Card counts must be nonnegative whole numbers.");
  }
  const end = previouslyPurchased + selected;
  if (!Number.isSafeInteger(end))
    throw new RangeError("Project quantity is too large.");

  const lines: WeddingPriceLine[] = [];
  let subtotalCents = 0;
  for (const band of WEDDING_PRICE_BANDS) {
    if (selected === 0 || band.first > end) break;
    const first = Math.max(previouslyPurchased + 1, band.first);
    const last = Math.min(end, band.last ?? end);
    if (last < first) continue;
    const quantity = last - first + 1;
    const lineCents = quantity * band.unitCents;
    subtotalCents += lineCents;
    if (!Number.isSafeInteger(subtotalCents))
      throw new RangeError("Quote exceeds currency precision.");
    lines.push({
      first,
      last,
      quantity,
      unitCents: band.unitCents,
      subtotalCents: lineCents,
    });
  }
  return {
    version: WEDDING_PRICE_VERSION,
    currency: "USD" as const,
    selected,
    previouslyPurchased,
    lines,
    subtotalCents,
  };
}
