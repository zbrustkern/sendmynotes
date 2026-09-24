import { NextRequest, NextResponse } from "next/server";
import {
  getSystemIncidentsCollection,
  getSystemConfig,
  setSystemConfig,
} from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { SystemIncident } from "@/lib/types";

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

    const incidents: SystemIncident[] = [];
    snapshot.forEach((doc) => {
      incidents.push(doc.data() as SystemIncident);
    });

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

    // Action B: Mark Incident as Resolved
    if (action === "resolve_incident") {
      const incidentId = body.incidentId;
      if (!incidentId) {
        return NextResponse.json({ error: "Missing incidentId parameter" }, { status: 400 });
      }
      await getSystemIncidentsCollection().doc(incidentId).update({
        resolved: true,
        resolvedAt: Date.now(),
      });
      return NextResponse.json({ success: true, incidentId });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error managing incidents";
    console.error("[Admin Incidents POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
