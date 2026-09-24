import { DiscountCode } from "./types";

export interface DiscountCalculationResult {
  valid: boolean;
  error?: string;
  code?: string;
  type?: "PERCENTAGE" | "FIXED_AMOUNT";
  value?: number;
  description?: string;
  discountAmountInCents: number;
  finalAmountInCents: number;
}

/**
 * Calculates the discount amount in cents and resulting final subtotal.
 * Clamps discount so the final amount is never less than $0.00.
 */
export function calculateDiscount(
  discount: DiscountCode,
  subtotalCents: number
): { discountAmountInCents: number; finalAmountInCents: number } {
  let discountAmountInCents = 0;

  if (discount.type === "PERCENTAGE") {
    // value is percentage (1-100)
    const pct = Math.max(0, Math.min(100, discount.value));
    discountAmountInCents = Math.round((subtotalCents * pct) / 100);
  } else if (discount.type === "FIXED_AMOUNT") {
    // value is stored in cents
    discountAmountInCents = Math.max(0, discount.value);
  }

  // Ensure discount does not exceed the subtotal
  discountAmountInCents = Math.min(discountAmountInCents, subtotalCents);
  const finalAmountInCents = Math.max(0, subtotalCents - discountAmountInCents);

  return { discountAmountInCents, finalAmountInCents };
}

/**
 * Validates whether a discount code can currently be redeemed.
 * Checks active state, expiration timestamp, and usage caps.
 */
export function validateDiscount(
  discount: DiscountCode | null,
  subtotalCents: number
): DiscountCalculationResult {
  if (!discount) {
    return {
      valid: false,
      error: "Discount code not found.",
      discountAmountInCents: 0,
      finalAmountInCents: subtotalCents,
    };
  }

  if (!discount.isActive) {
    return {
      valid: false,
      error: "This discount code is currently inactive.",
      discountAmountInCents: 0,
      finalAmountInCents: subtotalCents,
    };
  }

  if (discount.expiresAt && Date.now() > discount.expiresAt) {
    return {
      valid: false,
      error: "This discount code has expired.",
      discountAmountInCents: 0,
      finalAmountInCents: subtotalCents,
    };
  }

  if (discount.maxUses != null && discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
    return {
      valid: false,
      error: "This discount code has reached its maximum redemptions limit.",
      discountAmountInCents: 0,
      finalAmountInCents: subtotalCents,
    };
  }

  const { discountAmountInCents, finalAmountInCents } = calculateDiscount(
    discount,
    subtotalCents
  );

  return {
    valid: true,
    code: discount.code,
    type: discount.type,
    value: discount.value,
    description: discount.description,
    discountAmountInCents,
    finalAmountInCents,
  };
}
