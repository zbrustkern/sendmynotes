import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as stripeWebhook } from "../app/api/webhooks/stripe/route";
import { firestoreDb, getOrdersCollection, isFirestoreMock, saveDiscountCode } from "../lib/firebase-admin";
import { offerBalanceRef, offerCutoverRef, legacyOfferBaselineRef } from "../lib/offer-balances";
import { getOfferQuotesCollection, getOfferRedemptionsCollection, getOfferReservationsCollection, getOfferVersionsCollection, getActiveOfferReservation, issueOfferPriceQuote, redeemOfferForOrder, reserveOfferForCheckout } from "../lib/offer-engine";
import { reconcileOfferReservations } from "../lib/offer-reconciliation";
import { runLegacyOfferCutover } from "../lib/offer-migration";
import { recordPaymentCaptureFact } from "../lib/financial-ledger";
import { setStripeClientFactoryForTests, type CreateIntentParams } from "../lib/stripe";
import { evaluatePromotion, PROMOTION_SELECTION, PROMOTION_SCHEDULES, type PromotionBasket, type PromotionPolicy } from "../lib/promotions-v2";
import { PROMOTION_CAMPAIGNS, PROMOTION_CODES, PROMOTION_POLICIES, promotionCodeId } from "../lib/promotions-v2-store";
import type { OfferPriceQuoteSnapshot } from "../lib/contracts/admin-overhaul";
import { offerCheckoutFixture } from "./fixtures/offer-checkout";

const virtualTime = Math.floor(Date.now() / 1_000) * 1_000;
const testSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
const testCode = (stem: string) => `${stem}_${testSuffix}`;
async function legacy(code: string, value = 500, maxUses?: number, usedCount = 0) {
  await saveDiscountCode({ id: code, code, isActive: true, type: "FIXED_AMOUNT", value, maxUses, usedCount, totalDiscountGivenCents: usedCount * value, createdAt: virtualTime - 86_400_000, updatedAt: virtualTime - 1 });
}

async function legacyVersion(code: string, value: number, spent = 0, cents = value * spent, perCustomerLimit?: number) {
  await getOfferVersionsCollection().doc(`offer_${code}_v1`).set({
    offerId: `offer_${code}`, code, version: 1, status: "active", discountType: "FIXED_AMOUNT", discountValue: value,
    usedCount: spent, totalDiscountGivenCents: cents, reservedCount: 0, perCustomerLimit,
  });
}

