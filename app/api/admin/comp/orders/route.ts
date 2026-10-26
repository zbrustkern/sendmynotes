import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { createAdminCompOrder } from "@/lib/admin-comp-service";

export async function POST(req: NextRequest) {
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await createAdminCompOrder(await req.json(), actor);
    return NextResponse.json(result.response, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create admin order." }, { status: 400 });
  }
}
