import {
  getOrderById,
  updateOrderStatus,
  getImageCachePoolCollection,
  recordDiscountUsage,
  resolveIncidentsForOrder,
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
