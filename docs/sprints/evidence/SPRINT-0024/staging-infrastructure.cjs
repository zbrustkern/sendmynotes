// Staging-only additive index provisioning and read-only bucket/rules validation.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const project='sendmynotes-staging',mode=process.argv[2]||'inspect';
assert(['inspect','provision'].includes(mode));
(async()=>{
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const api=async(url,method='GET',body)=>{const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','x-goog-user-project':project},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(`${method} ${new URL(url).pathname} ${r.status}: ${d.error?.message||''}`);return d;};
 const [bucket,iam,release,service]=await Promise.all([
  api(`https://storage.googleapis.com/storage/v1/b/${project}-upload-private`),
  api(`https://storage.googleapis.com/storage/v1/b/${project}-upload-private/iam`),
  api(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`),
  api(`https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services/${project}`),
 ]);
 assert(bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled,'bucket requires uniform access');
 assert.equal(bucket.iamConfiguration?.publicAccessPrevention,'enforced');
 assert(!(iam.bindings||[]).some(b=>b.members.some(m=>['allUsers','allAuthenticatedUsers'].includes(m))),'private bucket has no public binding');
 const runtimeMember='serviceAccount:'+service.template.serviceAccount;
 assert((iam.bindings||[]).some(b=>b.role==='roles/storage.objectAdmin'&&b.members.includes(runtimeMember)),'runtime can manage private objects');
 const rules=await api('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
 const ruleText=rules.source.files.map(f=>f.content).join('\n');
 assert(/allow read, write:\s*if false/.test(ruleText),'expected deny-all client policy');
 const wanted=JSON.parse(fs.readFileSync('firestore.indexes.json','utf8')).indexes;
 const normalize=fields=>JSON.stringify(fields.filter(f=>f.fieldPath!=='__name__').map(f=>({fieldPath:f.fieldPath,order:f.order,arrayConfig:f.arrayConfig})));
 const indexes=[],created=[];
 for(const group of [...new Set(wanted.map(i=>i.collectionGroup))]){
  const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/collectionGroups/${group}/indexes`;
  const existing=[];let page='';do{const d=await api(base+(page?'?pageToken='+encodeURIComponent(page):''));existing.push(...(d.indexes||[]));page=d.nextPageToken||'';}while(page);
  for(const index of wanted.filter(i=>i.collectionGroup===group)){
   const found=existing.find(i=>i.name.includes('/collectionGroups/'+group+'/indexes/')&&i.queryScope===index.queryScope&&normalize(i.fields)===normalize(index.fields));
   if(found){indexes.push({collectionGroup:group,fields:index.fields,state:found.state,name:found.name});continue;}
   if(mode==='provision'){const operation=await api(base,'POST',{queryScope:index.queryScope,fields:index.fields});created.push({collectionGroup:group,fields:index.fields,operation:operation.name});}
   else indexes.push({collectionGroup:group,fields:index.fields,state:'MISSING'});
  }
 }
 const out={checkedAt:new Date().toISOString(),project,mode,bucket:{name:bucket.name,private:true,runtimeObjectAccess:true},firestoreClientRules:'deny-all',indexes,created,ready:created.length===0&&indexes.every(i=>i.state==='READY'),productionMutations:0};
 fs.writeFileSync(__dirname+'/checks/staging-infrastructure-'+mode+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({project,privateBucket:true,denyAllRules:true,indexCount:indexes.length,created:created.length,ready:out.ready,notReady:indexes.filter(i=>i.state!=='READY')},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
