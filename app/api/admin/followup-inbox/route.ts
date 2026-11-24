import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdminActor, verifyAdminAuth } from "@/lib/admin-auth";
import {
  loadFollowupInbox,
  mintSingleUseFollowupCode,
  sendQuickFollowup,
  skipFollowupOrder,
  unskipFollowupOrder,
} from "@/lib/post-purchase/followup-inbox";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function hasTrustedOrigin(req: NextRequest): boolean {
  const supplied = req.headers.get("origin");
  if (!supplied) return true;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") return false;
  try {
    const trusted = new URL(configured || req.nextUrl.origin);
    if (trusted.username || trusted.password || !["https:", "http:"].includes(trusted.protocol)) return false;
    if (process.env.NODE_ENV === "production" && trusted.protocol !== "https:") return false;
    return supplied === trusted.origin;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const includeTests = req.nextUrl.searchParams.get("includeTests") === "true";
    const limitParam = req.nextUrl.searchParams.get("limit");
    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const data = await loadFollowupInbox({
      includeTests,
      ...(parsedLimit !== undefined && Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {}),
    });
    return json({ data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not load follow-ups." }, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return json({ error: "Unauthorized actor" }, 403);
  if (!hasTrustedOrigin(req)) return json({ error: "Invalid origin" }, 403);

  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request payload" }, 400);
    }
    switch (body.action) {
      case "skip":
        return json({
          data: await skipFollowupOrder(String(body.orderId || ""), actor, typeof body.reason === "string" ? body.reason : undefined),
        });
      case "unskip":
        return json({
          data: await unskipFollowupOrder(String(body.orderId || ""), actor),
        });
      case "mint_code":
        if (body.type !== "PERCENTAGE" && body.type !== "FIXED_AMOUNT") {
          return json({ error: "Discount type must be FIXED_AMOUNT or PERCENTAGE." }, 400);
        }
        return json({
          data: await mintSingleUseFollowupCode({
            type: body.type,
            value: Number(body.value),
            validDays: body.validDays !== undefined && body.validDays !== null ? Number(body.validDays) : 60,
            orderId: typeof body.orderId === "string" ? body.orderId : undefined,
          }),
        });
      case "send_quick":
        return json({
          data: await sendQuickFollowup(
            {
              orderId: String(body.orderId || ""),
              subject: String(body.subject || ""),
              body: String(body.body || ""),
              discountCode: typeof body.discountCode === "string" ? body.discountCode : undefined,
            },
            actor
          ),
        });
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Follow-up action failed." }, 409);
  }
}
