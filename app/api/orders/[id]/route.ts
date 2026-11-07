import { stripPrivateRetention } from "@/lib/post-purchase/privacy";
import { stripPrivateOrderMedia } from "@/lib/upload/order-master";
import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { requireAccountActor } from "@/lib/account/http";
import { listMultiSendDeliveries } from "@/lib/multi-send/orders";
import { projectMultiSendView } from "@/lib/multi-send/presentation";
import { Order } from "@/lib/types";
import { projectPurchaseMeasurementForOrder } from "@/lib/purchase-measurement";

function maskEmail(email?: string): string {
  if (!email || !email.includes("@")) return "Customer";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskZip(zip?: string): string {
  if (!zip) return "";
  return "•••••";
}

function sanitizeOrderForPublicView(order: Order): Order {
  const { adminCompQuoteId: _quoteId, adminCompQuote: _quote, adminCompLifecycle: _lifecycle,
    adminCompPaymentRequestId: _requestId, adminCompPaymentRequestStatus: _requestStatus, ...publicOrder } = order;
  return {
    ...stripPrivateRetention(stripPrivateOrderMedia(publicOrder)),
    multiSend: undefined,
    printedMessage: order.multiSend ? "" : order.printedMessage,
    customerEmail: maskEmail(order.customerEmail),
    recipientAddress: {
      ...order.recipientAddress,
      lastName: order.recipientAddress.lastName ? `${order.recipientAddress.lastName[0]}.` : "",
      street1: "••••••••",
      street2: "",
      zip: maskZip(order.recipientAddress.zip),
    },
    returnAddress: {
      ...order.returnAddress,
      street1: "••••••••",
      street2: "",
      zip: maskZip(order.returnAddress.zip),
    },
    handwrittenNote: "Handwritten card note protected for privacy. Verify billing email or delivery ZIP code to view full note.",
    stripePaymentId: undefined,
    purchaseMeasurement: undefined,
    attribution: undefined,
    viewToken: undefined,
    isRedacted: true,
  };
}

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check authorization:
    // 1. URL search param ?token=... or ?viewToken=...
    // 2. Header x-view-token
    // 3. Admin authorization
    const url = new URL(req.url);
    const token =
      url.searchParams.get("token") ||
      url.searchParams.get("viewToken") ||
      req.headers.get("x-view-token");

    let isAuthorized =
      Boolean(order.viewToken && token && token === order.viewToken) ||
      verifyAdminAuth(req);

    if (!isAuthorized && order.multiSend && req.headers.get('authorization')) {
      try { const actor = await requireAccountActor(req); isAuthorized = Boolean(order.userId && order.userId === actor.uid); } catch { /* A failed account proof never grants access. */ }
    }
    if (isAuthorized) {
      const purchaseMeasurement = await projectPurchaseMeasurementForOrder(order, order.purchaseMeasurement);
      return NextResponse.json({
        order: {
          ...stripPrivateRetention(stripPrivateOrderMedia(order)),
          multiSend: undefined,
          multiSendView: projectMultiSendView(order, order.multiSend ? await listMultiSendDeliveries(order.id) : [], true),
          purchaseMeasurement,
          isRedacted: false,
        },
      }, { headers: privateHeaders });
    }

    // Public / Unauthenticated requester receives PII-sanitized view
    return NextResponse.json({
      order: { ...sanitizeOrderForPublicView(order), multiSendView: projectMultiSendView(order, [], false) },
    }, { headers: privateHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error fetching order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Throttles brute-force attempts on order verification (max 5 failed attempts per 15 min window)
const failedUnlockAttempts = new Map<string, { count: number; resetAt: number }>();

function checkUnlockRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = failedUnlockAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    return true;
  }
  return entry.count < 5;
}

function recordFailedUnlock(key: string) {
  const now = Date.now();
  const entry = failedUnlockAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    failedUnlockAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.count++;
  }
}

function clearFailedUnlock(key: string) {
  failedUnlockAttempts.delete(key);
}

/**
 * Verification endpoint: Allows the customer or recipient to unlock full details
 * by confirming the delivery ZIP code or purchaser email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const rateLimitKey = `${clientIp}_${id}`;

    if (!checkUnlockRateLimit(rateLimitKey)) {
      return NextResponse.json(
        { error: "Too many failed verification attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Email/ZIP knowledge is insufficient to unlock an entire recipient list.
    if (order.multiSend) return NextResponse.json({ error: "Use your secure receipt link or signed-in account to view this order." }, { status: 403 });
    const body = await req.json();
    const { email, zip } = body;

    let isMatch = false;

    if (email && typeof email === "string" && order.customerEmail) {
      if (email.trim().toLowerCase() === order.customerEmail.trim().toLowerCase()) {
        isMatch = true;
      }
    }

    if (zip && typeof zip === "string" && order.recipientAddress?.zip) {
      const cleanInputZip = zip.trim().substring(0, 5);
      const cleanOrderZip = order.recipientAddress.zip.trim().substring(0, 5);
      if (cleanInputZip === cleanOrderZip) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      recordFailedUnlock(rateLimitKey);
      return NextResponse.json(
        { error: "Verification failed. The entered email or ZIP code does not match this order." },
        { status: 401 }
      );
    }

    clearFailedUnlock(rateLimitKey);

    return NextResponse.json({
      success: true,
      verified: true,
      viewToken: order.viewToken,
      order: {
        ...stripPrivateRetention(stripPrivateOrderMedia(order)),
        isRedacted: false,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error verifying order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
