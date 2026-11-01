import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as people,POST as createPerson } from '../app/api/account/people/route';
import { GET as person } from '../app/api/account/people/[id]/route';
import { GET as occasions } from '../app/api/account/occasions/route';
import { GET as images } from '../app/api/account/images/route';
import { GET as drafts } from '../app/api/account/drafts/route';
import { GET as history } from '../app/api/account/history/route';
import { POST as importPeople } from '../app/api/account/people/import/route';
import { GET as legacyAccount } from '../app/api/account/route';
import { getOrdersCollection } from '../lib/firebase-admin';
import { GET as preferences,PATCH as savePreferences } from '../app/api/account/preferences/route';
const req=(route:string,uid?:string,method='GET',body?:unknown,origin='http://localhost:3000')=>new NextRequest(`http://localhost:3000/api/account/${route}`,{method,headers:{host:'localhost:3000',origin,...(uid?{authorization:`Bearer mock_token_${uid}`} : {}),'Content-Type':'application/json','Idempotency-Key':'route-security-create-001'},...(body?{body:JSON.stringify(body)}:{})});
const importReq=(uid:string,key:string,rows:unknown[])=>new NextRequest('http://localhost:3000/api/account/people/import',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000',authorization:`Bearer mock_token_${uid}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({rows})});
async function run(){
  for(const [name,handler] of Object.entries({people,occasions,images,drafts,history,preferences})){
    const response=await handler(req(name));assert.equal(response.status,401,`${name} requires auth`);assert.match(response.headers.get('cache-control')||'',/private.*no-store/);
  }
  const foreign=await createPerson(req('people','owner','POST',{displayName:'Example'},'https://foreign.invalid'));assert.equal(foreign.status,403);
  const created=await createPerson(req('people','owner','POST',{displayName:'Example',ownerUid:'victim',ownerScope:'forged'}));assert.equal(created.status,201);const {data}=await created.json();assert.ok(data.id);assert.equal(data.ownerUid,undefined);assert.equal(data.ownerScope,undefined);
  assert.equal((await person(req(`people/${data.id}`,'victim'),{params:Promise.resolve({id:data.id})})).status,404);
  assert.equal((await person(req(`people/${data.id}`,'owner'),{params:Promise.resolve({id:data.id})})).status,200);
  const ownList=await people(req('people?limit=20','owner'));const result=await ownList.json();assert.ok(Array.isArray(result.data));assert.ok(result.data.some((row:any)=>row.id===data.id));
  const importRow={importIndex:2,displayName:'Imported Friend',address:null,occasion:{title:'Birthday',type:'birthday',month:5,day:18,year:1990},remindMe:false};
  const imported=await importPeople(importReq('import-owner','import_batch_key_001',[importRow]));assert.equal(imported.status,200);const importResult=(await imported.json()).data;assert.equal(importResult.created,1);assert.equal(importResult.occasionsCreated,1);
  const retried=await importPeople(importReq('import-owner','import_batch_key_001',[importRow]));const retryResult=(await retried.json()).data;assert.equal(retryResult.alreadyImported,1);assert.equal(retryResult.occasionsAlreadyImported,1);
  const mismatchedRetry=await importPeople(importReq('import-owner','import_batch_key_001',[{...importRow,remindMe:true}]));const mismatchResult=(await mismatchedRetry.json()).data;assert.equal(mismatchResult.results[0].occasionStatus,'error','a retry with changed reminder consent cannot claim an existing date was newly created');
  const optedIn=await importPeople(importReq('import-owner','import_batch_key_002',[{...importRow,importIndex:3,displayName:'Another Friend',remindMe:true}]));const optedResult=(await optedIn.json()).data;assert.equal(optedResult.occasionsCreated,1);
  const { accountDoc }=await import('../lib/account/http');const optedEvent=(await accountDoc('occasions','import-owner',optedResult.results[0].occasionId).get()).data();assert.equal(optedEvent?.consentSource,'contact_import_checkbox');
  const baseline=await preferences(req('preferences','owner'));const pref=(await baseline.json()).data;
  const updated=await savePreferences(req('preferences','owner','PATCH',{displayName:'Sender',timeZone:'America/Chicago',expectedVersion:pref.version}));assert.equal(updated.status,200);
  const stale=await savePreferences(req('preferences','owner','PATCH',{displayName:'Stale',expectedVersion:pref.version}));assert.equal(stale.status,409);
  await getOrdersCollection().doc('order_route_own').set({id:'order_route_own',userId:'owner',customerEmail:'owner@example.com',status:'MAILED',createdAt:1,updatedAt:1,frontImageUrl:'/presets/example.png',handwrittenNote:'Personal note',printedMessage:'',viewToken:'never-return-token',stripePaymentId:'never-return-payment'});
  await getOrdersCollection().doc('order_route_foreign').set({id:'order_route_foreign',userId:'victim',customerEmail:'owner@example.com',status:'MAILED',createdAt:2,updatedAt:2,frontImageUrl:'/presets/example.png',handwrittenNote:'Foreign private message',printedMessage:''});
  const legacy=await legacyAccount(req('','owner'));assert.equal(legacy.status,200);const legacyData=await legacy.json();assert.equal(legacyData.orders.length,1);assert.equal(legacyData.orders[0].id,'order_route_own');assert.equal(legacyData.orders[0].viewToken,undefined);assert.equal(legacyData.orders[0].stripePaymentId,undefined);
  console.log('Account API security: private caching, authentication, CSRF, owner spoofing, cross-account reads and optimistic conflict passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
