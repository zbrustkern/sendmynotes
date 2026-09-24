import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";

function maskEmail(email?: string): string {
  if (!email || !email.includes("@")) return "Customer";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskZip(zip?: string): string {
  if (!zip) return "";
  if (zip.length <= 3) return "•••";
  return `${zip.substring(0, 3)}••`;
}

function sanitizeOrderForPublicView(order: Order): Order {
  return {
    ...order,
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
    viewToken: undefined,
    isRedacted: true,
  };
}

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
    // 1. URL search param ?token=...
    // 2. Header x-view-token
    // 3. Admin authorization
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-view-token");
    const adminKey = req.headers.get("x-admin-key");

    const isAuthorized =
      Boolean(order.viewToken && token && token === order.viewToken) ||
      Boolean(adminKey && adminKey === process.env.ADMIN_SECRET_KEY);

    if (isAuthorized) {
      return NextResponse.json({
        order: {
          ...order,
          isRedacted: false,
        },
      });
    }

    // Public / Unauthenticated requester receives PII-sanitized view
    return NextResponse.json({
      order: sanitizeOrderForPublicView(order),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error fetching order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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

    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

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
      return NextResponse.json(
        { error: "Verification failed. The entered email or ZIP code does not match this order." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: true,
      viewToken: order.viewToken,
      order: {
        ...order,
        isRedacted: false,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error verifying order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
