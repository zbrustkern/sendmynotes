import * as admin from "firebase-admin";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firestoreDb, isFirestoreMock } from "@/lib/firebase-admin";
import { reconciliationApplyTargetError, reconciliationManifestHash, validateReconciliationManifest, ReconciliationManifest } from "@/lib/admin-measurement-reconciliation";
import { writeReconciliationManifest } from "@/lib/admin-measurement-reconciliation-store";

function arg(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

export async function runReconciliationCommand(
  argv = process.argv.slice(2),
  dependencies: { db?: any; isMock?: boolean; actualProject?: string } = {},
) {
  const file = arg(argv, "manifest");
  if (!file) throw new Error("Usage: tsx scripts/reconcile-admin-measurement.ts --manifest <file> [--hash <sha256> --project <id> --expected-prior <revision|none> --apply]");
  const manifest = JSON.parse(await fs.readFile(file, "utf8")) as ReconciliationManifest;
  const problems = validateReconciliationManifest(manifest);
  if (problems.length) throw new Error(`Invalid manifest: ${problems.join(",")}`);
  const hash = reconciliationManifestHash(manifest);
  const apply = argv.includes("--apply");
  if (!apply) return { mode: "dry-run", hash, environment: manifest.environment, projectId: manifest.projectId, records: manifest.decisions.length, errors: [] };
  if (arg(argv, "hash") !== hash) throw new Error("Manifest hash mismatch.");
  if (arg(argv, "project") !== manifest.projectId) throw new Error("Explicit project does not match manifest.");
  const expectedPrior = arg(argv, "expected-prior");
  if (!expectedPrior) throw new Error("Apply requires --expected-prior.");
  const mock = dependencies.isMock ?? isFirestoreMock;
  const appOptions = admin.apps[0]?.options as any;
  const connectedProject = dependencies.actualProject ?? appOptions?.projectId ?? appOptions?.credential?.projectId;
  const targetError = reconciliationApplyTargetError(manifest, { projectId: arg(argv, "project"), connectedProject, isMock: mock, syntheticFlag: argv.includes("--synthetic") });
  if (targetError) throw new Error(targetError);
  if (!dependencies.db && !connectedProject) throw new Error("Connected Firebase project cannot be verified.");
  const result = await writeReconciliationManifest({ db: dependencies.db ?? firestoreDb, manifest, expectedHash: hash, expectedPrior });
  return { mode: result.status, hash: result.hash, records: result.records, revision: result.revision };
}

async function main() {
  try {
    const result = await runReconciliationCommand();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "reconciliation_failed"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
