import * as admin from 'firebase-admin';
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { firestoreDb, isFirestoreMock, verifyFirebaseIdToken } from '../firebase-admin';
import { isSameOrigin } from '../upload/http';
import { ADMIN_COOKIE_NAME, isAuthorizedAdminEmail, isValidAdminSessionToken } from '../admin-auth';
import type { WeddingActor, WeddingProject } from './domain';
import { WEDDING_DAY } from './domain';
import { weddingHash } from './hash';

export const WEDDING_COOKIE = 'smn_wedding_session';
export const WEDDING_DEVICE_COOKIE = 'smn_wedding_device';
export const WEDDING_PRIVATE_HEADERS = {'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'};
export class WeddingError extends Error { constructor(public code: string,message: string,public status = 400) {super(message);this.name='WeddingError';} }
export type WeddingScope = 'edit'|'pay'|'export'|'owner';
export interface WeddingMember {id: string; role: 'owner'|'editor'; uid: string|null; canPay: boolean; canExport: boolean; revoked: boolean; createdAt: number; updatedAt: number}
export interface WeddingSession {projectId: string;actorId: string;expiresAt: number;revoked: boolean;createdAt: number}
export interface WeddingInvite {id: string;projectId: string|null;kind:'device'|'partner'|'address'|'pilot';actorId: string;householdId: string|null;expiresAt:number;revoked:boolean;consumedAt:number|null;createdAt:number;consumedProjectId?:string}
export const weddingProjectRef = (id: string) => firestoreDb.collection('weddingProjects').doc(weddingId(id));
export const weddingSessionRef = (hash: string) => firestoreDb.collection('weddingSessions').doc(weddingId(hash));
export const weddingInviteRef = (hash: string) => firestoreDb.collection('weddingInvites').doc(weddingId(hash));
export const weddingId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new WeddingError('invalid_id','This item could not be found.',400);
  return value;
};
export function isWeddingStagingRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STAGING_REVIEW_ONLY === 'true') return true;
  let configuredProject: string|undefined;
  try {configuredProject = JSON.parse(env.FIREBASE_CONFIG || '{}').projectId;} catch { /* fail closed */ }
  const project = (env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || configuredProject || '').toLowerCase();
  if (project.includes('staging')) return true;
  if ((env.K_SERVICE || '').toLowerCase().includes('staging')) return true;
  return false;
}
export function weddingStorageEnvironment(env: NodeJS.ProcessEnv = process.env): 'staging'|'production' {
  return isWeddingStagingRuntime(env) ? 'staging' : 'production';
}
export function isWeddingFounderCohortCookie(token: string | null | undefined): boolean {
  return Boolean(token && isValidAdminSessionToken(token));
}
export function isWeddingFounderCohortRequest(req?: Request): boolean {
  if (!req) return false;
  const cookieHeader = req.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${ADMIN_COOKIE_NAME}=`)) {
      const value = trimmed.slice(ADMIN_COOKIE_NAME.length + 1);
      if (isWeddingFounderCohortCookie(decodeURIComponent(value))) return true;
    }
  }
  return false;
}
export function assertWeddingRuntime(req?: Request): void {
  if (process.env.NODE_ENV !== 'production') return;
  const founderCohort = isWeddingFounderCohortRequest(req);
  if ((process.env.WEDDING_PROJECTS_ENABLED !== 'true' && !founderCohort) || isFirestoreMock) {
    throw new WeddingError('wedding_disabled','Wedding projects are unavailable in this environment.',503);
  }
  let configuredProject: string|undefined;
  try {configuredProject = JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;} catch { /* fail closed */ }
  const project = (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || configuredProject || '').toLowerCase();
  const isStagingProject = project.includes('staging') || (process.env.K_SERVICE || '').toLowerCase().includes('staging');
  if (isStagingProject && process.env.STAGING_REVIEW_ONLY !== 'true') {
    throw new WeddingError('wedding_disabled','Wedding projects are unavailable in this environment.',503);
  }
}
export function assertWeddingOrigin(req: Request): void {
  if (!isSameOrigin(req as NextRequest)) throw new WeddingError('origin_forbidden','Request origin is not allowed.',403);
}
export function weddingCookie(req: Request,name = WEDDING_COOKIE): string|null {
  const values = (req.headers.get('cookie') || '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length+1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function newWeddingSecret() {const token=randomBytes(32).toString('hex');return {token,id:weddingHash(token)};}
export function setWeddingCookie(res: NextResponse,token: string,name = WEDDING_COOKIE) {
  res.cookies.set(name,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:30*86400});
}
export function weddingJson(data: unknown,status=200) {return NextResponse.json(data,{status,headers:WEDDING_PRIVATE_HEADERS});}
export function weddingErrorResponse(error: unknown) {
  const known = error instanceof WeddingError;
  return weddingJson({error:known?error.message:'The project could not be updated. Please retry.',code:known?error.code:'unavailable'},known?error.status:503);
}
export async function readWeddingBody(req: Request,maxBytes=1_000_000): Promise<Record<string,unknown>> {
  if (Number(req.headers.get('content-length')||0)>maxBytes) throw new WeddingError('too_large','This request is too large.',413);
  const reader=req.body?.getReader(); if (!reader) throw new WeddingError('invalid_body','A request body is required.');
  const chunks:Uint8Array[]=[];let length=0;
  try {for (;;) {const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>maxBytes){await reader.cancel();throw new WeddingError('too_large','This request is too large.',413);}chunks.push(next.value);}} finally {reader.releaseLock();}
  const buffer = new Uint8Array(length); let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  let body: unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new WeddingError('invalid_body','Check the submitted fields.');}
  if (!body||typeof body!=='object'||Array.isArray(body)) throw new WeddingError('invalid_body','Check the submitted fields.');
  return body as Record<string,unknown>;
}
export interface WeddingIdentity {uid:string;email:string;authTime:number;admin:boolean}
export async function weddingIdentity(req:Request,required=false):Promise<WeddingIdentity|null> {
  const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  let decoded:admin.auth.DecodedIdToken|null=null;
  if (token) {
    if (!isFirestoreMock && admin.apps.length) {try {decoded=await admin.auth().verifyIdToken(token,true);}catch{/* no credential logging */}}
    else if (process.env.NODE_ENV==='test' && process.env.SMN_TEST_DATA_DIR) decoded=await verifyFirebaseIdToken(token);
  }
  if (!decoded?.email_verified) {if(required)throw new WeddingError('sign_in_required','Sign in with your verified account.',401);return null;}
  const email=decoded.email?.trim().toLowerCase()||'';
  // Test identity is available only with explicitly isolated local storage; deployed identities always use Firebase auth_time.
  const authTime=Number(decoded.auth_time || (isFirestoreMock && process.env.NODE_ENV==='test' ? Math.floor(Date.now()/1000):0))*1000;
  return {uid:decoded.uid,email,authTime,admin:isAuthorizedAdminEmail(email)};
}
export function assertWeddingRecent(actor: Pick<WeddingActor,'verified'|'authTime'>) {
  if (!actor.verified || !actor.authTime || Date.now()-actor.authTime>10*60_000 || actor.authTime>Date.now()+60_000) throw new WeddingError('reauth_required','Sign in again to manage sharing permissions.',401);
}
export function assertWeddingPermission(project:WeddingProject,member:WeddingMember,actor:WeddingActor,scope:WeddingScope) {
  if (project.deletedAt || member.revoked || member.id!==actor.actorId || member.role!==actor.role || (member.role==='owner')!==(project.ownerId===actor.actorId)) throw new WeddingError('access_revoked','This project access is no longer available.',403);
  if (actor.uid && member.uid!==actor.uid) throw new WeddingError('account_mismatch','Use the account linked to this project membership.',403);
  if (scope==='owner' && project.ownerId!==actor.actorId) throw new WeddingError('owner_required','Only the project owner can do this.',403);
  if (scope==='export' && (!actor.verified || !member.uid || actor.uid!==member.uid || (member.role!=='owner'&&!member.canExport))) throw new WeddingError('export_forbidden','Verified sign-in and tracker permission are required.',403);
  if (scope==='pay' && member.role!=='owner' && (!actor.verified || !member.uid || actor.uid!==member.uid || !member.canPay)) throw new WeddingError('pay_forbidden','Verified sign-in and payment permission are required.',403);
}
/** Re-read inside the caller's transaction before writes, so revocation and checkout serialize. */
export async function assertWeddingActorInTransaction(tx:FirebaseFirestore.Transaction,actor:WeddingActor,scope:WeddingScope='edit') {
  if(!actor.sessionId)throw new WeddingError('unauthorized','Open your private project first.',401);
  const ref=weddingProjectRef(actor.projectId);
  const [p,m,s]=await Promise.all([tx.get(ref),tx.get(ref.collection('members').doc(actor.actorId)),tx.get(weddingSessionRef(actor.sessionId))]);
  const project=p.data() as WeddingProject|undefined,member=m.data() as WeddingMember|undefined,session=s.data() as WeddingSession|undefined;
  if(!project||!member||!session||session.projectId!==actor.projectId||session.actorId!==actor.actorId||session.revoked||session.expiresAt<=Date.now())throw new WeddingError('unauthorized','Open your private project link again.',401);
  assertWeddingPermission(project,member,actor,scope);
  return {project,member,session};
}
export async function requireWeddingActor(req:Request,scope:WeddingScope='edit'):Promise<WeddingActor> {
  assertWeddingRuntime(req);if(!['GET','HEAD','OPTIONS'].includes(req.method))assertWeddingOrigin(req);
  const founderCohort = isWeddingFounderCohortRequest(req);
  const token=weddingCookie(req);if(!token)throw new WeddingError('unauthorized','Open or create a private project.',401);
  const sessionId=weddingHash(token),session=(await weddingSessionRef(sessionId).get()).data() as WeddingSession|undefined;
  if(!session||session.revoked||session.expiresAt<=Date.now())throw new WeddingError('session_expired','Open your recovery link to resume.',401);
  const ref=weddingProjectRef(session.projectId);
  const [p,m,identity]=await Promise.all([ref.get(),ref.collection('members').doc(session.actorId).get(),weddingIdentity(req)]);
  const project=p.data() as WeddingProject|undefined,member=m.data() as WeddingMember|undefined;
  if(!project||!member)throw new WeddingError('not_found','Project not found.',404);
  const actor:WeddingActor={projectId:project.id,actorId:session.actorId,role:member.role,verified:!!identity&&identity.uid===member.uid,uid:identity?.uid===member.uid?identity.uid:null,canPay:member.role==='owner'||member.canPay,canExport:member.role==='owner'||member.canExport,authTime:identity?.authTime||0,sessionId,pilot:false,pilotInviteId:project.pilotInviteId||null,founderCohort};
  // Unclaimed memberships may sign in and claim; they do not acquire privileges merely by sending a bearer.
  if(identity&&member.uid&&member.uid!==identity.uid)throw new WeddingError('account_mismatch','Use the account linked to this project membership.',403);
  const permissionActor={...actor,uid:member.uid?actor.uid:null};assertWeddingPermission(project,member,permissionActor,scope);
  const allowlisted=!!identity && actor.verified && (identity.admin || (process.env.WEDDING_PILOT_UIDS||'').split(',').map(v=>v.trim()).includes(identity.uid));
  actor.canIssuePilotInvites=actor.verified && identity?.admin===true;
  const pilotId=project.pilotInviteId;
  const pilot=pilotId?(await weddingInviteRef(pilotId).get()).data() as WeddingInvite|undefined:undefined;
  actor.pilot=allowlisted||!!(pilot&&pilot.kind==='pilot'&&!pilot.revoked&&pilot.expiresAt>Date.now()&&pilot.consumedProjectId===project.id);
  return actor;
}
export async function requireWeddingPilot(req:Request,scope:WeddingScope='edit') {
  const actor=await requireWeddingActor(req,scope);if(!actor.pilot)throw new WeddingError('pilot_required','An active staging tester invitation is required.',403);return actor;
}
export function publicWeddingActor(actor:WeddingActor) {return {projectId:actor.projectId,actorId:actor.actorId,role:actor.role,verified:actor.verified,pilot:actor.pilot,canIssuePilotInvites:!!actor.canIssuePilotInvites,canPay:!!actor.canPay,canExport:!!actor.canExport};}
export function assertWeddingMutable(project:WeddingProject) {
  if(project.expiresAt<=Date.now())throw new WeddingError('project_expired','Extend this project to continue writing.',410);
  if(project.activeBatchId||project.paymentReconciliationRequired)throw new WeddingError('checkout_reserved','Finish or cancel the current checkout before editing.',409);
}
export function newWeddingSession(projectId:string,actorId:string):WeddingSession {const now=Date.now();return {projectId,actorId,createdAt:now,expiresAt:now+30*WEDDING_DAY,revoked:false};}
