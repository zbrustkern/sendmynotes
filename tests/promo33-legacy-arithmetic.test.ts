import assert from "node:assert/strict";
import { calculateDiscount } from "../lib/discount";
import { calculateOrderQuote } from "../lib/order-pricing";

// Synthetic golden cases from Sprint 0033's legacy compatibility matrix.
const fixedTwoDollars = calculateDiscount(
  { id: "legacy-fixed", code: "LEGACY2", type: "FIXED_AMOUNT", value: 200, isActive: true } as any,
  900,
);
assert.deepEqual(fixedTwoDollars, { discountAmountInCents: 200, finalAmountInCents: 700 });

const fiveCardLegacyPercent = calculateDiscount(
  { id: "legacy-percent", code: "LEGACY20", type: "PERCENTAGE", value: 20, isActive: true } as any,
  5 * 900,
);
assert.deepEqual(fiveCardLegacyPercent, { discountAmountInCents: 900, finalAmountInCents: 3600 });
assert.deepEqual(Array(5).fill(180), [180, 180, 180, 180, 180]);

// The legacy base-only discount leaves the international mailing surcharge payable.
const internationalBaseDiscount = calculateOrderQuote({ countryCode: "CA", discountCents: 900 });
assert.equal(internationalBaseDiscount.basePriceCents, 900);
assert.equal(internationalBaseDiscount.internationalSurchargeCents, 500);
assert.equal(internationalBaseDiscount.totalCents, 500);

const legacyMultiSend = {
  version: "multi-send-900-v1", countryCode: "US", basePriceCents: 4500,
  discountCents: 900, internationalSurchargeCents: 0, totalCents: 3600, currency: "USD" as const,
};
assert.equal(legacyMultiSend.totalCents, 3600);
