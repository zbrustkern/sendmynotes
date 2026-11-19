// Read only the staging access rules and schedules referred to in the sprint.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const project = 'sendmynotes-staging';
const authorization = 'Bearer ' + execFileSync('gcloud', ['auth','print-access-token'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function read(url) {
  const response = await fetch(url,{headers:{authorization,'x-goog-user-project':project},signal:AbortSignal.timeout(20000),redirect:'error'});
  if (!response.ok) throw Error('Staging control plane returned HTTP '+response.status+' at '+new URL(url).hostname);
  return response.json();
}
const release = await read('https://firebaserules.googleapis.com/v1/projects/'+project+'/releases/cloud.firestore');
const ruleset = await read('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
const content = ruleset.source.files.find(file => file.name.endsWith('.rules'))?.content;
if (!content) throw Error('Deployed Firestore rule source unavailable.');
const digest=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trim()).digest('hex');
const checkedIn = await readFile('firestore.rules','utf8');
const comparable = source => source.split('\n').filter(line=>!line.trim().startsWith('//')).join(' ').replace(/\s+/g,' ').trim();
const same = comparable(content) === comparable(checkedIn);
const jobs=await Promise.all(['wedding-held-reconciliation','upload-private-cleanup'].map(async name=>{
  const job=await read('https://cloudscheduler.googleapis.com/v1/projects/'+project+'/locations/us-central1/jobs/'+name);
  return {name,schedule:job.schedule,timeZone:job.timeZone,enabled:job.state==='ENABLED',route:new URL(job.httpTarget.uri).pathname,lastAttempt:job.lastAttemptTime,latestCode:job.status?.code??0};
}));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),project,firestore:{matchesRepositoryIgnoringFormatting:same,ruleHash:digest(content),denyAllClientAccess:same && /allow read, write: if false;/.test(content)},jobs},null,2));
if (!same || jobs.some(job=>!job.enabled || job.latestCode!==0)) process.exitCode=1;
