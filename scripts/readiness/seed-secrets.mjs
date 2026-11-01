// Creates only missing random key versions. Never reads/prints any secret payload.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectTarget} from './contracts.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(here,'targets.json')));
const [mode,name,project,output]=process.argv.slice(2);
assert(['plan','apply'].includes(mode));const target=selectTarget(manifest,name,project);
const token=execFileSync(process.env.SMN_GCLOUD_BIN||'gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function api(url,method='GET',body){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'x-goog-user-project':project,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(`${method} ${r.status} ${new URL(url).pathname}: ${d.error?.message || "request rejected"}`);return d;}
const [service,projectInfo]=await Promise.all([api(`https://run.googleapis.com/v2/projects/${project}/locations/${target.region}/services/${target.backend}`),api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}`)]);
assert.equal(projectInfo.projectId,project);
const projectPolicy=await api(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,'POST',{});
const agentMembers=(projectPolicy.bindings||[]).filter(b=>b.role==='roles/firebaseapphosting.serviceAgent').flatMap(b=>b.members||[]);
const appAgent=agentMembers.find(m=>m===`serviceAccount:service-${projectInfo.projectNumber}@gcp-sa-firebaseapphosting.iam.gserviceaccount.com`);
assert(appAgent,'Verified App Hosting service agent required.');
const members=[`serviceAccount:${service.template.serviceAccount}`,appAgent];
const result={checkedAt:new Date().toISOString(),mode,project,secretValuesRead:false,secretValuesLogged:false,secrets:[]};
for(const id of Object.values(manifest.secretEnvironment)){
 const url=`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${id}`;
 const versions=await api(url+'/versions');const enabled=(versions.versions||[]).filter(v=>v.state==='ENABLED');
 let version=enabled[0]?.name;
 if(!version&&mode==='apply'){const created=await api(url+':addVersion','POST',{payload:{data:Buffer.from(randomBytes(48).toString('base64url')).toString('base64')}});version=created.name;}
 const policy=await api(url+':getIamPolicy');const bindings=policy.bindings||[];let binding=bindings.find(b=>b.role==='roles/secretmanager.secretAccessor'&&!b.condition);if(!binding){binding={role:'roles/secretmanager.secretAccessor',members:[]};bindings.push(binding);}
 const added=members.filter(m=>!binding.members.includes(m));binding.members.push(...added);
 if(added.length&&mode==='apply')await api(url+':setIamPolicy','POST',{policy:{...policy,bindings}});
 result.secrets.push({id,version:version||null,action:enabled.length?'retained_existing_version':mode==='apply'?'seeded_initial_random_version':'would_seed_initial_random_version',addedAccessors:added});
}
if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
