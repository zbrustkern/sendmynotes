import { randomUUID, createHash } from 'node:crypto';
import { firestoreDb } from '@/lib/firebase-admin';
import { accountCollection, accountDoc, accountScope, AccountError, expectedVersion, validAccountId } from './http';
import type { AccountActor, AccountDraft, AccountDraftContent, AccountImageSelection } from './contracts';
import { getAccountImage } from './images';
import { CARD_PRESETS } from '@/lib/card-presets';

type PrivateDraft = AccountDraft & { ownerUid: string; ownerScope: string; idempotencyKey?: string; deletedAt?: number };
const drafts = () => accountCollection('drafts');
const RETENTION = 90 * 24 * 60 * 60 * 1000;
const MAX_TITLE = 100;
const str = (v: unknown, max: number, fallback = '') => typeof v === 'string' ? v.slice(0, max) : fallback;
function cleanAddress(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return { name: str(row.name, 100), addressLine1: str(row.addressLine1, 160), addressLine2: str(row.addressLine2, 160), city: str(row.city, 100), state: str(row.state, 80), zip: str(row.zip, 32), country: str(row.country, 80, 'US') };
}
export function sanitizeAccountDraftContent(value: unknown): AccountDraftContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccountError('invalid', 'Draft contents are incomplete.');
  const row = value as Record<string, unknown>;
  const selected = row.selectedDesign && typeof row.selectedDesign === 'object' ? row.selectedDesign as Record<string, unknown> : null;
  let selectedDesign: AccountDraftContent['selectedDesign'] = null;
  if (selected) {
    const source = selected.source;
    if (!['preset', 'custom', 'account'].includes(String(source))) throw new AccountError('invalid', 'Save this front to your image library before saving the draft.');
    const imageUrl = source === 'account' ? '' : str(selected.imageUrl, 4000);
    if (source !== 'account' && !imageUrl) throw new AccountError('invalid', 'Choose a card front before saving this draft.');
    const preset = source === 'preset' ? CARD_PRESETS.find((item) => item.imageUrl === imageUrl) : undefined;
    if (source === 'preset' && !preset) throw new AccountError('invalid', 'Choose a current card design before saving this draft.');
    if (source === 'custom') throw new AccountError('invalid', 'Save this custom front to My images before saving the draft.');
    selectedDesign = { presetId: preset?.id, customId: undefined,
      imageUrl, title: source === 'preset' ? preset!.title : str(selected.title, 120, 'Card front'), source: source as 'preset' | 'custom' | 'account',
      occasion: preset?.occasion || str(selected.occasion, 80) || undefined, accepted: false };
  }
  const noteRow = row.note && typeof row.note === 'object' ? row.note as Record<string, unknown> : {};
  const note = { salutation: str(noteRow.salutation, 120), text: str(noteRow.text, 12000), signOff: str(noteRow.signOff, 120), style: str(noteRow.style, 80, 'hwDavid') };
  const accountImage = row.accountImage && typeof row.accountImage === 'object' ? row.accountImage as Record<string, unknown> : null;
  let imageRef: AccountImageSelection | null = null;
  if (accountImage) {
    if (typeof accountImage.imageId !== 'string' || !Number.isSafeInteger(accountImage.version) || typeof accountImage.masterSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(accountImage.masterSha256)) throw new AccountError('invalid', 'The saved image reference is invalid.');
    imageRef = { imageId: accountImage.imageId, version: Number(accountImage.version), masterSha256: accountImage.masterSha256 };
    if (selectedDesign?.source !== 'account') throw new AccountError('invalid', 'The saved image selection is incomplete.');
  } else if (selectedDesign?.source === 'account') throw new AccountError('invalid', 'The saved image selection is incomplete.');
  const step = ['card', 'note', 'address'].includes(String(row.currentStep)) ? row.currentStep as 'card' | 'note' | 'address' : 'card';
  const clean: AccountDraftContent = { selectedDesign, note, recipient: cleanAddress(row.recipient), sender: cleanAddress(row.sender), currentStep: step };
  if (imageRef) clean.accountImage = imageRef;
  if (typeof row.contactId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.contactId)) clean.contactId = row.contactId;
  if (typeof row.occasionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(row.occasionId)) clean.occasionId = row.occasionId;
  return clean;
}
function publicDraft(row: PrivateDraft): AccountDraft { return { id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, title: row.title, content: row.content, expiresAt: row.expiresAt }; }
function validateTitle(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_TITLE) throw new AccountError('invalid', 'Enter a draft name up to 100 characters.'); return value.trim(); }
async function validateRefs(actor: AccountActor, content: AccountDraftContent) {
  if (content.accountImage) {
    const { row } = await getAccountImage(actor, content.accountImage.imageId);
    if (row.kind === 'uploaded_source') throw new AccountError('invalid', 'Choose a saved card front, not a source image.');
    if (content.accountImage.version > row.version || row.masterSha256 !== content.accountImage.masterSha256) throw new AccountError('conflict', 'This saved image changed. Choose it again before saving the draft.', 409);
  }
  if (content.contactId) {
    const { getAccountContact } = await import('./people');
    if (!await getAccountContact(actor, content.contactId)) throw new AccountError('not_found', 'The saved person could not be found in your address book.', 404);
  }
  if (content.occasionId) {
    if (!content.contactId) throw new AccountError('invalid', 'Choose the person linked to this occasion.');
    const { getAccountOccasion } = await import('./occasions');
    const occasion = await getAccountOccasion(actor, content.occasionId);
    if (!occasion || occasion.contactId !== content.contactId) throw new AccountError('not_found', 'The saved date could not be found for this person.', 404);
  }
}
function validateIdempotency(value: string | null) { if (!value || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new AccountError('invalid', 'Retry saving this draft.', 400); return value; }
export async function createAccountDraft(actor: AccountActor, input: { title: unknown; content: unknown; idempotencyKey?: string | null }): Promise<AccountDraft> {
  const title = validateTitle(input.title); const content = sanitizeAccountDraftContent(input.content); await validateRefs(actor, content);
  const key = input.idempotencyKey ? validateIdempotency(input.idempotencyKey) : null;
  const id = key ? `draft_${createHash('sha256').update(`${actor.uid}:${key}`).digest('hex').slice(0, 32)}` : `draft_${randomUUID().replaceAll('-', '')}`;
  const ref = accountDoc('drafts', actor.uid, id); const existing = await ref.get();
  if (existing.exists) {
    const row = existing.data() as PrivateDraft;
    if (row.ownerUid !== actor.uid || row.deletedAt) throw new AccountError('conflict', 'This draft could not be saved safely.', 409);
    if (key && (row.idempotencyKey !== key || JSON.stringify(row.content) !== JSON.stringify(content) || row.title !== title)) throw new AccountError('conflict', 'This save key was already used for different draft details.', 409);
    return publicDraft(row);
  }
  const now = Date.now(); const row: PrivateDraft = { id, ownerUid: actor.uid, ownerScope: accountScope(actor.uid), version: 1, createdAt: now, updatedAt: now, title, content, expiresAt: now + RETENTION, ...(key ? { idempotencyKey: key } : {}) };
  const items = await drafts().where('ownerScope', '==', accountScope(actor.uid)).where('expiresAt', '>', now).limit(101).get();
  const activeCount = items.docs.filter(doc => { const d = doc.data() as PrivateDraft; return d.ownerUid === actor.uid && !d.deletedAt; }).length;
  const quotaRef = accountDoc('draft_quotas', actor.uid, 'saved');
  return firestoreDb.runTransaction(async tx => {
    const [snap, quotaSnap] = await Promise.all([tx.get(ref), tx.get(quotaRef)]);
    if (snap.exists) {
      const current = snap.data() as PrivateDraft;
      if (current.ownerUid !== actor.uid || current.deletedAt || (key && (current.idempotencyKey !== key || current.title !== title || JSON.stringify(current.content) !== JSON.stringify(content)))) throw new AccountError('conflict', 'This draft changed while it was being saved.', 409);
      return publicDraft(current);
    }
    const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined; const used = quota?.ownerUid === actor.uid ? Number(quota.used || 0) : activeCount;
    if (used >= 100) throw new AccountError('quota_exceeded', 'Your saved drafts are full. Remove one before saving another.', 429);
    tx.set(quotaRef, { ownerUid: actor.uid, ownerScope: accountScope(actor.uid), used: used + 1, updatedAt: now });
    tx.set(ref, row); return publicDraft(row);
  });
}
export async function listAccountDrafts(actor: AccountActor, cursor?: string): Promise<{ data: AccountDraft[]; nextCursor: string | null }> {
  const size = 20; const batchSize = 40; let after: Awaited<ReturnType<ReturnType<typeof accountDoc>['get']>> | undefined;
  if (cursor) {
    let id: string; try { id = Buffer.from(cursor, 'base64url').toString(); } catch { throw new AccountError('invalid_cursor', 'Reload your drafts.', 400); }
    const cursorRow = await accountDoc('drafts', actor.uid, validAccountId(id)).get();
    if (!cursorRow.exists || (cursorRow.data() as PrivateDraft).ownerUid !== actor.uid) throw new AccountError('invalid_cursor', 'Reload your drafts.', 400);
    after = cursorRow;
  }
  const rows: PrivateDraft[] = []; let exhausted = false; let batches = 0;
  while (!exhausted && rows.length <= size && batches < 10) {
    let query = drafts().where('ownerScope', '==', accountScope(actor.uid)).orderBy('updatedAt', 'desc').limit(batchSize);
    if (after) query = query.startAfter(after);
    const snap = await query.get(); batches++; if (snap.docs.length < batchSize) exhausted = true;
    if (!snap.docs.length) break;
    for (const doc of snap.docs) {
      after = doc;
      const row = doc.data() as PrivateDraft;
      if (row.ownerUid === actor.uid && !row.deletedAt && row.expiresAt > Date.now()) rows.push(row);
      if (rows.length > size) break;
    }
  }
  const hasMore = rows.length > size; const page = rows.slice(0, size);
  const nextId = hasMore ? page[page.length - 1]?.id : !exhausted ? after?.data()?.id as string | undefined : undefined;
  return { data: page.map(publicDraft), nextCursor: nextId ? Buffer.from(nextId).toString('base64url') : null };
}
export async function getAccountDraft(actor: AccountActor, id: string): Promise<AccountDraft> {
  const snap = await accountDoc('drafts', actor.uid, validAccountId(id)).get(); const row = snap.data() as PrivateDraft | undefined;
  if (!row || row.ownerUid !== actor.uid || row.deletedAt || row.expiresAt <= Date.now()) throw new AccountError('not_found', 'Saved draft not found.', 404);
  return publicDraft(row);
}
export async function updateAccountDraft(actor: AccountActor, id: string, input: Record<string, unknown>): Promise<AccountDraft> {
  const ref = accountDoc('drafts', actor.uid, validAccountId(id)); const version = expectedVersion(input.expectedVersion);
  const current = await getAccountDraft(actor, id); if (current.version !== version) throw new AccountError('conflict', 'This draft changed in another session. Reload or copy your edits before replacing it.', 409);
  const title = input.title === undefined ? current.title : validateTitle(input.title);
  const content = input.content === undefined ? current.content : sanitizeAccountDraftContent(input.content); await validateRefs(actor, content);
  return firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const row = snap.data() as PrivateDraft | undefined;
    if (!row || row.ownerUid !== actor.uid || row.deletedAt || row.expiresAt <= Date.now()) throw new AccountError('not_found', 'Saved draft not found.', 404);
    if (row.version !== version) throw new AccountError('conflict', 'This draft changed in another session. Reload or copy your edits before replacing it.', 409);
    const now = Date.now(); const next = { ...row, title, content, version: row.version + 1, updatedAt: now, expiresAt: now + RETENTION };
    tx.set(ref, next); return publicDraft(next);
  });
}
export async function deleteAccountDraft(actor: AccountActor, id: string, versionInput: unknown): Promise<void> {
  const ref = accountDoc('drafts', actor.uid, validAccountId(id)); const version = expectedVersion(versionInput);
  const quotaRef = accountDoc('draft_quotas', actor.uid, 'saved');
  await firestoreDb.runTransaction(async tx => {
    const [snap, quotaSnap] = await Promise.all([tx.get(ref), tx.get(quotaRef)]); const row = snap.data() as PrivateDraft | undefined;
    if (!row || row.ownerUid !== actor.uid || row.deletedAt) throw new AccountError('not_found', 'Saved draft not found.', 404);
    if (row.version !== version) throw new AccountError('conflict', 'This draft changed elsewhere. Reload before deleting it.', 409);
    tx.set(ref, { ...row, version: row.version + 1, deletedAt: Date.now(), updatedAt: Date.now() });
    const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined;
    if (quota?.ownerUid === actor.uid) tx.set(quotaRef, { ...quota, used: Math.max(0, Number(quota.used || 0) - 1), updatedAt: Date.now() });
  });
}

export async function cleanupExpiredAccountDrafts(now = Date.now(), limit = 100): Promise<number> {
  const expired = await drafts().where('expiresAt', '<=', now).limit(Math.max(1, Math.min(limit, 500))).get();
  let cleaned = 0;
  for (const doc of expired.docs) {
    const row = doc.data() as PrivateDraft;
    if (!row.ownerUid) continue;
    const ref = accountDoc('drafts', row.ownerUid, row.id); const quotaRef = accountDoc('draft_quotas', row.ownerUid, 'saved');
    await firestoreDb.runTransaction(async tx => {
      const [snap, quotaSnap] = await Promise.all([tx.get(ref), tx.get(quotaRef)]); const current = snap.data() as PrivateDraft | undefined;
      if (!current || current.ownerUid !== row.ownerUid || current.expiresAt > now) return;
      tx.delete(ref);
      const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined;
      if (!current.deletedAt && quota?.ownerUid === row.ownerUid) tx.set(quotaRef, { ...quota, used: Math.max(0, Number(quota.used || 0) - 1), updatedAt: now });
      cleaned++;
    });
  }
  return cleaned;
}
