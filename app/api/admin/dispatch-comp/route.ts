import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { normalizeCountryCode } from "@/lib/mailing-destinations";
import { ADMIN_COMP_PRESETS, issueAdminCompQuote } from "@/lib/admin-comp-pricing";
import { createAdminCompOrder } from "@/lib/admin-comp-service";
import { firestoreDb } from "@/lib/firebase-admin";
import { Order } from "@/lib/types";

/** Compatibility adapter: legacy comp requests now enter the same quote, audit and dispatch-lock spine. */
export async function POST(req: NextRequest) {
  if (process.env.STAGING_REVIEW_ONLY === "true") {
    return NextResponse.json({ error: "Supplier fulfillment is disabled during staging review.", code: "STAGING_REVIEW_ONLY" }, { status: 423 });
  }
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = getAuthenticatedAdminActor(req);
  if (!actor) return NextResponse.json({ error: "An account-bound admin session is required." }, { status: 401 });
  try {
    const body = await req.json();
    const countryValue = body?.recipientAddress?.country;
    const country = countryValue === undefined ? "US" : normalizeCountryCode(countryValue);
    if (!country) return NextResponse.json({ error: "Recipient country is invalid." }, { status: 400 });
    if (country !== "US") return NextResponse.json({ error: "Legacy comp dispatch supports domestic addresses only; use the admin comp composer for enabled destinations." }, { status: 400 });
    const preset = ADMIN_COMP_PRESETS.find((item) => item.url === body.frontImageUrl);
    if (!preset) return NextResponse.json({ error: "Legacy comp endpoint accepts only an approved preset cover." }, { status: 400 });
    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 128) return NextResponse.json({ error: "A stable Idempotency-Key header is required." }, { status: 400 });
    const reason = typeof body.compReason === "string" ? body.compReason.trim() : "";
    if (!reason || reason.length > 500) return NextResponse.json({ error: "A reason between 1 and 500 characters is required." }, { status: 400 });
    const stablePayload = JSON.stringify({ actor, body: { ...body, recipientAddress: { ...body.recipientAddress, country } } });
    const requestHash = crypto.createHash("sha256").update(stablePayload).digest("hex");
    const idemId = crypto.createHash("sha256").update(`${actor.toLowerCase()}\n${idempotencyKey}`).digest("hex");
    const priorSnapshot = await firestoreDb.collection("admin_comp_idempotency").doc(idemId).get();
    if (priorSnapshot.exists) {
      const prior = priorSnapshot.data() as { actor: string; requestHash: string; orderId: string };
      if (prior.actor !== actor || prior.requestHash !== requestHash) return NextResponse.json({ error: "Idempotency key was already used with different order content." }, { status: 409 });
      const saved = await firestoreDb.collection("orders").doc(prior.orderId).get();
      if (!saved.exists) return NextResponse.json({ error: "Order is still being finalized; reload status shortly." }, { status: 503 });
      const order = saved.data() as Order;
      return NextResponse.json({ success: true, orderId: order.id, origin: order.origin, lifecycleStatus: order.adminCompLifecycle, quote: order.adminCompQuote, paymentRequest: { status: order.adminCompPaymentRequestStatus || "not_needed" }, staging: { held: order.adminCompLifecycle === "review_only_held" } }, { status: 200 });
    }
    const quote = await issueAdminCompQuote({ mode: "full_comp", destinationCountryCode: country, reason }, actor);
    const result = await createAdminCompOrder({
      quoteId: quote.quoteId,
      idempotencyKey,
      frontImageAssetId: preset.assetId,
      printedMessage: typeof body.printedMessage === "string" ? body.printedMessage : "",
      handwrittenNote: typeof body.handwrittenNote === "string" ? body.handwrittenNote : "",
      fontStyleId: typeof body.fontStyleId === "string" ? body.fontStyleId : "hwDavid",
      recipientAddress: { ...body.recipientAddress, country },
      returnAddress: body.returnAddress,
      customerEmail: body.customerEmail,
      scheduledSendDate: body.scheduledSendDate,
    }, actor, requestHash);
    return NextResponse.json({ success: true, ...result.response }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create admin comp order." }, { status: 400 });
  }
}
