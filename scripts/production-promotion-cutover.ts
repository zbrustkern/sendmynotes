import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { firestoreDb, isFirestoreMock } from "../lib/firebase-admin";
import { getOperationalControls, updateOperationalControl } from "../lib/operational-controls";
import { offerCutoverRef } from "../lib/offer-balances";
import { runLegacyOfferCutover } from "../lib/offer-migration";

const project = "sendmynotes-2a417";
const backend = "sendmynotes";
const actor = "production-iam/sprint-0033";
const receipt = () => firestoreDb.collection("offer_migrations").doc("sprint_0033_release");
const hosting = "https://firebaseapphosting.googleapis.com/v1beta/";
const resource = "projects/" + project + "/locations/us-central1/backends/" + backend;

async function checkServing(expected: string) {
  assert.match(expected, /^[a-f0-9]{40}$/);
  const token = execFileSync("gcloud", ["auth", "print-access-token"], {encoding:"utf8", stdio:["ignore","pipe","ignore"]}).trim();
  async function get(url: string) {
    const res = await fetch(url, {headers:{Authorization:"Bearer " + token, "x-goog-user-project": project}, signal: AbortSignal.timeout(20000)});
    if (!res.ok) throw new Error("Production control plane returned HTTP " + res.status);
    return res.json();
  }
  const [traffic, service] = await Promise.all([get(hosting + resource + "/traffic"), get("https://run.googleapis.com/v2/projects/" + project + "/locations/us-central1/services/" + backend)]);
  const splits = traffic.current?.splits ?? [];
  assert.equal(splits.length, 1); assert.equal(splits[0].percent, 100);
  const buildPath = String(splits[0].build);
  assert.match(buildPath, /^projects\/(?:[0-9]+|sendmynotes-2a417)\/locations\/us-central1\/backends\/sendmynotes\/builds\/[a-z0-9-]+$/);
  const build = await get(hosting + splits[0].build);
  assert.equal(build.state, "READY"); assert.equal(build.source?.codebase?.hash, expected);
  const serving = service.trafficStatuses.filter((s: {percent: number}) => s.percent > 0);
  assert.equal(serving.length, 1); assert.equal(serving[0].percent, 100);
  assert.equal(serving[0].revision.split("/").pop(), backend + "-" + build.name.split("/").pop());
}

async function main() {
  const [action, sha] = process.argv.slice(2);
  assert.ok(["status", "pause", "import", "activate", "resume", "abort-before-import"].includes(action));
  assert.equal(process.env.FIREBASE_PROJECT_ID, project); assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !isFirestoreMock);
  await checkServing(sha);
  const control = (await getOperationalControls()).checkout;
  const marker = (await receipt().get()).data();
  const migration = (await offerCutoverRef().get()).data();
  if (control.paused) assert.equal(control.actor, actor, "Checkout was paused by another operator.");
  if (action === "status") {
    console.log(JSON.stringify({project, sha, checkoutPaused:control.paused, state:migration?.state ?? "pending"}));
    return;
  }
  if (action === "pause") {
    assert.ok(!migration, "Cutover has already started.");
    if (marker?.abortedAt) await receipt().set({originalSha: sha, pausedAt: Date.now(), previousAbortAt: marker.abortedAt});
    else if (marker) assert.equal(marker.originalSha, sha);
    else await receipt().create({originalSha: sha, pausedAt: Date.now()});
    if (!control.paused) await updateOperationalControl({name:"checkout", paused:true, actor, reason:"Fence checkout for the production promotion cutover"});
  } else {
    assert.ok(marker, "No production pause receipt.");
    if (action === "abort-before-import") {
      assert.equal(sha, marker.originalSha); assert.ok(!migration, "Migration already started. Recover forward and preserve imported financial records.");
      if (control.paused) await updateOperationalControl({name:"checkout", paused:false, actor, reason:"Verified original production revision before aborting promotion cutover"});
      await receipt().update({abortedAt: Date.now()});
    } else {
      assert.notEqual(sha, marker.originalSha, "The legacy build is still serving.");
      if (marker.releaseSha) assert.equal(sha, marker.releaseSha);
      if (action === "resume") {
        assert.equal(marker.releaseSha, sha); assert.equal(migration?.state, "active");
        if (control.paused) await updateOperationalControl({name:"checkout", paused:false, actor, reason:"Verified production promotion cutover active"});
      } else {
        assert.ok(control.paused);
        if (!marker.releaseSha) await receipt().update({releaseSha: sha});
        if (action === "activate") {
          assert.equal(migration?.state, "fenced");
          const isolated = await firestoreDb.collection("offer_migrations").where("state","==","isolated").limit(1).get();
          assert.equal(isolated.size, 0, "Review quarantined codes before activation.");
          const repeat = await runLegacyOfferCutover({writerFenced:true});
          assert.ok(!repeat.seeded && !repeat.imported && !repeat.isolated, "Rerun inventory and import before activation.");
        } else assert.notEqual(migration?.state, "active");
        const result = await runLegacyOfferCutover({writerFenced:true, finalize:action === "activate"});
        console.log(JSON.stringify(result));
        assert.equal(result.isolated, 0, "Review isolated exposure before proceeding.");
      }
    }
  }
  const [latest, controls] = await Promise.all([offerCutoverRef().get(), getOperationalControls()]);
  console.log(JSON.stringify({project, action, sha, checkoutPaused: controls.checkout.paused, state:latest.get("state") ?? "pending", cutoverAt: latest.get("cutoverAt") ?? null}));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
