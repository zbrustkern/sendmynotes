import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { acceptWebhookEvent, markWebhookInboxFailed, markWebhookInboxProcessed } from "@/lib/webhook-inbox";
import { firestoreDb } from "@/lib/firebase-admin";
import { enrollmentRef, messageRef } from "@/lib/post-purchase/repository";
import { suppressPostPurchaseSender } from "@/lib/post-purchase/preferences";

export const runtime = "nodejs";
const response = (status = 200) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest) {
  const raw = await req.text(); const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  const id = req.headers.get("svix-id") || ""; const timestamp = req.headers.get("svix-timestamp") || ""; const signature = req.headers.get("svix-signature") || "";
  if (!secret || !verifySignature(secret, id, timestamp, signature, raw)) return response(400);
  let event: any;
  try { event = JSON.parse(raw); } catch { return response(400); }
  if (!event || typeof event.type !== "string" || !event.data || typeof event.data !== "object") return response(400);
  try {
    const tagMessageId = readMessageTag(event.data.tags);
    const accepted = await acceptWebhookEvent({ provider: "resend", providerEventId: id, eventType: event.type, livemode: true, signatureVerified: true, payloadSummary: { resendMessageId: String(event.data.email_id || event.data.id || "").slice(0,160), messageId: tagMessageId, type: event.type.slice(0,100) } });
    if (!accepted.duplicate) {
      await applyEvent(event.type, event.data, tagMessageId);
      await markWebhookInboxProcessed(id, "resend");
    }
    return response(200);
  } catch (error) {
    await markWebhookInboxFailed(id, error instanceof Error ? error.message.slice(0,300) : "resend webhook failed", "resend").catch(() => undefined);
    return response(500);
  }
}
function verifySignature(secret: string, id: string, timestamp: string, signatures: string, raw: string): boolean {
  if (!id || !/^\d+$/.test(timestamp) || !signatures) return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 5 * 60_000) return false;
  const keyText = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer; try { key = Buffer.from(keyText, "base64"); } catch { return false; }
  if (!key.length) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",", 2); if (version !== "v1" || !value) return false;
    const a = Buffer.from(value); const b = Buffer.from(expected); return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
function readMessageTag(tags: unknown): string | null {
  if (Array.isArray(tags)) { const t = tags.find((x: any) => x?.name === "message_id"); return typeof t?.value === "string" && /^[a-f0-9]{64}_(check_in|offer)$/.test(t.value) ? t.value : null; }
  if (tags && typeof tags === "object") { const value = (tags as any).message_id; return typeof value === "string" && /^[a-f0-9]{64}_(check_in|offer)$/.test(value) ? value : null; }
  return null;
}
async function applyEvent(type: string, data: any, messageId: string | null): Promise<void> {
  const providerId = String(data.email_id || data.id || "").slice(0,160);
  let ref: any; let msg: any;
  if (messageId) {
    ref = messageRef(messageId); const snap = await ref.get(); if (!snap.exists) return; msg = snap.data();
  } else if (providerId) {
    const matches = await firestoreDb.collection("post_purchase_messages").where("resendId", "==", providerId).limit(1).get();
    if (matches.empty) return; ref = matches.docs[0].ref; msg = matches.docs[0].data();
  } else return;
  if (msg.resendId && providerId && msg.resendId !== providerId) return;
  const accepted = ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.suppressed", "email.failed"].includes(type);
  const negative = ["email.bounced", "email.complained", "email.suppressed", "email.failed"].includes(type);
  const existingFacts = msg.deliveryFacts || {};
  const update: any = { resendId: msg.resendId || providerId, deliveryFacts: { ...existingFacts, [type.replace("email.", "")]: Date.now() } };
  if (accepted && !msg.acceptedAt && (["dispatching", "uncertain", "failed"].includes(msg.state) || (msg.state === "scheduled" && Boolean(msg.dispatchAttemptedAt)))) { update.state = "accepted"; update.acceptedAt = Date.now(); update.followupFinalizedAt = msg.followupFinalizedAt ?? null; }
  const priority: Record<string, number> = { failed: 1, bounced: 2, complained: 3, suppressed: 4 };
  const currentOutcome = String(msg.deliveryOutcome || ""); const candidateOutcome = type.replace("email.", "");
  if (negative && (!currentOutcome || (priority[candidateOutcome] || 0) > (priority[currentOutcome] || 0))) update.deliveryOutcome = candidateOutcome;
  await ref.set(update, { merge: true });
  if (["email.bounced", "email.complained", "email.suppressed"].includes(type)) {
    const enrollment = await enrollmentRef(msg.enrollmentId).get(); if (!enrollment.exists) return;
    const senderKey = String(enrollment.data()?.senderKey || ""); if (!senderKey) return;
    const reason = type === "email.complained" ? "complained" : type === "email.bounced" ? "bounced" : "bounced";
    await suppressPostPurchaseSender(senderKey, reason);
    const enrollments = await firestoreDb.collection("post_purchase_enrollments").where("senderKey", "==", senderKey).where("programId", "==", "post_purchase_v1").limit(100).get();
    for (const e of enrollments.docs) {
      await e.ref.set({ state: "cancelled", cancellationReason: reason, updatedAt: Date.now() }, { merge: true });
      const pending = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", e.id).limit(20).get();
      for (const p of pending.docs) if (["scheduled", "held", "claimed", "draft"].includes(p.data().state)) await p.ref.set({ state: "cancelled", suppressionReason: reason }, { merge: true });
    }
  }
}
