import { firestoreDb } from '../firebase-admin';
import { WEDDING_DAY } from './domain';
import { WeddingError, assertWeddingRecent, newWeddingSecret, weddingId, weddingInviteRef, weddingProjectRef, type WeddingIdentity, type WeddingInvite } from './server';
export async function issueWeddingPilot(identity:WeddingIdentity,projectId?:unknown) {
  if(!identity.admin)throw new WeddingError('admin_required','A verified staging operator account is required.',403);
  assertWeddingRecent({verified:true,authTime:identity.authTime});
  const secret=newWeddingSecret(),at=Date.now(),target=projectId?weddingId(projectId):null;
  const invite:WeddingInvite={id:secret.id,projectId:target,kind:'pilot',actorId:identity.uid,householdId:null,createdAt:at,expiresAt:at+7*WEDDING_DAY,consumedAt:null,revoked:false};
  await firestoreDb.runTransaction(async tx=>{
    if(target&&!(await tx.get(weddingProjectRef(target))).exists)throw new WeddingError('not_found','Project not found.',404);
    const ref=firestoreDb.collection('weddingPilotIssueLimits').doc(weddingId(identity.uid)),limit=(await tx.get(ref)).data();const count=limit&&Number(limit.expiresAt)>at?Number(limit.count):0;
    if(count>=100)throw new WeddingError('pilot_limit','The daily invitation limit has been reached.',429);
    tx.set(ref,{count:count+1,expiresAt:limit&&Number(limit.expiresAt)>at?limit.expiresAt:at+WEDDING_DAY});tx.create(weddingInviteRef(secret.id),invite);
    tx.create(firestoreDb.collection('weddingPilotAudit').doc(secret.id),{actorId:identity.uid,action:'issued',projectId:target,at});
  });return {inviteId:secret.id,expiresAt:invite.expiresAt,link:`/thank-you/wedding#wedding=${secret.token}`};
}
export async function revokeWeddingPilot(identity:WeddingIdentity,inviteId:unknown) {
  if(!identity.admin)throw new WeddingError('admin_required','A verified staging operator account is required.',403);
  assertWeddingRecent({verified:true,authTime:identity.authTime});const id=weddingId(inviteId);
  await firestoreDb.runTransaction(async tx=>{const invite=(await tx.get(weddingInviteRef(id))).data() as WeddingInvite|undefined;if(!invite||invite.kind!=='pilot')throw new WeddingError('not_found','Pilot invitation not found.',404);tx.set(weddingInviteRef(id),{...invite,revoked:true});tx.set(firestoreDb.collection('weddingPilotAudit').doc(id),{actorId:identity.uid,action:'revoked',at:Date.now()},{merge:true});});
}
