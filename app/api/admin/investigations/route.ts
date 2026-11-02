import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { adminEnvironmentMatches } from "@/lib/admin-environment";
import { parseAdminGlobalScope } from "@/lib/admin-scope";
import {
  queryOrdersEvidence,
  queryJourneysEvidence,
  queryExceptionsQueue,
  buildUnifiedEvidenceTimeline,
  getEconomicsInvestigationReport,
  revealOrderPiiWithAudit,
  evaluateFulfillmentRetryGate,
} from "@/lib/investigation-service";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to investigations API" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const requestedEnvironment = searchParams.get("environment") || "production";
    if (!adminEnvironmentMatches(requestedEnvironment as any)) {
      return NextResponse.json({ error: "Requested environment is not available from this configured datastore.", requestedEnvironment }, { status: 409 });
    }
    const domain = searchParams.get("domain") || "orders";
    const scope = parseAdminGlobalScope(searchParams);
    const cursor = searchParams.get("cursor") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const orderId = searchParams.get("orderId") || undefined;
    const sessionId = searchParams.get("sessionId") || undefined;
    const journeyId = searchParams.get("journeyId") || undefined;
    const format = searchParams.get("format") as "json" | "csv" | null;

    if (domain === "orders") {
      const result = await queryOrdersEvidence({
        scope,
        cursor,
        limit,
        search,
        status,
        orderId,
      });
      return NextResponse.json(result);
    }

    if (domain === "journeys") {
      const result = await queryJourneysEvidence({
        scope,
        cursor,
        limit,
        search,
        status,
      });
      return NextResponse.json(result);
    }

    if (domain === "exceptions") {
      const result = await queryExceptionsQueue({
        scope,
        limit,
      });
      return NextResponse.json(result);
    }

    if (domain === "timeline") {
      const result = await buildUnifiedEvidenceTimeline({
        orderId,
        sessionId,
        journeyId,
        environment: scope.environment,
      });
      return NextResponse.json(result);
    }

    if (domain === "economics") {
      const report = await getEconomicsInvestigationReport({
        scope,
        format: format || "json",
      });

      if (format === "csv") {
        return new NextResponse(report.csvContent, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="smn-economics-ledger.csv"',
          },
        });
      }

      return NextResponse.json(report);
    }

    return NextResponse.json({ error: `Invalid domain: ${domain}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error querying investigation evidence";
    console.error("[Admin Investigations API GET Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to investigations API" }, { status: 401 });
    }

    const body = await req.json();
    const { action, orderId, operatorId, reason, fields } = body;
    if (body.environment && !adminEnvironmentMatches(body.environment)) {
      return NextResponse.json({ error: "Requested environment is not available from this configured datastore.", requestedEnvironment: body.environment }, { status: 409 });
    }

    if (action === "reveal_pii") {
      if (!orderId || !reason) {
        return NextResponse.json({ error: "Missing orderId or reason for PII reveal" }, { status: 400 });
      }
      const result = await revealOrderPiiWithAudit({
        orderId,
        operatorId: getAuthenticatedAdminActor(req)!,
        reason,
        fields,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "check_retry_gate") {
      if (!orderId) {
        return NextResponse.json({ error: "Missing orderId for retry gate evaluation" }, { status: 400 });
      }
      const gateResult = await evaluateFulfillmentRetryGate(orderId);
      return NextResponse.json(gateResult);
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing investigation action";
    console.error("[Admin Investigations API POST Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
