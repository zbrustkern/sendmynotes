import { validateFollowupLinkForCheckout } from "@/lib/post-purchase/attribution";
import { resolveAccountOrderAssociation } from "@/lib/account/order-association";
import { AccountError, accountError } from "@/lib/account/http";
import { pinGeneratedOrderMaster } from "@/lib/account/order-front";
import { pinUploadOrderMaster, verifyResumedOrderSelection } from "@/lib/upload/order-master";
import { UploadError } from "@/lib/upload/contracts";
import { NextRequest, NextResponse } from "next/server";
import { checkoutBinding, checkoutSeed, CheckoutSeed, claimCheckout, resumeCheckout, CheckoutResumeError, legacyCheckoutSeed } from "@/lib/checkout-resume";
import { createOrderOnce, getSystemConfig } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { PaymentModeConfigError, normalizeStripeSecretKey, resolvePaymentMode } from "@/lib/payment-mode";
import { validatePersonalSender } from "@/lib/order-processor";
import { issueOfferPriceQuote, reserveOfferForCheckout } from "@/lib/offer-engine";
import { Order, MailingAddress, RecipientOccasion } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { resolveOperationId, operationMetadata, withOperationId } from "@/lib/operation-diagnostics";
import { normalizeCountryCode, validateMailingAddress, getEnabledDestination, authorizeInternationalCheckout, isStagingInternationalPreview, isProductionInternationalEnabled } from "@/lib/mailing-destinations";
import { calculateOrderQuote, ORDER_PRICE_VERSION } from "@/lib/order-pricing";
import { prepareCheckoutOrderAttribution } from "@/lib/order-attribution";

