import { createHash, randomUUID } from 'node:crypto';
import { AccountActor, AccountContact, VersionedRecord } from './contracts';
import { AccountError, accountCollection, accountDoc, accountScope, validAccountId } from './http';
import type { MailingAddress } from '@/lib/types';

type StoredContact = AccountContact & { ownerScope: string; ownerUid: string; deletedAt?: number };

function cleanText(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new AccountError('invalid', `Enter a valid ${label}.`);
  const text = value.trim();
  if (text.length > max || (required && !text)) throw new AccountError('invalid', `Enter a valid ${label}.`);
  return text;
}

export function normalizeContactInput(input: Record<string, unknown>, current?: AccountContact): Omit<AccountContact, keyof VersionedRecord> {
  const displayName = cleanText(input.displayName ?? current?.displayName, 'name', 120, true);
  const relationship = cleanText(input.relationship ?? current?.relationship ?? '', 'relationship', 80);
  const notes = cleanText(input.notes ?? current?.notes ?? '', 'note', 2000);
  let address: MailingAddress | null = current?.address ?? null;
  if (input.address !== undefined) {
    if (input.address === null) address = null;
    else {
      if (!input.address || typeof input.address !== 'object' || Array.isArray(input.address)) throw new AccountError('invalid', 'Enter a valid mailing address.');
      const raw = input.address as Record<string, unknown>;
      const firstName = cleanText(raw.firstName ?? '', 'first name', 80);
      const lastName = cleanText(raw.lastName ?? '', 'last name', 80);
      const street1 = cleanText(raw.street1 ?? '', 'street address', 120);
      const street2 = cleanText(raw.street2 ?? '', 'address line 2', 120);
      const city = cleanText(raw.city ?? '', 'city', 80);
      const state = cleanText(raw.state ?? '', 'state or region', 80);
      const zip = cleanText(raw.zip ?? '', 'postal code', 24);
      const country = cleanText(raw.country ?? 'US', 'country', 2).toUpperCase();
      const any = [firstName,lastName,street1,street2,city,state,zip].some(Boolean);
      if (any && (!firstName || !lastName || !street1 || !city || !state || !zip)) throw new AccountError('invalid', 'Complete the mailing address or clear it.');
      address = any ? { firstName, lastName, street1, ...(street2 ? { street2 } : {}), city, state, zip, country: country || 'US' } : null;
    }
  }
  return { displayName, relationship, notes, address };
}

export async function getContact(actor: AccountActor, id: string): Promise<AccountContact | null> {
  const snap = await accountDoc('people', actor.uid, validAccountId(id)).get();
  const row = snap.data() as StoredContact | undefined;
  if (!row || row.ownerScope !== accountScope(actor.uid) || row.deletedAt) return null;
  const { ownerUid: _uid, ownerScope: _scope, deletedAt: _deleted, ...data } = row;
  return data;
}
export const getAccountContact = getContact;

export async function listContacts(actor: AccountActor, cursor?: string, limit = 20): Promise<{ data: AccountContact[]; nextCursor: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new AccountError('invalid_limit', 'Choose a valid page size.');
  const col = accountCollection('people');
  let query = col.where('ownerScope', '==', accountScope(actor.uid)).orderBy('createdAt', 'desc').limit(limit + 1);
  if (cursor) {
    const cursorId = validAccountId(cursor);
    const cursorSnap = await accountDoc('people', actor.uid, cursorId).get();
    const cursorRow = cursorSnap.data() as StoredContact | undefined;
    if (!cursorRow || cursorRow.ownerScope !== accountScope(actor.uid)) throw new AccountError('invalid_cursor', 'Reload the address book to continue.');
    query = col.where('ownerScope', '==', accountScope(actor.uid)).orderBy('createdAt', 'desc').startAfter(cursorSnap).limit(limit + 1);
  }
  const snap = await query.get();
  const hasMore = snap.docs.length > limit;
  const docs = snap.docs.slice(0,limit);
  const page = docs.map(doc => doc.data() as StoredContact).filter(row => row.ownerScope === accountScope(actor.uid) && !row.deletedAt).map(({ ownerUid: _uid, ownerScope: _scope, deletedAt: _deleted, ...row }) => row);
  return { data: page, nextCursor: hasMore ? (docs.at(-1)?.data() as StoredContact | undefined)?.id || null : null };
}

