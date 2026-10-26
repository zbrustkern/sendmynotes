import { NextRequest, NextResponse } from "next/server";
import { getAdminCompCatalog } from "@/lib/admin-comp-pricing";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!getAuthenticatedAdminActor(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(getAdminCompCatalog(req.nextUrl.searchParams.get("countryCode")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalog unavailable." }, { status: 400 });
  }
}
