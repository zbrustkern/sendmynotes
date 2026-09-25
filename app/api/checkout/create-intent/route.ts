import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { saveOrder, getDiscountCode } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { validateDiscount } from "@/lib/discount";
import { Order, MailingAddress } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      frontImageUrl,
      printedMessage,
      handwrittenNote,
      fontStyleId = "1",
      recipientAddress,
      returnAddress,
      customerEmail = "",
      userId,
      scheduledSendDate,
      discountCode: rawDiscountCode,
    } = body;

    if (!frontImageUrl) {
      return NextResponse.json({ error: "Card cover image is required." }, { status: 400 });
    }

    if (!recipientAddress || !recipientAddress.street1 || !recipientAddress.city || !recipientAddress.state || !recipientAddress.zip) {
      return NextResponse.json({ error: "Complete recipient address is required." }, { status: 400 });
    }

    if (!returnAddress || !returnAddress.street1 || !returnAddress.city || !returnAddress.state || !returnAddress.zip) {
      return NextResponse.json({ error: "Complete return address is required." }, { status: 400 });
    }

    // Generate unguessable 128-bit cryptographically secure Order ID and View Token
    const orderId = `order_${crypto.randomBytes(16).toString("hex")}`;
    const viewToken = `tok_${crypto.randomBytes(16).toString("hex")}`;

    // Evaluate discount code if provided
    let finalAmountInCents = CARD_FLAT_RATE_CENTS; // 900
    let discountAmountInCents = 0;
    let appliedCode: string | undefined = undefined;

    if (rawDiscountCode && typeof rawDiscountCode === "string" && rawDiscountCode.trim()) {
      const codeToLookup = rawDiscountCode.trim().toUpperCase();
      const discountDoc = await getDiscountCode(codeToLookup);
      const validation = validateDiscount(discountDoc, CARD_FLAT_RATE_CENTS);

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || "Invalid discount code." },
          { status: 400 }
        );
      }

      appliedCode = validation.code;
      discountAmountInCents = validation.discountAmountInCents;
      finalAmountInCents = validation.finalAmountInCents;
    }

    // Handle 100% Free Order (e.g. VIP/Launch Voucher)
    if (finalAmountInCents === 0) {
      const orderRecord: Order = {
        id: orderId,
        customerEmail,
        ...(userId ? { userId } : {}),
        frontImageUrl,
        printedMessage: printedMessage || "",
        handwrittenNote: handwrittenNote || "",
        fontStyleId,
        recipientAddress: recipientAddress as MailingAddress,
        returnAddress: returnAddress as MailingAddress,
        ...(scheduledSendDate ? { scheduledSendDate } : {}),
        status: "PENDING_PAYMENT",
        amountInCents: 0,
        originalAmountInCents: CARD_FLAT_RATE_CENTS,
        ...(appliedCode ? { discountCode: appliedCode } : {}),
        discountAmountInCents,
        paymentMethod: "PROMO_CODE",
        viewToken,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveOrder(orderRecord);

      return NextResponse.json({
        orderId,
        viewToken,
        isFree: true,
        amountInCents: 0,
        originalAmountInCents: CARD_FLAT_RATE_CENTS,
        discountCode: appliedCode,
        discountAmountInCents,
        clientSecret: null,
        paymentIntentId: null,
        publishableKey: null,
      });
    }

    // Create Stripe PaymentIntent for the discounted or standard amount
    const paymentIntentResult = await createCardPaymentIntent({
      orderId,
      customerEmail: customerEmail || undefined,
      amountInCents: finalAmountInCents,
      metadata: appliedCode
        ? {
            discountCode: appliedCode,
            discountAmountCents: String(discountAmountInCents),
            originalAmountCents: String(CARD_FLAT_RATE_CENTS),
          }
        : undefined,
    });

    // Construct and persist draft Order to Firestore
    const orderRecord: Order = {
      id: orderId,
      stripePaymentId: paymentIntentResult.paymentIntentId,
      customerEmail,
      ...(userId ? { userId } : {}),
      frontImageUrl,
      printedMessage: printedMessage || "",
      handwrittenNote: handwrittenNote || "",
      fontStyleId,
      recipientAddress: recipientAddress as MailingAddress,
      returnAddress: returnAddress as MailingAddress,
      ...(scheduledSendDate ? { scheduledSendDate } : {}),
      status: "PENDING_PAYMENT",
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      ...(appliedCode ? { discountCode: appliedCode } : {}),
      ...(discountAmountInCents > 0 ? { discountAmountInCents } : {}),
      paymentMethod: "STRIPE",
      viewToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);

    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env["stripe-publishable-key"] ||
      null;

    return NextResponse.json({
      orderId,
      viewToken,
      clientSecret: paymentIntentResult.clientSecret,
      paymentIntentId: paymentIntentResult.paymentIntentId,
      publishableKey,
      isMock: paymentIntentResult.isMock,
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      discountCode: appliedCode,
      discountAmountInCents,
      isFree: false,
    });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Error creating checkout intent";
    console.error("[Checkout Intent Error]", rawMsg);

    // Record incident in admin incident feed with sanitized details
    const incidentId = await logIncident({
      type: "STRIPE",
      severity: "error",
      summary: "Stripe PaymentIntent Initialization Error",
      technicalDetails: rawMsg,
    });

    return NextResponse.json(
      {
        error:
          "We are temporarily experiencing difficulty connecting to our secure payment gateway. Our studio team has been notified. Please try again in a moment.",
        incidentId,
      },
      { status: 500 }
    );
  }
}
