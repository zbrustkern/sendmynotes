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
    const st=await state(),p={...st.project,sharedBody:'',signOff:''};let h={...newWeddingHousehold('fit'),...rowInput('Joint'),greeting:'',bodyOverride:'x'.repeat(450),signOffOverride:'',templateId:null};
    assert.equal(resolveWeddingNote(p,h).length,450);assert.equal(weddingWordingIssues(p,h).length,0);
    h={...h,bodyOverride:'x'.repeat(448)+'😀'};assert.equal(resolveWeddingNote(p,h).length,450);assert.ok(weddingWordingIssues(p,h).some(s=>s.includes('😀')));
    h={...h,bodyOverride:'x'.repeat(449)};assert.equal(resolveWeddingNote(p,h).length,449);assert.equal(weddingWordingIssues(p,h).length,0);
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
  await check('only a verified linked operator sees the independent tester invitation control',async()=>{
    const fixture=await setup(), uid='wedding-pilot-operator', previous=process.env.ADMIN_AUTHORIZED_EMAILS;
    process.env.ADMIN_AUTHORIZED_EMAILS=uid+'@example.com';
    try {
      const signed=request(undefined,fixture.token,uid);
      assert.equal(S.publicWeddingActor(await S.requireWeddingActor(signed)).canIssuePilotInvites,false);
      await P.claimWeddingMembership(fixture.actor,(await S.weddingIdentity(signed,true))!);
      assert.equal(S.publicWeddingActor(await S.requireWeddingActor(signed)).canIssuePilotInvites,true);
      assert.equal(S.publicWeddingActor(await S.requireWeddingActor(request(undefined,fixture.token))).canIssuePilotInvites,false);
      assert.equal(S.publicWeddingActor(verifiedPartner).canIssuePilotInvites,false);
    } finally { if(previous===undefined)delete process.env.ADMIN_AUTHORIZED_EMAILS;else process.env.ADMIN_AUTHORIZED_EMAILS=previous; }
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
    const fresh=await setup();const failedSignIn=request(undefined,fresh.token);failedSignIn.headers.set('authorization','Bearer invalid_fixture');assert.equal((await S.requireWeddingActor(failedSignIn)).verified,false);await P.weddingState(await S.requireWeddingActor(failedSignIn));const signed=await S.requireWeddingActor(request(undefined,fresh.token,'unclaimed_fixture'));assert.equal(signed.verified,false);await P.weddingState(signed);
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
  await check('revoking a consumed partner invitation removes account recovery and fences its existing intent',async()=>{
    const fresh=await setup(),invite=await P.inviteWeddingMember(fresh.actor,{kind:'partner'}),redeemed=await P.redeemWeddingInvite(invite.link.split('=')[1]);
    const editor=await S.requireWeddingActor(request(undefined,redeemed.token!));await P.claimWeddingMembership(editor,partnerIdentity);
    const ref=S.weddingProjectRef(fresh.projectId);await ref.update({activeBatchId:'wb_link_fixture',checkoutActorId:editor.actorId});
    await P.revokeWeddingInvite(fresh.actor,invite.inviteId);const current=(await ref.get()).data()!;assert.equal(current.activeBatchId,'wb_link_fixture');assert.equal(current.paymentReconciliationRequired,true);
    await assert.rejects(()=>P.resumeWeddingAccount(partnerIdentity,{projectId:fresh.projectId,actorId:editor.actorId}),{code:'account_mismatch'});
  });
  await check('expired AI pages drain past retained calls, preserving reconciliation and replay evidence', async () => {
    const {cleanupWeddingDrafts} = await import('../lib/wedding/retention');
    const {createWeddingAiService} = await import('../lib/wedding/ai');
    const at = Date.now(), expired = at - 190 * 86_400_000;
    const {projectId} = await setup();
    const project = S.weddingProjectRef(projectId);
    await project.update({expiresAt: expired, deletedAt: expired + 7 * 86_400_000, retentionCheckedFor: expired});
    const progress = db.collection('weddingDraftCleanup').doc(projectId);
    await progress.set({projectId, state: 'complete'}); // Already processed by the old cleanup.
    const jobs = project.collection('aiJobs'), receipts = project.collection('aiRequests');
    const audit = project.collection('aiJobAudit');
    const run = {id: 'invocation', ids: ['r1'], startedAt: expired - 10, deadline: expired, state: 'running', attempts: 1};
    const item = {id: 'r1', householdId: 'household1', revision: 3, state: 'pending', contextHash: 'hash'};
    const metadata = {projectId, actorId: 'actor', deviceId: 'device', action: 'draft', inputHash: 'input-hash',
      consents: {actor: {inputHash: 'input-hash', policy: 'fixture', at: expired}}, estimatedCents: 10,
      provider: {provider: 'fixture', mode: 'synthetic-test'}, createdAt: expired - 100, expiresAt: expired};
    const privateFields = {prompt: 'synthetic private prompt', headers: ['synthetic private heading'],
      excerpt: 'synthetic private passage', assetId: 'private-front', result: {suggestions: [{name: 'synthetic private result'}]},
      items: [{...item, gift: 'synthetic private gift', memory: 'synthetic private memory', text: 'synthetic private note'}]};
    const receipt = (id: string) => ({jobId: id, actorId: 'actor', action: 'draft', inputHash: 'input-hash', at: expired, expiresAt: expired});
    // A full first page must be skippable even when every invocation is preserved.
    for (let i = 0; i < 10; i++) {
      const id = 'a' + i;
      await jobs.doc(id).set({...metadata, ...privateFields, id, status: i === 0 ? 'running' : 'unresolved', run: {...run, id: 'invoke_' + id}});
      await receipts.doc(id).set(receipt(id));
    }
    const complete = 'z_complete';
    await jobs.doc(complete).set({...metadata, ...privateFields, id: complete, status: 'ready', run: {...run, state: 'complete'}});
    await receipts.doc(complete).set(receipt(complete));
    const fenced = 'z_fenced';
    await jobs.doc(fenced).set({...metadata, ...privateFields, id: fenced, status: 'canceled', run: null});
    await receipts.doc(fenced).set(receipt(fenced));
    const budgets = db.collection('weddingAiBudgets'), budget = {events: [], inflight: [
      {jobId: 'a0', callId: 'invoke_a0', deadline: expired}, {jobId: fenced, callId: 'fenced_call', deadline: 0},
    ]};
    const budgetRefs = [budgets.doc('project_' + weddingHash(projectId)), budgets.doc('device_' + weddingHash('device')), budgets.doc('deployment')];
    for (const ref of budgetRefs) await ref.set(budget);
    // Simulate a later child expiry. Neither its text nor its earlier receipt is due.
    const future = 'z_future', futureData = {...metadata, ...privateFields, id: future, expiresAt: at + 3600000, status: 'queued', run: null};
    await jobs.doc(future).set(futureData);
    await receipts.doc(future).set(receipt(future));
    await receipts.doc('z_orphan').set(receipt('removed_job'));
    await receipts.doc('z_unexpired').set({...receipt('removed_job'), expiresAt: at + 3600000});

    // The enclosing project sweep rotates too. Each visit advances one child page.
    for (let i = 0; i < 4 && !(await progress.get()).data()?.aiJobAfter; i++) await cleanupWeddingDrafts(at);
    assert.equal((await progress.get()).data()!.aiJobAfter, 'a9');
    assert.deepEqual((await jobs.doc(complete).get()).data()!.result, privateFields.result);
    const cleaned = (await jobs.doc('a0').get()).data()!;
    assert.deepEqual(cleaned, {...metadata, id: 'a0', status: 'running', run: {...run, id: 'invoke_a0'}, items: [item]});
    assert.deepEqual((await receipts.doc('a0').get()).data(), receipt('a0'));

    for (let i = 0; i < 4 && (await jobs.doc(complete).get()).exists; i++) await cleanupWeddingDrafts(at);
    assert.equal((await jobs.doc(complete).get()).exists, false);
    assert.deepEqual((await audit.doc(complete).get()).data(), {...metadata, id: complete, status: 'ready', run: {...run, state: 'complete'}, items: [item]});
    assert.equal((await receipts.doc(complete).get()).exists, false);
    assert.deepEqual((await jobs.doc(fenced).get()).data()!.items, [item]);
    assert.deepEqual((await receipts.doc(fenced).get()).data(), receipt(fenced));
    assert.deepEqual((await jobs.doc(future).get()).data(), futureData);
    assert.ok((await receipts.doc(future).get()).exists);
    assert.ok(!(await receipts.doc('z_orphan').get()).exists && (await receipts.doc('z_unexpired').get()).exists);
    for (const ref of budgetRefs) assert.deepEqual((await ref.get()).data(), budget);
    assert.equal((await progress.get()).data()!.state, 'complete');

    // Exercise the real operator transaction against the stripped job.
    const service = createWeddingAiService({testRuntime: true});
    const email = 'retention-operator@example.invalid', previous = process.env.ADMIN_AUTHORIZED_EMAILS;
    process.env.ADMIN_AUTHORIZED_EMAILS = email;
    try {
      const input = {projectId, jobId: 'a0', runId: 'invoke_a0', decision: 'confirmed_terminal' as const, evidenceReference: 'synthetic-provider-evidence'};
      assert.equal((await service.reconcile(request(undefined, '', email), input)).status, 'failed');
      const reconciled = (await jobs.doc('a0').get()).data()!;
      assert.equal(reconciled.reconciliation.evidenceHash, weddingHash(input.evidenceReference));
      await cleanupWeddingDrafts(at);
      assert.deepEqual((await jobs.doc('a0').get()).data(), reconciled);
      assert.deepEqual((await receipts.doc('a0').get()).data(), receipt('a0'));
      assert.equal((await service.reconcile(request(undefined, '', email), input)).status, 'failed');
      for (const ref of budgetRefs) assert.deepEqual((await ref.get()).data()!.inflight, [budget.inflight[1]]);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_AUTHORIZED_EMAILS;
      else process.env.ADMIN_AUTHORIZED_EMAILS = previous;
    }
  });
  await check('AI cleanup preserves active, reserved and unproven paid projects and bounds network signal deletion', async () => {
    const {cleanupWeddingDrafts} = await import('../lib/wedding/retention');
    const at = Date.now(), expired = at - 190 * 86_400_000;
    const active = await setup(), reserved = await setup(), mixed = await setup(), unpaid = await setup();
    const refs = [active, reserved, mixed, unpaid].map(({projectId}) => S.weddingProjectRef(projectId));
    await refs[1].update({expiresAt: expired, activeBatchId: 'batch'});
    await refs[2].update({expiresAt: expired, purchasedCount: 1, householdCount: 2, paidHouseholds: {paid: 'paid_batch'}});
    await refs[3].update({expiresAt: expired});
    const paid = {...rowInput('Synthetic ordered household'), id: 'paid', paidBatchId: 'paid_batch'};
    const draft = {...rowInput('Synthetic unpaid household'), id: 'unpaid', paidBatchId: null};
    await refs[2].collection('households').doc('paid').set(paid);
    await refs[2].collection('households').doc('unpaid').set(draft);
    const frozen = {id: 'paid_batch', snapshotHash: 'synthetic frozen hash'};
    await db.collection('weddingBatches').doc('paid_batch').set(frozen);
    const data = {id: 'map_job', status: 'ready', expiresAt: expired, excerpt: 'synthetic private passage', items: []};
    for (const ref of refs) {
      await ref.collection('aiJobs').doc(data.id).set({...data, projectId: ref.id});
      await ref.collection('aiRequests').doc('request').set({jobId: data.id, expiresAt: expired});
    }
    const signals = db.collection('weddingAiNetworkSignals');
    for (let i = 0; i < 101; i++) await signals.doc('expired_' + i).set({expiresAt: at, attempts: [at - 600000]});
    const future = {expiresAt: at + 600000, attempts: [at]};
    await signals.doc('current').set(future);
    assert.equal((await cleanupWeddingDrafts(at)).ai.networkSignalsDeleted, 100);
    assert.equal((await cleanupWeddingDrafts(at)).ai.networkSignalsDeleted, 1);
    assert.deepEqual((await signals.doc('current').get()).data(), future);
    for (const ref of refs.slice(0, 3)) {
      assert.deepEqual((await ref.collection('aiJobs').doc(data.id).get()).data(), {...data, projectId: ref.id});
      assert.ok((await ref.collection('aiRequests').doc('request').get()).exists);
    }
    assert.ok((await refs[3].get()).data()!.deletedAt);
    assert.equal((await refs[3].collection('aiJobs').doc(data.id).get()).exists, false);
    assert.equal((await refs[3].collection('aiRequests').doc('request').get()).exists, false);
    assert.deepEqual((await refs[2].collection('households').doc('paid').get()).data(), paid);
    assert.deepEqual((await refs[2].collection('households').doc('unpaid').get()).data(), draft);
    assert.deepEqual((await db.collection('weddingBatches').doc('paid_batch').get()).data(), frozen);
  });
  async function paidFixture(withDraft: boolean, upload = true) {
    const {priceWeddingSelection, digest} = await import('../lib/wedding/finance');
    const {recordPaymentCaptureFact, FINANCIAL_FACTS_COLLECTION} = await import('../lib/financial-ledger');
    const ctx = await setup(), project = S.weddingProjectRef(ctx.projectId);
    await P.claimWeddingMembership(ctx.actor, ownerIdentity);
    const at = Date.now(), expired = at - 9 * 86_400_000;
    const id = 'wb_' + project.id, intent = 'pi_' + project.id, sha = weddingHash('synthetic paid front');
    const segment = weddingHash(project.id).slice(0, 32), storageKey = 'wedding-normalized/staging/' + segment + '/' + sha + '.png';
    const cover = upload ? {kind:'upload', id:'front', hash:sha, url:'/api/wedding/artwork?id=front', masterKey:storageKey} :
      {kind:'preset',id:'preset-thankyou-botanical',url:'/presets/thank-you-botanical.jpg'};
    const pin = {id:'front', sha256:sha, storageKey:'wedding-paid-retained/staging/' + segment + '/' + id + '.png'};
    const sourceHash = weddingHash('synthetic source');
    const asset = {id:'front',projectId:project.id,policy:'wedding-raster-v1',verdict:'accepted_for_import',storageKey,
      sha256:sha,sourceSha256:sourceHash,sourceKey:'wedding-normalized/staging/' + segment + '/' + sourceHash + '.png'};
    if (upload) {
      await project.collection('artwork').doc('front').set(asset);
      await project.collection('artworkPins').doc(id).set({...pin, status:'ready', projectId:project.id, batchId:id});
    }
    const row = {...newWeddingHousehold('paid'),...rowInput('Paid household'),bodyOverride:'Exact paid wording',approvedFingerprint:'approved'};
    const card = {householdId:'paid',revision:row.revision,envelopeName:row.envelopeName,note:row.bodyOverride,
      cover,handwriting:'hwDavid',recipient:row.address,returnAddress:row.address,approvedFingerprint:row.approvedFingerprint};
    const quote = priceWeddingSelection(project.id,0,[{id:'paid',revision:row.revision,country:'US',region:'IL',postal:'00101',contentHash:digest(card)}]);
    const batch = db.collection('weddingBatches').doc(id);
    const receipt = {id,projectId:project.id,status:'held',preparedCount:1,completedCount:1,capturedCents:quote.totalCents,
      refundedCents:0,refundReservedCents:0,dueAt:null,settledAt:expired-1,paymentIntentId:intent,quote,artPin:upload?pin:null};
    const frozen = {card,line:quote.lines[0],refundStatus:null};
    await batch.set(receipt);
    await batch.collection('cards').doc('paid').set(frozen);
    const delivery = {householdId:'paid',ordinal:1,contentHash:quote.lines[0].contentHash,status:'held',holdReason:'staging_review'};
    await batch.collection('deliveries').doc('paid').set(delivery);
    await recordPaymentCaptureFact({operationId:id,paymentIntentId:intent,amountCents:quote.totalCents,currency:'usd',livemode:false});
    await project.collection('households').doc('paid').set({...row,paidBatchId:withDraft?null:id});
    if (withDraft) await project.collection('households').doc('draft').set({...newWeddingHousehold('draft'),...rowInput('Unpurchased household')});
    await project.update({purchasedCount:1,paidHouseholds:{paid:id},householdCount:withDraft?2:1,cover,sharedBody:'Expired shared text',
      expiresAt:expired,retentionCheckedFor:expired}); // Old release held all mixed projects indefinitely.
    await project.collection('aiJobs').doc('private').set({id:'private',projectId:project.id,status:'ready',items:[],excerpt:'Expired passage',expiresAt:expired});
    await project.collection('aiRequests').doc('request').set({jobId:'private',expiresAt:expired});
    await project.collection('imports').doc('source').set({createdAt:expired-1});
    await project.collection('imports').doc('source').collection('pages').doc('page').set({rows:[{gift:'Private source gift'}]});
    return {ctx,project,batch,id,receipt,frozen,delivery,pin,asset,expired,at,fact:db.collection(FINANCIAL_FACTS_COLLECTION).doc('fact_cap_'+intent)};
  }
  async function rotateDraftSweep() {
    const {cleanupWeddingDrafts} = await import('../lib/wedding/retention');
    for(let i=0;i<4;i++) await cleanupWeddingDrafts();
  }
  await check('mixed and fully paid retirement preserves authorized receipts and frozen cards, scrubs drafts and keeps earned ordinals', async () => {
    const {getPaidWeddingCard,getWeddingBatch} = await import('../lib/wedding/checkout');
    const {cleanupWeddingSourceRecords} = await import('../lib/wedding/retention');
    const {createWeddingArtworkService} = await import('../lib/wedding/artwork');
    const mixed=await paidFixture(true), full=await paidFixture(false,false);
    const pendingRun={id:'unknown_call',state:'unresolved',deadline:0};
    const unresolved=mixed.project.collection('aiJobs').doc('uncertain'), uncertaintyReceipt=mixed.project.collection('aiRequests').doc('uncertain');
    await unresolved.set({id:'uncertain',projectId:mixed.project.id,status:'unresolved',prompt:'Private prompt',run:pendingRun,deviceId:'fixture',items:[],expiresAt:mixed.expired});
    await uncertaintyReceipt.set({jobId:'uncertain',inputHash:'fixture',expiresAt:mixed.expired});
    await rotateDraftSweep();
    for (const f of [mixed,full]) {
      const p=(await f.project.get()).data()!;
      assert.equal(p.deletedAt,undefined);assert.equal(p.expiresAt,f.expired);assert.equal(p.householdCount,1);assert.equal(p.purchasedCount,1);
      assert.deepEqual(p.paidHouseholds,{paid:f.id});assert.equal(p.sharedBody,'');assert.equal(p.cover.kind,'preset');
      assert.equal((await f.project.collection('households').doc('draft').get()).exists,false);
      const row=(await f.project.collection('households').doc('paid').get()).data()!;
      assert.equal(row.envelopeName,'Paid household');assert.equal(row.paidBatchId,f.id);assert.equal(row.gift,'');assert.equal(row.bodyOverride,null);
      assert.deepEqual((await f.batch.get()).data(),f.receipt);assert.deepEqual((await f.batch.collection('cards').doc('paid').get()).data(),f.frozen);
      assert.deepEqual((await f.batch.collection('deliveries').doc('paid').get()).data(),f.delivery);
      assert.equal((await f.fact.get()).data()!.amountCents,f.receipt.capturedCents);
      const actor=await S.requireWeddingActor(request(undefined,f.ctx.token,ownerIdentity.uid));
      const tracker=await P.exportWeddingTracker(actor,true);assert.match(tracker,/Paid household/);assert.match(tracker,/ordered\/on hold/);
      assert.ok(!tracker.includes('Unpurchased household')&&!tracker.includes('blue bowl'));
      assert.equal((await getPaidWeddingCard(actor,f.id,'paid')).card.note,'Exact paid wording');
      assert.equal((await getWeddingBatch(actor,f.id)).capturedCents,f.receipt.capturedCents);
      const resumed=await P.resumeWeddingAccount(ownerIdentity,{projectId:f.project.id,actorId:actor.actorId});
      const recovered=await S.requireWeddingActor(request(undefined,resumed.token,ownerIdentity.uid));
      assert.equal((await getPaidWeddingCard(recovered,f.id,'paid')).card.note,f.frozen.card.note);
      assert.equal((await f.project.collection('aiJobs').doc('private').get()).exists,false);
      assert.equal((await f.project.collection('aiRequests').doc('request').get()).exists,false);
      await assert.rejects(()=>P.saveWeddingHousehold(actor,{patch:rowInput('Write after expiry')}),{code:'project_expired'});
    }
    assert.deepEqual((await unresolved.get()).data()!.run,pendingRun);assert.equal((await unresolved.get()).data()!.prompt,undefined);
    assert.ok((await uncertaintyReceipt.get()).exists);
    for(let i=0;i<12;i++)await cleanupWeddingSourceRecords();
    assert.equal((await mixed.project.collection('imports').doc('source').collection('pages').doc('page').get()).exists,false);
    const pin=(await mixed.project.collection('artworkPins').doc(mixed.id).get()).data()!;
    assert.equal(pin.storageKey,mixed.pin.storageKey);
    // Recovery during delayed object deletion can re-use the exact normalized bytes.
    await P.extendWeddingProject(mixed.ctx.actor);
    await mixed.project.collection('artwork').doc('reused').set({...mixed.asset,id:'reused',sourceKey:mixed.asset.storageKey});
    const removed:string[]=[];
    const gc=createWeddingArtworkService({db,assertRuntime:()=>{},objects:{
      async read(){throw Error('unexpected read');},async putOnce(){throw Error('unexpected write');},
      async remove(key){removed.push(key);},async removeOrphan(key){removed.push(key);},
    }});
    await gc.cleanupPending(100);
    assert.ok(removed.includes(mixed.asset.sourceKey));assert.ok(!removed.includes(mixed.asset.storageKey));assert.ok(!removed.includes(mixed.pin.storageKey));
    await P.saveWeddingHousehold(mixed.ctx.actor,{patch:rowInput('New household after extension')});
    await rotateDraftSweep();
    assert.equal((await P.weddingState(mixed.ctx.actor)).project.householdCount,2);
  });
  await check('retirement holds mismatched order, ordinal, capture and pin evidence and retries after repair', async () => {
    const f=await paidFixture(true), queue=db.collection('weddingDraftCleanup').doc(f.project.id);
    async function held(reason:string) {
      await rotateDraftSweep();
      assert.equal((await queue.get()).data()?.reason,reason);
      assert.ok((await f.project.collection('households').doc('draft').get()).exists);
      assert.ok((await f.project.collection('aiJobs').doc('private').get()).exists);
      assert.ok((await f.project.collection('artwork').doc('front').get()).exists);
    }
    await f.project.update({paidHouseholds:{paid:'wrong_batch'}});await held('paid_ordinal_mismatch');
    await f.project.update({paidHouseholds:{paid:f.id}});
    await f.batch.collection('cards').doc('paid').update({card:{...f.frozen.card,note:'Conflicting snapshot'}});await held('frozen_card_mismatch');
    await f.batch.collection('cards').doc('paid').set(f.frozen);
    const delivery=f.batch.collection('deliveries').doc('paid');
    await delivery.update({status:'uncertain'});await held('delivery_mismatch');await delivery.set(f.delivery);
    await f.fact.update({operationId:'wrong_batch'});await held('capture_fact_mismatch');await f.fact.update({operationId:f.id});
    const pinRef=f.project.collection('artworkPins').doc(f.id);
    await pinRef.update({status:'pending'});await held('paid_master_mismatch');await pinRef.update({status:'ready'});
    const strayPin=f.project.collection('artworkPins').doc('missing_batch');
    await strayPin.set({...f.pin,projectId:f.project.id,batchId:'missing_batch',status:'pending'});
    await held('paid_master_mismatch');await strayPin.delete();
    await f.batch.update({refundReservedCents:900});await held('payment_unresolved');await f.batch.update({refundReservedCents:0});
    const orphan=db.collection('weddingBatches').doc('orphan');
    await orphan.set({id:'orphan',projectId:f.project.id,status:'reconciliation'});await held('payment_unresolved');await orphan.delete();
    await f.project.update({activeBatchId:'reserved'});await rotateDraftSweep();assert.ok((await f.project.collection('households').doc('draft').get()).exists);
    await f.project.update({activeBatchId:null,paymentReconciliationRequired:true});await rotateDraftSweep();assert.ok((await f.project.collection('households').doc('draft').get()).exists);
    await f.project.update({paymentReconciliationRequired:false,expiresAt:Date.now()-1000});await rotateDraftSweep();assert.ok((await f.project.collection('households').doc('draft').get()).exists);
    // Refund reservation clears before its independent ledger write completes.
    const refundId='wr_fixture', providerId='re_fixture', cents=f.receipt.capturedCents;
    const refund=db.collection('weddingRefunds').doc(refundId);
    const linkedRefund={id:refundId,providerId,batchId:f.id,householdId:'paid',paymentIntentId:f.receipt.paymentIntentId,cents,status:'succeeded'};
    await refund.set({...linkedRefund,ledgerPending:true,dueAt:Date.now()});
    await f.batch.collection('cards').doc('paid').update({refundRequestId:refundId,refundStatus:'succeeded'});
    await f.batch.update({refundedCents:cents});
    await f.project.collection('households').doc('paid').update({refundStatus:'refunded',refundedCents:cents});
    await f.project.update({expiresAt:f.expired});await held('refund_unresolved');
    const {recordPaymentRefundFact}=await import('../lib/financial-ledger');
    await recordPaymentRefundFact({refundId:providerId,paymentIntentId:f.receipt.paymentIntentId,
      amountCents:cents,currency:'usd',providerRefundStatus:'succeeded',livemode:false});
    await refund.update({ledgerPending:false,dueAt:null});
    await f.project.update({expiresAt:f.expired});await rotateDraftSweep();assert.ok(!(await f.project.collection('households').doc('draft').get()).exists);
    const verified=await S.requireWeddingActor(request(undefined,f.ctx.token,ownerIdentity.uid));
    assert.match(await P.exportWeddingTracker(verified),/refunded/);
    assert.equal((await f.project.get()).data()!.purchasedCount,1);
    const {cleanupWeddingSourceRecords}=await import('../lib/wedding/retention');
    // The source and AI workers also recheck evidence between bounded pages.
    await f.project.collection('aiJobs').doc('late').set({projectId:f.project.id,id:'late',status:'ready',items:[],prompt:'expired',expiresAt:f.expired});
    await f.fact.update({amountCents:cents+1});await rotateDraftSweep();
    for(let i=0;i<8;i++)await cleanupWeddingSourceRecords();
    assert.equal((await queue.get()).data()?.proofHold,'capture_fact_mismatch');
    assert.ok((await f.project.collection('aiJobs').doc('late').get()).exists);
    assert.ok((await f.project.collection('imports').doc('source').get()).exists);
    await f.fact.update({amountCents:cents});await rotateDraftSweep();
    assert.equal((await f.project.collection('aiJobs').doc('late').get()).exists,false);
    await P.extendWeddingProject(f.ctx.actor);await f.project.collection('imports').doc('new').set({createdAt:Date.now()});
    for(let i=0;i<8;i++)await cleanupWeddingSourceRecords();
    assert.ok((await f.project.collection('imports').doc('new').get()).exists);assert.ok((await f.project.collection('imports').doc('source').get()).exists);
  });
  await check('production is disabled without explicit staged runtime',()=>{const env=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});try{assert.throws(()=>S.assertWeddingRuntime(),{code:'wedding_disabled'});}finally{Object.assign(process.env,{NODE_ENV:env});}});
  console.log(`Wedding core: ${checks} isolated checks passed. No cloud or fulfillment access.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
