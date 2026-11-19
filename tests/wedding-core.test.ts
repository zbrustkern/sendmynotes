import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {weddingHash} from '../lib/wedding/hash';
import {newWeddingHousehold,resolveWeddingNote,weddingApprovalFingerprint,weddingRowReady,weddingWordingIssues,blankWeddingAddress,type WeddingProject} from '../lib/wedding/domain';

async function main(){
  assert.equal(process.env.NODE_ENV,'test');assert.ok(process.env.SMN_TEST_DATA_DIR,'Run node scripts/wedding/run-core-tests.mjs for isolated storage and network denial.');
  const {firestoreDb:db,isFirestoreMock}=await import('../lib/firebase-admin');assert.ok(isFirestoreMock,'Never run these fixtures against cloud Firestore.');
  const S=await import('../lib/wedding/server'),P=await import('../lib/wedding/project'),A=await import('../lib/wedding/address'),Pilot=await import('../lib/wedding/pilot');
  const Route=await import('../app/api/wedding/project/route'),AddressRoute=await import('../app/api/wedding/address/route');
  let checks=0;
  async function check(label:string,fn:()=>unknown|Promise<unknown>){await fn();checks++;console.log(`PASS ${label}`);}
  const request=(body?:unknown,cookie='',uid?:string,origin='https://wedding.test')=>new Request('https://wedding.test/api/wedding/project',{method:body===undefined?'GET':'POST',headers:{host:'wedding.test',origin,...(cookie?{cookie:`${S.WEDDING_COOKIE}=${cookie}`}:{}) ,...(uid?{authorization:`Bearer mock_token_${uid}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  async function setup(sample=false){const created=await P.createWeddingProject(`device_${Math.random()}`,sample);return {...created,actor:await S.requireWeddingActor(request(undefined,created.token))};}
  const ctx=await setup(),owner=ctx.actor;
  const state=()=>P.weddingState(owner);
  const rowInput=(name:string,country='US')=>({envelopeName:name,firstName:name,lastName:'',insideName:name,gift:'A blue bowl',identityConfirmed:true,insideNameConfirmed:true,address:{address1:'101 Example Lane',address2:'',city:'Chicago',state:'IL',zip:'00101',country},addressConfirmed:true});
  await check('portable SHA-256 agrees with Node across Unicode and block boundaries',()=>{for(const value of ['', 'abc','Anaïs 👩🏽‍💻','a'.repeat(55),'b'.repeat(64),'x'.repeat(2000)])assert.equal(weddingHash(value),createHash('sha256').update(value).digest('hex'));});
  await check('empty project and sample are separate; country never defaults',async()=>{assert.equal((await state()).households.length,0);assert.equal((await state()).project.returnAddress.country,'');const sample=await setup(true);assert.equal((await P.weddingState(sample.actor)).households.length,100);assert.equal(blankWeddingAddress().country,'');});
  await check('same-origin writes, private response and no client-owned fields',async()=>{
    const cross=await Route.POST(request({action:'saveProject',revision:1,patch:{}},ctx.token,undefined,'https://other.test'));assert.equal(cross.status,403);
    for(const patch of [{purchasedCount:100},{ownerId:'mine'},{activeBatchId:null},{canPay:true},{pilot:true}])await assert.rejects(()=>P.saveWeddingProject(owner,{revision:1,patch}),{code:'forbidden_field'});
    const get=await Route.GET(request(undefined,ctx.token));assert.equal(get.status,200);assert.match(get.headers.get('cache-control')!,/no-store/);
    assert.equal((await Route.GET(request())).status,401);
  });
  let first='',second='';
  await check('revision-checked household creation and concurrent saves',async()=>{
    first=(await P.saveWeddingHousehold(owner,{patch:rowInput('Noor and Kit')})).householdId;second=(await P.saveWeddingHousehold(owner,{patch:rowInput('Anaïs')})).householdId;
    const attempts=await Promise.allSettled([P.saveWeddingHousehold(owner,{id:first,revision:1,patch:{gift:'Bowl A'}}),P.saveWeddingHousehold(owner,{id:first,revision:1,patch:{gift:'Bowl B'}})]);
    assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
    await assert.rejects(()=>P.saveWeddingHousehold(owner,{id:first,revision:2,patch:{paidBatchId:'fake'}}),{code:'forbidden_field'});
  });
  await check('shared note approvals require exact displayed versions',async()=>{
    let st=await state();await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{sharedBody:'Thank you for thinking of us.',signOff:'Love,\nAlex & Jamie'}});st=await state();
    await P.approveWeddingHouseholds(owner,{ids:[first,second],revisions:Object.fromEntries(st.households.map(h=>[h.id,h.revision])),projectRevision:st.project.revision,mode:'shared'});
    st=await state();assert.ok(st.households.every(h=>weddingRowReady(st.project,h)));assert.match(resolveWeddingNote(st.project,st.households.find(h=>h.id===second)!),/^Dear Anaïs,/);
    const stale=st;await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{sharedBody:'Thank you for being so thoughtful.'}});
    await assert.rejects(()=>P.approveWeddingHouseholds(owner,{ids:[first],revisions:{[first]:stale.households.find(h=>h.id===first)!.revision},mode:'shared'}),{code:'revision_conflict'});
  });
  await check('personal overrides survive shared changes; street changes preserve note approval',async()=>{
    let st=await state(),h=st.households.find(h=>h.id===first)!;await P.saveWeddingHousehold(owner,{id:first,revision:h.revision,patch:{bodyOverride:'We used your bowl on Tuesday.',signOffOverride:'With love,\nAlex'}});
    st=await state();h=st.households.find(h=>h.id===first)!;await P.approveWeddingHouseholds(owner,{ids:[first],revisions:{[first]:h.revision},mode:'individual'});
    st=await state();h=st.households.find(h=>h.id===first)!;const fingerprint=h.approvedFingerprint;
    await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{sharedBody:'A changed group note.',signOff:'Thanks,\nJamie'}});
    st=await state();h=st.households.find(h=>h.id===first)!;assert.equal(h.approvedFingerprint,fingerprint);assert.equal(h.bodyOverride,'We used your bowl on Tuesday.');
    await P.saveWeddingHousehold(owner,{id:first,revision:h.revision,patch:{address:{...h.address,address2:'Unit 2'}}});st=await state();h=st.households.find(h=>h.id===first)!;
    assert.equal(h.approvedFingerprint,fingerprint);assert.equal(h.addressConfirmed,false);assert.equal(weddingRowReady(st.project,h),false);
    await P.saveWeddingHousehold(owner,{id:first,revision:h.revision,patch:{insideName:'Kit and Noor'}});assert.equal((await state()).households.find(h=>h.id===first)!.approvedFingerprint,null);
  });
  await check('templates revision only invalidates inheritors; personal templates require individual review',async()=>{
    let st=await state();await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{templates:[{id:'t1',name:'Family',body:'A family note.',signOff:'With love'}]}});st=await state();const h=st.households.find(h=>h.id===second)!;
    await P.saveWeddingHousehold(owner,{id:second,revision:h.revision,patch:{templateId:'t1'}});st=await state();const r=st.households.find(h=>h.id===second)!;
    await P.approveWeddingHouseholds(owner,{ids:[second],revisions:{[second]:r.revision},mode:'shared'});st=await state();const before=st.households.find(h=>h.id===second)!;
    await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{sharedBody:'Default changed again'}});st=await state();assert.equal(st.households.find(h=>h.id===second)!.approvedFingerprint,before.approvedFingerprint);
    await P.saveWeddingProject(owner,{revision:st.project.revision,patch:{templates:[{id:'t1',name:'Family',body:'Revised family note.',signOff:'With love'}]}});st=await state();assert.equal(st.project.templates[0].revision,2);assert.equal(st.households.find(h=>h.id===second)!.approvedFingerprint,null);
    await assert.rejects(()=>P.saveWeddingProject(owner,{revision:st.project.revision,patch:{templates:[]}}),{code:'template_in_use'});
  });
  await check('449/450/451 UTF-16 units, literal blank greeting, placeholders and named shared salutation',async()=>{
    const st=await state(),p={...st.project,sharedBody:'',signOff:''};let h={...newWeddingHousehold('fit'),...rowInput('Joint'),greeting:'',bodyOverride:'x'.repeat(448)+'😀',signOffOverride:'',templateId:null};
    assert.equal(resolveWeddingNote(p,h).length,450);assert.equal(weddingWordingIssues(p,h).length,0);
    h={...h,bodyOverride:'x'.repeat(449)};assert.equal(resolveWeddingNote(p,h).length,449);
    h={...h,bodyOverride:'x'.repeat(449)+'😀'};assert.ok(weddingWordingIssues(p,h).some(s=>s.includes('451/450')));
    const unresolved={...h,bodyOverride:'Thanks',greeting:null,insideNameConfirmed:false};assert.ok(weddingWordingIssues(p,unresolved).length);
    assert.ok(weddingWordingIssues({...p,sharedBody:'Dear Noor, thank you.'},{...h,bodyOverride:null}).length);
    assert.ok(weddingWordingIssues(p,{...h,bodyOverride:'Thank you {{name}}.'}).length);
  });
  await check('imports replay without overwriting edits; distinct households at one street stay separate',async()=>{
    const data={importId:'import_fixture',mappingVersion:'v1',rows:[{sourceId:'H1',source:'Sheet1!2',...rowInput('One'),address:{...rowInput('One').address,country:''}},{sourceId:'H2',source:'Sheet1!3',...rowInput('Two')}]};
    assert.equal((await P.importWeddingHouseholds(owner,data)).imported,2);const st=await state(),h=st.households.find(h=>h.sourceHouseholdId==='H1')!;assert.equal(h.address.country,'');assert.equal(h.provenance[0].sourceRowId,'Sheet1!2');
    await P.saveWeddingHousehold(owner,{id:h.id,revision:h.revision,patch:{gift:'Sender correction'}});assert.equal((await P.importWeddingHouseholds(owner,data)).replay,true);assert.equal((await state()).households.find(r=>r.id===h.id)!.gift,'Sender correction');
    await assert.rejects(()=>P.importWeddingHouseholds(owner,{...data,rows:data.rows.slice(0,1)}),{code:'import_conflict'});
    const conflict=await P.importWeddingHouseholds(owner,{...data,importId:'second_import'});assert.equal(conflict.imported,0);assert.equal(conflict.conflicts.length,2);
    await assert.rejects(()=>P.importWeddingHouseholds(owner,{importId:'evil',rows:[{...rowInput('Bad'),canPay:true}]}),{code:'forbidden_field'});
  });
  await check('250-household bounded import is atomic and pagination preserves every row',async()=>{
    const large=await setup();const rows=Array.from({length:250},(_,i)=>({...rowInput(`Family ${i}`),sourceId:`family_${i}`}));await P.importWeddingHouseholds(large.actor,{importId:'max',rows});
    let cursor:string|undefined;const ids=new Set<string>();do{const page=await P.weddingState(large.actor,{limit:100,cursor});page.households.forEach(h=>ids.add(h.id));cursor=page.nextCursor||undefined;}while(cursor);assert.equal(ids.size,250);
    await assert.rejects(()=>P.saveWeddingHousehold(large.actor,{patch:rowInput('Overflow')}),{code:'household_limit'});
  });
  await check('one-time singleton recovery exchange wins only once and never exposes a query token',async()=>{
    const old=await P.inviteWeddingMember(owner,{kind:'device'}),fresh=await P.inviteWeddingMember(owner,{kind:'device'});assert.ok(!fresh.link.includes('?'));assert.match(fresh.link,/#wedding=/);
    await assert.rejects(()=>P.redeemWeddingInvite(old.link.split('=')[1]),{code:'link_expired'});
    const token=fresh.link.split('=')[1],results=await Promise.allSettled([P.redeemWeddingInvite(token),P.redeemWeddingInvite(token)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const success=results.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof P.redeemWeddingInvite>>>;
    const device=await S.requireWeddingActor(request(undefined,success.value.token!));assert.equal(device.actorId,owner.actorId);
    await P.revokeWeddingInvite(owner,fresh.inviteId);await assert.rejects(()=>S.requireWeddingActor(request(undefined,success.value.token!)),{code:'session_expired'});
  });
  const invitation=await P.inviteWeddingMember(owner,{kind:'partner'}),partnerSession=await P.redeemWeddingInvite(invitation.link.split('=')[1]),partner=await S.requireWeddingActor(request(undefined,partnerSession.token!));
  await check('partner writes without privileges; export, self-grant, foreign project and stale owner denied',async()=>{
    await P.saveWeddingHousehold(partner,{patch:rowInput('Partner-created')});await assert.rejects(()=>P.exportWeddingTracker(partner),{code:'export_forbidden'});
    await assert.rejects(()=>P.changeWeddingGrant(partner,{actorId:partner.actorId,canPay:true,canExport:true}),{code:'self_grant'});
    await assert.rejects(async()=>P.weddingState({...partner,projectId:(await setup()).projectId}),{code:'unauthorized'});
    await assert.rejects(()=>P.changeWeddingGrant({...owner,verified:true,authTime:Date.now()-11*60_000},{actorId:partner.actorId,canPay:true,canExport:true}),{code:'reauth_required'});
  });
  const ownerIdentity={uid:'fixture_owner',email:'fixture_owner@example.com',authTime:Date.now(),admin:false},partnerIdentity={uid:'fixture_partner',email:'fixture_partner@example.com',authTime:Date.now(),admin:false};
  await P.claimWeddingMembership(owner,ownerIdentity);await P.claimWeddingMembership(partner,partnerIdentity);
  const verifiedOwner=await S.requireWeddingActor(request(undefined,ctx.token,ownerIdentity.uid)),verifiedPartner=await S.requireWeddingActor(request(undefined,partnerSession.token!,partnerIdentity.uid));
  await check('account identity binding and independent export/pay grants are checked at download time',async()=>{
    assert.equal(verifiedOwner.verified,true);await assert.rejects(()=>S.requireWeddingActor(request(undefined,ctx.token,'wrong_account')),{code:'account_mismatch'});
    await assert.rejects(()=>P.claimWeddingMembership(owner,partnerIdentity),{code:'account_mismatch'});
    await P.changeWeddingGrant(verifiedOwner,{actorId:partner.actorId,canPay:false,canExport:true});const csv=await P.exportWeddingTracker(verifiedPartner);assert.match(csv,/Household/);assert.ok(!csv.includes('Example Lane'));assert.ok(!csv.includes('Bowl'));
    await assert.rejects(()=>S.requireWeddingActor(request(undefined,partnerSession.token!,partnerIdentity.uid),'pay'),{code:'pay_forbidden'});
    await P.changeWeddingGrant(verifiedOwner,{actorId:partner.actorId,canPay:true,canExport:false});await S.requireWeddingActor(request(undefined,partnerSession.token!,partnerIdentity.uid),'pay');
    await assert.rejects(()=>P.exportWeddingTracker(verifiedPartner),{code:'export_forbidden'});
  });
  await check('CSV neutralizes formulas after whitespace and omits private fields',async()=>{
    const result=await P.saveWeddingHousehold(owner,{patch:{...rowInput(' \t=SUM(1,1)'),gift:'@command'}});assert.ok(result.householdId);
    const csv=await P.exportWeddingTracker(verifiedOwner,true);assert.ok(csv.includes("' \t=SUM"));assert.ok(csv.includes("'@command"));assert.ok(!csv.includes('address1'));assert.ok(!csv.includes('Thank you for'));
  });
  await check('household address link cannot grant project access, changes only pending address, and requires sender review',async()=>{
    const invited=await P.inviteWeddingMember(owner,{kind:'address',householdId:first}),token=invited.link.split('=')[1];await assert.rejects(()=>P.redeemWeddingInvite(token),{code:'address_link'});
    const session=await A.exchangeWeddingAddress(token);await assert.rejects(()=>A.exchangeWeddingAddress(token),{code:'link_expired'});
    const before=(await state()).households.find(h=>h.id===first)!;
    await A.useWeddingAddressSession(session.token,{address:{address1:'12 Example Avenue',address2:'',city:'Toronto',state:'ON',zip:'M5V 2T6',country:'CA'}});
    const pending=(await state()).households.find(h=>h.id===first)!;assert.deepEqual(pending.address,before.address);assert.equal(pending.bodyOverride,before.bodyOverride);assert.equal(pending.pendingAddress!.address.country,'CA');
    await P.acceptWeddingAddress(owner,{id:first,revision:pending.revision});assert.equal((await state()).households.find(h=>h.id===first)!.address.country,'CA');
    await P.revokeWeddingInvite(owner,invited.inviteId);await assert.rejects(()=>A.useWeddingAddressSession(session.token),{code:'link_expired'});
    const response=await AddressRoute.POST(new Request('https://wedding.test/api/wedding/address',{method:'POST',headers:{host:'wedding.test',origin:'https://evil.test'},body:JSON.stringify({action:'submit',address:{}})}));assert.equal(response.status,403);
  });
  await check('pilot invitations require a recent verified operator and expire/revoke server-side',async()=>{
    await assert.rejects(()=>Pilot.issueWeddingPilot(ownerIdentity),{code:'admin_required'});
    const admin={...ownerIdentity,admin:true},pilot=await Pilot.issueWeddingPilot(admin,owner.projectId);
    const other=await setup();await assert.rejects(()=>P.redeemWeddingInvite(pilot.link.split('=')[1],other.actor),{code:'invite_scope'});
    await P.redeemWeddingInvite(pilot.link.split('=')[1],owner);assert.equal((await S.requireWeddingActor(request(undefined,ctx.token))).pilot,true);
    await Pilot.revokeWeddingPilot(admin,pilot.inviteId);assert.equal((await S.requireWeddingActor(request(undefined,ctx.token))).pilot,false);
  });
  await check('reservation fences settings and all household edits; revocation keeps checkout fenced for reconciliation',async()=>{
    const ref=S.weddingProjectRef(owner.projectId);await ref.update({activeBatchId:'wb_fixture',checkoutActorId:partner.actorId});let st=await state();const row=st.households[0];
    await assert.rejects(()=>P.saveWeddingProject(owner,{revision:st.project.revision,patch:{signOff:'Changed'}}),{code:'checkout_reserved'});
    await assert.rejects(()=>P.saveWeddingHousehold(owner,{id:row.id,revision:row.revision,patch:{excluded:true}}),{code:'checkout_reserved'});
    await P.changeWeddingGrant(verifiedOwner,{actorId:partner.actorId},true);const project=(await ref.get()).data()!;assert.equal(project.activeBatchId,'wb_fixture');assert.equal(project.paymentReconciliationRequired,true);assert.equal(project.checkoutRevocationRequestedFor,partner.actorId);
    await assert.rejects(()=>P.exportWeddingTracker(verifiedPartner),{code:'access_revoked'});await assert.rejects(()=>P.weddingState(partner),{code:'access_revoked'});
    await ref.update({activeBatchId:null,paymentReconciliationRequired:false,checkoutRevocationRequestedFor:null});
  });
  await check('paid rows and asynchronous paid-ledger rows are immutable for every role',async()=>{
    const ref=S.weddingProjectRef(owner.projectId);const st=await state(),h=st.households.find(h=>h.id===first)!;await ref.collection('households').doc(first).update({paidBatchId:'paid_fixture'});
    await assert.rejects(()=>P.saveWeddingHousehold(owner,{id:first,revision:h.revision,patch:{bodyOverride:'rewrite'}}),{code:'already_purchased'});
    await ref.update({paidHouseholds:{[second]:'paid_async'},purchasedCount:2});const r=(await state()).households.find(h=>h.id===second)!;
    await assert.rejects(()=>P.saveWeddingHousehold(owner,{id:second,revision:r.revision,patch:{addressConfirmed:false}}),{code:'already_purchased'});
  });
  await check('expiry blocks edits, explicit extension preserves materials and paid snapshots',async()=>{
    const ref=S.weddingProjectRef(owner.projectId);await ref.update({expiresAt:Date.now()-1});assert.equal((await state()).expired,true);
    await assert.rejects(()=>P.saveWeddingHousehold(owner,{patch:rowInput('Expired')}),{code:'project_expired'});await P.extendWeddingProject(owner);assert.equal((await state()).expired,false);assert.equal((await state()).project.purchasedCount,2);
  });
  await check('signed-in unclaimed projects remain usable and account recovery requires current membership',async()=>{
    const fresh=await setup();const signed=await S.requireWeddingActor(request(undefined,fresh.token,'unclaimed_fixture'));assert.equal(signed.verified,false);await P.weddingState(signed);
    const listed=await P.listWeddingAccountProjects(ownerIdentity);assert.ok(listed.projects.some(p=>p.projectId===owner.projectId));
    const resumed=await P.resumeWeddingAccount(ownerIdentity,{projectId:owner.projectId,actorId:owner.actorId});const actor=await S.requireWeddingActor(request(undefined,resumed.token,ownerIdentity.uid));assert.equal(actor.verified,true);
    await assert.rejects(()=>P.resumeWeddingAccount(partnerIdentity,{projectId:owner.projectId,actorId:owner.actorId}),{code:'account_mismatch'});
    await assert.rejects(()=>P.resumeWeddingAccount(partnerIdentity,{projectId:partner.projectId,actorId:partner.actorId}),{code:'account_mismatch'});
    await P.revokeWeddingSession(owner,actor.sessionId);await assert.rejects(()=>S.requireWeddingActor(request(undefined,resumed.token,ownerIdentity.uid)),{code:'session_expired'});
  });
  await check('retention sweep rotates, skips active/paid masters, and deletes only scoped normalized unpaid artwork',async()=>{
    const Retention=await import('../lib/wedding/retention'),expired=await setup();const ref=S.weddingProjectRef(expired.projectId);
    await P.importWeddingHouseholds(expired.actor,{importId:'expiry_source',rows:[rowInput('Expired household')]});
    const old=Date.now()-9*86_400_000;
    await ref.update({expiresAt:old});const hash=weddingHash('synthetic pixels'),prefix=`wedding-normalized/staging/${weddingHash(expired.projectId).slice(0,32)}/`;
    await ref.collection('artwork').doc('art_fixture').set({id:'art_fixture',projectId:expired.projectId,policy:'wedding-raster-v1',verdict:'accepted_for_import',storageKey:`${prefix}${hash}.png`,sourceKey:`${prefix}${hash}.png`});
    await S.weddingProjectRef(owner.projectId).update({expiresAt:old});const paidMaster='wedding-paid-retained/staging/fixture/batch.png';await S.weddingProjectRef(owner.projectId).collection('artworkPins').doc('paid').set({storageKey:paidMaster,status:'ready'});
    const active=await setup();await S.weddingProjectRef(active.projectId).update({expiresAt:old,activeBatchId:'reserved_fixture'});
    await Retention.cleanupWeddingDrafts();await Retention.cleanupWeddingSourceRecords();await Retention.cleanupWeddingSourceRecords();const removed:string[]=[];await Retention.cleanupWeddingDraftArtwork(async key=>{removed.push(key);});
    assert.equal(removed.length,1);assert.ok(removed.every(key=>key.startsWith(prefix)));assert.ok((await ref.get()).data()!.deletedAt);assert.equal((await ref.collection('households').get()).size,0);
    assert.equal((await S.weddingProjectRef(owner.projectId).collection('artworkPins').doc('paid').get()).data()!.storageKey,paidMaster);
    assert.ok(!(await S.weddingProjectRef(active.projectId).get()).data()!.deletedAt);
    const later=await setup();await S.weddingProjectRef(later.projectId).update({expiresAt:old+1});for(let i=0;i<5;i++)await Retention.cleanupWeddingDrafts(Date.now(),1);assert.ok((await S.weddingProjectRef(later.projectId).get()).data()!.deletedAt);
  });
  await check('production is disabled without explicit staged runtime',()=>{const env=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});try{assert.throws(()=>S.assertWeddingRuntime(),{code:'wedding_disabled'});}finally{Object.assign(process.env,{NODE_ENV:env});}});
  console.log(`Wedding core: ${checks} isolated checks passed. No cloud or fulfillment access.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
