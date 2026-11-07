import { validateFollowupLinkForCheckout } from "@/lib/post-purchase/attribution";
import { resolveAccountOrderAssociation } from "@/lib/account/order-association";
import { AccountError, accountError } from "@/lib/account/http";
import { pinGeneratedOrderMaster } from "@/lib/account/order-front";
import { pinUploadOrderMaster } from "@/lib/upload/order-master";
import { UploadError } from "@/lib/upload/contracts";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { saveOrder, getOrderById, getSystemConfig, updateOrderStatus } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS, getStripeClient } from "@/lib/stripe";
import { PaymentModeConfigError, normalizeStripeSecretKey, resolvePaymentMode } from "@/lib/payment-mode";
import { validatePersonalSender } from "@/lib/order-processor";
import { issueOfferPriceQuote, reserveOfferForCheckout, releaseOfferReservation, getOfferReservationsCollection, verifyCheckoutQuoteIntegrity } from "@/lib/offer-engine";
import { Order, MailingAddress, RecipientOccasion } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { resolveOperationId, operationMetadata, withOperationId } from "@/lib/operation-diagnostics";
import { normalizeCountryCode, validateMailingAddress, getEnabledDestination, authorizeInternationalCheckout, isStagingInternationalPreview, isProductionInternationalEnabled } from "@/lib/mailing-destinations";
import { calculateOrderQuote } from "@/lib/order-pricing";
import { prepareCheckoutOrderAttribution } from "@/lib/order-attribution";
import { getFeatureFlags } from "@/lib/feature-flags";
import { allocateTotalCents, composeRecipientMessage, normalizedMailingAddressKey, quoteMultiSend, validateMultiSendInput } from "@/lib/multi-send/contracts";
import { abortMultiSendCheckoutClaim, blockMultiSendCheckout, claimMultiSendCheckout, claimMultiSendRetry, finishMultiSendCheckout, multiSendCheckoutOwnerKey, resetMultiSendCheckoutAfterCanceledReplacement, recoverMultiSendCheckout, verifyMultiSendCheckoutOwner } from "@/lib/multi-send/checkout";

