// Read-only application probes plus disabled-worker probe; never creates an order or sends mail.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://staging.sendmynotes.com';
(async()=>{
 const checks=[];
 for(const route of ['/account','/account/history','/account/images','/account/people','/account/dates','/account/drafts','/account/settings','/account/verify']){
  const r=await fetch(base+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,route);const html=await r.text();assert(/Sign in|Opening your account|Opening verification|Checking your email/.test(html),'account auth shell: '+route);checks.push({route,status:r.status,accountShell:true});
 }
 for(const route of ['/api/account','/api/account/history','/api/account/images','/api/account/people','/api/account/occasions','/api/account/drafts','/api/account/preferences','/api/account/privacy-requests','/api/reminder-occurrences','/api/reminders']){
  const r=await fetch(base+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,401,route);assert.match(r.headers.get('cache-control')||'',/no-store/);const body=await r.json();assert.equal(body.code,'unauthorized',route);checks.push({route,status:r.status,privateNoStore:true});
 }
 for(const route of ['/api/cron/reminder-dispatch','/api/cron/upload-cleanup','/api/cron/account-library-cleanup']){const r=await fetch(base+route,{method:'POST',signal:AbortSignal.timeout(30000)});assert.equal(r.status,401,route);checks.push({route,status:401,unauthenticatedRejected:true});}
 const out={checkedAt:new Date().toISOString(),base,passed:true,checks,ordersCreated:0,emailsSent:0,authenticatedUserFlows:'not_exercised',productionMutations:0};fs.writeFileSync(__dirname+'/checks/hosted-smoke.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,base}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
