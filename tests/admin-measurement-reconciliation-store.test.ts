import assert from "node:assert/strict";
import { ReconciliationManifest, reconciliationManifestHash } from "@/lib/admin-measurement-reconciliation";
import { writeReconciliationManifest } from "@/lib/admin-measurement-reconciliation-store";

class FakeRef {
  constructor(readonly path: string, readonly store: Map<string, any>) {}
  collection(name: string) { return new FakeCollection(`${this.path}/${name}`, this.store); }
}
class FakeCollection extends FakeRef {
  doc(id: string) { return new FakeRef(`${this.path}/${id}`, this.store); }
}
class FakeDb {
  store = new Map<string, any>();
  collection(name: string) { return new FakeCollection(name, this.store); }
  async runTransaction(fn: (tx: any) => Promise<void>) {
    const pending: Array<{ op: string; ref: FakeRef; data?: any }> = [];
    const tx = {
      get: async (ref: FakeRef) => ({ exists: this.store.has(ref.path), data: () => this.store.get(ref.path) }),
      create: (ref: FakeRef, data: any) => pending.push({ op: "create", ref, data }),
      set: (ref: FakeRef, data: any) => pending.push({ op: "set", ref, data }),
    };
    await fn(tx);
    for (const op of pending) {
      if (op.op === "create" && this.store.has(op.ref.path)) throw new Error("already exists");
      this.store.set(op.ref.path, op.data);
    }
  }
}

function manifest(classification: "independent_customer" | "founder_test", revision = 1, supersedes?: number): ReconciliationManifest {
  return { version: 1, environment: "production", projectId: "sendmynotes-2a417", reviewedAt: "2026-10-26T21:00:00Z", cutoff: { timestamp: "2026-10-26T13:48:55-05:00", timezone: "America/Chicago" },
    evidence: [{ orderId: "sale_1", paymentIntentId: "pi_1", amountInCents: 900, currency: "USD", liveMode: true, refundStatus: "none_observed", refundedAmountInCents: 0, disputeStatus: "none_observed", observedAt: "2026-10-26T21:33:00Z", sourceReference: "private-payment-observation-1" }],
    decisions: [{ orderId: "sale_1", classification, sourceReference: "founder-confirmation-reference", actor: "operator", decidedAt: "2026-10-26T21:34:00Z", revision, supersedes }] };
}

async function run() {
  const db = new FakeDb();
  const first = manifest("independent_customer");
  const hash1 = reconciliationManifestHash(first);
  const applied = await writeReconciliationManifest({ db, manifest: first, expectedHash: hash1, expectedPrior: "none" });
  assert.deepEqual(applied, { status: "applied", hash: hash1, records: 1, revision: 1 });
  const currentPaths = [...db.store.keys()].filter((x) => x.includes("/current/"));
  const historyPaths = [...db.store.keys()].filter((x) => x.includes("/revisions/"));
  assert.equal(currentPaths.length, 1);
  assert.equal(historyPaths.length, 1);
  assert.equal(db.store.get(currentPaths[0]).actor, "operator");
  assert.equal(db.store.get(historyPaths[0]).evidenceSourceReference, "private-payment-observation-1");
  const repeated = await writeReconciliationManifest({ db, manifest: first, expectedHash: hash1, expectedPrior: "0" });
  assert.equal(repeated.status, "already_applied");
  assert.equal([...db.store.keys()].filter((x) => x.includes("/revisions/")).length, 1);
  await assert.rejects(writeReconciliationManifest({ db, manifest: manifest("founder_test"), expectedHash: reconciliationManifestHash(manifest("founder_test")), expectedPrior: "none" }), /compare-and-set/);
  const correction = manifest("founder_test", 2, 1);
  const correctionHash = reconciliationManifestHash(correction);
  const corrected = await writeReconciliationManifest({ db, manifest: correction, expectedHash: correctionHash, expectedPrior: "1" });
  assert.equal(corrected.revision, 2);
  assert.equal([...db.store.keys()].filter((x) => x.includes("/revisions/")).length, 2);
  const forbidden = manifest("independent_customer", 3, 2);
  await assert.rejects(writeReconciliationManifest({ db, manifest: forbidden, expectedHash: reconciliationManifestHash(forbidden), expectedPrior: "2" }), /Known excluded payment/);
  assert.equal(db.store.get(currentPaths[0]).classification, "founder_test");
  assert.equal(db.store.size, 4); // head, latest projection, and two immutable revisions
  process.stdout.write("admin measurement reconciliation store tests passed\n");
}

run().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; });
