import { NextRequest, NextResponse } from "next/server";
import {
  getOrderById,
  updateOrderStatus,
  getDiscountCode,
  recordDiscountUsage,
  getImageCachePoolCollection,
} from "@/lib/firebase-admin";
import { validateDiscount } from "@/lib/discount";
import { CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { logIncident } from "@/lib/incident-logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, discountCode, customerEmail } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.amountInCents > 0) {
      return NextResponse.json({ error: "This order requires payment and cannot be completed as free." }, { status: 400 });
    }

    // Verify discount code
    const codeToVerify = discountCode || order.discountCode;
    if (!codeToVerify) {
      return NextResponse.json({ error: "No discount code associated with this free order." }, { status: 400 });
    }

    const discountDoc = await getDiscountCode(codeToVerify);
    const validation = validateDiscount(discountDoc, CARD_FLAT_RATE_CENTS);

    if (!validation.valid || validation.finalAmountInCents !== 0) {
      return NextResponse.json(
        { error: validation.error || "The discount code is no longer eligible for 100% free checkout." },
        { status: 400 }
      );
    }

    // Update email if provided
    const finalEmail = customerEmail || order.customerEmail || "";

    // 1. Transition Order to PAYMENT_RECEIVED via promo code
    await updateOrderStatus(orderId, {
      status: "PAYMENT_RECEIVED",
      customerEmail: finalEmail,
      paymentMethod: "PROMO_CODE",
    });

    // 2. Increment discount code usage
    await recordDiscountUsage(codeToVerify, CARD_FLAT_RATE_CENTS);

    // 3. Dispatch to Handwrytten robotic pen fulfillment
    console.log(`[Free Order] Disagreeing payment needed for ${orderId} (Promo: ${codeToVerify}). Dispatching to Handwrytten...`);
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
      console.error(`[Free Order] Handwrytten dispatch failed for ${orderId}:`, fulfillment.error);
      await updateOrderStatus(orderId, {
        status: "QUEUED_FOR_FULFILLMENT",
        fulfillmentError: fulfillment.error || "Awaiting studio fulfillment queue",
      });

      await logIncident({
        type: "HANDWRYTTEN",
        severity: "error",
        summary: `Handwrytten robotic pen dispatch failed for Free Order ${orderId}`,
        technicalDetails: fulfillment.error || "Handwrytten singleStepOrder API error",
        metadata: { orderId, discountCode: codeToVerify },
      });

      return NextResponse.json({
        success: true,
        orderId,
        status: "QUEUED_FOR_FULFILLMENT",
        warning: "Order placed, but fulfillment is queued for studio verification.",
      });
    }

    // 4. Update order status to PROCESSING_HANDWRYTTEN
    await updateOrderStatus(orderId, {
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
    });

    // 5. Mark image as CLAIMED in cache pool if matched
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
      console.warn("[Free Order] Notice updating cache pool status:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      orderId,
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error completing free order";
    console.error("[Complete Free Order Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
