import { createHash, randomUUID } from 'node:crypto';
import { AccountActor, AccountOccasion } from './contracts';
import { AccountError, accountCollection, accountDoc, accountScope, expectedVersion, validAccountId } from './http';
import { getContact } from './people';
import { occurrenceSchedule, validateOccasionDate, localTimeToEpoch, shiftCivilDate } from './calendar';
import { getAccountPreferences } from './preferences';
import { firestoreDb } from '@/lib/firebase-admin';

type StoredOccasion = AccountOccasion & { ownerUid: string; ownerScope: string; deletedAt?: number; consentSource?: string };
const outboxKey = (uid: string, occasionId: string, date: string) => createHash('sha256').update(`${uid}:${occasionId}:${date}:email`).digest('hex');
function publicOccasion(row: StoredOccasion): AccountOccasion {
  const { ownerUid: _uid, ownerScope: _scope, deletedAt: _deleted, consentSource: _source, ...data } = row;
  return data;
}
async function decorate(actor: AccountActor, occasion: AccountOccasion): Promise<AccountOccasion> {
  const prefs=await getAccountPreferences(actor);
  const schedule=occurrenceSchedule(occasion,prefs.timeZone);
  const nextReminderAt=schedule && occasion.reminderEnabled && (!schedule.late || occasion.lateReminderRequested) ? schedule.dueAt || undefined : undefined;
  return schedule ? { ...occasion, nextOccurrence:schedule.date, nextReminderAt } : occasion;
}
function validateTitle(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new AccountError('invalid', 'Add a short title for this date.');
  return value.trim();
}
function normalize(input: Record<string, unknown>, old?: AccountOccasion) {
  const contactId = validAccountId(input.contactId ?? old?.contactId);
  const title = validateTitle(input.title ?? old?.title);
  const type = input.type ?? old?.type ?? 'other';
  if (type !== 'birthday' && type !== 'anniversary' && type !== 'other') throw new AccountError('invalid', 'Choose a valid occasion type.');
  const recurrence = input.recurrence ?? old?.recurrence ?? (type === 'other' ? undefined : 'annual');
  if (recurrence !== 'annual' && recurrence !== 'once') throw new AccountError('invalid', 'Choose whether this date repeats each year.');
  const month = Number(input.month ?? old?.month), day = Number(input.day ?? old?.day);
  const yearValue = input.year === undefined ? old?.year : input.year;
  const year = yearValue === '' || yearValue === null || yearValue === undefined ? undefined : Number(yearValue);
  const leapDayPolicy = input.leapDayPolicy ?? old?.leapDayPolicy ?? 'feb28';
  if (typeof leapDayPolicy !== 'string') throw new AccountError('invalid', 'Choose a leap-day rule.');
  const candidate = { contactId, title, type, month, day, ...(year ? { year } : {}), recurrence, leapDayPolicy } as Pick<AccountOccasion,'contactId'|'title'|'type'|'month'|'day'|'year'|'recurrence'|'leapDayPolicy'>;
  validateOccasionDate(candidate);
  const reminderEnabled = input.reminderEnabled === undefined ? old?.reminderEnabled ?? false : input.reminderEnabled === true;
  const lateReminderRequested = input.lateReminderRequested === undefined ? old?.lateReminderRequested ?? false : input.lateReminderRequested === true;
  return { ...candidate, reminderEnabled, lateReminderRequested, leadDays: 14 as const };
}

export async function getOccasion(actor: AccountActor, id: string): Promise<AccountOccasion | null> {
  const snap = await accountDoc('occasions', actor.uid, validAccountId(id)).get();
  const row = snap.data() as StoredOccasion | undefined;
  if (!row || row.ownerScope !== accountScope(actor.uid) || row.deletedAt) return null;
  return decorate(actor,publicOccasion(row));
}
export const getAccountOccasion = getOccasion;

export async function listOccasions(actor: AccountActor, cursor?: string, limit = 20): Promise<{ data: AccountOccasion[]; nextCursor: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AccountError('invalid_limit', 'Choose a valid page size.');
  const scope = accountScope(actor.uid);
  const col = accountCollection('occasions');
  let query = col.where('ownerScope','==',scope).orderBy('createdAt','desc').limit(limit + 1);
  if (cursor) {
    const cursorSnap = await accountDoc('occasions',actor.uid,validAccountId(cursor)).get();
    const cursorRow = cursorSnap.data() as StoredOccasion | undefined;
    if (!cursorRow || cursorRow.ownerScope !== scope) throw new AccountError('invalid_cursor','Reload the dates list to continue.');
    query = col.where('ownerScope','==',scope).orderBy('createdAt','desc').startAfter(cursorSnap).limit(limit + 1);
  }
  const snap = await query.get();
  const hasMore = snap.docs.length > limit;
  const docs = snap.docs.slice(0,limit);
  const page = docs.map(doc => doc.data() as StoredOccasion).filter(row => row.ownerScope === scope && !row.deletedAt);
  return { data: await Promise.all(page.map(row=>decorate(actor,publicOccasion(row)))), nextCursor: hasMore ? (docs.at(-1)?.data() as StoredOccasion | undefined)?.id || null : null };
}

