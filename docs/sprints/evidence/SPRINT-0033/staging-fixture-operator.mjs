// Requires staging Firestore IAM and access to the staging service's promotion and test-payment keys.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const project = "sendmynotes-staging";
const origin = "https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app";
const gcloud = (...args) => execFileSync("gcloud", args, {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
let runtime;

async function staging() {
  if (runtime) return runtime;
  assert.equal(process.env.FIREBASE_PROJECT_ID, project);
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST);
  const service = JSON.parse(gcloud("run","services","describe",project,"--project="+project,"--region=us-central1","--format=json"));
  const serving = service.status.traffic.filter(t=>t.percent);
  assert.equal(serving.length,1);
  assert.equal(serving[0].percent,100);
  assert.match(serving[0].revisionName,/^sendmynotes-staging-build-[a-z0-9-]+$/);
  const revision = JSON.parse(gcloud("run","revisions","describe",serving[0].revisionName,"--project="+project,"--region=us-central1","--format=json"));
  const flags = new Map(revision.spec.containers[0].env.map(field=>[field.name,field]));
  for (const flag of ["STAGING_REVIEW_ONLY","WEDDING_CHECKOUT_ENABLED","PROMOTION_WEDDING_CHECKOUT_READY","HANDWRYTTEN_TEST_MODE"])
    assert.equal(flags.get(flag)?.value,"true");
  assert.equal(flags.get("FIREBASE_PROJECT_ID")?.value,project);
  const key = (variable,name) => {
    const ref = flags.get(variable)?.valueFrom?.secretKeyRef;
    assert.ok(ref?.name === name || revision.metadata.annotations?.["run.googleapis.com/secrets"]?.split(",").some(binding=>binding.trim().startsWith(ref?.name+":") && binding.endsWith("/secrets/"+name)));
    assert.match(ref.key,/^(?:[1-9]\d*|latest)$/);
    return Buffer.from(gcloud("secrets","versions","access",ref.key,"--secret="+name,"--project="+project,"--format=get(payload.data)"),"base64url").toString("utf8");
  };
  const stripe = key("STRIPE_SECRET_KEY","stripe-secret-key");
  assert.ok(/^(?:sk|rk)_test_/.test(stripe),"A bound staging-only Stripe test key is required");
  Object.assign(process.env,{NODE_ENV:"production",NEXT_PUBLIC_APP_URL:origin,STRIPE_SECRET_KEY:stripe.trim(),PROMOTION_PRIVATE_KEY:key("PROMOTION_PRIVATE_KEY","promotion-private-key")});
  for (const flag of ["STAGING_REVIEW_ONLY","WEDDING_CHECKOUT_ENABLED","PROMOTION_WEDDING_CHECKOUT_READY","HANDWRYTTEN_TEST_MODE"]) process.env[flag]=flags.get(flag).value;
  const {firestoreDb,isFirestoreMock} = await import("../../../../lib/firebase-admin.ts");
  assert.equal(isFirestoreMock,false);
  const actor = gcloud("config","get","account");
  assert.ok(actor.includes("@"));
  runtime = {db:firestoreDb,actor:"staging-iam/"+actor};
  return runtime;
}

export async function setupCampaign(input) {
  assert.equal(input.origin,origin);
  assert.match(input.projectId,/^wp_[a-f0-9-]{36}$/);
  assert.match(input.syntheticCode,/^S33[MD][A-F0-9]{16}$/);
  assert.equal(input.policy.projectId,input.projectId);
  const {db,actor} = await staging();
  const projectDoc = db.collection("weddingProjects").doc(input.projectId);
  const p = (await projectDoc.get()).data();
  assert.ok(p && !p.claimedAt && Date.now()-p.createdAt < 86400000);
  assert.equal(p.returnAddress?.address1,"5000 Fictional Wedding Lane");
  assert.equal(p.sharedBody,"Thank you for your thoughtful wedding gift. We appreciate you thinking of us.");
  const store = await import("../../../../lib/promotions-v2-store.ts");
  const existing = await store.readPromotionForCode(input.syntheticCode);
  if (existing) {
    assert.equal(existing.policy.projectId,input.projectId);
    return {campaignId:existing.campaign.id,code:input.syntheticCode};
  }
  const {executePromotionAdminAction:act} = await import("../../../../lib/promotions-v2-admin.ts");
  // A retried operator run may already have saved the same fixture draft.
  const name="Staging wedding acceptance "+input.scenario;
  const prior = await db.collection("promotion_campaigns").where("name","==",name).get();
  let draft;
  for (const snap of prior.docs) {
    const campaign=snap.data();
    const current=(await db.collection("promotion_drafts").doc(campaign.id).get()).data();
    if (current?.policy?.projectId!==input.projectId) continue;
    if (!draft && campaign.status==="draft") draft={campaign,draft:current};
    if (campaign.status==="active" && campaign.primaryCodeId!==store.promotionCodeId(input.syntheticCode,"private")) {
      const balance=(await store.promotionUsageRef("campaign",campaign.id).get()).data();
      assert.ok(!balance || (!balance.heldUses && !balance.spentUses));
      await act("campaign-archive",{campaignId:campaign.id,revision:campaign.revision,reason:"Retiring unused synthetic acceptance code before corrected issuance"},actor);
    }
  }
  draft = await act("draft-save",{...(draft ? {campaignId:draft.campaign.id,revision:draft.campaign.revision}:{}),name:"Staging wedding acceptance "+input.scenario,distribution:"private",code:input.syntheticCode,budgetCents:2500,maxUses:2,policy:{...input.policy,endsAt:Date.now()+86400000}},actor);
  const target = {campaignId:draft.campaign.id,revision:draft.draft.revision};
  const preview = await act("draft-preview",{...target,scenario:input.previewScenario},actor);
  for (const [k,v] of Object.entries(input.expectedPreview)) assert.equal(preview.previews.custom[k],v);
  assert.equal(preview.publicationAvailable,true);
  const published = await act("draft-publish",{...target,reason:"Synthetic held staging checkout acceptance",previewToken:preview.previewToken},actor);
  assert.ok(published.issued.code===input.syntheticCode,"The published fixture must match this staging run");
  return {campaignId:target.campaignId,code:input.syntheticCode};
}

export async function refundFixture({projectId,batchId,householdId,firstBatchId}) {
  const {db,actor} = await staging();
  const [p,last,first,row] = await Promise.all([db.doc("weddingProjects/"+projectId),db.doc("weddingBatches/"+batchId),db.doc("weddingBatches/"+firstBatchId),db.doc("weddingProjects/"+projectId+"/households/"+householdId)].map(async ref=>(await ref.get()).data()));
  assert.ok(p && !p.claimedAt && Date.now()-p.createdAt<86400000 && p.purchasedCount===100 && p.returnAddress.address1==="5000 Fictional Wedding Lane");
  assert.equal(first.projectId,projectId); assert.equal(last.projectId,projectId);
  assert.equal(first.status,"held"); assert.equal(last.status,"held");
  assert.equal(first.capturedCents,69850); assert.equal(last.capturedCents,1850);
  assert.equal(first.quote.promotion.savingsCents,2500);
  assert.equal(row.sourceHouseholdId,"H099"); assert.equal(row.paidBatchId,batchId);
  assert.ok(row.provenance.some(source=>source.importId?.startsWith("promo33_")));
  const line = last.quote.lines.find(line=>line.householdId===householdId);
  assert.equal(line.ordinal,99); assert.equal(line.country,"FR"); assert.equal(line.totalCents,1200);
  const {refundWeddingCard}=await import("../../../../lib/wedding/refunds.ts");
  const refund=await refundWeddingCard(batchId,householdId,"sprint33_h099",actor);
  assert.equal(refund.status,"succeeded"); assert.equal(refund.amountCents,1200);
  return {status:refund.status,amountCents:refund.amountCents};
}
