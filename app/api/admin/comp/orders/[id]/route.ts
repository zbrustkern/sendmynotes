import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { getAdminCompOrderStatus } from "@/lib/admin-comp-service";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!getAuthenticatedAdminActor(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const status = await getAdminCompOrderStatus(id);
  return status ? NextResponse.json(status) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
