import {
  firestoreDb,
  getOrdersCollection,
  getOrderById,
  updateOrderStatus,
  getImageCachePoolCollection,
  recordDiscountUsage,
  resolveIncidentsForOrder,
} from "./firebase-admin";
import { fulfillHandwryttenOrder } from "./handwrytten";
import { logIncident } from "./incident-logger";
import { Order } from "./types";
import { sendMetaCapiPurchaseEvent } from "./meta-conversions-api";
import { recordServerTelemetry } from "./metrics-rollup";
import { sendAddressDeferredEmail } from "./email-alerts";
import { effectiveOrderEmail, savePaidOrderReminder } from "./checkout-contact";
import { normalizeCountryCode, getSupplierCountry, isProductionInternationalEnabled } from "./mailing-destinations";
import { isOrderQuoteValid } from "./order-pricing";

export interface ProcessPaidOrderResult {
  success: boolean;
  status: string;
  handwryttenOrderId?: string;
  error?: string;
  alreadyProcessed?: boolean;
}

export interface ProcessOrderOptions {
  clientIp?: string;
  userAgent?: string;
  isTest?: boolean;
  paymentMode?: "live" | "stripe_test" | "local_mock";
}

export function verifyPaymentIntentForOrder(input: {
  paymentIntent: { status?: string; amount?: number; amount_received?: number; currency?: string; metadata?: Record<string, string> | null };
  orderId: string;
  order: Order;
}): { valid: boolean; reason?: string; expectedAmountCents: number; capturedAmountCents: number } {
  const pi = input.paymentIntent;
  const storedQuote = input.order.quote;
  const expectedAmountCents = storedQuote && Number.isInteger(storedQuote.totalCents)
      ? storedQuote.totalCents
      : typeof input.order.finalAmountInCents === "number" && input.order.finalAmountInCents >= 0
      ? input.order.finalAmountInCents
      : typeof input.order.amountInCents === "number" && input.order.amountInCents >= 0
      ? input.order.amountInCents
      : 900;
  const addressCountry = normalizeCountryCode(input.order.recipientAddress?.country) || (input.order.recipientAddress?.country ? null : "US");
  if (!addressCountry) {
    return { valid: false, reason: "Recipient country is unknown and cannot be defaulted to the United States.", expectedAmountCents, capturedAmountCents: pi.amount_received ?? pi.amount ?? 0 };
  }
  if (storedQuote && (!isOrderQuoteValid(storedQuote) || storedQuote.countryCode !== addressCountry || (storedQuote.totalCents !== input.order.finalAmountInCents || storedQuote.totalCents !== input.order.amountInCents))) {
    return { valid: false, reason: "Stored order quote does not match the immutable recipient country and amount.", expectedAmountCents, capturedAmountCents: pi.amount_received ?? pi.amount ?? 0 };
  }
  if (addressCountry !== "US") {
    const verifiedDestination = getSupplierCountry(addressCountry);
    if (!verifiedDestination || (input.order.supplierCountryId && input.order.supplierCountryId !== verifiedDestination.supplierCountryId)) {
      return { valid: false, reason: "Stored supplier destination mapping does not match the recipient country.", expectedAmountCents, capturedAmountCents: pi.amount_received ?? pi.amount ?? 0 };
    }
  }
  const capturedAmountCents = pi.amount_received ?? pi.amount ?? 0;
  if (storedQuote && pi.metadata?.recipientCountryCode && pi.metadata.recipientCountryCode !== addressCountry) return { valid: false, reason: "Payment intent destination does not match the order quote.", expectedAmountCents, capturedAmountCents };
  if (storedQuote && pi.metadata?.quoteVersion && pi.metadata.quoteVersion !== storedQuote.version) return { valid: false, reason: "Payment intent quote version does not match the order snapshot.", expectedAmountCents, capturedAmountCents };
  if (storedQuote && pi.metadata?.quotedTotalCents && Number(pi.metadata.quotedTotalCents) !== storedQuote.totalCents) return { valid: false, reason: "Payment intent total does not match the order snapshot.", expectedAmountCents, capturedAmountCents };
  if (pi.status !== "succeeded" && pi.status !== "requires_capture") return { valid: false, reason: `Payment status is ${pi.status || "unknown"}, expected succeeded`, expectedAmountCents, capturedAmountCents };
  if ((pi.currency || "").toLowerCase() !== "usd") return { valid: false, reason: `Currency mismatch: expected usd, got ${pi.currency || "unknown"}`, expectedAmountCents, capturedAmountCents };
  if (capturedAmountCents !== expectedAmountCents) return { valid: false, reason: `Payment amount mismatch: expected ${expectedAmountCents}¢, got ${capturedAmountCents}¢`, expectedAmountCents, capturedAmountCents };
  if (!input.orderId || (pi.metadata?.orderId && pi.metadata.orderId !== input.orderId)) return { valid: false, reason: "PaymentIntent metadata orderId does not match the order.", expectedAmountCents, capturedAmountCents };
  return { valid: true, expectedAmountCents, capturedAmountCents };
}

