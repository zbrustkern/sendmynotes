import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { acceptWebhookEvent, markWebhookInboxFailed, markWebhookInboxProcessed } from "@/lib/webhook-inbox";
import { firestoreDb } from "@/lib/firebase-admin";
import { enrollmentRef, messageRef } from "@/lib/post-purchase/repository";
import { MANUAL_MESSAGES } from "@/lib/post-purchase/manual";
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
  // This provider account serves multiple products. Ignore explicitly foreign senders
  // after signature verification, before recording any event metadata in our inbox.
  if (event.data.from !== undefined) {
    if (typeof event.data.from !== "string") return response(200);
    const from = event.data.from.trim();
    const address = (from.match(/<([^<>]+)>$/)?.[1] || from).trim();
    if (!/^[^\s@<>]+@sendmynotes\.com$/i.test(address)) return response(200);
  }
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
  if (Array.isArray(tags)) { const t = tags.find((x: any) => x?.name === "message_id"); return typeof t?.value === "string" && /^(?:[a-f0-9]{64}_(check_in|offer)|manual_[a-f0-9]{64})$/.test(t.value) ? t.value : null; }
  if (tags && typeof tags === "object") { const value = (tags as any).message_id; return typeof value === "string" && /^(?:[a-f0-9]{64}_(check_in|offer)|manual_[a-f0-9]{64})$/.test(value) ? value : null; }
  return null;
}
async function applyEvent(type: string, data: any, messageId: string | null): Promise<void> {
  const providerId = String(data.email_id || data.id || "").slice(0,160);
  let ref: any; let msg: any;
  if (messageId) {
    ref = messageId.startsWith("manual_") ? firestoreDb.collection(MANUAL_MESSAGES).doc(messageId) : messageRef(messageId); const snap = await ref.get(); if (!snap.exists) return; msg = snap.data();
  } else if (providerId) {
    const matches = await firestoreDb.collection("post_purchase_messages").where("resendId", "==", providerId).limit(1).get();
    if (matches.empty) {
      const manual = await firestoreDb.collection(MANUAL_MESSAGES).where("resendId", "==", providerId).limit(1).get();
      if (manual.empty) return; ref = manual.docs[0].ref; msg = manual.docs[0].data();
    } else { ref = matches.docs[0].ref; msg = matches.docs[0].data(); }
  } else return;
  const applied = await firestoreDb.runTransaction(async (tx: any) => {
    const current = await tx.get(ref); if (!current.exists) return null;
    const latest = current.data();
    if (latest.resendId && providerId && latest.resendId !== providerId) return null;
    if (latest.id?.startsWith("manual_") && !latest.dispatchAttemptedAt) return null;
    const accepted = ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.suppressed", "email.failed"].includes(type);
    const negative = ["email.bounced", "email.complained", "email.suppressed", "email.failed"].includes(type);
    const eventName = type.replace("email.", ""); const now = Date.now();
    const update: any = { resendId: latest.resendId || providerId, deliveryFacts: { ...(latest.deliveryFacts || {}), [eventName]: latest.deliveryFacts?.[eventName] || now } };
    if (accepted && !latest.acceptedAt && (["dispatching", "uncertain", "failed"].includes(latest.state) || (latest.state === "scheduled" && Boolean(latest.dispatchAttemptedAt)))) {
      update.state = "accepted"; update.acceptedAt = now; update.followupFinalizedAt = latest.followupFinalizedAt ?? null;
    }
    const priority: Record<string, number> = { failed: 1, bounced: 2, complained: 3, suppressed: 4 };
    if (negative && (priority[eventName] || 0) > (priority[String(latest.deliveryOutcome || "")] || 0)) update.deliveryOutcome = eventName;
    tx.set(ref, update, { merge: true }); return latest;
  });
  if (!applied) return;
  msg = applied;
  if (["email.bounced", "email.complained", "email.suppressed"].includes(type)) {
    const enrollment = msg.enrollmentId ? await enrollmentRef(msg.enrollmentId).get() : null;
    const senderKey = String(msg.id?.startsWith("manual_") ? msg.senderKey || "" : enrollment?.data()?.senderKey || ""); if (!senderKey) return;
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
