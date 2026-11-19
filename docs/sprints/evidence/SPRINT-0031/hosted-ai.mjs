// Usage: node docs/sprints/evidence/SPRINT-0031/hosted-ai.mjs <private-pilot-link> <sanitized-metrics.json>
// A sibling .v11-session file (0600, outside the repository) holds only the staging session,
// source IDs and phase markers so interrupted runs can resume without submitting a new paid job.
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import sharp from 'sharp';
import { stagingRequest } from './staging-request.mjs';

const origin='https://staging.sendmynotes.com';
const aliases=[origin,'https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app'];
const [invitePath,outPath]=process.argv.slice(2);
const statePath=invitePath && resolve(invitePath)+'.v11-session';
const checks={},failures={};
const metrics={host:new URL(origin).host,checkedAt:new Date().toISOString(),checks,failures};
let state={},stage='input';
class Check extends Error { constructor(code,status,serviceCode){super(code);this.status=status;this.serviceCode=serviceCode;} }
const fail=(s)=>{throw new Check(s);};
const requireFact=(v,s)=>{if(!v)fail(s);};
const safeString=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,80}$/.test(v)?v:undefined;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const key=s=>createHash('sha256').update('wedding-v11:'+s).digest('hex').slice(0,40);
function safeError(e){return {reason:e instanceof Check?e.message:'transport_or_fixture_error',status:e.status,serviceCode:safeString(e.serviceCode)};}
async function checkpoint(){
  const temporary=statePath+'.'+process.pid+'.tmp';
  await writeFile(temporary,JSON.stringify(state),{flag:'wx',mode:0o600});
  await rename(temporary,statePath);
}
async function privateFile(p,max){
  const stat=await lstat(p);
  requireFact(stat.isFile()&&(stat.mode&0o777)===0o600&&stat.size<=max,'private_regular_file_required');
  return readFile(p,'utf8');
}
async function call(route,init={},expected=[200,201],raw=false){
  requireFact(/^\/(?:project|artwork|ai)(?:\?|$)/.test(route),'unexpected_endpoint');
  const headers=new Headers(init.headers);headers.set('origin',origin);
  if(state.cookies)headers.set('cookie',Object.entries(state.cookies).map(([k,v])=>k+'='+v).join('; '));
  const response=await stagingRequest(origin+'/api/wedding'+route,{...init,headers,redirect:'error',signal:AbortSignal.timeout(175000)});
  let cookiesChanged=false;state.cookies??={};
  for(const entry of response.headers.getSetCookie()){
    const [name,value]=entry.split(';')[0].split('=');
    if(/^smn_wedding_[a-z]+$/.test(name)&&/^[a-f0-9]{64}$/.test(value)&&state.cookies[name]!==value){state.cookies[name]=value;cookiesChanged=true;}
  }
  if(cookiesChanged)await checkpoint();
  if(!expected.includes(response.status)){
    const e=await response.json().catch(()=>({}));
    throw new Check('unexpected_http',response.status,safeString(e.code));
  }
  return raw?response:response.json();
}
const post=(route,body,status)=>call('/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},status);
const project=(action,extra)=>post('project',{action,...extra});
const ai=(scope,fields,status)=>post('ai',{...fields,idempotencyKey:key(state.projectId+':'+scope)},status);
const meta=()=>call('/ai');
const job=async(jobId)=>{requireFact(id(jobId),'invalid_job_id');return (await call('/ai?jobId='+encodeURIComponent(jobId))).job;};
const image=async(assetId)=>{
  requireFact(id(assetId),'invalid_image_id');
  const response=await call('/artwork?id='+encodeURIComponent(assetId),{},[200],true);
  const bytes=Buffer.from(await response.arrayBuffer()),m=await sharp(bytes).metadata();
  requireFact(m.format==='png'&&m.width>0&&m.height>0&&!m.exif,'normalized_png_required');
  return {width:m.width,height:m.height,digest:createHash('sha256').update(bytes).digest('hex')};
};
async function guarded(name,operation){stage=name;try{await operation();}catch(e){failures[name]=safeError(e);}}
function sameRows(before,after){
  const stateOf=rows=>rows.map(r=>[r.id,r.revision,r.approvedFingerprint,r.bodyOverride,r.signOffOverride,r.greeting,r.paidBatchId]).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify(stateOf(before))===JSON.stringify(stateOf(after));
}
async function run(){
  if(!invitePath||!outPath||resolve(invitePath)===resolve(outPath)||resolve(outPath)===statePath)fail('distinct_invite_and_receipt_paths_required');
  const inviteDir=await realpath(dirname(resolve(invitePath)));
  const rel=relative(await realpath(process.cwd()),inviteDir);
  requireFact(rel==='..'||rel.startsWith('..'+sep),'keep_invite_outside_checkout');
  const link=new URL((await privateFile(invitePath,1024)).trim(),origin);
  const token=new URLSearchParams(link.hash.slice(1)).get('wedding');
  requireFact(aliases.includes(link.origin)&&link.pathname==='/thank-you/wedding'&&!link.search&&!link.username&&!link.password&&/^[a-f0-9]{64}$/.test(token||''),'unused_staging_pilot_link_required');
  try{state=JSON.parse(await privateFile(statePath,16384));}catch(e){if(e.code!=='ENOENT')throw e;}
  requireFact(!state.version||state.version===1,'unknown_private_state');
  state.version=1;
  stage='guest setup';
  let current=state.cookies?.smn_wedding_session?await call('/project'):await project('create',{sample:true});
  if(!current.actor.pilot)current=await project('redeem',{token});
  requireFact(current.actor.pilot&&!current.actor.verified&&current.actor.role==='owner','unverified_invited_guest_required');
  requireFact(!state.projectId||current.project.id===state.projectId,'wrong_private_project');
  state.projectId=current.project.id;await checkpoint();
  const rows=current.households;
  requireFact(rows.length===100&&rows.every(r=>r.id.startsWith('sample_')&&r.address.country==='US'&&r.gift&&r.identityConfirmed&&r.insideNameConfirmed&&!r.excluded&&!r.bodyOverride&&!r.approvedFingerprint&&!r.paidBatchId),'expected_100_unapproved_domestic_sample_rows');
  const ids=rows.map(r=>r.id).sort(),baseline=await meta();
  requireFact(baseline.available&&baseline.mode==='real'&&baseline.provider&&baseline.model&&baseline.imageModel,'real_provider_unavailable');
  requireFact(baseline.limits?.drafts===100&&baseline.limits?.chunk===5&&baseline.limits?.images===3,'unexpected_pilot_limits');
  checks.guest={projectSize:100,domesticRows:100,verified:false,providerMode:'real',
    textModel:safeString(baseline.model),imageModel:safeString(baseline.imageModel)};
  if(!state.started){
    requireFact(baseline.remaining?.drafts===100&&baseline.remaining?.images===3,'fresh_project_allowance_required');
    state.started=true;await checkpoint();
  }

  await guarded('consent',async()=>{
    const before=await meta();
    const denied=await ai('decline-draft',{action:'draft',ids,tone:'warm',consent:false},[400]);
    const after=await meta();
    requireFact(denied.code==='consent_required'&&JSON.stringify(before.remaining)===JSON.stringify(after.remaining)&&before.cost?.reservedCents===after.cost?.reservedCents,'decline_must_preserve_quota');
    checks.consent={declinedStatus:400,quotaPreserved:true};
  });
  await guarded('batch',async()=>{
    // Replays of the same initial request only return its existing job.
    let response=await ai('draft-100',{action:'draft',ids,tone:'warm',consent:true});
    requireFact(id(response.jobId)&&response.total===100,'bulk_job_required');
    const jobId=response.jobId;state.jobId=jobId;await checkpoint();
    let snapshot=await job(jobId);
    if(!state.pausedAfter){
      requireFact(snapshot.complete>=1&&snapshot.complete<=5,'one_initial_chunk_expected');
      const done=snapshot.complete;
      const duplicate=await ai('draft-100',{action:'draft',ids,tone:'warm',consent:true});
      requireFact(duplicate.jobId===jobId&&duplicate.complete===done,'replay_advanced_the_job');
      // Simulate leaving the page: no advance calls. A fresh project GET and job
      // GET reproduce reopening the saved job, even after restarting this runner.
      await wait(1100);
      current=await call('/project');
      snapshot=await job(jobId);
      requireFact(snapshot.complete===done&&ids.every(identifier=>current.households.some(r=>r.id===identifier)),'pause_did_not_preserve_progress');
      const denied=await ai('decline-resume',{action:'advance',jobId,consent:false},[400]);
      requireFact(denied.code==='consent_required'&&(await job(jobId)).complete===done,'resume_without_consent');
      state.pausedAfter=done;await checkpoint();
    }
    let advances=0;const chunk=baseline.limits.chunk;
    while(snapshot.complete<100) {
      requireFact(++advances<=22,'advance_limit');
      if(['failed','canceled','unresolved','running'].includes(snapshot.status))throw new Check('bulk_job_'+snapshot.status,undefined,safeString(snapshot.error));
      // A confirmed transient failure requires a distinct, explicit retry; an
      // uncertain outcome stays fenced. No automatic second invocation.
      if(snapshot.status==='retryable')throw new Check('bulk_job_requires_explicit_retry',undefined,safeString(snapshot.error));
      const old=snapshot.complete;
      response=await ai('advance-at-'+old,{action:'advance',jobId,consent:true});
      snapshot=await job(jobId);
      requireFact(snapshot.complete>old&&snapshot.complete<=old+chunk&&response.jobId===jobId,'invalid_resumed_chunk');
      state.completed=snapshot.complete;await checkpoint();
    }
    const results=snapshot.result?.suggestions;
    requireFact(snapshot.status==='ready'&&Array.isArray(results)&&results.length===100&&new Set(results.map(r=>r.id)).size===100&&results.every(r=>ids.includes(r.id)&&typeof r.text==='string'&&r.text.trim()&&r.text.length<=450),'missing_or_invalid_suggestions');
    const final=await call('/project');
    requireFact(sameRows(rows,final.households)&&final.project.purchasedCount===0,'suggestions_changed_sender_data');
    const exhausted=await ai('over-draft-quota',{action:'draft',ids:[ids[0]],tone:'warm',consent:true},[429]);
    requireFact(exhausted.code==='quota_exhausted'||exhausted.code==='quota_limit','expected_draft_quota');
    checks.bulk={selected:100,complete:100,distinctDomesticSuggestions:100,stoppedAt:state.pausedAfter,resumed:true,oneResultPerHousehold:true,approvedAutomatically:0,editsAppliedAutomatically:0,draftBudgetRemaining:(await meta()).remaining.drafts};
  });

  await guarded('originalCover',async()=>{
    const generated=await ai('original',{action:'image',prompt:'A delicate blue floral motif on ivory stationery, with generous open space.',consent:true});
    const art=await image(generated.assetId);
    if(state.originalId)requireFact(state.originalId===generated.assetId,'duplicate_original_artwork');
    state.originalId=generated.assetId;await checkpoint();
    checks.original={generated:true,normalizedFormat:'PNG',width:art.width,height:art.height};
  });
  await guarded('photoTreatment',async()=>{
    if(!state.referenceId){
      const width=640,height=832,pixels=Buffer.alloc(width*height*3,238);
      for(let y=160;y<600;y++)for(let x=160;x<480;x++){const i=(y*width+x)*3;pixels[i]=90;pixels[i+1]=140;pixels[i+2]=190;}
      const bytes=await sharp(pixels,{raw:{width,height,channels:3}}).png().toBuffer();
      const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'fictional-stationery.png');
      const reference=await call('/artwork',{method:'POST',body:form});
      state.referenceId=reference.assetId;await checkpoint();
    }
    const source=await image(state.referenceId);
    const treated=await ai('treatment',{action:'image',assetId:state.referenceId,prompt:'Turn the centered blue shape into a softly painted botanical wash on ivory paper.',consent:true});
    const output=await image(treated.assetId);
    requireFact(treated.assetId!==state.referenceId&&treated.assetId!==state.originalId&&output.digest!==source.digest,'treatment_must_return_a_distinct_image');
    state.treatmentId=treated.assetId;await checkpoint();
    checks.treatment={normalizedSyntheticReference:true,referenceWidth:source.width,referenceHeight:source.height,distinctOutput:true,format:'PNG'};
  });
  await guarded('guestStepUp',async()=>{
    const before=await meta();
    requireFact(before.imageStepUpRequired===true&&before.remaining.images===1,'expected_third_image_step_up');
    const denied=await ai('third',{action:'image',prompt:'Pale watercolor leaves on a cream portrait card.',consent:true},[401]);
    const after=await meta(),final=await call('/project');
    requireFact(denied.code==='ai_sign_in_required'&&after.remaining.images===before.remaining.images&&before.cost.reservedCents===after.cost.reservedCents,'step_up_reserved_spend');
    requireFact(JSON.stringify(before.jobs.map(j=>j.jobId).sort())===JSON.stringify(after.jobs.map(j=>j.jobId).sort()),'step_up_created_a_job');
    requireFact(final.project.cover.id===current.project.cover.id&&sameRows(rows,final.households),'abandoned_challenge_changed_project');
    checks.stepUp={thirdRequestStatus:401,additionalReservedCents:0,remainingImageAllowance:after.remaining.images,additionalJobs:0,projectPreserved:true};
  });
  if(Object.keys(failures).length) process.exitCode=1;
}
try{await run();}catch(e){failures[stage]=safeError(e);process.exitCode=1;}
metrics.passed=!Object.keys(failures).length;metrics.finishedAt=new Date().toISOString();
if(outPath && invitePath && resolve(outPath)!==resolve(invitePath)&&resolve(outPath)!==statePath)await writeFile(outPath,JSON.stringify(metrics,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({passed:metrics.passed,checks:Object.keys(checks),failures}));
