import { createHash, randomBytes } from 'node:crypto';
import * as admin from 'firebase-admin';
import { firestoreDb, getOrdersCollection } from '@/lib/firebase-admin';
import { AccountActor, AccountOccasion } from '@/lib/account/contracts';
import { AccountError, accountCollection, accountDoc, accountScope } from '@/lib/account/http';
import { getAccountPreferences } from '@/lib/account/preferences';
import { cancelStaleOccurrences, getOccasion, queueNextAnnualOccurrence } from '@/lib/account/occasions';
import { getContact } from '@/lib/account/people';
import { localCivilDate, localTimeToEpoch, occurrenceDate, civilString } from '@/lib/account/calendar';

export type ReminderMessage = { to: string; subject: string; text: string; html: string; idempotencyKey: string };
export type ReminderTransport = { send(message: ReminderMessage): Promise<{ accepted: boolean; providerId?: string; uncertain?: boolean }> };
export type ReminderDispatchSummary = { considered: number; accepted: number; cancelled: number; skipped: number; uncertain: number; backlogCount: number; backlogAgeMs: number };
export type ReminderQueueDiagnostics = { backlogCount: number; backlogAgeMs: number; uncertainCount: number; failedCount: number; measuredAt: number };

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => Date.now();
const RETRY_DELAY = 6 * 60 * 60 * 1000;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function renderReminderMessage(input: { to: string; contactName: string; title: string; date: string; daysRemaining: number; startUrl: string; unsubscribeUrl: string; idempotencyKey: string }): ReminderMessage {
  const subject = `${input.contactName}'s ${input.title} is coming up`;
  const text = `${input.contactName}'s ${input.title} is on ${input.date}. A little note can make it feel special.\n\nStart a card: ${input.startUrl}\nManage this date or stop occasion reminders: ${input.unsubscribeUrl}`;
  const html = `<p>${escapeHtml(input.contactName)}'s ${escapeHtml(input.title)} is on ${escapeHtml(input.date)}. A little note can make it feel special.</p><p><a href="${escapeHtml(input.startUrl)}">Start a card</a></p><p><a href="${escapeHtml(input.unsubscribeUrl)}">Manage this date or stop occasion reminders</a></p>`;
  return { to: input.to, subject, text, html, idempotencyKey: input.idempotencyKey };
}

/** Aggregate queue health only; safe to use while delivery is disabled. */
export async function getReminderQueueDiagnostics(at = now()): Promise<ReminderQueueDiagnostics> {
  const occurrences = accountCollection('reminder_occurrences');
  const pendingDue = () => occurrences.where('state', '==', 'pending').where('dueAt', '<=', at);
  const [dueCount, uncertainCount, failedCount, oldest] = await Promise.all([
    pendingDue().count().get(),
    occurrences.where('state', '==', 'uncertain').count().get(),
    occurrences.where('state', '==', 'failed').count().get(),
    pendingDue().orderBy('dueAt', 'asc').limit(1).get(),
  ]);
  const first = oldest.docs[0]?.data() as { dueAt?: number } | undefined;
  const backlogCount = Number(dueCount.data().count || 0);
  const oldestDueAt = Number(first?.dueAt || at);
  return { backlogCount, backlogAgeMs: backlogCount ? Math.max(0, at - oldestDueAt) : 0, uncertainCount: Number(uncertainCount.data().count || 0), failedCount: Number(failedCount.data().count || 0), measuredAt: at };
}

