import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb } from "../lib/firebase-admin";
import { getWebhookInboxRecord } from "../lib/webhook-inbox";
import { getSenderKey, getEmailPreference } from "../lib/post-purchase/preferences";
import { POST as resendWebhook } from "../app/api/webhooks/resend/route";

const secretBytes = Buffer.from("synthetic-resend-signing-secret-32b");
const secret = `whsec_${secretBytes.toString("base64")}`;
function request(eventId: string, event: Record<string, unknown>, signatureOverride?: string): NextRequest {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", secretBytes).update(`${eventId}.${timestamp}.${body}`).digest("base64");
  return new NextRequest("https://sendmynotes.com/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": signatureOverride || `v1,${signature}`,
    },
    body,
  });
}
const event = (type: string, messageId: string, providerId: string) => ({ type, data: { email_id: providerId, tags: [{ name: "message_id", value: messageId }] } });

async function main() {
  const prior = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = secret;
  try {
    await withSafeTestHarness(async () => {
      process.env.POST_PURCHASE_SENDER_HMAC_KEY = "test-resend-sender-key-at-least-32-bytes";
      const senderEmail = "webhook@example.invalid";
      const senderKey = getSenderKey(senderEmail);
      const enrollId = "synthetic-resend-enrollment";
      const messageId = `${"a".repeat(64)}_check_in`;
      const messageRef = firestoreDb.collection("post_purchase_messages").doc(messageId);
      const enrollmentRef = firestoreDb.collection("post_purchase_enrollments").doc(enrollId);
      await enrollmentRef.set({ id: enrollId, programId: "post_purchase_v1", senderKey, state: "active" });
      await messageRef.set({ id: messageId, enrollmentId: enrollId, sourceOrderId: "synthetic-resend-order", step: "check_in", versionId: "ppv_test", state: "dispatching", dueAt: Date.now(), dispatchAttemptedAt: Date.now() });

      const beforeForged = await messageRef.get();
      const forged = await resendWebhook(request("evt-forged", event("email.bounced", messageId, "re_forged"), "v1,forged"));
      assert.equal(forged.status, 400);
      assert.equal((await messageRef.get()).data()?.state, beforeForged.data()?.state);
      assert.equal(await getWebhookInboxRecord("evt-forged", "resend"), null, "invalid signatures must be rejected before inbox writes");

      const foreignEvent = event("email.bounced", messageId, "other-product-provider-id");
      Object.assign(foreignEvent.data,{from:"SendMyNotes <sender@another-product.example>"});
      assert.equal((await resendWebhook(request("evt-other-product",foreignEvent))).status,200);
      assert.equal(await getWebhookInboxRecord("evt-other-product","resend"),null,"other product events are ignored before persistence");
      assert.equal((await messageRef.get()).data()?.state,"dispatching");
      const ownEvent=event("email.sent",messageId,"re-synthetic-1");Object.assign(ownEvent.data,{from:"Zeke at SendMyNotes <zeke@sendmynotes.com>"});
      assert.equal((await resendWebhook(request("evt-own-domain",ownEvent))).status,200);assert.ok(await getWebhookInboxRecord("evt-own-domain","resend"));

      const bounceEvent = event("email.bounced", messageId, "re-synthetic-1");
      assert.equal((await resendWebhook(request("evt-shared-id", bounceEvent))).status, 200);
      const afterBounce = (await messageRef.get()).data();
      assert.equal(afterBounce?.state, "accepted", "a provider event racing dispatch records acceptance");
      assert.equal(afterBounce?.resendId, "re-synthetic-1", "the message_id tag attributes the event to the correct program message");
      assert.equal(afterBounce?.deliveryOutcome, "bounced");
      assert.equal((await enrollmentRef.get()).data()?.state, "cancelled");
      assert.equal((await getEmailPreference(senderEmail))?.state, "bounced");

      const inboxBeforeReplay = await getWebhookInboxRecord("evt-shared-id", "resend");
      const messageBeforeReplay = (await messageRef.get()).data();
      assert.equal((await resendWebhook(request("evt-shared-id", bounceEvent))).status, 200);
      assert.deepEqual((await messageRef.get()).data(), messageBeforeReplay, "duplicate provider event causes no additional message changes");
      assert.deepEqual(await getWebhookInboxRecord("evt-shared-id", "resend"), inboxBeforeReplay, "duplicate event leaves processed inbox record unchanged");

      const deliveredAfterBounce = event("email.delivered", messageId, "re-synthetic-1");
      assert.equal((await resendWebhook(request("evt-delivered-later", deliveredAfterBounce))).status, 200);
      const afterDelivered = (await messageRef.get()).data();
      assert.equal(afterDelivered?.state, "accepted");
      assert.equal(afterDelivered?.deliveryOutcome, "bounced", "later positive event cannot erase negative delivery outcome");
      assert.equal((await getEmailPreference(senderEmail))?.state, "bounced", "later delivery does not clear durable suppression");

      const complaintEmail = "complaint@example.invalid";
      const complaintSenderKey = getSenderKey(complaintEmail);
      const complaintEnrollment = "synthetic-complaint-enrollment";
      const complaintMessageId = `${"b".repeat(64)}_offer`;
      await firestoreDb.collection("post_purchase_enrollments").doc(complaintEnrollment).set({ id: complaintEnrollment, programId: "post_purchase_v1", senderKey: complaintSenderKey, state: "active" });
      await firestoreDb.collection("post_purchase_messages").doc(complaintMessageId).set({ id: complaintMessageId, enrollmentId: complaintEnrollment, sourceOrderId: "synthetic-complaint-order", step: "offer", versionId: "ppv_test", state: "accepted", resendId: "re-complaint", acceptedAt: Date.now() });
      assert.equal((await resendWebhook(request("evt-complaint", event("email.complained", complaintMessageId, "re-complaint")))).status, 200);
      assert.equal((await getEmailPreference(complaintEmail))?.state, "complained");
      assert.equal((await firestoreDb.collection("post_purchase_enrollments").doc(complaintEnrollment).get()).data()?.state, "cancelled");
      assert.equal((await resendWebhook(request("evt-complaint-delivered", event("email.delivered", complaintMessageId, "re-complaint")))).status, 200);
      assert.equal((await getEmailPreference(complaintEmail))?.state, "complained", "a later delivered event cannot clear complaint suppression");

      const retryMessageId = `${"c".repeat(64)}_check_in`;
      const retryRef = firestoreDb.collection("post_purchase_messages").doc(retryMessageId);
      await retryRef.set({ id: retryMessageId, enrollmentId: enrollId, state: "scheduled", dispatchAttemptedAt: Date.now(), step: "check_in" });
      assert.equal((await resendWebhook(request("evt-late-acceptance", event("email.sent", retryMessageId, "re-late")))).status, 200);
      assert.equal((await retryRef.get()).data()?.state, "accepted", "late acceptance after a timeout stops the scheduled retry");

      const resendInbox = await getWebhookInboxRecord("evt-shared-id", "resend");
      assert.equal(resendInbox?.provider, "resend");
      await firestoreDb.collection("provider_webhook_inbox").doc("inbox_stripe_evt-shared-id").set({ provider: "stripe", providerEventId: "evt-shared-id", status: "processed", eventType: "payment_intent.succeeded" });
      assert.equal((await firestoreDb.collection("provider_webhook_inbox").doc("inbox_stripe_evt-shared-id").get()).data()?.provider, "stripe", "Resend inbox uses a provider namespace distinct from Stripe");
      assert.equal((await firestoreDb.collection("provider_webhook_inbox").doc("inbox_resend_evt-shared-id").get()).data()?.provider, "resend");
    });
  } finally {
    if (prior === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = prior;
  }
  process.stdout.write("Signed Resend webhook forgery, idempotency, provider namespace, attribution, concurrent acceptance, and durable suppression tests passed.\n");
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : "Resend webhook test failed"}\n`); process.exitCode = 1; });
