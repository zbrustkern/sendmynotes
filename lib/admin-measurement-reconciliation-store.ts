import { createHash } from "node:crypto";
import { ReconciliationManifest, REPORT_PRIVATE_COLLECTION_PATH, toReconciliationEntries, reconciliationManifestHash, validateReconciliationManifest } from "@/lib/admin-measurement-reconciliation";

export interface ReconciliationStoreResult { status: "applied" | "already_applied"; hash: string; records: number; revision: number; }

/** Append immutable evidence revisions and atomically advance the private current projection. */
export async function writeReconciliationManifest(args: {
  db: any;
  manifest: ReconciliationManifest;
  expectedHash: string;
  expectedPrior: string;
}): Promise<ReconciliationStoreResult> {
  const { db, manifest } = args;
  const errors = validateReconciliationManifest(manifest);
  if (errors.length) throw new Error(`Invalid manifest: ${errors.join(",")}`);
  const hash = reconciliationManifestHash(manifest);
  if (hash !== args.expectedHash) throw new Error("Manifest hash mismatch.");
  if (!args.expectedPrior) throw new Error("Apply requires an expected prior revision.");
  const reportRoot = db.collection(REPORT_PRIVATE_COLLECTION_PATH).doc(`report_${manifest.environment}`);
  const currentCollection = reportRoot.collection("current");
  const revisionCollection = reportRoot.collection("revisions");
  const entries = toReconciliationEntries(manifest);
  const revisionDocs = entries.map((entry) => {
    const revision = manifest.decisions.find((d) => d.orderId === entry.orderId)!.revision;
    const key = createHash("sha256").update(`${manifest.environment}:${entry.orderId}`).digest("hex");
    const common = { ...entry, environment: manifest.environment, projectId: manifest.projectId, manifestHash: hash, cutoff: manifest.cutoff, source: "reviewed_inspection_snapshot" };
    return { revisionRef: revisionCollection.doc(`${key}_r${String(revision).padStart(8, "0")}`), currentRef: currentCollection.doc(key), revisionValue: common, currentValue: common };
  });
  let result: ReconciliationStoreResult = { status: "applied", hash, records: entries.length, revision: 0 };
  await db.runTransaction(async (tx: any) => {
    const prior = await tx.get(reportRoot);
    const priorData = prior.exists ? prior.data() : undefined;
    if (priorData?.manifestHash === hash) {
      result = { status: "already_applied", hash, records: entries.length, revision: Number(priorData.revision ?? 0) };
      return;
    }
    const actualPrior = priorData?.revision ?? "none";
    if (String(actualPrior) !== args.expectedPrior) throw new Error("Prior revision compare-and-set conflict.");
    const writeItems: typeof revisionDocs = [];
    for (const item of revisionDocs) {
      const existingRevision = await tx.get(item.revisionRef);
      if (existingRevision.exists && existingRevision.data()?.manifestHash !== hash) throw new Error("Immutable revision ID collision.");
      const current = await tx.get(item.currentRef);
      const currentData = current.exists ? current.data() : undefined;
      const currentRevision = currentData?.revision;
      const requestedRevision = item.currentValue.revision;
      if (["founder_test", "comp", "admin_origin"].includes(currentData?.classification) && item.currentValue.classification === "independent_customer") throw new Error("Known excluded payment cannot be reclassified as a customer capture.");
      if (currentRevision === undefined && (requestedRevision !== 1 || item.currentValue.supersedes !== undefined)) throw new Error("First order revision must be 1 with no superseded revision.");
      if (currentRevision !== undefined && requestedRevision === currentRevision) {
        const keys = ["orderId", "classification", "paymentIntentId", "amountInCents", "currency", "liveMode", "refundStatus", "refundedAmountInCents", "disputeStatus", "sourceReference", "evidenceSourceReference", "actor", "decidedAt"];
        if (keys.some((key) => (currentData as any)[key] !== (item.currentValue as any)[key])) throw new Error("Changed decision requires a superseding revision.");
        if (!existingRevision.exists) writeItems.push(item);
        continue;
      }
      if (currentRevision !== undefined && (requestedRevision !== currentRevision + 1 || item.currentValue.supersedes !== currentRevision)) throw new Error("Order revision must supersede the current revision exactly.");
      writeItems.push(item);
    }
    const nextRevision = Number(actualPrior === "none" ? 0 : actualPrior) + 1;
    for (const item of writeItems) { tx.create(item.revisionRef, { ...item.revisionValue, recordType: "revision" }); tx.set(item.currentRef, { ...item.currentValue, recordType: "current" }); }
    tx.set(reportRoot, { revision: nextRevision, manifestHash: hash, environment: manifest.environment, projectId: manifest.projectId, cutoff: manifest.cutoff, updatedAt: new Date().toISOString() });
    result = { status: "applied", hash, records: entries.length, revision: nextRevision };
  });
  return result;
}
