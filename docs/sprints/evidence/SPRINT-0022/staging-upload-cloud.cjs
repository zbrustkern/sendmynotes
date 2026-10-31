const fs=require('node:fs'),cp=require('node:child_process');
const project='sendmynotes-staging', bucket='sendmynotes-staging-upload-private';
const mode=process.argv[2]||'inspect';
async function main(){
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 async function api(url,method='GET',body){const res=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','x-goog-user-project':project},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok)throw Error(`${method} ${new URL(url).pathname} ${res.status}: ${data.error?.message}`);return data;}
 const service=await api(`https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services/${project}`);
 const serviceAccount=service.template.serviceAccount;
 const buckets=await api(`https://storage.googleapis.com/storage/v1/b?project=${project}`);
 const databases=await api(`https://firestore.googleapis.com/v1/projects/${project}/databases`);
 let privateBucket=(buckets.items||[]).find(b=>b.name===bucket);
 if(mode==='provision'){
  if(!privateBucket)privateBucket=await api(`https://storage.googleapis.com/storage/v1/b?project=${project}`,'POST',{name:bucket,location:'US-CENTRAL1',iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},versioning:{enabled:false}});
  const iam=await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`);
  if((iam.bindings||[]).some(b=>b.members.some(m=>m==='allUsers'||m==='allAuthenticatedUsers')))throw Error('Unexpected public policy');
  const member='serviceAccount:'+serviceAccount;
  if(!(iam.bindings||[]).some(b=>b.role==='roles/storage.objectAdmin'&&b.members.includes(member)))await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`,'PUT',{...iam,bindings:[...(iam.bindings||[]),{role:'roles/storage.objectAdmin',members:[member]}]});
  const policy=await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`);
  if(!(policy.bindings||[]).some(b=>b.role==='roles/storage.legacyBucketReader'&&b.members.includes(member)))await api(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`,'PUT',{...policy,bindings:[...(policy.bindings||[]),{role:'roles/storage.legacyBucketReader',members:[member]}]});
  let release;try{release=await api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);}catch(e){if(!e.message.includes('404'))throw e;}
  if(!release){const rules=await api(`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }"}]}});release=await api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases`,'POST',{name:`projects/${project}/releases/cloud.firestore`,rulesetName:rules.name});}
 }
 const out={checkedAt:new Date().toISOString(),mode,project,serviceAccount,databases:databases.databases?.map(d=>({name:d.name,type:d.type})),privateBucket:privateBucket?{name:privateBucket.name,iamConfiguration:privateBucket.iamConfiguration}:null,buckets:buckets.items?.map(b=>({name:b.name,iamConfiguration:b.iamConfiguration})),secretValuesLogged:false};
 fs.writeFileSync(__dirname+'/checks/upload-cloud-'+mode+'.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
