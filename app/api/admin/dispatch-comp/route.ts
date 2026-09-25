import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { saveOrder, updateOrderStatus } from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { Order, MailingAddress } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      frontImageUrl,
      printedMessage,
      handwrittenNote,
      fontStyleId = "hwDavid",
      recipientAddress,
      returnAddress,
      scheduledSendDate,
      compReason = "Studio VIP",
    } = body;

    if (!frontImageUrl) {
      return NextResponse.json({ error: "Card cover image is required" }, { status: 400 });
    }
    if (!recipientAddress || !recipientAddress.street1 || !recipientAddress.city || !recipientAddress.state || !recipientAddress.zip) {
      return NextResponse.json({ error: "Complete recipient address is required" }, { status: 400 });
    }
    if (!returnAddress || !returnAddress.street1 || !returnAddress.city || !returnAddress.state || !returnAddress.zip) {
      return NextResponse.json({ error: "Complete return address is required" }, { status: 400 });
    }

    const orderId = `order_comp_${crypto.randomBytes(12).toString("hex")}`;
    const viewToken = `tok_${crypto.randomBytes(12).toString("hex")}`;

    const orderRecord: Order = {
      id: orderId,
      customerEmail: "studio@asterandblanche.com",
      frontImageUrl,
      printedMessage: printedMessage || "",
      handwrittenNote: handwrittenNote || "",
      fontStyleId,
      recipientAddress: recipientAddress as MailingAddress,
      returnAddress: returnAddress as MailingAddress,
      ...(scheduledSendDate ? { scheduledSendDate } : {}),
      status: "PAYMENT_RECEIVED",
      amountInCents: 0,
      originalAmountInCents: 900,
      paymentMethod: "STUDIO_COMP",
      viewToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);

    console.log(`[Studio Comp] Dispatching comp order ${orderId} (${compReason}) to Handwrytten...`);

    const fulfillment = await fulfillHandwryttenOrder({
      imageUrl: frontImageUrl,
      printedGreeting: printedMessage || "",
      handwrittenMessage: handwrittenNote || "",
      fontId: fontStyleId,
      recipient: recipientAddress,
      returnAddress,
      scheduledSendDate,
    });

    if (!fulfillment.success) {
      await updateOrderStatus(orderId, {
        status: "QUEUED_FOR_FULFILLMENT",
        fulfillmentError: fulfillment.error || "Fulfillment queued",
      });
      return NextResponse.json({
        success: true,
        orderId,
        status: "QUEUED_FOR_FULFILLMENT",
        warning: fulfillment.error,
      });
    }

    await updateOrderStatus(orderId, {
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
    });

    return NextResponse.json({
      success: true,
      orderId,
      handwryttenOrderId: fulfillment.order_id,
      status: "PROCESSING_HANDWRYTTEN",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error dispatching comp card";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
