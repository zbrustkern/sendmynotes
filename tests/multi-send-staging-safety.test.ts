import assert from "node:assert/strict";
import { getOrdersCollection } from "../lib/firebase-admin";
import { composeRecipientMessage } from "../lib/multi-send/contracts";
import { processPaidOrder } from "../lib/order-processor";
import { projectMultiSendView } from "../lib/multi-send/presentation";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

const address = (firstName: string) => ({ firstName, lastName: "Friend", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" });

async function main() {
  await withSafeTestHarness(async () => {
    const previous = {
      STAGING_REVIEW_ONLY: process.env.STAGING_REVIEW_ONLY,
      HANDWRYTTEN_TEST_MODE: process.env.HANDWRYTTEN_TEST_MODE,
      HANDWRYTTEN_API_KEY: process.env.HANDWRYTTEN_API_KEY,
    };
    process.env.STAGING_REVIEW_ONLY = "true";
    process.env.HANDWRYTTEN_TEST_MODE = "true";
    process.env.HANDWRYTTEN_API_KEY = "synthetic-key-must-not-be-used";
    try {
      const id = `staging_held_batch_${Date.now()}`;
      const note = { salutation: "Dear friends,", text: "A note for you.", signOff: "Sam", style: "hwDavid" };
      const specs = [
        { id: "accepted", greeting: { mode: "inherit" as const } },
        { id: "uncertain", greeting: { mode: "custom" as const, text: "Hi there," } },
        { id: "pending", greeting: { mode: "custom" as const, text: "" } },
      ];
      const recipients = specs.map((row) => ({
        id: row.id, address: address(row.id), greeting: row.greeting,
        resolvedGreeting: row.greeting.mode === "inherit" ? note.salutation : row.greeting.text,
        printedMessage: composeRecipientMessage(note, row.greeting), amountInCents: 900,
      }));
      const revision = `revision_${id}`;
      const paymentIntentId = `pi_test_${id}`;
      const order: any = {
        id, status: "PENDING_PAYMENT", fulfillmentStatus: "MULTI_SEND_QUEUED", customerEmail: "",
        frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: note.text,
        fontStyleId: note.style, recipientAddress: recipients[0].address, returnAddress: address("Sam"),
        stripePaymentId: paymentIntentId, paymentMode: "stripe_test", isTest: true,
        amountInCents: 2700, finalAmountInCents: 2700, createdAt: Date.now(), updatedAt: Date.now(),
        multiSend: {
          version: 1, kind: "parent", checkoutId: "123e4567-e89b-42d3-a456-426614174099", recipients,
          shared: { frontImageUrl: "https://assets.example.invalid/card.png", note, fontStyleId: note.style, returnAddress: address("Sam") },
          quote: { version: "multi-send-900-v1", countryCode: "US", basePriceCents: 2700, discountCents: 0, internationalSurchargeCents: 0, totalCents: 2700, currency: "USD" },
          contentRevision: revision, manifestComplete: false, preparationState: "pending",
        },
      };
      await getOrdersCollection().doc(id).set(order);
      const pi: any = {
        id: paymentIntentId, status: "succeeded", amount: 2700, amount_received: 2700, currency: "usd", livemode: false,
        metadata: { orderId: id, contentRevision: revision, itemCount: "3" },
      };
      const first = await processPaidOrder(id, paymentIntentId, undefined, { paymentMode: "stripe_test", isTest: true, verifiedPaymentIntent: pi });
      assert.equal(first.success, true);
      const held = await getOrdersCollection().doc(id).get();
      assert.equal(held.data()?.fulfillmentStatus, "MULTI_SEND_HELD", "verified test-mode payment is durably held before supplier preparation");
      assert.equal(held.data()?.multiSend?.manifestComplete, false);
      assert.equal((await getOrdersCollection().doc(id).collection("deliveries").get()).size, 0, "no children or supplier work are materialized by payment confirmation");

      const deliveries = getOrdersCollection().doc(id).collection("deliveries");
      await deliveries.doc("accepted").set({ parentOrderId: id, recipientId: "accepted", state: "ACCEPTED", stateVersion: 2 });
      await deliveries.doc("uncertain").set({ parentOrderId: id, recipientId: "uncertain", state: "DISPATCH_UNCERTAIN", stateVersion: 2 });
      const replay = await processPaidOrder(id, paymentIntentId, undefined, { paymentMode: "stripe_test", isTest: true, verifiedPaymentIntent: pi });
      assert.equal(replay.success, true);
      assert.equal((await getOrdersCollection().doc(id).get()).data()?.fulfillmentStatus, "MULTI_SEND_HELD", "payment replay preserves the environment hold");
      assert.equal((await deliveries.doc("accepted").get()).data()?.state, "ACCEPTED");
      assert.equal((await deliveries.doc("uncertain").get()).data()?.state, "DISPATCH_UNCERTAIN");

      const current = (await getOrdersCollection().doc(id).get()).data() as any;
      const childRows = (await deliveries.get()).docs.map((doc: any) => doc.data());
      const view = projectMultiSendView(current, childRows as any, true)!;
      assert.deepEqual(view.deliveries.map((row) => row.status), ["Being prepared", "Checking this card", "On hold"], "held parent labels only pending work On hold and preserves accepted/uncertain truth");
      console.log("multi-send staging safety: test payment held, no preparation, replay preserved, status projection truthful");
    } finally {
      if (previous.STAGING_REVIEW_ONLY === undefined) delete process.env.STAGING_REVIEW_ONLY; else process.env.STAGING_REVIEW_ONLY = previous.STAGING_REVIEW_ONLY;
      if (previous.HANDWRYTTEN_TEST_MODE === undefined) delete process.env.HANDWRYTTEN_TEST_MODE; else process.env.HANDWRYTTEN_TEST_MODE = previous.HANDWRYTTEN_TEST_MODE;
      if (previous.HANDWRYTTEN_API_KEY === undefined) delete process.env.HANDWRYTTEN_API_KEY; else process.env.HANDWRYTTEN_API_KEY = previous.HANDWRYTTEN_API_KEY;
    }
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
