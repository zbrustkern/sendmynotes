// Run only against staging. Disposable Firebase accounts use the reserved .invalid domain.
// Verification is set by the staging IAM operator for these two new fixtures only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const origin='https://staging.sendmynotes.com', project='sendmynotes-staging';
const output=process.argv[2];
if (!output || process.argv[3]!=='--staging-test') throw new Error('Supply a sanitized receipt path and --staging-test.');
const source=await readFile('lib/firebase-client.ts','utf8');
const key=source.match(/const STAGING_FIREBASE_CONFIG\s*=\s*\{\s*apiKey:\s*"([^"]+)"/)?.[1];
assert.ok(key,'Known staging Firebase web configuration required.');
const operator=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const checks=[], accounts=[];
async function identity(path,body,privileged=false){
  const url='https://identitytoolkit.googleapis.com/v1/'+(privileged?'projects/'+project+'/':'')+path+(privileged?'':'?key='+encodeURIComponent(key));
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...(privileged?{'Authorization':'Bearer '+operator,'x-goog-user-project':project}:{Origin:origin,Referer:origin+'/'} )},body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});
  const d=await r.json();if(!r.ok)throw Error(path+' returned '+r.status+' '+String(d.error?.message||'').split(':')[0].slice(0,70));return d;
}
async function newIdentity(){
  const email='sprint0031-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(24).toString('base64url');
  const user=await identity('accounts:signUp',{email,password,returnSecureToken:true}); accounts.push(user.localId);
  await identity('accounts:update',{localId:user.localId,emailVerified:true},true);
  const result=await identity('accounts:signInWithPassword',{email,password,returnSecureToken:true});
  assert.equal(result.localId,user.localId);return result.idToken;
}
async function request(ctx,body,expected=200,path='/api/wedding/project'){
  const headers={origin,'content-type':'application/json',cookie:[...ctx.jar].map(([k,v])=>k+'='+v).join('; '),...(ctx.token?{authorization:'Bearer '+ctx.token}:{})};
  const r=await fetch(origin+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45_000)});
  for(const kv of r.headers.getSetCookie()){const [k,v]=kv.split(';')[0].split('=');ctx.jar.set(k,v);}
  const isJson=r.headers.get('content-type')?.includes('application/json');
  const d=isJson?await r.json():await r.text();
  assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status), (body?.action||'read')+' returned '+r.status+' '+(isJson?(d.code||d.error||''):''));
  return d;
}
const ctx=()=>({jar:new Map(),token:null});
const owner=ctx(),partner=ctx(),laptop=ctx(),recipient=ctx();
const secret=r=>new URL(r.link,origin).hash.split('=')[1];
const address={address1:'101 Example Lane',address2:'',city:'Boston',state:'MA',zip:'02108',country:'US'};
try {
  let s=await request(owner,{action:'create'},201);
  s=await request(owner,{action:'importHouseholds',importId:'synthetic-scale',rows:Array.from({length:250},(_,i)=>({
    sourceId:'G'+(i+1),envelopeName:'Sample family '+i,firstName:'Sample '+i,insideNames:'Household '+i,gift:'a serving bowl',address,addressConfirmed:true,
  }))});
  assert.equal(s.households.length,250);
  await request(owner,{action:'saveHousehold',patch:{firstName:'Over capacity'}},409);
  checks.push('250 households imported in one request; household 251 held.');
  const device=await request(owner,{action:'invite',kind:'device'});
  let lap=await request(laptop,{action:'redeem',token:secret(device)});
  assert.equal(lap.project.id,s.project.id);await request(ctx(),{action:'redeem',token:secret(device)},410);
  const invite=await request(owner,{action:'invite',kind:'partner'});
  let peer=await request(partner,{action:'redeem',token:secret(invite)});
  assert.equal(peer.actor.role,'editor');
  let row=peer.households[36];
  peer=await request(partner,{action:'saveHousehold',id:row.id,revision:row.revision,patch:{bodyOverride:'Thank you for the blue bowl. We loved sharing dinner with you.'}});
  await request(laptop,{action:'saveHousehold',id:row.id,revision:row.revision,patch:{bodyOverride:'A concurrent edit.'}},409);
  lap=await request(laptop);assert.equal(lap.households.find(r=>r.id===row.id).bodyOverride,'Thank you for the blue bowl. We loved sharing dinner with you.');
  checks.push('Two owner devices and one partner resume the same project; overlapping changes preserve the saved note.');
  await request(owner,{action:'export'},403);
  await request(partner,{action:'export'},403);
  const link=await request(owner,{action:'invite',kind:'address',householdId:row.id});
  await request(recipient,{action:'redeem',token:secret(link)},200,'/api/wedding/address');
  await request(recipient,null,401);
  await request(recipient,{action:'submit',address:{...address,address1:'44 Example Way'}},200,'/api/wedding/address');
  s=await request(owner); row=s.households.find(r=>r.id===row.id); assert.ok(row.pendingAddress);
  s=await request(owner,{action:'acceptAddress',id:row.id,revision:row.revision});assert.equal(s.households.find(r=>r.id===row.id).address.address1,'44 Example Way');
  checks.push('Address invitation sees only one form; proposed address enters the project only after owner review.');
  owner.token=await newIdentity();partner.token=await newIdentity();
  s=await request(owner,{action:'claim'});peer=await request(partner,{action:'claim'});
  const actorId=peer.actor.actorId;
  assert.equal(peer.actor.verified,true);await request(partner,{action:'export'},403);
  await request(owner,{action:'grant',actorId,canPay:false,canExport:true});
  const csv=await request(partner,{action:'export',includeGift:true});
  assert.ok(csv.includes('serving bowl')&&!csv.includes('Example Lane')&&!csv.includes('sharing dinner'));
  await request(owner,{action:'grant',actorId,canPay:true,canExport:false});
  await request(partner,{action:'export'},403);
  await request(owner,{action:'revoke',actorId});
  await request(partner,null,[401,403]);
  checks.push('Verified owner and verified partner claim separate identities; export-only, pay-only and immediate revocation are enforced.');
  s=await request(owner);
  const other=s.sessions.find(d=>d.actorId===s.actor.actorId&&!d.current);
  assert.ok(other);await request(owner,{action:'revokeSession',sessionId:other.sessionId});
  await request(laptop,null,[401,403]);
  checks.push('Owner revokes a single device while their own session remains active.');
} finally {
  for(const id of accounts) await identity('accounts:delete',{localId:id},true);
  await writeFile(output,JSON.stringify({checkedAt:new Date().toISOString(),origin,checks,fixtureAccountsRemoved:accounts.length},null,2)+'\n');
}
console.log(JSON.stringify({passed:checks.length,fixtureAccountsRemoved:accounts.length}));
