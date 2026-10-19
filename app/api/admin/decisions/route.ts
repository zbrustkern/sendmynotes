import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth, getAdminSessionEmail, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { createDecisionRecord, listDecisionRecords, updateDecisionRecord } from "@/lib/decision-log";

export const runtime = "nodejs";

function actorFor(req: NextRequest) {
  return getAdminSessionEmail(req.cookies.get(ADMIN_COOKIE_NAME)?.value || "") || "authenticated-admin";
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ success: true, ...(await listDecisionRecords()) });
  } catch (error) {
    console.error("[Admin decisions GET]", error);
    return NextResponse.json({ error: "Decision log is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (body?.action === "create") {
      const result = await createDecisionRecord(body.decision, actorFor(req), req.headers.get("idempotency-key") || undefined);
      return NextResponse.json({ success: true, ...result }, { status: result.duplicate ? 200 : 201 });
    }
    if (body?.action === "update_status") {
      const result = await updateDecisionRecord({ id: body.id, status: body.status, actor: actorFor(req), note: body.note });
      if (result.missing) return NextResponse.json({ error: "Decision not found." }, { status: 404 });
      return NextResponse.json({ success: true, ...result });
    }
    return NextResponse.json({ error: "Unsupported decision action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
