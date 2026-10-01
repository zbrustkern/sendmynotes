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

export interface ProcessPaidOrderResult {
  success: boolean;
  status: string;
  handwryttenOrderId?: string;
  error?: string;
  alreadyProcessed?: boolean;
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
  customerEmail?: string
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
        existingOrder.status === "MAILED"
      ) {
        throw new DuplicateDispatchError(
          existingOrder.status,
          existingOrder.handwryttenOrderId
        );
      }

      const finalEmail = customerEmail || existingOrder.customerEmail;

      // Atomically transition status to DISPATCHING lock
      transaction.update(docRef, {
        status: "DISPATCHING",
        stripePaymentId: paymentIntentId,
        customerEmail: finalEmail,
        dispatchStartedAt: Date.now(),
        updatedAt: Date.now(),
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

  // 4. Record discount code usage metrics if applicable
  if (order.discountCode) {
    try {
      await recordDiscountUsage(order.discountCode, order.discountAmountInCents || 0);
    } catch (discErr) {
      console.warn("[OrderProcessor] Notice recording discount code usage:", discErr);
    }
  }

  // 5. Dispatch to Handwrytten robotic pen fulfillment with deterministic orderId for supplier idempotency
  const fulfillment = await fulfillHandwryttenOrder({
    orderId,
    imageUrl: order.frontImageUrl,
    printedGreeting: order.printedMessage,
    handwrittenMessage: order.handwrittenNote,
    fontId: order.fontStyleId || "1",
    recipient: order.recipientAddress,
    returnAddress: order.returnAddress,
    scheduledSendDate: order.scheduledSendDate,
  });

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
  });

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

  console.log(`[OrderProcessor] Order ${orderId} successfully dispatched! HW ID: ${fulfillment.order_id}`);

  return {
    success: true,
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: fulfillment.order_id,
  };
}