export interface SenderValidationResult {
  valid: boolean;
  error?: string;
  isBrandSender?: boolean;
}

export function validatePersonalSender(
  address?: Partial<Order["returnAddress"]> | null
): SenderValidationResult {
  if (!address) {
    return { valid: false, error: "Return address is required." };
  }

  const firstName = (address.firstName || "").trim();
  const lastName = (address.lastName || "").trim();
  const street1 = (address.street1 || "").trim();
  const city = (address.city || "").trim();
  const state = (address.state || "").trim();
  const zip = (address.zip || "").trim();

  if (!firstName) {
    return { valid: false, error: "Personal sender first name is required." };
  }

  const isBrandSender =
    firstName.toLowerCase() === "aster & blanche" ||
    (firstName.toLowerCase() === "aster" && lastName.toLowerCase() === "blanche");

  if (isBrandSender) {
    return {
      valid: false,
      isBrandSender: true,
      error: "Return address must use personal sender name, not brand name Aster & Blanche.",
    };
  }

  if (!street1 || !city || !state || !zip) {
    return { valid: false, error: "Complete return address (street, city, state, ZIP) is required." };
  }

  return { valid: true };
}

export class DuplicateDispatchError extends Error {
  public status: string;
  public handwryttenOrderId?: string;
  constructor(status: string, handwryttenOrderId?: string) {
    super(`Order already in state ${status}`);
    this.name = "DuplicateDispatchError";
    this.status = status;
    this.handwryttenOrderId = handwryttenOrderId;
  }
}

/**
 * Atomically and idempotently processes and fulfills a paid order.
 * Uses a Firestore database transaction to acquire an exclusive 'DISPATCHING' lock,
 * completely preventing concurrent double-dispatch races between client confirmation
 * and asynchronous Stripe webhooks.
 */