async function requireContact(actor: AccountActor, id: string) {
  const contact = await getContact(actor, id);
  if (!contact) throw new AccountError('not_found', 'Person not found.', 404);
}

async function putOccurrence(actor: AccountActor, occasion: AccountOccasion, consentSource: string, at = Date.now()) {
  const preferences = await getAccountPreferences(actor);
  const schedule = occurrenceSchedule(occasion, preferences.timeZone, at);
  if (!schedule || schedule.daysUntil === 0 || (schedule.late && !occasion.lateReminderRequested) || !occasion.reminderEnabled) return;
  const id = outboxKey(actor.uid, occasion.id, schedule.date);
  const ref = accountCollection('reminder_occurrences').doc(`${accountScope(actor.uid)}_${id}`);
  await firestoreDb.runTransaction(async tx => {
    const [current,eventSnap] = await Promise.all([tx.get(ref),tx.get(accountDoc('occasions',actor.uid,occasion.id))]);
    const currentEvent=eventSnap.data() as StoredOccasion|undefined;
    if(!currentEvent||currentEvent.ownerScope!==accountScope(actor.uid)||currentEvent.deletedAt||!currentEvent.reminderEnabled||currentEvent.version!==occasion.version)return;
    const prev = current.data() as Record<string, unknown> | undefined;
    if (prev && ['accepted','dispatching','uncertain','missed'].includes(String(prev.state))) return;
    if (prev?.state === 'cancelled' && Number(prev.attemptCount||0)>0) return;
    tx.set(ref, {
      id, ownerUid: actor.uid, ownerScope: accountScope(actor.uid), occasionId: occasion.id,
      occurrenceDate: schedule.date, dueLocalDate:schedule.dueLocalDate, late:schedule.late, dueAt: schedule.dueAt, timeZone: preferences.timeZone,
      eventVersion: occasion.version, state: 'pending', attemptCount: 0, nextCheckAt: schedule.dueAt,
      consentAt: occasion.consentAt || Date.now(), consentSource, updatedAt: Date.now(),
      idempotencyKey: `${actor.uid}:${occasion.id}:${schedule.date}:email`,
    });
  });
}

/** Queue the next annual reminder only after the current occurrence was accepted by transport. */
export async function queueNextAnnualOccurrence(actor: AccountActor, occasion: AccountOccasion, acceptedDate: string): Promise<void> {
  if (occasion.recurrence !== 'annual' || !occasion.reminderEnabled) return;
  const [year,month,day] = acceptedDate.split('-').map(Number);
  if (!year || !month || !day) return;
  const preferences = await getAccountPreferences(actor);
  const followingDay = shiftCivilDate({year,month,day},1);
  const afterOccurrence = localTimeToEpoch(followingDay,12,preferences.timeZone);
  await putOccurrence(actor,occasion,'account_checkbox',afterOccurrence);
}

export async function createOccasion(actor: AccountActor, input: Record<string, unknown>, idempotencyKey?: string): Promise<AccountOccasion> {
  const content = normalize(input);
  await requireContact(actor, content.contactId);
  const id = idempotencyKey ? `o_${createHash('sha256').update(`${accountScope(actor.uid)}:${idempotencyKey}`).digest('hex').slice(0,32)}` : randomUUID(), now = Date.now();
  const row: StoredOccasion = { id, ...content, version: 1, createdAt: now, updatedAt: now, ownerUid: actor.uid, ownerScope: accountScope(actor.uid), ...(content.reminderEnabled ? { consentAt: now, consentSource: 'account_checkbox' } : {}) };
  const ref=accountDoc('occasions', actor.uid, id);
  try { await firestoreDb.runTransaction(async tx => { const existing = await tx.get(ref); if (existing.exists) throw new AccountError('already_exists','This date already exists.',409); tx.set(ref,row); }); } catch {
    if (!idempotencyKey) throw new AccountError('unavailable','Date could not be saved.',503);
    const existing=await getOccasion(actor,id); if(existing)return existing;
    throw new AccountError('unavailable','Date could not be saved.',503);
  }
  const result = await decorate(actor,publicOccasion(row));
  if (result.reminderEnabled) await putOccurrence(actor, result, 'account_checkbox');
  return result;
}

