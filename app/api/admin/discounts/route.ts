import { NextRequest, NextResponse } from "next/server";
import {
  getAllDiscountCodes,
  saveDiscountCode,
  deleteDiscountCode,
  getDiscountCode,
} from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { DiscountCode, DiscountType } from "@/lib/types";
import {
  computeOfferLifecycleStatus,
  getOrSyncOfferVersion,
  getOfferAnalyticsSummary,
  getOfferVersionsCollection,
} from "@/lib/offer-engine";
import { OfferVersionRecord } from "@/lib/contracts/admin-overhaul";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
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
    const msg = error instanceof Error ? error.message : "Error fetching discount codes";
    console.error("[Admin Discounts GET Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const rawCode = body.code?.trim().toUpperCase();
      if (!rawCode || rawCode.length < 2) {
        return NextResponse.json({ error: "Discount code must be at least 2 characters." }, { status: 400 });
      }

      // Check for code uniqueness
      const existing = await getDiscountCode(rawCode);
      if (existing) {
        return NextResponse.json({ error: `Discount code "${rawCode}" already exists.` }, { status: 400 });
      }

      const type: DiscountType = body.type === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE";
      const rawVal = Number(body.value);

      if (isNaN(rawVal) || rawVal <= 0) {
        return NextResponse.json({ error: "Please enter a valid positive discount value." }, { status: 400 });
      }

      // If percentage, clamp between 1 and 100
      let value = rawVal;
      if (type === "PERCENTAGE") {
        if (rawVal > 100) {
          return NextResponse.json({ error: "Percentage discount cannot exceed 100%." }, { status: 400 });
        }
        value = Math.round(rawVal);
      } else {
        // Stored in cents (e.g. $2.00 input -> 200 cents)
        value = Math.round(rawVal * 100);
      }

      const maxUses = body.maxUses ? Math.max(1, parseInt(body.maxUses, 10)) : null;
      let expiresAt: number | null = null;
      if (body.expiresAt) {
        const parsedExp = new Date(body.expiresAt).getTime();
        if (!isNaN(parsedExp)) {
          expiresAt = parsedExp;
        }
      }

      const newCode: DiscountCode = {
        id: rawCode,
        code: rawCode,
        type,
        value,
        description: body.description?.trim() || "",
        isActive: true,
        maxUses,
        usedCount: 0,
        totalDiscountGivenCents: 0,
        expiresAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveDiscountCode(newCode);

      // Create versioned offer record in offer_versions
      const offerVersion: OfferVersionRecord = {
        offerId: `offer_${rawCode}`,
        version: 1,
        code: rawCode,
        purpose: body.description?.trim() || "Promotional Discount",
        destinationPath: body.destinationPath?.trim() || "/",
        discountType: type,
        discountValue: value,
        status: "active",
        startsAt: body.startsAt ? new Date(body.startsAt).getTime() : undefined,
        endsAt: expiresAt || undefined,
        maxUses: maxUses || undefined,
        dollarBudgetLimitCents: body.budgetCents ? Number(body.budgetCents) : undefined,
        campaignId: body.campaignId?.trim() || undefined,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      try {
        await getOfferVersionsCollection().doc(`offer_${rawCode}_v1`).set(offerVersion);
      } catch (e) {
        console.warn("[Admin Discounts] Warning saving offer version:", e);
      }

      return NextResponse.json({
        success: true,
        code: newCode,
        offerVersion,
        message: `Discount code ${rawCode} created successfully.`,
      });
    }

    if (action === "toggle") {
      const rawCode = body.code?.trim().toUpperCase();
      if (!rawCode) {
        return NextResponse.json({ error: "Missing discount code" }, { status: 400 });
      }

      const existing = await getDiscountCode(rawCode);
      if (!existing) {
        return NextResponse.json({ error: "Discount code not found" }, { status: 404 });
      }

      const updatedStatus = body.isActive !== undefined ? Boolean(body.isActive) : !existing.isActive;
      await saveDiscountCode({
        ...existing,
        isActive: updatedStatus,
        updatedAt: Date.now(),
      });

      try {
        const vRef = getOfferVersionsCollection().doc(`offer_${rawCode}_v1`);
        const vSnap = await vRef.get();
        if (vSnap.exists) {
          await vRef.update({
            status: updatedStatus ? "active" : "paused",
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Non-critical
      }

      return NextResponse.json({
        success: true,
        code: rawCode,
        isActive: updatedStatus,
      });
    }

    if (action === "archive") {
      const rawCode = body.code?.trim().toUpperCase();
      if (!rawCode) {
        return NextResponse.json({ error: "Missing discount code" }, { status: 400 });
      }

      try {
        const vRef = getOfferVersionsCollection().doc(`offer_${rawCode}_v1`);
        await vRef.set({ status: "archived", updatedAt: Date.now() }, { merge: true });
      } catch {
        // Non-critical
      }

      const existing = await getDiscountCode(rawCode);
      if (existing) {
        await saveDiscountCode({ ...existing, isActive: false, updatedAt: Date.now() });
      }

      return NextResponse.json({ success: true, message: `Offer ${rawCode} archived.` });
    }

    if (action === "analytics") {
      const rawCode = body.code?.trim().toUpperCase();
      if (!rawCode) {
        return NextResponse.json({ error: "Missing discount code" }, { status: 400 });
      }
      const summary = await getOfferAnalyticsSummary(rawCode);
      return NextResponse.json({ success: true, analytics: summary });
    }

    if (action === "delete") {
      const rawCode = body.code?.trim().toUpperCase();
      if (!rawCode) {
        return NextResponse.json({ error: "Missing discount code" }, { status: 400 });
      }

      await deleteDiscountCode(rawCode);

      return NextResponse.json({
        success: true,
        message: `Discount code ${rawCode} deleted.`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error processing discount code action";
    console.error("[Admin Discounts POST Error]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
