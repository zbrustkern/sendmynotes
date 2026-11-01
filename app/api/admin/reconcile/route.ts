/**
 * app/api/admin/reconcile/route.ts
 *
 * Authenticated admin endpoint for read-only reconciliation dry-runs,
 * exception queue queries, and safe outbox queue draining (SPRINT-0002-T04).
 *
 * Reference: docs/sprints/SPRINT-0002.md
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { processOutboxQueue } from "@/lib/transactional-outbox";
import { projectAnalyticsOutboxEntry } from "@/lib/analytics-outbox-handler";
import {
  runReconciliationDryRun,
  applyScopedCorrections,
  ReconciliationOptions,
} from "@/lib/reconciliation";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to admin reconciliation" },
        { status: 401 }
      );
    }

    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const limitStr = req.nextUrl.searchParams.get("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const checkTelemetryDrift = req.nextUrl.searchParams.get("checkTelemetryDrift") === "true";

    const options: ReconciliationOptions = {
      cursor,
      limit: isNaN(limit) ? 50 : Math.min(100, Math.max(1, limit)),
      checkTelemetryDrift,
    };

    const result = await runReconciliationDryRun(options);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error executing reconciliation dry-run";
    console.error("[Admin Reconcile Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json(
        { error: "Unauthorized access to admin reconciliation" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "dry_run";

    if (action === "drain_outbox") {
      return NextResponse.json({
        error: "General outbox draining is unavailable. Only the analytics_projection topic has a production handler.",
        availableTopics: ["analytics_projection"],
      }, { status: 501 });
    }

    if (action === "drain_analytics") {
      const result = await processOutboxQueue({
        workerId: `admin-analytics-${Date.now()}`,
        topics: ["analytics_projection"],
        handlers: { analytics_projection: projectAnalyticsOutboxEntry },
        batchSize: Math.min(100, Math.max(1, Number(body.limit) || 25)),
      });
      return NextResponse.json({ success: true, action: "drain_analytics", result });
    }

    if (action === "scoped_correction") {
      if (!body.operatorId || !body.reason || !Array.isArray(body.orderIds)) {
        return NextResponse.json(
          { error: "Missing required fields: operatorId, reason, and orderIds" },
          { status: 400 }
        );
      }

      const correctionResult = await applyScopedCorrections({
        operatorId: getAuthenticatedAdminActor(req)!,
        reason: body.reason,
        orderIds: body.orderIds,
      });

      return NextResponse.json({
        success: true,
        action: "scoped_correction",
        correctionResult,
      });
    }

    // Default: run dry-run with optional body parameters
    const options: ReconciliationOptions = {
      cursor: body.cursor,
      limit: body.limit,
      providerSnapshots: body.providerSnapshots,
      checkTelemetryDrift: body.checkTelemetryDrift,
    };

    const dryRunResult = await runReconciliationDryRun(options);
    return NextResponse.json(dryRunResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error handling reconciliation POST request";
    console.error("[Admin Reconcile POST Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
