// Read-only. Never reads secret values or emits runtime environment values.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectTarget,matchIndex,assessBucket,safeEnvironment} from './contracts.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(here,'targets.json'),'utf8'));
const [name,project,output] = process.argv.slice(2);
const target=selectTarget(manifest,name,project);
const token=execFileSync(process.env.SMN_GCLOUD_BIN||'gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function api(url) {
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'x-goog-user-project':project},signal:AbortSignal.timeout(30000)});
  const d=await r.json(); if(!r.ok) {const error=new Error(`Read failed: ${r.status} ${new URL(url).pathname}`);error.status=r.status;throw error;} return d;
}
async function optional(url) {try{return {data:await api(url)}}catch(e){return {unavailable:true,status:e.status||null}}}
async function pages(url,key) {const out=[];let page='';do{const d=await api(url+(page?`?pageToken=${encodeURIComponent(page)}`:''));out.push(...(d[key]||[]));page=d.nextPageToken||'';}while(page);return out;}
const result={checkedAt:new Date().toISOString(),target:name,project,readOnly:true,secretValuesRead:false};
const service=await api(`https://run.googleapis.com/v2/projects/${project}/locations/${target.region}/services/${target.backend}`);
result.revision=service.latestReadyRevision;result.runtimeIdentity=service.template.serviceAccount;
result.environment=safeEnvironment(service.template.containers[0].env||[],manifest,target);
const [bucket,iam,jobs,secrets] = await Promise.all([
 optional(`https://storage.googleapis.com/storage/v1/b/${target.bucket}`),optional(`https://storage.googleapis.com/storage/v1/b/${target.bucket}/iam`),
 optional(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${target.region}/jobs`),
 optional(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets`)
]);
result.bucket=bucket.data&&iam.data ? {name:target.bucket,...assessBucket(bucket.data,iam.data,result.runtimeIdentity)} : {name:target.bucket,metadata:bucket.unavailable?'unavailable':'available',metadataStatus:bucket.status,iamStatus:iam.status};
const wanted=JSON.parse(readFileSync(resolve(here,'../../firestore.indexes.json'),'utf8')).indexes;
const existing=await pages(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`,'indexes');
result.indexes=wanted.map(index=>({collectionGroup:index.collectionGroup,fields:index.fields,state:matchIndex(index,existing)?.state||'MISSING'}));
result.secrets=secrets.data ? Object.values(manifest.secretEnvironment).map(id=>({id,present:(secrets.data.secrets||[]).some(s=>s.name.endsWith('/'+id))})) : {unavailable:true,status:secrets.status};
result.scheduler=jobs.data ? {region:target.region,jobs:(jobs.data.jobs||[]).map(j=>({name:j.name,state:j.state,schedule:j.schedule,method:j.httpTarget?.httpMethod,uri:j.httpTarget?.uri,authenticated:Boolean(j.httpTarget?.headers?.Authorization||j.httpTarget?.oidcToken||j.httpTarget?.oauthToken)}))} : {region:target.region,unavailable:true,status:jobs.status};
result.readyForRelease=false; // Real runtime fixture, signed-in acceptance, owners and approval are separate evidence.
if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
