import {
  getOrderById,
  updateOrderStatus,
  getImageCachePoolCollection,
  recordDiscountUsage,
} from "./firebase-admin";
import { fulfillHandwryttenOrder } from "./handwrytten";
import { logIncident } from "./incident-logger";

export interface ProcessPaidOrderResult {
  success: boolean;
  status: string;
  handwryttenOrderId?: string;
  error?: string;
  alreadyProcessed?: boolean;
}

/**
 * Idempotently processes and fulfills a paid order.
 * Safe to be called multiple times from Stripe webhooks, client confirmation fallbacks, or admin panel syncs.
 */
export async function processPaidOrder(
  orderId: string,
  paymentIntentId: string,
  customerEmail?: string
): Promise<ProcessPaidOrderResult> {
  // 1. Fetch Order from Firestore
  const order = await getOrderById(orderId);
  if (!order) {
    return {
      success: false,
      status: "NOT_FOUND",
      error: `Order ${orderId} not found in database.`,
    };
  }

  // 2. Check Idempotency: If already dispatched to Handwrytten, don't duplicate robotic order
  if (
    order.status === "PROCESSING_HANDWRYTTEN" ||
    order.status === "MAILED"
  ) {
    return {
      success: true,
      status: order.status,
      handwryttenOrderId: order.handwryttenOrderId,
      alreadyProcessed: true,
    };
  }

  const finalEmail = customerEmail || order.customerEmail;

  // 3. Update status to PAYMENT_RECEIVED
  await updateOrderStatus(orderId, {
    status: "PAYMENT_RECEIVED",
    stripePaymentId: paymentIntentId,
    customerEmail: finalEmail,
  });

  // 4. Record discount code usage metrics if applicable
  if (order.discountCode) {
    try {
      await recordDiscountUsage(order.discountCode, order.discountAmountInCents || 0);
    } catch (discErr) {
      console.warn("[OrderProcessor] Notice recording discount code usage:", discErr);
    }
  }

  // 5. Dispatch to Handwrytten robotic pen fulfillment
  const fulfillment = await fulfillHandwryttenOrder({
    imageUrl: order.frontImageUrl,
    printedGreeting: order.printedMessage,
    handwrittenMessage: order.handwrittenNote,
    fontId: order.fontStyleId || "1",
    recipient: order.recipientAddress,
    returnAddress: order.returnAddress,
    scheduledSendDate: order.scheduledSendDate,
  });

  if (!fulfillment.success) {
    console.error(`[OrderProcessor] Handwrytten dispatch queued/failed for Order ${orderId}:`, fulfillment.error);
    await updateOrderStatus(orderId, {
      status: "QUEUED_FOR_FULFILLMENT",
      fulfillmentError: fulfillment.error || "Awaiting studio fulfillment queue",
    });

    await logIncident({
      type: "HANDWRYTTEN",
      severity: "error",
      summary: `Handwrytten robotic pen dispatch failed for Order ${orderId}`,
      technicalDetails: fulfillment.error || "Handwrytten singleStepOrder API error",
      metadata: { orderId, details: fulfillment.details },
    });

    return {
      success: false,
      status: "QUEUED_FOR_FULFILLMENT",
      error: fulfillment.error,
    };
  }

  // 6. Update Firestore Order to PROCESSING_HANDWRYTTEN
  await updateOrderStatus(orderId, {
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: fulfillment.order_id,
    fulfillmentError: undefined,
  });

  // 7. Mark image as CLAIMED in image_cache_pool if matched
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
