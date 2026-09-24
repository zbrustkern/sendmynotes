import { NextRequest, NextResponse } from "next/server";
import { saveOrder } from "@/lib/firebase-admin";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { Order, MailingAddress } from "@/lib/types";
import { logIncident } from "@/lib/incident-logger";

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
      userId,
      scheduledSendDate,
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

    // Create Stripe PaymentIntent ($9.00 flat rate)
    const paymentIntentResult = await createCardPaymentIntent({
      orderId,
      customerEmail: customerEmail || undefined,
    });

    // Construct and persist draft Order to Firestore
    const orderRecord: Order = {
      id: orderId,
      stripePaymentId: paymentIntentResult.paymentIntentId,
      customerEmail,
      userId: userId || undefined,
      frontImageUrl,
      printedMessage: printedMessage || "",
      handwrittenNote: handwrittenNote || "",
      fontStyleId,
      recipientAddress: recipientAddress as MailingAddress,
      returnAddress: returnAddress as MailingAddress,
      scheduledSendDate: scheduledSendDate || undefined,
      status: "PENDING_PAYMENT",
      amountInCents: CARD_FLAT_RATE_CENTS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveOrder(orderRecord);

    const publishableKey =
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      process.env["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"] ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env["stripe-publishable-key"] ||
      null;

    return NextResponse.json({
      orderId,
      clientSecret: paymentIntentResult.clientSecret,
      paymentIntentId: paymentIntentResult.paymentIntentId,
      publishableKey,
      isMock: paymentIntentResult.isMock,
      amountInCents: CARD_FLAT_RATE_CENTS,
    });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Error creating checkout intent";
    console.error("[Checkout Intent Error]", rawMsg);

    // Record incident in admin incident feed with sanitized details
    const incidentId = await logIncident({
      type: "STRIPE",
      severity: "error",
      summary: "Stripe PaymentIntent Initialization Error",
      technicalDetails: rawMsg,
    });

    return NextResponse.json(
      {
        error:
          "We are temporarily experiencing difficulty connecting to our secure payment gateway. Our studio team has been notified. Please try again in a moment.",
        incidentId,
      },
      { status: 500 }
    );
  }
}
