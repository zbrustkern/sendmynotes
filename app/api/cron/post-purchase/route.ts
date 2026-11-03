import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dispatchDuePostPurchase } from "@/lib/post-purchase/dispatch";
import { firestoreDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
async function run(req: NextRequest) {
  const token = process.env.POST_PURCHASE_CRON_SECRET || process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const suppliedBuffer = Buffer.from(supplied); const tokenBuffer = Buffer.from(token || "");
  if (!token || !supplied || suppliedBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, tokenBuffer)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true" || process.env.STAGING_REVIEW_ONLY === "true") return NextResponse.json({ ok: true, paused: true, processed: 0 }, { headers: { "Cache-Control": "no-store" } });
  const now = Date.now();
  const chicagoHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(now));
  const config = await (await import("@/lib/post-purchase/config")).getPostPurchaseConfig();
  if (chicagoHour !== config.sendHourLocal) return NextResponse.json({ ok: true, outsideSendHour: true, processed: 0 }, { headers: { "Cache-Control": "no-store" } });
  const result = await dispatchDuePostPurchase(25, { now });
  await firestoreDb.collection("post_purchase_scheduler").doc("latest").set({ lastRunAt: now, result, sendHourLocal: config.sendHourLocal, updatedAt: now }, { merge: true });
  return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
}
