// Local settlement and recovery fixture. It has no supplier client or HTTP entry point.
import { isAbsolute } from "node:path";
import type { Transaction } from "firebase-admin/firestore";
import { digest, type WeddingQuote } from "./finance";

const LEASE_MS = 5_000;
const RETRY_MS = 1_000;
const MAX_ATTEMPTS = 3;
const NEVER = Number.MAX_SAFE_INTEGER;
type State =
  | "pending"
  | "leased"
  | "submitting"
  | "retry"
  | "accepted"
  | "quarantined"
  | "rejected";
export type MockOutcome =
  | "accepted"
  | "not_accepted"
  | "accepted_without_ack"
  | "unknown";
type Ack = "accepted" | "not_accepted" | "unknown";
type Address = {
  firstName: string;
  lastName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};
type FrozenCard = {
  householdId: string;
  envelopeName: string;
  note: string;
  handwriting: string;
  recipient: { address: Address; supplierCountryId: number };
  returnAddress: Address;
  cover: { kind: "upload" | "preset"; id: string; url: string; hash?: string };
};
type Batch = {
  id: string;
  projectId: string;
  status: string;
  settledAt?: number;
  capturedCents: number;
  paymentIntentId?: string;
  quote: WeddingQuote;
  artPin?: { id: string; sha256: string; storageKey: string };
};
type Task = {
  householdId: string;
  ordinal: number;
  contentHash: string;
  state: State;
  attempts: number;
  fence: number;
  dueAt: number;
  reason: string | null;
};
export interface MockClaim {
  batchId: string;
  householdId: string;
  fence: number;
}
export interface MockCardPayload {
  deliveryId: string;
  contentHash: string;
  envelopeName: string;
  note: string;
  handwriting: string;
  recipient: Address;
  supplierCountryId: number;
  sender: Address;
  cover: {
    kind: "preset" | "upload";
    id: string;
    identityHash: string;
    artworkSha256: string | null;
  };
}
function assertTestDirectory(expected?: string) {
  const dir = process.env.SMN_TEST_DATA_DIR;
  if (
    process.env.NODE_ENV !== "test" ||
    !dir ||
    !isAbsolute(dir) ||
    (expected && expected !== dir)
  )
    throw Error("An isolated wedding test directory is required.");
  return dir;
}
function checkedId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id))
    throw Error("Invalid fixture identity.");
  return id;
}
const childId = (batch: string, household: string) =>
  digest(["wedding-mock-mail", batch, household]);

