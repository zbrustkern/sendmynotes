import { NextRequest, NextResponse } from "next/server";
import { getOrdersCollection, firestoreDb } from "@/lib/firebase-admin";
import { Order, AdminMetrics, TelemetryEvent } from "@/lib/types";
import { TELEMETRY_COLLECTION } from "@/lib/telemetry";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to admin metrics" }, { status: 401 });
    }

    // 1. Fetch Orders from Firestore
    const ordersSnapshot = await getOrdersCollection().get();
    const orders: Order[] = [];
    ordersSnapshot.forEach((doc) => {
      orders.push(doc.data() as Order);
    });

    // Sort newest first
    orders.sort((a, b) => b.createdAt - a.createdAt);

    // Compute order metrics
    let totalRevenueCents = 0;
    let pendingCount = 0;
    let processingCount = 0;
    let failedCount = 0;

    orders.forEach((order) => {
      if (order.status === "PROCESSING_HANDWRYTTEN" || order.status === "PAYMENT_RECEIVED") {
        totalRevenueCents += order.amountInCents || 900;
        processingCount++;
      } else if (order.status === "PENDING_PAYMENT") {
        pendingCount++;
      } else if (order.status === "FAILED") {
        failedCount++;
      }
    });

    // 2. Fetch Telemetry Funnel Events
    let totalSessions = 0;
    let coverSelected = 0;
    let noteCompleted = 0;
    let addressCompleted = 0;
    let checkoutInitiated = 0;
    let paid = processingCount;

    try {
      const telemetrySnapshot = await firestoreDb.collection(TELEMETRY_COLLECTION).get();
      const sessions = new Set<string>();

      telemetrySnapshot.forEach((doc) => {
        const evt = doc.data() as TelemetryEvent;
        if (evt.sessionId) sessions.add(evt.sessionId);

        switch (evt.eventName) {
          case "cover_preset_selected":
          case "ai_generate_succeeded":
            coverSelected++;
            break;
          case "step_navigated":
            if (evt.step === 2) noteCompleted++;
            if (evt.step === 3) addressCompleted++;
            break;
          case "address_completed":
            addressCompleted++;
            break;
          case "checkout_initiated":
            checkoutInitiated++;
            break;
          case "payment_succeeded":
            paid++;
            break;
        }
      });

      totalSessions = Math.max(sessions.size, orders.length, 1);
    } catch (e) {
      console.warn("[Admin Metrics] Could not aggregate telemetry events:", e);
      totalSessions = Math.max(orders.length, 1);
    }

    const metrics: AdminMetrics = {
      totalRevenueCents,
      totalOrders: orders.length,
      ordersByStatus: {
        pending: pendingCount,
        processing: processingCount,
        failed: failedCount,
      },
      funnel: {
        totalSessions,
        coverSelected: Math.max(coverSelected, orders.length),
        noteCompleted: Math.max(noteCompleted, orders.length),
        addressCompleted: Math.max(addressCompleted, orders.length),
        checkoutInitiated: Math.max(checkoutInitiated, orders.length),
        paid,
      },
      recentOrders: orders.slice(0, 50),
    };

    return NextResponse.json(metrics);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error compiling admin metrics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
