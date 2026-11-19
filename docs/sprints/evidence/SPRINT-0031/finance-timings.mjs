// Read only the four existing synthetic batch manifests. Do not read card fields.
import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source='/private/tmp/smn-wedding-0031-finance-private.json';
const info=await lstat(source);
assert.ok(info.isFile() && (info.mode&0o077)===0);
const fixtures=JSON.parse(await readFile(source,'utf8'));
assert.equal(fixtures.origin,'https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app');
const project='sendmynotes-staging';
const base='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/weddingBatches/';
const headers={authorization:'Bearer '+execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'x-goog-user-project':project};
async function read(path,fields){
  const params=new URLSearchParams(fields.map(key=>['mask.fieldPaths',key]));
  const res=await fetch(base+path+'?'+params,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(res.status,200);return res.json();
}
const batches={};
for(const scenario of ['domestic','mixed']){
  batches[scenario]={};
  for(const [name,count] of [['first',98],['second',2]]){
    const ctx=fixtures[scenario][name];assert.match(ctx.id,/^wb_[0-9a-f-]{36}$/);
    const doc=await read(ctx.id,['status','completedCount','createdAt','issueAt','dueAt','projectId']);
    const f=doc.fields;
    assert.equal(f.projectId.stringValue,fixtures[scenario].projectId);
    assert.equal(f.status.stringValue,'held');
    const chunks=await Promise.all(Array.from({length:Math.ceil(count/20)},(_,i)=>read(ctx.id+'/chunks/'+i,['count'])));
    const at=Number(f.createdAt.integerValue);
    const stamps=[at,...chunks.map(d=>Date.parse(d.createTime))];
    const cardsPerChunk=chunks.map(d=>Number(d.fields.count.integerValue));
    assert.equal(cardsPerChunk.reduce((s,v)=>s+v,0),count);
    batches[scenario][name]={cards:count,cardsPerChunk,elapsedBetweenManifestCommitsMs:stamps.slice(1).map((v,i)=>v-stamps[i]),reservationToIntentIssueMs:Number(f.issueAt.integerValue)-at,materialized:Number(f.completedCount.integerValue),hasRemainingDueTime:f.dueAt?.nullValue===undefined};
  }
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),batches,measurement:'Elapsed times between staging Firestore commits include client and network waits. They do not measure server CPU time.'},null,2));
