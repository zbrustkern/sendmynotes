import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/wedding/transfer/route';
import { POST as checkoutPost } from '../app/api/checkout/create-intent/route';
import { firestoreDb } from '../lib/firebase-admin';
import { setStripeClientFactoryForTests } from '../lib/stripe';
import { claimMultiSendCheckout, claimMultiSendRetry, recoverMultiSendCheckout, multiSendCheckoutOwnerKey, multiSendCheckoutRef, verifyMultiSendTransferProof } from '../lib/multi-send/checkout';
import { parseWeddingTransfer } from '../lib/wedding/transfer';
import { resolveWeddingNote, weddingWordingIssues } from '../lib/wedding/domain';

if(process.env.NODE_ENV!=='test'||!process.env.SMN_TEST_DATA_DIR)throw new Error('Run with isolated NODE_ENV=test SMN_TEST_DATA_DIR.');
const env=process.env as Record<string,string|undefined>;
env.ALLOW_LOCAL_MOCK_PAYMENTS='true';
const address={name:'Anaïs & Noor',addressLine1:'1 Example Street',addressLine2:'Unit 03',city:'Boston',state:'MA',zip:'02108',country:'US'};
function body(id=randomUUID()):any {return {paymentAttempted:false,draft:{selectedDesign:{source:'preset',presetId:'preset-thankyou-botanical',imageUrl:'https://untrusted.invalid/never-fetch',accepted:true},note:{salutation:'Dear Anaïs,',text:'Thank you.\nYour words matter. 💛',signOff:'With love,\nSam & Jo',style:'hwDavid'},sender:address,multiSend:{version:1,checkoutId:id,note:{text:'STALE NESTED NOTE'},recipients:[{id:'r1',address,greeting:{mode:'custom',text:''}},{id:'r2',address:{...address,name:'Mira',country:''},greeting:{mode:'inherit'}},{id:'r3',address:{...address,name:'Lee'},greeting:{mode:'custom',text:'Hello, Lee!'}}]}}};}
function request(payload:unknown,cookie='',authorization='',origin='http://localhost:3000',path='/api/wedding/transfer') {return new NextRequest(`http://localhost:3000${path}`,{method:'POST',headers:{'content-type':'application/json',host:'localhost:3000',origin,...(cookie?{cookie}:{}),...(authorization?{authorization}:{})},body:JSON.stringify(payload)});}
function cookies(response:Response) {return (response.headers.get('set-cookie')||'').split(/, (?=smn_)/).map(s=>s.split(';')[0]).join('; ');}
async function result(payload:any,cookie='',authorization='') {const response=await POST(request(payload,cookie,authorization));return {response,json:await response.json()};}
const cap='a'.repeat(64);
async function seed(options:{status?:string;pi?:string|null;state?:string;uid?:string}={}) {
  const b=body(),id=b.draft.multiSend.checkoutId,orderId=`order_${randomUUID()}`,paymentId=options.pi===null?null:options.pi||`pi_${randomUUID()}`;
  const order:any={id:orderId,viewToken:'proof_'+randomUUID(),status:options.status||'PENDING_PAYMENT',amountInCents:2700,paymentMode:'stripe_test',stripePaymentId:paymentId,createdAt:Date.now(),updatedAt:Date.now(),multiSend:{version:1,kind:'parent',checkoutId:id,contentRevision:'revision',recipients:b.draft.multiSend.recipients}};
  const ownerKey=multiSendCheckoutOwnerKey({checkoutId:id,userId:options.uid,guestCapability:cap});
  await firestoreDb.collection('orders').doc(orderId).set(order);
  await multiSendCheckoutRef(id).set({ownerKey,state:options.state||'active',currentOrderId:orderId,currentRevision:'revision',updatedAt:Date.now()});
  b.paymentAttempted=true;b.previousCheckout={orderId,viewToken:order.viewToken};
  return {b,order,ownerKey,cookie:`smn_multi_send_${id}=${cap}`};
}
function fake(order:any,options:{status?:string;cancelStatus?:string;cancelThrows?:boolean;afterError?:string;retrieveThrows?:boolean;mismatch?:boolean}={}) {
  let reads=0,cancels=0;
  const pi=(status:string)=>({id:order.stripePaymentId,livemode:false,amount:options.mismatch?1:order.amountInCents,currency:'usd',status,metadata:{orderId:order.id,contentRevision:order.multiSend.contentRevision,itemCount:String(order.multiSend.recipients.length)}});
  setStripeClientFactoryForTests(()=>({paymentIntents:{retrieve:async()=>{reads++;if(options.retrieveThrows)throw new Error('adapter unavailable');return pi(cancels&&options.afterError?options.afterError:options.status||'requires_confirmation');},cancel:async()=>{cancels++;if(options.cancelThrows)throw new Error('adapter timeout');return pi(options.cancelStatus||'canceled');},create:async()=>{throw new Error('Transfer must not create a Stripe intent');}}}) as any);
  return {reads:()=>reads,cancels:()=>cancels};
}
async function run() {
  const original=body(),serialized=JSON.stringify(original),parsed=parseWeddingTransfer(original);
  assert.equal(parsed.content.sharedBody,original.draft.note.text);
  assert.equal(parsed.content.households[0].greeting,'');
  assert.equal(parsed.content.households[2].greeting,'Hello, Lee!');
  assert.equal(parsed.content.households[1].address.country,'','missing country is never US');
  assert.equal(parsed.content.households[0].address.zip,'02108');
  assert.equal(parsed.content.households[0].firstName,'Anaïs & Noor','free-form names are preserved without splitting');
  assert.ok(parsed.content.households[1].greetingNeedsReview);
  assert.ok(parsed.content.cover.url!=='https://untrusted.invalid/never-fetch');
  assert.equal(JSON.stringify(original),serialized,'source draft is untouched');
  const bare=body();bare.draft.note.salutation='Mira,';assert.equal(parseWeddingTransfer(bare).content.households[1].greetingNeedsReview,true);
  const overflow=body();overflow.draft.note.text='x'.repeat(451);assert.equal(parseWeddingTransfer(overflow).content.sharedBody.length,451,'overlong words survive transfer for sender review');
  for(const field of ['uploadSelection','accountImage','privateUploadRecovery']) {
    const b=body();b.draft[field]={id:'foreign-private-design'};
    assert.equal((await result(b)).json.code,'TRANSFER_COVER_RESOLUTION_REQUIRED');
    b.coverResolution={presetId:'preset-thankyou-botanical'};
    assert.equal(parseWeddingTransfer(b).content.cover.kind,'preset','explicit resolution authorizes a selected preset');
  }
  const tooMany=body();tooMany.draft.multiSend.recipients=Array.from({length:26},(_,i)=>({...tooMany.draft.multiSend.recipients[0],id:`r${i}`}));
  assert.equal((await result(tooMany)).response.status,400);
  const duplicate=body();duplicate.draft.multiSend.recipients[1].id='r1';assert.equal((await result(duplicate)).response.status,400);
  const attempted=body();attempted.paymentAttempted=true;assert.equal((await result(attempted)).json.code,'TRANSFER_PAYMENT_PROOF_REQUIRED');
  assert.equal((await POST(request(body(),'','','https://foreign.invalid'))).status,403);
  const first=await result(original);assert.equal(first.response.status,200,JSON.stringify(first.json));
  assert.ok(first.response.headers.get('cache-control')?.includes('no-store'));
  assert.ok(first.response.headers.get('set-cookie')?.includes('HttpOnly'));
  assert.ok(!('sessionId' in first.json.actor));
  assert.ok(!('sessionToken' in first.json)&&!('capability' in first.json));
  assert.equal(first.json.copiedCount,3);assert.deepEqual(first.json.greetingReviewIds,['r2']);
  assert.equal(first.json.households[0].approvedFingerprint,null);
  assert.ok(weddingWordingIssues(first.json.project,first.json.households[1]).includes('Confirm the inside greeting.'));
  assert.equal(resolveWeddingNote(first.json.project,first.json.households[0]),original.draft.note.text+'\n\n'+original.draft.note.signOff);
  const cookie=cookies(first.response),id=original.draft.multiSend.checkoutId;
  const source=(await multiSendCheckoutRef(id).get()).data()!;
  const replay=await result(original,cookie);assert.equal(replay.response.status,200);assert.equal(replay.json.replay,true);assert.equal(replay.json.projectId,first.json.projectId);
  await firestoreDb.collection('weddingProjects').doc(first.json.projectId).collection('households').doc('r1').update({greeting:'Sender correction'});
  const editedReplay=await result(original,cookie);assert.equal(editedReplay.json.households[0].greeting,'Sender correction','retry never reapplies source content');
  const changed=structuredClone(original);changed.draft.note.text='Different content';assert.equal((await result(changed,cookie)).json.code,'TRANSFER_CONTENT_CONFLICT');
  assert.equal((await claimMultiSendCheckout({checkoutId:id,contentRevision:'new',orderId:'new',ownerKey:source.ownerKey})).code,'MULTI_SEND_TRANSFERRED');
  assert.equal(await claimMultiSendRetry(id,source.ownerKey,'new'),null);
  await assert.rejects(recoverMultiSendCheckout(id,source.ownerKey,'new'));
  const noIdentity=await result(original);assert.equal(noIdentity.response.status,403);assert.ok(!noIdentity.json.projectId);
  await firestoreDb.collection('weddingSessions').doc(source.weddingTransfer.sessionId).update({revoked:true});
  assert.equal((await result(original,cookie)).response.status,401,'source proof cannot undo wedding session revocation');
  const concurrent=body(),concurrentCookie=`smn_multi_send_${concurrent.draft.multiSend.checkoutId}=${cap}`;
  const raced=await Promise.all([result(concurrent,concurrentCookie),result(concurrent,concurrentCookie)]);
  assert.equal(raced.filter(r=>r.response.status===200).length,1);assert.equal(raced.filter(r=>r.response.status===409).length,1);

  // All payment tests use a local SDK adapter. No network or supplier dispatch.
  env.STRIPE_SECRET_KEY='sk_test_transfer_adapter_only';
  const pending=await seed();const calls=fake(pending.order);
  const bridge=await checkoutPost(request({action:'authorize-wedding-transfer',checkoutId:pending.b.draft.multiSend.checkoutId,previousCheckout:pending.b.previousCheckout},pending.cookie,'','http://localhost:3000','/api/checkout/create-intent'));
  assert.equal(bridge.status,200);assert.ok(bridge.headers.get('set-cookie')?.includes('Path=/api;'));assert.equal(calls.reads(),0);assert.equal(calls.cancels(),0);
  const unauthorizedBridge=await checkoutPost(request({action:'authorize-wedding-transfer',checkoutId:pending.b.draft.multiSend.checkoutId,previousCheckout:pending.b.previousCheckout},'','','http://localhost:3000','/api/checkout/create-intent'));assert.equal(unauthorizedBridge.status,403);
  const canceled=await result(pending.b,pending.cookie);assert.equal(canceled.response.status,200,JSON.stringify(canceled.json));assert.equal(calls.cancels(),1);
  assert.equal((await firestoreDb.collection('orders').doc(pending.order.id).get()).data()?.fulfillmentStatus,'WEDDING_TRANSFERRED');
  assert.equal((await result(pending.b,pending.cookie)).json.projectId,canceled.json.projectId);assert.equal(calls.cancels(),1);

  for(const status of ['succeeded','processing','requires_capture']) {
    const entry=await seed(),counter=fake(entry.order,{status});const answer=await result(entry.b,entry.cookie);
    assert.equal(answer.json.code,'TRANSFER_ORDER_STATUS');assert.equal(answer.json.paymentState,status==='succeeded'?'paid':'pending');assert.ok(answer.json.orderPath);assert.ok(!answer.json.projectId);assert.equal(counter.cancels(),0);
    assert.equal(await claimMultiSendRetry(entry.b.draft.multiSend.checkoutId,entry.ownerKey,entry.order.id),null);
  }
  for(const options of [{mismatch:true},{retrieveThrows:true},{cancelStatus:'requires_action'},{cancelThrows:true},{cancelStatus:'succeeded'}]) {
    const entry=await seed();fake(entry.order,options);const answer=await result(entry.b,entry.cookie);
    assert.equal(answer.json.code,'TRANSFER_ORDER_STATUS');assert.ok(!answer.json.projectId);
  }
  const timeout=await seed(),timeoutCalls=fake(timeout.order,{cancelThrows:true,afterError:'canceled'});
  assert.equal((await result(timeout.b,timeout.cookie)).response.status,200);assert.equal(timeoutCalls.reads(),2,'lost cancel response is reconciled by fresh intent evidence');
  const missing=await seed({pi:null});const missingCalls=fake(missing.order);assert.equal((await result(missing.b,missing.cookie)).json.paymentState,'uncertain');assert.equal(missingCalls.reads(),0);
  const paid=await seed({status:'PAYMENT_RECEIVED'}),paidCalls=fake(paid.order);assert.equal((await result(paid.b,paid.cookie)).json.paymentState,'paid');assert.equal(paidCalls.cancels(),0);
  paid.b.draft.uploadSelection={designId:'private-design'};assert.equal((await result(paid.b,paid.cookie)).json.paymentState,'paid','paid status does not require resolving the editable cover');
  const blocked=await seed({state:'blocked'});fake(blocked.order,{status:'canceled'});assert.equal((await result(blocked.b,blocked.cookie)).json.paymentState,'uncertain','blocked replacement may have another ambiguous intent');
  const creating=await seed({state:'creating'});fake(creating.order);assert.equal((await result(creating.b,creating.cookie)).json.code,'TRANSFER_CHECKOUT_BUSY');
  const proof=await seed();const proofCalls=fake(proof.order);
  const proofOnly=await result(proof.b);assert.equal(proofOnly.response.status,403);assert.ok(!proofOnly.json.orderPath);assert.equal(proofCalls.reads(),0);
  const badProof=structuredClone(proof.b);badProof.previousCheckout.viewToken='wrong';assert.equal((await result(badProof,proof.cookie)).json.code,'TRANSFER_PAYMENT_PROOF_REQUIRED');
  assert.equal(await verifyMultiSendTransferProof(proof.b.draft.multiSend.checkoutId,proof.ownerKey,badProof.previousCheckout),false);
  const noProof=structuredClone(proof.b);delete noProof.previousCheckout;noProof.paymentAttempted=false;assert.equal((await result(noProof,proof.cookie)).json.code,'TRANSFER_PAYMENT_PROOF_REQUIRED','client cannot hide an existing server checkout');
  const race=await seed();let release!:()=>void,started!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{started=resolve;});
  const racePI={id:race.order.stripePaymentId,livemode:false,amount:race.order.amountInCents,currency:'usd',metadata:{orderId:race.order.id,contentRevision:'revision',itemCount:'3'}};
  setStripeClientFactoryForTests(()=>({paymentIntents:{retrieve:async()=>{started();await waiting;return {...racePI,status:'requires_confirmation'};},cancel:async()=>({...racePI,status:'canceled'})}}) as any);
  const transferring=result(race.b,race.cookie);await arrived;
  const checkoutId=race.b.draft.multiSend.checkoutId;
  assert.equal((await claimMultiSendCheckout({checkoutId,contentRevision:'changed',orderId:'new_order',ownerKey:race.ownerKey,replaces:race.b.previousCheckout})).code,'MULTI_SEND_TRANSFERRED','a competing v1 revision cannot start during Stripe reconciliation');
  assert.equal(await claimMultiSendRetry(checkoutId,race.ownerKey,race.order.id),null);
  await assert.rejects(recoverMultiSendCheckout(checkoutId,race.ownerKey,race.order.id));
  release();assert.equal((await transferring).response.status,200);
  const owner=await seed({uid:'transfer-owner'});fake(owner.order);
  assert.equal((await result(owner.b,'','Bearer mock_token_foreign')).response.status,403);
  assert.equal((await result(owner.b,'','Bearer mock_token_transfer-owner')).response.status,200,'verified owner identity replaces guest capability');
  env.NODE_ENV='production';env.WEDDING_PROJECTS_ENABLED='false';
  assert.equal((await result(body())).response.status,503);
  env.NODE_ENV='test';setStripeClientFactoryForTests(null);
  console.log('Wedding transfer: content, private ownership, idempotency, v1 races, cancellation evidence, recovery fences, and runtime checks passed.');
}
run().catch(error=>{setStripeClientFactoryForTests(null);console.error(error);process.exitCode=1;});
