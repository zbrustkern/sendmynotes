import { NextRequest, NextResponse } from "next/server";
import {
  firestoreDb,
  getSystemIncidentsCollection,
  getSystemConfig,
  setSystemConfig,
} from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { SystemIncident } from "@/lib/types";
import { getAdminSessionEmail, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to incident logs" },
        { status: 401 }
      );
    }

    // 1. Fetch latest 50 system incidents
    const snapshot = await getSystemIncidentsCollection()
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const incidentsById = new Map<string, SystemIncident>();
    snapshot.forEach((doc) => {
      incidentsById.set(doc.id, doc.data() as SystemIncident);
    });
    // Open incidents are queried independently so an old unresolved item cannot be
    // hidden behind the recent-history window.
    const openSnapshot = await getSystemIncidentsCollection().where("resolved", "==", false).get();
    openSnapshot.forEach((doc) => incidentsById.set(doc.id, doc.data() as SystemIncident));
    const incidents = [...incidentsById.values()].sort((a, b) => b.createdAt - a.createdAt);

    // 2. Fetch alert subscription config
    const alertConfig = await getSystemConfig<{ alertEmail?: string; updatedAt?: number }>(
      "alerts"
    );

    return NextResponse.json({
      incidents,
      alertEmail: alertConfig?.alertEmail || "",
      alertConfigUpdatedAt: alertConfig?.updatedAt || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching incidents";
    console.error("[Admin Incidents GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to incident management" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "update_incident") {
      const incidentId = typeof body.incidentId === "string" ? body.incidentId : "";
      const status = body.status;
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      if (!incidentId || !["acknowledged", "investigating", "resolved", "verified"].includes(status) || !reason) {
        return NextResponse.json({ error: "incidentId, a supported status, and reason are required" }, { status: 400 });
      }
      const collection = getSystemIncidentsCollection();
      const reference = collection.doc(incidentId);
      const actor = getAdminSessionEmail(req.cookies.get(ADMIN_COOKIE_NAME)?.value || "") || "admin-session-operator";
      const updatedAt = Date.now();
      const auditId = `incident_audit_${updatedAt}_${Math.random().toString(36).slice(2, 8)}`;
      const auditRef = firestoreDb.collection("operational_incident_audit").doc(auditId);
      const transition = await firestoreDb.runTransaction(async (tx: any) => {
        const before = await tx.get(reference);
        if (!before.exists) return { missing: true };
        const current = before.data() as any;
        const previous = current.lifecycleStatus || (current.resolved ? "resolved" : "open");
        if (status === "verified" && previous !== "resolved") return { invalid: "Only a resolved incident can be verified." };
        if (current.resolved && previous === "verified" && status !== "verified") return { invalid: "Verified incidents are closed and cannot move backward." };
        const resolved = status === "resolved" || status === "verified";
        tx.set(reference, {
          ...current,
          lifecycleStatus: status,
          ...(status === "acknowledged" && !current.acknowledgedAt ? { acknowledgedAt: updatedAt } : {}),
          owner: typeof body.owner === "string" && body.owner.trim() ? body.owner.trim().slice(0, 120) : current.owner,
          resolved,
          ...(resolved ? { resolvedAt: updatedAt, resolutionNote: reason } : {}),
          ...(status === "verified" ? { verifiedAt: updatedAt } : {}),
        });
        tx.set(auditRef, { id: auditId, incidentId, from: previous, to: status, actor, reason, createdAt: updatedAt });
        return { missing: false };
      });
      if (transition.missing) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      if (transition.invalid) return NextResponse.json({ error: transition.invalid }, { status: 409 });
      return NextResponse.json({ success: true, incidentId, status, updatedAt });
    }

    // Action A: Update Alert Subscription Email
    if (action === "save_alert_email") {
      const email = (body.email || "").trim();
      await setSystemConfig("alerts", {
        alertEmail: email,
        updatedAt: Date.now(),
      });
      return NextResponse.json({
        success: true,
        alertEmail: email,
        message: email ? `Alert notifications active for ${email}` : "Alert email cleared",
      });
    }

    // Action B: Test Alert Notification
    if (action === "test_alert_email") {
      const email = (body.email || "").trim();
      if (!email) {
        return NextResponse.json({ error: "No email address provided" }, { status: 400 });
      }
      const { sendIncidentAlertEmail } = await import("@/lib/email-alerts");
      const testIncident: SystemIncident = {
        id: `inc_test_${Date.now()}`,
        type: "SYSTEM",
        severity: "error",
        summary: "Studio Test Alert — Verified System Notification",
        technicalDetails: "This is a simulated high-priority diagnostic alert dispatched from the Aster & Blanche Admin Panel to verify real-time email notifications.",
        resolved: false,
        createdAt: Date.now(),
      };
      const result = await sendIncidentAlertEmail({ incident: testIncident, toEmail: email });
      return NextResponse.json({
        success: result.success,
        message: result.error ? `Alert notice: ${result.error}` : `Test alert dispatched to ${email}`,
      });
    }

    // Action C: Mark Incident as Resolved
    if (action === "resolve_incident") {
      const incidentId = body.incidentId;
      if (!incidentId) {
        return NextResponse.json({ error: "Missing incidentId parameter" }, { status: 400 });
      }
      await getSystemIncidentsCollection().doc(incidentId).update({
        resolved: true,
        resolvedAt: Date.now(),
        resolutionNote: body.resolutionNote ? String(body.resolutionNote) : "Marked resolved by operator",
      });
      return NextResponse.json({ success: true, incidentId });
    }

    // Action D: Resend Deferred Address Email for an Order
    if (action === "resend_deferred_email") {
      const orderId = (body.orderId || "").trim();
      if (!orderId) {
        return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
      }
      const { getOrderById } = await import("@/lib/firebase-admin");
      const order = await getOrderById(orderId);
      if (!order) {
        return NextResponse.json({ error: `Order ${orderId} not found` }, { status: 404 });
      }
      const targetEmail = (body.email || order.customerEmail || "").trim();
      if (!targetEmail) {
        return NextResponse.json({ error: "No customer email found for order" }, { status: 400 });
      }
      const { sendAddressDeferredEmail } = await import("@/lib/email-alerts");
      const result = await sendAddressDeferredEmail({
        to: targetEmail,
        orderId: order.id,
        viewToken: order.viewToken || "",
        recipientName: `${order.recipientAddress?.firstName || ""} ${order.recipientAddress?.lastName || ""}`.trim() || "Recipient",
      });
      return NextResponse.json({
        success: result.success,
        error: result.error,
        message: result.success ? `Deferred address receipt dispatched to ${targetEmail}` : `Failed: ${result.error}`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error managing incidents";
    console.error("[Admin Incidents POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