async function migrate() {
  const code = testCode("LEGACY");
  const conflict = testCode("CONFLICT");
  const explicitSender = testCode("SENDER");
  const priorOrderId = `legacy-outstanding-${testSuffix}`;
  const oldFree = testCode("OLDFREE");
  const oldFreeOrderId = `legacy-free-${testSuffix}`;
  await legacy(code, 500, 6, 2);
  await legacyVersion(code, 500, 2);
  await legacy(conflict, 100, 6, 4);
  await legacyVersion(conflict, 100, 3);
  await legacy(explicitSender, 500, 20, 1);
  await legacyVersion(explicitSender, 500, 1, 500, 1);
  const quote = (await issueOfferPriceQuote({ code, nowMs: virtualTime - 120_000 })).quote!;
  await getOrdersCollection().doc(priorOrderId).set({
    id: priorOrderId, stripePaymentId: `pi_${priorOrderId}`, discountCode: code, quoteId: quote.quoteId,
    amountInCents: quote.payableAmountCents, finalAmountInCents: quote.payableAmountCents, discountAmountInCents: 500,
    status: "PENDING_PAYMENT", recipientAddress: { country: "US" },
  });
  const originalId = `res_${priorOrderId}_${code}`;
  await getOfferReservationsCollection().doc(originalId).set({
    reservationId: originalId, orderId: priorOrderId, quoteId: quote.quoteId,
    code, offerId: `offer_${code}`, offerVersion: 1, sessionId: "legacy_checkout_owner",
    status: "active", reservedAt: virtualTime - 120_000, expiresAt: virtualTime + 2_400_000,
  });
  await legacy(oldFree, 900, 1);
  const freeQuote = (await issueOfferPriceQuote({ code: oldFree, nowMs: virtualTime - 120_000 })).quote!;
  await getOrdersCollection().doc(oldFreeOrderId).set({
    id: oldFreeOrderId, discountCode: oldFree, quoteId: freeQuote.quoteId, amountInCents: 0,
    finalAmountInCents: 0, discountAmountInCents: 900, status: "PENDING_PAYMENT", paymentMethod: "PROMO_CODE", recipientAddress: { country: "US" },
  });
  const oldFreeId = `res_${oldFreeOrderId}_${oldFree}`;
  await getOfferReservationsCollection().doc(oldFreeId).set({
    reservationId: oldFreeId, orderId: oldFreeOrderId, quoteId: freeQuote.quoteId,
    code: oldFree, offerId: `offer_${oldFree}`, offerVersion: 1, sessionId: "legacy_checkout_owner",
    status: "active", reservedAt: virtualTime - 120_000, expiresAt: virtualTime + 1_800_000,
  });
  const first = await runLegacyOfferCutover({ writerFenced: true, now: virtualTime });
  assert.equal(first.imported, 2);
  assert(first.isolated >= 1);
  const balance = offerBalanceRef("code", code);
  assert.equal((await balance.get()).data()?.spentUses, 2, "duplicate representations count historical uses once");
  assert.equal((await balance.get()).data()?.spentCents, 1_000);
  assert.equal((await balance.get()).data()?.heldCents, 500);
  assert.equal((await getActiveOfferReservation(priorOrderId))?.reservationId, originalId, "old document ID remains readable");
  assert.equal((await legacyOfferBaselineRef(conflict).get()).data()?.state, "isolated");
  const second = await runLegacyOfferCutover({ writerFenced: true, now: virtualTime, finalize: true });
  assert.equal(second.imported, 0);
  assert.equal(second.seeded, 0);
  assert.deepEqual((await balance.get()).data(), { spentUses: 2, spentCents: 1_000, heldUses: 1, heldCents: 500, spentUnits: 0, heldUnits: 1 });
  const active = await runLegacyOfferCutover({ writerFenced: true, now: virtualTime + 60_000, finalize: true });
  assert.equal(active.state, "active");
  assert.equal((await offerCutoverRef().get()).data()?.cutoverAt, virtualTime);
  return { explicitSender, oldPaid: { orderId: priorOrderId, code, paymentIntentId: `pi_${priorOrderId}`, quoteId: quote.quoteId }, oldFree: { orderId: oldFreeOrderId, code: oldFree } };
}

async function collision(code: string) {
  await legacy(code, 500, 1);
  const quote = (await issueOfferPriceQuote({ code, nowMs: virtualTime })).quote!;
  const attempts = await Promise.all([1, 2].map((i) => reserveOfferForCheckout({
    code, orderId: `${code}_${i}`, sessionId: `race${i}`, nowMs: virtualTime, quoteId: quote.quoteId,
  })));
  assert.equal(attempts.filter((attempt) => attempt.reserved).length, 1);
  assert.equal((await offerBalanceRef("code", code).get()).data()?.heldUses, 1);
}

