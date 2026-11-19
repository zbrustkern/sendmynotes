import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/firebase-admin";
import { constantTimeStringEqual, createOrderReadToken, createOrderReturnTicket } from "@/lib/order-access-credentials";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

/** Exchange only the legacy checkout credential for read-only, order-scoped access. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Order access is unavailable." }, { status: 404, headers: privateHeaders });

    const order = await getOrderById(id);
    const suppliedToken = req.headers.get("x-view-token");
    if (!order || order.id !== id || !order.viewToken ||
        !constantTimeStringEqual(suppliedToken, order.viewToken)) {
      return NextResponse.json({ error: "Order access is unavailable." }, { status: 403, headers: privateHeaders });
    }

    const readToken = createOrderReadToken(id, order.viewToken);
    const returnTicket = createOrderReturnTicket(id, order.viewToken);
    if (!readToken || !returnTicket) {
      return NextResponse.json({ error: "Order access is unavailable." }, { status: 403, headers: privateHeaders });
    }
    return NextResponse.json({ readToken, returnTicket }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Order access is unavailable." }, { status: 500, headers: privateHeaders });
  }
}
