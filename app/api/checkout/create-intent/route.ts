import { NextRequest, NextResponse } from "next/server";
import { saveOrder } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { Order, MailingAddress } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      frontImageUrl,
      printedMessage,
      handwrittenNote,
      fontStyleId = "1",
      recipientAddress,
      returnAddress,
      customerEmail = "",
    } = body;

    if (!frontImageUrl) {
      return NextResponse.json({ error: "Card cover image is required." }, { status: 400 });
    }

    if (!recipientAddress || !recipientAddress.street1 || !recipientAddress.city || !recipientAddress.state || !recipientAddress.zip) {
      return NextResponse.json({ error: "Complete recipient address is required." }, { status: 400 });
    }

    if (!returnAddress || !returnAddress.street1 || !returnAddress.city || !returnAddress.state || !returnAddress.zip) {
      return NextResponse.json({ error: "Complete return address is required." }, { status: 400 });
    }

    // Generate unique order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create Stripe PaymentIntent ($6.50 flat rate)
    const paymentIntentResult = await createCardPaymentIntent({
      orderId,
      customerEmail: customerEmail || undefined,
    });

    // Construct and persist draft Order to Firestore
    const orderRecord: Order = {
      id: orderId,
      stripePaymentId: paymentIntentResult.paymentIntentId,
      customerEmail,
      frontImageUrl,
      printedMessage: printedMessage || "",
      handwrittenNote: handwrittenNote || "",
      fontStyleId,
      recipientAddress: recipientAddress as MailingAddress,
      returnAddress: returnAddress as MailingAddress,
      status: "PENDING_PAYMENT",
      amountInCents: CARD_FLAT_RATE_CENTS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);

    return NextResponse.json({
      orderId,
      clientSecret: paymentIntentResult.clientSecret,
      paymentIntentId: paymentIntentResult.paymentIntentId,
      isMock: paymentIntentResult.isMock,
      amountInCents: CARD_FLAT_RATE_CENTS,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error creating checkout intent";
    console.error("[Checkout Intent Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
