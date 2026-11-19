// Read-only staging rollout receipt. Output deliberately includes only release facts and safe flags.
import { execFileSync } from 'node:child_process';
const project = 'sendmynotes-staging';
const name = 'projects/' + project + '/locations/us-central1/backends/' + project;
const base = 'https://firebaseapphosting.googleapis.com/v1beta/';
const token = execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function read(url) {
  const response = await fetch(url,{headers:{authorization:'Bearer '+token,'x-goog-user-project':project},signal:AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Error('Staging control-plane read failed with HTTP ' + response.status);
  return response.json();
}
const [traffic,rollouts,run] = await Promise.all([
  read(base+name+'/traffic'),read(base+name+'/rollouts?pageSize=100'),
  read('https://run.googleapis.com/v2/projects/'+project+'/locations/us-central1/services/'+project),
]);
let pageToken = rollouts.nextPageToken;
while (pageToken) {
  const page = await read(base+name+'/rollouts?pageSize=100&pageToken='+encodeURIComponent(pageToken));
  rollouts.rollouts = (rollouts.rollouts || []).concat(page.rollouts || []);
  pageToken = page.nextPageToken;
}
const rollout = [...(rollouts.rollouts ?? [])].sort((a,b) => b.createTime.localeCompare(a.createTime))[0];
const builds = await Promise.all((traffic.current?.splits ?? []).map(async split => {
  const build = await read(base+split.build);
  return {id:build.name.split('/').pop(),state:build.state,sha:build.source?.codebase?.hash,percent:split.percent};
}));
const latest = rollout?.build ? await read(base+rollout.build) : undefined;
const flags = Object.fromEntries((run.template?.containers?.[0]?.env ?? [])
  .filter(item=>['NEXT_PUBLIC_WEDDING_PORTAL_ENABLED','WEDDING_PROJECTS_ENABLED','WEDDING_CHECKOUT_ENABLED',
    'STAGING_REVIEW_ONLY','HANDWRYTTEN_TEST_MODE','FIREBASE_PROJECT_ID','INTERNATIONAL_MAILING_PREVIEW'].includes(item.name))
  .map(item=>[item.name,item.value]));
const cloudRun=(run.trafficStatuses||[]).filter(item=>item.percent>0).map(item=>({revision:item.revision?.split('/').pop(),percent:item.percent}));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),project,builds,cloudRun,latest:{id:rollout?.name.split('/').pop(),
  state:rollout?.state,buildState:latest?.state,sha:latest?.source?.codebase?.hash},flags},null,2));