/** Production transport is deliberately available only after an explicit activation flag. */
export const resendReminderTransport: ReminderTransport = {
  async send(message) {
    if (process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE !== 'true' || !process.env.RESEND_API_KEY || !process.env.REMINDER_FROM_EMAIL) {
      throw new AccountError('delivery_unavailable', 'Reminder delivery is not active.', 503);
    }
    const { Resend } = await import('resend');
    // Bypass the legacy wrapper: it intentionally simulates delivery without a
    // key, which must never count as accepted by the reminder outbox.
    const client = new Resend(process.env.RESEND_API_KEY);
    const response = await client.emails.send({ from: `SendMyNotes <${process.env.REMINDER_FROM_EMAIL}>`, to: [message.to], subject: message.subject, text: message.text, html: message.html }, { idempotencyKey: message.idempotencyKey });
    if (response.error) return { accepted: false };
    return response.data?.id ? { accepted: true, providerId: response.data.id } : { accepted: false, uncertain: true };
  },
};

function enabled(): boolean {
  return process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE === 'true' && Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_FROM_EMAIL && process.env.REMINDER_WORKER_SECRET);
}

async function actorFor(uid: string): Promise<AccountActor | null> {
  if (!admin.apps.length) return null;
  try {
    const user = await admin.auth().getUser(uid);
    return { uid, email: user.email?.trim().toLowerCase() || '', emailVerified: user.emailVerified === true };
  } catch { return null; }
}

async function setOccurrence(ref: FirebaseFirestore.DocumentReference, mutate: (row: Record<string, unknown>) => Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  let result: Record<string, unknown> | null = null;
  await firestoreDb.runTransaction(async tx => {
    // Firestore can rerun this callback after a conflict. Do not carry a result
    // from an aborted attempt into a later attempt that observes a new state.
    result = null;
    const row = (await tx.get(ref)).data() as Record<string, unknown> | undefined;
    if (!row) return;
    const next = mutate(row);
    if (!next) return;
    tx.set(ref, next); result = next;
  });
  return result;
}

/** Move temporarily ineligible work out of the hot page without changing its frozen due date. */
async function deferOccurrence(ref: FirebaseFirestore.DocumentReference, at: number, dueAt = 0): Promise<void> {
  const nextCheckAt = Math.max(dueAt, at + RETRY_DELAY);
  await setOccurrence(ref, current => {
    if (current.state === 'pending') return { ...current, nextCheckAt, updatedAt: at };
    if (current.state === 'claimed' && Number(current.leaseUntil || 0) <= at) return { ...current, state: 'pending', leaseUntil: null, nextCheckAt, updatedAt: at };
    return null;
  });
}

async function issueUnsubscribeToken(actor: AccountActor, occasionId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const hash = sha(token);
  const ref=accountCollection('reminder_unsubscribe_tokens').doc(`${accountScope(actor.uid)}_${hash}`);
  await firestoreDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)tx.set(ref,{tokenHash:hash,ownerUid:actor.uid,ownerScope:accountScope(actor.uid),occasionId,expiresAt:now()+90*86400000,createdAt:now(),usedAt:null});});
  return token;
}

/** Terminal outcomes consume this occurrence, not the person's annual consent. */
async function queueFollowingAnnual(actor: AccountActor, occasionId: string, consumedDate: string): Promise<void> {
  const current = await getOccasion(actor, occasionId);
  if (current?.reminderEnabled && current.recurrence === 'annual') {
    await queueNextAnnualOccurrence(actor, current, consumedDate);
  }
}

function urls(token: string, occasion: AccountOccasion): { startUrl: string; unsubscribeUrl: string } {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://sendmynotes.com').replace(/\/$/, '');
  return { startUrl: `${base}/new?accountOccasion=${encodeURIComponent(occasion.id)}&accountContact=${encodeURIComponent(occasion.contactId)}`, unsubscribeUrl: `${base}/api/reminders/unsubscribe?token=${encodeURIComponent(token)}` };
}