export async function POST(req: NextRequest) {
  const operationId = resolveOperationId(req, "checkout");
  try {
    if (await isOperationalControlPaused("checkout")) {
      return withOperationId(NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly.", code: "CHECKOUT_PAUSED", operationId }, { status: 503 }), operationId);
    }
    const body = await req.json();

    const {
      frontImageUrl: requestedFrontImageUrl,
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
      contactPolicyVersion: requestedContactPolicyVersion,
    } = body;

    const isAddressDeferred = Boolean(body.addressDeferred || body.address_deferred);
    const checkoutStartedAtServerMs = Date.now();
    const attribution = prepareCheckoutOrderAttribution(rawAttribution, {
      sessionId,
      serverNowMs: checkoutStartedAtServerMs,
      globalPrivacyControl: req.headers.get("sec-gpc") === "1",
    });
    const postPurchaseLinkObservation = await validateFollowupLinkForCheckout(body.followupLink, req.headers.get("sec-gpc") !== "1" && !attribution?.gpc && !attribution?.optOut);
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

    if (!requestedFrontImageUrl && !body.uploadDesign && !body.accountImage) {
      return NextResponse.json({ error: "Card cover image is required." }, { status: 400 });
    }

    if (!isAddressDeferred) {
      const addressCheck = validateMailingAddress(canonicalRecipientAddress);
      if (!addressCheck.valid) {
        return NextResponse.json({ error: addressCheck.errors[0] || "Complete recipient address is required." }, { status: 400 });
      }

      const senderValidation = validatePersonalSender(canonicalReturnAddress);
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

    const accountAssociation = await resolveAccountOrderAssociation(req, body);
    const code = typeof rawDiscountCode === "string" ? rawDiscountCode.trim().toUpperCase() : "";
    // Volatile attribution timestamps and session IDs can change on a return visit.
    // Consent and authenticated ownership affect the order and must still match.
    const snapshot = {
      frontImageUrl: requestedFrontImageUrl || "", uploadDesign: body.uploadDesign, accountImage: body.accountImage,
      printedMessage: printedMessage || "", handwrittenNote: handwrittenNote || "", fontStyleId,
      recipientAddress: canonicalRecipientAddress, returnAddress: canonicalReturnAddress, occasion: occasion || undefined,
      scheduledSendDate: scheduledSendDate || undefined, recipientOccasion: recipientOccasion || undefined,
      ...accountAssociation, addressDeferred: isAddressDeferred, discountCode: code,
      contactPolicyVersion: requestedContactPolicyVersion === 1 ? 1 : undefined,
      customerEmail: requestedContactPolicyVersion === 1 ? undefined : customerEmail,
      isFounderTest, isInternationalPreview, priceVersion: ORDER_PRICE_VERSION,
      privacyRestricted: Boolean(attribution?.optOut || attribution?.gpc || req.headers.get("sec-gpc") === "1"),
    };
    const binding = checkoutBinding(body.checkoutDraftKey, snapshot);
    const priorBinding = binding && await binding.get();
    let seed = priorBinding?.data()?.orderId ? priorBinding.data() as CheckoutSeed : undefined;
    if (!priorBinding?.exists && binding && body.previousCheckout) {
      const previous = await legacyCheckoutSeed(body.previousCheckout, snapshot);
      if (previous) seed = await claimCheckout(binding, previous);
    }
    if (!seed) {
      const result = code ? await issueOfferPriceQuote({ code, listPriceCents: CARD_FLAT_RATE_CENTS, sessionId }) : null;
      if (result && (!result.valid || !result.quote))
        return NextResponse.json({ error: result.error || "Invalid discount code." }, { status: 400 });
      seed = await claimCheckout(binding, checkoutSeed(operationId, result?.quote || null));
    }
    const { orderId, viewToken, offer } = seed;
    const appliedCode = offer?.code;
    const quoteId = offer?.quoteId;
    const appliedOfferId = offer?.offerId;
    const appliedOfferVersion = offer?.offerVersion;
    const discountAmountInCents = offer?.discountAmountCents || 0;
    const orderQuote = calculateOrderQuote({ countryCode: normalizedCountry, discountCents: discountAmountInCents });
    const finalAmountInCents = orderQuote.totalCents;
    const resolvedMode = finalAmountInCents === 0 ? null : resolvePaymentMode();
    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env["stripe-publishable-key"] ||
      null;
    if (resolvedMode && resolvedMode !== "local_mock") {
      const expectedPrefix = resolvedMode === "stripe_test" ? "pk_test_" : "pk_live_";
      if (!publishableKey || !publishableKey.startsWith(expectedPrefix)) {
        throw new PaymentModeConfigError(`A matching ${resolvedMode === "stripe_test" ? "test" : "live"} Stripe publishable key is not configured.`, 503, "STRIPE_PUBLISHABLE_KEY_MISMATCH");
      }
    }

    const reply = (data: object) => withOperationId(
      NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } }), seed.operationId);
    const verifySelection = (order: Order) => verifyResumedOrderSelection(req, body, order);
    if (binding) {
      const saved = await resumeCheckout(binding, seed, resolvedMode, publishableKey, verifySelection);
      if (saved) return reply(saved);
    }
    const uploadMaster = await pinUploadOrderMaster(req, body, orderId)
      || (accountAssociation.userId ? await pinGeneratedOrderMaster(accountAssociation.userId, orderId, requestedFrontImageUrl) : undefined);
    const frontImageUrl = uploadMaster ? "" : requestedFrontImageUrl;
    const verifiedUserId = uploadMaster?.uid || accountAssociation.userId;
    if (offer) {
      const reservation = await reserveOfferForCheckout({ code: offer.code, orderId, sessionId: sessionId || "sess_checkout", quoteId });
      if (!reservation.reserved) return NextResponse.json({ error: reservation.error || "This discount is unavailable." }, { status: 400 });
    }

    // Create Stripe PaymentIntent for the discounted or standard amount. Receipt
    // email is committed later, after the sender's explicit choice is saved.
    const paymentIntentResult = finalAmountInCents === 0 ? null : await createCardPaymentIntent({
      orderId,
      amountInCents: finalAmountInCents,
      idempotencyKey: "checkout-" + orderId,
      metadata: {
        operationId: seed.operationId,
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
      operationId: seed.operationId,
      ...(binding ? { checkoutResumeVersion: 1 } : {}),
      ...(paymentIntentResult && resolvedMode ? { stripePaymentId: paymentIntentResult.paymentIntentId, paymentMode: resolvedMode } : {}),
      customerEmail: requestedContactPolicyVersion === 1 ? "" : customerEmail,
      ...(requestedContactPolicyVersion === 1 ? { contactPolicyVersion: 1 as const } : {}),
      ...accountAssociation,
      ...(verifiedUserId ? { userId: verifiedUserId } : {}),
      ...(uploadMaster ? { uploadMaster } : {}),
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
      paymentMethod: paymentIntentResult ? "STRIPE" : "PROMO_CODE",
      ...(quoteId ? { quoteId } : {}),
      ...(appliedOfferId ? { appliedOfferId } : {}),
      ...(appliedOfferVersion ? { appliedOfferVersion } : {}),
      listPriceCents: CARD_FLAT_RATE_CENTS,
      isFounderTest,
      ...(attribution ? { attribution } : {}),
      ...(postPurchaseLinkObservation ? { postPurchaseLinkObservation } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(experienceVersion ? { experienceVersion } : {}),
      viewToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const created = await createOrderOnce(orderRecord);
    if (!created) {
      const saved = binding && await resumeCheckout(binding, seed, resolvedMode, publishableKey, verifySelection);
      if (!saved) throw new CheckoutResumeError("Checkout is updating. Please retry.");
      return reply(saved);
    }

    return reply({
      orderId,
      operationId: seed.operationId,
      viewToken,
      clientSecret: paymentIntentResult?.clientSecret || null,
      paymentIntentId: paymentIntentResult?.paymentIntentId || null,
      publishableKey: paymentIntentResult ? publishableKey : null,
      isMock: paymentIntentResult?.isMock || false,
      amountInCents: finalAmountInCents,
      originalAmountInCents: CARD_FLAT_RATE_CENTS,
      finalAmountInCents,
      quote: orderQuote,
      discountCode: appliedCode,
      discountAmountInCents,
      quoteId,
      appliedOfferId,
      appliedOfferVersion,
      isFree: !paymentIntentResult,
    });
  } catch (error: unknown) {
    if (error instanceof CheckoutResumeError) {
      return withOperationId(NextResponse.json({ error: error.message,
        ...(error.order ? { code: "CHECKOUT_ALREADY_IN_PROGRESS", orderId: error.order.id, viewToken: error.order.viewToken } : {}),
      }, { status: 409, headers: { "Cache-Control": "private, no-store" } }), operationId);
    }
    if (error instanceof AccountError) return accountError(error);
    if (error instanceof UploadError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status, headers: {"Cache-Control":"private, no-store"}});
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
