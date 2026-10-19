import { NextRequest, NextResponse } from "next/server";
import { issueOfferPriceQuote, releaseOfferReservation } from "@/lib/offer-engine";
import { CARD_FLAT_RATE_CENTS } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCode = body?.code;

    if (!rawCode || typeof rawCode !== "string") {
      return NextResponse.json({ valid: false, error: "Please enter a discount code." }, { status: 400 });
    }

    const code = rawCode.trim().toUpperCase();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
    const journeyId = typeof body?.journeyId === "string" ? body.journeyId : undefined;

    // Issue authoritative server price quote with 30-minute validity
    const result = await issueOfferPriceQuote({
      code,
      listPriceCents: CARD_FLAT_RATE_CENTS,
      sessionId,
      journeyId,
      nowMs: Date.now(),
    });

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error || "Invalid discount code.",
          status: result.status,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.offer?.code || code,
      type: result.offer?.discountType || "PERCENTAGE",
      value: result.offer?.discountValue || 0,
      description: result.offer?.purpose || "",
      discountAmountInCents: result.discountAmountInCents ?? 0,
      finalAmountInCents: result.finalAmountInCents ?? CARD_FLAT_RATE_CENTS,
      isFree: Boolean(result.isFree),
      quoteId: result.quote?.quoteId,
      offerId: result.offer?.offerId,
      offerVersion: result.offer?.version,
      quoteExpiresAt: result.quote?.expiresAt,
      lifecycleStatus: result.status || "active",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error validating discount code";
    console.error("[Discount Validate Error]:", msg);
    return NextResponse.json({ valid: false, error: "Unable to validate code at this time." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body?.orderId;
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }
    const released = await releaseOfferReservation(orderId, "removed");
    return NextResponse.json({ success: true, released });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error releasing reservation";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
