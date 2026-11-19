import { firestoreDb } from '../firebase-admin';
import type { WeddingHousehold, WeddingProject } from './domain';
import { weddingHash } from './hash';
import { address, keys, object } from './validation';
import { WeddingError, assertWeddingMutable, newWeddingSecret, weddingInviteRef, weddingProjectRef, type WeddingInvite } from './server';
export const WEDDING_ADDRESS_COOKIE='smn_wedding_address';
interface AddressSession {inviteId:string;projectId:string;householdId:string;expiresAt:number;submittedAt:number|null}
const sessions=()=>firestoreDb.collection('weddingAddressSessions');
export async function exchangeWeddingAddress(token:unknown) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new WeddingError('invalid_link','This address link is invalid.');
  const id=weddingHash(token),secret=newWeddingSecret();
  const expiresAt=await firestoreDb.runTransaction(async tx=>{
    const invite=(await tx.get(weddingInviteRef(id))).data() as WeddingInvite|undefined;
    if(!invite||invite.kind!=='address'||invite.revoked||invite.consumedAt||invite.expiresAt<=Date.now()||!invite.projectId||!invite.householdId)throw new WeddingError('link_expired','This address link has expired or was already used.',410);
    const project=(await tx.get(weddingProjectRef(invite.projectId))).data() as WeddingProject|undefined;
    if(!project||project.deletedAt||project.expiresAt<=Date.now())throw new WeddingError('link_expired','This project is no longer accepting addresses.',410);
    const expiresAt=Math.min(invite.expiresAt,Date.now()+24*60*60_000);
    tx.set(weddingInviteRef(id),{...invite,consumedAt:Date.now()});tx.create(sessions().doc(secret.id),{inviteId:id,projectId:invite.projectId,householdId:invite.householdId,expiresAt,submittedAt:null} satisfies AddressSession);
    return expiresAt;
  });return {token:secret.token,expiresAt};
}
export async function useWeddingAddressSession(token:string|null,submitted?:unknown) {
  if(!token)throw new WeddingError('unauthorized','Open the private address link first.',401);
  return firestoreDb.runTransaction(async tx=>{
    const ref=sessions().doc(weddingHash(token)),session=(await tx.get(ref)).data() as AddressSession|undefined;
    if(!session||session.expiresAt<=Date.now())throw new WeddingError('link_expired','This address session has expired.',410);
    const invite=(await tx.get(weddingInviteRef(session.inviteId))).data() as WeddingInvite|undefined;
    const project=(await tx.get(weddingProjectRef(session.projectId))).data() as WeddingProject|undefined;
    if(!invite||invite.revoked||invite.expiresAt<=Date.now()||!project||project.deletedAt||project.expiresAt<=Date.now())throw new WeddingError('link_expired','This address request is no longer available.',410);
    if(submitted===undefined)return {expiresAt:session.expiresAt,submitted:!!session.submittedAt};
    const data=object(submitted);keys(data,['address']);const proposed=address(data.address);
    if(!proposed.address1.trim()||!proposed.city.trim()||!proposed.country)throw new WeddingError('address_incomplete','Add your street, city, and country.');
    if(session.submittedAt)throw new WeddingError('already_submitted','Your address was already sent for review.',409);
    assertWeddingMutable(project);
    const rowRef=weddingProjectRef(project.id).collection('households').doc(session.householdId),row=(await tx.get(rowRef)).data() as WeddingHousehold|undefined;
    if(!row||row.paidBatchId||(project as WeddingProject & {paidHouseholds?:Record<string,string>}).paidHouseholds?.[row.id])throw new WeddingError('address_closed','This card is no longer accepting address changes.',409);
    const at=Date.now();tx.set(rowRef,{...row,pendingAddress:{address:proposed,submittedAt:at,requestId:invite.id},revision:row.revision+1});tx.set(ref,{...session,submittedAt:at});
    return {submitted:true,expiresAt:session.expiresAt};
  });
}
