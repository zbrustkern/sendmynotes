/**
 * app/api/admin/promotions/route.ts
 *
 * SPRINT-0008: Promotions Admin API Route
 *
 * Provides endpoints for:
 * - GET:
 *   - list: lists promotions workspace offers with live price preview & stats
 *   - presets: returns familiar creation presets
 *   - evidence: returns complete funnel, orders, and financial evidence for an offer
 *   - link-preview: builds destination-aware auto-apply link with dry-run quote preview
 *   - effect-preview: checks consequential impact of an offer change before mutation
 * - POST:
 *   - executes audited offer mutations (create, update, pause, activate, archive, delete)
 *   - refuses to hard-delete redeemed codes (returns 400 error requiring archive)
 *   - writes immutable audit record to admin_audit_log
 *
 * Strict Security: Enforces verifyAdminAuth(req) on all methods (HTTP 401 on unauthorized).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import {
  OFFER_CREATION_PRESETS,
  listPromotionsWorkspaceOffers,
  getOfferEvidenceDetail,
  buildDestinationOfferLink,
  previewConsequentialOfferChange,
  executeAuditedOfferChange,
} from "@/lib/promotions-and-growth-service";
import { OfferLifecycleStatus } from "@/lib/contracts/admin-overhaul";
import { adminEnvironmentMatches } from "@/lib/admin-environment";

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
    const view = searchParams.get("view");

    // 1. View Presets
    if (view === "presets") {
      return NextResponse.json({
        success: true,
        presets: OFFER_CREATION_PRESETS,
      });
    }

    // 2. View Offer Evidence
    if (view === "evidence") {
      const code = searchParams.get("code");
      if (!code) {
        return NextResponse.json({ error: "Query parameter 'code' is required for evidence view." }, { status: 400 });
      }
      const evidence = await getOfferEvidenceDetail(code);
      if (!evidence) {
        return NextResponse.json({ error: `Offer '${code}' not found.` }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        evidence,
      });
    }

    // 3. View Destination Link Preview
    if (view === "link-preview") {
      const code = searchParams.get("code") || "";
      const destinationPath = searchParams.get("destinationPath") || "/send";
      const aliasParam = (searchParams.get("aliasParam") || "discount") as "discount" | "code" | "promo";
      const utmSource = searchParams.get("utmSource") || undefined;
      const utmMedium = searchParams.get("utmMedium") || undefined;
      const utmCampaign = searchParams.get("utmCampaign") || undefined;
      const utmContent = searchParams.get("utmContent") || undefined;

      const link = buildDestinationOfferLink({
        code,
        destinationPath,
        aliasParam,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
      });

      return NextResponse.json({
        success: true,
        link,
      });
    }

    // 4. View Consequential Effect Preview
    if (view === "effect-preview") {
      const code = searchParams.get("code");
      if (!code) {
        return NextResponse.json({ error: "Query parameter 'code' is required for effect-preview." }, { status: 400 });
      }
      const action = (searchParams.get("action") || "update") as any;
      const preview = await previewConsequentialOfferChange(code, action);
      return NextResponse.json({
        success: true,
        preview,
      });
    }

    // 5. Default: List workspace offers
    const searchQuery = searchParams.get("q") || undefined;
    const lifecycleStatus = (searchParams.get("status") || "all") as OfferLifecycleStatus | "all";
    const campaignId = searchParams.get("campaignId") || undefined;

    const offers = await listPromotionsWorkspaceOffers({
      searchQuery,
      lifecycleStatus,
      campaignId,
    });

    return NextResponse.json({
      success: true,
      offers,
      presets: OFFER_CREATION_PRESETS,
      count: offers.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal promotions server error";
    console.error("[Promotions Admin API GET Error]:", error);
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
    const { action, code, payload, reason, actorEmail } = body;

    if (!code || typeof code !== "string" || code.trim().length < 2) {
      return NextResponse.json(
        { error: "A valid offer code of at least 2 characters is required." },
        { status: 400 }
      );
    }

    const effectiveActor = getAuthenticatedAdminActor(req)!;
    const result = await executeAuditedOfferChange({
      actorEmail: effectiveActor,
      action: action || "update",
      code,
      payload,
      reason,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          action: result.action,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal promotions mutation error";
    console.error("[Promotions Admin API POST Error]:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
