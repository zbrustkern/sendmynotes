import { NextRequest, NextResponse } from "next/server";
import { getAllDiscountCodes } from "@/lib/firebase-admin";
import { getAuthenticatedAdminActor, verifyAdminAuth } from "@/lib/admin-auth";
import type { OfferVersionRecord } from "@/lib/contracts/admin-overhaul";
import { computeOfferLifecycleStatus, getOrSyncOfferVersion, getOfferAnalyticsSummary } from "@/lib/offer-engine";
import { executeAuditedOfferChange } from "@/lib/promotions-and-growth-service";
import { executePromotionAdminAction, getPromotionCampaignHistory, getPromotionCampaigns, isPromotionAdminAction } from "@/lib/promotions-v2-admin";
import { adminInteger, adminObject, PromotionAdminError } from "@/lib/promotions-v2-policy";
import { normalizePromotionCode } from "@/lib/promotions-v2-store";
import { promotionAdminErrorResponse, promotionAdminJson, validatePromotionAdminEnvironment } from "@/lib/promotion-admin-http";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    validatePromotionAdminEnvironment(url.searchParams.get("environment"));
    const view = url.searchParams.get("view");
    if (view === "history") return promotionAdminJson({ success: true, ...await getPromotionCampaignHistory(url.searchParams.get("campaignId")) });
    if (view === "campaigns" || view === "campaign") {
      const id = url.searchParams.get("campaignId");
      if (view === "campaign" && !id) throw new PromotionAdminError("Enter a campaign ID.");
      return promotionAdminJson({ success: true, ...await getPromotionCampaigns(id ?? undefined) });
    }
    const targetCode = url.searchParams.get("code");
    if (targetCode && url.searchParams.get("analytics") === "true") {
      const analytics = await getOfferAnalyticsSummary(targetCode);
      return NextResponse.json({ success: true, code: targetCode, analytics });
    }

    const codes = await getAllDiscountCodes();

    // Enhance codes with version and lifecycle status
    const enhancedCodes = await Promise.all(
      codes.map(async (c) => {
        try {
          const version = await getOrSyncOfferVersion(c.code);
          if (version) {
            const lifecycleStatus = computeOfferLifecycleStatus(version);
            return {
              ...c,
              offerId: version.offerId,
              offerVersion: version.version,
              lifecycleStatus,
              reservedCount: version.reservedCount || 0,
              destinationPath: version.destinationPath || "/",
              budgetCents: version.dollarBudgetLimitCents,
              campaignId: version.campaignId,
            };
          }
          const isExpired = c.expiresAt && Date.now() > c.expiresAt;
          const isExhausted = c.maxUses != null && c.maxUses > 0 && c.usedCount >= c.maxUses;
          const lifecycleStatus = !c.isActive ? "paused" : isExpired ? "expired" : isExhausted ? "exhausted" : "active";
          return {
            ...c,
            lifecycleStatus,
          };
        } catch {
          const isExpired = c.expiresAt && Date.now() > c.expiresAt;
          const isExhausted = c.maxUses != null && c.maxUses > 0 && c.usedCount >= c.maxUses;
          const lifecycleStatus = !c.isActive ? "paused" : isExpired ? "expired" : isExhausted ? "exhausted" : "active";
          return {
            ...c,
            lifecycleStatus,
          };
        }
      })
    );

    // Calculate summary statistics
    let activeCount = 0;
    let totalRedemptions = 0;
    let totalSavingsCents = 0;

    enhancedCodes.forEach((c) => {
      if (c.lifecycleStatus === "active") {
        activeCount++;
      }
      totalRedemptions += c.usedCount || 0;
      totalSavingsCents += c.totalDiscountGivenCents || 0;
    });

    return NextResponse.json({
      codes: enhancedCodes,
      stats: {
        totalCodes: enhancedCodes.length,
        activeCodes: activeCount,
        totalRedemptions,
        totalSavingsCents,
      },
    });
  } catch (error: unknown) {
    return promotionAdminErrorResponse(error);
  }
}

