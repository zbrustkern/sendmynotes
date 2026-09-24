import { NextRequest, NextResponse } from "next/server";
import { getDiscountCode } from "@/lib/firebase-admin";
import { validateDiscount } from "@/lib/discount";
import { CARD_FLAT_RATE_CENTS } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCode = body?.code;

    if (!rawCode || typeof rawCode !== "string") {
      return NextResponse.json({ valid: false, error: "Please enter a discount code." }, { status: 400 });
    }

    const code = rawCode.trim().toUpperCase();
    const discountDoc = await getDiscountCode(code);

    const subtotalCents = CARD_FLAT_RATE_CENTS; // $9.00
    const result = validateDiscount(discountDoc, subtotalCents);

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error || "Invalid discount code.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.code,
      type: result.type,
      value: result.value,
      description: result.description,
      discountAmountInCents: result.discountAmountInCents,
      finalAmountInCents: result.finalAmountInCents,
      isFree: result.finalAmountInCents === 0,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error validating discount code";
    console.error("[Discount Validate Error]:", msg);
    return NextResponse.json({ valid: false, error: "Unable to validate code at this time." }, { status: 500 });
  }
}
