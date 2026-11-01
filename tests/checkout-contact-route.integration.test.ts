import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as saveContactPost } from "../app/api/checkout/contact/route";
import { POST as confirmOrderPost } from "../app/api/checkout/confirm-order/route";
import { processPaidOrder } from "../lib/order-processor";
import { getOrderById, saveOrder } from "../lib/firebase-admin";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { calculateOrderQuote } from "../lib/order-pricing";
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
    assert.equal((await getOrderById(id))?.customerEmail, "sender@example.com", "contact preference is stored on the order for the single SendMyNotes receipt");
    assert.equal(updateCalls, 0, "saving contact must not enable duplicate Stripe receipts");
    const omitted = await saveContactPost(request({ orderId: id, viewToken: "capability-token", customerEmail: "   " }));
    assert.equal(omitted.status, 200);
    const saved = await getOrderById(id) as any;
    assert.equal(saved.customerEmail, "", "explicit clearing overwrites an account-prefilled legacy value");
    assert.equal(saved.contactEmailChoice, "omitted");
    assert.equal(saved.contactEmailSyncStatus, "synced");
    assert.equal(updateCalls, 0, "omission uses the authoritative order preference without mutating Stripe");

    const closedId = `${id}_closed`;
    await saveOrder({ ...(await getOrderById(id)), id:closedId, status:"PROCESSING", viewToken:"closed-token" } as any);
    const closed = await saveContactPost(request({orderId:closedId,viewToken:"closed-token",customerEmail:"late@example.com"}));
    assert.equal(closed.status,409,"contact cannot change after processing starts");
    assert.equal((await getOrderById(closedId))?.customerEmail,"","rejected update preserves committed preference");

    const paidId = `${id}_paid_recovery`;
    const paidPi = `pi_contact_${paidId}`;
    stripeIntents.set(paidPi, { id: paidPi, status: "succeeded", metadata: { orderId: paidId }, receipt_email: null, livemode: false, amount: 1400, amount_received: 1400, currency: "usd" });
    await saveOrder({ id: paidId, stripePaymentId: paidPi, customerEmail: "", status: "PAYMENT_RECEIVED", fulfillmentStatus: "CONTACT_RECOVERY_REQUIRED", amountInCents: 1400, finalAmountInCents: 1400, quote: calculateOrderQuote({ countryCode: "FR" }), viewToken: "paid-token", frontImageUrl: "https://assets.example.invalid/card.png", printedMessage: "", handwrittenNote: "", fontStyleId: "1", contactPolicyVersion: 1, isInternationalPreview: true, supplierCountryId: 75, supplierCountryName: "France", recipientAddress: { firstName: "Alex", lastName: "Example", street1: "1 Rue Test", city: "Paris", state: "", zip: "75001", country: "FR" }, returnAddress: { firstName: "Sender", lastName: "Example", street1: "2 Test St", city: "Chicago", state: "IL", zip: "60601", country: "US" }, createdAt: Date.now(), updatedAt: Date.now() } as any);
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
    assert.equal(conflict.status, 200, "paid recovery uses the order preference independently of legacy Stripe receipt fields");
    assert.equal((await getOrderById(conflictingId) as any).contactEmailChoice, "omitted");
    assert.equal(updateCalls, 0, "contact recovery never modifies Stripe receipt configuration");

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
