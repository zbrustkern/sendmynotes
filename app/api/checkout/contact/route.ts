import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { firestoreDb, getOrderById, getOrdersCollection } from "@/lib/firebase-admin";
import { getStripeClient } from "@/lib/stripe";
import { contactEmailChoice, normalizeCheckoutEmail } from "@/lib/checkout-contact";
import { sendDeferredAddressReceiptEmail, sendOrderPenningReceiptEmail } from "@/lib/email/transactional";
import { claimReceiptEmailDelivery, finishReceiptEmailDelivery } from "@/lib/receipt-email-delivery";

/** Commit the sender's email choice before Stripe confirmation using the order view capability. */
export async function POST(req: NextRequest) {
  try {
    const { orderId, viewToken, customerEmail } = await req.json();
    if (typeof orderId !== "string" || typeof viewToken !== "string") {
      return NextResponse.json({ error: "Order access could not be verified." }, { status: 400 });
    }
    const order = await getOrderById(orderId);
    if (!order || !order.viewToken || order.viewToken !== viewToken) {
      return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
    }
    const paidRecovery = order.status === "PAYMENT_RECEIVED" && order.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED" && (
      order.contactEmailSyncStatus === "pending" || (order.contactPolicyVersion === 1 && !order.contactEmailChoice)
    );
    if (order.status !== "PENDING_PAYMENT" && !paidRecovery) {
      return NextResponse.json({ error: "This order can no longer change its contact preference." }, { status: 409 });
    }
    const normalized = normalizeCheckoutEmail(customerEmail);
    if (normalized === null) return NextResponse.json({ error: "Enter a valid email address or leave the field blank." }, { status: 400 });
    const email = normalized || "";
    if ((order.addressDeferred || order.address_deferred) && !email) {
      return NextResponse.json({ error: "An email is required to add the recipient address later." }, { status: 400 });
    }

    // Stripe clears a prior receipt_email when the update parameter is an empty string.
    const stripe = order.stripePaymentId && !order.stripePaymentId.startsWith("pi_mock_") ? getStripeClient() : null;
    const updateId = crypto.randomUUID();
    if (stripe && order.stripePaymentId) {
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentId, {}, { timeout: 15_000 });
      const eligibleStatus = paidRecovery ? pi.status === "succeeded" : ["requires_payment_method", "requires_confirmation"].includes(pi.status);
      if (pi.metadata?.orderId !== orderId || !eligibleStatus) {
        return NextResponse.json({ error: "Payment is already in progress. Your email preference could not be changed." }, { status: 409 });
      }
      if (paidRecovery && pi.receipt_email && pi.receipt_email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Payment was received with a different receipt address. Contact support to reconcile this order." }, { status: 409 });
      }
    }
    // Claim a short update lease and expose a pending marker. Confirmation paths and
    // webhooks fail closed until Stripe and Firestore agree on this preference.
    const savedState = await firestoreDb.runTransaction(async (transaction: any) => {
      const ref = getOrdersCollection().doc(orderId);
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? snapshot.data() : null;
      if (!current || current.viewToken !== viewToken) throw new Error("ORDER_ACCESS_DENIED");
      if (current.status !== "PENDING_PAYMENT" && !(paidRecovery && current.status === "PAYMENT_RECEIVED" && current.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED")) throw new Error("ORDER_ALREADY_IN_PROGRESS");
      // Stripe's per-request deadline below is 15s (with at most two SDK retries).
      // Keep the lease longer than the maximum provider call window to prevent
      // overlapping remote writes from racing after a stale lease is reclaimed.
      if (current.contactEmailUpdateId && Date.now() - (current.contactEmailUpdateStartedAt || 0) < 120_000) throw new Error("CONTACT_UPDATE_IN_PROGRESS");
      transaction.update(ref, {
        customerEmail: email,
        contactEmailChoice: contactEmailChoice(email),
        contactEmailSyncStatus: stripe && !paidRecovery ? "pending" : "synced",
        contactEmailUpdateId: stripe && !paidRecovery ? updateId : null,
        contactEmailUpdateStartedAt: stripe && !paidRecovery ? Date.now() : null,
        updatedAt: Date.now(),
      });
      return { status: current.status, paymentIntentId: current.stripePaymentId as string | undefined };
    });
    let completedState = savedState;
    if (stripe && order.stripePaymentId && !paidRecovery) {
      const updated = await stripe.paymentIntents.update(order.stripePaymentId, { receipt_email: email || "" }, { timeout: 15_000 });
      if ((email && updated.receipt_email?.toLowerCase() !== email) || (!email && updated.receipt_email)) {
        throw new Error("Stripe did not confirm the requested receipt email state.");
      }
      const verified = await stripe.paymentIntents.retrieve(order.stripePaymentId, {}, { timeout: 15_000 });
      if ((email && verified.receipt_email?.toLowerCase() !== email) || (!email && verified.receipt_email)) {
        throw new Error("Stripe receipt email state could not be verified.");
      }
      completedState = await firestoreDb.runTransaction(async (transaction: any) => {
        const ref = getOrdersCollection().doc(orderId);
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : null;
        if (!current || current.contactEmailUpdateId !== updateId || !["PENDING_PAYMENT", "PAYMENT_RECEIVED"].includes(current.status)) throw new Error("CONTACT_UPDATE_STALE");
        transaction.update(ref, { contactEmailSyncStatus: "synced", contactEmailUpdateId: null, contactEmailUpdateStartedAt: null, updatedAt: Date.now() });
        return { status: current.status, paymentIntentId: current.stripePaymentId as string | undefined };
      });
      if (completedState.status === "PAYMENT_RECEIVED" && completedState.paymentIntentId) {
        // A webhook may have safely held a capture while this preference synchronized.
        // Re-enter the idempotent processor so the paid order can resume now.
        const { processPaidOrder } = await import("@/lib/order-processor");
        await processPaidOrder(orderId, completedState.paymentIntentId, email);
        await sendRecoveredReceipt(orderId, email);
      }
    }
    if (paidRecovery && completedState.paymentIntentId) {
      const { processPaidOrder } = await import("@/lib/order-processor");
      await processPaidOrder(orderId, completedState.paymentIntentId, email);
      await sendRecoveredReceipt(orderId, email);
    }
    return NextResponse.json({ success: true, contactEmailChoice: contactEmailChoice(email) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_ACCESS_DENIED") return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
    if (message === "ORDER_ALREADY_IN_PROGRESS") return NextResponse.json({ error: "Payment is already in progress. Your email preference could not be changed." }, { status: 409 });
    if (message === "CONTACT_UPDATE_IN_PROGRESS") return NextResponse.json({ error: "Your email preference is still being saved. Please wait a moment and retry." }, { status: 409 });
    if (message === "CONTACT_UPDATE_STALE") return NextResponse.json({ error: "Payment started while your email preference was being saved. Contact support before retrying." }, { status: 409 });
    console.error("[Checkout Contact] Could not commit contact preference:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "We couldn't save your email preference. Please retry before paying." }, { status: 503 });
  }
}

async function sendRecoveredReceipt(orderId: string, email: string) {
  if (!email) return;
  const refreshed = await claimReceiptEmailDelivery(orderId);
  if (!refreshed) return;
  const deferred = Boolean(refreshed.addressDeferred || refreshed.address_deferred || refreshed.status === "AWAITING_RECIPIENT_ADDRESS");
  try {
    const sent = deferred
      ? await sendDeferredAddressReceiptEmail({ order: refreshed, customerEmail: email })
      : await sendOrderPenningReceiptEmail({ order: refreshed, customerEmail: email });
    if (!sent.success) throw new Error(sent.error || "The receipt email could not be queued.");
    await finishReceiptEmailDelivery(orderId, deferred);
  } catch (error) {
    await finishReceiptEmailDelivery(orderId, deferred, error instanceof Error ? error.message : "unknown error");
    console.error("[Checkout Contact] Recovery receipt delivery failed:", error instanceof Error ? error.message : "unknown error");
  }
}
