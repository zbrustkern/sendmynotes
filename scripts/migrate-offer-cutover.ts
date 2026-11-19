import { runLegacyOfferCutover } from "../lib/offer-migration";
import { isOperationalControlPaused } from "../lib/operational-controls";
import { isFirestoreMock } from "../lib/firebase-admin";

async function main() {
  const [project, writerFlag, finalizeFlag] = process.argv.slice(2);
  if (!project || project !== process.env.FIREBASE_PROJECT_ID || writerFlag !== "--legacy-writers-stopped" ||
      (finalizeFlag !== undefined && finalizeFlag !== "--finalize") || isFirestoreMock) {
    throw new Error("Specify the configured Firebase project and --legacy-writers-stopped. Add --finalize after reviewing the migration.");
  }
  if (!await isOperationalControlPaused("checkout")) throw new Error("Pause checkout before running the promotion cutover.");
  const result = await runLegacyOfferCutover({ writerFenced: true, finalize: finalizeFlag === "--finalize" });
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Promotion migration failed.");
  process.exitCode = 1;
});