export async function updateOccasion(actor: AccountActor, id: string, input: Record<string, unknown>, version: number): Promise<AccountOccasion> {
  id = validAccountId(id); version = expectedVersion(version);
  const ref = accountDoc('occasions', actor.uid, id);
  const beforeSnap=await ref.get();
  const before=beforeSnap.data() as StoredOccasion|undefined;
  if(!before||before.ownerScope!==accountScope(actor.uid)||before.deletedAt)throw new AccountError('not_found','Date not found.',404);
  if(before.version!==version)throw new AccountError('conflict','This date changed. Reload to review the latest version.',409);
  await requireContact(actor,validAccountId(input.contactId??before.contactId));
  let result: AccountOccasion | null = null;
  let previous: AccountOccasion | null = null;
  await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const old = snap.data() as StoredOccasion | undefined;
    if (!old || old.ownerScope !== accountScope(actor.uid) || old.deletedAt) throw new AccountError('not_found', 'Date not found.', 404);
    if (old.version !== version) throw new AccountError('conflict', 'This date changed. Reload to review the latest version.', 409);
    previous = publicOccasion(old);
    const content = normalize(input, old);
    const changedConsent = content.reminderEnabled !== old.reminderEnabled;
    const now = Date.now();
    const next: StoredOccasion = { ...old, ...content, version: old.version + 1, updatedAt: now,
      ...(content.reminderEnabled ? { consentAt: changedConsent ? now : old.consentAt || now, consentSource: changedConsent ? 'account_checkbox' : old.consentSource } : {}) };
    tx.set(ref, next); result = publicOccasion(next);
  });
  const saved = result as AccountOccasion | null;
  if (!saved) throw new AccountError('unavailable', 'Date could not be saved.', 503);
  if (previous) await reconcileOccurrences(actor, previous, saved);
  if (saved.reminderEnabled) await putOccurrence(actor, saved, 'account_checkbox');
  return decorate(actor,saved);
}

export async function deleteOccasion(actor: AccountActor, id: string, version: number): Promise<void> {
  id = validAccountId(id); version = expectedVersion(version);
  const ref = accountDoc('occasions', actor.uid, id);
  await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const row = snap.data() as StoredOccasion | undefined;
    if (!row || row.ownerScope !== accountScope(actor.uid) || row.deletedAt) throw new AccountError('not_found', 'Date not found.', 404);
    if (row.version !== version) throw new AccountError('conflict', 'This date changed. Reload before removing it.', 409);
    tx.set(ref, { ...row, version: row.version + 1, updatedAt: Date.now(), deletedAt: Date.now(), reminderEnabled: false });
  });
  await cancelStaleOccurrences(actor, id, version + 1);
}

export async function cancelStaleOccurrences(actor: AccountActor, occasionId: string, currentVersion: number): Promise<void> {
  const scope = accountScope(actor.uid);
  const snap = await accountCollection('reminder_occurrences').where('ownerScope','==',scope).where('occasionId','==',occasionId).limit(100).get();
  const eligible = snap.docs.filter(doc => doc.data()?.state === 'pending');
  for (const doc of eligible) {
    await firestoreDb.runTransaction(async tx => {
      const current = (await tx.get(doc.ref)).data() as Record<string, unknown> | undefined;
      if (!current || current.ownerScope !== scope || current.occasionId !== occasionId || current.state !== 'pending') return;
      if (Number(current.eventVersion) < currentVersion) tx.set(doc.ref, { ...current, state:'cancelled', cancelledAt:Date.now(), cancelReason:'occasion_changed' });
    });
  }
}

async function reconcileOccurrences(actor: AccountActor, previous: AccountOccasion, current: AccountOccasion): Promise<void> {
  const scope = accountScope(actor.uid);
  const snap = await accountCollection('reminder_occurrences').where('ownerScope','==',scope).where('occasionId','==',current.id).limit(100).get();
  const preferences = await getAccountPreferences(actor);
  const nextSchedule = current.reminderEnabled ? occurrenceSchedule(current, preferences.timeZone) : null;
  const nextDate = nextSchedule && nextSchedule.daysUntil > 0 && (!nextSchedule.late || current.lateReminderRequested) ? nextSchedule.date : null;
  for (const doc of snap.docs) {
    await firestoreDb.runTransaction(async tx => {
      const row = (await tx.get(doc.ref)).data() as Record<string, unknown> | undefined;
      if (!row || row.ownerScope !== scope || row.occasionId !== current.id || row.state !== 'pending') return;
      if (nextDate && row.occurrenceDate === nextDate) {
        tx.set(doc.ref, { ...row, eventVersion: current.version, dueLocalDate:nextSchedule!.dueLocalDate, late:nextSchedule!.late, dueAt: nextSchedule!.dueAt, timeZone: preferences.timeZone, updatedAt: Date.now() });
      } else if (Number(row.eventVersion) < current.version) {
        tx.set(doc.ref, { ...row, state:'cancelled', cancelledAt:Date.now(), cancelReason:'occasion_changed' });
      }
    });
  }
}
