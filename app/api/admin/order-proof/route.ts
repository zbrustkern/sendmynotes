import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getOrderById } from "@/lib/firebase-admin";
import { fetchHandwryttenOrderStatus } from "@/lib/handwrytten";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let hwLiveStatus: any = null;
    if (order.handwryttenOrderId) {
      try {
        hwLiveStatus = await fetchHandwryttenOrderStatus(order.handwryttenOrderId);
      } catch (err) {
        console.warn("[Order Proof] Notice querying Handwrytten live status:", err);
      }
    }

    return NextResponse.json({
      order,
      handwrytten: hwLiveStatus,
      backplateUrl: "/aster-blanche-backplate.png",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching order proof";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
