import { checkoutOrderPath } from "@/lib/order-tracking-links";
import { validateFollowupLinkForCheckout } from "@/lib/post-purchase/attribution";
import { isSameOrigin } from "@/lib/upload/http";
import { verifyMultiSendTransferProof } from "@/lib/multi-send/checkout";
import { resolveAccountOrderAssociation } from "@/lib/account/order-association";
import { AccountError, accountError } from "@/lib/account/http";
import { pinGeneratedOrderMaster } from "@/lib/account/order-front";
import { pinUploadOrderMaster, verifyResumedOrderSelection } from "@/lib/upload/order-master";
import { UploadError } from "@/lib/upload/contracts";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createOrderOnce, getOrderById, getSystemConfig } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS, getStripeClient, type CreateIntentParams } from "@/lib/stripe";
import { checkoutBinding, checkoutSeed, CheckoutSeed, claimCheckout, clearClosedCheckoutBinding, resumeCheckout, CheckoutResumeError, legacyCheckoutSeed, openCheckoutPayment, retireCheckoutOrder, singleCheckoutOwnerKey, verifyCheckoutHold, verifyCheckoutIntent } from "@/lib/checkout-resume";
import { PaymentModeConfigError, normalizeStripeSecretKey, resolvePaymentMode } from "@/lib/payment-mode";
import { validatePersonalSender } from "@/lib/order-processor";
import { reserveOfferForCheckout } from "@/lib/offer-engine";
import { checkoutPriceComponents, checkoutPromotionBasket, checkoutPromotionDecision, normalizeCheckoutCode, verifiedPromotionOwner } from "@/lib/checkout-promotion";
import { Order, MailingAddress, RecipientOccasion } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { resolveOperationId, operationMetadata, withOperationId } from "@/lib/operation-diagnostics";
import { normalizeCountryCode, validateMailingAddress, getEnabledDestination, authorizeInternationalCheckout, isStagingInternationalPreview, isProductionInternationalEnabled } from "@/lib/mailing-destinations";
import { ORDER_PRICE_VERSION } from "@/lib/order-pricing";
import { prepareCheckoutOrderAttribution } from "@/lib/order-attribution";
import { getFeatureFlags } from "@/lib/feature-flags";
import { composeRecipientMessage, normalizedMailingAddressKey, resolveGreeting, validateMultiSendInput } from "@/lib/multi-send/contracts";
import { abortMultiSendCheckoutClaim, blockMultiSendCheckout, claimMultiSendCheckout, claimMultiSendRetry, finishMultiSendCheckout, multiSendCheckoutOwnerKey, multiSendCheckoutRef, resetMultiSendCheckoutAfterCanceledReplacement, recoverMultiSendCheckout, verifyMultiSendCheckoutOwner } from "@/lib/multi-send/checkout";

