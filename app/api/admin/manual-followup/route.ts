import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor, verifyAdminAuth } from "@/lib/admin-auth";
import { generateManualDraft, manualOrderView, saveManualDraft, sendManualDraft } from "@/lib/post-purchase/manual";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  try { return json({ data: await manualOrderView(req.nextUrl.searchParams.get("orderId") || "") }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to load manual email." }, 409); }
}
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  const actor = getAuthenticatedAdminActor(req); if (!actor) return json({ error: "Unauthorized actor" }, 403);
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid origin" }, 403);
  try {
    const input = await req.json(); const orderId = String(input.orderId || "");
    if (input.action === "generate") return json({ data: await generateManualDraft(orderId, actor) });
    if (input.action === "save") return json({ data: await saveManualDraft({ orderId, revision: Number(input.revision), subject: input.subject, body: input.body, kind: input.kind }, actor) });
    if (input.action === "send") return json({ data: await sendManualDraft({ orderId, revision: Number(input.revision), reviewed: input.reviewed === true, testAcknowledged: input.testAcknowledged === true }, actor) });
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Manual email could not be completed." }, 409); }
}
