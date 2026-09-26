import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { saveOrder, getDiscountCode } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { validateDiscount } from "@/lib/discount";
import { Order, MailingAddress, RecipientOccasion } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";
import { saveOccasionReminder } from "@/lib/reminders";

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
      attribution,
      recipientOccasion,
      occasion,
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

    const maybeSaveReminder = async () => {
      if (
        recipientOccasion &&
        recipientOccasion.remindMe &&
        customerEmail &&
        recipientOccasion.month &&
        recipientOccasion.day
      ) {
        const recName =
          `${recipientAddress.firstName || ""} ${recipientAddress.lastName || ""}`.trim() ||
          "Recipient";
        await saveOccasionReminder({
          recipientName: recName,
          recipientAddress: recipientAddress as MailingAddress,
          userEmail: customerEmail,
          ...(userId ? { userId } : {}),
          occasionType: recipientOccasion.occasionType || "birthday",
          occasionTitle:
            recipientOccasion.occasionTitle ||
            `${recipientOccasion.occasionType ? recipientOccasion.occasionType.charAt(0).toUpperCase() + recipientOccasion.occasionType.slice(1) : "Occasion"} Reminder`,
          month: Number(recipientOccasion.month),
          day: Number(recipientOccasion.day),
          ...(recipientOccasion.year ? { year: Number(recipientOccasion.year) } : {}),
          remindDaysBefore: recipientOccasion.remindDaysBefore || 14,
          optIn: true,
          orderId,
        }).catch((err) => console.warn("[Checkout] Non-critical error saving reminder:", err));
      }
    };

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
        ...(occasion ? { occasion } : {}),
        recipientAddress: recipientAddress as MailingAddress,
        returnAddress: returnAddress as MailingAddress,
        ...(scheduledSendDate ? { scheduledSendDate } : {}),
        ...(recipientOccasion ? { recipientOccasion: recipientOccasion as RecipientOccasion } : {}),
        status: "PENDING_PAYMENT",
        amountInCents: 0,
        originalAmountInCents: CARD_FLAT_RATE_CENTS,
        ...(appliedCode ? { discountCode: appliedCode } : {}),
        discountAmountInCents,
        paymentMethod: "PROMO_CODE",
        ...(attribution ? { attribution } : {}),
        viewToken,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveOrder(orderRecord);
      await maybeSaveReminder();

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
      ...(occasion ? { occasion } : {}),
      recipientAddress: recipientAddress as MailingAddress,
      returnAddress: returnAddress as MailingAddress,
      ...(scheduledSendDate ? { scheduledSendDate } : {}),
      ...(recipientOccasion ? { recipientOccasion: recipientOccasion as RecipientOccasion } : {}),
      status: "PENDING_PAYMENT",
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      ...(appliedCode ? { discountCode: appliedCode } : {}),
      ...(discountAmountInCents > 0 ? { discountAmountInCents } : {}),
      paymentMethod: "STRIPE",
      ...(attribution ? { attribution } : {}),
      viewToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);
    await maybeSaveReminder();

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
