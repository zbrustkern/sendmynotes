import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { firestoreDb, getOrdersCollection } from "../lib/firebase-admin";
import { FEATURE_FLAG_KEYS, updateFeatureFlag } from "../lib/feature-flags";
import { composeRecipientMessage } from "../lib/multi-send/contracts";
import { preparePaidMultiSend } from "../lib/multi-send/orders";
import { processPaidOrder } from "../lib/order-processor";
import { setStripeClientFactoryForTests } from "../lib/stripe";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { POST as stripeWebhookPost } from "../app/api/webhooks/stripe/route";

const address = (firstName: string) => ({ firstName, lastName: "Friend", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" });

async function main() {
  await withSafeTestHarness(async () => {
    process.env.HANDWRYTTEN_API_KEY = "synthetic-key-never-sent";
    delete process.env.HANDWRYTTEN_TEST_MODE;
    delete process.env.STAGING_REVIEW_ONLY;
    await updateFeatureFlag(FEATURE_FLAG_KEYS.MULTI_SEND, false);

    const id = `pipeline_batch_${Date.now()}`;
    const note = { salutation: "Dear Friends,", text: "Thinking of you.", signOff: "Love, Sam", style: "hwDavid" };
    const specs = [
      { id: "r_inherit", name: "Maya", greeting: { mode: "inherit" as const } },
      { id: "r_custom", name: "Jordan", greeting: { mode: "custom" as const, text: "Hi Jordan," } },
      { id: "r_blank", name: "Nia", greeting: { mode: "custom" as const, text: "" } },
    ];
    const recipients = specs.map((spec) => ({ id: spec.id, address: address(spec.name), greeting: spec.greeting, resolvedGreeting: spec.greeting.mode === "inherit" ? note.salutation : spec.greeting.text, printedMessage: composeRecipientMessage(note, spec.greeting), amountInCents: 900 }));
    const order: any = {
      id, status: "PENDING_PAYMENT", fulfillmentStatus: "MULTI_SEND_QUEUED", customerEmail: "", frontImageUrl: "https://assets.example.invalid/card.png",
      printedMessage: "", handwrittenNote: "Thinking of you.", fontStyleId: "hwDavid", recipientAddress: address("Maya"), returnAddress: address("Sam"),
      stripePaymentId: `pi_pipeline_${id}`, paymentMode: "live", amountInCents: 2700, finalAmountInCents: 2700, createdAt: Date.now(), updatedAt: Date.now(),
      multiSend: { version: 1, kind: "parent", recipients, shared: { frontImageUrl: "https://assets.example.invalid/card.png", note, fontStyleId: "hwDavid", returnAddress: address("Sam") }, quote: { version: "pipeline-v1", countryCode: "US", basePriceCents: 2700, discountCents: 0, internationalSurchargeCents: 0, totalCents: 2700, currency: "USD" }, contentRevision: `revision_${id}`, manifestComplete: false, preparationState: "pending" },
    };
    await getOrdersCollection().doc(id).set(order);
    const pi: any = { id: order.stripePaymentId, status: "succeeded", amount: 2700, amount_received: 2700, currency: "usd", livemode: true, metadata: { orderId: id, contentRevision: order.multiSend.contentRevision, itemCount: "3" } };

    const confirmResult = await processPaidOrder(id, pi.id, undefined, { paymentMode: "live", verifiedPaymentIntent: pi });
    assert.equal(confirmResult.success, true);
    assert.equal((await getOrdersCollection().doc(id).get()).data()?.fulfillmentStatus, "MULTI_SEND_QUEUED", "verified capture enters durable batch queue even when acceptance flag is off");
    const captureRef = firestoreDb.collection("financial_facts").doc(`fact_cap_${pi.id}`);
    assert.equal((await captureRef.get()).data()?.amountCents, 2700, "processor records the verified capture fact");

    const prepared = await preparePaidMultiSend(id, { prepare: async () => ({ success: true as const, cardId: "synthetic_shared_card", environment: "live" as const }) });
    assert.equal(prepared.ready, true, "captured queued parent materializes a complete durable child manifest");
    const manifest = await getOrdersCollection().doc(id).collection("deliveries").get();
    assert.deepEqual(manifest.docs.map((doc: any) => doc.data().printedMessage), [
      "Dear Friends,\n\nThinking of you.\n\nLove, Sam",
      "Hi Jordan,\n\nThinking of you.\n\nLove, Sam",
      "Thinking of you.\n\nLove, Sam",
    ], "inherited, custom and blank greeting choices freeze three exact purchased messages");
    await getOrdersCollection().doc(id).collection("deliveries").doc("r_custom").update({ state: "ACCEPTED", supplierOrderId: "hw_known_child", stateVersion: 3 });
    await getOrdersCollection().doc(id).update({ fulfillmentStatus: "MULTI_SEND_PARTIAL" });

    const event = { id: `evt_pipeline_${id}`, type: "payment_intent.succeeded", livemode: true, created: Math.floor(Date.now() / 1000), data: { object: pi } };
    setStripeClientFactoryForTests(() => ({ webhooks: { constructEvent: (raw: string, signature: string, secret: string) => {
      assert.equal(signature, "synthetic-signed-header"); assert.equal(secret, "synthetic-webhook-secret"); assert.deepEqual(JSON.parse(raw), event); return event;
    } } } as any));
    process.env.STRIPE_WEBHOOK_SECRET = "synthetic-webhook-secret";
    const webhook = await stripeWebhookPost(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "synthetic-signed-header" }, body: JSON.stringify(event) }));
    assert.equal(webhook.status, 200, "signed synthetic browser-absent payment webhook replays safely");
    assert.equal((await captureRef.get()).data()?.amountCents, 2700, "confirmation and webhook converge on one deterministic capture fact");
    const afterReplay = await getOrdersCollection().doc(id).get();
    assert.equal(afterReplay.data()?.fulfillmentStatus, "MULTI_SEND_PARTIAL", "webhook replay preserves progressed parent state");
    const childrenAfterReplay = await getOrdersCollection().doc(id).collection("deliveries").get();
    assert.equal(childrenAfterReplay.docs.find((doc: any) => doc.id === "r_custom")?.data().state, "ACCEPTED", "webhook replay preserves accepted child status");
    assert.equal(childrenAfterReplay.size, 3, "replay does not duplicate durable children");
    setStripeClientFactoryForTests(null);
    console.log("multi-send payment pipeline: verified capture, queue, exact three-recipient manifest, and signed webhook replay passed");
  });
}

main().catch((error) => { console.error(error); setStripeClientFactoryForTests(null); process.exitCode = 1; });
