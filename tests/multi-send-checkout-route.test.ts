import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../app/api/checkout/create-intent/route";
import { firestoreDb, getOrderById, saveDiscountCode } from "../lib/firebase-admin";
import { setStripeClientFactoryForTests } from "../lib/stripe";
import { multiSendCheckoutOwnerKey, verifyMultiSendCheckoutOwner } from "../lib/multi-send/checkout";
import { getOfferQuotesCollection, getOfferReservationsCollection } from "../lib/offer-engine";
import { FEATURE_FLAG_KEYS, updateFeatureFlag } from "../lib/feature-flags";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

const checkoutId = "123e4567-e89b-42d3-a456-426614174000";
const address = { firstName: "Maya", lastName: "Jones", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" };
const payload: any = {
  multiSend: { version: 1, checkoutId, note: { salutation: "Dear Friends,", text: "Thinking of you.", signOff: "Love, Sam", style: "hwDavid" }, recipients: [
    { id: "recipient_1", address, greeting: { mode: "inherit" } },
    { id: "recipient_2", address: { ...address, firstName: "Lee" }, greeting: { mode: "custom", text: "Dear Lee," }, householdAcknowledgedWith: [{ id: "recipient_1", addressKey: "1 main st||chicago|il|60601|us" }] },
  ] },
  frontImageUrl: "https://assets.example.invalid/card.png",
  returnAddress: { firstName: "Sam", lastName: "Sender", street1: "2 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
  handwrittenNote: "Dear Friends,\n\nThinking of you.\n\nLove, Sam", sessionId: "multi-send-test-session",
};

function request(body: unknown, cookie?: string) {
  return new NextRequest("http://localhost:3000/api/checkout/create-intent", {
    method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
}
function guestCookie(response: Response, id: string): string {
  const value = response.headers.get("set-cookie") || "";
  const match = value.match(new RegExp(`smn_multi_send_${id}=([^;]+)`));
  assert.ok(match, "server returns an HttpOnly guest checkout capability cookie");
  return `smn_multi_send_${id}=${match[1]}`;
}

async function run() {
await withSafeTestHarness(async () => {
  const env = process.env as Record<string, string | undefined>;
  const oldFlag = await (async () => { try { const { getFeatureFlags } = await import("../lib/feature-flags"); return (await getFeatureFlags()).multiSendEnabled; } catch { return false; } })();
  await updateFeatureFlag(FEATURE_FLAG_KEYS.MULTI_SEND, false);
  const disabled = await POST(request(payload));
  assert.equal(disabled.status, 503, "server feature flag blocks request before quote/order writes");
  await updateFeatureFlag(FEATURE_FLAG_KEYS.MULTI_SEND, true);
  env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "";

  const ownedCheckout = "123e4567-e89b-42d3-a456-426614174099";
  const ownedGroupId = crypto.createHash("sha256").update(ownedCheckout).digest("hex");
  const ownerKey = multiSendCheckoutOwnerKey({ checkoutId: ownedCheckout, userId: "verified-account-one" });
  await firestoreDb.collection("multi_send_checkout_groups").doc(ownedGroupId).set({ ownerKey, currentOrderId: "owned-order", state: "active", updatedAt: Date.now() });
  assert.equal(await verifyMultiSendCheckoutOwner(ownedCheckout, ownerKey, "owned-order"), true);
  assert.equal(await verifyMultiSendCheckoutOwner(ownedCheckout, multiSendCheckoutOwnerKey({ checkoutId: ownedCheckout, userId: "verified-account-two" }), "owned-order"), false, "different authenticated account cannot use another account's group");

  const created = await POST(request(payload));
  assert.equal(created.status, 200);
  const cookie = guestCookie(created, checkoutId);
  const first = await created.json();
  const order = await getOrderById(first.orderId);
  assert.equal(order?.amountInCents, 1800, "quantity quote charges one $9 card per recipient");
  assert.equal(order?.multiSend?.recipients[0].printedMessage, "Dear Friends,\n\nThinking of you.\n\nLove, Sam");
  assert.equal(order?.multiSend?.recipients[1].printedMessage, "Dear Lee,\n\nThinking of you.\n\nLove, Sam");
  assert.equal(order?.multiSend?.manifestComplete, false, "manifest remains unprepared until verified paid worker path");

  assert.equal((await POST(request(payload))).status, 403, "knowing checkoutId alone does not authorize guest access");
  const retry = await POST(request(payload, cookie));
  assert.equal(retry.status, 200);
  const second = await retry.json();
  assert.equal(second.orderId, first.orderId, "identical request reuses immutable parent ID");
  assert.equal(second.paymentIntentId, first.paymentIntentId, "identical retry reuses the same idempotent payment intent");
  const concurrentRetries = await Promise.all([POST(request(payload, cookie)), POST(request(payload, cookie))]);
  assert.equal(concurrentRetries.filter((response) => response.status === 200).length, 1, "retry fence serializes stored PaymentIntent retrieval against edits");
  assert.equal(concurrentRetries.filter((response) => response.status !== 200).length, 1, "parallel retry fails closed while the retrieval fence is held");

  const changed = structuredClone(payload);
  changed.multiSend.recipients[1].greeting = { mode: "custom", text: "Dear Lee and Pat," };
  const changedResult = await POST(request(changed, cookie));
  assert.notEqual(changedResult.status, 200, "current checkout ID cannot silently replace an immutable snapshot");
  changed.replaces = { orderId: first.orderId, viewToken: first.viewToken };
  const replaced = await POST(request(changed, cookie));
  assert.equal(replaced.status, 200, "owner can replace a pending snapshot with its prior order capability");
  const replacement = await replaced.json();
  assert.notEqual(replacement.orderId, first.orderId, "a changed greeting receives a distinct immutable order snapshot");
  assert.equal((await getOrderById(first.orderId))?.status, "FAILED", "previous unpaid parent is retired before replacement");

  const invalidCountry = structuredClone(payload);
  invalidCountry.multiSend.recipients[1].address.country = "CA";
  assert.equal((await POST(request(invalidCountry, cookie))).status, 400, "recipient country is validated instead of overwritten");
  const tooLong = structuredClone(payload);
  tooLong.multiSend.recipients[1].greeting = { mode: "custom", text: "x".repeat(451) };
  assert.equal((await POST(request(tooLong, cookie))).status, 400, "server validates complete resolved message length before creating an intent");
  const duplicate = structuredClone(payload);
  duplicate.multiSend.recipients[1].address.firstName = "Maya";
  duplicate.multiSend.recipients[1].address.lastName = "Jones";
  assert.equal((await POST(request(duplicate, cookie))).status, 400, "exact duplicate recipients are rejected");

  const offerCode = `MULTI180_${Date.now()}`;
  await saveDiscountCode({ id: offerCode, code: offerCode, type: "FIXED_AMOUNT", value: 180, isActive: true, usedCount: 0, totalDiscountGivenCents: 0, createdAt: Date.now(), updatedAt: Date.now() });
  const offered = structuredClone(payload);
  offered.multiSend.checkoutId = "123e4567-e89b-42d3-a456-426614174009";
  offered.multiSend.recipients.push({ id: "recipient_3", address: { ...address, firstName: "Nia", street1: "3 Main St" }, greeting: { mode: "inherit" } });
  offered.discountCode = offerCode;
  const offerResponse = await POST(request(offered));
  assert.equal(offerResponse.status, 200);
  const offerBody = await offerResponse.json();
  assert.equal(offerBody.quote.basePriceCents, 2700);
  assert.equal(offerBody.quote.discountCents, 180, "discount applies once to the parent quote");
  assert.equal(offerBody.amountInCents, 2520, "three cards at $9 less a $1.80 offer benefit total $25.20");

  const limitedCode = `MULTI_LIMIT_${Date.now()}`;
  await saveDiscountCode({ id: limitedCode, code: limitedCode, type: "FIXED_AMOUNT", value: 900, maxUses: 1, isActive: true, usedCount: 0, totalDiscountGivenCents: 0, createdAt: Date.now(), updatedAt: Date.now() });
  const limited = structuredClone(payload);
  limited.multiSend.checkoutId = "123e4567-e89b-42d3-a456-426614174011";
  limited.discountCode = limitedCode;
  const limitedCreate = await POST(request(limited));
  assert.equal(limitedCreate.status, 200);
  const limitedFirst = await limitedCreate.json();
  const limitedCookie = guestCookie(limitedCreate, limited.multiSend.checkoutId);
  const limitedEdit = structuredClone(limited);
  limitedEdit.multiSend.recipients[1].greeting = { mode: "custom", text: "Same price, new greeting" };
  limitedEdit.replaces = { orderId: limitedFirst.orderId, viewToken: limitedFirst.viewToken };
  const limitedReplacement = await POST(request(limitedEdit, limitedCookie));
  assert.equal(limitedReplacement.status, 200, "same limited offer hold transfers to the revised snapshot");
  const limitedSecond = await limitedReplacement.json();
  assert.equal(limitedSecond.amountInCents, limitedFirst.amountInCents);
  const oldHold = await getOfferReservationsCollection().doc(`res_${limitedFirst.orderId}_${limitedCode}`).get();
  const newHold = await getOfferReservationsCollection().doc(`res_${limitedSecond.orderId}_${limitedCode}`).get();
  assert.equal(oldHold.data()?.status, "released", "old reservation is retired during atomic hold handoff");
  assert.equal(newHold.data()?.status, "active", "replacement retains the one-use hold");

  await getOfferQuotesCollection().doc((await getOrderById(limitedSecond.orderId))?.quoteId || "").update({ expiresAt: Date.now() - 1 });
  const expiredRetry = await POST(request(limitedEdit, limitedCookie));
  assert.equal(expiredRetry.status, 409, "exact retry cannot resume an expired offer quote");
  assert.equal((await getOrderById(limitedSecond.orderId))?.status, "FAILED", "expired quote closes the stored unpaid order");
  assert.equal((await getOfferReservationsCollection().doc(`res_${limitedSecond.orderId}_${limitedCode}`).get()).data()?.status, "released", "expired quote releases its offer hold");

  const concurrentPayload = structuredClone(payload);
  concurrentPayload.multiSend.checkoutId = "123e4567-e89b-42d3-a456-426614174001";
  const concurrent = await Promise.all([POST(request(concurrentPayload)), POST(request(concurrentPayload))]);
  assert.equal(concurrent.filter((response) => response.status === 200).length, 1, "concurrent first requests produce only one payable parent");
  assert.equal(concurrent.filter((response) => response.status !== 200).length, 1, "racing guest request fails closed until capability cookie is established");

  const revisionPayload = structuredClone(payload);
  revisionPayload.multiSend.checkoutId = "123e4567-e89b-42d3-a456-426614174010";
  const revisionStart = await POST(request(revisionPayload));
  const revisionStartBody = await revisionStart.json();
  const revisionCookie = guestCookie(revisionStart, revisionPayload.multiSend.checkoutId);
  const revisionA = structuredClone(revisionPayload);
  revisionA.multiSend.recipients[1].greeting = { mode: "custom", text: "Revision A" };
  revisionA.replaces = { orderId: revisionStartBody.orderId, viewToken: revisionStartBody.viewToken };
  const revisionB = structuredClone(revisionPayload);
  revisionB.multiSend.recipients[1].greeting = { mode: "custom", text: "Revision B" };
  revisionB.replaces = { orderId: revisionStartBody.orderId, viewToken: revisionStartBody.viewToken };
  const competingRevisions = await Promise.all([POST(request(revisionA, revisionCookie)), POST(request(revisionB, revisionCookie))]);
  assert.equal(competingRevisions.filter((response) => response.status === 200).length, 1, "only one racing edited revision can become payable");
  assert.equal(competingRevisions.filter((response) => response.status !== 200).length, 1, "competing edit fails closed while replacement is claimed");

  const offeredCookie = guestCookie(offerResponse, offered.multiSend.checkoutId);
  await firestoreDb.collection("offer_reservations").doc(`res_${offerBody.orderId}_${offerCode}`).update({ status: "released" });
  const releasedRetry = await POST(request(offered, offeredCookie));
  assert.equal(releasedRetry.status, 409, "released offer hold cannot activate a saved payable intent");
  assert.equal((await getOrderById(offerBody.orderId))?.status, "FAILED");

  async function stripeScenario(id: string, options: { priorStatus?: string; cancelFails?: boolean; corrupt?: "amount" | "currency" | "revision" | "mode" } = {}) {
    const registry = new Map<string, any>();
    let createCount = 0;
    let retrieveCount = 0;
    let cancelCount = 0;
    const fake: any = { paymentIntents: {
      create: async (params: any) => {
        createCount++;
        const pi = { id: `pi_fake_${id}_${createCount}`, client_secret: `secret_${createCount}`, status: "requires_payment_method", amount: params.amount, currency: params.currency, metadata: { ...params.metadata } };
        registry.set(pi.id, pi);
        return pi;
      },
      retrieve: async (piId: string) => {
        retrieveCount++;
        const pi = registry.get(piId);
        if (!pi) throw new Error("fake PI missing");
        if (options.corrupt) {
          const copy = { ...pi, metadata: { ...pi.metadata } };
          if (options.corrupt === "amount") copy.amount++;
          if (options.corrupt === "currency") copy.currency = "eur";
          if (options.corrupt === "revision") copy.metadata.contentRevision = "wrong";
          if (options.corrupt === "mode") copy.livemode = true;
          return copy;
        }
        return { ...pi, status: retrieveCount > 1 ? (options.priorStatus || pi.status) : pi.status };
      },
      cancel: async (piId: string) => {
        cancelCount++;
        if (options.cancelFails) throw new Error("injected cancellation failure");
        const pi = registry.get(piId); pi.status = "canceled"; return pi;
      },
    } };
    setStripeClientFactoryForTests(() => fake);
    env.STRIPE_PAYMENT_MODE = "stripe_test";
    env.STRIPE_SECRET_KEY = "sk_test_fake_checkout";
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fake_checkout";
    const scenarioPayload = structuredClone(payload);
    scenarioPayload.multiSend.checkoutId = id;
    const firstResponse = await POST(request(scenarioPayload));
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    const scenarioCookie = guestCookie(firstResponse, id);
    const initialCreates = createCount;
    const exactResponse = await POST(request(scenarioPayload, scenarioCookie));
    if (options.corrupt) {
      assert.equal(exactResponse.status, 409, `mismatched ${options.corrupt} from stored intent fails closed`);
      assert.equal(createCount, initialCreates);
      return { response: exactResponse, createCount, before: initialCreates, retrieveCount, cancelCount, orderId: firstBody.orderId };
    }
    assert.equal(exactResponse.status, 200, `stored Stripe intent supports exact retry (${JSON.stringify(await exactResponse.clone().json())})`);
    assert.equal(createCount, initialCreates, "exact retry retrieves stored intent without creating another PI");
    const revised = structuredClone(scenarioPayload);
    revised.multiSend.recipients[1].greeting = { mode: "custom", text: "A revised greeting" };
    revised.replaces = { orderId: firstBody.orderId, viewToken: firstBody.viewToken };
    const before = createCount;
    const revisedResponse = await POST(request(revised, scenarioCookie));
    return { response: revisedResponse, createCount, before, retrieveCount, cancelCount, orderId: firstBody.orderId };
  }
  const cancelFailure = await stripeScenario("123e4567-e89b-42d3-a456-426614174002", { cancelFails: true });
  assert.equal(cancelFailure.response.status, 500, "provider cancellation failure does not create a replacement");
  assert.equal(cancelFailure.createCount, cancelFailure.before);
  assert.equal(cancelFailure.cancelCount, 1);
  const processing = await stripeScenario("123e4567-e89b-42d3-a456-426614174003", { priorStatus: "processing" });
  assert.equal(processing.response.status, 409, "processing intent blocks replacement");
  assert.equal(processing.createCount, processing.before);
  const processingBody = await processing.response.json();
  assert.equal(processingBody.orderId, processing.orderId, "late/processing payment response identifies the authorized frozen order");
  assert.match(processingBody.orderPath, /^\/order\/order_.*\?token=tok_/);
  const succeeded = await stripeScenario("123e4567-e89b-42d3-a456-426614174004", { priorStatus: "succeeded" });
  assert.equal(succeeded.response.status, 409, "late successful intent blocks replacement for reconciliation");
  assert.equal(succeeded.createCount, succeeded.before);
  assert.equal((await succeeded.response.json()).orderId, succeeded.orderId, "successful prior payment provides its order identity for reopening");
  for (const [suffix, corrupt] of [["5", "amount"], ["6", "currency"], ["7", "revision"], ["8", "mode"]] as const) {
    const mismatched = await stripeScenario(`123e4567-e89b-42d3-a456-42661417400${suffix}`, { corrupt });
    assert.equal(mismatched.response.status, 409, `mismatched ${corrupt} from stored intent fails closed`);
    assert.equal(mismatched.createCount, mismatched.before);
  }
  setStripeClientFactoryForTests(null);
  await updateFeatureFlag(FEATURE_FLAG_KEYS.MULTI_SEND, oldFlag);
});
}

run().then(() => console.log("multi-send checkout route passed"));
