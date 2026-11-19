import { stripPrivateRetention } from "@/lib/post-purchase/privacy";
import { stripPrivateOrderMedia } from "@/lib/upload/order-master";
import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { canReadAccountOrder } from "@/lib/account/history";
import { requireAccountActor } from "@/lib/account/http";
import { listMultiSendDeliveries } from "@/lib/multi-send/orders";
import { projectMultiSendView } from "@/lib/multi-send/presentation";
import { projectPurchaseMeasurementForOrder } from "@/lib/purchase-measurement";
import type { MailingAddress, Order } from "@/lib/types";
import {
  constantTimeStringEqual,
  createOrderReadToken,
  verifyOrderReadToken,
  verifyOrderReturnTicket,
} from "@/lib/order-access-credentials";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function projectAddress(address?: Partial<MailingAddress> | null): Partial<MailingAddress> | undefined {
  if (!address) return undefined;
  const result: Partial<MailingAddress> = {};
  for (const key of ["firstName", "lastName", "street1", "street2", "city", "state", "zip", "country"] as const) {
    const value = address[key];
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function projectReadOnlyMultiSendView(view: ReturnType<typeof projectMultiSendView>) {
  if (!view) return undefined;
  return {
    quantity: view.quantity,
    redacted: view.redacted,
    deliveries: view.deliveries.map((delivery) => ({
      id: delivery.id,
      name: delivery.name,
      address: projectAddress(delivery.address),
      greeting: delivery.greeting,
      message: delivery.message,
      status: delivery.status,
      needsSupport: delivery.needsSupport,
    })),
  };
}

/** Customer-readable fields only. Keep this projection independent of the stored Order shape. */
function projectReadOnlyOrder(order: Order, deliveries: Awaited<ReturnType<typeof listMultiSendDeliveries>>) {
  const readToken = order.viewToken ? createOrderReadToken(order.id, order.viewToken) : null;
  return {
    readToken,
    accessKind: "read",
    order: {
      id: order.id,
      status: order.status,
      origin: order.origin,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      frontImageUrl: order.frontImageUrl,
      printedMessage: order.printedMessage,
      handwrittenNote: order.handwrittenNote,
      fontStyleId: order.fontStyleId,
      recipientAddress: projectAddress(order.recipientAddress),
      returnAddress: projectAddress(order.returnAddress),
      customerEmail: order.customerEmail,
      contactEmailChoice: order.contactEmailChoice,
      receiptEmailSentAt: order.receiptEmailSentAt,
      fulfillmentStatus: order.fulfillmentStatus,
      addressDeferred: order.addressDeferred,
      address_deferred: order.address_deferred,
      handwryttenOrderId: order.handwryttenOrderId,
      handwryttenTrackingNumber: order.handwryttenTrackingNumber,
      handwryttenTrackingUrl: order.handwryttenTrackingUrl,
      handwryttenMailedDate: order.handwryttenMailedDate,
      scheduledSendDate: order.scheduledSendDate,
      amountInCents: order.amountInCents,
      finalAmountInCents: order.finalAmountInCents,
      totalCents: order.quote?.totalCents,
      destinationCountryCode: order.quote?.countryCode || order.recipientAddress?.country,
      isInternationalPreview: order.isInternationalPreview,
      occasion: order.occasion,
      isRedacted: false as const,
      multiSendView: projectReadOnlyMultiSendView(
        projectMultiSendView(order, deliveries, true),
      ),
    },
  };
}

function publicOrder(order: Order, id: string) {
  return {
    order: {
      id,
      status: order.status,
      origin: order.origin,
      isRedacted: true,
      multiSendView: projectMultiSendView(order, [], false),
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing order ID" }, { status: 400, headers: privateHeaders });

    const order = await getOrderById(id);
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404, headers: privateHeaders });

    // A scoped credential is authoritative for this request, including when an
    // admin cookie or legacy checkout token is also present.
    const suppliedReadToken = req.headers.get("x-order-read-token");
    const suppliedReturnTicket = req.headers.get("x-order-return-ticket");
    if (suppliedReadToken !== null || suppliedReturnTicket !== null) {
      const authorized = suppliedReadToken !== null
        ? verifyOrderReadToken(id, order.viewToken || "", suppliedReadToken)
        : verifyOrderReturnTicket(id, order.viewToken || "", suppliedReturnTicket);
      if (authorized && order.id === id && order.viewToken) {
        const deliveries = order.multiSend ? await listMultiSendDeliveries(order.id) : [];
        return NextResponse.json(projectReadOnlyOrder(order, deliveries), { headers: privateHeaders });
      }
      return NextResponse.json(publicOrder(order, id), { headers: privateHeaders });
    }

    // Full checkout links remain compatible with existing receipts. The
    // raw checkout credential is accepted as authority but is never echoed.
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ||
      url.searchParams.get("viewToken") ||
      req.headers.get("x-view-token");

    const validCheckoutToken = Boolean(order.viewToken && constantTimeStringEqual(token, order.viewToken));
    const isAdmin = verifyAdminAuth(req);
    if (!validCheckoutToken && !isAdmin && req.headers.get("authorization")) {
      try {
        const actor = await requireAccountActor(req);
        if (canReadAccountOrder(order, actor)) {
          const deliveries = order.multiSend ? await listMultiSendDeliveries(order.id) : [];
          return NextResponse.json({ ...projectReadOnlyOrder(order, deliveries), accessKind: "owner" }, { headers: privateHeaders });
        }
      } catch { /* A failed account proof never grants access. */ }
    }
    if (validCheckoutToken || isAdmin) {
      const purchaseMeasurement = await projectPurchaseMeasurementForOrder(order, order.purchaseMeasurement);
      const orderForResponse = stripPrivateRetention(stripPrivateOrderMedia(order)) as Order & { viewToken?: string };
      delete orderForResponse.viewToken;
      return NextResponse.json({
        accessKind: validCheckoutToken ? "checkout" : "admin",
        order: {
          ...orderForResponse,
          multiSend: undefined,
          multiSendView: projectMultiSendView(order, order.multiSend ? await listMultiSendDeliveries(order.id) : [], true),
          purchaseMeasurement,
          isRedacted: false,
        },
        ...(order.viewToken ? { readToken: createOrderReadToken(order.id, order.viewToken) } : {}),
      }, { headers: privateHeaders });
    }

    // This public projection must never inherit fields from a stored order.
    return NextResponse.json(publicOrder(order, id), { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Order details are unavailable." }, { status: 500, headers: privateHeaders });
  }
}

// Older tracker pages may still submit the retired verification form.
export async function POST(_req: NextRequest, _context: { params: Promise<{ id: string }> }) {
  return NextResponse.json(
    { error: "Open your private checkout link or sign in to your card history." },
    { status: 403, headers: privateHeaders },
  );
}