export async function createContact(actor: AccountActor, input: Record<string, unknown>, idempotencyKey?: string): Promise<AccountContact> {
  const now = Date.now();
  const id = idempotencyKey ? `c_${createHash('sha256').update(`${accountScope(actor.uid)}:${idempotencyKey}`).digest('hex').slice(0,32)}` : randomUUID();
  const content = normalizeContactInput(input);
  const row: StoredContact = { id, ...content, version: 1, createdAt: now, updatedAt: now, ownerUid: actor.uid, ownerScope: accountScope(actor.uid) };
  const ref = accountDoc('people', actor.uid, id);
  try { await firestoreDbTransactionCreate(ref,row); } catch {
    if (!idempotencyKey) throw new AccountError('unavailable','Person could not be saved.',503);
    const existing=await getContact(actor,id);
    if(existing)return existing;
    throw new AccountError('unavailable','Person could not be saved.',503);
  }
  const { ownerUid: _uid, ownerScope: _scope, ...data } = row;
  return data;
}

async function firestoreDbTransactionCreate(ref: ReturnType<typeof accountDoc>, row: StoredContact): Promise<void> {
  const { firestoreDb } = await import('@/lib/firebase-admin');
  await firestoreDb.runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists)throw new AccountError('already_exists','This person already exists.',409);tx.set(ref,row);});
}

export async function updateContact(actor: AccountActor, id: string, input: Record<string, unknown>, expectedVersion: number): Promise<AccountContact> {
  id = validAccountId(id);
  const ref = accountDoc('people', actor.uid, id);
  let result: AccountContact | null = null;
  const { firestoreDb } = await import('@/lib/firebase-admin');
  await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const old = snap.data() as StoredContact | undefined;
    if (!old || old.ownerScope !== accountScope(actor.uid) || old.deletedAt) throw new AccountError('not_found', 'Person not found.', 404);
    if (old.version !== expectedVersion) throw new AccountError('conflict', 'This person changed. Reload to review the latest version.', 409);
    const content = normalizeContactInput(input, old);
    const next: StoredContact = { ...old, ...content, version: old.version + 1, updatedAt: Date.now() };
    tx.set(ref, next);
    const { ownerUid: _uid, ownerScope: _scope, ...data } = next;
    result = data;
  });
  if (!result) throw new AccountError('unavailable', 'Person could not be saved.', 503);
  return result;
}

export async function deleteContact(actor: AccountActor, id: string, expectedVersion: number): Promise<void> {
  id = validAccountId(id);
  const ref = accountDoc('people', actor.uid, id);
  const { firestoreDb } = await import('@/lib/firebase-admin');
  const occasionSnap=await accountCollection('occasions').where('ownerScope','==',accountScope(actor.uid)).where('contactId','==',id).limit(100).get();
  const occasionRefs=occasionSnap.docs.filter(doc=>!doc.data()?.deletedAt).map(doc=>({ref:doc.ref,id:String(doc.data()?.id||'')}));
  await firestoreDb.runTransaction(async tx => {
    const [snap,...occasionSnaps] = await Promise.all([tx.get(ref),...occasionRefs.map(item=>tx.get(item.ref))]);
    const row = snap.data() as StoredContact | undefined;
    if (!row || row.ownerScope !== accountScope(actor.uid) || row.deletedAt) throw new AccountError('not_found', 'Person not found.', 404);
    if (row.version !== expectedVersion) throw new AccountError('conflict', 'This person changed. Reload before removing it.', 409);
    tx.set(ref, { ...row, version: row.version + 1, updatedAt: Date.now(), deletedAt: Date.now() });
    occasionSnaps.forEach((eventSnap,index)=>{const occasion=eventSnap.data() as {ownerScope?:string;version?:number;deletedAt?:number}|undefined;if(occasion?.ownerScope===accountScope(actor.uid)&&!occasion.deletedAt)tx.set(occasionRefs[index].ref,{...occasion,version:Number(occasion.version||1)+1,updatedAt:Date.now(),deletedAt:Date.now(),reminderEnabled:false});});
  });
  const { cancelStaleOccurrences } = await import('./occasions');
  for(const item of occasionRefs) await cancelStaleOccurrences(actor,item.id,Number((await item.ref.get()).data()?.version||1));
}
