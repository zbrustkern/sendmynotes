import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectTarget,matchIndex,assessBucket,safeEnvironment} from '../scripts/readiness/contracts.mjs';
const manifest=JSON.parse(readFileSync(new URL('../scripts/readiness/targets.json',import.meta.url)));
assert.throws(()=>selectTarget(manifest,'production','sendmynotes-staging'));
assert.throws(()=>selectTarget(manifest,'staging','sendmynotes-2a417'));
const target=selectTarget(manifest,'production','sendmynotes-2a417');
const index={collectionGroup:'account_people',queryScope:'COLLECTION',fields:[{fieldPath:'ownerScope',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'}]};
const wrong={...index,name:'projects/p/databases/(default)/collectionGroups/account_images/indexes/1'};
assert.equal(matchIndex(index,[wrong]),undefined,'identical fields in another collection cannot satisfy an index');
const right={...index,name:'projects/p/databases/(default)/collectionGroups/account_people/indexes/1',fields:[...index.fields,{fieldPath:'__name__',order:'DESCENDING'}]};
assert.equal(matchIndex(index,[wrong,right]),right);
const deployedIndexes=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url))).indexes;
for(const collectionGroup of ['user_feedback','users']) {
  const wanted=deployedIndexes.find(row=>row.collectionGroup===collectionGroup && row.queryScope==='COLLECTION' && row.fields.length===1 && row.fields[0].fieldPath==='__name__' && row.fields[0].order==='DESCENDING');
  assert(wanted,`${collectionGroup} must declare the descending document-name index required by contact pagination`);
  const ascending={...wanted,name:`projects/p/databases/(default)/collectionGroups/${collectionGroup}/indexes/ascending`,state:'READY',fields:[{fieldPath:'__name__',order:'ASCENDING'}]};
  const descending={...wanted,name:`projects/p/databases/(default)/collectionGroups/${collectionGroup}/indexes/descending`,state:'READY'};
  assert.equal(matchIndex(wanted,[ascending]),undefined,'an ascending name-only index cannot satisfy a descending contact query');
  assert.equal(matchIndex(wanted,[ascending,descending]),descending,'the deployed descending name-only index is recognized');
  assert.equal(matchIndex({...wanted,collectionGroup:'unrelated_collection'},[descending]),undefined,'name-only indexes remain collection-scoped');
}
assert.equal(assessBucket({iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'}},{bindings:[{role:'roles/storage.objectViewer',members:['allUsers']}]},'runtime').noPublicMembers,false);
const sensitive='do-not-serialize';
const assessment=safeEnvironment([{name:'SECRET',value:sensitive},{name:'ACCOUNT_REMINDER_DELIVERY_ACTIVE',value:'true'},{name:'STAGING_REVIEW_ONLY',value:'true'}],manifest,target);
assert.equal(assessment.checks.remindersExplicitlyOff,false);assert.equal(assessment.checks.stageSafety,false);assert(!JSON.stringify(assessment).includes(sensitive));
console.log('Readiness target isolation, contact pagination index direction, index matching, private bucket and secret-redaction guards passed.');
