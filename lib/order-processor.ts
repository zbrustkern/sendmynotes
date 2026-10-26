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

      const finalEmail = customerEmail || existingOrder.customerEmail;

      if (existingOrder.addressDeferred || (existingOrder as any).address_deferred) {
        transaction.update(docRef, {
          status: "AWAITING_RECIPIENT_ADDRESS",
          fulfillmentStatus: "AWAITING_RECIPIENT_ADDRESS",
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
          fulfillmentStatus: "AWAITING_RECIPIENT_ADDRESS",
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

  let fulfillment: { success: boolean; order_id?: string; error?: string; details?: unknown };

  if (isTestModePayment) {
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