async function claim(ref: FirebaseFirestore.DocumentReference, actor: AccountActor, occurrence: Record<string, unknown>, occasion: AccountOccasion, preferencesVersion: number, at: number): Promise<boolean> {
  const prefRef = accountDoc('preferences', actor.uid, 'current');
  let claimed = false;
  await firestoreDb.runTransaction(async tx => {
    // A retry may see another worker's live claim; reset the captured result so
    // that only this committed attempt can authorize provider dispatch.
    claimed = false;
    const [outSnap,eventSnap,prefSnap] = await Promise.all([tx.get(ref),tx.get(accountDoc('occasions',actor.uid,occasion.id)),tx.get(prefRef)]);
    const out = outSnap.data() as Record<string,unknown>|undefined;
    const event = eventSnap.data() as (AccountOccasion & {ownerScope?:string;deletedAt?:number})|undefined;
    const pref = prefSnap.data() as {version?:number;remindersPaused?:boolean;ownerScope?:string}|undefined;
    if (!out || !(['pending','claimed'].includes(String(out.state))) || out.state === 'claimed' && Number(out.leaseUntil||0)>at || out.ownerScope !== accountScope(actor.uid) || !event || event.deletedAt || !event.reminderEnabled || event.version !== out.eventVersion) return;
    if (pref && (pref.ownerScope !== accountScope(actor.uid) || pref.version !== preferencesVersion || pref.remindersPaused)) return;
    if (Number(out.dueAt) > at) return;
    tx.set(ref,{...out,state:'claimed',leaseUntil:at+5*60_000,claimedAt:at,claimVersion:event.version,attemptCount:Number(out.attemptCount||0)+1}); claimed=true;
  });
  return claimed;
}

/**
 * Safe by default: without injected transport and explicit activation this is a
 * read-only no-op. Tests can inject a fake transport and temporary fixtures.
 */