async function retirePriorCheckout(req: NextRequest, proof: unknown, userId: string | undefined, allowMultiSend: boolean) {
  if (!proof || typeof proof !== "object" || !("orderId" in proof) || !("viewToken" in proof) ||
      typeof proof.orderId !== "string" || !/^order_[a-f0-9]{32}$/.test(proof.orderId) || typeof proof.viewToken !== "string") return;
  const order = await getOrderById(proof.orderId);
  if (!order || order.isComp || order.viewToken !== proof.viewToken || (order.userId && order.userId !== userId) || order.status === "FAILED") return;
  if (!order.multiSend) {
    await retireCheckoutOrder(order, "removed");
    return;
  }
  if (!allowMultiSend) return;
  const checkoutId = order.multiSend.checkoutId;
  const group = (await multiSendCheckoutRef(checkoutId).get()).data();
  const guestKey = multiSendCheckoutOwnerKey({ checkoutId, guestCapability: req.cookies.get(`smn_multi_send_${checkoutId}`)?.value });
  const ownerKey = group?.ownerKey && group.ownerKey === guestKey ? guestKey : multiSendCheckoutOwnerKey({ checkoutId, userId });
  const lease = await claimMultiSendRetry(checkoutId, ownerKey, order.id);
  if (!lease) throw new CheckoutResumeError("The previous checkout is still being updated. Please retry.");
  try {
    await retireCheckoutOrder(order, "removed");
    await resetMultiSendCheckoutAfterCanceledReplacement(checkoutId, lease, order.id);
  } catch (error) {
    await finishMultiSendCheckout(checkoutId, lease);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const operationId = resolveOperationId(req, "checkout");
  let activeMultiSendClaim: { checkoutId: string; leaseId: string; previousOrderId?: string; oldRetired?: boolean; orderSaved?: boolean } | null = null;
  let guestCheckoutCapability: string | null = null;
  try {
    if (await isOperationalControlPaused("checkout")) {
      return withOperationId(NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly.", code: "CHECKOUT_PAUSED", operationId }, { status: 503 }), operationId);
    }
    const body = await req.json();

    // Old guest cookies cover /api/checkout only. This read-only bridge widens
    // the same proven capability for the dedicated /api/wedding/transfer URL;
    // it never creates, resumes, or returns a payment intent.
    if (body?.action === "authorize-wedding-transfer") {
      const id=body.checkoutId,proof=body.previousCheckout;
      if (!isSameOrigin(req) || typeof id!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof proof?.orderId!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(proof.orderId) || typeof proof?.viewToken!=="string" || proof.viewToken.length>256) return NextResponse.json({error:"Checkout proof is required.",code:"TRANSFER_PAYMENT_PROOF_REQUIRED"},{status:403});
      const account=await resolveAccountOrderAssociation(req,{}),capability=req.cookies.get(`smn_multi_send_${id}`)?.value;
      const ownerKey=multiSendCheckoutOwnerKey({checkoutId:id,userId:account.userId,guestCapability:capability});
      if (!ownerKey || !await verifyMultiSendTransferProof(id,ownerKey,proof)) return NextResponse.json({error:"Use the original checkout account or device.",code:"TRANSFER_OWNER_MISMATCH"},{status:403});
      const response=NextResponse.json({authorized:true},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
      if(!account.userId&&capability) response.cookies.set(`smn_multi_send_${id}`,capability,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/api",maxAge:30*86400});
      return response;
    }

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
      const code = normalizeCheckoutCode(body.discountCode);
      const reference = typeof body.offerReference === "string" && body.offerReference.length <= 256 ? body.offerReference : undefined;
      if ((body.discountCode && !code) || (body.offerReference && !reference)) return NextResponse.json({ error: "This offer is unavailable.", reason: "unavailable" }, { status: 400 });
      const requestContentHash = crypto.createHash("sha256").update(JSON.stringify({ multiSend, discountCode: code, returnAddress: body.returnAddress, frontImageUrl: body.frontImageUrl || null, uploadDesign: body.uploadDesign || null, accountImage: body.accountImage || null, ...(reference ? { offerReference: reference } : {}) })).digest("hex");
      const accountAssociation = await resolveAccountOrderAssociation(req, body);
      const ownerUid = code || reference ? await verifiedPromotionOwner(req) : undefined;
      guestCheckoutCapability = req.cookies.get(`smn_multi_send_${multiSend.checkoutId}`)?.value || null;
      if (!accountAssociation.userId && !guestCheckoutCapability) guestCheckoutCapability = crypto.randomBytes(32).toString("hex");
      const group = (await multiSendCheckoutRef(multiSend.checkoutId).get()).data();
      const guestOwnerKey = multiSendCheckoutOwnerKey({ checkoutId: multiSend.checkoutId, guestCapability: guestCheckoutCapability || undefined });
      const ownerKey = group?.ownerKey && group.ownerKey === guestOwnerKey ? guestOwnerKey : multiSendCheckoutOwnerKey({ checkoutId: multiSend.checkoutId, userId: accountAssociation.userId, guestCapability: guestCheckoutCapability || undefined });
      if (group && group.ownerKey !== ownerKey) return NextResponse.json({ error: "Checkout could not be verified.", code: "MULTI_SEND_OWNER_MISMATCH" }, { status: 403 });
      const orderId = group?.currentRevision === requestContentHash && group.currentOrderId
        ? String(group.currentOrderId)
        : `order_${crypto.createHash("sha256").update(`${multiSend.checkoutId}:${requestContentHash}:${group?.currentOrderId || group?.lastRetiredOrderId || ""}`).digest("hex").slice(0, 32)}`;
      const paymentMode = resolvePaymentMode();
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || null;
      if (paymentMode !== "local_mock" && !publishableKey?.startsWith(paymentMode === "stripe_test" ? "pk_test_" : "pk_live_")) {
        throw new PaymentModeConfigError("A matching Stripe publishable key is not configured.", 503, "STRIPE_PUBLISHABLE_KEY_MISMATCH");
      }
      const paymentResponse = (order: Order, payment: { clientSecret: string | null; paymentIntentId: string; isMock: boolean }) => {
        const response = NextResponse.json({ orderId: order.id, operationId: order.operationId || operationId, viewToken: order.viewToken, clientSecret: payment.clientSecret, paymentIntentId: payment.paymentIntentId, publishableKey, isMock: payment.isMock, amountInCents: order.amountInCents, finalAmountInCents: order.finalAmountInCents, quote: order.quote, price: order.checkoutPrice, discountCode: order.discountCode, discountAmountInCents: order.discountAmountInCents || 0, quoteId: order.quoteId, appliedOfferId: order.appliedOfferId, appliedOfferVersion: order.appliedOfferVersion, isFree: false }, { headers: { "Cache-Control": "private, no-store" } });
        if (guestCheckoutCapability && ownerKey === guestOwnerKey) response.cookies.set(`smn_multi_send_${multiSend.checkoutId}`, guestCheckoutCapability, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api", maxAge: 60 * 60 * 24 * 30 });
        return withOperationId(response, operationId);
      };
      const existingOrder = await getOrderById(orderId);
      if (existingOrder) {
        if (existingOrder.userId && existingOrder.userId !== accountAssociation.userId) return NextResponse.json({ error: "Checkout belongs to a different account.", code: "MULTI_SEND_OWNER_MISMATCH" }, { status: 403 });
        const retryLease = await claimMultiSendRetry(multiSend.checkoutId, ownerKey, orderId);
        if (!retryLease) return NextResponse.json({ error: "Checkout could not be verified or is being replaced.", code: "MULTI_SEND_OWNER_MISMATCH" }, { status: 403 });
        activeMultiSendClaim = { checkoutId: multiSend.checkoutId, leaseId: retryLease, orderSaved: true };
        if (existingOrder.multiSend?.contentRevision !== requestContentHash || existingOrder.status !== "PENDING_PAYMENT") {
          await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
          activeMultiSendClaim = null;
          return NextResponse.json({ error: "This checkout has already been paid or changed. Start a new checkout review.", code: "MULTI_SEND_CHECKOUT_STALE" }, { status: 409 });
        }
        if (existingOrder.paymentMode && existingOrder.paymentMode !== paymentMode) throw new CheckoutResumeError("Payment mode changed while this checkout was open.");
        if (!await verifyCheckoutHold(existingOrder)) {
          await retireCheckoutOrder(existingOrder, "expired");
          await resetMultiSendCheckoutAfterCanceledReplacement(multiSend.checkoutId, retryLease, existingOrder.id);
          activeMultiSendClaim = null;
          return NextResponse.json({ error: "This offer expired before payment. Review the current total and try again.", code: "MULTI_SEND_OFFER_QUOTE_EXPIRED" }, { status: 409 });
        }
        let payment;
        if (existingOrder.stripePaymentId && paymentMode !== "local_mock") {
          const pi = await getStripeClient().paymentIntents.retrieve(existingOrder.stripePaymentId);
          if (!verifyCheckoutIntent(existingOrder, pi, paymentMode)) throw new CheckoutResumeError("The saved payment does not match this checkout snapshot.");
          if (!["requires_payment_method", "requires_confirmation"].includes(pi.status)) {
            await blockMultiSendCheckout(multiSend.checkoutId, retryLease);
            activeMultiSendClaim = null;
            const orderPath = checkoutOrderPath(existingOrder.id, existingOrder.viewToken);
            return NextResponse.json({ error: "This payment is already complete or closed. Reopening the order to view its latest status.", code: "MULTI_SEND_PAYMENT_CLOSED", orderId: existingOrder.id, viewToken: existingOrder.viewToken, orderPath }, { status: 409 });
          }
          payment = { clientSecret: pi.client_secret, paymentIntentId: pi.id, isMock: false };
        } else if (existingOrder.stripePaymentId) {
          if (existingOrder.stripePaymentId !== `pi_mock_${existingOrder.id}`) throw new CheckoutResumeError("The saved payment does not match this checkout snapshot.");
          payment = await createCardPaymentIntent({ orderId, amountInCents: existingOrder.amountInCents });
        } else {
          payment = await openCheckoutPayment(existingOrder);
        }
        await finishMultiSendCheckout(multiSend.checkoutId, retryLease);
        activeMultiSendClaim = null;
        return paymentResponse(existingOrder, payment);
      }
      const claim = await claimMultiSendCheckout({ checkoutId: multiSend.checkoutId, contentRevision: requestContentHash, orderId, ownerKey, replaces: body.replaces });
      if (!claim.claimed || !claim.leaseId) return NextResponse.json({ error: claim.code === "MULTI_SEND_REPLACEMENT_PROOF_REQUIRED" ? "Review edits requires the previous checkout capability." : "Another checkout update is already in progress or needs support.", code: claim.code || "MULTI_SEND_CHECKOUT_BUSY" }, { status: claim.code === "MULTI_SEND_OWNER_MISMATCH" ? 403 : 409 });
      activeMultiSendClaim = { checkoutId: multiSend.checkoutId, leaseId: claim.leaseId, previousOrderId: claim.previousOrderId };
      if (claim.previousOrderId) {
        const prior = await getOrderById(claim.previousOrderId);
        if (!prior || (prior.userId && prior.userId !== accountAssociation.userId)) throw new CheckoutResumeError("The previous checkout could not be verified.");
        try {
          await retireCheckoutOrder(prior, "removed");
          activeMultiSendClaim.oldRetired = true;
        } catch (error) {
          if (!(error instanceof CheckoutResumeError) || !error.order) throw error;
          await blockMultiSendCheckout(multiSend.checkoutId, claim.leaseId);
          activeMultiSendClaim = null;
          const orderPath = checkoutOrderPath(prior.id, prior.viewToken);
          return NextResponse.json({ error: "The previous payment may have completed. Reopening its order so you can view the latest status.", code: "MULTI_SEND_LATE_PAYMENT", orderId: prior.id, viewToken: prior.viewToken, orderPath }, { status: 409 });
        }
      } else {
        await retirePriorCheckout(req, body.replaces, accountAssociation.userId, false);
      }
      const contentRevision = requestContentHash;
      const basket = checkoutPromotionBasket({ workflow: "multisend", revision: contentRevision, ownerUid, recipients: checkedAddresses.map(({ id }) => ({ id, countryCode: "US" })) });
      const decision = await checkoutPromotionDecision({ req, code, reference, basket, durable: true, sessionId: body.sessionId });
      const abandon = async () => {
        if (claim.previousOrderId) await resetMultiSendCheckoutAfterCanceledReplacement(multiSend.checkoutId, claim.leaseId!, claim.previousOrderId);
        else await abortMultiSendCheckoutClaim({ checkoutId: multiSend.checkoutId, leaseId: claim.leaseId! });
        activeMultiSendClaim = null;
      };
      if (!decision.valid) {
        await abandon();
        return NextResponse.json({ error: decision.error, reason: decision.reason, price: decision.price }, { status: 400 });
      }
      const { price, quote: offer } = decision;
      const { lines: pricedLines, ...quote } = price;
      const discountAmountInCents = price.discountCents;
      const appliedCode = offer?.code;
      const quoteId = offer?.quoteId;
      const appliedOfferId = offer?.offerId;
      const appliedOfferVersion = offer?.offerVersion;
      const viewToken = `tok_${crypto.randomBytes(16).toString("hex")}`;
      const uploadMaster = await pinUploadOrderMaster(req, body, orderId)
        || (accountAssociation.userId ? await pinGeneratedOrderMaster(accountAssociation.userId, orderId, body.frontImageUrl) : undefined);
      const paymentRequest: CreateIntentParams = {
        orderId, amountInCents: quote.totalCents, idempotencyKey: `multi-send-${orderId}`,
        metadata: { quoteVersion: quote.version, quotedTotalCents: String(quote.totalCents), itemCount: String(multiSend.recipients.length), contentRevision, checkoutRevision: contentRevision, ...(appliedCode ? { discountCode: appliedCode, discountAmountCents: String(discountAmountInCents), quoteId: quoteId || "" } : {}) },
      };
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
        resolvedGreeting: resolveGreeting(multiSend.note.salutation || "", recipient.greeting),
        printedMessage: composeRecipientMessage(multiSend.note, recipient.greeting),
        amountInCents: pricedLines[index].netCents,
      }));
      const requestedEmail = typeof body.customerEmail === "string" ? body.customerEmail : "";
      const orderRecord: Order & Record<string, unknown> = {
        id: orderId, operationId, checkoutRevision: contentRevision, checkoutOwnerKey: ownerKey, checkoutPaymentRequest: paymentRequest, checkoutPrice: price, appliedPromotions: offer?.promotion?.evaluation.appliedPromotions || [], customerEmail: body.contactPolicyVersion === 1 ? "" : requestedEmail,
        ...(body.contactPolicyVersion === 1 ? { contactPolicyVersion: 1 as const } : {}), ...accountAssociation,
        ...(uploadMaster ? { uploadMaster } : {}),
        frontImageUrl: uploadMaster ? "" : body.frontImageUrl, printedMessage: "",
        handwrittenNote: body.handwrittenNote || "", fontStyleId: multiSend.note.style || body.fontStyleId || "1",
        recipientAddress: frozenRecipients[0].address, returnAddress: body.returnAddress,
        status: "PENDING_PAYMENT", amountInCents: quote.totalCents, originalAmountInCents: quote.basePriceCents,
        finalAmountInCents: quote.totalCents, quote, paymentMethod: "STRIPE", isFounderTest: req.cookies.get("smn_founder_device")?.value === "1",
        isTest: paymentMode !== "live", paymentMode, ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
        ...(batchAttribution ? { attribution: batchAttribution } : {}),
        ...(batchFollowupObservation ? { postPurchaseLinkObservation: batchFollowupObservation } : {}),
        ...(body.occasion ? { occasion: body.occasion } : {}),
        ...(body.recipientOccasion ? { recipientOccasion: body.recipientOccasion as RecipientOccasion } : {}),
        ...(body.experienceVersion ? { experienceVersion: body.experienceVersion } : {}),
        ...(appliedCode ? { discountCode: appliedCode } : {}), ...(discountAmountInCents ? { discountAmountInCents } : {}), ...(quoteId ? { quoteId } : {}), ...(appliedOfferId ? { appliedOfferId } : {}), ...(appliedOfferVersion ? { appliedOfferVersion } : {}),
        viewToken, createdAt: Date.now(), updatedAt: Date.now(),
        multiSend: { version: 1, kind: "parent", checkoutId: multiSend.checkoutId, recipients: frozenRecipients, shared: { frontImageUrl: uploadMaster ? "" : body.frontImageUrl, note: multiSend.note, fontStyleId: multiSend.note.style || body.fontStyleId || "1", returnAddress: body.returnAddress }, quote, contentRevision, manifestComplete: false, preparationState: "pending" },
      };
      if (offer) {
        const reservation = await reserveOfferForCheckout({ code: offer.code, orderId, sessionId: body.sessionId || "multi_send_checkout", quoteId, ownerId: ownerUid, ownerKey, checkoutRevision: contentRevision, expectedTotalCents: quote.totalCents, paymentMode, creationRequest: paymentRequest });
        if (!reservation.reserved) {
          await abandon();
          return NextResponse.json({ error: reservation.error || "This offer is unavailable.", reason: "exhausted", code: "MULTI_SEND_OFFER_RESERVATION_FAILED" }, { status: 409 });
        }
      }
      if (!await createOrderOnce(orderRecord)) throw new CheckoutResumeError("Checkout is updating. Please retry.");
      activeMultiSendClaim.orderSaved = true;
      const payment = await openCheckoutPayment(orderRecord);
      await finishMultiSendCheckout(multiSend.checkoutId, claim.leaseId);
      activeMultiSendClaim = null;
      return paymentResponse(orderRecord, payment);
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

    const accountAssociation = await resolveAccountOrderAssociation(req, body);
    const code = normalizeCheckoutCode(rawDiscountCode);
    const reference = typeof body.offerReference === "string" && body.offerReference.length <= 256 ? body.offerReference : undefined;
    const ownerUid = code || reference ? await verifiedPromotionOwner(req) : undefined;
    if ((rawDiscountCode && !code) || (body.offerReference && !reference)) return NextResponse.json({ error: "This offer is unavailable.", reason: "unavailable" }, { status: 400 });
    // Volatile attribution timestamps and session IDs can change on a return visit.
    // Consent and authenticated ownership affect the order and must still match.
    const snapshot = {
      frontImageUrl: requestedFrontImageUrl || "", uploadDesign: body.uploadDesign, accountImage: body.accountImage,
      printedMessage: printedMessage || "", handwrittenNote: handwrittenNote || "", fontStyleId,
      recipientAddress: canonicalRecipientAddress, returnAddress: canonicalReturnAddress, occasion: occasion || undefined,
      scheduledSendDate: scheduledSendDate || undefined, recipientOccasion: recipientOccasion || undefined,
      ...accountAssociation, addressDeferred: isAddressDeferred, discountCode: code, ...(reference ? { offerReference: reference } : {}),
      contactPolicyVersion: requestedContactPolicyVersion === 1 ? 1 : undefined,
      customerEmail: requestedContactPolicyVersion === 1 ? undefined : customerEmail,
      isFounderTest, isInternationalPreview, priceVersion: ORDER_PRICE_VERSION,
      privacyRestricted: Boolean(attribution?.optOut || attribution?.gpc || req.headers.get("sec-gpc") === "1"),
    };
    const binding = checkoutBinding(body.checkoutDraftKey, snapshot);
    const priorBinding = binding && await binding.get();
    let seed = priorBinding?.data()?.orderId ? priorBinding.data() as CheckoutSeed : undefined;
    if (binding && seed && await clearClosedCheckoutBinding(binding, seed)) seed = undefined;
    if (!priorBinding?.exists && binding && body.previousCheckout) {
      const previous = await legacyCheckoutSeed(body.previousCheckout, snapshot);
      if (previous) seed = await claimCheckout(binding, previous);
    }
    const revision = binding?.id || crypto.randomUUID();
    const basket = checkoutPromotionBasket({ workflow: "single", revision, ownerUid, recipients: [{ id: "card", countryCode: normalizedCountry }] });
    if (!seed) {
      await retirePriorCheckout(req, body.replaces, accountAssociation.userId, true);
      const result = await checkoutPromotionDecision({ req, code, reference, basket, durable: true, sessionId });
      if (!result.valid) return NextResponse.json({ error: result.error, reason: result.reason, price: result.price }, { status: 400 });
      seed = await claimCheckout(binding, checkoutSeed(operationId, result.quote || null));
    }
    const { orderId, viewToken, offer } = seed;
    const appliedCode = offer?.code;
    const quoteId = offer?.quoteId;
    const appliedOfferId = offer?.offerId;
    const appliedOfferVersion = offer?.offerVersion;
    const discountAmountInCents = offer?.discountAmountCents || 0;
    const price = checkoutPriceComponents(basket, normalizedCountry, { discountCents: discountAmountInCents, evaluation: offer?.promotion?.evaluation });
    const { lines: _lines, ...orderQuote } = price;
    if (offer?.promotion?.basket.ownerUid && offer.promotion.basket.ownerUid !== ownerUid) throw new CheckoutResumeError("Verify to use this offer.");
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
    const ownerKey = singleCheckoutOwnerKey(viewToken);
    const paymentRequest: CreateIntentParams | undefined = finalAmountInCents === 0 ? undefined : {
      orderId, amountInCents: finalAmountInCents, idempotencyKey: "checkout-" + orderId,
      metadata: {
        operationId: seed.operationId, recipientCountryCode: normalizedCountry, checkoutRevision: revision,
        quoteVersion: orderQuote.version, quotedTotalCents: String(orderQuote.totalCents),
        surchargeCents: String(orderQuote.internationalSurchargeCents),
        ...(appliedCode ? { discountCode: appliedCode, discountAmountCents: String(discountAmountInCents), originalAmountCents: String(CARD_FLAT_RATE_CENTS), quoteId: quoteId || "" } : {}),
      },
    };
    if (offer) {
      const reservation = await reserveOfferForCheckout({
        code: offer.code, orderId, sessionId: sessionId || "sess_checkout", quoteId, ownerId: ownerUid,
        ownerKey, checkoutRevision: revision, expectedTotalCents: finalAmountInCents,
        ...(resolvedMode ? { paymentMode: resolvedMode } : {}), ...(paymentRequest ? { creationRequest: paymentRequest } : {}),
      });
      if (!reservation.reserved) return NextResponse.json({ error: reservation.error || "This offer is unavailable.", reason: "exhausted" }, { status: 409 });
    }

    // Construct and persist draft Order to Firestore
    const orderRecord: Order & Record<string, unknown> = {
      id: orderId,
      operationId: seed.operationId,
      ...(binding ? { checkoutResumeVersion: 1 } : {}),
      checkoutRevision: revision, checkoutOwnerKey: ownerKey, checkoutPrice: price,
      appliedPromotions: offer?.promotion?.evaluation.appliedPromotions || [],
      ...(paymentRequest && resolvedMode ? { checkoutPaymentRequest: paymentRequest, paymentMode: resolvedMode } : {}),
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
      paymentMethod: paymentRequest ? "STRIPE" : "PROMO_CODE",
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

    const paymentIntentResult = paymentRequest ? await openCheckoutPayment(orderRecord) : null;
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
      price,
      discountCode: appliedCode,
      discountAmountInCents,
      quoteId,
      appliedOfferId,
      appliedOfferVersion,
      isFree: !paymentIntentResult,
    });
  } catch (error: unknown) {
    if (activeMultiSendClaim) {
      try {
        const { checkoutId, leaseId, orderSaved, oldRetired, previousOrderId } = activeMultiSendClaim;
        if (orderSaved) await finishMultiSendCheckout(checkoutId, leaseId);
        else if (oldRetired) await resetMultiSendCheckoutAfterCanceledReplacement(checkoutId, leaseId, previousOrderId);
        else await abortMultiSendCheckoutClaim({ checkoutId, leaseId, previousOrderId });
      } catch (claimError) { console.error("[Checkout] Multi-send recovery", claimError instanceof Error ? claimError.name : "CheckoutError"); }
      activeMultiSendClaim = null;
    }
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

    const rawMsg = error instanceof Error ? error.name : "CheckoutError";
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
