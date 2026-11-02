/**
 * app/api/admin/growth/route.ts
 *
 * SPRINT-0008: Growth Workspace Admin API Route
 *
 * Provides endpoints for:
 * - GET:
 *   - returns full-cohort growth report merging dated spend, campaign performance,
 *     paid vs free promo separation, non-causal attribution badge, and recovery candidates.
 * - POST:
 *   - generate_recovery_link: creates non-destructive manual recovery link preserving
 *     original acquisition attribution (zero automated messaging).
 *   - create_campaign_offer: creates an audited offer tied directly to a growth campaign.
 *
 * Strict Security: Enforces verifyAdminAuth(req) on all methods (HTTP 401 on unauthorized).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { parseAdminGlobalScope, toGlobalReportScope } from "@/lib/admin-scope";
import { getWindowBounds } from "@/lib/reporting-engine";
import { adminEnvironmentMatches } from "@/lib/admin-environment";
import {
  getGrowthCampaignAndRecoveryReport,
  buildManualRecoveryLink,
  executeAuditedOfferChange,
} from "@/lib/promotions-and-growth-service";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedEnvironment = searchParams.get("environment") || "production";
    if (!adminEnvironmentMatches(requestedEnvironment as any)) {
      return NextResponse.json({ error: "Requested environment is not available from this configured datastore.", requestedEnvironment }, { status: 409 });
    }
    const adminScope = parseAdminGlobalScope(searchParams);
    const reportScope = toGlobalReportScope(adminScope);
    const bounds = getWindowBounds({
      dateRange: reportScope.window.label,
      fromDate: reportScope.window.start || undefined,
      toDate: reportScope.window.end || undefined,
      from: reportScope.window.start ? new Date(reportScope.window.start).getTime() : undefined,
      to: reportScope.window.end ? new Date(reportScope.window.end).getTime() : undefined,
      timezone: reportScope.timezone,
    });

    const report = await getGrowthCampaignAndRecoveryReport({
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      channel: adminScope.channel,
      device: adminScope.device,
      mode: adminScope.mode,
      environment: adminScope.environment,
      timezone: adminScope.timezone,
      startMs: bounds.startMs,
      endMs: bounds.endMs,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal growth workspace server error";
    console.error("[Growth Admin API GET Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (body.environment && !adminEnvironmentMatches(body.environment)) {
      return NextResponse.json({ error: "Requested environment is not available from this configured datastore.", requestedEnvironment: body.environment }, { status: 409 });
    }
    const { action } = body;

    // 1. Generate Manual Recovery Link
    if (action === "generate_recovery_link") {
      const {
        draftId,
        resumabilityType,
        offerCode,
        originalChannel,
        originalUtmCampaign,
        destinationPath,
        baseUrl,
      } = body;

      if (!draftId || !offerCode) {
        return NextResponse.json(
          { error: "Fields 'draftId' and 'offerCode' are required to generate recovery link." },
          { status: 400 }
        );
      }

      const recoveryLink = buildManualRecoveryLink({
        draftId,
        resumabilityType: resumabilityType === "browser_local_only" ? "browser_local_only" : "server_order_draft",
        offerCode,
        originalChannel,
        originalUtmCampaign,
        destinationPath: destinationPath || "/send",
        baseUrl,
      });

      return NextResponse.json({
        success: true,
        recoveryLink,
      });
    }

    // 2. Create Contextual Campaign Offer
    if (action === "create_campaign_offer") {
      const {
        campaignId,
        code,
        purpose,
        discountType,
        discountValue,
        destinationPath,
        maxUses,
        actorEmail,
        reason,
      } = body;

      if (!code || typeof code !== "string" || code.trim().length < 2) {
        return NextResponse.json(
          { error: "Valid offer code of at least 2 characters is required." },
          { status: 400 }
        );
      }

      const effectiveActor = getAuthenticatedAdminActor(req)!;
      const result = await executeAuditedOfferChange({
        actorEmail: effectiveActor,
        action: "create",
        code,
        payload: {
          campaignId: campaignId || "growth_campaign",
          purpose: purpose || `Campaign Offer: ${campaignId}`,
          discountType: discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT",
          discountValue: typeof discountValue === "number" ? discountValue : 150,
          destinationPath: destinationPath || "/send",
          maxUses: typeof maxUses === "number" ? maxUses : undefined,
          status: "active",
        },
        reason: reason || `Created for growth campaign '${campaignId}'`,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        offer: result.offer,
        auditId: result.auditId,
      });
    }

    return NextResponse.json(
      { error: `Unsupported growth action: '${action}'.` },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal growth mutation error";
    console.error("[Growth Admin API POST Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
