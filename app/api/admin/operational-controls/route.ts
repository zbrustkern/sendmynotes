import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor, verifyAdminAuth } from "@/lib/admin-auth";
import { getOperationalControls, previewOperationalControl, updateOperationalControl, OperationalControlName } from "@/lib/operational-controls";

const NAMES: OperationalControlName[] = ["checkout", "fulfillment", "generation"];
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = req.nextUrl.searchParams.get("preview");
  if (name && NAMES.includes(name as OperationalControlName)) return NextResponse.json({ preview: await previewOperationalControl(name as OperationalControlName) });
  return NextResponse.json({ controls: await getOperationalControls() });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!NAMES.includes(body?.control) || typeof body?.paused !== "boolean" || typeof body?.reason !== "string") {
      return NextResponse.json({ error: "control, paused, and reason are required" }, { status: 400 });
    }
    const authorizedActor = getAuthenticatedAdminActor(req);
    if (!authorizedActor) return NextResponse.json({ error: "Could not identify authorized operator" }, { status: 403 });
    const controls = await updateOperationalControl({ name: body.control, paused: body.paused, reason: body.reason, actor: authorizedActor });
    return NextResponse.json({ success: true, controls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update operational control";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