export async function processPaidOrder(
  orderId: string,
  paymentIntentId: string,
  customerEmail?: string,
  clientContext?: ProcessOrderOptions
): Promise<ProcessPaidOrderResult> {
  const authorityOrder = await getOrderById(orderId);
  if (!authorityOrder) return { success: false, status: "NOT_FOUND", error: `Order ${orderId} not found in database.` };
  if (authorityOrder.stripePaymentId && authorityOrder.stripePaymentId !== paymentIntentId) {
    return { success: false, status: "PAYMENT_VERIFICATION_FAILED", error: "PaymentIntent identifier does not match the PaymentIntent bound to this order." };
  }
  const authorityCountry = normalizeCountryCode(authorityOrder.recipientAddress?.country) || (authorityOrder.recipientAddress?.country ? null : "US");
  const alreadySubmitted = ["PROCESSING_HANDWRYTTEN", "MAILED", "AWAITING_RECIPIENT_ADDRESS", "DISPATCH_UNCERTAIN"].includes(authorityOrder.status) || authorityOrder.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD";

  if (authorityOrder.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD") {
    return { success: true, status: authorityOrder.status, alreadyProcessed: true, error: "International preview order is held for review; supplier fulfillment is disabled." };
  }
  if (authorityCountry && authorityCountry !== "US") {
    const isProductionApproved = isProductionInternationalEnabled() && process.env.STAGING_REVIEW_ONLY !== "true" && !authorityOrder.isInternationalPreview;
    if (!isProductionApproved) {
      await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "INTERNATIONAL_PREVIEW_HOLD", fulfillmentError: "Staging review guard prevents supplier fulfillment." } as any);
      return { success: true, status: "QUEUED_FOR_FULFILLMENT", error: "Staging review order is held; supplier fulfillment is disabled." };
    }
  }
  if (authorityCountry && authorityCountry !== "US") {
    const verifiedDestination = getSupplierCountry(authorityCountry);
    if (!verifiedDestination || authorityOrder.supplierCountryId !== verifiedDestination.supplierCountryId) {
      await updateOrderStatus(orderId, { status: "QUEUED_FOR_FULFILLMENT", fulfillmentError: "Supplier country mapping does not match the accepted order snapshot." } as any);
      return { success: false, status: "QUEUED_FOR_FULFILLMENT", error: "Supplier country mapping does not match the accepted order snapshot." };
    }
  }
  if ((authorityOrder.contactPolicyVersion === 1 || authorityOrder.contactEmailChoice) && (!authorityOrder.contactEmailChoice || authorityOrder.contactEmailSyncStatus !== "synced")) {
    await updateOrderStatus(orderId, {
      status: "PAYMENT_RECEIVED",
      fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED",
      fulfillmentError: "Payment was received while the contact preference update was pending. Reconcile contact state before fulfillment.",
    } as any);
    await logIncident({
      type: "STRIPE", severity: "error", summary: `Paid order contact preference needs reconciliation (${orderId})`,
      technicalDetails: "The PaymentIntent succeeded while its explicit contact-email preference was not synchronized. Fulfillment and application email dispatch were held.",
      metadata: { orderId, paymentIntentId },
    });
    return { success: true, status: "PAYMENT_RECEIVED", error: "Payment received; contact preference reconciliation is required before fulfillment." };
  }
  if (alreadySubmitted) {
    if (authorityOrder.status === "DISPATCH_UNCERTAIN") return { success: false, status: "DISPATCH_UNCERTAIN", error: "Supplier submission outcome is uncertain; reconcile before retrying." };
    return { success: true, status: authorityOrder.status, handwryttenOrderId: authorityOrder.handwryttenOrderId, alreadyProcessed: true };
  }

  let order: Order;

  // 1. Atomic Locking via Firestore Transaction:
  // Read and check status atomically, and claim the 'DISPATCHING' lock.
  // This guarantees that even under extreme concurrency, only ONE thread acquires the lock.
  try {
    order = await firestoreDb.runTransaction(async (transaction: any) => {
      const docRef = getOrdersCollection().doc(orderId);
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists) {
        throw new Error(`Order ${orderId} not found in database.`);
      }

      const existingOrder = snapshot.data() as Order;

      // Recheck contact authorization inside the same transaction that takes the
      // dispatch lock. A webhook may have read an older synced snapshot while a
      // capability update was claiming its pending marker.
      if ((existingOrder.contactPolicyVersion === 1 || existingOrder.contactEmailChoice) && (!existingOrder.contactEmailChoice || existingOrder.contactEmailSyncStatus !== "synced")) {
        transaction.update(docRef, {
          status: "PAYMENT_RECEIVED",
          fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED",
          fulfillmentError: "Contact preference synchronization is pending; dispatch is held.",
          updatedAt: Date.now(),
        });
        return { ...existingOrder, status: "PAYMENT_RECEIVED", fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED" };
      }

      // Check if already dispatched, processing, or actively being dispatched
      const isStaleLock =
        existingOrder.status === "DISPATCHING" &&
        existingOrder.dispatchStartedAt &&
        Date.now() - existingOrder.dispatchStartedAt > 5 * 60 * 1000;

      if (
        (existingOrder.status === "DISPATCHING" && !isStaleLock) ||
        existingOrder.status === "PROCESSING_HANDWRYTTEN" ||
        existingOrder.status === "MAILED" ||
        existingOrder.status === "AWAITING_RECIPIENT_ADDRESS"
      ) {
        throw new DuplicateDispatchError(
          existingOrder.status,
          existingOrder.handwryttenOrderId
        );
      }

      const finalEmail = effectiveOrderEmail(existingOrder, customerEmail);

      if (existingOrder.addressDeferred || (existingOrder as any).address_deferred) {
        transaction.update(docRef, {
          status: "AWAITING_RECIPIENT_ADDRESS",
          fulfillmentStatus: finalEmail ? "AWAITING_RECIPIENT_ADDRESS" : "CONTACT_RECOVERY_REQUIRED",
          stripePaymentId: paymentIntentId,
          customerEmail: finalEmail,
          updatedAt: Date.now(),
          ...(clientContext?.isTest !== undefined || clientContext?.paymentMode
            ? {
                isTest: Boolean(clientContext?.isTest ?? (clientContext?.paymentMode !== "live")),
                paymentMode: clientContext?.paymentMode || "stripe_test",
              }
            : {}),
        });

        return {
          ...existingOrder,
          status: "AWAITING_RECIPIENT_ADDRESS",
          fulfillmentStatus: finalEmail ? "AWAITING_RECIPIENT_ADDRESS" : "CONTACT_RECOVERY_REQUIRED",
          stripePaymentId: paymentIntentId,
          customerEmail: finalEmail,
        };
      }

      // Atomically transition status to DISPATCHING lock
      transaction.update(docRef, {
        status: "DISPATCHING",
        stripePaymentId: paymentIntentId,
        customerEmail: finalEmail,
        dispatchStartedAt: Date.now(),
        updatedAt: Date.now(),
        ...(clientContext?.isTest !== undefined || clientContext?.paymentMode
          ? {
              isTest: Boolean(clientContext?.isTest ?? (clientContext?.paymentMode !== "live")),
              paymentMode: clientContext?.paymentMode || "stripe_test",
            }
          : {}),
      });

      return {
        ...existingOrder,
        status: "DISPATCHING",
        stripePaymentId: paymentIntentId,
        customerEmail: finalEmail,
      };
    });
  } catch (err: unknown) {
    if (err instanceof DuplicateDispatchError) {
      console.log(
        `[OrderProcessor] Idempotency lock active: Order ${orderId} is currently '${err.status}' (HW ID: ${err.handwryttenOrderId || "pending"}). Safely dropping duplicate dispatch.`
      );
      return {
        success: true,
        status: err.status,
        handwryttenOrderId: err.handwryttenOrderId,
        alreadyProcessed: true,
      };
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return {
        success: false,
        status: "NOT_FOUND",
        error: msg,
      };
    }

    console.error(`[OrderProcessor] Transaction exception for order ${orderId}:`, msg);
    throw err;
  }

  if (order.status === "PAYMENT_RECEIVED" && order.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED") {
    return { success: true, status: "PAYMENT_RECEIVED", error: "Payment received; contact preference reconciliation is required before fulfillment." };
  }

  try {
    const orderFinalEmail = effectiveOrderEmail(order, customerEmail);
    if (orderFinalEmail) {
      await savePaidOrderReminder(order, orderFinalEmail);
    }
  } catch (remErr) {
    console.warn("[OrderProcessor] Notice saving paid order reminder:", remErr);
  }

  // Record revenue authority only for positive, live Stripe customer captures.
  const verifiedAmountInCents = order.amountInCents;
  const isEligibleLiveCustomerPayment =
    Number.isInteger(verifiedAmountInCents) && verifiedAmountInCents > 0 &&
    clientContext?.paymentMode === "live" && !clientContext.isTest &&
    !order.isTest && !order.isComp && !order.isFounderTest && order.paymentMethod === "STRIPE";
  if (isEligibleLiveCustomerPayment) {
    try {
      const rawSessionId =
        (order.attribution as any)?.sessionId ||
        order.sessionId ||
        `sess_${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
      await recordServerTelemetry({
        eventName: "purchase_verified",
        sessionId: rawSessionId,
        orderId,
        metadata: {
          amountInCents: verifiedAmountInCents,
          isTest: Boolean(clientContext?.isTest || order.isTest),
          paymentMode: clientContext?.paymentMode || order.paymentMode || "stripe_test",
        },
        experienceVersion: order.experienceVersion,
      });
    } catch (telErr) {
      console.warn("[OrderProcessor] Notice recording purchase_verified telemetry:", telErr);
    }
  }

  // 4. Record discount code usage metrics if applicable
  if (order.discountCode) {
    try {
      await recordDiscountUsage(order.discountCode, order.discountAmountInCents || 0);
    } catch (discErr) {
      console.warn("[OrderProcessor] Notice recording discount code usage:", discErr);
    }
  }

  // Address Deferral Bypass: halt automatic Handwrytten dispatch, order is awaiting recipient address from magic link
  if (order.status === "AWAITING_RECIPIENT_ADDRESS" || order.addressDeferred || (order as any).address_deferred) {
    try {
      const finalTo = customerEmail || order.customerEmail;
      if (finalTo) {
        await sendAddressDeferredEmail({
          to: finalTo,
          orderId,
          viewToken: order.viewToken || "",
          recipientName: `${order.recipientAddress?.firstName || ""} ${order.recipientAddress?.lastName || ""}`.trim() || "Recipient",
        });
      }
    } catch (emailErr) {
      console.warn("[OrderProcessor] Error sending address deferred magic link email:", emailErr);
    }

    return {
      success: true,
      status: "AWAITING_RECIPIENT_ADDRESS",
    };
  }

  // S0-06: Reject orders without a personal sender name and return address before fulfillment
  const senderValidation = validatePersonalSender(order.returnAddress);
  if (!senderValidation.valid) {
    const errorMsg = senderValidation.error || "Missing or invalid personal sender return address.";
    console.error(`[OrderProcessor Critical] ${errorMsg} on Order ${orderId}. Halting fulfillment.`);

    await updateOrderStatus(orderId, {
      status: "QUEUED_FOR_FULFILLMENT",
      fulfillmentError: `${errorMsg} Requires operator review.`,
    });

    await logIncident({
      type: "HANDWRYTTEN",
      category: "OPERATOR_ACTION",
      severity: "error",
      summary: `Invalid/Missing Sender Address on Order ${orderId}`,
      technicalDetails: `${errorMsg} Automatic dispatch halted to prevent brand-name or missing sender delivery.`,
      metadata: { orderId, returnAddress: order.returnAddress },
    });

    return {
      success: false,
      status: "QUEUED_FOR_FULFILLMENT",
      error: errorMsg,
    };
  }

  const isTestModePayment = Boolean(
    clientContext?.isTest ||
    clientContext?.paymentMode === "stripe_test" ||
    clientContext?.paymentMode === "local_mock"
  );

  const recipientCountry = normalizeCountryCode(order.recipientAddress?.country) || (order.recipientAddress?.country ? null : "US");
  const isInternationalOrder = recipientCountry && recipientCountry !== "US";

  let fulfillment: { success: boolean; order_id?: string; error?: string; details?: unknown };

  if (isInternationalOrder && (order.isInternationalPreview || !isProductionInternationalEnabled())) {
    console.log(
      `[OrderProcessor] International preview hold active for Order ${orderId}. Skipping live supplier dispatch.`
    );
    await updateOrderStatus(orderId, {
      status: "QUEUED_FOR_FULFILLMENT",
      fulfillmentStatus: "INTERNATIONAL_PREVIEW_HOLD",
      fulfillmentError: "International staging hold: physical fulfillment not dispatched.",
    });
    return {
      success: true,
      status: "QUEUED_FOR_FULFILLMENT",
      handwryttenOrderId: `intl_preview_hold_${orderId}`,
    };
  } else if (isTestModePayment) {
    // Test/Live safety boundary: Test payments must NEVER submit to live Handwrytten supplier
    console.log(
      `[OrderProcessor] Test payment mode active (${clientContext?.paymentMode || "stripe_test"}). Skipping live Handwrytten dispatch.`
    );
    fulfillment = {
      success: true,
      order_id: `test_hw_${orderId}`,
    };
  } else {
    // 5. Dispatch to Handwrytten robotic pen fulfillment with deterministic orderId for supplier idempotency
    fulfillment = await fulfillHandwryttenOrder({
      orderId,
      imageUrl: order.frontImageUrl,
      printedGreeting: order.printedMessage,
      handwrittenMessage: order.handwrittenNote,
      fontId: order.fontStyleId || "1",
      recipient: order.recipientAddress,
      returnAddress: order.returnAddress,
      scheduledSendDate: order.scheduledSendDate,
    });
  }

  if (!fulfillment.success) {
    const rawError = fulfillment.error || "";
    console.error(`[OrderProcessor] Handwrytten dispatch queued/failed for Order ${orderId}:`, rawError);
    await updateOrderStatus(orderId, {
      status: "QUEUED_FOR_FULFILLMENT",
      fulfillmentError: rawError || "Awaiting studio fulfillment queue",
    });

    const isBillingError = /payment|card|balance|credit|funds/i.test(rawError);
    const isAddressError = /address|zip|postal|city|state|street/i.test(rawError);

    const category = isBillingError
      ? "STUDIO_BILLING"
      : isAddressError
      ? "OPERATOR_ACTION"
      : "TRANSIENT";

    const summaryPrefix = isBillingError
      ? "[Studio Wholesale Billing] Handwrytten wholesale charge declined"
      : isAddressError
      ? "[Recipient Address Error] Recipient address rejected"
      : "Handwrytten robotic pen dispatch failed";

    await logIncident({
      type: "HANDWRYTTEN",
      category,
      severity: isBillingError ? "error" : "warning",
      summary: `${summaryPrefix} for Order ${orderId}: ${rawError || "Fulfillment API error"}`,
      technicalDetails: rawError || "Handwrytten singleStepOrder API error",
      metadata: { orderId, details: fulfillment.details },
    });

    try {
      const rawSessionId =
        (order.attribution as any)?.sessionId ||
        order.sessionId ||
        `sess_${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
      await recordServerTelemetry({
        eventName: "fulfillment_failed",
        sessionId: rawSessionId,
        orderId,
        metadata: {
          error: rawError,
          isTest: isTestModePayment,
        },
        experienceVersion: order.experienceVersion,
      });
    } catch (telErr) {
      console.warn("[OrderProcessor] Notice recording fulfillment_failed telemetry:", telErr);
    }

    return {
      success: false,
      status: "QUEUED_FOR_FULFILLMENT",
      error: rawError,
    };
  }

  // 6. Update Firestore Order to PROCESSING_HANDWRYTTEN
  await updateOrderStatus(orderId, {
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: fulfillment.order_id,
    fulfillmentError: undefined,
    ...(clientContext?.isTest !== undefined || clientContext?.paymentMode
      ? {
          isTest: Boolean(clientContext?.isTest ?? (clientContext?.paymentMode !== "live")),
          paymentMode: clientContext?.paymentMode || "stripe_test",
        }
      : {}),
  } as any);

  // 7. Auto-resolve any prior incidents for this order
  try {
    await resolveIncidentsForOrder(
      orderId,
      `Self-resolved via successful robotic pen dispatch (HW ID: ${fulfillment.order_id})`
    );
  } catch (resolveErr) {
    console.warn("[OrderProcessor] Notice auto-resolving prior incidents:", resolveErr);
  }

  // 8. Mark image as CLAIMED in image_cache_pool if matched
  try {
    const cacheSnapshot = await getImageCachePoolCollection()
      .where("imageUrl", "==", order.frontImageUrl)
      .limit(1)
      .get();

    if (!cacheSnapshot.empty) {
      const docId = cacheSnapshot.docs[0].id;
      await getImageCachePoolCollection().doc(docId).update({
        status: "CLAIMED",
      });
    }
  } catch (cacheErr) {
    console.warn("[OrderProcessor] Notice updating cache pool status:", cacheErr);
  }

  // 9. Dispatch Meta Conversions API (CAPI) Purchase Event (deduplicated via event_id: orderId)
  if (!order.metaCapiTrackedAt) {
    try {
      await sendMetaCapiPurchaseEvent({
        order: {
          ...order,
          customerEmail: customerEmail || order.customerEmail,
        },
        clientIp: clientContext?.clientIp,
        userAgent: clientContext?.userAgent,
      });
      await updateOrderStatus(orderId, {
        metaCapiTrackedAt: Date.now(),
      });
    } catch (capiErr) {
      console.warn("[OrderProcessor] Notice sending Meta CAPI purchase event:", capiErr);
    }
  }

  // Record server authority telemetry for submitted fulfillment
  try {
    const rawSessionId =
      (order.attribution as any)?.sessionId ||
      order.sessionId ||
      `sess_${orderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
    await recordServerTelemetry({
      eventName: "fulfillment_submitted",
      sessionId: rawSessionId,
      orderId,
      metadata: {
        handwryttenOrderId: fulfillment.order_id,
        isTest: isTestModePayment,
      },
      experienceVersion: order.experienceVersion,
    });
  } catch (telErr) {
    console.warn("[OrderProcessor] Notice recording fulfillment_submitted telemetry:", telErr);
  }

  console.log(`[OrderProcessor] Order ${orderId} successfully dispatched! HW ID: ${fulfillment.order_id}`);

  return {
    success: true,
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: fulfillment.order_id,
  };
}
