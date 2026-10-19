import { NextRequest, NextResponse } from "next/server";
import {
  getOrderById,
  updateOrderStatus,
  getSystemIncidentsCollection,
  resolveIncidentsForOrder,
} from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { isOperationalControlPaused } from "@/lib/operational-controls";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { MailingAddress } from "@/lib/types";
import { evaluateFulfillmentRetryGate } from "@/lib/investigation-service";

export async function POST(req: NextRequest) {
  try {
    // 1. Authorization Gate (SPRINT-0007-T05, AC03)
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to fulfillment retry" },
        { status: 401 }
      );
    }

    if (await isOperationalControlPaused("fulfillment")) {
      return NextResponse.json({ error: "Supplier submission is paused. The order remains queued for later inspection.", code: "FULFILLMENT_PAUSED" }, { status: 423 });
    }

    const body = await req.json();
    const {
      orderId,
      updatedRecipientAddress,
      incidentId,
      confirmBillableDispatch,
      idempotencyKey,
    } = body;

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. If operator provided an updated or corrected address, apply it before gating
    let recipientToUse = order.recipientAddress;
    if (updatedRecipientAddress && typeof updatedRecipientAddress === "object") {
      const addressUpdate: MailingAddress = {
        firstName: String(updatedRecipientAddress.firstName || "").trim(),
        lastName: String(updatedRecipientAddress.lastName || "").trim(),
        street1: String(updatedRecipientAddress.street1 || "").trim(),
        street2: String(updatedRecipientAddress.street2 || "").trim(),
        city: String(updatedRecipientAddress.city || "").trim(),
        state: String(updatedRecipientAddress.state || "").trim().toUpperCase(),
        zip: String(updatedRecipientAddress.zip || "").trim(),
      };
      await updateOrderStatus(orderId, {
        recipientAddress: addressUpdate,
        addressDeferred: false,
        address_deferred: false,
      });
      recipientToUse = addressUpdate;
    }

    // 3. Pre-Retry Safety Gate Evaluation (SPRINT-0007-T03, AC03)
    const gate = await evaluateFulfillmentRetryGate(orderId);
    if (!gate.allowed) {
      console.warn(
        `[Admin Retry Blocked] Gate rejected retry for order ${orderId}: ${gate.reason} - ${gate.message}`
      );
      return NextResponse.json(
        {
          success: false,
          error: gate.message,
          reason: gate.reason,
          requiresReadSyncFirst: gate.requiresReadSyncFirst,
          safeToRetry: false,
          orderStatus: gate.orderStatus,
          suggestedAction: gate.suggestedAction,
        },
        { status: 409 }
      );
    }

    // 4. Require explicit billable confirmation (AC03)
    if (confirmBillableDispatch !== true) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Billable dispatch confirmation required before submitting to supplier. Operator must explicitly confirm billable physical card creation.",
          reason: "missing_confirmation",
          requiresReadSyncFirst: false,
          safeToRetry: true,
          suggestedAction: "retry_fulfillment",
        },
        { status: 409 }
      );
    }

    // Lock order into DISPATCHING to prevent concurrent submission races
    await updateOrderStatus(orderId, {
      status: "DISPATCHING",
      dispatchStartedAt: Date.now(),
    });

    console.log(
      `[Admin] Pre-check passed. Retrying Handwrytten fulfillment for order: ${orderId} (idempotency: ${
        idempotencyKey || "none"
      })...`
    );

    const fulfillment = await fulfillHandwryttenOrder({
      imageUrl: order.frontImageUrl,
      printedGreeting: order.printedMessage,
      handwrittenMessage: order.handwrittenNote,
      fontId: order.fontStyleId || "1",
      recipient: recipientToUse,
      returnAddress: order.returnAddress,
      scheduledSendDate: order.scheduledSendDate,
    });

    if (!fulfillment.success) {
      console.error(`[Admin] Retry fulfillment failed for ${orderId}:`, fulfillment.error);
      await updateOrderStatus(orderId, {
        status: "QUEUED_FOR_FULFILLMENT",
        fulfillmentError: fulfillment.error || "Retry fulfillment failed",
      });
      return NextResponse.json(
        {
          success: false,
          error: fulfillment.error,
        },
        { status: 400 }
      );
    }

    await updateOrderStatus(orderId, {
      status: "PROCESSING_HANDWRYTTEN",
      handwryttenOrderId: fulfillment.order_id,
      fulfillmentError: "",
    });

    // Auto-resolve any associated incidents
    try {
      if (incidentId) {
        await getSystemIncidentsCollection().doc(incidentId).update({
          resolved: true,
          resolvedAt: Date.now(),
          resolutionNote: `Resolved via admin retry (HW ID: ${fulfillment.order_id})`,
        });
      }
      await resolveIncidentsForOrder(
        orderId,
        `Resolved via admin fulfillment retry (HW ID: ${fulfillment.order_id})`
      );
    } catch (incErr) {
      console.warn("[Admin] Notice resolving incident during retry:", incErr);
    }

    console.log(`[Admin] Order ${orderId} successfully fulfilled! HW ID: ${fulfillment.order_id}`);
    return NextResponse.json({
      success: true,
      handwryttenOrderId: fulfillment.order_id,
      status: "PROCESSING_HANDWRYTTEN",
      fulfillmentStateLabel: "Submitted to Supplier",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing retry";
    console.error("[Admin Retry Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
