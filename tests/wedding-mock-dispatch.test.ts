import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type Stripe from "stripe";
import {
  createMockWeddingDispatcher,
  type MockClaim,
} from "../lib/wedding/mock-dispatch";
import { digest } from "../lib/wedding/finance";
import {
  weddingApprovalFingerprint,
  type WeddingActor,
  type WeddingProject,
  type WeddingHousehold,
} from "../lib/wedding/domain";

const dir =
  process.env.SMN_TEST_DATA_DIR ||
  mkdtempSync(join(tmpdir(), "wedding-dispatch-"));
const stateFile = join(dir, "dispatch-fixture.json");
const fixed = 1_000_000;
const localEnvironment = () =>
  Object.assign(process.env, {
    NODE_ENV: "test",
    SMN_TEST_DATA_DIR: dir,
    STAGING_REVIEW_ONLY: "true",
    WEDDING_CHECKOUT_ENABLED: "true",
    INTERNATIONAL_MAILING_PREVIEW: "true",
    STRIPE_SECRET_KEY: "sk_test_local_dispatch",
    STRIPE_PUBLISHABLE_KEY: "pk_test_local_dispatch",
  });

async function prepare() {
  localEnvironment();
  const { firestoreDb: db, isFirestoreMock } = await import(
    "../lib/firebase-admin"
  );
  assert.equal(isFirestoreMock, true);
  const { createWeddingProject } = await import("../lib/wedding/project");
  const { setStripeClientFactoryForTests } = await import("../lib/stripe");
  const checkout = await import("../lib/wedding/checkout");
  const receipts = new Map<string, Stripe.PaymentIntent>();
  const mockStripe = {
    paymentIntents: {
      create: async (p: Stripe.PaymentIntentCreateParams) => {
        const id = "pi_test_" + String(receipts.size + 1);
        const pi = {
          id,
          status: "requires_payment_method",
          amount: p.amount,
          amount_received: 0,
          currency: p.currency,
          livemode: false,
          client_secret: "synthetic",
          metadata: p.metadata,
        } as Stripe.PaymentIntent;
        receipts.set(id, pi);
        return pi;
      },
      retrieve: async (id: string) => receipts.get(id),
    },
  };
  setStripeClientFactoryForTests(() => mockStripe as unknown as Stripe);
  const dispatcher = await createMockWeddingDispatcher(() => fixed);
  const presetHash = createHash("sha256")
    .update(readFileSync("public/presets/thank-you-botanical.jpg"))
    .digest("hex");
  async function paidBatch(count: number, upload = false) {
    const owner = await createWeddingProject("local-" + count, true);
    const actor: WeddingActor = {
      ...owner,
      role: "owner",
      pilot: true,
      verified: false,
    };
    const ref = db.collection("weddingProjects").doc(owner.projectId);
    const p = (await ref.get()).data() as WeddingProject;
    p.sharedBody = "Thank you for being part of our wedding.";
    p.signOff = "With love, Sam and Alex";
    p.returnAddress = {
      firstName: "Sam and Alex",
      lastName: "",
      address1: "10 Paper Lane",
      address2: "Unit 1",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "US",
    };
    if (upload)
      p.cover = {
        kind: "upload",
        id: "synthetic_private_art",
        hash: presetHash,
        url: "/api/wedding/artwork?id=synthetic_private_art",
      };
    await ref.set(p);
    const selection = [];
    for (let i = 1; i <= count; i++) {
      const id = "sample_" + String(i).padStart(3, "0");
      const rowRef = ref.collection("households").doc(id);
      const row = (await rowRef.get()).data() as WeddingHousehold;
      row.addressConfirmed = true;
      row.address.address1 = i + " Sample Road";
      if (i === 1) {
        row.envelopeName = "Noor Vale and Kit Gale";
        row.firstName = "Noor Vale and Kit Gale";
        row.lastName = "";
        row.insideName = "Noor and Kit";
        row.bodyOverride = "Your blue bowl is already at our table. Thank you.";
        row.address = {
          address1: "1 Sample Road",
          address2: "Unit 04",
          city: "Toronto",
          state: "ON",
          zip: "M5V 2T6",
          country: "CA",
        };
      }
      row.approvedFingerprint = weddingApprovalFingerprint(p, row);
      await rowRef.set(row);
      selection.push({ id, revision: row.revision });
    }
    const { quote } = await checkout.quoteWeddingSelection(actor, selection);
    const reserved = await checkout.quoteWeddingSelection(
      actor,
      selection,
      quote.id,
    );
    assert.ok("batchId" in reserved && reserved.batchId);
    const batchId = reserved.batchId;
    await assert.rejects(dispatcher.enqueuePaidBatch(batchId), /paid/);
    let b = await checkout.getWeddingBatch(actor, batchId);
    while (b.status === "preparing")
      b = await checkout.advanceWeddingPreparation(actor, batchId);
    if (upload) {
      // Supply a completed local copy pin before intent issuance. No cloud artwork store is involved.
      await checkout
        .weddingBatchRef(batchId)
        .update({
          artPin: {
            id: p.cover.id,
            sha256: p.cover.hash,
            storageKey: "fixture-private/" + batchId,
          },
        });
    }
    await checkout.issueWeddingIntent(actor, batchId);
    const actual = (await checkout.weddingBatchRef(batchId).get()).data()!;
    const pi = receipts.get(actual.paymentIntentId)!;
    pi.status = "succeeded";
    pi.amount_received = pi.amount;
    await checkout.settleWeddingIntent(pi);
    while (b.completedCount < count)
      b = await checkout.confirmWeddingPayment(actor, batchId);
    assert.equal(b.status, "held");
    assert.equal(b.capturedCents, b.quote.totalCents);
    return { actor, batchId };
  }
  try {
    const large = await paidBatch(100, true),
      small = await paidBatch(1);
    await dispatcher.enqueuePaidBatch(large.batchId);
    await dispatcher.enqueuePaidBatch(small.batchId);
    // Current project and household edits must not leak into already paid cards.
    const project = db.collection("weddingProjects").doc(large.actor.projectId);
    await project.update({
      sharedBody: "Unpaid later edit",
      cover: { kind: "preset", id: "later", url: "/later" },
    });
    await project
      .collection("households")
      .doc("sample_001")
      .update({
        envelopeName: "Edited later",
        bodyOverride: "Not the paid note.",
      });
    const pass1 = await dispatcher.runPass(1),
      pass2 = await dispatcher.runPass(1);
    assert.equal(pass1.length, 1);
    assert.equal(pass2.length, 1);
    assert.notEqual(pass1[0].batchId, pass2[0].batchId);
    const key = digest(["wedding-mock-mail", large.batchId, "sample_001"]);
    const proof = (
      await db.collection("weddingMockProvider").doc(key).get()
    ).data()!;
    assert.equal(proof.accepted, true);
    assert.equal(proof.calls, 1);
    assert.match(proof.payload.note, /Dear Noor and Kit,/);
    assert.match(
      proof.payload.note,
      /Your blue bowl is already at our table\. Thank you\./,
    );
    assert.match(proof.payload.note, /With love, Sam and Alex/);
    assert.equal(proof.payload.envelopeName, "Noor Vale and Kit Gale");
    assert.deepEqual(proof.payload.recipient, {
      firstName: "Noor Vale and Kit Gale",
      lastName: "",
      street1: "1 Sample Road",
      street2: "Unit 04",
      city: "Toronto",
      state: "ON",
      zip: "M5V 2T6",
      country: "CA",
    });
    assert.equal(proof.payload.sender.firstName, "Sam and Alex");
    assert.equal(proof.payload.sender.country, "US");
    assert.equal(proof.payload.sender.street1, "10 Paper Lane");
    assert.equal(proof.payload.handwriting, "hwDavid");
    assert.equal(proof.payload.cover.kind, "upload");
    assert.equal(proof.payload.cover.artworkSha256, presetHash);
    assert.equal(proof.payload.cover.id, "synthetic_private_art");
    assert.match(proof.payload.cover.identityHash, /^[a-f0-9]{64}$/);
    const { getSupplierCountry } = await import("../lib/mailing-destinations");
    assert.equal(
      proof.payload.supplierCountryId,
      getSupplierCountry("CA")!.supplierCountryId,
    );
    const actualFrozen = (
      await checkout
        .weddingBatchRef(large.batchId)
        .collection("cards")
        .doc("sample_001")
        .get()
    ).data()!;
    assert.equal(digest(actualFrozen.card), proof.payload.contentHash);
    const smallKey = digest(["wedding-mock-mail", small.batchId, "sample_001"]);
    assert.notEqual(smallKey, key);
    const preset = (
      await db.collection("weddingMockProvider").doc(smallKey).get()
    ).data()!;
    assert.equal(preset.payload.cover.kind, "preset");
    assert.equal(preset.payload.cover.artworkSha256, null);
    const failures = await paidBatch(6);
    await dispatcher.enqueuePaidBatch(failures.batchId);
    const next = async () => {
      const claim = await dispatcher.claimNext(failures.batchId);
      assert.ok(claim);
      return claim;
    };
    const unknown = await next();
    await dispatcher.startSubmission(unknown);
    await dispatcher.submitToMock(unknown, "unknown");
    assert.equal(await dispatcher.finishSubmission(unknown), "quarantined");
    const lost = await next();
    await dispatcher.startSubmission(lost);
    await dispatcher.submitToMock(lost, "accepted_without_ack");
    assert.equal(await dispatcher.finishSubmission(lost), "quarantined");
    const refused = await next();
    await dispatcher.startSubmission(refused);
    await dispatcher.submitToMock(refused, "not_accepted");
    assert.equal(await dispatcher.finishSubmission(refused), "retry");
    const retryToSuccess = await next();
    await dispatcher.startSubmission(retryToSuccess);
    await dispatcher.submitToMock(retryToSuccess, "not_accepted");
    assert.equal(await dispatcher.finishSubmission(retryToSuccess), "retry");
    const crashed = await next();
    await dispatcher.startSubmission(crashed);
    await dispatcher.submitToMock(crashed);
    await dispatcher.submitToMock(crashed);
    // Exit after the remote mock accepted, before the submitting worker persisted its acknowledgement.
    const leased = await next();
    writeFileSync(
      stateFile,
      JSON.stringify({
        large: large.batchId,
        small: small.batchId,
        failures: failures.batchId,
        unknown,
        lost,
        refused,
        retryToSuccess,
        crashed,
        leased,
      }),
    );
  } finally {
    setStripeClientFactoryForTests(null);
  }
}
async function recover() {
  localEnvironment();
  const f = JSON.parse(readFileSync(stateFile, "utf8"));
  const { firestoreDb: db, isFirestoreMock } = await import(
    "../lib/firebase-admin"
  );
  assert.ok(isFirestoreMock);
  let time = fixed + 6000;
  const dispatcher = await createMockWeddingDispatcher(() => time);
  const task = (id: string) =>
    db
      .collection("weddingMockDispatchBatches")
      .doc(f.failures)
      .collection("tasks")
      .doc(id);
  const provider = (id: string) =>
    db
      .collection("weddingMockProvider")
      .doc(digest(["wedding-mock-mail", f.failures, id]));
  await dispatcher.enqueuePaidBatch(f.failures); // Replaying registration cannot reset durable state.
  assert.equal(
    (await task(f.crashed.householdId).get()).data()?.state,
    "submitting",
  );
  assert.equal((await provider(f.crashed.householdId).get()).data()?.calls, 1);
  assert.equal(await dispatcher.finishSubmission(f.crashed), "quarantined");
  assert.equal(
    await dispatcher.reconcileAcceptance(f.failures, f.crashed.householdId),
    true,
  );
  assert.equal(
    await dispatcher.reconcileAcceptance(f.failures, f.lost.householdId),
    true,
  );
  assert.equal(
    await dispatcher.reconcileAcceptance(f.failures, f.unknown.householdId),
    false,
  );
  await assert.rejects(dispatcher.submitToMock(f.crashed), /stale/);
  await assert.rejects(dispatcher.startSubmission(f.leased), /stale/);
  const claims = await Promise.all([
    dispatcher.claimNext(f.failures),
    dispatcher.claimNext(f.failures),
  ]);
  assert.ok(claims[0] && claims[1]);
  assert.notEqual(claims[0].householdId, claims[1].householdId);
  for (const claim of claims) {
    assert.ok(claim);
    const reject = claim.householdId === f.refused.householdId;
    assert.ok(reject || claim.householdId === f.retryToSuccess.householdId);
    await dispatcher.startSubmission(claim);
    await dispatcher.submitToMock(claim, reject ? "not_accepted" : "accepted");
    assert.equal(
      await dispatcher.finishSubmission(claim),
      reject ? "retry" : "accepted",
    );
  }
  const reclaimed = await dispatcher.claimNext(f.failures);
  assert.ok(reclaimed);
  assert.equal(reclaimed.householdId, f.leased.householdId);
  assert.ok(reclaimed.fence > f.leased.fence);
  await dispatcher.startSubmission(reclaimed);
  await dispatcher.submitToMock(reclaimed);
  await dispatcher.finishSubmission(reclaimed);
  assert.equal(await dispatcher.claimNext(f.failures), null);
  time += 2001;
  const last = await dispatcher.claimNext(f.failures);
  assert.ok(last);
  assert.equal(last.householdId, f.refused.householdId);
  await dispatcher.startSubmission(last);
  await dispatcher.submitToMock(last, "not_accepted");
  assert.equal(await dispatcher.finishSubmission(last), "rejected");
  time += 60000;
  assert.equal(await dispatcher.claimNext(f.failures), null);
  assert.equal((await provider(f.refused.householdId).get()).data()?.calls, 3);
  assert.equal(
    (await provider(f.retryToSuccess.householdId).get()).data()?.calls,
    2,
  );
  for (const c of [f.crashed, f.unknown, f.lost, f.leased] as MockClaim[])
    assert.equal((await provider(c.householdId).get()).data()?.calls, 1);
  const immutable = db.collection("weddingBatches").doc(f.failures);
  assert.ok(
    (await immutable.collection("deliveries").get()).docs.every(
      (d) => d.data().status === "held",
    ),
  );
  // Validate a changed frozen snapshot fails before a single simulated call is recorded.
  const pending = await dispatcher.claimNext(f.large);
  assert.ok(pending);
  const source = db
    .collection("weddingBatches")
    .doc(f.large)
    .collection("cards")
    .doc(pending.householdId);
  const actual = (await source.get()).data()!;
  await source.set({
    ...actual,
    card: { ...actual.card, note: "Changed after capture." },
  });
  await assert.rejects(dispatcher.startSubmission(pending), /Frozen content/);
  assert.equal(
    (
      await db
        .collection("weddingMockProvider")
        .doc(digest(["wedding-mock-mail", f.large, pending.householdId]))
        .get()
    ).exists,
    false,
  );
  const saved = process.env.SMN_TEST_DATA_DIR;
  delete process.env.SMN_TEST_DATA_DIR;
  await assert.rejects(dispatcher.runPass(), /isolated/);
  process.env.SMN_TEST_DATA_DIR = saved;
}
async function main() {
  if (process.argv[2] === "prepare") return prepare();
  if (process.argv[2] === "recover") return recover();
  localEnvironment();
  mkdirSync(dir, { recursive: true });
  const environment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  await assert.rejects(createMockWeddingDispatcher(), /isolated/);
  Object.assign(process.env, { NODE_ENV: environment });
  for (const phase of ["prepare", "recover"]) {
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("tests/wedding-mock-dispatch.test.ts"),
        phase,
      ],
      { stdio: "inherit", env: process.env },
    );
    assert.equal(r.status, 0, phase + " failed.");
  }
  console.log(
    "Local-only held wedding dispatch passed: fair parent turns, immutable paid payload, cross-process recovery, bounded refusal retry and quarantine of uncertain acceptance.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
