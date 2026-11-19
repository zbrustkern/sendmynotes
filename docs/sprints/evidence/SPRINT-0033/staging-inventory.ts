import assert from "node:assert/strict";
import { firestoreDb, isFirestoreMock } from "../../../../lib/firebase-admin";
import { offerCutoverRef, offerBalanceRef, legacyOfferBaselineRef } from "../../../../lib/offer-balances";
import { readLegacyOffer, legacySpentBaseline } from "../../../../lib/offer-engine";

async function inventory() {
  const project = "sendmynotes-staging";
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIREBASE_PROJECT_ID, project);
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !isFirestoreMock);
  const [versions, codes, active, migration] = await Promise.all([
    firestoreDb.collection("offer_versions").select("code","version","perCustomerLimit").get(),
    firestoreDb.collection("discount_codes").select("perCustomerLimit").get(),
    firestoreDb.collection("offer_reservations").where("status","==","active").count().get(),
    offerCutoverRef().get(),
  ]);
  const names = new Set(codes.docs.map(doc => doc.id));
  for (const doc of versions.docs) if (doc.get("version") === 1 && doc.get("code")) names.add(doc.get("code"));
  const rows = await Promise.all([...names].map(code => firestoreDb.runTransaction(async tx => {
    const legacy = await readLegacyOffer(tx, code);
    const balance = await tx.get(offerBalanceRef("code", code));
    const checkpoint = await tx.get(legacyOfferBaselineRef(code));
    const baseline = legacySpentBaseline(legacy);
    return { baseline, state: checkpoint.get("state"), spent: balance.data()?.spentCents, uses: balance.data()?.spentUses };
  }, {readOnly:true})));
  const cutover = migration.data();
  return { checkedAt:new Date().toISOString(), project, state:cutover?.state ?? "pending", cutoverAt:cutover?.cutoverAt ?? null,
    versionRecords:versions.size, codeRecords:codes.size, distinctLegacyCodes:names.size, activeHolds:active.data().count,
    personalLimitSettings:[...versions.docs,...codes.docs].filter(doc => Number(doc.get("perCustomerLimit")) > 0).length,
    legacySpentCents:rows.reduce((sum,row)=>sum+row.baseline.spentCents,0),
    legacySpentUses:rows.reduce((sum,row)=>sum+row.baseline.spentUses,0),
    disputedSourceRecords:rows.filter(row => row.baseline.disagreements.length).length,
    isolated:rows.filter(row=>row.state === "isolated").length,
    reconciledCodeBalances:rows.filter(row=>row.spent === row.baseline.spentCents && row.uses === row.baseline.spentUses).length,
  };
}
inventory().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
