import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, getStripeSecretKey, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { processPaidOrder } from "@/lib/order-processor";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { logIncident } from "@/lib/incident-logger";

export async function POST(req: NextRequest) {
  try {
    const { orderId, paymentIntentId, customerEmail } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing required orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: `Order ${orderId} not found` }, { status: 404 });
    }

    // Idempotency: If order is already completed, processing, or actively dispatching, return immediately
    if (
      order.status === "DISPATCHING" ||
      order.status === "PROCESSING_HANDWRYTTEN" ||
      order.status === "MAILED"
    ) {
      return NextResponse.json({
        success: true,
        status: order.status,
        orderId,
        handwryttenOrderId: order.handwryttenOrderId,
        alreadyProcessed: true,
      });
    }

    const verifiedPaymentIntentId = paymentIntentId || order.stripePaymentId;
    const secret = getStripeSecretKey();
    const isMockDevMode =
      (!secret || secret.startsWith("sk_test_placeholder")) &&
      process.env.NODE_ENV !== "production";

    // Strict Fail-Closed Check: In production, missing or placeholder secrets are a hard failure
    if (!secret || secret.startsWith("sk_test_placeholder")) {
      if (process.env.NODE_ENV === "production") {
        console.error("[Confirm Order Critical] Stripe secret key missing or placeholder in production.");
        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: "Stripe Secret Key Missing in Production",
          technicalDetails: "Payment confirmation rejected because STRIPE_SECRET_KEY is unconfigured in production.",
        });
        return NextResponse.json(
          { success: false, error: "Payment verification system is not configured." },
          { status: 500 }
        );
      }
    }

    if (!verifiedPaymentIntentId) {
      await updateOrderStatus(orderId, {
        status: "PAYMENT_VERIFICATION_FAILED",
        fulfillmentError: "Missing PaymentIntent identifier for verification.",
      });
      return NextResponse.json(
        { success: false, error: "Missing paymentIntentId. Payment verification failed." },
        { status: 400 }
      );
    }

    let customerEmailFromStripe: string | undefined;

    if (!isMockDevMode) {
      // Synchronously verify PaymentIntent directly via Stripe API (Fail Closed)
      let pi;
      try {
        const stripe = getStripeClient();
        pi = await stripe.paymentIntents.retrieve(verifiedPaymentIntentId);
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe API retrieval error";
        console.error(`[Confirm Order] Failed to retrieve PaymentIntent ${verifiedPaymentIntentId}:`, msg);

        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: `Stripe PaymentIntent verification error: ${msg}`,
        });

        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: `PaymentIntent Retrieval Failed for Order ${orderId}`,
          technicalDetails: msg,
          metadata: { orderId, paymentIntentId: verifiedPaymentIntentId },
        });

        return NextResponse.json(
          {
            success: false,
            status: "PAYMENT_VERIFICATION_FAILED",
            error: `Unable to verify payment with processor: ${msg}`,
          },
          { status: 400 }
        );
      }

      // Assert status === 'succeeded'
      if (pi.status !== "succeeded") {
        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: `Payment status is ${pi.status}, expected succeeded`,
        });
        return NextResponse.json(
          {
            success: false,
            status: "PAYMENT_NOT_SUCCEEDED",
            error: `Payment has not succeeded (current status: ${pi.status}).`,
          },
          { status: 400 }
        );
      }

      // Assert currency === 'usd'
      if (pi.currency?.toLowerCase() !== "usd") {
        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: `Currency mismatch: expected usd, got ${pi.currency}`,
        });
        return NextResponse.json(
          { success: false, error: `Invalid currency: expected usd, got ${pi.currency}` },
          { status: 400 }
        );
      }

      // Assert amount matches expected order total
      const expectedAmountCents =
        typeof order.amountInCents === "number" && order.amountInCents > 0
          ? order.amountInCents
          : CARD_FLAT_RATE_CENTS;

      if (pi.amount !== expectedAmountCents) {
        const errorMsg = `Payment amount mismatch: expected ${expectedAmountCents}¢ ($${(
          expectedAmountCents / 100
        ).toFixed(2)}), got ${pi.amount}¢ ($${(pi.amount / 100).toFixed(2)})`;
        console.error(`[Confirm Order Alert] ${errorMsg} for order ${orderId}`);

        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: errorMsg,
        });

        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: `Payment Amount Mismatch for Order ${orderId}`,
          technicalDetails: errorMsg,
          metadata: { orderId, expected: expectedAmountCents, received: pi.amount },
        });

        return NextResponse.json(
          { success: false, error: "Payment amount does not match expected order total." },
          { status: 400 }
        );
      }

      // Assert metadata orderId matches if present
      if (pi.metadata?.orderId && pi.metadata.orderId !== orderId) {
        const mismatchError = `PaymentIntent orderId mismatch: intent metadata has '${pi.metadata.orderId}', expected '${orderId}'`;
        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: mismatchError,
        });
        return NextResponse.json(
          { success: false, error: "PaymentIntent metadata orderId mismatch." },
          { status: 400 }
        );
      }

      // In production environment, assert livemode === true
      if (process.env.NODE_ENV === "production" && !pi.livemode) {
        const testModeError = "Test-mode payment intent used in production environment.";
        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: testModeError,
        });
        return NextResponse.json(
          { success: false, error: testModeError },
          { status: 400 }
        );
      }

      customerEmailFromStripe = pi.receipt_email || undefined;
    } else {
      console.log(`[Confirm Order] Mock mode verification active for order ${orderId}`);
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;

    // Process and fulfill the verified paid order (atomic locking handled in order-processor)
    const result = await processPaidOrder(
      orderId,
      verifiedPaymentIntentId,
      customerEmail || customerEmailFromStripe || order.customerEmail,
      { clientIp, userAgent }
    );

    return NextResponse.json({
      success: result.success,
      status: result.status,
      orderId,
      handwryttenOrderId: result.handwryttenOrderId,
      error: result.error,
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error confirming order";
    console.error("[Confirm Order Exception]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
