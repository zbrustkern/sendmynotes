import { randomBytes, createHash } from 'node:crypto';
import sharp from 'sharp';
import * as admin from 'firebase-admin';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getImageCachePoolCollection, firestoreDb } from '@/lib/firebase-admin';
import { accountCollection, accountDoc, accountScope, AccountError, expectedVersion, validAccountId } from './http';
import type { AccountActor } from './contracts';
import { accountLibraryKey, accountLibraryObjectStore, deleteLibraryBytes, putLibraryBytes, readLibraryBytes, sha256, type LibraryObjectStore } from './library-storage';
import { getPrivateAsset, getDesign, readPrivateAsset, requireActiveGrant, requireUploadActor } from '@/lib/upload/access';
import { validateUploadCheckoutSelection } from '@/lib/upload/generation';
import { validateCoverImagePathOrUrl } from '@/lib/handwrytten';
import type { AccountImage, AccountImageSelection } from './contracts';
import type { AccountDraft } from './contracts';
import { getOrderById } from '@/lib/firebase-admin';
import type { Order } from '@/lib/types';
import type { UploadOrderMaster } from '@/lib/upload/contracts';

const LIMIT = 100;
const CLAIM_TTL = 15 * 60_000;
type PrivateImage = AccountImage & {
  ownerUid: string; ownerScope: string; masterKey: string; masterSha256: string;
  sourceAssetId?: string; sourceDesignId?: string; idempotencyKey?: string; deletedAt?: number; objectDeletedAt?: number | null; cleanupAttemptAt?: number;
  state?: 'pending' | 'ready' | 'deleted'; sourceCacheId?: string; requestHash?: string;
};
const imageCollection = () => accountCollection('images');
const claimCollection = () => accountCollection('generation_claims');
const active = (image: PrivateImage, now = Date.now()) => !image.deletedAt && image.state === 'ready' && (!image.expiresAt || image.expiresAt > now);
const publicImage = (row: PrivateImage): AccountImage => ({
  id: row.id, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
  title: row.title, kind: row.kind, width: row.width, height: row.height,
  previewPath: `/api/account/images/${encodeURIComponent(row.id)}/media`,
  ...(row.prompt ? { prompt: row.prompt } : {}), requiresUploadGrant: row.requiresUploadGrant,
  ...(row.kind === 'generated_front' || row.kind === 'upload_front' ? { selection: { imageId: row.id, version: row.version, masterSha256: row.masterSha256 } } : {}),
});
function checkTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new AccountError('invalid', 'Enter a title up to 100 characters.');
  return value.trim();
}
function countForUid(uid: string) {
  return imageCollection().where('ownerScope', '==', accountScope(uid)).get();
}
async function readTrustedStoredImage(url: string): Promise<Buffer> {
  validateCoverImagePathOrUrl(url);
  if (url.startsWith('data:')) {
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!match) throw new AccountError('invalid_image', 'Generated artwork could not be saved.', 422);
    const raw = Buffer.from(match[1], 'base64');
    if (!raw.length || raw.length > 15 * 1024 * 1024) throw new AccountError('invalid_image', 'Generated artwork is too large to save.', 413);
    return raw;
  }
  if (url.startsWith('/')) {
    const root = path.resolve(process.cwd(), 'public'); const file = path.resolve(root, `.${url}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw new AccountError('source_unavailable', 'This image is no longer available.', 409);
    const bytes = await readFile(file); if (bytes.length > 15 * 1024 * 1024) throw new AccountError('invalid_image', 'Generated artwork is too large to save.', 413); return bytes;
  }
  let target: URL; try { target = new URL(url); } catch { throw new AccountError('source_unavailable', 'This generated image is no longer available.', 409); }
  const expectedBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  let bucketName = ''; let objectName = '';
  if (target.hostname === 'storage.googleapis.com') {
    const parts = target.pathname.split('/').filter(Boolean); bucketName = decodeURIComponent(parts.shift() || ''); objectName = decodeURIComponent(parts.join('/'));
  } else if (target.hostname === 'firebasestorage.googleapis.com') {
    const match = target.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/); if (match) { bucketName = decodeURIComponent(match[1]); objectName = decodeURIComponent(match[2]); }
  }
  if (!expectedBucket || bucketName !== expectedBucket || !objectName.startsWith('covers/') || !admin.apps.length) throw new AccountError('source_unavailable', 'This generated image is no longer available to save.', 409);
  const file = admin.storage().bucket(expectedBucket).file(objectName); const [meta] = await file.getMetadata();
  if (Number(meta.size || 0) <= 0 || Number(meta.size || 0) > 15 * 1024 * 1024) throw new AccountError('invalid_image', 'Generated artwork is too large to save.', 413);
  const [downloaded] = await file.download(); const bytes = Buffer.from(downloaded);
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new AccountError('invalid_image', 'Generated artwork is too large to save.', 413);
  return bytes;
}
async function normalizeFront(raw: Buffer) {
  try {
    const png = await sharp(raw, { failOn: 'error', limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 1275, height: 1650, fit: 'cover', position: 'centre' }).toColourspace('srgb').png().toBuffer();
    const m = await sharp(png).metadata();
    return { bytes: png, width: m.width || 1275, height: m.height || 1650 };
  } catch { throw new AccountError('invalid_image', 'This image could not be prepared for your library.', 422); }
}
async function commitImage(actor: AccountActor, args: { kind: PrivateImage['kind']; title: string; prompt?: string; sourceCacheId?: string; sourceAssetId?: string; sourceDesignId?: string; bytes: Buffer; width: number; height: number; requiresUploadGrant: boolean; idempotencyKey: string; store?: LibraryObjectStore }): Promise<AccountImage> {
  const id = `img_${createHash('sha256').update(`${actor.uid}:${args.idempotencyKey}`).digest('hex').slice(0, 32)}`;
  const ref = accountDoc('images', actor.uid, id);
  const contentHash = sha256(args.bytes); const requestHash = createHash('sha256').update(JSON.stringify({ kind: args.kind, title: args.title, contentHash, sourceCacheId: args.sourceCacheId, sourceAssetId: args.sourceAssetId, sourceDesignId: args.sourceDesignId })).digest('hex');
  const now = Date.now(); const quotaRef = accountDoc('library_quotas', actor.uid, 'saved');
  const reservation = await firestoreDb.runTransaction(async tx => {
    const [snap, quotaSnap] = await Promise.all([tx.get(ref), tx.get(quotaRef)]); const existing = snap.data() as PrivateImage | undefined;
    if (existing) {
      if (existing.ownerUid !== actor.uid || existing.idempotencyKey !== args.idempotencyKey || existing.requestHash !== requestHash) throw new AccountError('conflict', 'This save could not be retried with different image details.', 409);
      if (existing.state === 'ready' && active(existing)) return { existing, isNew: false };
      if (existing.deletedAt) throw new AccountError('conflict', 'This saved image was removed. Start a new save to add it again.', 409);
      return { existing, isNew: false };
    }
    const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined; const used = quota?.ownerUid === actor.uid ? Number(quota.used || 0) : 0;
    if (used >= LIMIT) throw new AccountError('quota_exceeded', 'Your image library has reached its 100 item limit. Remove an image before saving another.', 429);
    const row: PrivateImage = { id, ownerUid: actor.uid, ownerScope: accountScope(actor.uid), kind: args.kind, title: args.title, masterSha256: contentHash,
      ...(args.prompt ? { prompt: args.prompt } : {}), width: args.width, height: args.height, version: 1, createdAt: now, updatedAt: now,
      previewPath: `/api/account/images/${id}/media`, requiresUploadGrant: args.requiresUploadGrant,
      idempotencyKey: args.idempotencyKey, requestHash, sourceCacheId: args.sourceCacheId, sourceAssetId: args.sourceAssetId,
      sourceDesignId: args.sourceDesignId, masterKey: accountLibraryKey(actor.uid, id, 1, args.kind === 'uploaded_source' ? 'source' : 'front'), state: 'pending', cleanupAttemptAt: 0, objectDeletedAt: null };
    tx.set(ref, row); tx.set(quotaRef, { ownerUid: actor.uid, ownerScope: accountScope(actor.uid), used: used + 1, updatedAt: now });
    return { existing: row, isNew: true };
  });
  if (reservation.existing.state === 'ready' && active(reservation.existing)) return publicImage(reservation.existing);
  const bytes = args.bytes;
  const stored = await putLibraryBytes(actor.uid, id, 1, args.kind === 'uploaded_source' ? 'source' : 'front', bytes, args.store || accountLibraryObjectStore);
  const committed = await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const current = snap.data() as PrivateImage | undefined;
    if (!current || current.ownerUid !== actor.uid || current.idempotencyKey !== args.idempotencyKey || current.requestHash !== requestHash || current.deletedAt) return null;
    // A concurrent retry may have finalized the same immutable object while
    // this writer was uploading. Treat that as success without rewriting it.
    if (current.state === 'ready' && current.masterKey === stored.key && current.masterSha256 === stored.hash) return current;
    if (current.state !== 'pending') return null;
    const final: PrivateImage = { ...current, state: 'ready', masterKey: stored.key, masterSha256: stored.hash, updatedAt: Date.now() };
    tx.set(ref, final);
    return final;
  });
  if (!committed) {
    await deleteLibraryBytes(actor.uid, stored.key, args.store || accountLibraryObjectStore);
    throw new AccountError('conflict', 'This image changed while it was being saved.', 409);
  }
  return publicImage(committed);
}
function idempotency(input: unknown): string {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input)) throw new AccountError('invalid', 'Retry this save from the image screen.', 400);
  return input;
}

export async function listAccountImages(actor: AccountActor, cursor?: string): Promise<{ data: AccountImage[]; nextCursor: string | null }> {
  const limit = 20; const batchSize = 40;
  let after: Awaited<ReturnType<ReturnType<typeof accountDoc>['get']>> | undefined;
  if (cursor) {
    let decoded: string;
    try { decoded = Buffer.from(cursor, 'base64url').toString(); } catch { throw new AccountError('invalid_cursor', 'Reload your saved images.', 400); }
    const cursorDoc = await accountDoc('images', actor.uid, validAccountId(decoded)).get();
    if (!cursorDoc.exists || (cursorDoc.data() as PrivateImage).ownerUid !== actor.uid) throw new AccountError('invalid_cursor', 'Reload your saved images.', 400);
    after = cursorDoc;
  }
  const rows: PrivateImage[] = []; let exhausted = false; let batches = 0;
  while (!exhausted && rows.length <= limit && batches < 10) {
    let query = imageCollection().where('ownerScope', '==', accountScope(actor.uid)).orderBy('updatedAt', 'desc').limit(batchSize);
    if (after) query = query.startAfter(after);
    const snap = await query.get(); batches++; if (snap.docs.length < batchSize) exhausted = true;
    if (!snap.docs.length) break;
    for (const doc of snap.docs) {
      after = doc;
      const row = doc.data() as PrivateImage;
      if (row.ownerUid === actor.uid && active(row)) rows.push(row);
      if (rows.length > limit) break;
    }
  }
  const hasMore = rows.length > limit; const page = rows.slice(0, limit);
  const nextId = hasMore ? page[page.length - 1]?.id : !exhausted ? after?.data()?.id as string | undefined : undefined;
  return { data: page.map(publicImage), nextCursor: nextId ? Buffer.from(nextId).toString('base64url') : null };
}
export async function getAccountImage(actor: AccountActor, id: string): Promise<{ row: PrivateImage; image: AccountImage }> {
  const snap = await accountDoc('images', actor.uid, validAccountId(id)).get();
  const row = snap.data() as PrivateImage | undefined;
  if (!row || row.ownerUid !== actor.uid || !active(row)) throw new AccountError('not_found', 'Saved image not found.', 404);
  return { row, image: publicImage(row) };
}
export async function readAccountImageMedia(actor: AccountActor, id: string, store?: LibraryObjectStore): Promise<{ bytes: Buffer; contentType: 'image/png'; image: AccountImage }> {
  const { row, image } = await getAccountImage(actor, id);
  const bytes = await readLibraryBytes(actor.uid, row.masterKey, store);
  if (sha256(bytes) !== row.masterSha256) throw new AccountError('integrity_error', 'Saved image could not be verified. Contact support before reusing it.', 409);
  return { bytes, contentType: 'image/png', image };
}
export async function readAccountImageForOrder(actor: AccountActor, selectionInput: unknown, store?: LibraryObjectStore): Promise<{ bytes: Buffer; image: AccountImage; masterSha256: string }> {
  if (!selectionInput || typeof selectionInput !== 'object') throw new AccountError('invalid_selection', 'Choose a saved card front again.', 400);
  const selection = selectionInput as Record<string, unknown>;
  if (typeof selection.imageId !== 'string' || typeof selection.version !== 'number' || !Number.isSafeInteger(selection.version) || typeof selection.masterSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(selection.masterSha256)) throw new AccountError('invalid_selection', 'Choose a saved card front again.', 400);
  const { row, image } = await getAccountImage(actor, selection.imageId);
  if (selection.version > row.version || row.masterSha256 !== selection.masterSha256 || image.kind === 'uploaded_source') throw new AccountError('selection_changed', 'This saved card front changed. Review it again before continuing.', 409);
  if (row.requiresUploadGrant) await requireActiveGrant(actor.uid, 'checkout');
  const bytes = await readLibraryBytes(actor.uid, row.masterKey, store);
  if (sha256(bytes) !== row.masterSha256) throw new AccountError('integrity_error', 'Saved artwork could not be verified.', 409);
  return { bytes, image, masterSha256: row.masterSha256 };
}
export async function renameAccountImage(actor: AccountActor, id: string, titleInput: unknown, versionInput: unknown): Promise<AccountImage> {
  const title = checkTitle(titleInput); const version = expectedVersion(versionInput); const ref = accountDoc('images', actor.uid, validAccountId(id));
  return firestoreDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref); const row = snap.data() as PrivateImage | undefined;
    if (!row || row.ownerUid !== actor.uid || !active(row)) throw new AccountError('not_found', 'Saved image not found.', 404);
    if (row.version !== version) throw new AccountError('conflict', 'This image changed elsewhere. Reload before saving.', 409);
    const next = { ...row, title, version: row.version + 1, updatedAt: Date.now() }; tx.set(ref, next); return publicImage(next);
  });
}
export async function deleteAccountImage(actor: AccountActor, id: string, versionInput: unknown, store?: LibraryObjectStore): Promise<void> {
  const version = expectedVersion(versionInput); const ref = accountDoc('images', actor.uid, validAccountId(id));
  let removed: PrivateImage | undefined;
  await firestoreDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref); const row = snap.data() as PrivateImage | undefined;
    if (!row || row.ownerUid !== actor.uid || !active(row)) throw new AccountError('not_found', 'Saved image not found.', 404);
    if (row.version !== version) throw new AccountError('conflict', 'This image changed elsewhere. Reload before removing it.', 409);
    const drafts = await accountCollection('drafts').where('ownerScope', '==', accountScope(actor.uid)).limit(250).get();
    const inUse = drafts.docs.some((doc) => {
      const draft = doc.data() as { ownerUid?: string; content?: { accountImage?: AccountImageSelection | null }; deletedAt?: number };
      return draft.ownerUid === actor.uid && !draft.deletedAt && Number((draft as { expiresAt?: number }).expiresAt || 0) > Date.now() && draft.content?.accountImage?.imageId === id;
    });
    if (inUse) throw new AccountError('image_in_use', 'This image is used by a saved draft. Remove it from the draft before deleting the image.', 409);
    const quotaRef = accountDoc('library_quotas', actor.uid, 'saved');
    const quotaSnap = await tx.get(quotaRef); const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined;
    removed = { ...row, deletedAt: Date.now(), state: 'deleted', cleanupAttemptAt: 0, objectDeletedAt: null, version: row.version + 1, updatedAt: Date.now() }; tx.set(ref, removed);
    if (quota?.ownerUid === actor.uid) tx.set(quotaRef, { ...quota, used: Math.max(0, Number(quota.used || 0) - 1), updatedAt: Date.now() });
  });
  // The immutable order master is copied separately before payment. Cleanup
  // retries deletion failures from this private library object.
  if (removed) await deleteLibraryBytes(actor.uid, removed.masterKey, store);
}
export async function saveGeneratedClaim(actor: AccountActor, capability: unknown, titleInput: unknown, requestKey: unknown, store?: LibraryObjectStore): Promise<AccountImage> {
  if (!actor.emailVerified) throw new AccountError('email_unverified', 'Verify your sign-in email before saving images.', 403);
  if (typeof capability !== 'string' || !/^[A-Za-z0-9_-]{40,120}$/.test(capability)) throw new AccountError('invalid_capability', 'This generated image can no longer be saved. Generate it again to continue.', 400);
  const title = checkTitle(titleInput); const key = idempotency(requestKey); const tokenHash = createHash('sha256').update(capability).digest('hex');
  const claimRef = claimCollection().doc(tokenHash); const claimSnap = await claimRef.get(); const claim = claimSnap.data() as { cacheId?: string; expiresAt?: number; claimedUid?: string; imageId?: string; idempotencyKey?: string } | undefined;
  if (!claim || !claim.cacheId || !claim.expiresAt || claim.expiresAt < Date.now()) throw new AccountError('capability_expired', 'This generated image can no longer be saved. Generate it again to continue.', 410);
  if (claim.claimedUid && claim.claimedUid !== actor.uid) throw new AccountError('capability_used', 'This generated image was already saved to another account.', 409);
  if (claim.idempotencyKey && claim.idempotencyKey !== key) throw new AccountError('capability_used', 'This generated image was already saved. Open it from your image library.', 409);
  await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(claimRef); const current = snap.data() as typeof claim;
    if (!current || current.cacheId !== claim.cacheId || current.expiresAt !== claim.expiresAt) throw new AccountError('capability_expired', 'This generated image can no longer be saved.', 410);
    if (current.claimedUid && current.claimedUid !== actor.uid) throw new AccountError('capability_used', 'This generated image was already saved to another account.', 409);
    if (current.idempotencyKey && current.idempotencyKey !== key) throw new AccountError('capability_used', 'This generated image was already saved.', 409);
    tx.set(claimRef, { ...current, claimedUid: actor.uid, idempotencyKey: key, savingAt: Date.now() });
  });
  if (claim.imageId) {
    const prior = await getAccountImage(actor, claim.imageId);
    return prior.image;
  }
  const cache = await getImageCachePoolCollection().doc(claim.cacheId).get(); const cached = cache.data() as { id?: string; imageUrl?: string; prompt?: string; occasion?: string; isGenerated?: boolean; status?: string } | undefined;
  if (!cached || cached.id !== claim.cacheId || cached.isGenerated !== true || !cached.imageUrl || !['AVAILABLE', 'CLAIMED'].includes(cached.status || '')) throw new AccountError('source_unavailable', 'This generated image is no longer available. Generate another front to save it.', 409);
  const raw = await readTrustedStoredImage(cached.imageUrl); const normalized = await normalizeFront(raw);
  const image = await commitImage(actor, { kind: 'generated_front', title, prompt: cached.prompt?.slice(0, 1000), sourceCacheId: claim.cacheId,
    bytes: normalized.bytes, width: normalized.width, height: normalized.height, requiresUploadGrant: false, idempotencyKey: key, store });
  await claimRef.set({ ...claim, claimedUid: actor.uid, idempotencyKey: key, imageId: image.id, claimedAt: Date.now() });
  return image;
}
export async function issueGeneratedSaveCapability(cacheId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(cacheId)) return null;
  const snap = await getImageCachePoolCollection().doc(cacheId).get(); const row = snap.data() as { id?: string; imageUrl?: string; isGenerated?: boolean; status?: string } | undefined;
  if (!row || row.id !== cacheId || !row.isGenerated || !row.imageUrl || row.status !== 'AVAILABLE') return null;
  const token = randomBytes(32).toString('base64url'); const tokenHash = createHash('sha256').update(token).digest('hex');
  await claimCollection().doc(tokenHash).set({ cacheId, expiresAt: Date.now() + CLAIM_TTL, createdAt: Date.now() });
  return token;
}
export async function saveStudioSource(actor: AccountActor, input: { sourceAssetId?: unknown; uploadSelection?: unknown; title?: unknown; idempotencyKey?: unknown }): Promise<AccountImage> {
  if (!actor.emailVerified) throw new AccountError('email_unverified', 'Verify your sign-in email before saving images.', 403);
  await requireActiveGrant(actor.uid, 'read'); const title = checkTitle(input.title); const key = idempotency(input.idempotencyKey);
  if (typeof input.sourceAssetId === 'string') {
    const asset = await getPrivateAsset(actor.uid, input.sourceAssetId);
    if (!asset) throw new AccountError('source_expired', 'This Studio upload has expired. Upload it again before saving.', 409);
    const bytes = await readPrivateAsset(asset.key);
    return commitImage(actor, { kind: 'uploaded_source', title, sourceAssetId: asset.id, bytes, width: asset.width, height: asset.height, requiresUploadGrant: true, idempotencyKey: key });
  }
  if (input.uploadSelection) {
    const design = await validateUploadCheckoutSelection(actor.uid, input.uploadSelection as never);
    const bytes = await readPrivateAsset(design.masterKey);
    const meta = await sharp(bytes).metadata();
    return commitImage(actor, { kind: 'upload_front', title, sourceDesignId: design.id, bytes, width: meta.width || 1275, height: meta.height || 1650, requiresUploadGrant: true, idempotencyKey: key });
  }
  throw new AccountError('invalid', 'Choose a Studio source or accepted front to save.');
}

export async function saveHistoricalOrderFront(actor: AccountActor, orderIdInput: unknown, titleInput: unknown, keyInput: unknown, store?: LibraryObjectStore, readOrderMaster?: (master: UploadOrderMaster) => Promise<Buffer>): Promise<AccountImage> {
  const orderId = validAccountId(orderIdInput); const title = checkTitle(titleInput); const key = idempotency(keyInput);
  const order = await getOrderById(orderId) as Order | null;
  const ownsByUid = Boolean(order && order.userId === actor.uid);
  const ownsByVerifiedEmail = Boolean(order && !order.userId && actor.emailVerified && actor.email && order.customerEmail?.trim().toLowerCase() === actor.email);
  if (!order || (!ownsByUid && !ownsByVerifiedEmail)) throw new AccountError('not_found', 'This card front is not available in your account.', 404);
  const acceptedStatuses = new Set(['PAYMENT_RECEIVED','AWAITING_RECIPIENT_ADDRESS','DISPATCHING','DISPATCH_UNCERTAIN','PROCESSING_HANDWRYTTEN','QUEUED_FOR_FULFILLMENT','MAILED']);
  if (!acceptedStatuses.has(order.status) || order.origin === 'ADMIN_COMP' || order.isComp || order.isFounderTest || order.isTest || order.paymentMode === 'stripe_test' || order.paymentMode === 'local_mock') throw new AccountError('not_found', 'This card does not have an accepted front to save.', 404);
  const requiresUploadGrant = order.uploadMaster ? order.uploadMaster.requiresUploadGrant !== false : false;
  let raw: Buffer;
  if (order.uploadMaster) {
    const readMaster = readOrderMaster || (await import('@/lib/upload/order-master')).readOrderUploadMaster;
    raw = await readMaster(order.uploadMaster);
  } else {
    if (!order.frontImageUrl) throw new AccountError('source_unavailable', 'This older card does not have a saved front available.', 409);
    try { raw = await readTrustedStoredImage(order.frontImageUrl); }
    catch { throw new AccountError('source_unavailable', 'This older card front is no longer available.', 409); }
  }
  const normalized = await normalizeFront(raw);
  return commitImage(actor, { kind: requiresUploadGrant ? 'upload_front' : 'generated_front', title, bytes: normalized.bytes, width: normalized.width, height: normalized.height, requiresUploadGrant, idempotencyKey: key, store });
}
export async function reuseAccountImage(actor: AccountActor, id: string, selection?: AccountImageSelection, idempotencyKey?: string | null): Promise<{ draft?: AccountDraft; studioUrl?: string }> {
  const { row, image } = await getAccountImage(actor, id);
  if (selection && (selection.imageId !== image.id || selection.version > image.version || selection.masterSha256 !== row.masterSha256)) throw new AccountError('conflict', 'This saved image changed. Reload it before continuing.', 409);
  if (row.kind === 'uploaded_source') {
    if (!actor.emailVerified) throw new AccountError('email_unverified', 'Verify your sign-in email to open the Upload studio.', 403);
    const grant = await requireActiveGrant(actor.uid, 'work');
    const bytes = await readLibraryBytes(actor.uid, row.masterKey);
    const { putPrivateAsset, uploadCollections } = await import('@/lib/upload/access');
    const key = await putPrivateAsset(actor.uid, 'source', bytes); const sourceId = key.split('/').at(-1)!.replace(/\.png$/, '');
    const createdAt = Date.now(); const expiresAt = createdAt + 7 * 86_400_000;
    await uploadCollections.col('uploadAssets').doc(uploadCollections.envKey(sourceId)).set({ id: sourceId, uid: actor.uid, key, width: row.width, height: row.height, mimeType: 'image/png', createdAt, expiresAt, reusedFromAccountImage: image.id });
    if (!grant) throw new AccountError('access_denied', 'Upload studio access is unavailable.', 403);
    return { studioUrl: `/create/upload?asset=${encodeURIComponent(sourceId)}` };
  }
  if (row.requiresUploadGrant) await requireActiveGrant(actor.uid, 'checkout');
  const bytes = await readLibraryBytes(actor.uid, row.masterKey);
  if (sha256(bytes) !== row.masterSha256) throw new AccountError('integrity_error', 'Saved image could not be verified.', 409);
  const content = {
    selectedDesign: { presetId: undefined, customId: undefined, imageUrl: '', title: row.title, source: 'account' as const, accepted: false },
    accountImage: { imageId: row.id, version: row.version, masterSha256: row.masterSha256 },
    note: { salutation: '', text: '', signOff: '', style: 'hwDavid' }, recipient: null, sender: null, currentStep: 'card' as const,
  };
  const { createAccountDraft } = await import('./drafts');
  const draft = await createAccountDraft(actor, { title: row.title, content, idempotencyKey });
  return { draft };
}

/** Retry abandoned pending writes and private-object deletions from account cleanup. */
export async function cleanupAccountLibrary(now = Date.now(), limit = 100): Promise<{ deleted: number; pending: number }> {
  const retryAfter = now - 15 * 60_000;
  const [pendingSnapshot, deletedSnapshot] = await Promise.all([
    imageCollection().where('state', '==', 'pending').where('cleanupAttemptAt', '<=', retryAfter).limit(Math.max(1, Math.min(limit, 500))).get(),
    imageCollection().where('state', '==', 'deleted').where('objectDeletedAt', '==', null).where('cleanupAttemptAt', '<=', retryAfter).limit(Math.max(1, Math.min(limit, 500))).get(),
  ]);
  let deleted = 0; let pending = 0;
  for (const doc of [...pendingSnapshot.docs, ...deletedSnapshot.docs]) {
    const row = doc.data() as PrivateImage;
    if (!row.ownerUid || !row.masterKey) continue;
    if ((row.state === 'deleted' || row.deletedAt) && !row.objectDeletedAt) {
      try {
        await deleteLibraryBytes(row.ownerUid, row.masterKey); deleted++;
        const ref = accountDoc('images', row.ownerUid, row.id);
        await firestoreDb.runTransaction(async tx => {
          const currentSnap = await tx.get(ref); const current = currentSnap.data() as PrivateImage | undefined;
          if (current?.ownerUid === row.ownerUid && current.state === 'deleted' && current.masterKey === row.masterKey) tx.set(ref, { ...current, objectDeletedAt: now, cleanupAttemptAt: now });
        });
      } catch {
        await accountDoc('images', row.ownerUid, row.id).set({ ...row, cleanupAttemptAt: now });
      }
      continue;
    }
    if (!row.createdAt || row.createdAt > now - 60 * 60_000) continue;
    try {
      const ref = accountDoc('images', row.ownerUid, row.id);
      const marked = await firestoreDb.runTransaction(async tx => {
        const currentSnap = await tx.get(ref); const current = currentSnap.data() as PrivateImage | undefined;
        if (!current || current.ownerUid !== row.ownerUid || current.state !== 'pending' || current.idempotencyKey !== row.idempotencyKey) return false;
        const quotaRef = accountDoc('library_quotas', row.ownerUid!, 'saved'); const quotaSnap = await tx.get(quotaRef); const quota = quotaSnap.data() as { ownerUid?: string; used?: number } | undefined;
        tx.set(ref, { ...current, state: 'deleted', deletedAt: now, cleanupAttemptAt: now, objectDeletedAt: null, version: current.version + 1, updatedAt: now });
        if (quota?.ownerUid === row.ownerUid) tx.set(quotaRef, { ...quota, used: Math.max(0, Number(quota.used || 0) - 1), updatedAt: now });
        return true;
      });
      if (marked) {
        await deleteLibraryBytes(row.ownerUid, row.masterKey); pending++;
        await ref.set({ ...(await ref.get()).data(), objectDeletedAt: now, cleanupAttemptAt: now });
      }
    } catch {
      const ref = accountDoc('images', row.ownerUid, row.id);
      const current = (await ref.get()).data() as PrivateImage | undefined;
      if (current?.ownerUid === row.ownerUid) await ref.set({ ...current, cleanupAttemptAt: now });
    }
  }
  return { deleted, pending };
}