async function sharedCampaignRace() {
  const campaignId = testCode("SHARED_CAMP");
  const policy: PromotionPolicy = {
    id: `${campaignId}_V1`, campaignId, workflow: "single", scheduleVersion: PROMOTION_SCHEDULES.single,
    countryCodes: ["US"], match: "all", audience: "any", chargeTypes: ["card_base"],
    benefit: { type: "fixed_order", amountCents: 500 }, payableFloor: "reject", selectionStrategy: PROMOTION_SELECTION,
  };
  const campaignRef = firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(campaignId);
  await campaignRef.set({ id: campaignId, revision: 1, policyVersionId: policy.id, status: "active", budgetCents: 500 });
  await firestoreDb.collection(PROMOTION_POLICIES).doc(policy.id).set(policy);
  async function makeHold(number: number, current: PromotionPolicy) {
    const codeId = promotionCodeId(`${testSuffix}CODE${number}`, "public")!;
    const orderId = `campaign-order-${testSuffix}-${number}`;
    await firestoreDb.collection(PROMOTION_CODES).doc(codeId).set({ id: codeId, campaignId, distribution: "public" });
    const basket: PromotionBasket = {
      workflow: "single", scheduleVersion: PROMOTION_SCHEDULES.single, currency: "USD", revision: orderId,
      lines: [{ id: "line", countryCode: "US", productType: "card", components: [{ id: "base", chargeType: "card_base", grossCents: 900, taxPolicyVersion: "included-v1" }] }],
    };
    const evaluation = evaluatePromotion(current, basket, virtualTime);
    const quote: OfferPriceQuoteSnapshot = {
      quoteId: `quote_${orderId}`, offerId: campaignId, offerVersion: number === 3 ? 2 : 1, code: codeId, basePriceCents: 900,
      discountAmountCents: 500, payableAmountCents: 400, issuedAt: virtualTime, expiresAt: virtualTime + 1_800_000, isStale: false, currency: "USD",
      promotion: { basket, evaluation, campaignId, codeId, policyVersionId: current.id },
    };
    await getOfferQuotesCollection().doc(quote.quoteId).set(quote);
    return { quote, orderId };
  }
  const contenders = await Promise.all([makeHold(1, policy), makeHold(2, policy)]);
  const reserve = (entry: typeof contenders[number]) => reserveOfferForCheckout({
    code: entry.quote.code, orderId: entry.orderId, sessionId: entry.orderId, quoteId: entry.quote.quoteId,
    checkoutRevision: entry.orderId, expectedTotalCents: 400, nowMs: virtualTime,
  });
  const result = await Promise.all(contenders.map(reserve));
  assert.equal(result.filter((attempt) => attempt.reserved).length, 1, `independent issued codes share the final $5: ${JSON.stringify(result.map(({reserved,error}) => ({reserved,error})))}`);
  const next = { ...policy, id: `${campaignId}_V2` };
  await firestoreDb.collection(PROMOTION_POLICIES).doc(next.id).set(next);
  await campaignRef.update({ revision: 2, policyVersionId: next.id });
  assert.equal((await reserve(await makeHold(3, next))).reserved, false, "a policy edit cannot reset outstanding campaign use");
  assert.equal((await offerBalanceRef("campaign", campaignId).get()).data()?.heldCents, 500);
  await campaignRef.update({ status: "paused" });
  const accepted = contenders[result.findIndex(({ reserved }) => reserved)];
  const orderId = accepted.orderId;
  const intent = {
    id: `pi_${orderId}`, status: "succeeded", amount: 400, amount_received: 400, currency: "usd", livemode: false,
    metadata: { orderId, quoteId: accepted.quote.quoteId, checkoutRevision: orderId },
  };
  await getOrdersCollection().doc(orderId).set({
    id: orderId, status: "PENDING_PAYMENT", stripePaymentId: intent.id, checkoutRevision: orderId,
    discountCode: accepted.quote.code, quoteId: accepted.quote.quoteId, amountInCents: 400, finalAmountInCents: 400, discountAmountInCents: 500,
    checkoutPrice: { lines: accepted.quote.promotion?.evaluation.lines },
  });
  await recordPaymentCaptureFact({ orderId, paymentIntentId: intent.id, amountCents: 400, currency: "usd", livemode: false });
  const acceptedTerms = await redeemOfferForOrder({
    code: accepted.quote.code, orderId, quoteId: accepted.quote.quoteId, paymentIntent: intent, verifiedCaptureId: intent.id,
    finalAmountCents: 400, discountAmountCents: 500, captureTime: { earliestAt: virtualTime + 10, latestAt: virtualTime + 10 },
    nowMs: virtualTime + 1_850_000,
  });
  assert(acceptedTerms.redeemed, "paused campaign still settles a timely verified capture under the original V2 policy");
  const redemption = (await getOfferRedemptionsCollection().doc(`redemption_${orderId}`).get()).data();
  assert.equal(redemption?.promotion.policyVersionId, policy.id);
  assert.equal((await offerBalanceRef("campaign", campaignId).get()).data()?.spentCents, 500);
}

async function senderCutover(code: string) {
  for (const sender of ["returning-canonical-uid", "new-canonical-uid"]) {
    const fixture = await offerCheckoutFixture({ code, orderId: `${testSuffix}_${sender}`, now: virtualTime, ownerId: sender });
    const outcomes = await Promise.all([redeemOfferForOrder(fixture.redemption), redeemOfferForOrder(fixture.redemption)]);
    assert.equal(outcomes.filter((outcome) => outcome.redeemed && !outcome.duplicate).length, 1);
    const quote = (await issueOfferPriceQuote({ code, nowMs: virtualTime })).quote!;
    assert.equal((await reserveOfferForCheckout({ code, orderId: `retry_${sender}`, sessionId: "different_device", ownerId: sender, quoteId: quote.quoteId, nowMs: virtualTime })).reserved, false);
  }
  assert.equal((await offerBalanceRef("code", code).get()).data()?.spentUses, 3, "two new senders consume once while historical lifetime use is retained");
}

