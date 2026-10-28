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

    const savedState = await firestoreDb.runTransaction(async (transaction: any) => {
      const ref = getOrdersCollection().doc(orderId);
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? snapshot.data() : null;
      if (!current || current.viewToken !== viewToken) throw new Error("ORDER_ACCESS_DENIED");
      if (current.status !== "PENDING_PAYMENT" && !(paidRecovery && current.status === "PAYMENT_RECEIVED" && current.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED")) throw new Error("ORDER_ALREADY_IN_PROGRESS");
      transaction.update(ref, {
        customerEmail: email,
        contactEmailChoice: contactEmailChoice(email),
        contactEmailSyncStatus: "synced",
        contactEmailUpdateId: null,
        contactEmailUpdateStartedAt: null,
        updatedAt: Date.now(),
      });
      return { status: current.status, paymentIntentId: current.stripePaymentId as string | undefined };
    });
    if (paidRecovery && savedState.paymentIntentId) {
      const { processPaidOrder } = await import("@/lib/order-processor");
      await processPaidOrder(orderId, savedState.paymentIntentId, email);
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
