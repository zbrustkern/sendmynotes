// Run from repo root: node docs/sprints/evidence/SPRINT-0031/hosted-import.mjs <private-invite-file> <metrics-json>
// Input is a 0600 regular file with an unused, unbound staging pilot link on a single line.
// The staging host is fixed. Cookies stay in process memory. No payment, notification or fulfillment endpoints.
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const origin='https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app';
const fixtureDir='docs/proposals/2026-11-12-thank-you-portal/upload-fixtures';
const [invitePath,resultPath]=process.argv.slice(2);
const checks={}, metrics={checkedAt:new Date().toISOString(),host:new URL(origin).hostname,checks};
const jar=new Map();
class CheckFailure extends Error { constructor(label,status,code){super(label);this.status=status;this.code=code;} }
const fail=(label)=>{throw new CheckFailure(label);};
const verify=(condition,code)=>{if(!condition)fail(code);};
const safeCode=v=>typeof v==='string' && /^[a-z0-9_]{1,80}$/i.test(v)?v:undefined;
async function request(path,init={}, {accept,raw=false}={}) {
  verify(/^\/api\/wedding\/(?:project|import|artwork|ai)(?:\?|$)/.test(path),'unexpected_endpoint');
  const h=new Headers(init.headers);h.set('Origin',origin);
  if(jar.size)h.set('Cookie',[...jar].map(([k,v])=>k+'='+v).join('; '));
  const response=await fetch(origin+path,{...init,headers:h,redirect:'error',signal:AbortSignal.timeout(100000)});
  for(const cookie of response.headers.getSetCookie()){
    const [k,v]=cookie.split(';')[0].split('=');
    if(/^smn_wedding_[a-z]+$/.test(k)&&/^[a-f0-9]{64}$/.test(v))jar.set(k,v);
  }
  const allowed=accept?accept.includes(response.status):response.ok;
  if(!allowed){
    const details=await response.json().catch(()=>({}));
    throw new CheckFailure('unexpected_http_status',response.status,safeCode(details.code));
  }
  if(raw)return response;
  return response.json();
}
const post=(route,payload,opts)=>request('/api/wedding/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},opts);
const project=(action,details)=>post('project',{action,...details});
const readProject=()=>request('/api/wedding/project');
const upload=(format,body,opts)=>request('/api/wedding/import?format='+format,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body},opts);
const fixture=(name)=>readFile(join(fixtureDir,name));
const sha=b=>createHash('sha256').update(b).digest('hex');
const ok=(label,values={})=>{checks[label]={passed:true,...values};};
let stage='inputs';
async function main(){
  if(!invitePath||!resultPath||invitePath===resultPath)fail('two_distinct_paths_required');
  const info=await lstat(invitePath);
  verify(info.isFile()&&(info.mode & 0o777)===0o600 && info.size<=1024,'private_invite_required');
  const link=new URL((await readFile(invitePath,'utf8')).trim(),origin);
  verify([origin,'https://staging.sendmynotes.com'].includes(link.origin) && link.pathname==='/thank-you/wedding' && !link.search && !link.username && !link.password,'staging_invite_required');
  const token=new URLSearchParams(link.hash.slice(1)).get('wedding');
  verify(/^[a-f0-9]{64}$/.test(token||''),'invalid_invite');
  stage='pilot admission';let state=await project('create',{sample:false});
  verify(!state.actor.pilot && state.households.length===0,'expected_empty_guest');
  const uninvited=await upload('csv','Family,Gift\nTest,book',{accept:[403]});
  verify(uninvited.code==='pilot_required','expected_pilot_guard');
  state=await project('redeem',{token});
  verify(state.actor.pilot&&!state.actor.verified,'guest_pilot_access');
  ok('pilot',{uninvitedStatus:403,invitedGuest:true});

  stage='structured fixtures';
  const csvData=await fixture('01-households-100.csv');
  const csv=await upload('csv',csvData);
  verify(csv.counts.guests===160&&csv.counts.households===100&&csv.rows[0].zip==='02108','csv_counts');
  const replay=await upload('csv',csvData);
  verify(replay.importId===csv.importId,'file_idempotency');
  const approved=csv.rows.map(r=>({...r,identityConfirmed:true,insideNameConfirmed:!!r.insideNames,addressConfirmed:!r.issues.length}));
  state=await project('importHouseholds',{rows:approved,importId:csv.importId});
  verify(state.imported===100 && state.households.length===100,'project_import_count');
  const appliedAgain=await project('importHouseholds',{rows:approved,importId:csv.importId});
  verify(appliedAgain.replay===true && appliedAgain.households.length===100,'project_replay');
  const tsvData=await fixture('02-planner-exceptions.tsv');
  const tsv=await upload('tsv',tsvData);
  verify(tsv.counts.households===8&&tsv.counts.alreadyThanked===1&&tsv.counts.missingAddresses===2,'tsv_counts');
  verify((await upload('tsv',tsvData.toString())).importId===tsv.importId,'paste_replay');
  const vcf=await upload('vcf',await fixture('03-phone-contacts.vcf'));
  verify(vcf.counts.households===4&&vcf.counts.missingAddresses===1,'vcard_counts');
  const multi=await upload('csv','Envelope name,Message\n"Example, Family","Thank you\nfor the cookbook."');
  verify(multi.rows.length===1&&multi.rows[0].body.includes('\n'),'quoted_multiline');
  ok('structuredLists',{namedGuests:160,csvHouseholds:100,persisted:100,tsvHouseholds:8,tsvMissingAddresses:2,vcardHouseholds:4,vcardMissingAddresses:1,replayAdded:0});

  stage='workbook and prose';
  const workbook=await upload('xlsx',await fixture('04-registry-and-addresses.xlsx'));
  verify(workbook.sheets.length===2&&workbook.counts.sourceRows===22&&workbook.rows.length===10,'xlsx_counts');
  verify(workbook.rows.some(r=>r.sourceId==='H002'&&r.sources.length===3)&&workbook.rows.some(r=>r.sourceId==='H007'&&r.alreadyThanked),'xlsx_gifts');
  verify(workbook.exceptions.some(e=>e.reason.includes('G12')) && workbook.rows.every(r=>!r.street1.includes('Couple Sample')),'registry_provenance');
  const txt=await upload('txt',await fixture('05-family-notes.txt'));
  verify(txt.excerpts.length===5&&txt.rows.length===0,'prose_review_required');
  const exact='We made your lemon pasta on Tuesday. Thank you for the blue bowl and the recipe.';
  verify(txt.excerpts[1].includes(exact) && txt.excerpts[2].includes('Anaïs') && txt.excerpts[3].includes('Robin') && txt.excerpts[4].includes('“M.”'),'prose_provenance');
  const manual=[
    {id:'manual_noor_kit',source:'Passage 2',envelopeName:'Noor Vale and Kit Gale',insideNames:'Noor and Kit',gift:'the blue bowl',body:exact,address:{address1:'9101 Imaginary Orchard Way',address2:'Unit 04',city:'Specimen Bay',state:'MA',zip:'02108',country:'US'}},
    {id:'manual_anais',source:'Passage 3',envelopeName:'Anaïs Wren',insideNames:'Anaïs',gift:'picnic blanket'},
    {id:'manual_robin',source:'Passage 4',envelopeName:'Robin Finch',gift:'cake stand',excluded:true},
  ];
  state=await project('importHouseholds',{rows:manual,importId:txt.importId});
  verify(state.imported===3 && state.project.householdCount===103,'manual_prose');
  verify(state.households.some(r=>r.bodyOverride===exact)&&state.households.some(r=>r.excluded && r.envelopeName==='Robin Finch'),'manual_prose_words');
  ok('workbookAndProse',{workbookSheets:2,mailingRows:10,giftRows:12,unassignedGifts:1,passages:5,manualHouseholds:3,onePassageDeferred:true,verbatimNotePreserved:true});
  for(const scenario of ['valid','ambiguous','missing_unit','unavailable']){
    const res=await post('import?action=postal',{scenario,address:{street1:'12 Sample Way',city:'Specimen Bay',state:'MA',zip:'02108',country:'US'}});
    verify(res.source==='staging_postal_fixture'&&res.status===scenario,'postal_fixture');
  }
  ok('postal',{controlledScenarios:4});

  stage='cover upload and preview';
  const w=680,h=880,pixels=Buffer.alloc(w*h*3,246);
  for(const [cornerX,cornerY,v] of [[0,0,40],[w-90,0,80],[0,h-90,120],[w-90,h-90,160]]) {
    for(let y=cornerY;y<cornerY+90;y++)for(let x=cornerX;x<cornerX+90;x++)pixels[(y*w+x)*3]=v;
  }
  const img=await sharp(pixels,{raw:{width:w,height:h,channels:3}}).png().toBuffer();
  const multipart=new FormData();multipart.set('file',new Blob([img],{type:'image/png'}),'synthetic-corners.png');
  const art=await request('/api/wedding/artwork',{method:'POST',body:multipart});
  const composed=await post('artwork',{action:'compose',assetId:art.assetId,fit:'cover',zoom:1.05,x:0.03,y:0,lettering:'Thank you'});
  verify(composed.assetId!==art.assetId,'separate_artwork_revision');
  state=await project('saveProject',{revision:state.project.revision,patch:{cover:{kind:'upload',id:composed.assetId,url:composed.url}}});
  const reload=await readProject();verify(reload.project.cover.id===composed.assetId,'cover_after_reload');
  const loadBytes=async()=>Buffer.from(await (await request('/api/wedding/artwork?id='+encodeURIComponent(composed.assetId),{}, {raw:true})).arrayBuffer());
  const stored=await loadBytes(), info2=await sharp(stored).metadata();
  verify(info2.format==='png'&&sha(stored)===sha(await loadBytes()),'private_cover_hash');
  ok('cover',{uploaded:true,composed:true,persistedAfterReload:true,format:info2.format,width:info2.width,height:info2.height});

  stage='invalid list containment';
  const before=await readProject();
  const rejected=await upload('xlsx',Buffer.from('This ordinary text is not an Excel workbook.'),{accept:[400,415,422],raw:true});
  const after=await readProject();
  verify(before.project.revision===after.project.revision&&before.project.householdCount===after.project.householdCount&&after.project.cover.id===composed.assetId,'reject_preserves_project');
  ok('resilience',{invalidWorkbookStatus:rejected.status,priorCoverAndRowsPreserved:true});

  stage='provider mapping and drafting';
  const meta=await request('/api/wedding/ai');
  if(!meta.available||meta.mode!=='real'){
    checks.realAi={passed:false,reason:meta.paused?'paused':'real_provider_unavailable'};
  } else {
    verify(meta.features?.map && meta.features?.draft,'ai_guest_features');
    const excerpt='Anaïs Wren sent the picnic blanket.';
    verify(txt.excerpts[2].includes(excerpt),'consented_excerpt_only');
    const m=await post('ai',{action:'map',excerpt,consent:true,idempotencyKey:randomUUID()});
    verify(Array.isArray(m.suggestions)&&m.suggestions.some(x=>/Anaïs/i.test(x.name)&&/blanket/i.test(x.gift)),'real_map_output');
    const row=before.households.find(r=>r.gift&&!r.bodyOverride&&!r.excluded);verify(!!row,'draft_row_exists');
    let drafted=await post('ai',{action:'draft',ids:[row.id],tone:'warm',consent:true,idempotencyKey:randomUUID()});
    if(!drafted.suggestions?.length && drafted.jobId) drafted=await post('ai',{action:'advance',jobId:drafted.jobId,consent:true,idempotencyKey:randomUUID()});
    verify(drafted.suggestions?.some(s=>s.id===row.id&&typeof s.text==='string'&&s.text.length>0),'real_draft_output');
    const outstanding=await readProject();verify(outstanding.households.find(r=>r.id===row.id)?.bodyOverride===row.bodyOverride,'ai_suggestion_unapplied');
    ok('realAi',{mode:'real',mappingSuggestions:m.suggestions.length,noteSuggestions:drafted.suggestions.length,explicitlyConsented:true,preservedSenderWords:true});
  }
  verify(Object.values(checks).every(c=>c.passed),'incomplete_acceptance');
}
try {await main();metrics.passed=true;}
catch(e){metrics.passed=false;metrics.failure={stage,reason:e instanceof CheckFailure?e.message:'request_or_fixture_error',status:e instanceof CheckFailure?e.status:undefined,code:e instanceof CheckFailure?e.code:undefined};process.exitCode=1;}
finally {
  // No raw rows, token, cookies, model text, private URLs, content hashes or IDs in output.
  if(resultPath&&resultPath!==invitePath)await writeFile(resultPath,JSON.stringify(metrics,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({passed:metrics.passed,completed:Object.keys(checks),failure:metrics.failure}));
}
