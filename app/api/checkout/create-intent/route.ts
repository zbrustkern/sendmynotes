import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { saveOrder, getSystemConfig } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { PaymentModeConfigError, normalizeStripeSecretKey, resolvePaymentMode } from "@/lib/payment-mode";
import { validatePersonalSender } from "@/lib/order-processor";
import { issueOfferPriceQuote, reserveOfferForCheckout } from "@/lib/offer-engine";
import { Order, MailingAddress, RecipientOccasion } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";
import { saveOccasionReminder } from "@/lib/reminders";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { resolveOperationId, operationMetadata, withOperationId } from "@/lib/operation-diagnostics";
import { normalizeCountryCode, validateMailingAddress, getEnabledDestination, authorizeInternationalCheckout, isStagingInternationalPreview, isProductionInternationalEnabled } from "@/lib/mailing-destinations";
import { calculateOrderQuote } from "@/lib/order-pricing";
import { sanitizeOrderAttribution } from "@/lib/order-attribution";

export async function POST(req: NextRequest) {
  const operationId = resolveOperationId(req, "checkout");
  try {
    if (await isOperationalControlPaused("checkout")) {
      return withOperationId(NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly.", code: "CHECKOUT_PAUSED", operationId }, { status: 503 }), operationId);
    }
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
      attribution: rawAttribution,
      recipientOccasion,
      occasion,
      sessionId,
      experienceVersion,
    } = body;

    const isAddressDeferred = Boolean(body.addressDeferred || body.address_deferred);
    const attribution = sanitizeOrderAttribution(rawAttribution);
    let isFounderTest = req.cookies.get("smn_founder_device")?.value === "1";
    if (!isFounderTest && typeof sessionId === "string") {
      try {
        const founderRegistry = await getSystemConfig<{ sessionIds?: string[] }>("founder_device_registry");
        isFounderTest = Boolean(founderRegistry?.sessionIds?.includes(sessionId));
      } catch {
        // Classification is best effort; checkout must not depend on the admin registry.
      }
    }
    const normalizedCountry = recipientAddress?.country === undefined ? "US" : normalizeCountryCode(recipientAddress.country);
    if (!normalizedCountry) return NextResponse.json({ error: "A valid recipient country is required." }, { status: 400 });
    const supplierDestination = normalizedCountry === "US" ? null : getEnabledDestination(normalizedCountry);
    let requestedPaymentMode: string | undefined;
    if (normalizedCountry !== "US") {
      try { requestedPaymentMode = resolvePaymentMode(); } catch { requestedPaymentMode = undefined; }
      const authorization = authorizeInternationalCheckout({ countryCode: normalizedCountry, addressDeferred: isAddressDeferred, paymentMode: requestedPaymentMode });
      if (!supplierDestination || !authorization.allowed) {
        return NextResponse.json({ error: authorization.reason || "International destination is unavailable.", code: "DESTINATION_UNAVAILABLE" }, { status: 503 });
      }
    }
    const isInternationalPreview = Boolean(supplierDestination && isStagingInternationalPreview() && !isProductionInternationalEnabled());
    if (normalizedCountry !== "US" && isAddressDeferred) {
      return NextResponse.json({ error: "International mailing requires a complete recipient address before checkout." }, { status: 400 });
    }
    const canonicalRecipientAddress = recipientAddress ? { ...recipientAddress, country: normalizedCountry } : recipientAddress;
    const normalizedReturnCountry = returnAddress?.country === undefined ? "US" : normalizeCountryCode(returnAddress.country);
    if (!normalizedReturnCountry || normalizedReturnCountry !== "US") {
      return NextResponse.json({ error: "A personal United States return address is required." }, { status: 400 });
    }
    const canonicalReturnAddress = returnAddress ? { ...returnAddress, country: "US" } : returnAddress;

    if (!frontImageUrl) {
      return NextResponse.json({ error: "Card cover image is required." }, { status: 400 });
    }

    if (!isAddressDeferred) {
      const addressCheck = validateMailingAddress(canonicalRecipientAddress);
      if (!addressCheck.valid) {
        return NextResponse.json({ error: addressCheck.errors[0] || "Complete recipient address is required." }, { status: 400 });
      }

      const senderValidation = validatePersonalSender(returnAddress);
      if (!senderValidation.valid) {
        return NextResponse.json(
          { error: senderValidation.error || "Complete return address is required." },
          { status: 400 }
        );
      }
    } else {
      if (!recipientAddress || (!recipientAddress.firstName && !recipientAddress.lastName)) {
        return NextResponse.json({ error: "Recipient name is required." }, { status: 400 });
      }
      if (!returnAddress || (!returnAddress.firstName && !returnAddress.lastName)) {
        return NextResponse.json({ error: "Sender name is required." }, { status: 400 });
      }
    }

    // Generate unguessable 128-bit cryptographically secure Order ID and View Token
    const orderId = `order_${crypto.randomBytes(16).toString("hex")}`;
    const viewToken = `tok_${crypto.randomBytes(16).toString("hex")}`;

    // Evaluate discount code if provided
    let finalAmountInCents = CARD_FLAT_RATE_CENTS; // 900
    let discountAmountInCents = 0;
    let appliedCode: string | undefined = undefined;
    let quoteId: string | undefined = undefined;
    let appliedOfferId: string | undefined = undefined;
    let appliedOfferVersion: number | undefined = undefined;

    if (rawDiscountCode && typeof rawDiscountCode === "string" && rawDiscountCode.trim()) {
      const codeToLookup = rawDiscountCode.trim().toUpperCase();
      const quoteResult = await issueOfferPriceQuote({
        code: codeToLookup,
        listPriceCents: CARD_FLAT_RATE_CENTS,
        sessionId,
        nowMs: Date.now(),
      });

      if (!quoteResult.valid) {
        return NextResponse.json(
          { error: quoteResult.error || "Invalid discount code." },
          { status: 400 }
        );
      }

      // Reserve slot transactionally
      const reservation = await reserveOfferForCheckout({
        code: codeToLookup,
        orderId,
        sessionId: sessionId || "sess_checkout",
        quoteId: quoteResult.quote?.quoteId,
      });

      if (!reservation.reserved) {
        return NextResponse.json(
          { error: reservation.error || "This discount code has reached its maximum redemptions limit." },
          { status: 400 }
        );
      }

      appliedCode = quoteResult.offer?.code || codeToLookup;
      discountAmountInCents = quoteResult.discountAmountInCents ?? 0;
      finalAmountInCents = quoteResult.finalAmountInCents ?? CARD_FLAT_RATE_CENTS;
      quoteId = quoteResult.quote?.quoteId;
      appliedOfferId = quoteResult.offer?.offerId;
      appliedOfferVersion = quoteResult.offer?.version;
    }

    const orderQuote = calculateOrderQuote({ countryCode: normalizedCountry, discountCents: discountAmountInCents });
    // Existing offer engine remains the authority for eligible base discounts. The
    // destination upgrade is added server-side and is never discounted.
    finalAmountInCents = orderQuote.totalCents;

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
          recipientAddress: canonicalRecipientAddress as MailingAddress,
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
      const orderRecord: Order & Record<string, unknown> = {
      id: orderId,
      operationId,
        customerEmail,
        ...(userId ? { userId } : {}),
        frontImageUrl,
        printedMessage: printedMessage || "",
        handwrittenNote: handwrittenNote || "",
        fontStyleId,
        ...(occasion ? { occasion } : {}),
        recipientAddress: canonicalRecipientAddress as MailingAddress,
        returnAddress: canonicalReturnAddress as MailingAddress,
        ...(scheduledSendDate ? { scheduledSendDate } : {}),
        ...(recipientOccasion ? { recipientOccasion: recipientOccasion as RecipientOccasion } : {}),
        status: "PENDING_PAYMENT",
        amountInCents: 0,
        originalAmountInCents: CARD_FLAT_RATE_CENTS,
        finalAmountInCents: 0,
        quote: orderQuote,
        ...(supplierDestination ? {
          supplierCountryId: supplierDestination.supplierCountryId,
          supplierCountryName: supplierDestination.supplierCountryName,
          ...(isInternationalPreview ? { isInternationalPreview: true } : {}),
        } : {}),
        ...(isAddressDeferred ? { addressDeferred: true, address_deferred: true, fulfillmentStatus: "AWAITING_RECIPIENT_ADDRESS" } : {}),
        ...(appliedCode ? { discountCode: appliedCode } : {}),
        discountAmountInCents,
        paymentMethod: "PROMO_CODE",
        ...(quoteId ? { quoteId } : {}),
        ...(appliedOfferId ? { appliedOfferId } : {}),
        ...(appliedOfferVersion ? { appliedOfferVersion } : {}),
        listPriceCents: CARD_FLAT_RATE_CENTS,
        isFounderTest,
        ...(attribution ? { attribution } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(experienceVersion ? { experienceVersion } : {}),
        viewToken,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveOrder(orderRecord);
      await maybeSaveReminder();

      return withOperationId(NextResponse.json({
        orderId,
        operationId,
        viewToken,
        isFree: true,
        amountInCents: 0,
        originalAmountInCents: CARD_FLAT_RATE_CENTS,
        finalAmountInCents: 0,
        quote: orderQuote,
        discountCode: appliedCode,
        discountAmountInCents,
        quoteId,
        appliedOfferId,
        appliedOfferVersion,
        clientSecret: null,
        paymentIntentId: null,
        publishableKey: null,
      }), operationId);
    }

    // Create Stripe PaymentIntent for the discounted or standard amount
    const paymentIntentResult = await createCardPaymentIntent({
      orderId,
      customerEmail: customerEmail || undefined,
      amountInCents: finalAmountInCents,
      metadata: {
        operationId,
        recipientCountryCode: normalizedCountry,
        quoteVersion: orderQuote.version,
        quotedTotalCents: String(orderQuote.totalCents),
        surchargeCents: String(orderQuote.internationalSurchargeCents),
        ...(appliedCode
        ? {
            discountCode: appliedCode,
            discountAmountCents: String(discountAmountInCents),
            originalAmountCents: String(CARD_FLAT_RATE_CENTS),
            ...(quoteId ? { quoteId } : {}),
          }
        : {}),
      },
    });

    // Construct and persist draft Order to Firestore
    const orderRecord: Order & Record<string, unknown> = {
      id: orderId,
      operationId,
      stripePaymentId: paymentIntentResult.paymentIntentId,
      customerEmail,
      ...(userId ? { userId } : {}),
      frontImageUrl,
      printedMessage: printedMessage || "",
      handwrittenNote: handwrittenNote || "",
      fontStyleId,
      ...(occasion ? { occasion } : {}),
      recipientAddress: canonicalRecipientAddress as MailingAddress,
      returnAddress: canonicalReturnAddress as MailingAddress,
      ...(scheduledSendDate ? { scheduledSendDate } : {}),
      ...(recipientOccasion ? { recipientOccasion: recipientOccasion as RecipientOccasion } : {}),
      status: "PENDING_PAYMENT",
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      finalAmountInCents,
      quote: orderQuote,
      ...(supplierDestination ? {
        supplierCountryId: supplierDestination.supplierCountryId,
        supplierCountryName: supplierDestination.supplierCountryName,
        ...(isInternationalPreview ? { isInternationalPreview: true } : {}),
      } : {}),
      ...(isAddressDeferred ? { addressDeferred: true, address_deferred: true, fulfillmentStatus: "AWAITING_RECIPIENT_ADDRESS" } : {}),
      ...(appliedCode ? { discountCode: appliedCode } : {}),
      ...(discountAmountInCents > 0 ? { discountAmountInCents } : {}),
      paymentMethod: "STRIPE",
      ...(quoteId ? { quoteId } : {}),
      ...(appliedOfferId ? { appliedOfferId } : {}),
      ...(appliedOfferVersion ? { appliedOfferVersion } : {}),
      listPriceCents: CARD_FLAT_RATE_CENTS,
      isFounderTest,
      ...(attribution ? { attribution } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(experienceVersion ? { experienceVersion } : {}),
      viewToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);
    await maybeSaveReminder();

    const resolvedMode = resolvePaymentMode();
    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env["stripe-publishable-key"] ||
      (resolvedMode === "stripe_test"
        ? "pk_test_51UIUjfQRpUiJEWIAEBVsU9gEPGjYg84rOZRarlTUfW057pYo1YcbkHv00h288Bth0582JDovGyvz1ZfSPen6VSYP00u7h8Ve2Y"
        : null);

    return withOperationId(NextResponse.json({
      orderId,
      operationId,
      viewToken,
      clientSecret: paymentIntentResult.clientSecret,
      paymentIntentId: paymentIntentResult.paymentIntentId,
      publishableKey,
      isMock: paymentIntentResult.isMock,
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      finalAmountInCents,
      quote: orderQuote,
      discountCode: appliedCode,
      discountAmountInCents,
      quoteId,
      appliedOfferId,
      appliedOfferVersion,
      isFree: false,
    }), operationId);
  } catch (error: unknown) {
    if (error instanceof PaymentModeConfigError) {
      const keyInfo = normalizeStripeSecretKey();
      console.error("[Checkout Intent Config Error]", {
        code: error.code,
        keyType: keyInfo.keyType,
        source: keyInfo.source,
      });
      const incidentId = await logIncident({
        type: "STRIPE",
        severity: "error",
        summary: "Stripe Payment Mode Configuration Error",
        technicalDetails: `Code: ${error.code}, Type: ${keyInfo.keyType}, Source: ${keyInfo.source}`,
        metadata: operationMetadata(operationId),
      });

      return withOperationId(NextResponse.json(
        {
          error:
            "Payment is temporarily unavailable. Your card and message are saved. Please try again shortly.",
          code: error.code,
          incidentId,
        },
        { status: error.statusCode }
      ), operationId);
    }

    const rawMsg = error instanceof Error ? error.message : "Error creating checkout intent";
    console.error("[Checkout Intent Error]", rawMsg);

    // Record incident in admin incident feed with sanitized details
    const incidentId = await logIncident({
      type: "STRIPE",
      severity: "error",
      summary: "Stripe PaymentIntent Initialization Error",
      technicalDetails: rawMsg,
      metadata: operationMetadata(operationId),
    });

    return withOperationId(NextResponse.json(
      {
        error:
          "We are temporarily experiencing difficulty connecting to our secure payment gateway. Our studio team has been notified. Please try again in a moment.",
        incidentId,
      },
      { status: 500 }
    ), operationId);
  }
}
