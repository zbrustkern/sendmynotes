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
import { executePromotionAdminAction, getPromotionCampaignHistory, getPromotionCampaigns, isPromotionAdminAction } from "@/lib/promotions-v2-admin";
import { adminObject, PromotionAdminError } from "@/lib/promotions-v2-policy";
import { promotionAdminErrorResponse, promotionAdminJson, validatePromotionAdminEnvironment } from "@/lib/promotion-admin-http";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    validatePromotionAdminEnvironment(searchParams.get("environment"));
    const view = searchParams.get("view");
    if (view === "history") return promotionAdminJson({ success: true, ...await getPromotionCampaignHistory(searchParams.get("campaignId")) });
    if (view === "campaigns" || view === "campaign") {
      const id = searchParams.get("campaignId");
      if (view === "campaign" && !id) throw new PromotionAdminError("Enter a campaign ID.");
      return promotionAdminJson({ success: true, ...await getPromotionCampaigns(id ?? undefined) });
    }

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
    return promotionAdminErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = adminObject(await req.json().catch(() => null), "promotion request");
    validatePromotionAdminEnvironment(body.environment ?? new URL(req.url).searchParams.get("environment"));
    const actorEmail = getAuthenticatedAdminActor(req)!;
    if (isPromotionAdminAction(body.action)) {
      return promotionAdminJson({ success: true, ...await executePromotionAdminAction(body.action, body, actorEmail) });
    }
    const action = body.action ?? "update";
    if (action !== "create" && action !== "update" && action !== "pause" && action !== "activate" && action !== "archive" && action !== "delete") {
      throw new PromotionAdminError("Choose a supported promotion action.");
    }
    const result = await executeAuditedOfferChange({
      actorEmail, action, code: typeof body.code === "string" ? body.code : "",
      payload: body.payload as Parameters<typeof executeAuditedOfferChange>[0]["payload"],
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    if (!result.success) return promotionAdminJson({ success: false, error: result.error, action }, result.status ?? 400);
    return promotionAdminJson({ success: true, result });
  } catch (error: unknown) {
    return promotionAdminErrorResponse(error);
  }
}
