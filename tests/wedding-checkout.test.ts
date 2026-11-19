import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import { quoteWeddingBatch } from "../lib/wedding-pricing";
import {
  priceWeddingSelection,
  type WeddingTaxCalculator,
} from "../lib/wedding/finance";
import {
  newWeddingHousehold,
  weddingApprovalFingerprint,
  type WeddingActor,
  type WeddingProject,
} from "../lib/wedding/domain";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SMN_TEST_DATA_DIR:
      process.env.SMN_TEST_DATA_DIR ||
      mkdtempSync(join(tmpdir(), "wedding-finance-")),
    WEDDING_CHECKOUT_ENABLED: "true",
    PROMOTION_WEDDING_CHECKOUT_READY: "true",
    STAGING_REVIEW_ONLY: "true",
    INTERNATIONAL_MAILING_PREVIEW: "true",
    STRIPE_SECRET_KEY: "sk_test_wedding_fixture",
    STRIPE_PUBLISHABLE_KEY: "pk_test_wedding_fixture",
  });
  const { firestoreDb: db, isFirestoreMock } = await import(
    "../lib/firebase-admin"
  );
  assert.ok(isFirestoreMock, "Use the isolated Firestore fixture.");
  await db.collection("offer_migrations").doc("sprint_0033").set({ state: "active", cutoverAt: Date.now() });
  const { getStripeClient, setStripeClientFactoryForTests } = await import("../lib/stripe");
  const { NextRequest } = await import("next/server");
  const { POST: receiveStripeEvent } = await import("../app/api/webhooks/stripe/route");
  const localSecret = randomBytes(32).toString("hex");
  process.env.STRIPE_WEBHOOK_SECRET = localSecret;
  for (const bypass of [false, true]) {
    process.env.TEST_BYPASS_WEBHOOK_SIGNATURE = String(bypass);
    const event = { id: "evt_" + randomUUID(), type: "customer.created", livemode: false, data: { object: { id: "cus_fixture" } } };
    const payload = JSON.stringify(event);
    const signature = getStripeClient().webhooks.generateTestHeaderString({ payload, secret: localSecret });
    const response = await receiveStripeEvent(new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST", body: payload, headers: bypass ? {} : { "stripe-signature": signature },
    }));
    assert.equal(response.status, 200);
    const row = (await db.collection("provider_webhook_inbox").doc("inbox_stripe_" + event.id).get()).data();
    assert.ok(row, "Stripe event must have a durable inbox receipt.");
    assert.equal(row.payloadSummary.signatureVerified, !bypass);
    assert.equal(row.payloadSummary.eventId, event.id);
    assert.equal(row.eventType, event.type);
  }
  delete process.env.TEST_BYPASS_WEBHOOK_SIGNATURE;
  const C = await import("../lib/wedding/checkout"),
    R = await import("../lib/wedding/refunds");
  const intents = new Map<string, Stripe.PaymentIntent>(),
    intentKeys = new Map<string, string>();
  const refunds = new Map<string, Stripe.Refund>();
  let paidCalls = 0,
    refundCalls = 0;
  const sdk = {
    paymentIntents: {
      create: async (
        p: Stripe.PaymentIntentCreateParams,
        r: { idempotencyKey: string },
      ) => {
        const known = intentKeys.get(r.idempotencyKey);
        if (known) return intents.get(known);
        const id = "pi_test_" + ++paidCalls;
        const pi = {
          id,
          client_secret: "simulated",
          amount: p.amount,
          currency: p.currency,
          status: "requires_payment_method",
          amount_received: 0,
          livemode: false,
          metadata: p.metadata,
        } as Stripe.PaymentIntent;
        intentKeys.set(r.idempotencyKey, id);
        intents.set(id, pi);
        return pi;
      },
      retrieve: async (id: string) => {
        assert.ok(intents.has(id));
        return intents.get(id);
      },
      cancel: async (id: string) => {
        const pi = intents.get(id)!;
        if (pi.status === "succeeded") throw Error("Already captured.");
        pi.status = "canceled";
        return pi;
      },
    },
    refunds: {
      create: async (
        p: Stripe.RefundCreateParams,
        r: { idempotencyKey: string },
      ) => {
        if (!refunds.has(r.idempotencyKey))
          refunds.set(r.idempotencyKey, {
            id: "re_test_" + ++refundCalls,
            currency: "usd",
            status: "succeeded",
            amount: p.amount,
            payment_intent: p.payment_intent,
            charge: "ch_test",
            metadata: p.metadata,
          } as Stripe.Refund);
        return refunds.get(r.idempotencyKey);
      },
      retrieve: async (id: string) =>
        [...refunds.values()].find((r) => r.id === id),
    },
  };
  setStripeClientFactoryForTests(() => sdk as unknown as Stripe);
  try {
    for (const [count, expected] of [
      [0, 0],
      [1, 900],
      [10, 9000],
      [11, 9750],
      [25, 20250],
      [26, 20950],
      [50, 37750],
      [98, 71350],
      [99, 72050],
      [100, 72700],
      [101, 73350],
    ])
      assert.equal(quoteWeddingBatch(count).subtotalCents, expected);
    for (let paid = 0; paid <= 220; paid++)
      assert.equal(
        quoteWeddingBatch(21, paid).subtotalCents +
          quoteWeddingBatch(paid).subtotalCents,
        quoteWeddingBatch(paid + 21).subtotalCents,
      );
    assert.throws(() =>
      C.readSelection([
        { id: "x", revision: 1 },
        { id: "x", revision: 1 },
      ]),
    );
    assert.throws(() =>
      C.readSelection(
        Array.from({ length: 101 }, (_, i) => ({ id: "h" + i, revision: 1 })),
      ),
    );
    const inputs = [
      {
        id: "h",
        country: "US",
        postal: "02108",
        region: "MA",
        revision: 1,
        contentHash: "synthetic",
      },
    ];
    for (const mode of ["inclusive", "added"] as const) {
      const tax: WeddingTaxCalculator = {
        policy: {
          version: "synthetic",
          provider: "fixture",
          mode,
          calculation: "calculated",
        },
        calculate: (rows) =>
          rows.map((r) => ({
            includedTaxCents:
              mode === "inclusive"
                ? r.baseCents - Math.round(r.baseCents / 1.1)
                : 0,
            addedTaxCents: mode === "added" ? Math.round(r.baseCents * 0.1) : 0,
            calculationRef: "fixture",
            expiresAt: null,
          })),
      };
      const q = priceWeddingSelection("p", 0, inputs, tax);
      assert.equal(q.includedTaxCents, mode === "inclusive" ? 82 : 0);
      assert.equal(q.totalCents, mode === "inclusive" ? 900 : 990);
    }
    async function setup(count: number, mixed = false) {
      const id = "p_" + randomUUID(),
        ref = db.collection("weddingProjects").doc(id),
        sessionId = randomUUID();
      const actor: WeddingActor = {
        projectId: id,
        actorId: "owner",
        role: "owner",
        verified: false,
        pilot: true,
        sessionId,
      };
      const address = {
        address1: "11 Sample Lane",
        address2: "",
        city: "Example",
        state: "MA",
        country: "US",
        zip: "02108",
      };
      const project: WeddingProject = {
        id,
        ownerId: "owner",
        revision: 1,
        sharedBody: "Thank you for thinking of us.",
        signOff: "With love,\nSam and Alex",
        handwriting: "fixture",
        cover: { kind: "preset", id: "fixture", url: "/fixture.png" },
        returnAddress: { ...address, firstName: "Sam and Alex", lastName: "" },
        templates: [],
        purchasedCount: 0,
        activeBatchId: null,
        householdCount: count,
        writingMode: "shared",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        claimedAt: null,
        expiresAt: Date.now() + 86400000,
      };
      await ref.set(project);
      await ref
        .collection("members")
        .doc("owner")
        .set({ id: "owner", uid: null, role: "owner", revoked: false });
      await db
        .collection("weddingSessions")
        .doc(sessionId)
        .set({
          projectId: id,
          actorId: "owner",
          expiresAt: Date.now() + 86400000,
          revoked: false,
        });
      const sel = [];
      for (let n = 1; n <= count; n++) {
        const hid = "H" + String(n).padStart(3, "0"),
          row = newWeddingHousehold(hid);
        Object.assign(row, {
          insideNameConfirmed: true,
          identityConfirmed: true,
          insideName: "Friend " + n,
          envelopeName: "Household " + n,
          firstName: "Household " + n,
          address:
            mixed && [1, 2, 99].includes(n)
              ? { ...address, country: "CA", state: "ON", zip: "K1A 0B1" }
              : address,
          addressConfirmed: true,
        });
        row.approvedFingerprint = weddingApprovalFingerprint(project, row);
        await ref.collection("households").doc(hid).set(row);
        sel.push({ id: hid, revision: 1 });
      }
      return { actor, ref, sel };
    }
    async function reserve(
      actor: WeddingActor,
      sel: Array<{ id: string; revision: number }>,
      code?: string,
    ) {
      const { quote } = await C.quoteWeddingSelection(actor, sel, undefined, code);
      await assert.rejects(
        C.quoteWeddingSelection(actor, sel, "changed", code),
        /changed/,
      );
      const results = await Promise.all([
        C.quoteWeddingSelection(actor, sel, quote.id, code),
        C.quoteWeddingSelection(actor, sel, quote.id, code),
      ]);
      const batchId = "batchId" in results[0] ? results[0].batchId : "";
      assert.ok(batchId);
      assert.deepEqual(results[0], results[1]);
      let result = await C.getWeddingBatch(actor, batchId),
        steps = 0;
      while (result.status === "preparing") {
        const prev = result.preparedCount;
        result = await C.advanceWeddingPreparation(actor, batchId);
        assert.ok(result.preparedCount - prev <= 20);
        steps++;
      }
      assert.equal(steps, Math.ceil(sel.length / 20));
      for (let i = 0; i < 2; i++) await C.issueWeddingIntent(actor, batchId);
      assert.equal(
        [...intents.values()].filter(
          (pi) => pi.metadata.weddingBatchId === batchId,
        ).length,
        1,
      );
      const batch = (await C.weddingBatchRef(batchId).get()).data()!;
      return { quote, batchId, pi: intents.get(batch.paymentIntentId)! };
    }
    const receipts = [];
    // A small project should complete after one scheduler pass while the larger
    // one still has work. Neither job has a live dispatcher or physical-mail path.
    {
      const large = await setup(100),
        small = await setup(1);
      const captures = await Promise.all([
        reserve(large.actor, large.sel),
        reserve(small.actor, small.sel),
      ]);
      for (const x of captures) {
        x.pi.status = "succeeded";
        x.pi.amount_received = x.pi.amount;
        await C.settleWeddingIntent(x.pi);
      }
      await C.runWeddingReconciliation();
      assert.equal(
        (await C.getWeddingBatch(small.actor, captures[1].batchId))
          .completedCount,
        1,
      );
      assert.equal(
        (await C.getWeddingBatch(large.actor, captures[0].batchId))
          .completedCount,
        20,
      );
      const scenario = captures[0],
        line = scenario.quote.lines[0];
      const card = await C.getPaidWeddingCard(
        large.actor,
        scenario.batchId,
        line.householdId,
      );
      await large.ref.update({
        sharedBody: "Newest wording",
        cover: { kind: "preset", id: "replacement", url: "/replacement.png" },
      });
      const historic = await C.getPaidWeddingCard(
        large.actor,
        scenario.batchId,
        line.householdId,
      );
      assert.deepEqual(historic, card);
      assert.ok(!JSON.stringify(historic).includes("masterKey"));
    }
    async function seedWeddingCredit(actor: WeddingActor, code: string) {
      const { promotionCodeId } = await import("../lib/promotions-v2-store");
      const { PROMOTION_SELECTION, PROMOTION_SCHEDULES } = await import("../lib/promotions-v2");
      const id = "project_credit_" + actor.projectId;
      const codeId = promotionCodeId(code, "private")!;
      const policyId = id + "_1";
      await db.collection("promotion_campaigns").doc(id).set({ id, status: "active", policyVersionId: policyId, budgetCents: 2500 });
      await db.collection("promotion_issued_codes").doc(codeId).set({ id: codeId, campaignId: id, distribution: "private" });
      await db.collection("promotion_policy_versions").doc(policyId).set({
        id: policyId, campaignId: id, workflow: "wedding", scheduleVersion: PROMOTION_SCHEDULES.wedding, audience: "project", projectId: actor.projectId,
        countryCodes: ["US","CA"], match: "matching", chargeTypes: ["card_base"], benefit: { type: "fixed_unit", amountCents: 100 },
        maxUnitsPerProject: 25, payableFloor: "reject", selectionStrategy: PROMOTION_SELECTION,
      });
      return id;
    }
    {
      const { actor, ref, sel } = await setup(50, false);
      const code = "PROJECT-25";
      const id = await seedWeddingCredit(actor, code);
      const { promotionUsageRef } = await import("../lib/promotions-v2-store");
      const foreign = await setup(1, false);
      await assert.rejects(C.quoteWeddingSelection(foreign.actor,foreign.sel,undefined,code), /unavailable/);
      const sample = await C.quoteWeddingSelection(actor,sel,undefined,code);
      assert.equal(sample.quote.totalCents, 35250);
      const one = await reserve(actor,sel.slice(0,20),code);
      assert.equal(one.quote.totalCents,14500);
      one.pi.status="succeeded"; one.pi.amount_received=one.pi.amount;
      await C.settleWeddingIntent(one.pi);
      await C.settleWeddingIntent(one.pi);
      const two = await reserve(actor,sel.slice(20),code);
      assert.equal(two.quote.totalCents,20750);
      two.pi.status="succeeded"; two.pi.amount_received=two.pi.amount;
      await C.settleWeddingIntent(two.pi);
      assert.equal((await ref.get()).data()?.purchasedCount,50);
      const balance = (await promotionUsageRef("campaign",id).get()).data();
      assert.equal(balance?.spentCents,2500);
      assert.equal(balance?.heldCents,0);
      assert.equal(balance?.spentUnits,25);
    }
    for (const mixed of [false, true]) {
      const { actor, ref, sel } = await setup(100, mixed);
      const code = mixed ? "MIXED-25" : undefined;
      if (code) await seedWeddingCredit(actor, code);
      const first = await reserve(actor, sel.slice(0, 98),code);
      assert.equal(first.quote.totalCents, mixed ? 69850 : 71350);
      assert.equal(first.quote.includedTaxCents, null);
      first.pi.status = "succeeded";
      first.pi.amount_received = first.pi.amount;
      await assert.rejects(
        C.settleWeddingIntent({
          ...first.pi,
          amount_received: first.pi.amount - 1,
        }),
        /full/,
      );
      await Promise.all([
        C.settleWeddingIntent(first.pi),
        C.settleWeddingIntent(first.pi),
      ]);
      const second = await reserve(actor, sel.slice(98));
      assert.equal(second.quote.totalCents, mixed ? 1850 : 1350);
      assert.equal(second.quote.lines[0].totalCents, mixed ? 1200 : 700);
      second.pi.status = "succeeded";
      second.pi.amount_received = second.pi.amount;
      // Simulate closing the browser and missing the first webhook.
      await C.weddingBatchRef(second.batchId).update({ dueAt: Date.now() - 1 });
      for (let pass = 0; pass < 8; pass++) await C.runWeddingReconciliation();
      await C.confirmWeddingPayment(actor, second.batchId);
      assert.equal((await ref.get()).data()?.purchasedCount, 100);
      assert.equal(
        (await ref.collection("households").doc("H099").get()).data()
          ?.paidBatchId,
        second.batchId,
      );
      await assert.rejects(
        C.quoteWeddingSelection(actor, sel.slice(98)),
        /review/,
      );
      if (mixed) {
        const ack = await R.refundWeddingCard(
          second.batchId,
          "H099",
          "fixture-key",
          "admin",
        );
        assert.equal(ack.amountCents, 1200);
        assert.equal(ack.status, "succeeded");
        assert.equal(refundCalls, 1);
        await R.refundWeddingCard(
          second.batchId,
          "H099",
          "fixture-key",
          "admin",
        );
        await R.applyWeddingRefund([...refunds.values()][0]);
        assert.equal(refundCalls, 1);
        await assert.rejects(
          R.refundWeddingCard(second.batchId, "H099", "another-key", "admin"),
        );
        const saved = (await C.weddingBatchRef(second.batchId).get()).data()!;
        assert.equal(saved.refundedCents, 1200);
        assert.equal(saved.refundReservedCents, 0);
        assert.equal(
          first.pi.amount + second.pi.amount - saved.refundedCents,
          70500,
        );
        const { exportWeddingTracker } = await import("../lib/wedding/project");
        const verifiedOwner = { ...actor, verified: true, uid: "test-owner" };
        await ref
          .collection("members")
          .doc(actor.actorId)
          .update({ uid: verifiedOwner.uid });
        const tracker = await exportWeddingTracker(verifiedOwner);
        assert.ok(tracker.includes('"Household 99","ordered","refunded"'));
        assert.ok(
          tracker.includes('"Household 100","ordered","ordered/on hold"'),
        );
        assert.equal((await ref.get()).data()?.purchasedCount, 100);
      }
      receipts.push({
        mixed,
        first: first.pi.amount,
        second: second.pi.amount,
        paid: 100,
      });
    }
    for (const captureBeforeRevoke of [false, true]) {
      const { actor, ref, sel } = await setup(2);
      const partner: WeddingActor = {
        ...actor,
        actorId: "partner",
        role: "editor",
        verified: true,
        uid: "testUid",
        sessionId: randomUUID(),
      };
      const m = ref.collection("members").doc("partner");
      await m.set({
        id: "partner",
        role: "editor",
        uid: "testUid",
        canPay: false,
        revoked: false,
      });
      await db
        .collection("weddingSessions")
        .doc(partner.sessionId!)
        .set({
          actorId: partner.actorId,
          projectId: actor.projectId,
          expiresAt: Date.now() + 86400000,
          revoked: false,
        });
      const { quote } = await C.quoteWeddingSelection(partner, sel);
      await assert.rejects(
        C.quoteWeddingSelection(partner, sel, quote.id),
        /permission/,
      );
      await m.update({ canPay: true });
      const { batchId, pi } = await reserve(partner, sel);
      if (captureBeforeRevoke) {
        pi.status = "succeeded";
        pi.amount_received = pi.amount;
      }
      await m.update({ canPay: false });
      await ref.update({ checkoutRevocationRequestedFor: "partner" });
      await assert.rejects(
        C.issueWeddingIntent(partner, batchId),
        /permission/,
      );
      await C.reconcileWeddingRevocation(actor.projectId, partner.actorId);
      assert.equal(
        (await C.getWeddingBatch(actor, batchId)).status,
        captureBeforeRevoke ? "held" : "canceled",
      );
      assert.equal(
        (await ref.get()).data()?.purchasedCount,
        captureBeforeRevoke ? 2 : 0,
      );
    }
    console.log(
      "Verified frozen Stripe/Firestore fixture batches, exact refund, consented tax examples, replay, closed-browser settlement and payment revocation.",
      JSON.stringify(receipts),
    );
  } finally {
    setStripeClientFactoryForTests(null);
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