export async function dispatchDueReminders(at = now(), transport?: ReminderTransport, dependencies: { actorResolver?: (uid:string)=>Promise<AccountActor|null> } = {}): Promise<ReminderDispatchSummary> {
  const summary: ReminderDispatchSummary = { considered:0, accepted:0, cancelled:0, skipped:0, uncertain:0, backlogCount:0, backlogAgeMs:0 };
  if (!transport && !enabled()) return summary;
  const occurrenceCollection=accountCollection('reminder_occurrences');
  const [pendingRows,expiredClaims,staleDispatches]=await Promise.all([
    occurrenceCollection.where('state','==','pending').where('nextCheckAt','<=',at).orderBy('nextCheckAt','asc').limit(50).get(),
    occurrenceCollection.where('state','==','claimed').where('leaseUntil','<=',at).limit(50).get(),
    occurrenceCollection.where('state','==','dispatching').where('dispatchStartedAt','<=',at-5*60_000).limit(50).get(),
  ]);
  summary.backlogCount = pendingRows.size;
  const oldestDueAt = pendingRows.docs.reduce((oldest, doc) => Math.min(oldest, Number((doc.data() as Record<string, unknown>).dueAt || at)), at);
  summary.backlogAgeMs = pendingRows.size ? Math.max(0, at - oldestDueAt) : 0;
  for(const doc of staleDispatches.docs) {
    const row=doc.data() as Record<string,unknown>;
    const uncertain=await setOccurrence(doc.ref,current=>current.state==='dispatching'&&Number(current.dispatchStartedAt)<=at-5*60_000?{...current,state:'uncertain',uncertainAt:at,uncertainReason:'worker_interrupted_after_dispatch_start'}:null);
    if(uncertain&&row.ownerUid&&row.occasionId&&row.occurrenceDate){
      const actor=await (dependencies.actorResolver||actorFor)(String(row.ownerUid));
      if(actor)await queueFollowingAnnual(actor,String(row.occasionId),String(row.occurrenceDate));
    }
  }
  const docs=[...new Map([...pendingRows.docs,...expiredClaims.docs].map(doc=>[doc.id,doc])).values()];
  for (const doc of docs) {
    summary.considered++;
    const row = doc.data() as Record<string,unknown>;
    const uid = String(row.ownerUid||'');
    const actor = uid ? await (dependencies.actorResolver || actorFor)(uid) : null;
    if (!actor || !actor.emailVerified || !actor.email) { await deferOccurrence(doc.ref,at,Number(row.dueAt)||0); summary.skipped++; continue; }
    const event = await getOccasion(actor,String(row.occasionId||''));
    if (!event || !event.reminderEnabled || event.version !== row.eventVersion) {
      await setOccurrence(doc.ref, current => current.state === 'pending'||current.state==='claimed'&&Number(current.leaseUntil||0)<=at ? { ...current,state:'cancelled',cancelReason:'event_changed',cancelledAt:at } : null);
      summary.cancelled++; continue;
    }
    const preferences = await getAccountPreferences(actor);
    if (!preferences.emailVerified || !preferences.reminderEmail || preferences.remindersPaused || (preferences as typeof preferences & {timeZoneConfirmed?:boolean}).timeZoneConfirmed !== true || !preferences.reminderDeliveryAvailable && !transport) { await deferOccurrence(doc.ref,at,Number(row.dueAt)||0); summary.skipped++; continue; }
    const currentOccurrence = occurrenceDate(event,localCivilDate(at,preferences.timeZone));
    const target = String(row.occurrenceDate || '');
    const dueLocalDate = typeof row.dueLocalDate === 'string' ? row.dueLocalDate : row.dueAt ? civilString(localCivilDate(Number(row.dueAt),preferences.timeZone)) : '';
    if (!currentOccurrence || civilString(currentOccurrence) !== target || !/^\d{4}-\d{2}-\d{2}$/.test(dueLocalDate) || row.late === true && !event.lateReminderRequested) {
      const missed=await setOccurrence(doc.ref,current=>current.state==='pending'||current.state==='claimed'&&Number(current.leaseUntil||0)<=at?{...current,state:'missed',missedAt:at}:null);
      if(missed)await queueFollowingAnnual(actor,event.id,target);
      summary.cancelled++; continue;
    }
    // The occurrence's civil date and due civil date are frozen when consent is
    // recorded. A time-zone change changes only the UTC instant, never the key.
    const dueAt = localTimeToEpoch({year:Number(dueLocalDate.slice(0,4)),month:Number(dueLocalDate.slice(5,7)),day:Number(dueLocalDate.slice(8,10))},9,preferences.timeZone);
    if (dueAt !== row.dueAt || row.timeZone !== preferences.timeZone || !row.dueLocalDate) {
      await setOccurrence(doc.ref,current=>(current.state==='pending'||current.state==='claimed'&&Number(current.leaseUntil||0)<=at)?{...current,state:'pending',leaseUntil:null,dueLocalDate, dueAt,timeZone:preferences.timeZone,eventVersion:event.version,nextCheckAt:Math.max(dueAt,at+60_000),updatedAt:at}:null);
      summary.skipped++; continue;
    }
    if (at - dueAt > 48*60*60*1000) {
      const missed=await setOccurrence(doc.ref,current=>current.state==='pending'||current.state==='claimed'&&Number(current.leaseUntil||0)<=at?{...current,state:'missed',missedAt:at}:null);
      if(missed)await queueFollowingAnnual(actor,event.id,target);
      summary.cancelled++; continue;
    }
    if (at < dueAt) { await deferOccurrence(doc.ref,at,dueAt); summary.skipped++; continue; }
    if (!(await claim(doc.ref,actor,row,event,preferences.version,at))) { await deferOccurrence(doc.ref,at,Number(row.dueAt)||0); summary.skipped++; continue; }
    const contact = await getContact(actor,event.contactId);
    if (!contact) {
      const cancelled=await setOccurrence(doc.ref,current=>current.state==='claimed'?{...current,state:'cancelled',cancelReason:'contact_missing',cancelledAt:at}:null);
      if(cancelled)await queueFollowingAnnual(actor,event.id,target);
      summary.cancelled++; continue;
    }
    const token = await issueUnsubscribeToken(actor,event.id);
    const links = urls(token,event);
    // Re-read state and event immediately before crossing the provider boundary.
    const latest = await getOccasion(actor,event.id);
    const latestPreferences=await getAccountPreferences(actor);
    if (!latest || !latest.reminderEnabled || latest.version !== event.version || latestPreferences.remindersPaused || (latestPreferences as typeof latestPreferences & {timeZoneConfirmed?:boolean}).timeZoneConfirmed !== true) {
      await setOccurrence(doc.ref,current=>current.state==='claimed'?{...current,state:'cancelled',cancelReason:'consent_changed',cancelledAt:at}:null); summary.cancelled++; continue;
    }
    // Last owner/occurrence-specific order check before making the outbox
    // ambiguous. A checkout can still race between this check and send; once
    // dispatch starts we never retry blindly because the provider may have accepted.
    if(await hasAcceptedOrder(actor.uid,event.id,target)){
      const cancelled=await setOccurrence(doc.ref,current=>current.state==='claimed'?{...current,state:'cancelled',cancelReason:'accepted_card_for_occurrence',cancelledAt:at}:null);
      if(cancelled)await queueFollowingAnnual(actor,event.id,target);
      summary.cancelled++;continue;
    }
    const dispatching = await setOccurrence(doc.ref,current=>current.state==='claimed'&&current.claimVersion===latest.version?{...current,state:'dispatching',dispatchStartedAt:at}:null);
    if (!dispatching) { summary.skipped++; continue; }
    const daysRemaining = Math.max(0,Math.round((Date.parse(`${target}T00:00:00Z`)-Date.parse(`${civilString(localCivilDate(at,preferences.timeZone))}T00:00:00Z`))/86400000));
    const message = renderReminderMessage({ to:preferences.reminderEmail,contactName:contact.displayName,title:event.title,date:target,daysRemaining,startUrl:links.startUrl,unsubscribeUrl:links.unsubscribeUrl,idempotencyKey:String(row.idempotencyKey) });
    try {
      const response = await (transport || resendReminderTransport).send(message);
      if (response.accepted) {
        const accepted=await setOccurrence(doc.ref,current=>current.state==='dispatching'?{...current,state:'accepted',acceptedAt:now(),providerId:response.providerId||null}:null);
        if(accepted)await queueFollowingAnnual(actor,event.id,target);
        summary.accepted++;
      }
      else if (response.uncertain) { const uncertain=await setOccurrence(doc.ref,current=>current.state==='dispatching'?{...current,state:'uncertain',uncertainAt:now()}:null); if(uncertain)await queueFollowingAnnual(actor,event.id,target); summary.uncertain++; }
      else { const failed=await setOccurrence(doc.ref,current=>current.state==='dispatching'?{...current,state:'failed',failedAt:now()}:null); if(failed)await queueFollowingAnnual(actor,event.id,target); summary.skipped++; }
    } catch {
      const uncertain=await setOccurrence(doc.ref,current=>current.state==='dispatching'?{...current,state:'uncertain',uncertainAt:now()}:null);
      if(uncertain)await queueFollowingAnnual(actor,event.id,target);
      summary.uncertain++;
    }
  }
  return summary;
}

