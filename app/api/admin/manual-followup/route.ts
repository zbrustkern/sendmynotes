import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor, verifyAdminAuth } from "@/lib/admin-auth";
import { generateManualDraft, manualOrderView, saveManualDraft, sendManualDraft, type ManualSourceType } from "@/lib/post-purchase/manual";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function contactSource(input: { sourceType?: unknown; sourceId?: unknown; orderId?: unknown }) {
  const sourceType = input.sourceType ?? "order";
  if (sourceType !== "order" && sourceType !== "feedback" && sourceType !== "account") throw new Error("Unknown contact source.");
  return { sourceType: sourceType as ManualSourceType, orderId: String(input.sourceId ?? input.orderId ?? "") };
}
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  try { const { orderId, sourceType } = contactSource(Object.fromEntries(req.nextUrl.searchParams)); return json({ data: await manualOrderView(orderId, sourceType) }); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to load manual email." }, 409); }
}
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  const actor = getAuthenticatedAdminActor(req); if (!actor) return json({ error: "Unauthorized actor" }, 403);
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid origin" }, 403);
  try {
    const input = await req.json(); const { orderId, sourceType } = contactSource(input);
    if (input.action === "generate") return json({ data: await generateManualDraft(orderId, actor, sourceType) });
    if (input.action === "save") return json({ data: await saveManualDraft({ orderId, sourceType, revision: Number(input.revision), subject: input.subject, body: input.body, kind: input.kind }, actor) });
    if (input.action === "send") return json({ data: await sendManualDraft({ orderId, sourceType, revision: Number(input.revision), reviewed: input.reviewed === true, testAcknowledged: input.testAcknowledged === true }, actor) });
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Manual email could not be completed." }, 409); }
}
