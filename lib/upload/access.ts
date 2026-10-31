import { randomUUID, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { firestoreDb, isFirestoreMock, verifyFirebaseIdToken } from '../firebase-admin';
import { UploadAccess, UploadAsset, UploadDesign, UploadError, UploadGeneration, UploadGrant, UploadOrderMaster, UploadStandards, UPLOAD_LIMITS } from './contracts';

const col = (name: string) => firestoreDb.collection(name);
const now = () => Date.now();
const DAY = 86400000;
const envKey = (value: string) => `${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}_${value}`;
const validRecordId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validUid = (value: string) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\/\\\u0000-\u001f\u007f]/.test(value);

function assertRuntime(): void {
  if (process.env.NODE_ENV === 'production' && isFirestoreMock) throw new UploadError('service_unavailable', 'Upload storage is not configured.', 503);
  if (isFirestoreMock && process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') throw new UploadError('service_unavailable', 'Upload storage is not configured.', 503);
}
export function assertUploadRuntime(): void { assertRuntime(); }

export async function requireUploadActor(req: NextRequest): Promise<{ uid: string; email?: string }> {
  assertRuntime();
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  let decoded: admin.auth.DecodedIdToken | null = null;
  if (match?.[1] && !isFirestoreMock && admin.apps.length) {
    try { decoded = await admin.auth().verifyIdToken(match[1], true); }
    catch { decoded = null; }
  } else {
    decoded = await verifyFirebaseIdToken(match?.[1]);
  }
  if (!decoded || !decoded.email_verified) throw new UploadError('unauthorized', 'Sign in with a verified account to use uploads.', 401);
  return { uid: decoded.uid, email: decoded.email?.toLowerCase() };
}

export async function requireActiveGrant(uid: string, action: 'work' | 'read' | 'checkout'): Promise<UploadGrant> {
  assertRuntime();
  const grant = (await col('uploadAccess').doc(envKey(uid)).get()).data() as UploadGrant | undefined;
  if (!grant || grant.uid !== uid || grant.revoked || grant.expiresAt <= now()) throw new UploadError('access_denied', 'Upload studio access is unavailable.', 403);
  if (action === 'work' && (await getActiveStandards()).paused) throw new UploadError('paused', 'New upload studio work is paused.', 423);
  return grant;
}

export async function getUploadAccess(uid: string): Promise<UploadAccess> {
  const standards = await getActiveStandards();
  const doc = (await col('uploadAccess').doc(envKey(uid)).get()).data() as UploadGrant | undefined;
  let used = 0;
  if (doc?.uid === uid) {
    const dayKey = new Date(now()).toISOString().slice(0, 10);
    used = Number((await col('uploadQuota').doc(envKey(`${uid}_${dayKey}`)).get()).data()?.used || 0);
  }
  const allowed = Boolean(doc && doc.uid === uid && !doc.revoked && doc.expiresAt > now());
  return { allowed, reason: allowed ? undefined : 'not_entitled', paused: standards.paused, used, dailyLimit: doc?.dailyLimit || UPLOAD_LIMITS.daily, expiresAt: doc?.expiresAt, standards: { version: standards.version, enabledTreatments: standards.enabledTreatments, defaultTreatment: standards.defaultTreatment } };
}

export async function getActiveUploadAssetCount(uid: string): Promise<number> {
  const snapshot=await col('uploadAssets').where('uid','==',uid).get();
  const prefix=`${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}_`;
  return snapshot.docs.filter(doc=>doc.id.startsWith(prefix)).reduce((count,doc)=>{
    const row=doc.data() as UploadAsset & {deletedAt?:number};
    return count+(!row.deletedAt&&row.expiresAt>now()?1:0);
  },0);
}

export async function getPrivateAsset(uid: string, id: string): Promise<UploadAsset | null> {
  if (!validUid(uid) || !validRecordId(id)) return null;
  const data = (await col('uploadAssets').doc(envKey(id)).get()).data() as UploadAsset | undefined;
  if (!data || data.uid !== uid || data.expiresAt <= now() || (data as UploadAsset & { deletedAt?: number }).deletedAt) return null;
  return data;
}

/** Atomically claim provider invocation against source deletion and grant changes. */
export async function markGenerationStarted(uid:string,generationId:string,assetId:string):Promise<void> {
  if(!validUid(uid)||!validRecordId(generationId)||!validRecordId(assetId)) throw new UploadError('invalid_generation','Generation could not be started.',400);
  const generationRef=col('uploadGenerations').doc(envKey(generationId));
  const assetRef=col('uploadAssets').doc(envKey(assetId));
  const grantRef=col('uploadAccess').doc(envKey(uid));
  const activeRef=col('uploadStandards').doc(envKey('active'));
  await firestoreDb.runTransaction(async tx=>{
    const [generationSnap,assetSnap,grantSnap,activeSnap]=await Promise.all([tx.get(generationRef),tx.get(assetRef),tx.get(grantRef),tx.get(activeRef)]);
    const generation=generationSnap.data() as UploadGeneration & {deletedAt?:number;providerStartedAt?:number}|undefined;
    const asset=assetSnap.data() as UploadAsset & {deletedAt?:number}|undefined;
    const grant=grantSnap.data() as UploadGrant|undefined;
    if(!generation||generation.uid!==uid||generation.assetId!==assetId||generation.status!=='pending'||generation.deletedAt||generation.providerStartedAt) throw new UploadError('generation_not_pending','This image request is no longer available to start.',409);
    if(!asset||asset.uid!==uid||asset.deletedAt||asset.expiresAt<=now()) throw new UploadError('not_found','Image could not be found.',404);
    if(!grant||grant.uid!==uid||grant.revoked||grant.expiresAt<=now()) throw new UploadError('access_denied','Upload studio access is unavailable.',403);
    const version=Number(activeSnap.data()?.version||1);
    if(version!==generation.standardsVersion) throw new UploadError('standards_changed','Upload standards changed. Reload before generating.',409);
    const standardsSnap=await tx.get(col('uploadStandards').doc(envKey(String(version))));
    if((standardsSnap.data() as UploadStandards|undefined)?.paused) throw new UploadError('paused','New upload studio work is paused.',423);
    tx.set(generationRef,{...generation,providerStartedAt:now()});
  });
}

/** Tombstone a source before deleting its private source/result/master objects. */
export async function deleteUploadAssetTree(uid: string, id: string): Promise<void> {
  const assetRef=col('uploadAssets').doc(envKey(id));
  const prefix=`${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}_`;
  const generationSnap=await col('uploadGenerations').where('uid','==',uid).get();
  const generations=generationSnap.docs.filter(doc=>doc.id.startsWith(prefix)&&doc.data()?.assetId===id);
  const generationIds=new Set<string>();
  const generationRows=new Map<string,UploadGeneration & {deletedAt?:number}>();
  let asset: (UploadAsset & {deletedAt?:number})|undefined;
  const deletedAt=now();
  await firestoreDb.runTransaction(async tx=>{
    const assetSnap=await tx.get(assetRef);
    const rows=[] as Array<{doc:typeof generations[number];row:UploadGeneration & {deletedAt?:number}}>;
    for (const doc of generations) rows.push({doc,row:(await tx.get(doc.ref)).data() as UploadGeneration & {deletedAt?:number}});
    asset=assetSnap.data() as UploadAsset & {deletedAt?:number} | undefined;
    if (!asset || asset.uid!==uid || asset.expiresAt<=now() || asset.deletedAt) throw new UploadError('not_found','Image not found.',404);
    tx.update(assetRef,{deletedAt,tombstoneExpiresAt:deletedAt+30*DAY});
    for (const {doc,row} of rows) {
      if (!row || row.uid!==uid || row.assetId!==id) continue;
      generationIds.add(row.id);
      generationRows.set(row.id,row);
      if (!row.deletedAt) tx.set(doc.ref,{...row,deletedAt,tombstoneExpiresAt:deletedAt+30*DAY});
    }
  });
  for (const doc of generations) {
    const row=generationRows.get((doc.data() as UploadGeneration).id);
    if (!row || !generationIds.has(row.id)) continue;
    if (row.key) { await deletePrivateAsset(row.key); await doc.ref.set({...row,deletedAt,key:'',objectDeletedAt:now()}); }
  }
  const designSnap=await col('uploadDesigns').where('uid','==',uid).get();
  for (const doc of designSnap.docs) {
    const row=doc.data() as UploadDesign & {deletedAt?:number};
    if (!doc.id.startsWith(prefix) || !generationIds.has(row.generationId) || row.ordered) continue;
    if (!row.deletedAt) await doc.ref.set({...row,deletedAt});
    if (row.masterKey) { await deletePrivateAsset(row.masterKey); await doc.ref.set({...row,deletedAt,masterKey:'',objectDeletedAt:now()}); }
  }
  if (asset?.key) { await deletePrivateAsset(asset.key); await assetRef.update({key:'',objectDeletedAt:now()}); }
}

function privateBucket() {
  assertRuntime();
  const name = process.env.UPLOAD_PRIVATE_BUCKET;
  if (!name) throw new UploadError('storage_unavailable', 'Private upload storage is not configured.', 503);
  if (!admin.apps.length) throw new UploadError('storage_unavailable', 'Private upload storage is not configured.', 503);
  return admin.storage().bucket(name);
}

async function ensurePrivateBucket(bucket: ReturnType<typeof privateBucket>) {
  const [metadata] = await bucket.getMetadata();
  const iam = metadata.iamConfiguration || {};
  const uniform = iam.uniformBucketLevelAccess?.enabled === true;
  const prevention = iam.publicAccessPrevention === 'enforced';
  if (!uniform || !prevention) throw new UploadError('storage_policy', 'Upload storage must enforce uniform access and public access prevention.', 503);
}

export async function putPrivateAsset(uid: string, kind: string, bytes: Buffer): Promise<string> {
  if (!validUid(uid)) throw new UploadError('invalid_owner', 'Private upload owner is invalid.', 400);
  if (!['source','generation','design','order'].includes(kind)) throw new UploadError('invalid_storage_kind', 'Unsupported private asset type.', 400);
  const bucket = privateBucket();
  await ensurePrivateBucket(bucket);
  const ownerSegment = createHash('sha256').update(uid).digest('hex').slice(0,32);
  const root = kind === 'order' ? 'upload-orders' : 'upload-private';
  const key = `${root}/${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}/${ownerSegment}/${kind}/${randomUUID()}.png`;
  await bucket.file(key).save(bytes, { resumable: false, metadata: { contentType: 'image/png', cacheControl: 'private, no-store, max-age=0', metadata: { ownerUid: uid, private: 'true' } }, public: false, validation: 'crc32c' });
  return key;
}

/** Persist a cleanup pin before writing an order copy. Deterministic keys make
 * retries idempotent and let cleanup recover a crash during object creation. */
export async function putPrivateOrderAsset(uid: string, orderId: string, bytes: Buffer): Promise<string> {
  if (!validUid(uid) || !/^order_[A-Za-z0-9_-]{1,128}$/.test(orderId)) throw new UploadError('invalid_order_identity','Order artwork identity is invalid.',400);
  const ownerSegment=createHash('sha256').update(uid).digest('hex').slice(0,32);
  const env=process.env.LOB_ENV || process.env.NODE_ENV || 'development';
  const key=`upload-orders/${env}/${ownerSegment}/order/${orderId}.png`;
  const pinRef=col('uploadOrderPins').doc(envKey(orderId));
  const hash=createHash('sha256').update(bytes).digest('hex');
  await firestoreDb.runTransaction(async tx=>{
    const snap=await tx.get(pinRef);
    const old=snap.data() as {uid?:string;orderId?:string;masterKey?:string;masterSha256?:string;expiresAt?:number}|undefined;
    if (old && (old.uid!==uid || old.masterKey!==key || old.masterSha256!==hash)) throw new UploadError('order_asset_conflict','This order already has different private artwork.',409);
    if (!old) tx.set(pinRef,{uid,orderId,masterKey:key,masterSha256:hash,createdAt:now(),expiresAt:now()+DAY,status:'pending'});
  });
  const bucket=privateBucket();
  await ensurePrivateBucket(bucket);
  const file=bucket.file(key);
  const [exists]=await file.exists();
  if (exists) {
    const [stored]=await file.download();
    if (createHash('sha256').update(stored).digest('hex')!==hash) throw new UploadError('order_asset_conflict','This order already has different private artwork.',409);
  } else {
    await file.save(bytes,{resumable:false,metadata:{contentType:'image/png',cacheControl:'private, no-store, max-age=0',metadata:{ownerUid:uid,private:'true',masterSha256:hash}},public:false,validation:'crc32c'});
  }
  await pinRef.set({uid,orderId,masterKey:key,masterSha256:hash,createdAt:(await pinRef.get()).data()?.createdAt||now(),expiresAt:now()+DAY,status:'ready'});
  return key;
}

function isPrivateAssetKey(key: string, root: 'upload-private' | 'upload-orders'): boolean {
  const env = process.env.LOB_ENV || process.env.NODE_ENV || 'development';
  const parts = key.split('/');
  return parts.length === 5 && parts[0] === root && parts[1] === env && /^[a-f0-9]{32}$/.test(parts[2]) &&
    (root === 'upload-orders' ? parts[3] === 'order' : ['source','generation','design'].includes(parts[3])) &&
    (root === 'upload-orders' ? /^order_[A-Za-z0-9_-]{1,128}\.png$/.test(parts[4]) : /^[0-9a-f-]{36}\.png$/.test(parts[4]));
}

export async function readPrivateAsset(key: string): Promise<Buffer> {
  if (!isPrivateAssetKey(key, 'upload-private') && !isPrivateAssetKey(key, 'upload-orders')) throw new UploadError('not_found', 'Preview not found.', 404);
  const bucket = privateBucket();
  await ensurePrivateBucket(bucket);
  const [bytes] = await bucket.file(key).download();
  return bytes;
}

export async function deletePrivateAsset(key: string): Promise<void> {
  if (!isPrivateAssetKey(key, 'upload-private')) throw new UploadError('not_found', 'Private object not found.', 404);
  const bucket = privateBucket();
  await ensurePrivateBucket(bucket);
  await bucket.file(key).delete({ ignoreNotFound: true });
}

async function deleteOrderAsset(key: string): Promise<void> {
  if (!isPrivateAssetKey(key, 'upload-orders')) throw new UploadError('not_found', 'Order artwork not found.', 404);
  const bucket = privateBucket();
  await ensurePrivateBucket(bucket);
  await bucket.file(key).delete({ ignoreNotFound: true });
}

export async function cleanupExpiredUploads(at = now()): Promise<{ assets: number; generations: number; designs: number; orphaned: number }> {
  assertRuntime();
  const removed = { assets: 0, generations: 0, designs: 0, orphaned: 0 };
  const prefix = `${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}_`;
  const assets = await col('uploadAssets').get();
  for (const doc of assets.docs) {
    const row = doc.data() as UploadAsset & { deletedAt?: number };
    if (!doc.id.startsWith(prefix)) continue;
    if (row.deletedAt) {
      if (row.key) await deletePrivateAsset(row.key);
      if ((row as any).tombstoneExpiresAt && (row as any).tombstoneExpiresAt <= at) await doc.ref.delete();
      else if (row.key) await doc.ref.set({ ...row, key:'', objectDeletedAt:at });
      removed.assets++;
      continue;
    }
    if (row.expiresAt > at) continue;
    await deletePrivateAsset(row.key);
    await doc.ref.delete(); removed.assets++;
  }
  const generations = await col('uploadGenerations').get();
  for (const doc of generations.docs) {
    const row = doc.data() as UploadGeneration;
    if (!doc.id.startsWith(prefix)) continue;
    const tombstone=row as UploadGeneration & {deletedAt?:number;tombstoneExpiresAt?:number};
    const deleted = Boolean(tombstone.deletedAt);
    if (!deleted && row.expiresAt > at) continue;
    if (['pending','unresolved'].includes(row.status)) {
      if (row.status === 'unresolved' && (row as UploadGeneration & { abandonedAt?: number }).abandonedAt && row.expiresAt <= at) {
        const pendingRef = col('uploadPending').doc(envKey(row.uid));
        const pendingSnap = await pendingRef.get();
        if (pendingSnap.data()?.id === row.id) await pendingRef.delete();
        await doc.ref.delete(); removed.generations++;
      }
      continue;
    }
    if (row.key) await deletePrivateAsset(row.key);
    if (deleted && (tombstone.tombstoneExpiresAt||0)>at) await doc.ref.set({ ...row, key:'', objectDeletedAt:at });
    else await doc.ref.delete();
    removed.generations++;
  }
  const designs = await col('uploadDesigns').get();
  for (const doc of designs.docs) {
    const row = doc.data() as UploadDesign;
    if (!doc.id.startsWith(prefix) || row.ordered) continue;
    const tombstone=row as UploadDesign & {deletedAt?:number;tombstoneExpiresAt?:number};
    const deleted = Boolean(tombstone.deletedAt);
    let sourceDeleted=deleted;
    if (!sourceDeleted) {
      const generation=(await col('uploadGenerations').doc(envKey(row.generationId)).get()).data() as (UploadGeneration & {deletedAt?:number})|undefined;
      if (generation?.deletedAt) sourceDeleted=true;
      else if (generation?.assetId) {
        const source=(await col('uploadAssets').doc(envKey(generation.assetId)).get()).data() as (UploadAsset & {deletedAt?:number})|undefined;
        sourceDeleted=Boolean(source?.deletedAt);
      }
    }
    if (!sourceDeleted && row.expiresAt > at) continue;
    if (row.masterKey) await deletePrivateAsset(row.masterKey);
    if (sourceDeleted && row.expiresAt>at) await doc.ref.set({ ...row, deletedAt:tombstone.deletedAt||at, tombstoneExpiresAt:tombstone.tombstoneExpiresAt||at+30*DAY, masterKey:'', objectDeletedAt:at });
    else await doc.ref.delete();
    removed.designs++;
  }
  // Order masters use a separate object namespace and are swept only through
  // short-lived pre-checkout pins. Persisted orders retain their copied key.
  const pins = await col('uploadOrderPins').get();
  for (const doc of pins.docs) {
    if (!doc.id.startsWith(prefix)) continue;
    const pin = doc.data() as { orderId?: string; masterKey?: string; expiresAt?: number };
    if (!pin.orderId || !pin.masterKey || !pin.expiresAt || pin.expiresAt > at) continue;
    const order = await col('orders').doc(pin.orderId).get();
    if (!order.exists) await deleteOrderAsset(pin.masterKey);
    await doc.ref.delete();
  }
  // Covers a crash after object upload but before its Firestore record exists.
  // Normal uploads are private immediately; this sweep removes unreferenced
  // objects after a 24-hour recovery window.
  const liveKeys = new Set<string>();
  for (const name of ['uploadAssets','uploadGenerations','uploadDesigns']) {
    const snapshot = await col(name).get();
    for (const doc of snapshot.docs) {
      if (!doc.id.startsWith(prefix)) continue;
      const row = doc.data() as { key?: string; masterKey?: string };
      if (row.key) liveKeys.add(row.key);
      if (row.masterKey) liveKeys.add(row.masterKey);
    }
  }
  const bucket = privateBucket(); await ensurePrivateBucket(bucket);
  const [files] = await bucket.getFiles({ prefix: `upload-private/${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}/` });
  for (const file of files) {
    if (liveKeys.has(file.name)) continue;
    const [metadata] = await file.getMetadata();
    const created = Date.parse(metadata.timeCreated || '');
    if (Number.isFinite(created) && created + DAY <= at) { await file.delete({ignoreNotFound:true}); removed.orphaned++; }
  }
  return removed;
}

export async function getActiveStandards(): Promise<UploadStandards> {
  const active = (await col('uploadStandards').doc(envKey('active')).get()).data() as { version: number } | undefined;
  if (active) {
    const record = (await col('uploadStandards').doc(envKey(String(active.version))).get()).data() as UploadStandards | undefined;
    if (record) return record;
  }
  return { version: 1, creativeGuidance: '', enabledTreatments: ['playful-stack','gentle-arch','classic-serif'], defaultTreatment: 'playful-stack', paused: false, publishedAt: now(), publishedBy: 'system' };
}

export async function getDesign(id: string): Promise<UploadDesign | null> {
  if (!validRecordId(id)) return null;
  const d = (await col('uploadDesigns').doc(envKey(id)).get()).data() as (UploadDesign & {deletedAt?:number}) | undefined;
  if (!d || d.id !== id || d.deletedAt || d.expiresAt <= now()) return null;
  const generation=(await col('uploadGenerations').doc(envKey(d.generationId)).get()).data() as (UploadGeneration & {deletedAt?:number})|undefined;
  if (generation?.deletedAt) return null;
  if (generation?.assetId) {
    const source=(await col('uploadAssets').doc(envKey(generation.assetId)).get()).data() as (UploadAsset & {deletedAt?:number})|undefined;
    if (source?.deletedAt) return null;
  }
  return d;
}
export async function putDesign(record: UploadDesign): Promise<void> {
  const ref = col('uploadDesigns').doc(envKey(record.id));
  await firestoreDb.runTransaction(async tx => { const existing = await tx.get(ref); if (existing.exists) throw new UploadError('design_immutable', 'Design IDs are immutable.', 409); tx.set(ref, record); });
}
export async function getGeneration(id: string): Promise<UploadGeneration | null> {
  if (!validRecordId(id)) return null;
  const ref = col('uploadGenerations').doc(envKey(id));
  let d = (await ref.get()).data() as (UploadGeneration & {deletedAt?:number}) | undefined;
  // A worker can disappear after reserving quota but before recording its
  // outcome. Surface an explicit-recovery state after five minutes; never
  // resubmit the provider call or release the reservation implicitly.
  if (d?.status === 'pending' && d.createdAt + 5 * 60_000 <= now()) {
    await firestoreDb.runTransaction(async tx => {
      const current = (await tx.get(ref)).data() as UploadGeneration | undefined;
      if (current?.status === 'pending' && current.createdAt + 5 * 60_000 <= now()) {
        const unresolved = { ...current, status: 'unresolved' as const, unresolvedAt: now() };
        tx.set(ref, unresolved);
        d = unresolved;
      } else d = current as typeof d;
    });
  }
  if (!d || d.id !== id || d.deletedAt || d.expiresAt <= now()) return null;
  const source=(await col('uploadAssets').doc(envKey(d.assetId)).get()).data() as (UploadAsset & {deletedAt?:number})|undefined;
  if (source?.deletedAt) return null;
  return d;
}
export async function putGeneration(record: UploadGeneration): Promise<void> {
  const ref = col('uploadGenerations').doc(envKey(record.id));
  await firestoreDb.runTransaction(async tx => { const existing = await tx.get(ref); if (existing.exists) throw new UploadError('generation_exists', 'Generation already exists.', 409); tx.set(ref, record); });
}

export async function reserveGeneration(uid: string, operationId: string, requestHash: string, assetId: string, standardsVersion: number): Promise<{ generation: UploadGeneration; replay: boolean }> {
  await requireActiveGrant(uid, 'work');
  if (!/^[\w-]{8,128}$/.test(operationId)) throw new UploadError('invalid_idempotency_key', 'A valid idempotency key is required.', 400);
  const id = createHash('sha256').update(`${uid}:${operationId}`).digest('hex');
  const ref = col('uploadGenerations').doc(envKey(id));
  const quotaRef = col('uploadQuota').doc(envKey(`${uid}_${new Date(now()).toISOString().slice(0,10)}`));
  const grantRef = col('uploadAccess').doc(envKey(uid));
  if (!validUid(uid) || !validRecordId(assetId)) throw new UploadError('invalid_asset', 'Image could not be found.', 404);
  const assetRef = col('uploadAssets').doc(envKey(assetId));
  const pendingRef = col('uploadPending').doc(envKey(uid));
  const activeRef = col('uploadStandards').doc(envKey('active'));
  return firestoreDb.runTransaction(async tx => {
    const existing = await tx.get(ref);
    const grantSnap = await tx.get(grantRef);
    const quotaSnap = await tx.get(quotaRef);
    const pendingSnap = await tx.get(pendingRef);
    const standardsSnap = await tx.get(activeRef);
    const assetSnap = await tx.get(assetRef);
    if (existing.exists) {
      const generation = existing.data() as UploadGeneration;
      if (generation.requestHash !== requestHash) throw new UploadError('idempotency_conflict', 'This idempotency key was already used for a different request.', 409);
      return { generation, replay: true };
    }
    const grant = grantSnap.data() as UploadGrant | undefined;
    if (!grant || grant.revoked || grant.expiresAt <= now()) throw new UploadError('access_denied', 'Upload studio access is unavailable.', 403);
    const asset = assetSnap.data() as UploadAsset & { deletedAt?: number } | undefined;
    if (!asset || asset.uid !== uid || asset.expiresAt <= now() || asset.deletedAt) throw new UploadError('not_found', 'Image could not be found.', 404);
    const activeVersion = Number(standardsSnap.data()?.version || 1);
    const standardsDoc = await tx.get(col('uploadStandards').doc(envKey(String(activeVersion))));
    if ((standardsDoc.data() as UploadStandards | undefined)?.paused) throw new UploadError('paused', 'New upload studio work is paused.', 423);
    if (standardsVersion !== activeVersion) throw new UploadError('standards_changed', 'Upload standards changed. Reload before generating.', 409);
    const used = Number(quotaSnap.data()?.used || 0);
    if (used >= grant.dailyLimit) throw new UploadError('quota_exceeded', 'Daily generation allowance reached.', 429);
    const pending = pendingSnap.data() as { id?: string; expiresAt?: number } | undefined;
    if (pending) {
      const current = (await tx.get(col('uploadGenerations').doc(envKey(pending.id!)))).data() as UploadGeneration | undefined;
      if (current && ['pending','unresolved'].includes(current.status)) throw new UploadError('generation_pending', 'Resolve the current generation before starting another.', 409);
    }
    const at = now();
    const generation: UploadGeneration = { id, uid, assetId, status: 'pending', standardsVersion, createdAt: at, expiresAt: at + 7 * DAY, requestHash };
    tx.set(ref, generation);
    tx.set(quotaRef, { uid, day: new Date(at).toISOString().slice(0,10), used: used + 1, updatedAt: at });
    tx.set(pendingRef, { id, createdAt: at });
    return { generation, replay: false };
  });
}

export async function finishGeneration(generation: UploadGeneration): Promise<void> {
  const ref=col('uploadGenerations').doc(envKey(generation.id));
  const sourceRef=col('uploadAssets').doc(envKey(generation.assetId));
  let discardKey:string|undefined;
  await firestoreDb.runTransaction(async tx=>{
    const sourceSnap=await tx.get(sourceRef);
    const currentSnap=await tx.get(ref);
    const source=sourceSnap.data() as (UploadAsset & {deletedAt?:number;tombstoneExpiresAt?:number})|undefined;
    const current=currentSnap.data() as (UploadGeneration & {deletedAt?:number;tombstoneExpiresAt?:number})|undefined;
    const tombstoneAt=current?.deletedAt||source?.deletedAt;
    if (!sourceSnap.exists || !source || tombstoneAt || current?.deletedAt) {
      discardKey=generation.key||current?.key;
      // Keep source deletion's tombstone through the normal retention window,
      // even if a provider worker finishes after the deletion request.
      tx.set(ref,{
        ...(current||generation), ...generation,
        status:'failed', error:'source_deleted', key:'',
        ...(tombstoneAt?{deletedAt:tombstoneAt,tombstoneExpiresAt:current?.tombstoneExpiresAt||source?.tombstoneExpiresAt||tombstoneAt+30*DAY}:{}),
        objectDeletedAt:now(),
      });
    } else tx.set(ref,{...current,...generation});
  });
  if (discardKey) await deletePrivateAsset(discardKey);
  const saved=(await ref.get()).data() as UploadGeneration|undefined;
  if (!saved) return;
  generation=saved;
  if (generation.status === 'ready' || generation.status === 'failed') {
    const ref = col('uploadPending').doc(envKey(generation.uid));
    const snap = await ref.get();
    if (snap.data()?.id === generation.id) await ref.delete();
  }
}

export async function uploadErrorResponse(error: unknown): Promise<NextResponse> {
  const e = error instanceof UploadError ? error : new UploadError('internal_error', 'Upload request could not be completed.', 500);
  if (e.status >= 500) console.error('[upload]', e.code, e.message);
  return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { 'Cache-Control': 'private, no-store' } });
}

export const uploadCollections = { col, envKey };