export async function listReminderOccurrences(actor: AccountActor): Promise<Array<{occasionId:string;occurrenceDate:string;dueAt:number;timeZone:string;state:string}>> {
  const snap = await accountCollection('reminder_occurrences').where('ownerScope','==',accountScope(actor.uid)).orderBy('dueAt','asc').limit(100).get();
  return snap.docs.map(doc=>doc.data() as Record<string,unknown>).filter(row=>row.ownerScope===accountScope(actor.uid)).map(row=>({occasionId:String(row.occasionId),occurrenceDate:String(row.occurrenceDate),dueAt:Number(row.dueAt),timeZone:String(row.timeZone),state:String(row.state)}));
}

/** Trusted accepted-order hook; association uses an exact owner/event occurrence, never a name. */
export async function suppressReminderForAcceptedOrder(uid:string,occasionId:string,occurrenceDate:string,orderId:string):Promise<void>{
  if(!uid||!occasionId||!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)||!orderId)throw new AccountError('invalid','The order/date association is incomplete.');
  const scope=accountScope(uid);const snap=await accountCollection('reminder_occurrences').where('ownerScope','==',scope).where('occasionId','==',occasionId).where('occurrenceDate','==',occurrenceDate).limit(10).get();
  let suppressed=false;
  for(const doc of snap.docs){const changed=await setOccurrence(doc.ref,row=>row.ownerScope===scope&&row.occasionId===occasionId&&row.occurrenceDate===occurrenceDate&&['pending','claimed'].includes(String(row.state))?{...row,state:'cancelled',cancelReason:'accepted_card_for_occurrence',orderId,suppressedAt:now()}:null);suppressed=suppressed||Boolean(changed);}
  if(suppressed)await queueFollowingAnnual({uid,email:'',emailVerified:false},occasionId,occurrenceDate);
}

