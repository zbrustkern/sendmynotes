export const ORDER_PRICE_VERSION = "base900-international500-v1";
export const INTERNATIONAL_SURCHARGE_CENTS = 500;
export interface OrderQuote {
  version: string;
  countryCode: string;
  basePriceCents: number;
  discountCents: number;
  internationalSurchargeCents: number;
  totalCents: number;
  currency: "USD";
}

/** Discounts only reduce the $9 base; the $5 destination surcharge stays payable. */
export function calculateOrderQuote(input: { countryCode: string; discountCents?: number }): OrderQuote {
  if (!/^[A-Z]{2}$/.test(input.countryCode)) throw new Error("A canonical ISO-2 country code is required.");
  const basePriceCents = 900;
  const surcharge = input.countryCode === "US" ? 0 : INTERNATIONAL_SURCHARGE_CENTS;
  const rawDiscount = input.discountCents ?? 0;
  if (!Number.isSafeInteger(rawDiscount) || rawDiscount < 0) throw new Error("Discount must be a nonnegative safe integer amount in cents.");
  const discountCents = Math.min(basePriceCents, rawDiscount);
  return Object.freeze({
    version: ORDER_PRICE_VERSION,
    countryCode: input.countryCode,
    basePriceCents,
    discountCents,
    internationalSurchargeCents: surcharge,
    totalCents: Math.max(0, basePriceCents - discountCents) + surcharge,
    currency: "USD",
  });
}


export function isOrderQuoteValid(quote: OrderQuote | null | undefined): quote is OrderQuote {
  if (!quote || quote.version !== ORDER_PRICE_VERSION || quote.currency !== "USD") return false;
  if (!/^[A-Z]{2}$/.test(quote.countryCode)) return false;
  if (!Number.isSafeInteger(quote.basePriceCents) || quote.basePriceCents !== 900) return false;
  if (!Number.isSafeInteger(quote.discountCents) || quote.discountCents < 0 || quote.discountCents > quote.basePriceCents) return false;
  const expectedSurcharge = quote.countryCode === "US" ? 0 : INTERNATIONAL_SURCHARGE_CENTS;
  return Number.isSafeInteger(quote.internationalSurchargeCents) && Number.isSafeInteger(quote.totalCents) &&
    quote.internationalSurchargeCents === expectedSurcharge &&
    quote.totalCents === quote.basePriceCents - quote.discountCents + expectedSurcharge;
}


export function isFreeOrderEligible(input: {
  countryCode: string | null;
  amountInCents: number;
  finalAmountInCents?: number;
  quoteCountryCode?: string;
  quoteTotalCents?: number;
}): boolean {
  return input.countryCode === "US" && Number.isInteger(input.amountInCents) && input.amountInCents === 0 &&
    (input.finalAmountInCents == null || input.finalAmountInCents === 0) &&
    (input.quoteCountryCode == null || input.quoteCountryCode === "US") &&
    (input.quoteTotalCents == null || input.quoteTotalCents === 0);
}
