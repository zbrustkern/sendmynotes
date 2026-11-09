import assert from "node:assert/strict";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb, getOrdersCollection } from "../lib/firebase-admin";
import { recordPaymentCaptureFact } from "../lib/financial-ledger";
import { dispatchMultiSendChildren, listMultiSendDeliveries, preparePaidMultiSend, resumeHeldMultiSend } from "../lib/multi-send/orders";
import { reconcileMultiSendRefund, refundMultiSendDelivery } from "../lib/multi-send/refunds";
import { getOperationalControls, updateOperationalControl } from "../lib/operational-controls";
import { submitPreparedHandwryttenOrder } from "../lib/handwrytten";
import type { Order } from "../lib/types";

const address = (firstName: string) => ({ firstName, lastName: "Friend", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" });

async function main() {
  await withSafeTestHarness(async () => {
    process.env.HANDWRYTTEN_API_KEY = "synthetic-key-never-used-with-injected-adapter";
    delete process.env.HANDWRYTTEN_TEST_MODE;
    delete process.env.STAGING_REVIEW_ONLY;

    async function addBatch(id: string, states?: string[]) {
      const recipients = ["Maya", "Jordan"].map((name, index) => ({
        id: `r${index + 1}`, address: address(name), greeting: { mode: "custom" as const, text: `Dear ${name},` },
        resolvedGreeting: `Dear ${name},`, printedMessage: `Dear ${name},\n\nUnique body for ${name}.\n\nLove, Sam`, amountInCents: 450,
      }));
      const order: Order = {
        id, customerEmail: "buyer@example.invalid", frontImageUrl: "/card.jpg", printedMessage: "", handwrittenNote: "shared", fontStyleId: "4",
        recipientAddress: address("Maya"), returnAddress: address("Sam"), status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_QUEUED",
        stripePaymentId: `pi_${id}`, paymentMode: "live", isTest: false, amountInCents: 900, finalAmountInCents: 900, createdAt: Date.now(), updatedAt: Date.now(),
        multiSend: { version: 1, kind: "parent", recipients, shared: { frontImageUrl: "/card.jpg", note: { text: "shared body", style: "4" }, fontStyleId: "4", returnAddress: address("Sam") }, quote: { version: "test", countryCode: "US", basePriceCents: 900, discountCents: 0, internationalSurchargeCents: 0, totalCents: 900, currency: "USD" }, contentRevision: `revision_${id}`, manifestComplete: false, preparationState: "pending" },
      } as Order;
      await getOrdersCollection().doc(id).set(order);
      await recordPaymentCaptureFact({ orderId: id, paymentIntentId: order.stripePaymentId!, amountCents: 900, currency: "usd", livemode: true, commercialKind: "paid_customer" });
      const prepared = await preparePaidMultiSend(id, { prepare: async () => ({ success: true as const, cardId: `shared-card-${id}`, environment: "live" as const }) });
      assert.equal(prepared.ready, true, "paid parent gets one shared preparation and complete manifest");
      if (states) {
        const rows = await listMultiSendDeliveries(id);
        for (let i = 0; i < states.length; i++) await getOrdersCollection().doc(id).collection("deliveries").doc(rows[i].recipientId).update({ state: states[i], stateVersion: rows[i].stateVersion + 1 });
      }
      return order;
    }

    const uncertainParent = await addBatch("batch-dispatch-uncertain");
    const payloads: string[] = [];
    let submissions = 0;
    const first = await dispatchMultiSendChildren(uncertainParent.id, 2, { submit: async (params, cardId) => {
      submissions++; payloads.push(params.handwrittenMessage);
      assert.equal(cardId, `shared-card-${uncertainParent.id}`, "children share one frozen prepared artwork card");
      if (params.recipient.firstName === "Maya") return { success: true, order_id: "hw-accepted-maya" };
      return { success: false, error: "socket closed after request; response lost" };
    } });
    assert.equal(first.accepted, 1);
    assert.equal(first.uncertain, 1, "unknown provider outcome is held rather than classified as rejection");
    assert.equal(payloads[0], "Dear Maya,\n\nUnique body for Maya.\n\nLove, Sam");
    assert.equal(payloads[1], "Dear Jordan,\n\nUnique body for Jordan.\n\nLove, Sam");
    await dispatchMultiSendChildren(uncertainParent.id, 2, { submit: async () => { submissions++; return { success: true, order_id: "duplicate-forbidden" }; } });
    assert.equal(submissions, 2, "accepted and uncertain children are never blindly submitted again");
    const uncertainRows = await listMultiSendDeliveries(uncertainParent.id);
    assert.deepEqual(uncertainRows.map((row) => row.state).sort(), ["ACCEPTED", "DISPATCH_UNCERTAIN"]);

    const retryPrepParent = await addBatch("batch-preparation-crash");
    const retryPrepRef = getOrdersCollection().doc(retryPrepParent.id);
    const retryPrepOrder = (await retryPrepRef.get()).data() as Order;
    const resetSnapshot = { ...retryPrepOrder.multiSend!, preparedCardId: undefined, preparationEnvironment: undefined, preparationState: "pending", manifestComplete: false };
    await retryPrepRef.update({ multiSend: resetSnapshot } as any);
    let prepareCalls = 0, releasePrepare!: () => void;
    const prepareBarrier = new Promise<void>((resolve) => { releasePrepare = resolve; });
    const delayedPrepare = async () => { prepareCalls++; await prepareBarrier; return { success: true as const, cardId: "one-authoritative-card", environment: "live" as const }; };
    const preparationOne = preparePaidMultiSend(retryPrepParent.id, { prepare: delayedPrepare });
    while (prepareCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const preparationTwo = await preparePaidMultiSend(retryPrepParent.id, { prepare: async () => { prepareCalls++; return { success: true, cardId: "duplicate-card", environment: "live" as const }; } });
    assert.equal(preparationTwo.ready, false, "a repeated preparation cannot claim a currently in-flight parent");
    releasePrepare();
    assert.equal((await preparationOne).ready, true);
    assert.equal(prepareCalls, 1, "repeated recovery retains one authoritative shared preparation result");
    assert.equal((await retryPrepRef.get()).data()?.multiSend?.preparedCardId, "one-authoritative-card");

    const concurrentParent = await addBatch("batch-dispatch-race");
    const concurrentRows = await listMultiSendDeliveries(concurrentParent.id);
    await getOrdersCollection().doc(concurrentParent.id).collection("deliveries").doc("r2").update({ state: "ACCEPTED", supplierOrderId: "already-accepted", stateVersion: concurrentRows[1].stateVersion + 1 });
    let calls = 0, release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const slowSubmit = async () => { calls++; await barrier; return { success: true, order_id: "hw-race-accepted" }; };
    const one = dispatchMultiSendChildren(concurrentParent.id, 1, { submit: slowSubmit });
    while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const two = dispatchMultiSendChildren(concurrentParent.id, 1, { submit: slowSubmit });
    await new Promise((resolve) => setTimeout(resolve, 10)); release();
    await Promise.all([one, two]);
    assert.equal(calls, 1, "concurrent workers acquire one child fence and submit once");

    const thrownParent = await addBatch("batch-thrown-sibling");
    const thrownResults = await dispatchMultiSendChildren(thrownParent.id, 2, { submit: async (params) => {
      if (params.recipient.firstName === "Maya") throw new Error("request socket dropped");
      return { success: true, order_id: "hw-sibling-survives" };
    } });
    assert.equal(thrownResults.uncertain, 1, "a thrown provider request becomes uncertain");
    assert.equal(thrownResults.accepted, 1, "one ambiguous child does not strand an unsent sibling");

    const lateParent = await addBatch("batch-late-provider-result");
    const late = await dispatchMultiSendChildren(lateParent.id, 1, { submit: async (params) => {
      if (params.recipient.firstName === "Maya") {
        const ref = getOrdersCollection().doc(lateParent.id).collection("deliveries").doc("r1");
        const current = (await ref.get()).data() as any;
        await ref.update({ state: "ACCEPTED", stateVersion: current.stateVersion + 1, supplierOrderId: "hw-correlated-earlier" });
        return { success: true, order_id: "hw-late-response" };
      }
      return { success: false, error: "should not be reached", details: { providerRejected: true } };
    } });
    assert.equal(late.accepted, 0, "late provider completion cannot overwrite a newer reconciliation state");
    assert.equal((await getOrdersCollection().doc(lateParent.id).collection("deliveries").doc("r1").get()).data()?.supplierOrderId, "hw-correlated-earlier");

    const correctedParent = await addBatch("batch-correct-after-complete", ["REJECTED", "MAILED"]);
    await getOrdersCollection().doc(correctedParent.id).update({ fulfillmentStatus: "MULTI_SEND_COMPLETE" });
    const corrected = await (await import("../lib/multi-send/orders")).correctRejectedMultiSendDelivery({ orderId: correctedParent.id, recipientId: "r1", expectedStateVersion: 2, address: { ...address("Maya"), street1: "2 Main St" }, reason: "Correct address", idempotencyKey: "correct_batch_complete_r1", actor: "operator@example.invalid", confirmBillableDispatch: true });
    assert.equal(corrected.state, "PENDING");
    assert.equal((await getOrdersCollection().doc(correctedParent.id).get()).data()?.fulfillmentStatus, "MULTI_SEND_PARTIAL", "correction requeues a child even after parent had been marked complete");

    const badCaptureParent = await addBatch("batch-capture-mismatch");
    await firestoreDb.collection("financial_facts").doc(`fact_cap_${badCaptureParent.stripePaymentId}`).update({ amountCents: 899 });
    const badPreparation = await preparePaidMultiSend(badCaptureParent.id);
    assert.equal(badPreparation.ready, false);
    assert.equal((await getOrdersCollection().doc(badCaptureParent.id).get()).data()?.fulfillmentStatus, "MULTI_SEND_HELD", "invalid capture is removed from eligible worker queue");
    let badCaptureCalls = 0;
    await assert.rejects(dispatchMultiSendChildren(badCaptureParent.id, 1, { submit: async () => { badCaptureCalls++; return { success: true, order_id: "should-not-submit" }; } }), /matching live Stripe capture/);
    assert.equal(badCaptureCalls, 0, "capture amount mismatch denies every supplier submission");

    const refundParent = await addBatch("batch-refund-race", ["REJECTED", "REJECTED"]);
    let refundCalls = 0;
    const refundAdapter = async (args: any, options: any) => {
      refundCalls++;
      assert.equal(args.amount, 450);
      assert.equal(options.idempotencyKey, "refund_batch_refund_race_r1");
      assert.deepEqual(args.metadata, { orderId: refundParent.id, recipientId: "r1" }, "private operator reason is excluded from Stripe metadata");
      return { id: "re_test_1", payment_intent: refundParent.stripePaymentId, amount: 450, currency: "usd", livemode: true, status: "succeeded", charge: "ch_test" };
    };
    const refundResults = await Promise.allSettled([1, 2].map(() => refundMultiSendDelivery({ orderId: refundParent.id, recipientId: "r1", expectedStateVersion: 2, reason: "Provider rejected this address", idempotencyKey: "refund_batch_refund_race_r1", actor: "operator@example.invalid", adapter: refundAdapter })));
    assert.equal(refundResults.filter((r) => r.status === "fulfilled").length, 2, "concurrent identical refund requests return the same pending or completed child result");
    assert.equal(refundCalls, 1, "refund state fence calls provider once");

    const mismatchParent = await addBatch("batch-refund-mismatch", ["REJECTED", "ACCEPTED"]);
    await assert.rejects(refundMultiSendDelivery({ orderId: mismatchParent.id, recipientId: "r1", expectedStateVersion: 2, reason: "Mismatch test", idempotencyKey: "refund_batch_mismatch_r1", actor: "operator@example.invalid", adapter: async () => ({ id: "re_bad", payment_intent: mismatchParent.stripePaymentId, amount: 900, currency: "usd", livemode: true, status: "succeeded" }) }), /does not match/);
    const missingRefund = await reconcileMultiSendRefund({ orderId: mismatchParent.id, recipientId: "r1", actor: "operator@example.invalid", lookup: async () => [] });
    assert.equal(missingRefund.status, "unresolved", "no-ID refund is held for read-only provider investigation and never resent automatically");
    const mismatchChild = (await listMultiSendDeliveries(mismatchParent.id)).find((row) => row.recipientId === "r1");
    assert.equal(mismatchChild?.state, "REFUND_PENDING", "mismatched response remains reserved for investigation");
    assert.equal(mismatchChild?.refundStatus, "unknown");

    const reconcileParent = await addBatch("batch-refund-reconcile-match", ["REJECTED", "ACCEPTED"]);
    await refundMultiSendDelivery({ orderId: reconcileParent.id, recipientId: "r1", expectedStateVersion: 2, reason: "Read-only test", idempotencyKey: "refund_batch_reconcile_r1", actor: "operator@example.invalid", adapter: async () => { throw new Error("lost response"); } }).catch(() => undefined);
    const reconciled = await reconcileMultiSendRefund({ orderId: reconcileParent.id, recipientId: "r1", actor: "operator@example.invalid", lookup: async () => [{ id: "re_found", payment_intent: reconcileParent.stripePaymentId, amount: 450, currency: "usd", livemode: true, metadata: { orderId: reconcileParent.id, recipientId: "r1" }, status: "pending" }] });
    assert.equal(reconciled.refundId, "re_found");
    const reconciledChild = (await listMultiSendDeliveries(reconcileParent.id)).find((row) => row.recipientId === "r1");
    assert.equal(reconciledChild?.refundId, "re_found", "successful reconciliation persists provider ID using a state-version fence");
    await assert.rejects(reconcileMultiSendRefund({ orderId: reconcileParent.id, recipientId: "r1", actor: "operator@example.invalid", retrieve: async () => ({ id: "re_found", payment_intent: reconcileParent.stripePaymentId, amount: 450, currency: "eur", livemode: true, status: "succeeded" }) }), /currency, or mode/);
    const systemicParent = await addBatch("batch-systemic-provider", ["PENDING", "PENDING"]);
    let systemicCalls = 0;
    const authDenied = await dispatchMultiSendChildren(systemicParent.id, 2, { submit: async (params, cardId) => {
      systemicCalls++;
      return submitPreparedHandwryttenOrder(params, cardId, async () => new Response("unauthorized", { status: 401 }));
    } });
    assert.equal(systemicCalls, 1, "systemic auth failure stops dispatch before another sibling");
    assert.equal(authDenied.uncertain, 0, "an exact 401 response keeps the provably unsent child pending");
    assert.equal(authDenied.rejected, 0);
    assert.equal(authDenied.pending, 2);
    let systemicChildren = await listMultiSendDeliveries(systemicParent.id);
    assert.deepEqual(systemicChildren.map((row) => row.state), ["PENDING", "PENDING"], "auth-denied child can safely be retried after operator recovery");
    assert.equal((await getOrdersCollection().doc(systemicParent.id).get()).data()?.fulfillmentStatus, "MULTI_SEND_HELD");
    assert.equal((await getOperationalControls()).fulfillment.paused, true, "systemic supplier failure pauses fulfillment globally");

    await updateOperationalControl({ name: "fulfillment", paused: false, reason: "synthetic provider recovered", actor: "test" });
    await (await import("../lib/multi-send/orders")).resumeHeldMultiSend({ orderId: systemicParent.id, reason: "Synthetic credentials restored", idempotencyKey: "resume_systemic_auth_retry", actor: "operator@example.invalid" });
    const recovered = await dispatchMultiSendChildren(systemicParent.id, 1, { submit: async (params) => { assert.equal(params.handwrittenMessage, "Dear Maya,\n\nUnique body for Maya.\n\nLove, Sam"); return { success: true, order_id: "hw_after_auth_recovery" }; } });
    assert.equal(recovered.accepted, 1, "known-not-sent child safely dispatches after explicit pause recovery");
    systemicChildren = await listMultiSendDeliveries(systemicParent.id);
    assert.equal(systemicChildren[0].state, "ACCEPTED");
    assert.equal(systemicChildren[0].attempts, 2, "recovery creates a new fenced attempt for the unsent child");
    assert.equal(systemicChildren[1].state, "PENDING", "other pending sibling remains isolated for the next bounded worker tick");

    const ambiguousBillingParent = await addBatch("batch-ambiguous-billing", ["PENDING", "PENDING"]);
    const billingResult = await dispatchMultiSendChildren(ambiguousBillingParent.id, 2, { submit: async (params, cardId) => submitPreparedHandwryttenOrder(params, cardId, async () => new Response(JSON.stringify({ status: "error", message: "billing balance" }), { status: 402, headers: { "content-type": "application/json" } })) });
    assert.equal(billingResult.uncertain, 1, "billing HTTP response pauses system but keeps post-request outcome uncertain");
    assert.equal(billingResult.pending, 1, "unsubmitted siblings stay pending after systemic stop");
    const billingRows = await listMultiSendDeliveries(ambiguousBillingParent.id);
    assert.equal(billingRows[0].state, "DISPATCH_UNCERTAIN");
    assert.equal(billingRows[1].state, "PENDING");
    assert.equal((await getOrdersCollection().doc(ambiguousBillingParent.id).get()).data()?.fulfillmentStatus, "MULTI_SEND_HELD");

    await updateOperationalControl({ name: "fulfillment", paused: false, reason: "Synthetic billing hold reviewed", actor: "test" });
    const resumeParent = await addBatch("batch-safe-resume", ["DISPATCH_UNCERTAIN", "PENDING"]);
    await getOrdersCollection().doc(resumeParent.id).update({ fulfillmentStatus: "MULTI_SEND_HELD", fulfillmentError: "Manual credential hold" });
    await updateOperationalControl({ name: "fulfillment", paused: true, reason: "synthetic pause for recovery test", actor: "test" });
    await assert.rejects(resumeHeldMultiSend({ orderId: resumeParent.id, reason: "still paused", idempotencyKey: "resume_batch_safe_paused", actor: "operator@example.invalid" }), /still paused/);
    await updateOperationalControl({ name: "fulfillment", paused: false, reason: "synthetic credentials verified", actor: "test" });
    const resumed = await resumeHeldMultiSend({ orderId: resumeParent.id, reason: "Credentials verified", idempotencyKey: "resume_batch_safe_pending", actor: "operator@example.invalid" });
    assert.equal(resumed.state, "MULTI_SEND_CHECKING", "resume allows pending sibling recovery while uncertain child stays checking");
    const afterResume = await listMultiSendDeliveries(resumeParent.id);
    assert.deepEqual(afterResume.map((row) => row.state).sort(), ["DISPATCH_UNCERTAIN", "PENDING"], "resume preserves uncertain and pending child states without resetting either");
    const uncertainPrepRef = getOrdersCollection().doc(resumeParent.id);
    const uncertainPrepOrder = (await uncertainPrepRef.get()).data() as Order;
    await uncertainPrepRef.update({ fulfillmentStatus: "MULTI_SEND_HELD", multiSend: { ...uncertainPrepOrder.multiSend!, preparationState: "uncertain" } } as any);
    await assert.rejects(resumeHeldMultiSend({ orderId: resumeParent.id, reason: "Do not recreate shared card", idempotencyKey: "resume_batch_prep_uncertain", actor: "operator@example.invalid" }), /preparation is uncertain/);
    console.log("multi-send fulfillment: fake-adapter recovery scenarios passed (distinct payloads, uncertain/thrown/systemic outcomes, preparation recovery, concurrent fences, late result fencing, capture mismatch, correction requeue, refund allocation race, no-ID reconciliation).");
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
