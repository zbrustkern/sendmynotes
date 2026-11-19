import { randomUUID } from 'node:crypto';
import { firestoreDb } from '../firebase-admin';
import { CARD_PRESETS } from '../card-presets';
import { canonicalWeddingJSON, weddingHash } from './hash';
import { blankWeddingAddress, newWeddingHousehold, resolveWeddingNote, weddingApprovalFingerprint, weddingOverflow, weddingRowReady, weddingWordingIssues, WEDDING_DAY, WEDDING_MAX_HOUSEHOLDS, type WeddingActor, type WeddingHousehold, type WeddingProject } from './domain';
import { WeddingError, assertWeddingActorInTransaction, assertWeddingMutable, assertWeddingRecent, newWeddingSecret, newWeddingSession, publicWeddingActor, weddingId, weddingInviteRef, weddingProjectRef, weddingSessionRef, type WeddingIdentity, type WeddingInvite, type WeddingMember } from './server';
import { ARTWORK_POLICY } from './artwork-policy';
import { address, boolean, householdPatch, keys, matchVersion, object, projectPatch, text } from './validation';

type Tx = FirebaseFirestore.Transaction;
function audit(tx:Tx,projectId:string,actorId:string,action:string,targetId:string) {tx.set(weddingProjectRef(projectId).collection('audit').doc(randomUUID()),{actorId,action,targetId,at:Date.now()});}
const PROJECT_RETENTION_DAYS = 180;
function bump(project:WeddingProject) {
  const at = Date.now();
  return {...project,revision:project.revision+1,updatedAt:at,expiresAt:at + PROJECT_RETENTION_DAYS * WEDDING_DAY};
}
function editableRow(project:WeddingProject,row:WeddingHousehold) {
  assertWeddingMutable(project);
  const paid=(project as WeddingProject & {paidHouseholds?:Record<string,string>}).paidHouseholds;
  if(row.paidBatchId||paid?.[row.id])throw new WeddingError('already_purchased','Purchased cards cannot be edited or purchased again.',409);
}
async function allRows(tx:Tx,projectId:string):Promise<WeddingHousehold[]> {
  const docs=await tx.get(weddingProjectRef(projectId).collection('households').orderBy('id').limit(251));
  if(docs.size>250)throw new WeddingError('project_limit','This project needs operator review.',409);
  return docs.docs.map(doc=>doc.data() as WeddingHousehold);
}
export async function createWeddingProject(deviceId:string,sample=false) {
  const id=`wp_${randomUUID()}`,actorId=`wa_${randomUUID()}`,session=newWeddingSecret(),at=Date.now();
  const preset=CARD_PRESETS.find(p=>p.id==='preset-thankyou-botanical')!;
  const project:WeddingProject={id,revision:1,ownerId:actorId,sharedBody:'',signOff:'',handwriting:'hwDavid',cover:{kind:'preset',id:preset.id,url:preset.imageUrl},returnAddress:{...blankWeddingAddress(),firstName:'',lastName:''},templates:[],purchasedCount:0,activeBatchId:null,householdCount:sample?100:0,writingMode:'shared',createdAt:at,updatedAt:at,expiresAt:at+PROJECT_RETENTION_DAYS*WEDDING_DAY,claimedAt:null,pilotInviteId:null};
  const member:WeddingMember={id:actorId,role:'owner',uid:null,canPay:true,canExport:true,revoked:false,createdAt:at,updatedAt:at};
  const rateRef=firestoreDb.collection('weddingStartLimits').doc(weddingHash(deviceId));
  await firestoreDb.runTransaction(async tx=>{
    const rate=(await tx.get(rateRef)).data();const fresh=!rate||Number(rate.expiresAt)<=at,used=fresh?0:Number(rate.count||0);
    if(used>=5)throw new WeddingError('project_rate_limit','You have started several projects today. Resume one or try tomorrow.',429);
    tx.set(rateRef,{count:used+1,expiresAt:fresh?at+WEDDING_DAY:rate!.expiresAt});tx.create(weddingProjectRef(id),project);tx.create(weddingProjectRef(id).collection('members').doc(actorId),member);tx.create(weddingSessionRef(session.id),newWeddingSession(id,actorId));
    if(sample)for(let n=1;n<=100;n++){const row=newWeddingHousehold(`sample_${String(n).padStart(3,'0')}`);Object.assign(row,{envelopeName:`Sample household ${n}`,firstName:`Sample ${n}`,insideName:`Sample ${n}`,insideNameConfirmed:true,identityConfirmed:true,gift:'A thoughtful wedding gift',address:{address1:`${100+n} Example Lane`,address2:'',city:'Chicago',state:'IL',zip:'60601',country:'US'},addressConfirmed:false});tx.create(weddingProjectRef(id).collection('households').doc(row.id),row);}
  });
  return {projectId:id,actorId,token:session.token,sessionId:session.id};
}
export async function weddingState(actor:WeddingActor,options:{limit?:number;cursor?:string}={}) {
  return firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor);
    let query=weddingProjectRef(project.id).collection('households').orderBy('id');
    if(options.cursor)query=query.startAfter(weddingId(options.cursor));
    const limit=options.limit===undefined?250:Math.max(1,Math.min(100,options.limit));
    const page=await tx.get(query.limit(limit+1));const paid = (project as WeddingProject & {paidHouseholds?:Record<string,string>}).paidHouseholds ?? {};
    const households = page.docs.slice(0,limit).map(doc => {
      const row = doc.data() as WeddingHousehold;
      return paid[row.id] ? {...row,paidBatchId:paid[row.id]} : row;
    });
    let members:unknown[]=[];
    if(actor.role==='owner'){const docs=await tx.get(weddingProjectRef(project.id).collection('members').limit(51));members=docs.docs.map(doc=>{const m=doc.data() as WeddingMember;return {id:m.id,actorId:m.id,role:m.role,canPay:m.canPay,canExport:m.canExport,revoked:m.revoked,accountLinked:!!m.uid};});}
    let sessions: {id:string;sessionId:string;actorId:string;current:boolean;createdAt:number;expiresAt:number}[] = [];
    let invites: {inviteId:string;kind:string;expiresAt:number}[] = [];
    if (actor.role === 'owner') {
      const [devices,links] = await Promise.all([
        tx.get(firestoreDb.collection('weddingSessions').where('projectId','==',project.id).limit(100)),
        tx.get(firestoreDb.collection('weddingInvites').where('projectId','==',project.id).limit(100)),
      ]);
      sessions=devices.docs.filter(d=>!d.data().revoked && d.data().expiresAt>Date.now()).map(d=>({
        id:d.id,sessionId:d.id,actorId:d.data().actorId,current:d.id===actor.sessionId,createdAt:d.data().createdAt,expiresAt:d.data().expiresAt,
      }));
      invites=links.docs.filter(d=>!d.data().revoked && !d.data().consumedAt && d.data().expiresAt>Date.now()).map(d=>({
        inviteId:d.id,kind:d.data().kind,expiresAt:d.data().expiresAt,
      }));
    }
    // Private object keys belong to trusted server consumers only; UI uses the authorized artwork endpoint.
    const {masterKey: _privateKey,...cover}=project.cover;
    return {project:{...project,cover},households,actor:publicWeddingActor(actor),members,sessions,invites,nextCursor:page.size>limit?households.at(-1)?.id:null,expired:project.expiresAt<=Date.now(),retention:{draftDays:PROJECT_RETENTION_DAYS,expiresAt:project.expiresAt,paidRecordsRetained:project.purchasedCount>0},overflow:weddingOverflow(project,households)};
  });
}
async function validateCover(tx:Tx,project:WeddingProject) {
  if(project.cover.kind!=='upload')return;
  const asset=(await tx.get(weddingProjectRef(project.id).collection('artwork').doc(project.cover.id))).data();
  if (!asset || asset.id !== project.cover.id || asset.projectId !== project.id ||
      asset.verdict !== 'accepted_for_import' || asset.policy !== ARTWORK_POLICY ||
      !/^[a-f0-9]{64}$/.test(String(asset.sha256)) || typeof asset.storageKey !== 'string') {
    throw new WeddingError('invalid_cover','Select a checked private cover from this project.',409);
  }
  project.cover={kind:'upload',id:project.cover.id,url:`/api/wedding/artwork?id=${encodeURIComponent(project.cover.id)}`,hash:asset.sha256,masterKey:asset.storageKey};
}
export async function saveWeddingProject(actor:WeddingActor,input:Record<string,unknown>,preview=false) {
  const requestedCover=object(input.patch).cover;
  if(requestedCover && object(requestedCover).kind==='upload') {
    const {validateWeddingArtwork}=await import('./artwork');
    if(!await validateWeddingArtwork(actor.projectId,weddingId(object(requestedCover).id)))throw new WeddingError('invalid_cover','Select a checked private cover from this project.',409);
  }
  return firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor);assertWeddingMutable(project);matchVersion(project.revision,input.revision);
    const next=projectPatch(project,input.patch);const rows=await allRows(tx,project.id);
    for(const row of rows)if(!row.paidBatchId&&!project.paidHouseholds?.[row.id]&&row.templateId&&!next.templates.some(t=>t.id===row.templateId))throw new WeddingError('template_in_use','Unassign this template from its households before removing it.',409);
    if(object(input.patch).cover)await validateCover(tx,next);
    const overflow=weddingOverflow(next,rows);
    if(preview)return {overflow,affected:rows.filter(r=>!r.paidBatchId&&!project.paidHouseholds?.[r.id]&&weddingApprovalFingerprint(project,r)!==weddingApprovalFingerprint(next,r)).map(r=>r.id)};
    for(const row of rows){if(row.paidBatchId||project.paidHouseholds?.[row.id])continue;if(weddingApprovalFingerprint(project,row)!==weddingApprovalFingerprint(next,row)){tx.set(weddingProjectRef(project.id).collection('households').doc(row.id),{...row,revision:row.revision+1,contentRevision:row.contentRevision+1,approvedFingerprint:null});}}
    tx.set(weddingProjectRef(project.id),bump(next));return {overflow};
  });
}
export async function saveWeddingHousehold(actor:WeddingActor,input:Record<string,unknown>) {
  const id=input.id?weddingId(input.id):`wh_${randomUUID()}`;
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor);assertWeddingMutable(project);
    const ref=weddingProjectRef(project.id).collection('households').doc(id),snap=await tx.get(ref);const row=snap.exists?snap.data() as WeddingHousehold:newWeddingHousehold(id);
    if(snap.exists){editableRow(project,row);matchVersion(row.revision,input.revision);}else if(project.householdCount>=WEDDING_MAX_HOUSEHOLDS)throw new WeddingError('household_limit','A project can contain up to 250 households.',409);
    const next=householdPatch(row,input.patch,project),changed=weddingApprovalFingerprint(project,row)!==weddingApprovalFingerprint(project,next);
    if(changed){next.approvedFingerprint=null;next.contentRevision=row.contentRevision+1;}
    next.revision=snap.exists?row.revision+1:1;
    tx.set(ref,next);tx.set(weddingProjectRef(project.id),{...bump(project),householdCount:project.householdCount+(snap.exists?0:1)});
  });return {householdId:id};
}
export async function approveWeddingHouseholds(actor:WeddingActor,input:Record<string,unknown>) {
  if(!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>250)throw new WeddingError('invalid_selection','Select households to approve.');
  const ids=input.ids.map(weddingId);if(new Set(ids).size!==ids.length)throw new WeddingError('duplicate_selection','Select each household once.');
  if(input.mode!=='shared'&&input.mode!=='individual')throw new WeddingError('invalid_mode','Choose an approval mode.');
  // Individual writing must be displayed and accepted one full message at a time.
  if(input.mode==='individual'&&ids.length!==1)throw new WeddingError('individual_review','Review and approve each personal note individually.');
  return firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor);assertWeddingMutable(project);if(input.projectRevision!==undefined)matchVersion(project.revision,input.projectRevision);
    const docs=await Promise.all(ids.map(id=>tx.get(weddingProjectRef(project.id).collection('households').doc(id))));
    const rows=docs.map((doc,i)=>{if(!doc.exists)throw new WeddingError('not_found','A household was not found.',404);const row=doc.data() as WeddingHousehold;editableRow(project,row);const revisions=input.revisions;matchVersion(row.revision,Array.isArray(revisions)?revisions[i]:object(revisions)[ids[i]]);if(row.excluded)throw new WeddingError('excluded','Include the household before approving it.',409);const issues=weddingWordingIssues(project,row);if(issues.length)throw new WeddingError('wording_review',issues[0],409);if(input.mode==='shared'&&(row.bodyOverride!==null||row.signOffOverride!==null))throw new WeddingError('personal_review','Review customized notes individually.',409);return row;});
    if(input.mode==='shared'&&new Set(rows.map(row=>row.templateId)).size>1)throw new WeddingError('template_review','Approve one displayed template group at a time.',409);
    for(const row of rows)tx.set(weddingProjectRef(project.id).collection('households').doc(row.id),{...row,revision:row.revision+1,approvedFingerprint:weddingApprovalFingerprint(project,row),approvedAt:Date.now(),approvedBy:actor.actorId});
    tx.set(weddingProjectRef(project.id),bump(project));audit(tx,project.id,actor.actorId,'approved',String(rows.length));return {approved:rows.length};
  });
}
const importKeys=['id','sourceId','source','sources','sourceRowId','sourceHash','sheet','row','envelopeName','firstName','lastName','insideName','insideNames','greeting','gift','memory','address','street1','street2','city','state','zip','country','body','bodyOverride','signOffOverride','alreadyThanked','excluded','guestCount','issues','addressConfirmed','insideNameConfirmed','identityConfirmed'];
function importedRow(raw:unknown,index:number,importId:string,project:WeddingProject) {
  const value=object(raw);keys(value,importKeys);
  const explicit=value.sourceId||value.id;
  const id=explicit?`wh_${weddingHash(String(explicit)).slice(0,32)}`:`wh_${weddingHash(`${importId}:${index}`).slice(0,32)}`;
  const sourceRowId=text(value.sourceRowId??value.source??String(index+1),300);
  const row=newWeddingHousehold(id);
  const envelopeName=text(value.envelopeName??'',300),firstName=text(value.firstName??envelopeName,300),lastName=text(value.lastName??'',300),insideName=text(value.insideName??value.insideNames??'',300);
  const patch={envelopeName,firstName,lastName,insideName,greeting:value.greeting??null,gift:value.gift??'',memory:value.memory??'',address:value.address??{address1:value.street1??'',address2:value.street2??'',city:value.city??'',state:value.state??'',zip:value.zip??'',country:value.country??''},bodyOverride:value.bodyOverride??(value.body?text(value.body,16000):null),signOffOverride:value.signOffOverride??null,excluded:value.excluded??value.alreadyThanked??false,addressConfirmed:value.addressConfirmed??false,identityConfirmed:value.identityConfirmed??!!firstName.trim(),insideNameConfirmed:value.insideNameConfirmed??!!insideName.trim()};
  const next=householdPatch(row,patch,project);
  const sourceHash=weddingHash(canonicalWeddingJSON(value));
  next.provenance=[{importId,sourceRowId,sourceHash,...(value.sheet?{sheet:text(value.sheet,100)}:{}),...(typeof value.row==='number'&&Number.isSafeInteger(value.row)?{row:value.row}:{})}];
  if(explicit)next.sourceHouseholdId=text(String(explicit),300);
  return next;
}
export async function importWeddingHouseholds(actor:WeddingActor,input:Record<string,unknown>) {
  const importId=weddingId(input.importId);
  if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>250)throw new WeddingError('household_limit','Import between 1 and 250 households.');
  const rowsInput=input.rows;const mappingVersion=text(input.mappingVersion??'1',100),hash=weddingHash(canonicalWeddingJSON({rows:rowsInput,mappingVersion}));
  return firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor);assertWeddingMutable(project);
    const ref=weddingProjectRef(project.id),importRef=ref.collection('imports').doc(importId),existing=(await tx.get(importRef)).data();
    if(existing){if(existing.hash!==hash)throw new WeddingError('import_conflict','This import changed. Preview it again with a new import ID.',409);return {imported:existing.imported,replay:true,conflicts:existing.conflicts};}
    const rows=rowsInput.map((v,i)=>importedRow(v,i,importId,project));
    if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new WeddingError('duplicate_household','Repeated explicit household IDs need review before importing.',409);
    const docs=await Promise.all(rows.map(row=>tx.get(ref.collection('households').doc(row.id))));
    const conflicts=rows.filter((_,i)=>docs[i].exists).map(row=>({id:row.id,reason:'existing_household_preserved'}));
    const fresh=rows.filter((_,i)=>!docs[i].exists);
    if(project.householdCount+fresh.length>250)throw new WeddingError('household_limit','Split this list: a project can contain up to 250 households.',409);
    const at=Date.now();
    const receipts = rows.map((row,i) => {
      if (!docs[i].exists) tx.create(ref.collection('households').doc(row.id),row);
      return {source:row.provenance[0],householdId:row.id,
        outcome:docs[i].exists?'review_required':'accepted_for_import',
        reason:docs[i].exists?'existing_household_preserved':null};
    });
    // Small receipt pages leave room for all 250 household writes in one atomic import.
    for (let i = 0; i < receipts.length; i += 20) {
      tx.create(importRef.collection('pages').doc(String(i/20).padStart(3,'0')), {rows:receipts.slice(i,i+20)});
    }
    tx.create(importRef,{id:importId,hash,mappingVersion,createdAt:at,imported:fresh.length,conflicts});tx.set(ref,{...bump(project),householdCount:project.householdCount+fresh.length});return {imported:fresh.length,conflicts,replay:false};
  });
}

