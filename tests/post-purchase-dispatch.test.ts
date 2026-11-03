import assert from "node:assert/strict";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb, getOrdersCollection, getOrderById } from "../lib/firebase-admin";
import { DEFAULT_POST_PURCHASE_CONFIG, publishPostPurchaseConfig, savePostPurchaseDraft } from "../lib/post-purchase/config";
import { recordPostPurchaseConsent, getSenderKey, suppressPostPurchaseEmail } from "../lib/post-purchase/preferences";
import { enrollPostPurchaseOrder } from "../lib/post-purchase/enrollment";
import { dispatchDuePostPurchase } from "../lib/post-purchase/dispatch";
import type { Order } from "../lib/types";

async function main() {
  await withSafeTestHarness(async () => {
    process.env.POST_PURCHASE_SENDER_HMAC_KEY = "test-dispatch-sender-key-at-least-32-bytes";
    process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET = "test-dispatch-unsubscribe-key-at-least-32-bytes";
    process.env.POST_PURCHASE_LINK_SECRET = "test-dispatch-link-key-at-least-32-bytes";
    process.env.POST_PURCHASE_SENDER_EMAIL = "hello@example.invalid";
    process.env.POST_PURCHASE_REPLY_TO = "reply@example.invalid";
    process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS = "Example address, Chicago, IL";
    process.env.POST_PURCHASE_AUTO_ENROLL_ACTIVE = "false";
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "false";
    delete process.env.STAGING_REVIEW_ONLY;

    const base = structuredClone(DEFAULT_POST_PURCHASE_CONFIG);
    const draft = await savePostPurchaseDraft({ globalPaused: false }, base.revision, "dispatch-test");
    const published = await publishPostPurchaseConfig(draft.revision, "dispatch-test");
    const now = Date.now();

    function order(id: string, email: string, verifiedAt = now - 86_400_000): Order {
      return {
        id, customerEmail: email, postPurchaseSenderKey: getSenderKey(email), status: "MAILED",
        amountInCents: 900, paymentMethod: "STRIPE", paymentMode: "live", createdAt: verifiedAt,
        updatedAt: verifiedAt, postPurchaseMailedAt: verifiedAt,
        postPurchaseMailingEvidence: { source: "synthetic-test", recordedAt: verifiedAt },
        recipientAddress: { country: "US" },
        purchaseMeasurement: { version: 1, transactionId: id, amountInCents: 900, currency: "USD", verifiedAt, eligible: true, reason: "eligible", refundStatus: "unknown" },
      } as Order;
    }
    async function enroll(id: string, email: string) {
      const item = order(id, email);
      await getOrdersCollection().doc(id).set(item);
      await recordPostPurchaseConsent({ orderId: id, email, optedIn: true, disclosureVersion: "dispatch-test-v1", at: now });
      return enrollPostPurchaseOrder(id, "dispatch-test");
    }
    async function makeDue(messageId: string) {
      await firestoreDb.collection("post_purchase_messages").doc(messageId).set({ dueAt: now - 1, rescheduledAt: now }, { merge: true });
    }

    const acceptedEnrollment = await enroll("dispatch-accepted-order", "accepted@example.invalid");
    const acceptedMessageId = `${acceptedEnrollment.id}_check_in`;
    await makeDue(acceptedMessageId);
    let sends = 0;
    const transport = { async send(payload: Record<string, unknown>, key: string) {
      sends++;
      assert.equal(payload.to, "accepted@example.invalid");
      assert.equal(key, `postpurchase_${acceptedMessageId}`);
      return { id: "synthetic-provider-id" };
    } };
    const blocked = await dispatchDuePostPurchase(10, { now, transport });
    assert.equal(blocked.processed, 0, "delivery flag off must not claim work or call provider");
    assert.equal(sends, 0);
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "true";
    const sent = await dispatchDuePostPurchase(10, { now, transport });
    assert.equal(sent.accepted, 1, JSON.stringify({ sent, sends, message: (await firestoreDb.collection("post_purchase_messages").doc(acceptedMessageId).get()).data() }));
    assert.equal(sends, 1);
    const accepted = (await firestoreDb.collection("post_purchase_messages").doc(acceptedMessageId).get()).data();
    assert.equal(accepted?.state, "accepted");
    assert.equal(accepted?.resendId, "synthetic-provider-id");
    assert.ok(accepted?.dispatchPayload && accepted?.payloadHash && accepted?.idempotencyKey, "accepted payload and stable idempotency facts are persisted");
    const offer = await firestoreDb.collection("post_purchase_messages").doc(`${acceptedEnrollment.id}_offer`).get();
    assert.equal(offer.data()?.state, "scheduled", "accepted check-in schedules the pinned next step");

    const recovery = order("dispatch-recovery-order", "recovery@example.invalid");
    await getOrdersCollection().doc(recovery.id).set(recovery);
    await recordPostPurchaseConsent({ orderId: recovery.id, email: recovery.customerEmail, optedIn: true, disclosureVersion: "dispatch-test-v1", at: now });
    const recoveryEnrollmentId = "synthetic-dispatch-recovery-enrollment";
    const recoveryMessageId = `${recoveryEnrollmentId}_check_in`;
    await firestoreDb.collection("post_purchase_enrollments").doc(recoveryEnrollmentId).set({ id: recoveryEnrollmentId, programId: "post_purchase_v1", versionId: published.versionId, sourceOrderId: recovery.id, senderKey: getSenderKey(recovery.customerEmail), state: "active", stage: "check_in" });
    await firestoreDb.collection("post_purchase_messages").doc(recoveryMessageId).set({ id: recoveryMessageId, enrollmentId: recoveryEnrollmentId, sourceOrderId: recovery.id, step: "check_in", versionId: published.versionId, state: "accepted", dueAt: now - 100, acceptedAt: now - 100, resendId: "provider-accepted-before-crash", followupFinalizedAt: null });
    assert.equal((await firestoreDb.collection("post_purchase_messages").where("state", "==", "accepted").where("step", "==", "check_in").where("followupFinalizedAt", "==", null).orderBy("acceptedAt", "asc").get()).size, 1);
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "false";
    await dispatchDuePostPurchase(10, { now, transport });
    assert.equal((await firestoreDb.collection("post_purchase_messages").doc(recoveryMessageId).get()).data()?.followupFinalizedAt, null, "disabled dispatcher remains read-only even for accepted-message recovery");
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "true";
    const recoveryRun = await dispatchDuePostPurchase(10, { now, transport });
    const recovered = await firestoreDb.collection("post_purchase_messages").doc(recoveryMessageId).get();
    assert.ok(recovered.data()?.followupFinalizedAt, `worker recovers accepted check-ins whose next-step finalization was interrupted: ${JSON.stringify({ recoveryRun, message: recovered.data() })}`);
    assert.equal((await firestoreDb.collection("post_purchase_messages").doc(`${recoveryEnrollmentId}_offer`).get()).data()?.state, "scheduled");
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "true";

    const expiredAttemptId = `${"c".repeat(64)}_check_in`;
    const expiredEnrollmentId = "synthetic-expired-attempt-enrollment";
    await firestoreDb.collection("post_purchase_enrollments").doc(expiredEnrollmentId).set({ id: expiredEnrollmentId, programId: "post_purchase_v1", versionId: published.versionId, sourceOrderId: recovery.id, senderKey: getSenderKey(recovery.customerEmail), state: "active", stage: "check_in" });
    await firestoreDb.collection("post_purchase_messages").doc(expiredAttemptId).set({ id: expiredAttemptId, enrollmentId: expiredEnrollmentId, sourceOrderId: recovery.id, step: "check_in", versionId: published.versionId, state: "scheduled", dueAt: now - 1, dispatchAttemptedAt: now - 23.5 * 60 * 60_000, dispatchPayload: { to: recovery.customerEmail }, idempotencyKey: "expired-key", payloadHash: "frozen" });
    const beforeExpiredSends = sends;
    await dispatchDuePostPurchase(10, { now, transport });
    assert.equal(sends, beforeExpiredSends, "no automatic retry once the provider idempotency safety window expires");
    assert.equal((await firestoreDb.collection("post_purchase_messages").doc(expiredAttemptId).get()).data()?.state, "uncertain");

    const retryEnrollment = await enroll("dispatch-retry-order", "retry@example.invalid");
    const retryMessageId = `${retryEnrollment.id}_check_in`;
    await makeDue(retryMessageId);
    const attempts: Array<{ payload: Record<string, unknown>; key: string }> = [];
    const retryTransport = { async send(payload: Record<string, unknown>, key: string) {
      attempts.push({ payload: structuredClone(payload), key });
      if (attempts.length === 1) throw new Error("synthetic socket reset");
      return { id: "synthetic-retry-accepted" };
    } };
    const firstAttempt = await dispatchDuePostPurchase(10, { now: now + 3, transport: retryTransport });
    assert.equal(firstAttempt.failed, 1);
    const secondAttempt = await dispatchDuePostPurchase(10, { now: now + 4, transport: retryTransport });
    assert.equal(secondAttempt.accepted, 1);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0], "a retry reuses byte-identical frozen payload and provider idempotency key");

    const optedOut = await enroll("dispatch-optout-order", "optedout@example.invalid");
    const optedOutMessageId = `${optedOut.id}_check_in`;
    await makeDue(optedOutMessageId);
    await suppressPostPurchaseEmail("optedout@example.invalid", "unsubscribed", now + 1);
    const beforeOptoutSends = sends;
    const suppressed = await dispatchDuePostPurchase(10, { now: now + 2, transport });
    assert.equal(sends, beforeOptoutSends, "opt-out must prevent transport invocation");
    assert.ok(suppressed.held >= 1);
    assert.equal((await firestoreDb.collection("post_purchase_messages").doc(optedOutMessageId).get()).data()?.state, "held");

    const repeat = await enroll("dispatch-repeat-source", "repeat@example.invalid");
    const repeatMessageId = `${repeat.id}_check_in`;
    await makeDue(repeatMessageId);
    const later = order("dispatch-repeat-later", "repeat@example.invalid", now + 10);
    await getOrdersCollection().doc(later.id).set(later);
    const beforeRepeatSends = sends;
    const repeated = await dispatchDuePostPurchase(10, { now: now + 20, transport });
    assert.equal(sends, beforeRepeatSends, "a subsequent verified purchase suppresses old follow-up");
    assert.ok(repeated.held >= 1);
    assert.equal((await firestoreDb.collection("post_purchase_messages").doc(repeatMessageId).get()).data()?.state, "cancelled");
    assert.equal((await firestoreDb.collection("post_purchase_enrollments").doc(repeat.id).get()).data()?.state, "cancelled");

    const unchangedOrder = await getOrderById("dispatch-accepted-order");
    assert.equal(unchangedOrder?.customerEmail, "accepted@example.invalid");
  });
  process.stdout.write("Post-purchase dispatch gates, acceptance/idempotency, opt-out, repeat-purchase suppression, and next-step scheduling passed with fake transport.\n");
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : "dispatch test failed"}\n`); process.exitCode = 1; });
