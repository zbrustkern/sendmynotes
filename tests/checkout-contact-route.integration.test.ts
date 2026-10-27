import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as saveContactPost } from "../app/api/checkout/contact/route";
import { POST as confirmOrderPost } from "../app/api/checkout/confirm-order/route";
import { processPaidOrder } from "../lib/order-processor";
import { getOrderById, saveOrder } from "../lib/firebase-admin";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
const testRequire = createRequire(import.meta.url);
const { PaymentIntents } = testRequire(path.join(process.cwd(), "node_modules/stripe/cjs/resources/PaymentIntents.js"));

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/checkout/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function run() {
  await withSafeTestHarness(async () => {
    const env = process.env as Record<string, string | undefined>;
    const oldStripeKey = env.STRIPE_SECRET_KEY;
    const oldMockFlag = env.ALLOW_LOCAL_MOCK_PAYMENTS;
    env.STRIPE_SECRET_KEY = "sk_test_contact_route_fixture";
    delete env.ALLOW_LOCAL_MOCK_PAYMENTS;
    const stripeIntents = new Map<string, any>();
    let updateCalls = 0;
    let updateFailure: Error | null = null;
    let updateStarted: (() => void) | null = null;
    let updateGate: Promise<void> | null = null;
    const methods = PaymentIntents.prototype as any;
    const originalRetrieve = methods.retrieve;
    const originalUpdate = methods.update;
    methods.retrieve = async (id: string) => {
      const pi = stripeIntents.get(id);
      if (!pi) throw new Error("unexpected test PaymentIntent retrieve");
      return { ...pi };
    };
    methods.update = async (id: string, params: Record<string, unknown>) => {
      updateCalls += 1;
      if (updateStarted) updateStarted();
      if (updateGate) await updateGate;
      if (updateFailure) throw updateFailure;
      const pi = stripeIntents.get(id);
      if (!pi) throw new Error("unexpected test PaymentIntent update");
      const receiptEmail = params.receipt_email || null;
      const updated = { ...pi, receipt_email: receiptEmail };
      stripeIntents.set(id, updated);
      return { ...updated };
    };
    const restoreStripe = () => {
      methods.retrieve = originalRetrieve;
      methods.update = originalUpdate;
      if (oldStripeKey === undefined) delete env.STRIPE_SECRET_KEY; else env.STRIPE_SECRET_KEY = oldStripeKey;
      if (oldMockFlag === undefined) delete env.ALLOW_LOCAL_MOCK_PAYMENTS; else env.ALLOW_LOCAL_MOCK_PAYMENTS = oldMockFlag;
    };
    try {
    const id = `contact_choice_${Date.now()}`;
    const paymentIntentId = `pi_contact_${id}`;
    stripeIntents.set(paymentIntentId, { id: paymentIntentId, status: "requires_payment_method", metadata: { orderId: id }, receipt_email: "prefilled@example.com", livemode: false });
    await saveOrder({
      id,
      stripePaymentId: paymentIntentId,
      customerEmail: "prefilled@example.com",
      status: "PENDING_PAYMENT",
      amountInCents: 900,
      viewToken: "capability-token",
      frontImageUrl: "https://assets.example.invalid/card.png",
      printedMessage: "",
      handwrittenNote: "",
      fontStyleId: "1",
      contactPolicyVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    const denied = await saveContactPost(request({ orderId: id, viewToken: "wrong", customerEmail: "" }));
    assert.equal(denied.status, 403, "contact updates require the order capability");

    const provided = await saveContactPost(request({ orderId: id, viewToken: "capability-token", customerEmail: "sender@example.com" }));
    assert.equal(provided.status, 200);
    assert.equal(stripeIntents.get(paymentIntentId).receipt_email, "sender@example.com", "provided preference is written and verified at Stripe");
    const omitted = await saveContactPost(request({ orderId: id, viewToken: "capability-token", customerEmail: "   " }));
    assert.equal(omitted.status, 200);
    const saved = await getOrderById(id) as any;
    assert.equal(saved.customerEmail, "", "explicit clearing overwrites an account-prefilled legacy value");
    assert.equal(saved.contactEmailChoice, "omitted");
    assert.equal(saved.contactEmailSyncStatus, "synced");
    assert.equal(stripeIntents.get(paymentIntentId).receipt_email, null, "omission clears a pre-existing Stripe receipt_email and verifies it");
    assert.equal(updateCalls, 2);

    const failureId = `${id}_failed`;
    const failurePi = `pi_contact_${failureId}`;
    stripeIntents.set(failurePi, { id: failurePi, status: "requires_payment_method", metadata: { orderId: failureId }, receipt_email: null, livemode: false });
    await saveOrder({ id: failureId, stripePaymentId: failurePi, customerEmail: "", status: "PENDING_PAYMENT", amountInCents: 900, viewToken: "failure-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, createdAt: Date.now(), updatedAt: Date.now() } as any);
    updateFailure = new Error("provider update unavailable");
    const failed = await saveContactPost(request({ orderId: failureId, viewToken: "failure-token", customerEmail: "sender@example.com" }));
    updateFailure = null;
    assert.equal(failed.status, 503);
    assert.equal((await getOrderById(failureId) as any).contactEmailSyncStatus, "pending", "failed provider synchronization stays fail-closed");
    const blockedConfirm = await confirmOrderPost(request({ orderId: failureId, paymentIntentId: failurePi }));
    assert.equal(blockedConfirm.status, 409, "confirmation cannot proceed while the explicit contact choice is pending");

    const concurrentId = `${id}_concurrent`;
    const concurrentPi = `pi_contact_${concurrentId}`;
    stripeIntents.set(concurrentPi, { id: concurrentPi, status: "requires_payment_method", metadata: { orderId: concurrentId }, receipt_email: null, livemode: false });
    await saveOrder({ id: concurrentId, stripePaymentId: concurrentPi, customerEmail: "", status: "PENDING_PAYMENT", amountInCents: 900, viewToken: "concurrent-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, createdAt: Date.now(), updatedAt: Date.now() } as any);
    let releaseUpdate!: () => void;
    updateGate = new Promise<void>((resolve) => { releaseUpdate = resolve; });
    const firstStarted = new Promise<void>((resolve) => { updateStarted = resolve; });
    const firstUpdate = saveContactPost(request({ orderId: concurrentId, viewToken: "concurrent-token", customerEmail: "one@example.com" }));
    await firstStarted;
    const secondUpdate = await saveContactPost(request({ orderId: concurrentId, viewToken: "concurrent-token", customerEmail: "two@example.com" }));
    assert.equal(secondUpdate.status, 409, "a second tab cannot replace an in-flight contact update");
    releaseUpdate();
    assert.equal((await firstUpdate).status, 200);
    updateGate = null;
    updateStarted = null;

    const paidId = `${id}_paid_recovery`;
    const paidPi = `pi_contact_${paidId}`;
    stripeIntents.set(paidPi, { id: paidPi, status: "succeeded", metadata: { orderId: paidId }, receipt_email: null, livemode: false, amount: 1400, amount_received: 1400, currency: "usd" });
    await saveOrder({ id: paidId, stripePaymentId: paidPi, customerEmail: "", status: "PAYMENT_RECEIVED", fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED", amountInCents: 1400, finalAmountInCents: 1400, viewToken: "paid-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, isInternationalPreview: true, supplierCountryId: 75, supplierCountryName: "France", recipientAddress: { firstName: "Alex", lastName: "Example", street1: "1 Rue Test", city: "Paris", state: "", zip: "75001", country: "FR" }, returnAddress: { firstName: "Sender", lastName: "Example", street1: "2 Test St", city: "Chicago", state: "IL", zip: "60601", country: "US" }, createdAt: Date.now(), updatedAt: Date.now() } as any);
    const updatesBeforePaidRecovery = updateCalls;
    const paidRecovery = await saveContactPost(request({ orderId: paidId, viewToken: "paid-token", customerEmail: "" }));
    assert.equal(paidRecovery.status, 200, "a capture before contact claim can be reconciled through the order capability");
    const paidRecoveredOrder = await getOrderById(paidId) as any;
    assert.equal(paidRecoveredOrder.contactEmailSyncStatus, "synced");
    assert.equal(paidRecoveredOrder.fulfillmentStatus, "INTERNATIONAL_PREVIEW_HOLD", "recovery reprocesses captured payment but keeps the preview order held before supplier dispatch");
    assert.equal(updateCalls, updatesBeforePaidRecovery, "a succeeded PaymentIntent is never mutated during paid recovery");

    const pendingCaptureId = `${id}_capture_pending`;
    const pendingCapturePi = `pi_contact_${pendingCaptureId}`;
    stripeIntents.set(pendingCapturePi, { id: pendingCapturePi, status: "succeeded", metadata: { orderId: pendingCaptureId }, receipt_email: null, livemode: false, amount: 900, amount_received: 900, currency: "usd" });
    await saveOrder({ id: pendingCaptureId, stripePaymentId: pendingCapturePi, customerEmail: "sender@example.com", status: "PENDING_PAYMENT", amountInCents: 900, finalAmountInCents: 900, viewToken: "pending-capture-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, contactEmailChoice: "provided", contactEmailSyncStatus: "pending", recipientAddress: { firstName: "Alex", lastName: "Example", street1: "1 Test St", city: "Chicago", state: "IL", zip: "60601", country: "US" }, returnAddress: { firstName: "Sender", lastName: "Example", street1: "2 Test St", city: "Chicago", state: "IL", zip: "60601", country: "US" }, createdAt: Date.now(), updatedAt: Date.now() } as any);
    const heldCapture = await processPaidOrder(pendingCaptureId, pendingCapturePi);
    assert.equal(heldCapture.status, "PAYMENT_RECEIVED");
    const heldOrder = await getOrderById(pendingCaptureId) as any;
    assert.equal(heldOrder.status, "PAYMENT_RECEIVED");
    assert.equal(heldOrder.fulfillmentStatus, "CONTACT_RECOVERY_REQUIRED", "captured payment stays held while contact synchronization is pending");

    const conflictingId = `${id}_paid_conflict`;
    const conflictingPi = `pi_contact_${conflictingId}`;
    stripeIntents.set(conflictingPi, { id: conflictingPi, status: "succeeded", metadata: { orderId: conflictingId }, receipt_email: "stale@example.com", livemode: false, amount: 900, amount_received: 900, currency: "usd" });
    await saveOrder({ id: conflictingId, stripePaymentId: conflictingPi, customerEmail: "", status: "PAYMENT_RECEIVED", fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED", amountInCents: 900, viewToken: "conflict-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, createdAt: Date.now(), updatedAt: Date.now() } as any);
    const conflict = await saveContactPost(request({ orderId: conflictingId, viewToken: "conflict-token", customerEmail: "" }));
    assert.equal(conflict.status, 409, "paid recovery remains held if Stripe already has a conflicting non-empty receipt address");
    assert.equal((await getOrderById(conflictingId) as any).contactEmailChoice, undefined);

    const deferredId = `${id}_deferred`;
    await saveOrder({
      id: deferredId,
      stripePaymentId: `pi_mock_${deferredId}`,
      customerEmail: "",
      status: "PENDING_PAYMENT",
      amountInCents: 900,
      addressDeferred: true,
      viewToken: "deferred-token",
      frontImageUrl: "https://assets.example.invalid/card.png",
      printedMessage: "",
      handwrittenNote: "",
      fontStyleId: "1",
      contactPolicyVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
    const deferredBlank = await saveContactPost(request({ orderId: deferredId, viewToken: "deferred-token", customerEmail: "" }));
    assert.equal(deferredBlank.status, 400, "deferred-address recovery requires a reachable email");
    assert.equal((await getOrderById(deferredId) as any).contactEmailChoice, undefined, "rejected deferred choice is not committed");
    } finally {
      restoreStripe();
    }
  });
}

run().then(() => console.log("checkout contact route integration tests passed"));