async function reconcile(migrated: Awaited<ReturnType<typeof migrate>>) {
  const quietCode = testCode("QUIET");
  const raceCode = testCode("RACE");
  const lateCode = testCode("LATE");
  await Promise.all([legacy(quietCode), legacy(raceCode), legacy(lateCode)]);
  const quiet = await offerCheckoutFixture({ code: quietCode, orderId: `quiet_${testSuffix}`, now: virtualTime, create: false });
  const race = await offerCheckoutFixture({ code: raceCode, orderId: `race_${testSuffix}`, now: virtualTime });
  const late = await offerCheckoutFixture({ code: lateCode, orderId: `late_${testSuffix}`, now: virtualTime });
  const elapsed = 1_860_000;
  const clock = () => virtualTime + elapsed;
  await legacyVersion(raceCode, 500);
  await getOfferVersionsCollection().doc(`offer_${raceCode}_v1`).update({ status: "paused", discountValue: 750 });
  const oldPayment = {
    id: migrated.oldPaid.paymentIntentId, amount: 400, amount_received: 0, currency: "usd", status: "canceled",
    livemode: false, metadata: { orderId: migrated.oldPaid.orderId, quoteId: migrated.oldPaid.quoteId },
  };
  const lateSettlement = await redeemOfferForOrder({
    ...late.redemption, captureTime: { earliestAt: clock(), latestAt: clock() }, nowMs: clock(),
  });
  assert(!lateSettlement.redeemed, "late capture retains its verified money and held capacity");
  const ref = getOfferReservationsCollection().doc(quiet.held.reservation!.reservationId);
  await ref.update({ lease: { token: "terminated-worker", expiresAt: clock() - 10 }, revision: 7, nextActionAt: clock() - 10 });
  let replays = 0;
  let retrieveRace = 0;
  let dispatches = 0;
  setStripeClientFactoryForTests(() => ({ events: { list: async () => ({
    data: [{ id: "evt_timely_capture", created: (virtualTime + 2_000) / 1_000, type: "payment_intent.succeeded", livemode: false, data: { object: race.paymentIntent } }], has_more: false,
  }) } } as any));
  const deps = {
    mode: "stripe_test" as const, clock,
    create: async (request: CreateIntentParams) => {
      assert.deepEqual(request, quiet.request);
      replays++;
      return { paymentIntentId: quiet.paymentIntent.id, clientSecret: null, isMock: false };
    },
    intents: {
      retrieve: async (id: string) => {
        if (id === quiet.paymentIntent.id) return { ...quiet.paymentIntent, status: "requires_payment_method" };
        if (id === oldPayment.id) return oldPayment;
        if (id === race.paymentIntent.id) return { ...race.paymentIntent, status: ++retrieveRace === 1 ? "requires_action" : "succeeded" };
        if (id === late.paymentIntent.id) return late.paymentIntent;
        throw new Error("expected isolated synthetic intent");
      },
      cancel: async (id: string) => {
        if (id === quiet.paymentIntent.id) return { ...quiet.paymentIntent, status: "canceled" };
        throw new Error("raced capture");
      },
    } as any,
    process: async (orderId: string) => { if (orderId === race.order.id) dispatches++; return { success: true, status: "PAYMENT_RECEIVED" }; },
  };
  try {
    const runs = await Promise.all([reconcileOfferReservations(deps), reconcileOfferReservations(deps)]);
    assert.equal(runs.reduce((sum, run) => sum + run.released, 0), 3, "overlapping cron and expired lease release each confirmed or unpayable hold once");
    assert.equal(runs.reduce((sum, run) => sum + run.settled, 0), 1, "timely capture wins provider cancellation race");
    assert.equal(replays, 1, "missing binding was reconciled through the original idempotent request");
    assert.equal((await offerBalanceRef("code", quietCode).get()).data()?.heldCents, 0, "quiet expired promotion recovers without another checkout");
    assert.equal((await offerBalanceRef("code", raceCode).get()).data()?.spentCents, 500, "an edited and paused offer settles its timely capture under its frozen terms");
    assert.equal((await offerBalanceRef("code", migrated.oldPaid.code).get()).data()?.heldCents, 0, "provider evidence released a migrated hold with no legacy paymentMode");
    assert.equal((await offerBalanceRef("code", migrated.oldFree.code).get()).data()?.heldCents, 0, "unbound migrated $0 order was provably unpayable");
    assert.equal((await offerBalanceRef("code", lateCode).get()).data()?.heldCents, 500);
    assert(!(await getOfferRedemptionsCollection().doc(`redemption_${late.order.id}`).get()).exists);
    await reconcileOfferReservations(deps);
    assert.equal(dispatches, 1, "a durable follow-up drives completion after a worker stops immediately after settlement");
  } finally {
    setStripeClientFactoryForTests(null);
  }
}

