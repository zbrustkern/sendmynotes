import { NextRequest, NextResponse } from "next/server";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { processPaidOrder } from "@/lib/order-processor";
import { US_STATES } from "@/components/v3/Step3EnvelopeAddressing";
import { sendOrderPenningReceiptEmail } from "@/lib/email/transactional";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    const body = await req.json();
    const token = body.token || req.nextUrl.searchParams.get("token") || req.headers.get("x-view-token");

    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify view token
    if (!token || order.viewToken !== token) {
      return NextResponse.json({ error: "Invalid or expired access token" }, { status: 401 });
    }

    const street1 = (body.street1 || "").trim();
    const street2 = (body.street2 || "").trim();
    const city = (body.city || "").trim();
    const state = (body.state || "").trim().toUpperCase();
    const zip = (body.zip || "").trim();

    if (!street1) {
      return NextResponse.json({ error: "Street address is required" }, { status: 400 });
    }
    if (!city) {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }
    if (!state || !US_STATES.some((s) => s.code === state)) {
      return NextResponse.json({ error: "A valid 2-letter US state is required" }, { status: 400 });
    }
    if (!zip || zip.length < 5) {
      return NextResponse.json({ error: "A valid 5-digit US ZIP code is required" }, { status: 400 });
    }

    // Update order with completed recipient address and clear deferred flag
    const updatedRecipient = {
      ...order.recipientAddress,
      street1,
      street2,
      city,
      state,
      zip,
      country: "USA",
    };

    await updateOrderStatus(id, {
      recipientAddress: updatedRecipient,
      addressDeferred: false,
      address_deferred: false,
      status: "QUEUED_FOR_FULFILLMENT",
      fulfillmentStatus: "QUEUED_FOR_FULFILLMENT",
      updatedAt: Date.now(),
    } as any);

    // Immediately trigger Handwrytten fulfillment dispatch
    const dispatchResult = await processPaidOrder(
      id,
      order.stripePaymentId || `pi_deferred_${id}`,
      order.customerEmail,
      {
        isTest: Boolean(order.isTest),
        paymentMode: order.paymentMode || (order.isTest ? "stripe_test" : "live"),
      }
    );

    // Scenario B: Automated confirmation when deferred address is completed
    try {
      const finalEmail = order.customerEmail;
      if (finalEmail) {
        console.log(`[Complete Address] Dispatching Scenario B confirmation email to ${finalEmail}...`);
        await sendOrderPenningReceiptEmail({
          order: {
            ...order,
            recipientAddress: updatedRecipient,
            addressDeferred: false,
            address_deferred: false,
          },
          customerEmail: finalEmail,
        });
        await updateOrderStatus(id, {
          addressCompletedEmailSentAt: Date.now(),
        } as any);
      }
    } catch (emailErr) {
      console.warn("[Complete Address] Notice dispatching penning confirmation email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      orderId: id,
      fulfillmentStatus: dispatchResult.status,
      handwryttenOrderId: dispatchResult.handwryttenOrderId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error completing recipient address";
    console.error("[Complete Address Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
