import { NextRequest, NextResponse } from "next/server";
import { getOrderById, updateOrderStatus, getSystemIncidentsCollection, resolveIncidentsForOrder } from "@/lib/firebase-admin";
import { fulfillHandwryttenOrder } from "@/lib/handwrytten";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { MailingAddress } from "@/lib/types";
import { normalizeCountryCode } from "@/lib/mailing-destinations";

export async function POST(req: NextRequest) {
  try {
    if (process.env.STAGING_REVIEW_ONLY === "true") {
      return NextResponse.json({ error: "Supplier fulfillment is disabled during staging review.", code: "STAGING_REVIEW_ONLY" }, { status: 423 });
    }
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to fulfillment retry" }, { status: 401 });
    }

    const { orderId, updatedRecipientAddress, incidentId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.isInternationalPreview) {
      return NextResponse.json({ error: "International preview orders are held from supplier fulfillment." }, { status: 423 });
    }

    let recipientToUse = order.recipientAddress;

    // If operator provided an updated or corrected address
    if (updatedRecipientAddress && typeof updatedRecipientAddress === "object") {
      const existingCountry = normalizeCountryCode(order.quote?.countryCode || order.recipientAddress?.country) || (order.recipientAddress?.country ? null : "US");
      const submittedCountry = typeof updatedRecipientAddress.country === "string" ? normalizeCountryCode(updatedRecipientAddress.country) : existingCountry;
      if (!existingCountry || submittedCountry !== existingCountry) {
        return NextResponse.json({ error: "Changing a paid order's destination requires a supported repricing flow." }, { status: 409 });
      }
      const addressUpdate: MailingAddress = {
        firstName: String(updatedRecipientAddress.firstName || "").trim(),
        lastName: String(updatedRecipientAddress.lastName || "").trim(),
        street1: String(updatedRecipientAddress.street1 || "").trim(),
        street2: String(updatedRecipientAddress.street2 || "").trim(),
        city: String(updatedRecipientAddress.city || "").trim(),
        state: existingCountry === "US" || existingCountry === "CA" ? String(updatedRecipientAddress.state || "").trim().toUpperCase() : String(updatedRecipientAddress.state || "").trim(),
        zip: String(updatedRecipientAddress.zip || "").trim(),
        country: existingCountry,
      };
      await updateOrderStatus(orderId, { recipientAddress: addressUpdate });
      recipientToUse = addressUpdate;
    }

    console.log(`[Admin] Retrying Handwrytten fulfillment for order: ${orderId}...`);

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
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing retry";
    console.error("[Admin Retry Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
