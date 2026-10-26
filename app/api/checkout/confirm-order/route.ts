import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { resolvePaymentMode, PaymentMode } from "@/lib/payment-mode";
import { processPaidOrder } from "@/lib/order-processor";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { logIncident } from "@/lib/incident-logger";
import { buildPurchaseMeasurement, persistPurchaseMeasurement, validateVerifiedCapture } from "@/lib/purchase-measurement";

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
    let purchaseMeasurement = order.purchaseMeasurement || null;

    const verifiedPaymentIntentId = paymentIntentId || order.stripePaymentId;

    if (!order.stripePaymentId || (paymentIntentId && paymentIntentId !== order.stripePaymentId)) {
      return NextResponse.json({ success: false, status: "PAYMENT_VERIFICATION_FAILED", error: "PaymentIntent is not bound to this order." }, { status: 400 });
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

    let mode: PaymentMode;
    try {
      mode = resolvePaymentMode();
    } catch (modeErr: unknown) {
      const msg = modeErr instanceof Error ? modeErr.message : "Payment mode configuration error";
      console.error("[Confirm Order Critical] Payment mode error:", msg);
      await logIncident({
        type: "STRIPE",
        severity: "error",
        summary: "Payment Verification Misconfiguration",
        technicalDetails: msg,
      });
      return NextResponse.json(
        { success: false, error: "Payment verification system is not configured." },
        { status: 503 }
      );
    }

    const isMockDevMode = mode === "local_mock";
    let isTest = isMockDevMode;
    let paymentMode: PaymentMode = mode;
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
      const expectedAmountCents = order.amountInCents;

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

      const captureError = validateVerifiedCapture(order, {
        paymentIntentId: pi.id,
        amount: pi.amount,
        amountReceived: pi.amount_received,
        currency: pi.currency,
      });
      if (captureError) {
        return NextResponse.json({ success: false, status: "PAYMENT_VERIFICATION_FAILED", error: captureError }, { status: 400 });
      }

      // PaymentIntent must be explicitly bound to this order.
      if (pi.metadata?.orderId !== orderId) {
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

      // In production environment without test mode allowed, assert livemode === true
      if (mode !== "stripe_test" && process.env.NODE_ENV === "production" && !pi.livemode) {
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
      isTest = !pi.livemode;
      paymentMode = pi.livemode ? "live" : "stripe_test";

      // Persist a minimal immutable snapshot before the fulfillment idempotency path can return early.
      try {
        purchaseMeasurement = await persistPurchaseMeasurement(orderId, buildPurchaseMeasurement(order, {
          paymentIntentId: pi.id,
          amount: pi.amount,
          amountReceived: pi.amount_received,
          currency: pi.currency,
          livemode: pi.livemode,
        }));
      } catch {
        console.warn("[Confirm Order] Purchase measurement snapshot write unavailable.");
      }
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
      { clientIp, userAgent, isTest, paymentMode }
    );

    return NextResponse.json({
      success: result.success,
      status: result.status,
      orderId,
      handwryttenOrderId: result.handwryttenOrderId,
      error: result.error,
      alreadyProcessed: result.alreadyProcessed,
      purchaseMeasurement,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error confirming order";
    console.error("[Confirm Order Exception]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
