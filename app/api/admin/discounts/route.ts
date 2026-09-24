import { NextRequest, NextResponse } from "next/server";
import {
  getAllDiscountCodes,
  saveDiscountCode,
  deleteDiscountCode,
  getDiscountCode,
} from "@/lib/firebase-admin";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { DiscountCode, DiscountType } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const codes = await getAllDiscountCodes();

    // Calculate summary statistics
    let activeCount = 0;
    let totalRedemptions = 0;
    let totalSavingsCents = 0;

    codes.forEach((c) => {
      const isExpired = c.expiresAt && Date.now() > c.expiresAt;
      const isExhausted = c.maxUses != null && c.maxUses > 0 && c.usedCount >= c.maxUses;
      if (c.isActive && !isExpired && !isExhausted) {
        activeCount++;
      }
      totalRedemptions += c.usedCount || 0;
      totalSavingsCents += c.totalDiscountGivenCents || 0;
    });

    return NextResponse.json({
      codes,
      stats: {
        totalCodes: codes.length,
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

      return NextResponse.json({
        success: true,
        code: newCode,
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

      return NextResponse.json({
        success: true,
        code: rawCode,
        isActive: updatedStatus,
      });
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
