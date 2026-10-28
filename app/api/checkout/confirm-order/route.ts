import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { resolvePaymentMode, PaymentMode } from "@/lib/payment-mode";
import { processPaidOrder, verifyPaymentIntentForOrder } from "@/lib/order-processor";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { logIncident } from "@/lib/incident-logger";
import { buildPurchaseMeasurement, persistPurchaseMeasurement, projectPurchaseMeasurementForOrder, validateVerifiedCapture } from "@/lib/purchase-measurement";
import { effectiveOrderEmail } from "@/lib/checkout-contact";
import { claimReceiptEmailDelivery, finishReceiptEmailDelivery } from "@/lib/receipt-email-delivery";
import { sendDeferredAddressReceiptEmail, sendOrderPenningReceiptEmail } from "@/lib/email/transactional";

export async function POST(req: NextRequest) {
  try {
    const { orderId, paymentIntentId, customerEmail, verifyOnly } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing required orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: `Order ${orderId} not found` }, { status: 404 });
    }
    if ((order.contactPolicyVersion === 1 || order.contactEmailChoice) && (!order.contactEmailChoice || order.contactEmailSyncStatus !== "synced")) {
      return NextResponse.json({ success: false, status: "CONTACT_COMMIT_PENDING", error: "Your email preference is still being saved. Please retry before confirming payment." }, { status: 409 });
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

      const paymentCheck = verifyPaymentIntentForOrder({ paymentIntent: pi, orderId, order });
      if (!paymentCheck.valid) {
        await updateOrderStatus(orderId, {
          status: "PAYMENT_VERIFICATION_FAILED",
          fulfillmentError: paymentCheck.reason,
        });
        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: `Captured payment requires reconciliation for order ${orderId}`,
          technicalDetails: paymentCheck.reason || "Payment verification failed.",
          metadata: { orderId, paymentIntentId: pi.id },
        });
        return NextResponse.json(
          { success: false, status: "PAYMENT_VERIFICATION_FAILED", error: paymentCheck.reason || "Captured payment could not be matched to this order." },
          { status: 409 }
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

      const captureError = validateVerifiedCapture(order, {
        paymentIntentId: pi.id,
        amount: pi.amount,
        amountReceived: pi.amount_received,
        currency: pi.currency,
      });
      if (captureError) {
        return NextResponse.json({ success: false, status: "PAYMENT_VERIFICATION_FAILED", error: captureError }, { status: 400 });
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

    purchaseMeasurement = await projectPurchaseMeasurementForOrder(order, purchaseMeasurement);

    if (verifyOnly === true) {
      return NextResponse.json({
        success: true,
        status: "PAYMENT_RECEIVED",
        orderId,
        viewToken: order.viewToken,
        purchaseMeasurement,
      });
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;
    const userAgent = req.headers.get("user-agent") || undefined;
    const resolvedEmail = effectiveOrderEmail(order, customerEmail || customerEmailFromStripe);

    // Process and fulfill the verified paid order (atomic locking handled in order-processor)
    const result = await processPaidOrder(
      orderId,
      verifiedPaymentIntentId,
      resolvedEmail,
      { clientIp, userAgent, isTest, paymentMode }
    );

    if (result.success && resolvedEmail) {
      try {
        const claim = await claimReceiptEmailDelivery(orderId);
        if (claim) {
          const isAddressDeferred = Boolean(
            claim.addressDeferred ||
            (claim as any).address_deferred ||
            claim.status === "AWAITING_RECIPIENT_ADDRESS"
          );
          try {
            if (isAddressDeferred) {
              await sendDeferredAddressReceiptEmail({ order: claim, customerEmail: resolvedEmail });
            } else {
              await sendOrderPenningReceiptEmail({ order: claim, customerEmail: resolvedEmail });
            }
            await finishReceiptEmailDelivery(orderId, isAddressDeferred);
          } catch (sendErr: unknown) {
            const sendMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            await finishReceiptEmailDelivery(orderId, isAddressDeferred, sendMsg);
          }
        }
      } catch (emailErr) {
        console.warn("[Confirm Order] Receipt email dispatch check failed:", emailErr);
      }
    }

    return NextResponse.json({
      success: result.success,
      status: result.status,
      orderId,
      viewToken: order.viewToken,
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
