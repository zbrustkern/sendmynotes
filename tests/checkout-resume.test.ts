import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run() {
  for (const key of Object.keys(process.env)) {
    if (/FIREBASE|GOOGLE|GCLOUD|K_SERVICE|STRIPE|HANDWRYTTEN|RESEND/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { NODE_ENV: "test", ALLOW_LOCAL_MOCK_PAYMENTS: "true",
    SMN_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), "smn-checkout-resume-")) });
  const { NextRequest } = await import("next/server");
  const { POST } = await import("../app/api/checkout/create-intent/route");
  const { getOrdersCollection, getOrderById, updateOrderStatus, saveDiscountCode, isFirestoreMock } = await import("../lib/firebase-admin");
  const { getOfferQuotesCollection, getOfferReservationsCollection } = await import("../lib/offer-engine");
  const { sanitizeMetadata } = await import("../lib/telemetry-schema");
  assert.equal(isFirestoreMock, true);
  const address = { firstName: "Test", lastName: "Sender", street1: "123 Main St", city: "Austin", state: "TX", zip: "78701" };
  const draft = { checkoutDraftKey: randomBytes(24).toString("hex"), frontImageUrl: "/presets/test.jpg", handwrittenNote: "Testing resume.",
    recipientAddress: address, returnAddress: address, contactPolicyVersion: 1, sessionId: "test-session" };
  async function post(patch: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    const response = await POST(new NextRequest("http://localhost/api/checkout/create-intent", {
      method: "POST", headers: { origin: "http://localhost", host: "localhost", ...headers }, body: JSON.stringify({ ...draft, ...patch }),
    }));
    return { status: response.status, data: await response.json() };
  }
  const [first, simultaneous] = await Promise.all([post(), post()]);
  assert.equal(first.status, 200);
  assert.equal(simultaneous.status, 200);
  assert.equal(first.data.orderId, simultaneous.data.orderId);
  assert.equal(first.data.viewToken, simultaneous.data.viewToken);
  assert.equal(first.data.paymentIntentId, simultaneous.data.paymentIntentId);
  assert.equal((await getOrdersCollection().get()).size, 1);
  const id = first.data.orderId;
  await updateOrderStatus(id, { customerEmail: "kept@example.test", contactEmailChoice: "provided" });
  const resumed = await post({ sessionId: "next-visit", customerEmail: "edited@example.test", attribution: { capturedAt: Date.now() } });
  assert.equal(resumed.data.clientSecret, first.data.clientSecret);
  assert.equal((await getOrderById(id))?.customerEmail, "kept@example.test");
  for (const edit of [{ handwrittenNote: "Different" }, { recipientAddress: { ...address, zip: "78702" } },
    { frontImageUrl: "/presets/different.jpg" }, { fontStyleId: "different" }, { checkoutDraftKey: randomBytes(24).toString("hex") }]) {
    const changed = await post(edit);
    assert.equal(changed.status, 200);
    assert.notEqual(changed.data.orderId, id);
  }
  const account = await post({}, { Authorization: "Bearer mock_token_account1" });
  assert.equal(account.status, 200);
  assert.notEqual(account.data.orderId, id);
  await updateOrderStatus(id, { status: "PAYMENT_RECEIVED" });
  const paid = await post();
  assert.equal(paid.status, 409);
  assert.equal(paid.data.orderId, id);
  assert.equal(paid.data.clientSecret, undefined);
  assert.equal((await getOrderById(id))?.status, "PAYMENT_RECEIVED");

  const legacy = await post({ checkoutDraftKey: undefined });
  assert.equal(legacy.status, 200);
  const proof = { orderId: legacy.data.orderId, viewToken: legacy.data.viewToken };
  const upgraded = await post({ checkoutDraftKey: randomBytes(24).toString("hex"), previousCheckout: proof });
  assert.equal(upgraded.data.orderId, legacy.data.orderId);
  assert.equal(upgraded.data.clientSecret, legacy.data.clientSecret);
  for (const change of [{ previousCheckout: { ...proof, viewToken: "tok_" + "a".repeat(32) } },
    { previousCheckout: proof, handwrittenNote: "Edited legacy note" }]) {
    const result = await post({ checkoutDraftKey: randomBytes(24).toString("hex"), ...change });
    assert.notEqual(result.data.orderId, legacy.data.orderId);
  }

  for (const value of [200, 900]) {
    const code = "TEST" + value;
    await saveDiscountCode({ id: code, code, type: "FIXED_AMOUNT", value, isActive: true, maxUses: 1, usedCount: 0, totalDiscountGivenCents: 0, createdAt: Date.now(), updatedAt: Date.now() });
    const [a, b] = await Promise.all([post({discountCode: code}), post({discountCode: code})]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(a.data.orderId, b.data.orderId); assert.equal(a.data.quoteId, b.data.quoteId);
    assert.equal(a.data.amountInCents, 900 - value); assert.equal(a.data.isFree, value === 900);
    assert.equal((await post({discountCode: code})).data.clientSecret, a.data.clientSecret);
    const holds = await getOfferReservationsCollection().where("orderId", "==", a.data.orderId).get();
    assert.equal(holds.size, 1);
    await getOfferQuotesCollection().doc(a.data.quoteId).update({ expiresAt: Date.now() - 1 });
    assert.equal((await post({discountCode: code})).status, 409);
    const fresh = await post({discountCode: code});
    assert.equal(fresh.status, 200);
    assert.notEqual(fresh.data.quoteId, a.data.quoteId);
  }
  const details = { errorCategory: "validation_error", errorCode: "incomplete_number", message: "private free text", cardNumber: "0000" };
  assert.deepEqual(sanitizeMetadata("payment_failed", details).sanitized, { errorCategory: "validation_error", errorCode: "incomplete_number" });
  assert.equal(sanitizeMetadata("payment_failed", {errorCode: "4242424242424242"}).sanitized.errorCode, undefined);
  console.log("Checkout retries, concurrent starts, ownership, edits, legacy migration, paid orders, offer renewal, and validation codes passed.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
