import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
import { resolvePaymentMode, PaymentMode } from "@/lib/payment-mode";
import { processPaidOrder, verifyPaymentIntentForOrder } from "@/lib/order-processor";
import { recordPaymentCaptureFact, deriveCommercialKind } from "@/lib/financial-ledger";
import { getOrderById, updateOrderStatus } from "@/lib/firebase-admin";
import { logIncident } from "@/lib/incident-logger";
import { verifyCheckoutQuoteIntegrity, redeemOfferForOrder } from "@/lib/offer-engine";
import { buildPurchaseMeasurement, persistPurchaseMeasurement, projectPurchaseMeasurementForOrder, validateVerifiedCapture } from "@/lib/purchase-measurement";

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
    let serverVerifiedPaymentIntent: any;

    if (!isMockDevMode) {
      // Synchronously verify PaymentIntent directly via Stripe API (Fail Closed)
      let pi;
      try {
        const stripe = getStripeClient();
        pi = await stripe.paymentIntents.retrieve(verifiedPaymentIntentId);
        serverVerifiedPaymentIntent = pi;
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
      if (pi.status === "succeeded") await recordPaymentCaptureFact({
        paymentIntentId: pi.id,
        amountCents: pi.amount_received ?? pi.amount ?? 0,
        currency: pi.currency || "usd",
        livemode: Boolean(pi.livemode),
        orderId: paymentCheck.valid ? orderId : undefined,
        commercialKind: paymentCheck.valid
          ? deriveCommercialKind({ amountCents: pi.amount_received ?? pi.amount ?? 0, livemode: Boolean(pi.livemode), isFounderTest: order.isFounderTest, isComp: order.isComp, paymentMethod: order.paymentMethod, explicitKind: (order.discountAmountInCents || 0) > 0 ? "discounted_paid" : undefined })
          : (pi.livemode ? "unresolved_historical" : "founder_test"),
        operationId: order.operationId || pi.metadata?.operationId,
        // Synchronous verification observes success now; intent creation is not capture time.
      });
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
          { success: false, error: "Captured payment could not be matched to this order; fulfillment was not dispatched." },
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

      // Assert amount matches expected order total
      const expectedAmountCents =
        typeof order.finalAmountInCents === "number" && order.finalAmountInCents >= 0
          ? order.finalAmountInCents
          : typeof order.amountInCents === "number" && order.amountInCents >= 0
          ? order.amountInCents
          : CARD_FLAT_RATE_CENTS;

      // Verify quote integrity and price matching
      const integrityCheck = await verifyCheckoutQuoteIntegrity({
        quoteId: (order as unknown as Record<string, unknown>).quoteId as string | undefined,
        code: order.discountCode,
        expectedFinalCents: expectedAmountCents,
        paymentIntentAmountCents: pi.amount,
        surchargeCents: order.quote?.internationalSurchargeCents || 0,
      });

      if (!integrityCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            error: integrityCheck.reason || "Price changed or quote expired. Please reconfirm total before paying.",
            requiresPriceReconfirmation: true,
          },
          { status: 409 }
        );
      }

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
      const expectedAmountCents =
        typeof order.finalAmountInCents === "number" && order.finalAmountInCents >= 0
          ? order.finalAmountInCents
          : typeof order.amountInCents === "number" && order.amountInCents >= 0
          ? order.amountInCents
          : CARD_FLAT_RATE_CENTS;

      const integrityCheck = await verifyCheckoutQuoteIntegrity({
        quoteId: (order as unknown as Record<string, unknown>).quoteId as string | undefined,
        code: order.discountCode,
        expectedFinalCents: expectedAmountCents,
        paymentIntentAmountCents: expectedAmountCents,
        surchargeCents: order.quote?.internationalSurchargeCents || 0,
      });

      if (!integrityCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            error: integrityCheck.reason || "Price changed or quote expired. Please reconfirm total before paying.",
            requiresPriceReconfirmation: true,
          },
          { status: 409 }
        );
      }
    }

    purchaseMeasurement = await projectPurchaseMeasurementForOrder(order, purchaseMeasurement);

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
      { clientIp, userAgent, isTest, paymentMode, verifiedPaymentIntent: serverVerifiedPaymentIntent }
    );

    let offerRedemption: { status: "not_applicable" | "redeemed" | "reconciliation_required"; error?: string } = { status: "not_applicable" };
    if (result.success && order.discountCode) {
      const redemption = await redeemOfferForOrder({
        code: order.discountCode,
        orderId,
        quoteId: (order as unknown as Record<string, unknown>).quoteId as string | undefined,
        discountAmountCents: order.discountAmountInCents || 0,
        finalAmountCents:
          typeof order.finalAmountInCents === "number"
            ? order.finalAmountInCents
            : order.amountInCents ?? CARD_FLAT_RATE_CENTS,
        destinationSurchargeCents: order.quote?.internationalSurchargeCents || 0,
        verifiedCaptureId: verifiedPaymentIntentId,
        requireAuthoritativeBinding: true,
      });
      offerRedemption = redemption.redeemed
        ? { status: "redeemed" }
        : { status: "reconciliation_required", error: redemption.error || "Offer redemption could not be confirmed." };
      if (!redemption.redeemed) {
        await logIncident({
          type: "STRIPE",
          severity: "error",
          summary: `Paid order offer redemption requires reconciliation (${orderId})`,
          technicalDetails: redemption.error || "Promotion redemption failed after verified payment.",
          metadata: { orderId, paymentIntentId: verifiedPaymentIntentId },
        });
      }
    }

    return NextResponse.json({
      success: result.success,
      status: result.status,
      orderId,
      handwryttenOrderId: result.handwryttenOrderId,
      error: result.error,
      alreadyProcessed: result.alreadyProcessed,
      offerRedemption,
      purchaseMeasurement,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error confirming order";
    console.error("[Confirm Order Exception]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