function legacyNumber(value: unknown, label: string, cents = false): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) {
    throw new PromotionAdminError(`Enter a valid ${label}.`);
  }
  const amount = Number(value);
  if (cents) {
    const scaled = amount * 100;
    if (Math.abs(Math.round(scaled) - scaled) > 1e-8) throw new PromotionAdminError(`Enter ${label} to the nearest cent.`);
    return adminInteger(Math.round(scaled), label);
  }
  return adminInteger(amount, label);
}

function legacyDate(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new PromotionAdminError(`Enter a valid ${label}.`);
  return adminInteger(Date.parse(value), label, 0, 8_640_000_000_000_000);
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) return promotionAdminJson({ error: "Unauthorized" }, 401);

    const body = adminObject(await req.json().catch(() => null), "discount request");
    validatePromotionAdminEnvironment(body.environment ?? new URL(req.url).searchParams.get("environment"));
    const actorEmail = getAuthenticatedAdminActor(req)!;
    if (isPromotionAdminAction(body.action)) {
      return promotionAdminJson({ success: true, ...await executePromotionAdminAction(body.action, body, actorEmail) });
    }
    const code = normalizePromotionCode(body.code);
    if (!code) throw new PromotionAdminError("Use 2–64 letters, numbers, underscores or hyphens for the code.");
    if (body.action === "analytics") return promotionAdminJson({ success: true, analytics: await getOfferAnalyticsSummary(code) });

    let action: Parameters<typeof executeAuditedOfferChange>[0]["action"];
    let payload: Partial<OfferVersionRecord> | undefined;
    if (body.action === "create") {
      action = "create";
      if (body.type !== "FIXED_AMOUNT" && body.type !== "PERCENTAGE") throw new PromotionAdminError("Choose a supported discount type.");
      payload = {
        discountType: body.type, discountValue: legacyNumber(body.value, "discount", body.type === "FIXED_AMOUNT"),
        purpose: typeof body.description === "string" && body.description.trim() ? body.description : undefined,
        destinationPath: typeof body.destinationPath === "string" && body.destinationPath.trim() ? body.destinationPath : undefined,
        startsAt: legacyDate(body.startsAt, "start date"), endsAt: legacyDate(body.expiresAt, "expiry date"),
        campaignId: typeof body.campaignId === "string" && body.campaignId.trim() ? body.campaignId : undefined,
        maxUses: body.maxUses ? legacyNumber(body.maxUses, "use limit") : undefined,
        dollarBudgetLimitCents: body.budgetCents ? legacyNumber(body.budgetCents, "budget cents") : undefined,
        perCustomerLimit: body.perCustomerLimit ? legacyNumber(body.perCustomerLimit, "per-sender limit") : undefined,
      };
    } else if (body.action === "toggle") {
      if (body.isActive !== undefined && typeof body.isActive !== "boolean") throw new PromotionAdminError("Choose whether to activate the code.");
      const previous = await getOrSyncOfferVersion(code);
      if (!previous) throw new PromotionAdminError("Discount code not found.", 404);
      action = (body.isActive ?? (previous.status === "paused" || previous.status === "draft")) ? "activate" : "pause";
    } else if (body.action === "archive" || body.action === "delete") {
      action = body.action;
    } else {
      throw new PromotionAdminError("Choose a supported discount action.");
    }
    const result = await executeAuditedOfferChange({ code, action, payload, actorEmail, reason: typeof body.reason === "string" ? body.reason : undefined });
    if (!result.success) return promotionAdminJson({ success: false, error: result.error }, result.status ?? 400);
    if (action === "create" && result.offer) {
      const offer = result.offer;
      return promotionAdminJson({ success: true, code: {
        id: code, code, type: offer.discountType, value: offer.discountValue, description: offer.purpose,
        isActive: offer.status === "active", maxUses: offer.maxUses ?? null, expiresAt: offer.endsAt ?? null,
        usedCount: offer.usedCount, totalDiscountGivenCents: offer.totalDiscountGivenCents, createdAt: offer.createdAt, updatedAt: offer.updatedAt,
      }, offerVersion: offer, message: `Discount code ${code} created.` });
    }
    return promotionAdminJson({ success: true, code, isActive: action === "activate" });
  } catch (error: unknown) {
    return promotionAdminErrorResponse(error);
  }
}
