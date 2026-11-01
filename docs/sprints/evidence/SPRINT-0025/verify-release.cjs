const fs=require('node:fs'),assert=require('node:assert/strict');
const candidate=process.argv[2];assert(/^[a-f0-9]{40}$/.test(candidate||''),'Pass the exact candidate SHA');
const root=__dirname;const before=JSON.parse(fs.readFileSync(root+'/checks/cloud-staging-before.json'));
const after=JSON.parse(fs.readFileSync(root+'/checks/cloud-staging-after.json'));
const get=(d,p)=>d.surfaces.find(x=>x.project===p);
const p0=get(before,'sendmynotes-2a417'),p1=get(after,'sendmynotes-2a417'),stage=get(after,'sendmynotes-staging');
assert.deepEqual(p0.builds.map(x=>[x.name,x.source,x.traffic]),p1.builds.map(x=>[x.name,x.source,x.traffic]));
assert.equal(p0.configSha256,p1.configSha256);assert.equal(p0.firestoreRules.name,p1.firestoreRules.name);
assert(stage.builds.some(x=>x.source===candidate&&x.traffic===100&&x.state==='READY'));
assert.equal(stage.latestRollouts[0].state,'SUCCEEDED');
const flags=Object.fromEntries(stage.flags.map(x=>[x.name,x.value]));
for(const key of ['STAGING_REVIEW_ONLY','NEXT_PUBLIC_STAGING_REVIEW_ONLY','HANDWRYTTEN_TEST_MODE'])assert.equal(flags[key],'true',key);
assert.equal(flags.ACCOUNT_REMINDER_DELIVERY_ACTIVE,'false');
assert.equal(flags.UPLOAD_PRIVATE_BUCKET,'sendmynotes-staging-upload-private');
const indexes={};for(const env of ['staging','production']){const f=JSON.parse(fs.readFileSync(root+`/${env}-preflight-final.json`));assert.equal(f.indexes.length,21);assert(f.indexes.every(i=>i.state==='READY'),env);indexes[env]=21;}
const report={verifiedAt:new Date().toISOString(),candidate,stagingBuild:stage.builds.find(x=>x.traffic===100).name,passed:true,productionApplicationAndTrafficUnchanged:true,productionResourcesPreparedSeparately:true,readyIndexes:indexes,reminderDeliveryActive:false,reviewOnly:true,signedInAcceptance:'pending',productionReady:false};
fs.writeFileSync(root+'/checks/rollout-verification.json',JSON.stringify(report,null,2)+'\n');console.log(report);
