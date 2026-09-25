import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";
import { ValuationHeuristicAssumptions } from "@/lib/types";
import { DEFAULT_VALUATION_ASSUMPTIONS } from "@/lib/valuation-heuristics";

const CONFIG_KEY = "admin_valuation_assumptions";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await getSystemConfig<ValuationHeuristicAssumptions>(CONFIG_KEY);
    return NextResponse.json({
      assumptions: doc ? { ...DEFAULT_VALUATION_ASSUMPTIONS, ...doc } : DEFAULT_VALUATION_ASSUMPTIONS,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error reading valuation assumptions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const assumptions: ValuationHeuristicAssumptions = {
      annualCardsPerCustomer: Math.max(0.5, Math.min(20, Number(body.annualCardsPerCustomer) || DEFAULT_VALUATION_ASSUMPTIONS.annualCardsPerCustomer)),
      customerLifespanYears: Math.max(0.2, Math.min(10, Number(body.customerLifespanYears) || DEFAULT_VALUATION_ASSUMPTIONS.customerLifespanYears)),
      addressBookAdoptionRate: Math.max(0, Math.min(1, Number(body.addressBookAdoptionRate) !== undefined ? Number(body.addressBookAdoptionRate) : DEFAULT_VALUATION_ASSUMPTIONS.addressBookAdoptionRate)),
      addressBookOrderMultiplier: Math.max(1, Math.min(5, Number(body.addressBookOrderMultiplier) || DEFAULT_VALUATION_ASSUMPTIONS.addressBookOrderMultiplier)),
      valuationMultipleSde: Math.max(1, Math.min(15, Number(body.valuationMultipleSde) || DEFAULT_VALUATION_ASSUMPTIONS.valuationMultipleSde)),
      valuationMultipleRevenue: Math.max(0.5, Math.min(10, Number(body.valuationMultipleRevenue) || DEFAULT_VALUATION_ASSUMPTIONS.valuationMultipleRevenue)),
      monthlyFixedOverheadDollars: Math.max(0, Math.min(5000, Number(body.monthlyFixedOverheadDollars) !== undefined ? Number(body.monthlyFixedOverheadDollars) : DEFAULT_VALUATION_ASSUMPTIONS.monthlyFixedOverheadDollars)),
      targetActiveCustomers: Math.max(10, Math.min(100000, Number(body.targetActiveCustomers) || DEFAULT_VALUATION_ASSUMPTIONS.targetActiveCustomers)),
    };

    await setSystemConfig(CONFIG_KEY, {
      ...assumptions,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      assumptions,
      updatedAt: Date.now(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error saving valuation assumptions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
