import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { firestoreDb, isFirestoreMock } from "../../../../lib/firebase-admin";
import { getOperationalControls, updateOperationalControl } from "../../../../lib/operational-controls";
import { offerCutoverRef } from "../../../../lib/offer-balances";
import { runLegacyOfferCutover } from "../../../../lib/offer-migration";

const project = "sendmynotes-staging";
const actor = "staging-iam/sprint-0033";
async function cutover() {
  const [mode, expected] = process.argv.slice(2);
  assert.ok(mode === "import" || mode === "activate" || mode === "resume");
  assert.ok(expected && /^[a-f0-9]{40}$/.test(expected));
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !isFirestoreMock);
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIREBASE_PROJECT_ID, project);
  const rollout = JSON.parse(execFileSync(process.execPath, ["docs/sprints/evidence/SPRINT-0031/hosting-state.mjs"], {encoding:"utf8"}));
  assert.equal(rollout.project, project);
  assert.equal(rollout.builds.length, 1);
  assert.equal(rollout.builds[0].percent, 100);
  assert.equal(rollout.builds[0].sha, expected);
  assert.equal(rollout.flags.STAGING_REVIEW_ONLY, "true");
  assert.equal(rollout.flags.HANDWRYTTEN_TEST_MODE, "true");
  const control = (await getOperationalControls()).checkout;
  if (control.paused) assert.equal(control.actor, actor, "Checkout was paused independently");
  const state = (await offerCutoverRef().get()).data()?.state;
  if (mode === "resume") {
    assert.equal(state,"active");
    if (control.paused) await updateOperationalControl({name:"checkout",paused:false,actor,reason:"Sprint 0033 promotion migration verified"});
    console.log(JSON.stringify({mode,paused:(await getOperationalControls()).checkout.paused}));
    return;
  }
  if (mode === "activate") {
    assert.equal(state,"fenced");
    assert.ok(control.paused);
    const disputed = await firestoreDb.collection("offer_migrations").where("state","==","isolated").limit(1).get();
    assert.equal(disputed.size,0,"Resolve isolated legacy codes before activating");
  } else {
    assert.notEqual(state,"active");
    if (!control.paused) await updateOperationalControl({name:"checkout",paused:true,actor,reason:"Fencing staging writers during verified Sprint 0033 migration"});
  }
  const report = await runLegacyOfferCutover({writerFenced:true, finalize:mode === "activate"});
  console.log(JSON.stringify(report));
  assert.equal(report.isolated,0,"Review isolated legacy records before rollout");
}
cutover().catch(error=>{console.error(error.message);process.exitCode=1;});