export async function POST(req: NextRequest) {
  const operationId = resolveOperationId(req, "checkout");
  let activeMultiSendClaim: { checkoutId: string; leaseId: string } | null = null;
  let guestCheckoutCapability: string | null = null;
  let canceledMultiSendOrderId: string | null = null;
  let reservedMultiSendOrderId: string | null = null;
  try {
    if (await isOperationalControlPaused("checkout")) {
      return withOperationId(NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly.", code: "CHECKOUT_PAUSED", operationId }, { status: 503 }), operationId);
    }
    const body = await req.json();

    // Fail closed until the multi-send quote/snapshot path is wired end to end.
    // This guard is server-side and cannot be bypassed by query or cookie values.
    if (body?.multiSend !== undefined) {
      if (!validateMultiSendInput(body.multiSend)) {
        return NextResponse.json({ error: "Multi-send request is invalid." }, { status: 400 });
      }
      const flags = await getFeatureFlags();
      if (!flags.multiSendEnabled) {
        return NextResponse.json({ error: "Multi-send checkout is not available yet.", code: "MULTI_SEND_DISABLED" }, { status: 503 });
      }
      const { multiSend } = body;
      if (body.addressDeferred || body.address_deferred || body.scheduledSendDate) return NextResponse.json({ error: "Multi-send requires complete U.S. addresses and immediate sending." }, { status: 400 });
      if (!body.returnAddress || !body.frontImageUrl && !body.uploadDesign && !body.accountImage) return NextResponse.json({ error: "A card design and complete return address are required." }, { status: 400 });
      const senderCountry = body.returnAddress.country === undefined ? "US" : normalizeCountryCode(body.returnAddress.country);
      if (senderCountry !== "US") return NextResponse.json({ error: "A personal United States return address is required." }, { status: 400 });
      const senderCheck = validatePersonalSender(body.returnAddress);
      if (!senderCheck.valid) return NextResponse.json({ error: senderCheck.error || "Complete return address is required." }, { status: 400 });
      const checkedAddresses: Array<{ id: string; address: MailingAddress }> = [];
      for (const recipient of multiSend.recipients) {
        const country = recipient.address.country === undefined ? "US" : normalizeCountryCode(recipient.address.country);
        if (country !== "US") return NextResponse.json({ error: `Recipient ${recipient.id}: multi-send currently supports U.S. addresses only.`, recipientId: recipient.id }, { status: 400 });
        const address = { ...recipient.address, country: "US" };
        const addressCheck = validateMailingAddress(address);
        if (!addressCheck.valid) return NextResponse.json({ error: `Recipient ${recipient.id}: ${addressCheck.errors[0] || "Complete U.S. address is required."}`, recipientId: recipient.id }, { status: 400 });
        const printedMessage = composeRecipientMessage(multiSend.note, recipient.greeting);
        if (printedMessage.length > 450) return NextResponse.json({ error: `Recipient ${recipient.id}: complete card message exceeds the 450 character limit.`, recipientId: recipient.id, code: "RECIPIENT_MESSAGE_TOO_LONG" }, { status: 400 });
        const addressKey = normalizedMailingAddressKey(address);
        const nameKey = `${address.firstName} ${address.lastName}`.trim().toLocaleLowerCase().replace(/\s+/g, " ");
        for (const previous of checkedAddresses) {
          if (normalizedMailingAddressKey(previous.address) !== addressKey) continue;
          const previousName = `${previous.address.firstName} ${previous.address.lastName}`.trim().toLocaleLowerCase().replace(/\s+/g, " ");
          if (previousName === nameKey) return NextResponse.json({ error: "The same recipient address appears more than once.", recipientId: recipient.id, code: "DUPLICATE_RECIPIENT" }, { status: 400 });
        if (!recipient.householdAcknowledgedWith?.some((ack: { id: string; addressKey: string }) => ack.id === previous.id && ack.addressKey === addressKey)) return NextResponse.json({ error: `Confirm that ${recipient.id} and ${previous.id} are separate people at this address.`, recipientId: recipient.id, code: "HOUSEHOLD_CONFIRMATION_REQUIRED" }, { status: 400 });
        }
        checkedAddresses.push({ id: recipient.id, address });
      }
      const requestContentHash = crypto.createHash("sha256").update(JSON.stringify({ multiSend, discountCode: typeof body.discountCode === "string" ? body.discountCode.trim().toUpperCase() : "", returnAddress: body.returnAddress, frontImageUrl: body.frontImageUrl || null, uploadDesign: body.uploadDesign || null, accountImage: body.accountImage || null })).digest("hex");
      const orderId = `order_${crypto.createHash("sha256").update(`${multiSend.checkoutId}:${requestContentHash}`).digest("hex").slice(0, 32)}`;
      const accountAssociation = await resolveAccountOrderAssociation(req, body);
      guestCheckoutCapability = req.cookies.get(`smn_multi_send_${multiSend.checkoutId}`)?.value || null;
      if (!accountAssociation.userId && !guestCheckoutCapability) guestCheckoutCapability = crypto.randomBytes(32).toString("hex");
      const ownerKey = multiSendCheckoutOwnerKey({ checkoutId: multiSend.checkoutId, userId: accountAssociation.userId, guestCapability: guestCheckoutCapability || undefined });
      const existingOrder = await getOrderById(orderId);
      if (existingOrder) {
        const retryLease = await claimMultiSendRetry(multiSend.checkoutId, ownerKey, orderId);
        if (!retryLease) return NextResponse.json({ error: "Checkout could not be verified or is being replaced.", code: "MULTI_SEND_OWNER_MISMATCH" }, { status: 403 });
        activeMultiSendClaim = { checkoutId: multiSend.checkoutId, leaseId: retryLease };
        if (existingOrder.multiSend?.contentRevision !== requestContentHash || existingOrder.status !== "PENDING_PAYMENT") {
          await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
          activeMultiSendClaim = null;
          return NextResponse.json({ error: "This checkout has already been paid or changed. Start a new checkout review.", code: "MULTI_SEND_CHECKOUT_STALE" }, { status: 409 });
        }
        const mode = resolvePaymentMode();
        if (existingOrder.paymentMode && existingOrder.paymentMode !== mode) {
          await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
          activeMultiSendClaim = null;
          return NextResponse.json({ error: "Payment mode changed while this checkout was open. Contact support before retrying.", code: "MULTI_SEND_PAYMENT_MODE_CHANGED" }, { status: 409 });
        }
        let existingPayment: { clientSecret: string | null; paymentIntentId: string; isMock: boolean };
        let savedQuoteIntegrity = existingOrder.discountCode
          ? await verifyCheckoutQuoteIntegrity({ quoteId: existingOrder.quoteId, code: existingOrder.discountCode, expectedFinalCents: existingOrder.amountInCents, paymentIntentAmountCents: existingOrder.amountInCents, multiSendCount: existingOrder.multiSend.recipients.length })
          : { valid: true };
        if (existingOrder.discountCode && savedQuoteIntegrity.valid) {
          const hold = await getOfferReservationsCollection().doc(`res_${existingOrder.id}_${existingOrder.discountCode}`).get();
          const reservation = hold.data();
          if (!hold.exists || reservation?.status !== "active" || reservation.expiresAt <= Date.now() || reservation.quoteId !== existingOrder.quoteId) {
            savedQuoteIntegrity = { valid: false, reason: "Offer reservation expired or was released. Review the total again before paying." };
          }
        }
        if (existingOrder.stripePaymentId && mode !== "local_mock") {
          const pi = await getStripeClient().paymentIntents.retrieve(existingOrder.stripePaymentId);
          if (pi.metadata?.orderId !== orderId || pi.metadata?.contentRevision !== requestContentHash || pi.metadata?.itemCount !== String(existingOrder.multiSend.recipients.length) || pi.amount !== existingOrder.amountInCents || pi.currency.toLowerCase() !== "usd" || Boolean(pi.livemode) !== (mode === "live") || (existingOrder.discountCode && (pi.metadata?.discountCode !== existingOrder.discountCode || pi.metadata?.quoteId !== existingOrder.quoteId))) {
            await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
            activeMultiSendClaim = null;
            return NextResponse.json({ error: "The saved payment does not match this checkout snapshot. Contact support before retrying.", code: "MULTI_SEND_PAYMENT_RECONCILIATION" }, { status: 409 });
          }
          if (pi.status === "succeeded" || pi.status === "processing" || pi.status === "canceled") {
            await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
            activeMultiSendClaim = null;
            const orderPath = `/order/${encodeURIComponent(existingOrder.id)}?token=${encodeURIComponent(existingOrder.viewToken || "")}`;
            return NextResponse.json({ error: "This payment is already complete or closed. Reopening the order to view its latest status.", code: "MULTI_SEND_PAYMENT_CLOSED", orderId: existingOrder.id, viewToken: existingOrder.viewToken, orderPath }, { status: 409 });
          }
          if (!savedQuoteIntegrity.valid) {
            await getStripeClient().paymentIntents.cancel(pi.id);
            await updateOrderStatus(existingOrder.id, { status: "FAILED", fulfillmentStatus: "MULTI_SEND_OFFER_QUOTE_EXPIRED", fulfillmentError: savedQuoteIntegrity.reason || "Offer quote expired before retry." } as any);
            await releaseOfferReservation(existingOrder.id, "expired");
            await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
            activeMultiSendClaim = null;
            const orderPath = `/order/${encodeURIComponent(existingOrder.id)}?token=${encodeURIComponent(existingOrder.viewToken || "")}`;
            return NextResponse.json({ error: "This offer quote expired before payment. Its payment was closed; reopening the order so you can review its status.", code: "MULTI_SEND_OFFER_QUOTE_EXPIRED", orderId: existingOrder.id, viewToken: existingOrder.viewToken, orderPath }, { status: 409 });
          }
          existingPayment = { clientSecret: pi.client_secret, paymentIntentId: pi.id, isMock: false };
        } else {
          if (!savedQuoteIntegrity.valid) {
            await updateOrderStatus(existingOrder.id, { status: "FAILED", fulfillmentStatus: "MULTI_SEND_OFFER_QUOTE_EXPIRED", fulfillmentError: savedQuoteIntegrity.reason || "Offer quote expired before retry." } as any);
            await releaseOfferReservation(existingOrder.id, "expired");
            await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
            activeMultiSendClaim = null;
            const orderPath = `/order/${encodeURIComponent(existingOrder.id)}?token=${encodeURIComponent(existingOrder.viewToken || "")}`;
            return NextResponse.json({ error: "This offer quote expired before payment. Its payment was closed; reopening the order so you can review its status.", code: "MULTI_SEND_OFFER_QUOTE_EXPIRED", orderId: existingOrder.id, viewToken: existingOrder.viewToken, orderPath }, { status: 409 });
          }
          existingPayment = await createCardPaymentIntent({ orderId, amountInCents: existingOrder.amountInCents, idempotencyKey: `multi-send-${multiSend.checkoutId}-${requestContentHash.slice(0, 32)}`, metadata: { quoteVersion: existingOrder.quote?.version || "multi-send-900-v1", quotedTotalCents: String(existingOrder.amountInCents), itemCount: String(existingOrder.multiSend.recipients.length), contentRevision: requestContentHash, ...(existingOrder.discountCode ? { discountCode: existingOrder.discountCode, discountAmountCents: String(existingOrder.discountAmountInCents || 0), quoteId: existingOrder.quoteId || "" } : {}) } });
          if (existingOrder.stripePaymentId !== existingPayment.paymentIntentId) await saveOrder({ ...existingOrder, stripePaymentId: existingPayment.paymentIntentId, updatedAt: Date.now() } as Order & Record<string, unknown>);
        }
        await finishMultiSendCheckout(multiSend.checkoutId, retryLease);
        activeMultiSendClaim = null;
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || null;
        const response = NextResponse.json({ orderId, operationId: existingOrder.operationId || operationId, viewToken: existingOrder.viewToken, clientSecret: existingPayment.clientSecret, paymentIntentId: existingPayment.paymentIntentId, publishableKey, isMock: existingPayment.isMock, amountInCents: existingOrder.amountInCents, finalAmountInCents: existingOrder.finalAmountInCents, quote: existingOrder.quote, isFree: false });
        if (!accountAssociation.userId && guestCheckoutCapability) response.cookies.set(`smn_multi_send_${multiSend.checkoutId}`, guestCheckoutCapability, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/checkout", maxAge: 60 * 60 * 24 * 30 });
        return withOperationId(response, operationId);
      }
      let discountAmountInCents = 0;
      let appliedCode: string | undefined;
      let quoteId: string | undefined;
      let appliedOfferId: string | undefined;
      let appliedOfferVersion: number | undefined;
      if (typeof body.discountCode === "string" && body.discountCode.trim()) {
        const code = body.discountCode.trim().toUpperCase();
        const offer = await issueOfferPriceQuote({ code, sessionId: body.sessionId, nowMs: Date.now() });
        if (!offer.valid) return NextResponse.json({ error: offer.error || "Invalid discount code." }, { status: 400 });
        discountAmountInCents = Math.min(CARD_FLAT_RATE_CENTS, offer.discountAmountInCents || 0);
        appliedCode = offer.offer?.code || code;
        quoteId = offer.quote?.quoteId;
        appliedOfferId = offer.offer?.offerId;
        appliedOfferVersion = offer.offer?.version;
      }
      const claim = await claimMultiSendCheckout({ checkoutId: multiSend.checkoutId, contentRevision: requestContentHash, orderId, ownerKey, replaces: body.replaces });
      if (!claim.claimed || !claim.leaseId) return NextResponse.json({ error: claim.code === "MULTI_SEND_REPLACEMENT_PROOF_REQUIRED" ? "Review edits requires the previous checkout capability." : "Another checkout update is already in progress or needs support.", code: claim.code || "MULTI_SEND_CHECKOUT_BUSY" }, { status: claim.code === "MULTI_SEND_OWNER_MISMATCH" ? 403 : 409 });
      activeMultiSendClaim = { checkoutId: multiSend.checkoutId, leaseId: claim.leaseId };
      let priorOrderForReplacement: Order | null = null;
      if (claim.previousOrderId) {
        const prior = await getOrderById(claim.previousOrderId);
        priorOrderForReplacement = prior;
        if (!prior?.stripePaymentId) {
          if (prior) {
            canceledMultiSendOrderId = prior.id;
            await updateOrderStatus(prior.id, { status: "FAILED", fulfillmentStatus: "MULTI_SEND_INTENT_REPLACED", fulfillmentError: "Unpaid checkout snapshot replaced before a payment intent was created." } as any);
          }
        } else if (resolvePaymentMode() === "local_mock") {
          canceledMultiSendOrderId = prior.id;
          await updateOrderStatus(prior.id, { status: "FAILED", fulfillmentStatus: "MULTI_SEND_INTENT_REPLACED", fulfillmentError: "Unpaid checkout snapshot replaced." } as any);
        } else {
          const stripe = getStripeClient();
          const oldIntent = await stripe.paymentIntents.retrieve(prior.stripePaymentId);
          if (oldIntent.metadata?.orderId !== prior.id || oldIntent.metadata?.contentRevision !== prior.multiSend?.contentRevision || oldIntent.amount !== prior.amountInCents || oldIntent.currency.toLowerCase() !== "usd" || Boolean(oldIntent.livemode) !== (prior.paymentMode === "live")) {
            await blockMultiSendCheckout(multiSend.checkoutId, claim.leaseId);
            activeMultiSendClaim = null;
            return NextResponse.json({ error: "The previous payment could not be safely matched. Contact support before retrying.", code: "MULTI_SEND_REPLACEMENT_RECONCILIATION" }, { status: 409 });
          }
          if (oldIntent.status === "succeeded" || oldIntent.status === "processing") {
            await blockMultiSendCheckout(multiSend.checkoutId, claim.leaseId);
            activeMultiSendClaim = null;
            const orderPath = `/order/${encodeURIComponent(prior.id)}?token=${encodeURIComponent(prior.viewToken || "")}`;
            return NextResponse.json({ error: "The previous payment may have completed. Reopening its order so you can view the latest status.", code: "MULTI_SEND_LATE_PAYMENT", orderId: prior.id, viewToken: prior.viewToken, orderPath }, { status: 409 });
          }
          if (oldIntent.status !== "canceled") await stripe.paymentIntents.cancel(oldIntent.id);
          canceledMultiSendOrderId = prior.id;
          await updateOrderStatus(prior.id, { status: "FAILED", fulfillmentStatus: "MULTI_SEND_INTENT_REPLACED", fulfillmentError: "Prior unpaid payment intent was canceled before replacement." } as any);
        }
      }
      if (appliedCode) {
        const reservation = await reserveOfferForCheckout({ code: appliedCode, orderId, sessionId: body.sessionId || "multi_send_checkout", quoteId, ...(priorOrderForReplacement ? { replaceOrderId: priorOrderForReplacement.id } : {}) });
        if (!reservation.reserved) {
          if (priorOrderForReplacement) {
            // The old intent has already been safely canceled. Free any prior hold and let the same checkout group retry from a clean state.
            await releaseOfferReservation(priorOrderForReplacement.id, "removed");
            await resetMultiSendCheckoutAfterCanceledReplacement(multiSend.checkoutId, claim.leaseId);
            activeMultiSendClaim = null;
          } else {
            await abortMultiSendCheckoutClaim({ checkoutId: multiSend.checkoutId, leaseId: claim.leaseId });
            activeMultiSendClaim = null;
          }
          return NextResponse.json({ error: reservation.error || "This discount code cannot be reserved. The previous payment was canceled; retry checkout to continue.", code: "MULTI_SEND_OFFER_RESERVATION_FAILED" }, { status: 409 });
        }
        reservedMultiSendOrderId = orderId;
      }
      if (priorOrderForReplacement) await releaseOfferReservation(priorOrderForReplacement.id, "removed");
      const viewToken = `tok_${crypto.randomBytes(16).toString("hex")}`;
      const uploadMaster = await pinUploadOrderMaster(req, body, orderId)
        || (accountAssociation.userId ? await pinGeneratedOrderMaster(accountAssociation.userId, orderId, body.frontImageUrl) : undefined);
      const flagsForMode = resolvePaymentMode();
      const unitCents = CARD_FLAT_RATE_CENTS;
      const quoteAmounts = quoteMultiSend(multiSend.recipients.length, discountAmountInCents, unitCents);
      const quote = {
        version: "multi-send-900-v1", countryCode: "US", basePriceCents: quoteAmounts.basePriceCents,
        discountCents: quoteAmounts.discountCents, internationalSurchargeCents: 0, totalCents: quoteAmounts.totalCents, currency: "USD" as const,
      };
      const allocations = allocateTotalCents(quote.totalCents, multiSend.recipients.length);
      const checkoutStartedAt = Date.now();
      const batchAttribution = prepareCheckoutOrderAttribution(body.attribution, {
        sessionId: body.sessionId,
        serverNowMs: checkoutStartedAt,
        globalPrivacyControl: req.headers.get("sec-gpc") === "1",
      });
      const batchFollowupObservation = await validateFollowupLinkForCheckout(
        body.followupLink,
        req.headers.get("sec-gpc") !== "1" && !batchAttribution?.gpc && !batchAttribution?.optOut,
      );
      const frozenRecipients = multiSend.recipients.map((recipient: any, index: number) => ({
        ...recipient,
        address: { ...recipient.address, country: "US" },
        resolvedGreeting: recipient.greeting.mode === "inherit" ? (multiSend.note.salutation || "") : recipient.greeting.text,
        printedMessage: composeRecipientMessage(multiSend.note, recipient.greeting),
        amountInCents: allocations[index],
      }));
      const contentRevision = requestContentHash;
      const requestedEmail = typeof body.customerEmail === "string" ? body.customerEmail : "";
      const orderRecord: Order & Record<string, unknown> = {
        id: orderId, operationId, stripePaymentId: "", customerEmail: body.contactPolicyVersion === 1 ? "" : requestedEmail,
        ...(body.contactPolicyVersion === 1 ? { contactPolicyVersion: 1 as const } : {}), ...accountAssociation,
        ...(uploadMaster ? { uploadMaster } : {}),
        frontImageUrl: uploadMaster ? "" : body.frontImageUrl, printedMessage: "",
        handwrittenNote: body.handwrittenNote || "", fontStyleId: multiSend.note.style || body.fontStyleId || "1",
        recipientAddress: frozenRecipients[0].address, returnAddress: body.returnAddress,
        status: "PENDING_PAYMENT", amountInCents: quote.totalCents, originalAmountInCents: quote.basePriceCents,
        finalAmountInCents: quote.totalCents, quote, paymentMethod: "STRIPE", isFounderTest: req.cookies.get("smn_founder_device")?.value === "1",
        isTest: flagsForMode !== "live", paymentMode: flagsForMode, ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
        ...(batchAttribution ? { attribution: batchAttribution } : {}),
        ...(batchFollowupObservation ? { postPurchaseLinkObservation: batchFollowupObservation } : {}),
        ...(body.occasion ? { occasion: body.occasion } : {}),
        ...(body.recipientOccasion ? { recipientOccasion: body.recipientOccasion as RecipientOccasion } : {}),
        ...(body.experienceVersion ? { experienceVersion: body.experienceVersion } : {}),
        ...(appliedCode ? { discountCode: appliedCode } : {}), ...(discountAmountInCents ? { discountAmountInCents } : {}), ...(quoteId ? { quoteId } : {}), ...(appliedOfferId ? { appliedOfferId } : {}), ...(appliedOfferVersion ? { appliedOfferVersion } : {}),
        viewToken, createdAt: Date.now(), updatedAt: Date.now(),
        multiSend: { version: 1, kind: "parent", checkoutId: multiSend.checkoutId, recipients: frozenRecipients, shared: { frontImageUrl: uploadMaster ? "" : body.frontImageUrl, note: multiSend.note, fontStyleId: multiSend.note.style || body.fontStyleId || "1", returnAddress: body.returnAddress }, quote, contentRevision, manifestComplete: false, preparationState: "pending" },
      };
      // Persist the immutable order binding before creating the intent; its content hash is the idempotency key.
      await saveOrder(orderRecord);
      const paymentIntentResult = await createCardPaymentIntent({
        orderId, amountInCents: quote.totalCents, idempotencyKey: `multi-send-${multiSend.checkoutId}-${contentRevision.slice(0, 32)}`,
        metadata: { quoteVersion: quote.version, quotedTotalCents: String(quote.totalCents), itemCount: String(frozenRecipients.length), contentRevision, ...(appliedCode ? { discountCode: appliedCode, discountAmountCents: String(discountAmountInCents), quoteId: quoteId || "" } : {}) },
      });
      orderRecord.stripePaymentId = paymentIntentResult.paymentIntentId;
      await saveOrder(orderRecord);
      if (activeMultiSendClaim) {
        await finishMultiSendCheckout(multiSend.checkoutId, activeMultiSendClaim.leaseId);
        activeMultiSendClaim = null;
      }
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || null;
      if (flagsForMode !== "local_mock") {
        const prefix = flagsForMode === "stripe_test" ? "pk_test_" : "pk_live_";
        if (!publishableKey || !publishableKey.startsWith(prefix)) throw new PaymentModeConfigError("A matching Stripe publishable key is not configured.", 503, "STRIPE_PUBLISHABLE_KEY_MISMATCH");
      }
      const response = NextResponse.json({ orderId, operationId, viewToken, clientSecret: paymentIntentResult.clientSecret, paymentIntentId: paymentIntentResult.paymentIntentId, publishableKey, isMock: paymentIntentResult.isMock, amountInCents: quote.totalCents, finalAmountInCents: quote.totalCents, quote, isFree: false });
      if (!accountAssociation.userId && guestCheckoutCapability) response.cookies.set(`smn_multi_send_${multiSend.checkoutId}`, guestCheckoutCapability, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/checkout", maxAge: 60 * 60 * 24 * 30 });
      return withOperationId(response, operationId);
    }

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

    // Generate unguessable 128-bit cryptographically secure Order ID and View Token
    const orderId = `order_${crypto.randomBytes(16).toString("hex")}`;
    const viewToken = `tok_${crypto.randomBytes(16).toString("hex")}`;

    // Resolve private artwork before reserving a discount or creating payment.
    const accountAssociation = await resolveAccountOrderAssociation(req, body);
    const uploadMaster = await pinUploadOrderMaster(req, body, orderId)
      || (accountAssociation.userId ? await pinGeneratedOrderMaster(accountAssociation.userId, orderId, requestedFrontImageUrl) : undefined);
    const frontImageUrl = uploadMaster ? "" : requestedFrontImageUrl;
    const verifiedUserId = uploadMaster?.uid || accountAssociation.userId;

    // Evaluate discount code if provided
    let discountAmountInCents = 0;
    let finalAmountInCents = CARD_FLAT_RATE_CENTS;
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

    // If order total is completely free, complete without Stripe
    if (finalAmountInCents === 0) {
      const orderRecord: Order & Record<string, unknown> = {
      id: orderId,
      operationId,
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
        discountCode: appliedCode,
        discountAmountInCents,
        paymentMethod: "PROMO_CODE",
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

      await saveOrder(orderRecord);

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

    const resolvedMode = resolvePaymentMode();
    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env["stripe-publishable-key"] ||
      null;
    if (resolvedMode !== "local_mock") {
      const expectedPrefix = resolvedMode === "stripe_test" ? "pk_test_" : "pk_live_";
      if (!publishableKey || !publishableKey.startsWith(expectedPrefix)) {
        throw new PaymentModeConfigError(`A matching ${resolvedMode === "stripe_test" ? "test" : "live"} Stripe publishable key is not configured.`, 503, "STRIPE_PUBLISHABLE_KEY_MISMATCH");
      }
    }

    // Create Stripe PaymentIntent for the discounted or standard amount. Receipt
    // email is committed later, after the sender's explicit choice is saved.
    const paymentIntentResult = await createCardPaymentIntent({
      orderId,
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
      paymentMethod: "STRIPE",
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

    await saveOrder(orderRecord);

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
    if (reservedMultiSendOrderId) {
      try { await releaseOfferReservation(reservedMultiSendOrderId, "payment_failed"); }
      catch (releaseError) { console.error("[Checkout] Failed to release multi-send reservation", releaseError instanceof Error ? releaseError.message : "unknown"); }
    }
    if (canceledMultiSendOrderId) {
      try { await releaseOfferReservation(canceledMultiSendOrderId, "removed"); }
      catch (releaseError) { console.error("[Checkout] Failed to release replaced multi-send reservation", releaseError instanceof Error ? releaseError.message : "unknown"); }
    }
    if (activeMultiSendClaim) {
      try { await blockMultiSendCheckout(activeMultiSendClaim.checkoutId, activeMultiSendClaim.leaseId); }
      catch (claimError) { console.error("[Checkout] Failed to fail closed after multi-send error", claimError instanceof Error ? claimError.message : "unknown"); }
      activeMultiSendClaim = null;
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
