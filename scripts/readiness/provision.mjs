// Additive storage, secret-container and index preparation. Does not deploy code,
// alter traffic, create secret values, schedule jobs, or send email/orders.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectTarget,matchIndex} from './contracts.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(here,'targets.json'),'utf8'));
const [mode,name,project,output]=process.argv.slice(2);
assert(['plan','apply'].includes(mode),'Use plan or apply.');
const target=selectTarget(manifest,name,project);
const token=execFileSync(process.env.SMN_GCLOUD_BIN||'gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function api(url,method='GET',body){
 const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'x-goog-user-project':project,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();if(!r.ok){const e=new Error(`${method} failed: ${r.status} ${new URL(url).pathname}`);e.status=r.status;throw e;}return d;
}
async function getOrMissing(url){try{return await api(url)}catch(e){if(e.status===404)return null;throw e;}}
async function pages(url,key){const all=[];let p='';do{const d=await api(url+(p?`?pageToken=${encodeURIComponent(p)}`:''));all.push(...(d[key]||[]));p=d.nextPageToken||'';}while(p);return all;}
const report={checkedAt:new Date().toISOString(),mode,target:name,project,actions:[],codeOrTrafficChanged:false};
const service=await api(`https://run.googleapis.com/v2/projects/${project}/locations/${target.region}/services/${target.backend}`);
const member=`serviceAccount:${service.template.serviceAccount}`;
assert(service.template.serviceAccount,'Runtime identity required.');
const bucketUrl=`https://storage.googleapis.com/storage/v1/b/${target.bucket}`;
let bucket=await getOrMissing(bucketUrl);
if(!bucket){
 report.actions.push({resource:target.bucket,action:'create_private_uniform_bucket',state:mode==='apply'?'created':'planned'});
 if(mode==='apply')bucket=await api(`https://storage.googleapis.com/storage/v1/b?project=${project}`,'POST',{name:target.bucket,location:target.region,iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},labels:{application:'sendmynotes',purpose:'private-artwork'}});
}
if(bucket){
 assert(bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled===true,'Existing bucket is not uniform; explicit remediation required.');
 assert(bucket.iamConfiguration?.publicAccessPrevention==='enforced','Existing bucket is not public-access-prevented.');
 const policy=await api(bucketUrl+'/iam');
 assert(!(policy.bindings||[]).some(b=>b.members?.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))),'Existing public IAM requires separate remediation.');
 // Bucket-scoped object admin is required for immutable masters and temporary cleanup.
 // Legacy bucket reader supplies storage.buckets.get for runtime policy checks.
 const bindings=policy.bindings||[];let changed=false;
 for(const role of ['roles/storage.objectAdmin','roles/storage.legacyBucketReader']) {
  let binding=bindings.find(b=>b.role===role&&!b.condition);
  if(!binding?.members?.includes(member)){changed=true;report.actions.push({resource:target.bucket,action:'add_bucket_runtime_role',role,member});if(!binding){binding={role,members:[]};bindings.push(binding);}binding.members.push(member);}
 }
 if(changed&&mode==='apply')await api(bucketUrl+'/iam','PUT',{...policy,bindings});
}
for(const id of Object.values(manifest.secretEnvironment)){
 const url=`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${id}`;
 const secret=await getOrMissing(url);
 if(!secret){report.actions.push({resource:id,action:'create_empty_secret_container',state:mode==='apply'?'created':'planned'});if(mode==='apply')await api(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets?secretId=${id}`,'POST',{replication:{automatic:{}}});}
 // Version creation and access binding are deliberately a separately reviewed step.
}
const wanted=JSON.parse(readFileSync(resolve(here,'../../firestore.indexes.json'),'utf8')).indexes;
const indexes=await pages(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/-/indexes`,'indexes');
for(const index of wanted){const found=matchIndex(index,indexes);if(found){report.actions.push({resource:index.collectionGroup,action:'retain_index',state:found.state});continue;}
 const action={resource:index.collectionGroup,action:'create_additive_index',fields:index.fields,state:'planned'};
 if(mode==='apply'){const op=await api(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`,'POST',{queryScope:index.queryScope,fields:index.fields});action.state='requested';action.operation=op.name;}
 report.actions.push(action);
}
report.remaining=['Review/seed target-specific secret versions and runtime accessor bindings','Verify index READY','Runtime private put/read/delete and anonymous denial fixture','Authenticated jobs after dry-run review','Signed-in acceptance and explicit production rollout approval'];
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
