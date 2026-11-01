import * as admin from 'firebase-admin';
import { createHash, randomUUID } from 'node:crypto';
import { AccountError } from './http';

export type LibraryObjectKind = 'source' | 'front';
export type LibraryObjectStore = {
  put(key: string, bytes: Buffer, ownerUid: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
};

function environment(): string { return process.env.LOB_ENV || process.env.NODE_ENV || 'development'; }
function ownerSegment(uid: string): string { return createHash('sha256').update(uid).digest('hex').slice(0, 32); }
function privateBucket() {
  if (process.env.NODE_ENV === 'production' && !admin.apps.length) throw new AccountError('unavailable', 'Private image storage is not configured.', 503);
  const name = process.env.UPLOAD_PRIVATE_BUCKET;
  if (!name || !admin.apps.length) throw new AccountError('unavailable', 'Private image storage is not configured.', 503);
  return admin.storage().bucket(name);
}
async function verifyBucket(bucket: ReturnType<typeof privateBucket>) {
  const [meta] = await bucket.getMetadata();
  if (meta.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true || meta.iamConfiguration?.publicAccessPrevention !== 'enforced') {
    throw new AccountError('unavailable', 'Private image storage does not meet its access policy.', 503);
  }
}

export const accountLibraryObjectStore: LibraryObjectStore = {
  async put(key, bytes, uid) {
    const bucket = privateBucket(); await verifyBucket(bucket);
    await bucket.file(key).save(bytes, { resumable: false, validation: 'crc32c', public: false,
      metadata: { contentType: 'image/png', cacheControl: 'private, no-store, max-age=0', metadata: { ownerUid: uid, private: 'true' } } });
  },
  async get(key) {
    const bucket = privateBucket(); await verifyBucket(bucket);
    try { const [bytes] = await bucket.file(key).download(); return bytes; }
    catch (error) { if ((error as { code?: number })?.code === 404) return null; throw error; }
  },
  async delete(key) { const bucket = privateBucket(); await verifyBucket(bucket); await bucket.file(key).delete({ ignoreNotFound: true }); },
};

export function accountLibraryKey(uid: string, imageId: string, version: number, kind: LibraryObjectKind): string {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(imageId) || !Number.isSafeInteger(version) || version < 1) throw new AccountError('invalid', 'Image storage identity is invalid.');
  return `account-library/${environment()}/${ownerSegment(uid)}/${imageId}/${kind}-v${version}.png`;
}
export function isAccountLibraryKey(uid: string, key: string): boolean {
  const prefix = `account-library/${environment()}/${ownerSegment(uid)}/`;
  return key.startsWith(prefix) && key.endsWith('.png') && key.split('/').length === 5;
}
export function newLibraryImageId(): string { return `img_${randomUUID().replaceAll('-', '')}`; }
export function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

/** Writes are content-addressed by record/version. A retry verifies bytes rather
 * than overwriting a different rendition; caller commits metadata only afterward. */
export async function putLibraryBytes(uid: string, imageId: string, version: number, kind: LibraryObjectKind, bytes: Buffer, store = accountLibraryObjectStore): Promise<{ key: string; hash: string }> {
  const key = accountLibraryKey(uid, imageId, version, kind); const hash = sha256(bytes);
  const existing = await store.get(key);
  if (existing && sha256(existing) !== hash) throw new AccountError('conflict', 'A different image version already exists.', 409);
  if (!existing) await store.put(key, bytes, uid);
  return { key, hash };
}

export async function readLibraryBytes(uid: string, key: string, store = accountLibraryObjectStore): Promise<Buffer> {
  if (!isAccountLibraryKey(uid, key)) throw new AccountError('not_found', 'Saved image not found.', 404);
  const bytes = await store.get(key);
  if (!bytes) throw new AccountError('not_found', 'Saved image not found.', 404);
  return bytes;
}

export async function deleteLibraryBytes(uid: string, key: string, store = accountLibraryObjectStore): Promise<void> {
  if (!isAccountLibraryKey(uid, key)) throw new AccountError('not_found', 'Saved image not found.', 404);
  await store.delete(key);
}