export async function createMockWeddingDispatcher(now = Date.now) {
  const directory = assertTestDirectory();
  const { firestoreDb: db, isFirestoreMock } = await import(
    "../firebase-admin"
  );
  function localOnly() {
    assertTestDirectory(directory);
    if (!isFirestoreMock)
      throw Error("The wedding dispatcher requires mock Firestore.");
  }
  localOnly();
  const batches = db.collection("weddingBatches");
  const jobs = db.collection("weddingMockDispatchBatches");
  const provider = db.collection("weddingMockProvider");
  const sequence = db.collection("weddingMockDispatchControl").doc("turn");
  const taskRef = (batch: string, household: string) =>
    jobs.doc(checkedId(batch)).collection("tasks").doc(checkedId(household));
  function isPaid(b: Batch | undefined, id: string): b is Batch {
    return (
      !!b &&
      b.id === id &&
      b.status === "held" &&
      !!b.settledAt &&
      !!b.paymentIntentId &&
      b.capturedCents > 0 &&
      b.capturedCents === b.quote.totalCents
    );
  }

  async function enqueuePaidBatch(id: string) {
    localOnly();
    checkedId(id);
    const batch = batches.doc(id),
      parent = jobs.doc(id);
    return db.runTransaction(async (tx) => {
      const [source, existing, deliveries] = await Promise.all([
        tx.get(batch),
        tx.get(parent),
        tx.get(batch.collection("deliveries").limit(101)),
      ]);
      const b = source.data() as Batch | undefined;
      if (
        !isPaid(b, id) ||
        !b.quote.count ||
        b.quote.count > 100 ||
        deliveries.size !== b.quote.count
      )
        throw Error(
          "Fully materialized, paid, held wedding cards are required.",
        );
      if (existing.exists) return;
      for (const doc of deliveries.docs) {
        const d = doc.data();
        const l = b.quote.lines.find((x) => x.householdId === doc.id);
        if (
          !l ||
          d.status !== "held" ||
          d.ordinal !== l.ordinal ||
          d.contentHash !== l.contentHash
        )
          throw Error("The delivery does not match its frozen quote.");
        const task: Task = {
          householdId: doc.id,
          ordinal: l.ordinal,
          contentHash: l.contentHash,
          state: "pending",
          attempts: 0,
          fence: 0,
          dueAt: now(),
          reason: null,
        };
        tx.create(taskRef(id, doc.id), task);
      }
      tx.create(parent, { eligibleAt: now(), turn: 0 });
    });
  }
  async function frozenPayload(
    tx: Transaction,
    claim: MockClaim,
    task: Task,
  ): Promise<MockCardPayload> {
    const { batchId, householdId } = claim,
      batch = batches.doc(batchId);
    const [parent, cardDoc, deliveryDoc] = await Promise.all([
      tx.get(batch),
      tx.get(batch.collection("cards").doc(householdId)),
      tx.get(batch.collection("deliveries").doc(householdId)),
    ]);
    const b = parent.data() as Batch | undefined,
      child = cardDoc.data(),
      card = child?.card as FrozenCard | undefined;
    const d = deliveryDoc.data();
    if (
      !isPaid(b, batchId) ||
      !card ||
      card.householdId !== householdId ||
      child?.refundStatus ||
      d?.status !== "held" ||
      d.holdReason !== "staging_review"
    )
      throw Error("This frozen child is ineligible for the fixture.");
    const line = b.quote.lines.find((x) => x.householdId === householdId);
    if (
      !line ||
      child?.line?.contentHash !== task.contentHash ||
      line.contentHash !== task.contentHash ||
      d.contentHash !== task.contentHash ||
      digest(card) !== task.contentHash ||
      line.country !== card.recipient.address.country ||
      line.ordinal !== task.ordinal ||
      d.ordinal !== task.ordinal ||
      !card.note ||
      !card.handwriting ||
      !card.cover.id
    )
      throw Error("Frozen content does not match the captured card.");
    const cover = card.cover;
    if (
      cover.kind === "upload" &&
      (!b.artPin ||
        b.artPin.id !== cover.id ||
        b.artPin.sha256 !== cover.hash ||
        !/^[0-9a-f]{64}$/.test(b.artPin.sha256))
    )
      throw Error("The uploaded artwork does not match the paid pin.");
    return {
      deliveryId: childId(batchId, householdId),
      contentHash: task.contentHash,
      envelopeName: card.envelopeName,
      note: card.note,
      handwriting: card.handwriting,
      recipient: card.recipient.address,
      supplierCountryId: card.recipient.supplierCountryId,
      sender: card.returnAddress,
      cover: {
        kind: cover.kind,
        id: cover.id,
        identityHash: digest(cover),
        artworkSha256: cover.hash || null,
      },
    };
  }
  async function claimNext(batchId: string): Promise<MockClaim | null> {
    localOnly();
    const parent = jobs.doc(checkedId(batchId));
    return db.runTransaction(async (tx) => {
      const [parentDoc, turnDoc, next] = await Promise.all([
        tx.get(parent),
        tx.get(sequence),
        tx.get(
          parent
            .collection("tasks")
            .orderBy("dueAt")
            .orderBy("ordinal")
            .limit(1),
        ),
      ]);
      if (!parentDoc.exists)
        throw Error("Register a paid fixture batch first.");
      const turn = Number(turnDoc.data()?.last || 0) + 1,
        t = now();
      tx.set(sequence, { last: turn });
      const doc = next.docs[0],
        task = doc?.data() as Task | undefined;
      if (!task || task.dueAt > t) {
        tx.update(parent, { turn, eligibleAt: task?.dueAt ?? NEVER });
        return null;
      }
      tx.update(parent, { turn, eligibleAt: t });
      if (task.state === "submitting") {
        tx.update(doc.ref, {
          state: "quarantined",
          dueAt: NEVER,
          reason: "submission_lease_expired",
        });
        return null;
      }
      if (!["pending", "retry", "leased"].includes(task.state))
        throw Error("Invalid fixture dispatch state.");
      const fence = task.fence + 1;
      tx.update(doc.ref, {
        state: "leased",
        fence,
        dueAt: t + LEASE_MS,
        reason: null,
      });
      return { batchId, householdId: task.householdId, fence };
    });
  }
  // Make the handoff durable BEFORE touching the independent simulated provider.
  // If the worker dies between these two phases its successor quarantines the card.
  async function startSubmission(claim: MockClaim) {
    localOnly();
    const ref = taskRef(claim.batchId, claim.householdId);
    return db.runTransaction(async (tx) => {
      const task = (await tx.get(ref)).data() as Task | undefined;
      if (
        !task ||
        task.state !== "leased" ||
        task.fence !== claim.fence ||
        task.dueAt <= now()
      )
        throw Error("This claim is stale.");
      await frozenPayload(tx, claim, task);
      tx.update(ref, { state: "submitting", attempts: task.attempts + 1 });
    });
  }
  // The mock retains its own idempotent acceptance receipt independently of the
  // local acknowledgement. A dropped reply can coexist with a recorded acceptance.
  async function submitToMock(
    claim: MockClaim,
    outcome: MockOutcome = "accepted",
  ) {
    localOnly();
    const ref = taskRef(claim.batchId, claim.householdId);
    await db.runTransaction(async (tx) => {
      const p = provider.doc(childId(claim.batchId, claim.householdId)),
        attempt = p.collection("calls").doc(String(claim.fence));
      const [snap, prior, priorCall] = await Promise.all([
        tx.get(ref),
        tx.get(p),
        tx.get(attempt),
      ]);
      const task = snap.data() as Task | undefined;
      if (
        !task ||
        task.state !== "submitting" ||
        task.fence !== claim.fence ||
        task.dueAt <= now()
      )
        throw Error("This submission is stale.");
      const payload = await frozenPayload(tx, claim, task);
      if (priorCall.exists) return;
      if (prior.exists && prior.data()!.contentHash !== payload.contentHash)
        throw Error("Provider identity was reused for different content.");
      const alreadyAccepted = !!prior.data()?.accepted;
      let ack: Ack = "unknown";
      if (alreadyAccepted || outcome === "accepted") ack = "accepted";
      else if (outcome === "not_accepted") ack = "not_accepted";
      const accepted =
        alreadyAccepted ||
        outcome === "accepted" ||
        outcome === "accepted_without_ack";
      tx.set(p, {
        contentHash: payload.contentHash,
        accepted,
        calls: Number(prior.data()?.calls || 0) + 1,
        payload,
      });
      tx.create(attempt, { ack, attempt: task.attempts });
    });
  }
  async function finishSubmission(claim: MockClaim) {
    localOnly();
    const ref = taskRef(claim.batchId, claim.householdId);
    return db.runTransaction(async (tx) => {
      const [snap, call] = await Promise.all([
        tx.get(ref),
        tx.get(
          provider
            .doc(childId(claim.batchId, claim.householdId))
            .collection("calls")
            .doc(String(claim.fence)),
        ),
      ]);
      const task = snap.data() as Task | undefined;
      if (!task || task.state !== "submitting" || task.fence !== claim.fence)
        throw Error("This completion is stale.");
      let state: State = "quarantined",
        dueAt = NEVER,
        reason: string | null = "acceptance_unknown";
      const ack = call.data()?.ack as Ack | undefined;
      if (task.dueAt <= now()) reason = "submission_lease_expired";
      else if (ack === "accepted") {
        state = "accepted";
        reason = null;
      } else if (ack === "not_accepted") {
        state = task.attempts >= MAX_ATTEMPTS ? "rejected" : "retry";
        dueAt =
          state === "retry"
            ? now() + RETRY_MS * 2 ** (task.attempts - 1)
            : NEVER;
        reason = "proven_not_accepted";
      }
      tx.update(ref, { state, dueAt, reason });
      if (state === "retry")
        tx.update(jobs.doc(claim.batchId), { eligibleAt: now() });
      return state;
    });
  }
  async function reconcileAcceptance(batchId: string, householdId: string) {
    localOnly();
    const ref = taskRef(batchId, householdId),
      p = provider.doc(childId(batchId, householdId));
    return db.runTransaction(async (tx) => {
      const [task, receipt] = await Promise.all([tx.get(ref), tx.get(p)]);
      if (
        task.data()?.state !== "quarantined" ||
        !receipt.data()?.accepted ||
        receipt.data()?.contentHash !== task.data()?.contentHash
      )
        return false;
      tx.update(ref, {
        state: "accepted",
        reason: "verified_mock_receipt",
        dueAt: NEVER,
      });
      return true;
    });
  }
  async function runPass(maxParents = 4) {
    localOnly();
    if (!Number.isInteger(maxParents) || maxParents < 1 || maxParents > 8)
      throw Error("Choose one to eight fixture parents per pass.");
    const candidates = await jobs
      .where("eligibleAt", "<=", now())
      .orderBy("turn")
      .limit(maxParents)
      .get();
    const serviced: MockClaim[] = [];
    for (const p of candidates.docs) {
      const claim = await claimNext(p.id);
      if (!claim) continue;
      await startSubmission(claim);
      await submitToMock(claim);
      await finishSubmission(claim);
      serviced.push(claim);
    }
    return serviced;
  }
  return {
    enqueuePaidBatch,
    claimNext,
    startSubmission,
    submitToMock,
    finishSubmission,
    reconcileAcceptance,
    runPass,
  };
}
