import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import {
  computeSpendAndCostCoverage,
  previewDatedSpendImport,
  commitDatedSpendImport,
  previewSupplierCostImport,
  commitSupplierCostImport,
  queryDatedSpend,
  querySupplierCostsForOrders,
  DatedSpendImportItem,
  SupplierCostImportItem,
} from "@/lib/spend-and-cost-ledger";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to spend/cost API" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type"); // "coverage" (default), "spend", or "cost"
    const startDate = searchParams.get("startDate") || "2026-10-13";
    const endDate = searchParams.get("endDate") || "2026-10-18";
    const orderIdsParam = searchParams.get("orderIds");
    const orderIds = orderIdsParam ? orderIdsParam.split(",").map((s) => s.trim()) : [];

    if (type === "spend") {
      const channel = searchParams.get("channel") || undefined;
      const campaign = searchParams.get("campaign") || undefined;
      const records = await queryDatedSpend({ startDate, endDate, channel, campaign });
      return NextResponse.json({ records });
    }

    if (type === "cost") {
      const costMap = await querySupplierCostsForOrders(orderIds);
      const records = Array.from(costMap.values());
      return NextResponse.json({ records });
    }

    // Default: coverage summary
    const coverage = await computeSpendAndCostCoverage({
      orderIds,
      startDate,
      endDate,
    });

    return NextResponse.json(coverage);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error querying spend and cost data";
    console.error("[Spend/Cost API Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to spend/cost API" }, { status: 401 });
    }

    const body = await req.json();
    const type = body.type; // "spend" or "supplier_cost"
    const action = body.action || "preview"; // "preview" or "commit"
    const items = body.items || [];
    const user = body.user || "admin_user";

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid items payload: must be an array" }, { status: 400 });
    }

    if (type === "spend") {
      if (action === "preview") {
        const preview = await previewDatedSpendImport(items as DatedSpendImportItem[]);
        return NextResponse.json(preview);
      } else if (action === "commit") {
        const result = await commitDatedSpendImport(items as DatedSpendImportItem[], user);
        return NextResponse.json(result);
      } else {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    }

    if (type === "supplier_cost") {
      if (action === "preview") {
        const preview = await previewSupplierCostImport(items as SupplierCostImportItem[]);
        return NextResponse.json(preview);
      } else if (action === "commit") {
        const result = await commitSupplierCostImport(items as SupplierCostImportItem[], user);
        return NextResponse.json(result);
      } else {
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    }

    return NextResponse.json({ error: `Unknown type: ${type}. Expected 'spend' or 'supplier_cost'.` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error processing spend and cost import";
    console.error("[Spend/Cost Import Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
