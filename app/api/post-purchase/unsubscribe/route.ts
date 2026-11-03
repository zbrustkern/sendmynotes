import { NextRequest, NextResponse } from "next/server";
import { resolveUnsubscribeToken } from "@/lib/post-purchase/dispatch";
import { suppressPostPurchaseSender } from "@/lib/post-purchase/preferences";
import { firestoreDb } from "@/lib/firebase-admin";

const generic = { valid: false, message: "This link is unavailable. Please contact SendMyNotes support." };
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const senderKey = await resolveUnsubscribeToken(token);
  return NextResponse.json({ valid: !!senderKey }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export async function POST(req: NextRequest) {
  let bodyToken = "";
  if (req.headers.get("content-type")?.includes("application/json")) bodyToken = String((await req.json().catch(() => ({})))?.token || "");
  else bodyToken = String((await req.formData().catch(() => null))?.get("token") || "");
  const token = req.nextUrl.searchParams.get("token") || bodyToken;
  const senderKey = await resolveUnsubscribeToken(token);
  if (!senderKey) return NextResponse.json({ ok: false, ...generic }, { status: 200, headers: { "Cache-Control": "no-store" } });
  try {
    await suppressPostPurchaseSender(senderKey, "unsubscribed", Date.now());
    const enrollments = await firestoreDb.collection("post_purchase_enrollments").where("senderKey", "==", senderKey).where("programId", "==", "post_purchase_v1").limit(100).get();
    for (const enrollment of enrollments.docs) {
      await enrollment.ref.set({ state: "cancelled", cancellationReason: "unsubscribed", updatedAt: Date.now() }, { merge: true });
      const messages = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", enrollment.id).limit(20).get();
      for (const message of messages.docs) if (["draft", "scheduled", "held", "claimed"].includes(message.data().state)) await message.ref.set({ state: "cancelled", suppressionReason: "unsubscribed" }, { merge: true });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