async function hasAcceptedOrder(uid:string,occasionId:string,occurrenceDate:string):Promise<boolean>{
  const orders=await getOrdersCollection().where('userId','==',uid).where('accountOccasionId','==',occasionId).where('occasionOccurrenceDate','==',occurrenceDate).where('accountAcceptedAt','>',0).limit(50).get();
  return orders.docs.some(doc=>{const order=doc.data() as Record<string,unknown>;return order.userId===uid&&order.accountOccasionId===occasionId&&order.occasionOccurrenceDate===occurrenceDate&&Number(order.accountAcceptedAt)>0&&order.orderOrigin!=='ADMIN_COMP'&&order.isTestOrder!==true;});
}

export async function applyUnsubscribeToken(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new AccountError('invalid_token','This reminder link is invalid or expired.',400);
  const hash=sha(token); const docs=await accountCollection('reminder_unsubscribe_tokens').where('tokenHash','==',hash).limit(2).get();
  const snap=docs.docs[0]; const record=snap?.data() as {ownerUid?:string;ownerScope?:string;occasionId?:string;expiresAt?:number;usedAt?:number}|undefined;
  if (!snap||!record?.ownerUid||!record.occasionId||record.expiresAt!<now()||record.usedAt) throw new AccountError('invalid_token','This reminder link is invalid or expired.',400);
  const actor=await actorFor(record.ownerUid);
  if (!actor) throw new AccountError('unavailable','This reminder preference could not be updated.',503);
  await firestoreDb.runTransaction(async tx=>{
    const [tokenSnap,eventSnap]=await Promise.all([tx.get(snap.ref),tx.get(accountDoc('occasions',actor.uid,record.occasionId!))]);
    const currentToken=tokenSnap.data() as {usedAt?:number;expiresAt?:number;ownerScope?:string}|undefined;
    const event=eventSnap.data() as (AccountOccasion & {ownerScope?:string;deletedAt?:number})|undefined;
    if(!currentToken||currentToken.usedAt||Number(currentToken.expiresAt)<now()||currentToken.ownerScope!==accountScope(actor.uid))throw new AccountError('invalid_token','This reminder link is invalid or expired.',400);
    if(!event||event.deletedAt||event.ownerScope!==accountScope(actor.uid))throw new AccountError('not_found','This date is no longer available.',404);
    tx.set(accountDoc('occasions',actor.uid,event.id),{...event,reminderEnabled:false,version:event.version+1,updatedAt:now(),unsubscribeAt:now(),consentSource:'unsubscribe'});
    tx.set(snap.ref,{...currentToken,usedAt:now()});
  });
  const event=await getOccasion(actor,record.occasionId);
  await cancelStaleOccurrences(actor,record.occasionId,(event?.version||1));
}
