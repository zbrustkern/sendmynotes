import { constantTimeStringEqual } from "@/lib/order-access-credentials";
import { recordAcceptedAccountOrder } from "@/lib/account/order-association";
import { NextRequest, NextResponse } from "next/server";
import {
  firestoreDb,
  getOrdersCollection,
  updateOrderStatus,
  getImageCachePoolCollection,
} from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { logIncident } from "@/lib/incident-logger";
import { validatePersonalSender } from "@/lib/order-processor";
import { sendAddressDeferredEmail } from "@/lib/email-alerts";
import { redeemOfferInTransaction } from "@/lib/offer-engine";
import { Order } from "@/lib/types";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { normalizeCountryCode } from "@/lib/mailing-destinations";
import { isFreeOrderEligible } from "@/lib/order-pricing";
import { effectiveOrderEmail, savePaidOrderReminder } from "@/lib/checkout-contact";
import { submitFreeOrderToSupplier } from "@/lib/free-order-dispatch";

function privateJson(body: unknown, init?: { status: number }) {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  try {
    if (await isOperationalControlPaused("checkout")) {
      return privateJson({ error: "Checkout is temporarily unavailable.", code: "CHECKOUT_PAUSED" }, { status: 503 });
    }
    const body = await req.json();
    const { orderId, customerEmail, viewToken } = body;

    if (!orderId) {
      return privateJson({ error: "Missing order ID" }, { status: 400 });
    }

    // 1. Atomically verify free-order eligibility and claim its dispatch lock.
    let txResult: {
      alreadyProcessed: boolean;
      order: Order;
      status?: string;
      handwryttenOrderId?: string;
    };

    try {
      txResult = await firestoreDb.runTransaction(async (transaction: any) => {
        const orderRef = getOrdersCollection().doc(orderId);
        const orderDoc = await transaction.get(orderRef);

        if (!orderDoc.exists) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const existingOrder = orderDoc.data() as Order;
        if (!existingOrder.viewToken || !constantTimeStringEqual(viewToken, existingOrder.viewToken)) {
          throw new Error("ORDER_NOT_FOUND");
        }
        if (existingOrder.multiSend?.kind === "parent") throw new Error("MULTI_SEND_REQUIRES_PAID_CHECKOUT");
        if ((existingOrder.contactPolicyVersion === 1 || existingOrder.contactEmailChoice) && (!existingOrder.contactEmailChoice || existingOrder.contactEmailSyncStatus !== "synced")) {
          throw new Error("CONTACT_COMMIT_PENDING");
        }

        const country = normalizeCountryCode(existingOrder.recipientAddress?.country) || (existingOrder.recipientAddress?.country ? null : "US");
        if (!isFreeOrderEligible({
          countryCode: country,
          amountInCents: existingOrder.amountInCents,
          finalAmountInCents: existingOrder.finalAmountInCents,
          quoteCountryCode: existingOrder.quote?.countryCode,
          quoteTotalCents: existingOrder.quote?.totalCents,
        })) {
          if (country !== "US") throw new Error("INTERNATIONAL_REQUIRES_PAYMENT");
          throw new Error("REQUIRES_PAYMENT");
        }
        if (existingOrder.amountInCents > 0) {
          throw new Error("REQUIRES_PAYMENT");
        }

        // Supplier-submitted, deferred, and uncertain orders are terminal for
        // this endpoint. In particular, an ambiguous outcome must never be
        // treated as a retryable free checkout.
        const supplierAccepted = existingOrder.fulfillmentStatus === "ADMIN_COMP_SUPPLIER_ACCEPTED";
        if (["PROCESSING_HANDWRYTTEN", "MAILED", "AWAITING_RECIPIENT_ADDRESS", "DISPATCH_UNCERTAIN"].includes(existingOrder.status) || supplierAccepted) {
          return {
            alreadyProcessed: true,
            order: existingOrder,
            status: existingOrder.status,
            handwryttenOrderId: existingOrder.handwryttenOrderId,
          };
        }

        if (existingOrder.status === "DISPATCHING") {
          const dispatchStartedAt = Number(existingOrder.dispatchStartedAt);
          const stale = !Number.isFinite(dispatchStartedAt) || dispatchStartedAt <= 0 || Date.now() - dispatchStartedAt > 5 * 60 * 1000;
          if (stale) {
            const error = "Supplier submission outcome is uncertain; reconcile before retrying.";
            transaction.update(orderRef, { status: "DISPATCH_UNCERTAIN", fulfillmentError: error, updatedAt: Date.now() });
            return { alreadyProcessed: true, order: { ...existingOrder, status: "DISPATCH_UNCERTAIN", fulfillmentError: error }, status: "DISPATCH_UNCERTAIN", handwryttenOrderId: existingOrder.handwryttenOrderId };
          }
          return { alreadyProcessed: true, order: existingOrder, status: existingOrder.status, handwryttenOrderId: existingOrder.handwryttenOrderId };
        }

        const codeToVerify = existingOrder.discountCode;
        if (!codeToVerify) throw new Error("NO_DISCOUNT_CODE");

        const finalEmail = effectiveOrderEmail(existingOrder, customerEmail);
        if ((existingOrder.addressDeferred || existingOrder.address_deferred) && !finalEmail) {
          throw new Error("DEFERRED_ADDRESS_EMAIL_REQUIRED");
        }

        const redemption = await redeemOfferInTransaction(transaction, {
          code: codeToVerify, orderId, quoteId: existingOrder.quoteId,
          discountAmountCents: existingOrder.discountAmountInCents ?? 0, finalAmountCents: 0, isFreePromo: true,
        });
        if (!redemption.redeemed) throw new Error(redemption.error || "This offer is unavailable.");

        // Atomically claim DISPATCHING lock on order
        transaction.update(orderRef, {
          status: "DISPATCHING",
          dispatchStartedAt: Date.now(),
          customerEmail: finalEmail,
          paymentMethod: "PROMO_CODE",
          discountCode: codeToVerify,
          updatedAt: Date.now(),
        });

        return {
          alreadyProcessed: false,
          order: {
            ...existingOrder,
            status: "DISPATCHING",
            customerEmail: finalEmail,
            paymentMethod: "PROMO_CODE",
            discountCode: codeToVerify,
          },
        };
      });
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : String(txErr);
      if (msg === "ORDER_NOT_FOUND") {
        return privateJson({ error: "Order not found" }, { status: 404 });
      }
      if (msg === "INTERNATIONAL_REQUIRES_PAYMENT") {
        return privateJson({ error: "International checkout requires a paid order; free completion cannot bypass its mailing surcharge." }, { status: 400 });
      }
      if (msg === "REQUIRES_PAYMENT") {
        return privateJson(
          { error: "This order requires payment and cannot be completed as free." },
          { status: 400 }
        );
      }
      if (msg === "MULTI_SEND_REQUIRES_PAID_CHECKOUT") {
        return privateJson({ error: "Multi-send requires its verified paid checkout; the free-order shortcut cannot dispatch a batch.", code: "MULTI_SEND_REQUIRES_PAID_CHECKOUT" }, { status: 409 });
      }
      if (msg === "NO_DISCOUNT_CODE" || msg === "INVALID_DISCOUNT_CODE") {
        return privateJson(
          { error: "A valid 100% discount code is required." },
          { status: 400 }
        );
      }
      if (msg === "DEFERRED_ADDRESS_EMAIL_REQUIRED") {
        return privateJson({ error: "An email is required to add the recipient address later." }, { status: 400 });
      }
      if (msg === "CONTACT_COMMIT_PENDING") {
        return privateJson({ error: "Your email preference is still being saved. Please retry in a moment." }, { status: 409 });
      }
      return privateJson({ error: msg }, { status: 400 });
    }

    if (txResult.alreadyProcessed) {
      if (txResult.status === "DISPATCH_UNCERTAIN") {
        return privateJson({ success: false, orderId, alreadyProcessed: true, status: txResult.status, error: "Supplier submission outcome is uncertain. We will not submit it again until it is reconciled." }, { status: 409 });
      }
      return privateJson({
        success: true,
        orderId,
        alreadyProcessed: true,
        status: txResult.status,
        handwryttenOrderId: txResult.handwryttenOrderId,
      });
    }

    const { order } = txResult;
    try { await recordAcceptedAccountOrder(order); } catch { console.warn("[Account] Accepted occurrence projection needs reconciliation."); }
    try { await savePaidOrderReminder(order, effectiveOrderEmail(order, customerEmail)); }
    catch (reminderErr) { console.warn("[Free Order] Notice saving opted-in occasion reminder:", reminderErr instanceof Error ? reminderErr.message : "unknown error"); }


    // 2. Sender validation
    const senderValidation = validatePersonalSender(order.returnAddress);
    if (!senderValidation.valid) {
      const errorMsg =
        senderValidation.error || "Missing or invalid personal sender return address.";
      console.error(`[Free Order] ${errorMsg} for ${orderId}. Halting fulfillment.`);
      await updateOrderStatus(orderId, {
        status: "QUEUED_FOR_FULFILLMENT",
        fulfillmentError: `${errorMsg} Requires operator review.`,
      });

      await logIncident({
        type: "HANDWRYTTEN",
        category: "OPERATOR_ACTION",
        severity: "error",
        summary: `Invalid/Missing Sender Address on Free Order ${orderId}`,
        technicalDetails: `${errorMsg} Dispatch halted to prevent brand-name or blank sender delivery.`,
        metadata: { orderId },
      });

      return privateJson({
        success: true,
        orderId,
        status: "QUEUED_FOR_FULFILLMENT",
        warning: "Order placed, but fulfillment is queued for studio verification of return address.",
      });
    }

    // Address Deferral Bypass: halt automatic Handwrytten dispatch, order is awaiting recipient address from magic link
    if (order.status === "AWAITING_RECIPIENT_ADDRESS" || order.addressDeferred || (order as any).address_deferred) {
      await updateOrderStatus(orderId, {
        status: "AWAITING_RECIPIENT_ADDRESS",
      });
      try {
        const finalTo = effectiveOrderEmail(order, customerEmail);
        if (finalTo) {
          await sendAddressDeferredEmail({
            to: finalTo,
            orderId,
            viewToken: order.viewToken || "",
            recipientName: `${order.recipientAddress?.firstName || ""} ${order.recipientAddress?.lastName || ""}`.trim() || "Recipient",
          });
        }
      } catch (emailErr) {
        console.warn("[Free Order] Error sending address deferred magic link email:", emailErr);
      }

      return privateJson({
        success: true,
        orderId,
        status: "AWAITING_RECIPIENT_ADDRESS",
      });
    }

    // 3. Dispatch to Handwrytten robotic pen fulfillment with deterministic orderId
    console.log(
      `[Free Order] Dispatching Order ${orderId} to Handwrytten...`
    );

    let fulfillment: { success: boolean; order_id?: string; error?: string };

    if (order.isTest) {
      console.log(`[Free Order] Test mode order ${orderId}. Skipping live Handwrytten dispatch.`);
      fulfillment = {
        success: true,
        order_id: `test_free_hw_${orderId}`,
      };
    } else {
      const dispatch = await submitFreeOrderToSupplier(order, {
        isPaused: () => isOperationalControlPaused("fulfillment"),
        fulfill: fulfillHandwryttenOrder,
        updateStatus: updateOrderStatus,
        logIncident,
      });
      if (dispatch.kind === "queued") return privateJson({ success: true, orderId, status: "QUEUED_FOR_FULFILLMENT", warning: "Order accepted and queued while supplier submission is paused." });
      if (dispatch.kind === "uncertain") return privateJson({ success: false, orderId, status: "DISPATCH_UNCERTAIN", error: "Supplier submission outcome is uncertain. We will not submit it again until it is reconciled." }, { status: 409 });
      fulfillment = { success: true, order_id: dispatch.orderId };
    }

    // 4. Update order status to PROCESSING_HANDWRYTTEN
    await updateOrderStatus(orderId, {
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
    });

    // 5. Mark image as CLAIMED in cache pool if matched
    try {
      const cacheSnapshot = await getImageCachePoolCollection()
        .where("imageUrl", "==", order.frontImageUrl)
        .limit(1)
        .get();

      if (!cacheSnapshot.empty) {
        const docId = cacheSnapshot.docs[0].id;
        await getImageCachePoolCollection().doc(docId).update({
          status: "CLAIMED",
        });
      }
    } catch (cacheErr) {
      console.warn("[Free Order] Notice updating cache pool status:", cacheErr);
    }

    return privateJson({
      success: true,
      orderId,
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error completing free order";
    console.error("[Complete Free Order Error]:", msg);
    return privateJson({ error: msg }, { status: 500 });
  }
}