/** Account linking proves both existing guest possession and a verified Firebase account. */
export async function claimWeddingMembership(actor:WeddingActor,identity:WeddingIdentity) {
  await firestoreDb.runTransaction(async tx=>{
    const {project,member}=await assertWeddingActorInTransaction(tx,{...actor,uid:null});
    if(member.uid&&member.uid!==identity.uid)throw new WeddingError('account_mismatch','This membership is linked to another account.',403);
    const ref=weddingProjectRef(project.id);
    tx.set(ref.collection('members').doc(actor.actorId),{...member,uid:identity.uid,updatedAt:Date.now()});
    tx.set(firestoreDb.collection('weddingAccounts').doc(weddingHash(identity.uid)).collection('projects').doc(`${project.id}_${actor.actorId}`),{projectId:project.id,actorId:actor.actorId,createdAt:Date.now()});
    if(member.role==='owner')tx.set(ref,{...bump(project),claimedAt:project.claimedAt||Date.now(),expiresAt:Math.max(project.expiresAt,Date.now()+PROJECT_RETENTION_DAYS*WEDDING_DAY)});
    audit(tx,project.id,actor.actorId,'account_linked',actor.actorId);
  });
}
export async function extendWeddingProject(actor:WeddingActor) {
  await firestoreDb.runTransaction(async tx=>{const {project,session}=await assertWeddingActorInTransaction(tx,actor,'owner');tx.set(weddingProjectRef(project.id),{...bump(project),expiresAt:Date.now()+PROJECT_RETENTION_DAYS*WEDDING_DAY});tx.set(weddingSessionRef(actor.sessionId!),{...session,expiresAt:Date.now()+30*WEDDING_DAY});});
}
export async function inviteWeddingMember(actor:WeddingActor,input:Record<string,unknown>) {
  const kind=input.kind;if(kind!=='device'&&kind!=='partner'&&kind!=='address')throw new WeddingError('invalid_invite','Choose a device, partner, or address invitation.');
  const secret=newWeddingSecret(),at=Date.now(),householdId=kind==='address'?weddingId(input.householdId):null;
  const invite:WeddingInvite={id:secret.id,projectId:actor.projectId,kind,actorId:actor.actorId,householdId,expiresAt:at+7*WEDDING_DAY,revoked:false,consumedAt:null,createdAt:at};
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor,'owner');
    if(project.expiresAt<=at)throw new WeddingError('project_expired','Extend this project before sharing.',410);
    if(kind==='address'){const row=(await tx.get(weddingProjectRef(project.id).collection('households').doc(householdId!))).data() as WeddingHousehold|undefined;if(!row)throw new WeddingError('not_found','Household not found.',404);editableRow(project,row);}
    const prev=kind==='device'&&project.recoveryInviteId?(await tx.get(weddingInviteRef(project.recoveryInviteId))).data() as WeddingInvite|undefined:undefined;
    // A bounded per-project invitation budget avoids an unbounded child/session surface.
    const budgetRef=weddingProjectRef(project.id).collection('limits').doc('invites'),budget=(await tx.get(budgetRef)).data();const count=budget&&Number(budget.expiresAt)>at?Number(budget.count||0):0;
    if(count>=100)throw new WeddingError('invite_limit','Try again tomorrow or revoke an unused invitation.',429);
    tx.set(budgetRef,{count:count+1,expiresAt:budget&&Number(budget.expiresAt)>at?budget.expiresAt:at+WEDDING_DAY});
    if(prev&&!prev.consumedAt)tx.set(weddingInviteRef(prev.id),{...prev,revoked:true});
    tx.create(weddingInviteRef(secret.id),invite);
    if(kind==='device')tx.set(weddingProjectRef(project.id),{...bump(project),recoveryInviteId:secret.id});
    audit(tx,project.id,actor.actorId,`invite_${kind}`,secret.id);
  });
  return {inviteId:secret.id,expiresAt:invite.expiresAt,link:kind==='address'?`/thank-you/wedding/address#address=${secret.token}`:`/thank-you/wedding#wedding=${secret.token}`};
}
export async function redeemWeddingInvite(token:unknown,current?:WeddingActor) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new WeddingError('invalid_link','This private link is invalid.',400);
  const id=weddingHash(token),session=newWeddingSecret(),at=Date.now();
  return firestoreDb.runTransaction(async tx=>{
    const invite=(await tx.get(weddingInviteRef(id))).data() as WeddingInvite|undefined;
    if(!invite||invite.revoked||invite.expiresAt<=at||invite.consumedAt)throw new WeddingError('link_expired','This private link has expired or was already used. Ask for a new link.',410);
    if(invite.kind==='address')throw new WeddingError('address_link','Use the household address page for this link.');
    if(invite.kind==='pilot'){
      if(!current)throw new WeddingError('project_required','Start a project, then open the tester invitation again.',401);
      const {project}=await assertWeddingActorInTransaction(tx,current,'owner');
      if(invite.projectId&&invite.projectId!==project.id)throw new WeddingError('invite_scope','This invitation is for a different project.',403);
      tx.set(weddingInviteRef(id),{...invite,consumedAt:at,consumedProjectId:project.id});tx.set(weddingProjectRef(project.id),{...bump(project),pilotInviteId:id});audit(tx,project.id,current.actorId,'pilot_redeemed',id);
      return {projectId:project.id,actorId:current.actorId,token:null};
    }
    const project=(await tx.get(weddingProjectRef(invite.projectId!))).data() as WeddingProject|undefined;
    if(!project||project.deletedAt||project.expiresAt<=at)throw new WeddingError('project_expired','This project is no longer available.',410);
    const inviter=(await tx.get(weddingProjectRef(project.id).collection('members').doc(invite.actorId))).data() as WeddingMember|undefined;
    if(!inviter||inviter.revoked||project.ownerId!==invite.actorId)throw new WeddingError('access_revoked','This invitation is no longer available.',403);
    let actorId=invite.actorId;
    if(invite.kind==='partner'){
      const members=await tx.get(weddingProjectRef(project.id).collection('members').limit(51));if(members.size>=50)throw new WeddingError('member_limit','This project has reached its sharing limit.',409);
      actorId=`wa_${randomUUID()}`;
    }
    tx.set(weddingInviteRef(id),{...invite,consumedAt:at,consumedSessionId:session.id,consumedActorId:actorId});
    if(invite.kind==='partner')tx.create(weddingProjectRef(project.id).collection('members').doc(actorId),{id:actorId,role:'editor',uid:null,canPay:false,canExport:false,revoked:false,createdAt:at,updatedAt:at});
    tx.create(weddingSessionRef(session.id),newWeddingSession(project.id,actorId));audit(tx,project.id,actorId,'invite_redeemed',id);
    return {projectId:project.id,actorId,token:session.token};
  });
}
export async function revokeWeddingInvite(actor:WeddingActor,inviteId:unknown) {
  const id=weddingId(inviteId);
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor,'owner');const invite=(await tx.get(weddingInviteRef(id))).data() as (WeddingInvite & {consumedSessionId?:string;consumedActorId?:string})|undefined;
    if(!invite||invite.projectId!==project.id)throw new WeddingError('not_found','Invitation not found.',404);
    const session=invite.consumedSessionId?(await tx.get(weddingSessionRef(invite.consumedSessionId))).data():null;
    const target=invite.kind==='partner'&&invite.consumedActorId?invite.consumedActorId:null;
    const member=target?(await tx.get(weddingProjectRef(project.id).collection('members').doc(target))).data():null;
    tx.set(weddingInviteRef(id),{...invite,revoked:true});
    if(session)tx.set(weddingSessionRef(invite.consumedSessionId!),{...session,revoked:true});
    if(member)tx.set(weddingProjectRef(project.id).collection('members').doc(target!),{...member,revoked:true,canPay:false,canExport:false,updatedAt:Date.now()});
    const revokedActor=target||session?.actorId,payer=(project as WeddingProject & {checkoutActorId?:string}).checkoutActorId;
    if(revokedActor&&project.activeBatchId&&(!payer||payer===revokedActor)){
      tx.set(weddingProjectRef(project.id),{...bump(project),paymentReconciliationRequired:true,checkoutRevocationRequestedFor:revokedActor});
      tx.set(firestoreDb.collection('weddingPaymentRevocations').doc(`${project.id}_${revokedActor}`),{projectId:project.id,actorId:revokedActor,batchId:project.activeBatchId,state:'pending',reason:'invite_revoked',createdAt:Date.now()});
    }
    audit(tx,project.id,actor.actorId,'invite_revoked',id);
  });
}
export async function changeWeddingGrant(actor:WeddingActor,input:Record<string,unknown>,revoke=false) {
  const target=weddingId(input.actorId);if(target===actor.actorId)throw new WeddingError('self_grant','You cannot change your own membership.',403);
  if(!revoke)assertWeddingRecent(actor);
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor,'owner'),ref=weddingProjectRef(project.id),memberRef=ref.collection('members').doc(target),member=(await tx.get(memberRef)).data() as WeddingMember|undefined;
    if(!member||member.role!=='editor')throw new WeddingError('not_found','Partner not found.',404);
    if(!revoke&&!member.uid)throw new WeddingError('partner_sign_in','The partner must link a verified account before receiving permissions.',409);
    if(!revoke&&member.revoked)throw new WeddingError('access_revoked','Invite this partner again before granting permissions.',409);
    const canPay=revoke?false:boolean(input.canPay),canExport=revoke?false:boolean(input.canExport);
    const revokingPay=member.canPay&&!canPay;
    tx.set(memberRef,{...member,canPay,canExport,revoked:revoke||member.revoked,updatedAt:Date.now(),grantedBy:actor.actorId});
    if((revokingPay||revoke)&&project.activeBatchId){
      // Keep the reservation until processor cancellation/capture reconciliation proves release is safe.
      tx.set(firestoreDb.collection('weddingPaymentRevocations').doc(`${project.id}_${target}`),{projectId:project.id,actorId:target,batchId:project.activeBatchId,state:'pending',createdAt:Date.now()});
      const payer=(project as WeddingProject & {checkoutActorId?:string}).checkoutActorId;
      if(!payer||payer===target)tx.set(ref,{...bump(project),paymentReconciliationRequired:true,checkoutRevocationRequestedFor:target});
    }
    audit(tx,project.id,actor.actorId,revoke?'partner_revoked':'grants_changed',target);
  });
}
function csvCell(value:string) {const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`;}
export async function exportWeddingTracker(actor:WeddingActor,includeGift=false):Promise<string> {
  return firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor,'export'),rows=await allRows(tx,project.id);
    const output=[['Household',...(includeGift?['Gift']:[]),'Note status','Mailing status']];
    for (const row of rows) {
      const paid = row.paidBatchId || (project as WeddingProject & {paidHouseholds?:Record<string,string>}).paidHouseholds?.[row.id];
      const wording = row.excluded ? 'excluded' : paid ? 'ordered' : row.approvedFingerprint === weddingApprovalFingerprint(project,row) ? 'approved' : 'draft';
      const mailing = row.refundStatus === 'refunded' ? 'refunded' : paid ? 'ordered/on hold' : row.excluded ? 'excluded' : weddingRowReady(project,row) ? 'ready' : 'held';
      output.push([row.envelopeName,...(includeGift ? [row.gift] : []),wording,mailing]);
    }
    audit(tx,project.id,actor.actorId,'tracker_exported',String(rows.length));return '\uFEFF'+output.map(cells=>cells.map(csvCell).join(',')).join('\r\n');
  });
}
export async function acceptWeddingAddress(actor:WeddingActor,input:Record<string,unknown>) {
  const id=weddingId(input.id);
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor),ref=weddingProjectRef(project.id).collection('households').doc(id),row=(await tx.get(ref)).data() as WeddingHousehold|undefined;
    if(!row)throw new WeddingError('not_found','Household not found.',404);editableRow(project,row);matchVersion(row.revision,input.revision);if(!row.pendingAddress)throw new WeddingError('no_address','There is no submitted address to review.',409);
    tx.set(ref,{...row,address:row.pendingAddress.address,addressConfirmed:true,addressRevision:row.addressRevision+1,revision:row.revision+1,addressEvidence:'sender_confirmed',pendingAddress:null});tx.set(weddingProjectRef(project.id),bump(project));audit(tx,project.id,actor.actorId,'address_accepted',id);
  });
}
export async function revokeWeddingSession(actor:WeddingActor,sessionId:unknown) {
  const id=weddingId(sessionId);
  await firestoreDb.runTransaction(async tx=>{
    const {project}=await assertWeddingActorInTransaction(tx,actor,'owner'),ref=weddingSessionRef(id),session=(await tx.get(ref)).data();
    if(!session||session.projectId!==project.id)throw new WeddingError('not_found','Device session not found.',404);
    tx.set(ref,{...session,revoked:true});
    const payer=(project as WeddingProject & {checkoutActorId?:string}).checkoutActorId;
    if(project.activeBatchId&&(!payer||payer===session.actorId)){
      tx.set(weddingProjectRef(project.id),{...bump(project),paymentReconciliationRequired:true,checkoutRevocationRequestedFor:session.actorId});
      tx.set(firestoreDb.collection('weddingPaymentRevocations').doc(`${project.id}_${session.actorId}`),{projectId:project.id,actorId:session.actorId,batchId:project.activeBatchId,state:'pending',reason:'session_revoked',createdAt:Date.now()});
    }
    audit(tx,project.id,actor.actorId,'device_revoked',id);
  });return {revokedCurrent:actor.sessionId===id};
}
export async function listWeddingAccountProjects(identity:WeddingIdentity) {
  const docs=await firestoreDb.collection('weddingAccounts').doc(weddingHash(identity.uid)).collection('projects').limit(50).get();
  const projects=[];
  for(const doc of docs.docs){const link=doc.data(),ref=weddingProjectRef(link.projectId);const [p,m]=await Promise.all([ref.get(),ref.collection('members').doc(weddingId(link.actorId)).get()]);const project=p.data() as WeddingProject|undefined,member=m.data() as WeddingMember|undefined;if(project&&!project.deletedAt&&member&&!member.revoked&&member.uid===identity.uid)projects.push({projectId:project.id,actorId:member.id,role:member.role,expiresAt:project.expiresAt,updatedAt:project.updatedAt,householdCount:project.householdCount});}
  return {projects};
}
export async function resumeWeddingAccount(identity:WeddingIdentity,input:Record<string,unknown>) {
  const projectId=weddingId(input.projectId),actorId=weddingId(input.actorId),secret=newWeddingSecret();
  await firestoreDb.runTransaction(async tx=>{
    const ref=weddingProjectRef(projectId),[p,m]=await Promise.all([tx.get(ref),tx.get(ref.collection('members').doc(actorId))]);const project=p.data() as WeddingProject|undefined,member=m.data() as WeddingMember|undefined;
    if(!project||project.deletedAt||!member||member.revoked||member.uid!==identity.uid)throw new WeddingError('account_mismatch','This account cannot resume that membership.',403);
    const limitRef=firestoreDb.collection('weddingAccountSessionLimits').doc(weddingHash(identity.uid)),limit=(await tx.get(limitRef)).data(),at=Date.now();const used=limit&&limit.expiresAt>at?Number(limit.count||0):0;
    if(used>=30)throw new WeddingError('session_limit','Too many device sessions. Try again tomorrow.',429);
    tx.set(limitRef,{count:used+1,expiresAt:limit&&limit.expiresAt>at?limit.expiresAt:at+WEDDING_DAY});tx.create(weddingSessionRef(secret.id),newWeddingSession(projectId,actorId));audit(tx,projectId,actorId,'account_resumed',secret.id);
  });return {token:secret.token,projectId,actorId};
}
