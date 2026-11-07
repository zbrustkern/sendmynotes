import { NextRequest, NextResponse } from "next/server";
import { firestoreDb } from "@/lib/firebase-admin";
import { verifyAdminAuth, getAuthenticatedAdminActor } from "@/lib/admin-auth";
import { getPostPurchaseConfig, getPublishedPostPurchaseConfig, publishPostPurchaseConfig, savePostPurchaseDraft, validateConfig } from "@/lib/post-purchase/config";
import { activateReviewedEnrollment, enrollPostPurchaseOrder, getPostPurchaseEligibility } from "@/lib/post-purchase/enrollment";
import { getEmailPreference, getSenderKey, maskEmail } from "@/lib/post-purchase/preferences";
import { enrollmentRef, messageRef } from "@/lib/post-purchase/repository";
import { getOrderById as loadOrder } from "@/lib/firebase-admin";
import { renderPostPurchaseEmail } from "@/lib/email/post-purchase";
import type { FollowupStep, PostPurchaseEnrollment } from "@/lib/post-purchase/contracts";
import { hasOtherVerifiedPurchase, hasPostPurchaseRefund } from "@/lib/post-purchase/enrollment";
import { effectiveOrderEmail } from "@/lib/checkout-contact-policy";

const json = (data: unknown, status = 200) => NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const view = req.nextUrl.searchParams.get("view") || "settings";
    if (view === "settings") {
      const config = await getPostPurchaseConfig(); const publishedVersion = await getPublishedPostPurchaseConfig();
      const blockers: string[] = [];
      if (!process.env.POST_PURCHASE_SENDER_HMAC_KEY) blockers.push("Sender HMAC secret is not configured");
      if (!process.env.POST_PURCHASE_SENDER_EMAIL) blockers.push("Verified sender address is not configured");
      if (!process.env.POST_PURCHASE_REPLY_TO) blockers.push("Monitored reply-to address is not configured");
      if (!process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS) blockers.push("Business postal address is not configured");
      if (!process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET) blockers.push("Unsubscribe signing secret is not configured");
      if (!process.env.POST_PURCHASE_LINK_SECRET) blockers.push("Follow-up link signing secret is not configured");
      if (process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true" || process.env.STAGING_REVIEW_ONLY === "true") blockers.push("Delivery is disabled in this environment");
      return json({ config, publishedVersion, readiness: { canSendTest: false, blockers, senderConfigured: !!process.env.POST_PURCHASE_SENDER_EMAIL, replyToConfigured: !!process.env.POST_PURCHASE_REPLY_TO, businessAddressConfigured: !!process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS }, environment: process.env.NODE_ENV || "unknown" });
    }
    if (view === "order") return json(await orderView(req.nextUrl.searchParams.get("orderId") || ""));
    if (view === "queue") return json(await queueView());
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: message(e) }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = getAuthenticatedAdminActor(req); if (!actor) return NextResponse.json({ error: "Unauthorized actor" }, { status: 403 });
  try {
    const body = await req.json();
    switch (body?.action) {
      case "save_draft": return json(await savePostPurchaseDraft(body.config || {}, Number(body.expectedRevision), actor));
      case "publish": return json(await publishPostPurchaseConfig(Number(body.expectedRevision), actor));
      case "enroll": return json(await enrollPostPurchaseOrder(String(body.orderId || ""), actor));
      case "approve": return json(await activateReviewedEnrollment(String(body.enrollmentId || ""), actor));
      case "resume": {
        const id = String(body.enrollmentId || ""); const ref = enrollmentRef(id); const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
        const enrollment = snap.data() as PostPurchaseEnrollment; if (enrollment.state !== "paused") return NextResponse.json({ error: "Only a paused enrollment can be resumed" }, { status: 409 });
        const order = await loadOrder(enrollment.sourceOrderId); if (!order) return NextResponse.json({ error: "Source order not found" }, { status: 404 });
        const email = effectiveOrderEmail(order); const pref = email ? await getEmailPreference(email) : null;
        const current = getPostPurchaseEligibility(order, pref?.state, false);
        if (!current.eligible || pref?.state !== "granted" || await hasPostPurchaseRefund(order).catch(() => true) || await hasOtherVerifiedPurchase(enrollment.senderKey, order.id, order.purchaseMeasurement?.verifiedAt || 0, "later")) return NextResponse.json({ error: "This enrollment still fails its current eligibility checks." }, { status: 409 });
        const now = Date.now();
        const resumed = await firestoreDb.runTransaction(async (tx: any) => {
          const fresh = await tx.get(ref);
          if (!fresh.exists || fresh.data()?.state !== "paused") return false;
          tx.set(ref, { state: "review", eligibility: current, supportHold: false, resumedAt: now, resumedBy: actor, resumeReason: String(body.reason || "operator resumed").slice(0,100), updatedAt: now }, { merge: true });
          return true;
        });
        if (!resumed) return NextResponse.json({ error: "Enrollment changed; refresh and review again" }, { status: 409 });
        return json({ enrollmentId: id, state: "review", requiresApproval: true });
      }
      case "preview": {
        const step: FollowupStep = body.step === "offer" ? "offer" : "check_in";
        const version = body.config ? { ...validateConfig(body.config), versionId: "preview", publishedAt: Date.now(), publishedBy: actor } : await getPublishedPostPurchaseConfig();
        if (!version) return NextResponse.json({ error: "Save a draft or publish settings before previewing." }, { status: 409 });
        const rendered = renderPostPurchaseEmail(version, step, { greeting: "Hi Alex,", cardPhrase: "your card", offerAmount: "$1", offerCode: "EXAMPLE-NOT-A-REAL-CODE", offerUrl: "#preview", expiryDisplay: "January 1, 2027", unsubscribeUrl: "#preview", businessPostalAddress: "Example business address" });
        return json({ ...rendered, recipient: "synthetic@example.invalid", date: "Synthetic preview", offerRedeemable: false });
      }
      case "pause": case "cancel": {
        const id = String(body.enrollmentId || ""); const ref = enrollmentRef(id); const snap = await ref.get(); if (!snap.exists) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
        const target = body.action === "pause" ? "paused" : "cancelled"; await ref.set({ state: target, updatedAt: Date.now(), updatedBy: actor, reason: String(body.reason || "operator action").slice(0,100) }, { merge: true });
        const pending = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", id).limit(10).get();
        for (const doc of pending.docs) if (["draft", "scheduled", "held"].includes(doc.data().state)) await doc.ref.set({ state: body.action === "cancel" ? "cancelled" : "held", suppressionReason: target }, { merge: true });
        return json({ enrollmentId: id, state: target });
      }
      case "reschedule": {
        const id = String(body.messageId || ""); const dueAt = Number(body.dueAt); if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return NextResponse.json({ error: "A future dueAt is required" }, { status: 400 });
        const ref = messageRef(id); const now = Date.now();
        const updated = await firestoreDb.runTransaction(async (tx: any) => {
          const snap = await tx.get(ref); const existing = snap.data();
          if (!snap.exists || !existing || !["scheduled", "held"].includes(existing.state) || existing.dispatchAttemptedAt) return false;
          tx.set(ref, { dueAt, state: "scheduled", leaseUntil: 0, suppressionReason: "", rescheduledBy: actor, rescheduledAt: now, rescheduleReason: String(body.reason || "").slice(0,100) }, { merge: true });
          return true;
        });
        if (!updated) return NextResponse.json({ error: "Message cannot be rescheduled; attempted deliveries require reconciliation" }, { status: 409 });
        return json({ messageId: id, dueAt });
      }
      case "record_reply": {
        const id = String(body.enrollmentId || ""); const snap = await enrollmentRef(id).get(); if (!snap.exists) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
        const hasIssue = body.hasIssue === true; await enrollmentRef(id).set({ replyRecordedAt: Number(body.repliedAt) || Date.now(), supportHold: hasIssue, ...(hasIssue ? { state: "paused", updatedAt: Date.now(), updatedBy: actor } : {}) }, { merge: true });
        if (hasIssue) { const pending = await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", id).limit(10).get(); for (const d of pending.docs) if (["scheduled", "draft"].includes(d.data().state)) await d.ref.set({ state: "held", suppressionReason: "paused_for_support" }, { merge: true }); }
        return json({ enrollmentId: id, replyRecorded: true, supportHold: hasIssue });
      }
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: message(e) }, { status: 409 }); }
}
async function orderView(orderId: string) {
  if (!orderId) throw new Error("orderId is required");
  const order = await loadOrder(orderId); if (!order) throw new Error("Order not found");
  let pref = null; try { if (order.customerEmail) pref = await getEmailPreference(order.customerEmail); } catch { /* no HMAC configuration means unknown */ }
  const key = (() => { try { return order.customerEmail ? getSenderKey(order.customerEmail) : ""; } catch { return ""; } })();
  const matches = key ? await firestoreDb.collection("post_purchase_enrollments").where("senderKey", "==", key).where("programId", "==", "post_purchase_v1").limit(10).get() : null;
  const enrollmentRecord = matches?.docs.map((d: any) => d.data() as PostPurchaseEnrollment).find((d: any) => d.sourceOrderId === order.id) || null;
  const eligibility = getPostPurchaseEligibility(order, pref?.state, !!enrollmentRecord);
  const messagesSnap = enrollmentRecord ? await firestoreDb.collection("post_purchase_messages").where("enrollmentId", "==", enrollmentRecord.id).limit(5).get() : null;
  const enrollment = enrollmentRecord ? { id: enrollmentRecord.id, state: enrollmentRecord.state, stage: enrollmentRecord.stage, dueAt: enrollmentRecord.nextDueAt, mode: enrollmentRecord.mode, eligibility: enrollmentRecord.eligibility } : null;
  const grantSnap = enrollmentRecord ? await firestoreDb.collection("post_purchase_offer_grants").where("enrollmentId", "==", enrollmentRecord.id).limit(1).get() : null;
  const grant = grantSnap && !grantSnap.empty ? grantSnap.docs[0].data() : null;
  const redemption = grant ? await firestoreDb.collection("offer_redemptions").where("offerId", "==", grant.offerId).limit(1).get() : null;
  const related = await firestoreDb.collection("orders").where("retentionAttribution.sourceOrderId", "==", order.id).limit(20).get();
  return { order: { orderId: order.id, maskedEmail: order.customerEmail ? maskEmail(order.customerEmail) : undefined, eligibilityReason: eligibility.reason, eligibility, eligible: eligibility.eligible, permission: { state: pref?.state || "unknown", evidenceLabel: pref?.acceptedAt ? `${pref.disclosureVersion || "recorded disclosure"} · ${pref.source || "recorded source"}` : undefined }, payment: { state: order.purchaseMeasurement?.eligible ? "verified" : "unverified", paidTotal: order.purchaseMeasurement ? `$${(order.purchaseMeasurement.amountInCents / 100).toFixed(2)}` : undefined }, mailing: { state: (order as any).postPurchaseMailingEvidence ? "evidenced" : "unknown", mailedAt: (order as any).postPurchaseMailedAt }, support: { state: (enrollmentRecord as any)?.supportHold ? "paused" : "clear" } }, enrollment, messages: messagesSnap?.docs.map((d: any) => { const m = d.data(); return { id: m.id || d.id, step: m.step, state: m.state, dueAt: m.dueAt, versionId: m.versionId }; }) || [], offer: grant ? { code: grant.code, amountCents: grant.amountCents, expiresAt: grant.expiresAt, status: !redemption?.empty ? "redeemed" : grant.expiresAt <= Date.now() ? "expired" : "issued" } : null, relatedPurchases: related.docs.map((d: any) => { const o = d.data(); return { orderId: o.id || d.id, verifiedAt: o.purchaseMeasurement?.verifiedAt, amountInCents: o.purchaseMeasurement?.amountInCents, refundStatus: o.purchaseMeasurement?.refundStatus }; }) };
}
async function queueView() {
  const orders = await firestoreDb.collection("orders").orderBy("createdAt", "desc").limit(100).get(); const items: any[] = [];
  for (const doc of orders.docs) {
    const order = doc.data() as import("@/lib/types").Order;
    let pref = null; try { if (order.customerEmail) pref = await getEmailPreference(order.customerEmail); } catch { /* hold unknown */ }
    const key = (() => { try { return order.customerEmail ? getSenderKey(order.customerEmail) : ""; } catch { return ""; } })();
    let exists = false; if (key) { const result = await firestoreDb.collection("post_purchase_enrollments").where("senderKey", "==", key).where("programId", "==", "post_purchase_v1").limit(1).get(); exists = !result.empty; }
    const eligibility = getPostPurchaseEligibility(order, pref?.state, exists);
    items.push({ orderId: order.id || doc.id, maskedEmail: order.customerEmail ? maskEmail(order.customerEmail) : undefined, eligibilityReason: eligibility.reason, eligible: eligibility.eligible, permission: { state: pref?.state || "unknown", evidenceLabel: pref?.acceptedAt ? pref.disclosureVersion : undefined }, payment: { state: order.purchaseMeasurement?.eligible ? "verified" : "unverified", paidTotal: order.purchaseMeasurement ? `$${(order.purchaseMeasurement.amountInCents / 100).toFixed(2)}` : undefined }, mailing: { state: (order as any).postPurchaseMailingEvidence ? "evidenced" : "unknown", mailedAt: (order as any).postPurchaseMailedAt } });
  }
  const messages = await firestoreDb.collection("post_purchase_messages").where("state", "==", "scheduled").limit(100).get();
  const uncertain = await firestoreDb.collection("post_purchase_messages").where("state", "==", "uncertain").limit(100).get();
  const due = await firestoreDb.collection("post_purchase_messages").where("state", "==", "scheduled").orderBy("dueAt", "asc").limit(1).get();
  const last = await firestoreDb.collection("post_purchase_scheduler").doc("latest").get();
  return { items, counts: { eligible: items.filter(i=>i.eligible).length, permissionUnknown: items.filter(i=>i.permission.state==="unknown").length, enrolled: items.filter(i=>i.eligibilityReason==="already_enrolled").length }, scheduler: { scheduled: messages.size, uncertain: uncertain.size, oldestDueAt: due.empty ? null : due.docs[0].data().dueAt, lastRunAt: last.data()?.lastRunAt || null, deliveryActive: process.env.POST_PURCHASE_DELIVERY_ACTIVE === "true" } };
}
function message(e: unknown) { return e instanceof Error ? e.message : "Post-purchase operation failed"; }
