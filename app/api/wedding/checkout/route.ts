import { NextRequest, NextResponse } from "next/server";
import { requireWeddingActor, readWeddingBody } from "@/lib/wedding/server";
import {
  advanceWeddingPreparation,
  cancelWeddingBatch,
  confirmWeddingPayment,
  getWeddingBatch,
  getPaidWeddingCard,
  readPaidWeddingCover,
  issueWeddingIntent,
  quoteWeddingSelection,
  readSelection,
  safeId,
  WeddingCheckoutError,
} from "@/lib/wedding/checkout";
import { readPromotionFromRequestReference } from "@/lib/promotions-v2-store";
import { isSameOrigin } from "@/lib/upload/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req))
      throw new WeddingCheckoutError(
        "Use the wedding project to start checkout.",
        403,
      );
    if (
      !req.headers.get("content-type")?.startsWith("application/json") ||
      Number(req.headers.get("content-length")) > 32768
    )
      throw new WeddingCheckoutError(
        "Send a selection of up to 100 cards.",
        400,
      );
    const body = await readWeddingBody(req, 32768);
    const actor = await requireWeddingActor(
      req,
      ["quote", "status", "card"].includes(String(body.action))
        ? "edit"
        : "pay",
    );
    const promotionCode = body.promotionCode;
    if (promotionCode !== undefined && (typeof promotionCode !== "string" || promotionCode.length > 128)) {
      throw new WeddingCheckoutError("Enter a valid offer code.", 400);
    }
    let offer: string | { issuedId: string } | undefined = promotionCode;
    if (body.offerReference !== undefined) {
      const linked = await readPromotionFromRequestReference(req, body.offerReference);
      if (promotionCode || !linked) throw new WeddingCheckoutError("This offer link is unavailable. Remove it to continue.", 409);
      offer = { issuedId: linked.code.id };
    }
    let result;
    switch (body.action) {
      case "quote":
        result = await quoteWeddingSelection(
          actor,
          readSelection(body.selection),
          undefined,
          offer,
        );
        break;
      case "reserve":
        if (
          typeof body.quoteHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(body.quoteHash)
        )
          throw new WeddingCheckoutError(
            "Review the current quote before reserving.",
            400,
          );
        result = await quoteWeddingSelection(
          actor,
          readSelection(body.selection),
          body.quoteHash,
          offer,
        );
        break;
      case "advance":
        result = await advanceWeddingPreparation(actor, safeId(body.batchId));
        break;
      case "pay":
        result = await issueWeddingIntent(actor, safeId(body.batchId));
        break;
      case "confirm":
        result = await confirmWeddingPayment(actor, safeId(body.batchId));
        break;
      case "cancel":
        result = await cancelWeddingBatch(actor, safeId(body.batchId));
        break;
      case "card":
        result = await getPaidWeddingCard(
          actor,
          safeId(body.batchId),
          safeId(body.householdId),
        );
        break;
      case "status":
        result = await getWeddingBatch(actor, safeId(body.batchId));
        break;
      default:
        throw new WeddingCheckoutError("Unknown checkout action.", 400);
    }
    return NextResponse.json(result, { headers });
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status <= 599
        ? e.status
        : 503;
    return NextResponse.json(
      {
        error: e.status
          ? e.message
          : "Checkout is temporarily unavailable. Your cards are saved.",
        code: e.code || "checkout_unavailable",
      },
      { status, headers },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const actor = await requireWeddingActor(req);
    const bytes = await readPaidWeddingCover(
      actor,
      safeId(req.nextUrl.searchParams.get("art")),
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "The purchased card front is unavailable." },
      { status: (error as { status?: number }).status || 503, headers },
    );
  }
}
