import assert from "node:assert/strict";
import { firestoreDb, getOrdersCollection } from "../lib/firebase-admin";
import { DEFAULT_POST_PURCHASE_CONFIG, publishPostPurchaseConfig, savePostPurchaseDraft } from "../lib/post-purchase/config";
import { listPostPurchaseCandidates, previewPostPurchaseEnrollment, previewPostPurchaseMessage, reconcilePostPurchaseMessage } from "../lib/post-purchase/operator";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

async function main() {
  await withSafeTestHarness(async () => {
    process.env.POST_PURCHASE_SENDER_HMAC_KEY = "test-only-not-a-production-secret-123456";
    process.env.NEXT_PUBLIC_APP_URL = "https://sendmynotes.com";
    const config = structuredClone(DEFAULT_POST_PURCHASE_CONFIG);
    const draft = await savePostPurchaseDraft({ ...config, globalPaused: false }, config.revision, "synthetic-operator");
    const published = await publishPostPurchaseConfig(draft.revision, "synthetic-operator");
    const privateEmail = "sender.private@example.invalid";
    const order = {
      id: "synthetic-operator-order", customerEmail: privateEmail, createdAt: Date.now(), amountInCents: 900,
      status: "COMPLETED", frontImageUrl: "", printedMessage: "private card text",
      purchaseMeasurement: { eligible: true, verifiedAt: Date.now(), refundStatus: "unknown" },
    } as any;
    await getOrdersCollection().doc(order.id).set(order);

    const candidate = await previewPostPurchaseEnrollment(order.id);
    assert.equal(candidate.eligibility.reason, "permission_unknown");
    assert.ok(candidate.maskedEmail?.includes("@example.invalid"));
    assert.ok(!JSON.stringify(candidate).includes(privateEmail));
    assert.ok(!JSON.stringify(candidate).includes("private card text"));

    const list = await listPostPurchaseCandidates({ limit: 1 });
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].orderId, order.id);
    assert.equal(list.items[0].eligibility.reason, "permission_unknown");
    assert.ok(!JSON.stringify(list).includes(privateEmail));
    assert.ok(!JSON.stringify(list).includes("private card text"));

    const preview = await previewPostPurchaseMessage({ orderId: order.id, step: "offer", version: published });
    assert.equal(preview.offerRedeemable, false);
    assert.ok(String(preview.text).includes("EXAMPLE-NOT-A-REAL-CODE"));
    assert.ok(!JSON.stringify(preview).includes(privateEmail));
    assert.ok(!JSON.stringify(preview).includes("private card text"));
    assert.equal((await getOrdersCollection().doc(order.id).get()).data()?.customerEmail, privateEmail, "preview must not modify the order");

    const message = { id: "synthetic-message", state: "uncertain", step: "offer", dueAt: Date.now(), dispatchAttemptedAt: Date.now(), payloadHash: "hash", suppressionReason: `reconcile:private detail ${privateEmail}` };
    await firestoreDb.collection("post_purchase_messages").doc(message.id).set(message);
    const before = (await firestoreDb.collection("post_purchase_messages").doc(message.id).get()).data();
    const report = await reconcilePostPurchaseMessage(message.id);
    assert.equal(report.state, "uncertain");
    assert.equal(report.readOnly, true);
    assert.equal(report.externalProviderQueried, false);
    assert.equal(report.providerIdPresent, false);
    assert.ok(!JSON.stringify(report).includes(privateEmail));
    assert.deepEqual((await firestoreDb.collection("post_purchase_messages").doc(message.id).get()).data(), before, "reconcile is read-only");
  });
  process.stdout.write("Post-purchase operator read-only, masking, and synthetic preview checks passed.\n");
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "operator test failed"}\n`); process.exitCode = 1; });
