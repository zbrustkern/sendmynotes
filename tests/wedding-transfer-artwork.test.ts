import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {NextRequest} from 'next/server';
import {firestoreDb as db,isFirestoreMock} from '../lib/firebase-admin';
import {accountDoc,accountScope} from '../lib/account/http';
import {accountLibraryKey,type LibraryObjectStore} from '../lib/account/library-storage';
import {uploadCollections} from '../lib/upload/access';
import {createWeddingArtworkService} from '../lib/wedding/artwork';
import {createWeddingArtworkHandlers} from '../lib/wedding/artwork-http';
import {createTransferArtworkBoundary} from '../lib/wedding/transfer-artwork';
import {transferWeddingDraft} from '../lib/wedding/transfer';
import {multiSendCheckoutRef,multiSendCheckoutOwnerKey,claimMultiSendRetry,recoverMultiSendCheckout} from '../lib/multi-send/checkout';
import {setStripeClientFactoryForTests} from '../lib/stripe';

if(process.env.NODE_ENV!=='test'||!process.env.SMN_TEST_DATA_DIR||!isFirestoreMock)throw new Error('Isolated test database required.');
const env=process.env as Record<string,string|undefined>;
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const code=(expected:string)=>(e:any)=>e?.code===expected;
const resolution=code('TRANSFER_COVER_RESOLUTION_REQUIRED');
const originals=new Map<string,Buffer>(),copies=new Map<string,Buffer>();
let sourceReads=0,copyWrites=0,processing=0,afterWrite:(()=>Promise<void>)|undefined;
const library:LibraryObjectStore={async get(key){sourceReads++;return originals.get(key)||null;},async put(key,b){originals.set(key,Buffer.from(b));},async delete(key){originals.delete(key);}};
const objects={
  async putOnce(key:string,bytes:Buffer){copyWrites++;assert.ok(key.startsWith('wedding-normalized/'),'no raw pending upload is written');const old=copies.get(key);if(old)assert.deepEqual(old,bytes);else copies.set(key,Buffer.from(bytes));if(afterWrite)await afterWrite();return {generation:'isolated-fixture-generation'};},
  async read(key:string,maxBytes:number){const b=copies.get(key);assert.ok(b);assert.ok(b.length<=maxBytes);return Buffer.from(b);},
  async remove(){throw Error('No raw bytes are accepted or cleaned by adoption.');},
};
const art=createWeddingArtworkService({db,objects,assertRuntime:()=>{},process:async()=>{processing++;throw Error('Approved front adoption must not process images.');}});
const boundary=createTransferArtworkBoundary({libraryStore:library,readPrivate:async key=>{sourceReads++;const b=originals.get(key);assert.ok(b);return Buffer.from(b);},adopt:art.adoptNormalized});
function body():any{return {paymentAttempted:false,draft:{selectedDesign:{source:'account',accepted:true,imageUrl:'https://foreign.invalid/never-fetch'},note:{text:'Thank you for celebrating with us.',salutation:'',signOff:'Sam & Jo',style:'hwDavid'},sender:{name:'Sam & Jo',addressLine1:'2 Example Street',city:'Boston',state:'MA',zip:'02108',country:'US'},multiSend:{version:1,checkoutId:randomUUID(),recipients:[{id:'household',address:{name:'Mira',addressLine1:'1 Example Street',city:'Boston',state:'MA',zip:'02108',country:'US'},greeting:{mode:'custom',text:''}}]}}};}
function req(b:any,uid?:string,cookie=''){return new NextRequest('http://localhost:3000/api/wedding/transfer',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',...(uid?{authorization:`Bearer mock_token_${uid}`}:{}) ,...(cookie?{cookie}:{})},body:JSON.stringify(b)});}
const transfer=(b:any,uid?:string)=>transferWeddingDraft(req(b,uid),b,undefined,boundary);
async function grant(uid:string,revoked=false){await uploadCollections.col('uploadAccess').doc(uploadCollections.envKey(uid)).set({uid,revoked,expiresAt:Date.now()+3600000});}
async function saved(uid:string,bytes:Buffer,requiresUploadGrant=false,kind='generated_front'){
  const id=`img_${randomUUID().replaceAll('-','')}`,key=accountLibraryKey(uid,id,1,'front'),hash=sha(bytes),ref=accountDoc('images',uid,id);
  originals.set(key,Buffer.from(bytes));await ref.set({id,ownerUid:uid,ownerScope:accountScope(uid),kind,title:'Fictional accepted front',version:1,state:'ready',masterKey:key,masterSha256:hash,contentType:'image/png',width:1275,height:1650,requiresUploadGrant,createdAt:Date.now(),updatedAt:Date.now(),sourceCacheId:'fictional-generated-source'});
  return {ref,key,selection:{imageId:id,version:1,masterSha256:hash}};
}
async function studio(uid:string,bytes:Buffer){
  const id=`design_${randomUUID()}`,key=`upload-private/test/${createHash('sha256').update(uid).digest('hex').slice(0,32)}/design/${randomUUID()}.png`,hash=sha(bytes),ref=uploadCollections.col('uploadDesigns').doc(uploadCollections.envKey(id));
  originals.set(key,Buffer.from(bytes));await ref.set({id,uid,revision:1,masterKey:key,masterSha256:hash,acceptedAt:Date.now(),expiresAt:Date.now()+3600000,generationId:'fictional-generation'});
  return {ref,key,selection:{source:'upload',designId:id,revision:1,masterSha256:hash,accepted:true,title:'Fictional Studio front'}};
}
async function main(){
  // Raster creation is fixture setup only. Transfer's worker must remain unused.
  const png=await sharp({create:{width:1275,height:1650,channels:3,background:'#284c3b'}}).png().toBuffer();
  env.WEDDING_PILOT_UIDS='pilot-owner,foreign-owner,other-pilot';
  const image=await saved('pilot-owner',png),b=body();b.draft.accountImage=image.selection;
  const before=JSON.stringify(b),first=await transfer(b,'pilot-owner');
  assert.equal(first.body.transferred,true);assert.equal(first.body.project.cover.kind,'upload');assert.equal(first.body.project.cover.hash,sha(png));
  assert.deepEqual(await art.read(first.body.projectId,first.body.project.cover.id),png,'authorized generated library front is preserved byte-for-byte');
  assert.equal(JSON.stringify(b),before);assert.equal(processing,0);
  const publicBody=JSON.stringify(first.body);assert.ok(!publicBody.includes('masterKey')&&!publicBody.includes('account-library/')&&!publicBody.includes('base64')&&!publicBody.includes('foreign.invalid'));
  const copied=(await db.collection('weddingProjects').doc(first.body.projectId).collection('artwork').doc(first.body.project.cover.id).get()).data()!;
  assert.notEqual(copied.storageKey,image.key);assert.equal(copied.sourceSha256,copied.sha256);
  const provenance=(await db.collection('weddingProjects').doc(first.body.projectId).collection('transferSources').doc('cover').get()).data()!;
  assert.equal(provenance.ownerUid,'pilot-owner');assert.equal(provenance.source.imageId,image.selection.imageId);assert.equal(provenance.sha256,sha(png));assert.ok(!publicBody.includes('ownerUid'));
  const reads=sourceReads,writes=copyWrites;
  const completedFallback=structuredClone(b);completedFallback.coverResolution={presetId:'preset-thankyou-botanical'};
  await assert.rejects(()=>transfer(completedFallback,'pilot-owner'),code('TRANSFER_CONTENT_CONFLICT'),'explicit fallback cannot replace a completed copy');
  await image.ref.update({state:'deleted',deletedAt:Date.now()});originals.delete(image.key);env.WEDDING_PILOT_UIDS='foreign-owner,other-pilot';
  const replay=await transfer(b,'pilot-owner');assert.equal(replay.body.projectId,first.body.projectId);assert.equal(replay.body.replay,true);assert.equal(sourceReads,reads);assert.equal(copyWrites,writes,'completed retry does not reacquire source data or permissions');
  const source=(await multiSendCheckoutRef(b.draft.multiSend.checkoutId).get()).data()!;
  const member=db.collection('weddingProjects').doc(first.body.projectId).collection('members').doc(source.weddingTransfer.actorId);
  await member.update({uid:'another-claimed-account'});await assert.rejects(()=>transfer(b,'pilot-owner'),code('TRANSFER_OWNER_MISMATCH'),'old v1 ownership cannot bypass a subsequently claimed project identity');await member.update({uid:null});
  await db.collection('weddingSessions').doc(source.weddingTransfer.sessionId).update({revoked:true});
  await assert.rejects(()=>transfer(b,'pilot-owner'),code('unauthorized'));assert.equal(copyWrites,writes,'retired destination session cannot be resurrected via v1');
  env.WEDDING_PILOT_UIDS='pilot-owner,foreign-owner,other-pilot';

  const other=await saved('pilot-owner',png),foreign=body();foreign.draft.accountImage=other.selection;
  await assert.rejects(()=>transfer(foreign,'foreign-owner'),resolution);await assert.rejects(()=>transfer(foreign),resolution);
  await assert.rejects(()=>boundary.resolve(req(foreign,'pilot-owner'),{uid:'pilot-owner',email:'pilot-owner@example.com',emailVerified:false},{kind:'account',...other.selection}),resolution);
  const regular=await saved('ordinary-account',png),uninvited=body();uninvited.draft.accountImage=regular.selection;
  await assert.rejects(()=>transfer(uninvited,'ordinary-account'),resolution);
  await grant('ordinary-account');const studioMember=await transfer(uninvited,'ordinary-account');assert.equal(studioMember.body.project.cover.hash,sha(png),'current Studio member may copy an approved library front without a pilot invitation');
  const sourceOnly=await saved('pilot-owner',png,false,'uploaded_source'),raw=body();raw.draft.accountImage=sourceOnly.selection;await assert.rejects(()=>transfer(raw,'pilot-owner'),resolution);
  const corrupt=await saved('pilot-owner',png),bad=body();bad.draft.accountImage=corrupt.selection;originals.set(corrupt.key,Buffer.from('corrupted private object'));await assert.rejects(()=>transfer(bad,'pilot-owner'),resolution);
  const withMetadata=await sharp(png).withMetadata({exif:{IFD0:{Artist:'Fictional private metadata'}}}).png().toBuffer();
  const metadata=await saved('pilot-owner',withMetadata),dirty=body();dirty.draft.accountImage=metadata.selection;await assert.rejects(()=>transfer(dirty,'pilot-owner'),resolution,'adoption never silently processes/strips new metadata');
  const urlOnly=body();urlOnly.draft.selectedDesign={source:'custom',accepted:true,customId:'public-cache-id',imageUrl:'https://foreign.invalid/raw.png'};await assert.rejects(()=>transfer(urlOnly,'pilot-owner'),resolution);
  urlOnly.coverResolution={presetId:'preset-thankyou-botanical'};assert.equal((await transfer(urlOnly,'pilot-owner')).body.project.cover.kind,'preset','explicit fallback remains available');

  await grant('studio-owner');const design=await studio('studio-owner',png),sb=body();sb.draft.selectedDesign={source:'upload',accepted:true,imageUrl:'/api/upload/not-a-source'};sb.draft.uploadSelection=design.selection;
  const accepted=await transfer(sb,'studio-owner');assert.deepEqual(await art.read(accepted.body.projectId,accepted.body.project.cover.id),png);
  const secondBody=body();secondBody.draft.selectedDesign=sb.draft.selectedDesign;secondBody.draft.uploadSelection=design.selection;
  const second=await transfer(secondBody,'studio-owner');assert.notEqual(second.body.project.cover.id,accepted.body.project.cover.id,'same source becomes a distinct project-scoped asset');
  await assert.rejects(()=>art.read(second.body.projectId,accepted.body.project.cover.id),code('not_found'));
  const revoked=body();revoked.draft.selectedDesign=sb.draft.selectedDesign;revoked.draft.uploadSelection=design.selection;await grant('studio-owner',true);await assert.rejects(()=>transfer(revoked,'studio-owner'),resolution);
  await grant('studio-owner');await design.ref.update({acceptedAt:null});await assert.rejects(()=>transfer(revoked,'studio-owner'),resolution);await design.ref.update({acceptedAt:Date.now(),expiresAt:Date.now()-1});await assert.rejects(()=>transfer(revoked,'studio-owner'),resolution);
  const rebound=body();rebound.draft.selectedDesign={source:'upload',accepted:true,imageUrl:accepted.body.project.cover.url};await assert.rejects(()=>transfer(rebound,'studio-owner'),resolution,'wedding URL alone grants no cross-project adoption');

  await grant('revoked-during-copy');const racingImage=await saved('revoked-during-copy',png,true,'upload_front'),race=body();race.draft.accountImage=racingImage.selection;
  afterWrite=async()=>{afterWrite=undefined;await grant('revoked-during-copy',true);};
  await assert.rejects(()=>transfer(race,'revoked-during-copy'),resolution);
  const fenced=(await multiSendCheckoutRef(race.draft.multiSend.checkoutId).get()).data()!;assert.equal(fenced.state,'transferring');assert.ok(!fenced.weddingTransfer.projectId,'revocation leaves no completed/payable transfer');
  race.coverResolution={presetId:'preset-thankyou-botanical'};
  assert.equal((await transfer(race,'revoked-during-copy')).body.project.cover.kind,'preset','explicit fallback can recover an unfinished failed adoption without bypassing the source fence');

  // Already accepted generated order master: owner + v1 proof + exact private
  // generated identity are required. A cache ID/remote URL can never select it.
  const ob=body(),orderId=`order_${randomUUID()}`,ownerUid='other-pilot',key=`upload-orders/test/${createHash('sha256').update(ownerUid).digest('hex').slice(0,32)}/order/${orderId}.png`;
  originals.set(key,Buffer.from(png));const master={uid:ownerUid,designId:`generated_${orderId}`,revision:1,masterKey:key,masterSha256:sha(png),requiresUploadGrant:false,contentType:'image/png'};
  const order={id:orderId,userId:ownerUid,viewToken:'fixture-proof',status:'PENDING_PAYMENT',paymentMode:'stripe_test',stripePaymentId:'pi_fixture',amountInCents:900,uploadMaster:master,multiSend:{kind:'parent',version:1,checkoutId:ob.draft.multiSend.checkoutId,contentRevision:'fixture-revision',recipients:[{}]}};
  await db.collection('orders').doc(orderId).set(order);const ownerKey=multiSendCheckoutOwnerKey({checkoutId:ob.draft.multiSend.checkoutId,userId:ownerUid});
  await multiSendCheckoutRef(ob.draft.multiSend.checkoutId).set({ownerKey,state:'active',currentOrderId:orderId,currentRevision:'fixture-revision',updatedAt:Date.now()});
  ob.paymentAttempted=true;ob.previousCheckout={orderId,viewToken:'fixture-proof'};ob.draft.selectedDesign={source:'custom',accepted:true,customId:master.designId,imageUrl:'https://foreign.invalid/ignored'};
  env.STRIPE_SECRET_KEY='sk_test_isolated_adapter_only';let canceled=0;
  const intent={id:'pi_fixture',livemode:false,amount:900,currency:'usd',metadata:{orderId,contentRevision:'fixture-revision',itemCount:'1'}};
  setStripeClientFactoryForTests(()=>({paymentIntents:{retrieve:async()=>({...intent,status:'requires_confirmation'}),cancel:async()=>{canceled++;return {...intent,status:'canceled'};}}}) as any);
  const generated=await transfer(ob,ownerUid);assert.equal(generated.body.project.cover.hash,sha(png));assert.equal(canceled,1);
  assert.equal(await claimMultiSendRetry(ob.draft.multiSend.checkoutId,ownerKey,orderId),null);await assert.rejects(recoverMultiSendCheckout(ob.draft.multiSend.checkoutId,ownerKey,orderId));
  const afterCopy=copyWrites;assert.equal((await transfer(ob,ownerUid)).body.projectId,generated.body.projectId);assert.equal(copyWrites,afterCopy);assert.equal(canceled,1);
  // adoptStudio still requires verified sign-in, and WEDDING_REQUIRE_PILOT=true enforces pilot gating when enabled.
  const unverifiedHandlers=createWeddingArtworkHandlers(async()=>({projectId:accepted.body.projectId,actorId:'guest',pilot:false,verified:false}));
  const unverifiedDenied=await unverifiedHandlers.POST(req({action:'adoptStudio',designId:design.selection.designId},'studio-owner'));assert.equal(unverifiedDenied.status,401);
  env.WEDDING_REQUIRE_PILOT='true';
  try {
    const handlers=createWeddingArtworkHandlers(async()=>({projectId:accepted.body.projectId,actorId:'guest',pilot:false,verified:true}));
    const denied=await handlers.POST(req({action:'adoptStudio',designId:design.selection.designId},'studio-owner'));assert.equal(denied.status,403);
  } finally { delete env.WEDDING_REQUIRE_PILOT; }
  assert.equal(processing,0);setStripeClientFactoryForTests(null);
  console.log('Wedding artwork transfer passed: authorized library, Studio and pinned generated fronts; exact bytes; pilot/grant enforcement; revoked/foreign/expired sources; project isolation; idempotency and retired sessions.');
}
main().catch(error=>{setStripeClientFactoryForTests(null);console.error(error);process.exitCode=1;});