async function partialRefunds() {
  const orderId = `refund_order_${testSuffix}`;
  const paymentIntentId = `pi_${orderId}`;
  const parent = getOrdersCollection().doc(orderId);
  await parent.set({
    id: orderId, stripePaymentId: paymentIntentId, amountInCents: 1_500, finalAmountInCents: 1_500, status: "QUEUED_FOR_FULFILLMENT",
    multiSend: { kind: "parent", recipients: [{ id: "first", amountInCents: 750 }, { id: "second", amountInCents: 750 }] },
  });
  await getOfferRedemptionsCollection().doc(`redemption_${orderId}`).set({ orderId, refunded: false, totalCents: 1_500 });
  for (const recipientId of ["first", "second"]) {
    await parent.collection("deliveries").doc(recipientId).set({ parentOrderId: orderId, recipientId, amountInCents: 750, state: "REJECTED", stateVersion: 1 });
  }
  await recordPaymentCaptureFact({ orderId, paymentIntentId, amountCents: 1_500, currency: "usd", livemode: false });
  const knownBypass = process.env.TEST_BYPASS_WEBHOOK_SIGNATURE;
  process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = "true";
  try {
    const post = async (recipientId: string, replay: boolean) => {
      const id = `re_${orderId}_${recipientId}`;
      const body = JSON.stringify({
        id: `evt_${id}_${replay ? "replay" : "original"}`,
        type: replay ? "refund.updated" : "refund.created",
        livemode: false, created: virtualTime / 1_000,
        data: { object: { id, payment_intent: paymentIntentId, charge: `ch_${orderId}`, amount: 750,
          currency: "usd", status: "succeeded", created: virtualTime / 1_000, metadata: { orderId, recipientId } } },
      });
      const response = await stripeWebhook(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body }));
      assert.equal(response.status, 200, await response.text());
    };
    await Promise.all(["first", "second"].map((recipientId) => post(recipientId, false)));
    await Promise.all(["first", "second"].map((recipientId) => post(recipientId, true)));
    for (const recipientId of ["first", "second"]) {
      assert((await firestoreDb.collection("financial_facts").doc(`fact_ref_re_${orderId}_${recipientId}`).get()).exists);
    }
  } finally {
    if (knownBypass === undefined) delete process.env.TEST_BYPASS_WEBHOOK_SIGNATURE;
    else process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = knownBypass;
  }
  assert.equal((await parent.get()).data()?.refundSettledCents, 1_500);
  for (const recipientId of ["first", "second"]) {
    assert.equal((await parent.collection("deliveries").doc(recipientId).get()).data()?.refundSettledCents, 750);
  }
  const redemption = (await getOfferRedemptionsCollection().doc(`redemption_${orderId}`).get()).data();
  assert.equal(redemption?.refundAmountCents, 1_500);
  assert.equal(redemption?.refundRestoredUsage, false);
}

async function main() {
  if (!isFirestoreMock) {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
    assert.match(process.env.FIREBASE_PROJECT_ID ?? "", /^demo-sprint33/);
  }
  const migration = await migrate();
  await collision(testCode("LAST_USE"));
  await sharedCampaignRace();
  await senderCutover(migration.explicitSender);
  await reconcile(migration);
  await partialRefunds();
  console.log(`Promotion reservation and settlement passed (${isFirestoreMock ? "application mock" : "Firestore emulator"}).`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
