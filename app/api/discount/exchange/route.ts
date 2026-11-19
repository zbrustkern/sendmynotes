import { NextRequest, NextResponse } from "next/server";
import { takePromotionAttempt, setPromotionSession } from "@/lib/checkout-promotion-limiter";
import { createPrivatePromotionReference, readPromotionForCode } from "@/lib/promotions-v2-store";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(req: NextRequest) {
  try {
    const rate = await takePromotionAttempt(req);
    const send = (body: object, status: number, additionalHeaders: Record<string, string> = {}) =>
      setPromotionSession(NextResponse.json(body, { status, headers: { ...headers, ...additionalHeaders } }), rate.session);
    if (!rate.allowed) return send({ error: "Too many offer attempts. Please try again shortly." }, 429, { "Retry-After": String(rate.retryAfter) });
    const input = await req.json().catch(() => null);
    const promotion = typeof input?.code === "string" ? await readPromotionForCode(input.code) : null;
    if (!promotion || promotion.code.distribution !== "private" || promotion.campaign.status !== "active") {
      return send({ error: "This offer is unavailable." }, 404);
    }
    return send({ reference: createPrivatePromotionReference(promotion.code.id, rate.session) }, 200);
  } catch {
    return NextResponse.json({ error: "The offer could not be checked." }, { status: 503, headers });
  }
}
