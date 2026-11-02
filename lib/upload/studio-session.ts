import { createHash } from 'node:crypto';
import { firestoreDb } from '../firebase-admin';
import { deletePrivateAsset, getDesign, getGeneration, getPrivateAsset, requireActiveGrant, uploadCollections } from './access';
import { UploadError, type UploadDesign, type UploadGeneration, type UploadTreatment } from './contracts';

const MAX_VERSIONS = 3;
const sessionId = (uid: string, assetId: string) => `studio_${createHash('sha256').update(`${uid}:${assetId}`).digest('hex').slice(0, 40)}`;
type StudioVersion = {
  designId: string; generationId: string; assetId: string; revision: number; masterSha256: string;
  prompt: string; exactText: string; treatmentId: UploadTreatment; createdAt: number; expiresAt: number; accepted: boolean;
};
type StoredStudioSession = { id: string; uid: string; assetId: string; versions: StudioVersion[]; selectedDesignId?: string; updatedAt: number; expiresAt: number };
const sessionRef = (id: string) => uploadCollections.col('uploadStudioSessions').doc(uploadCollections.envKey(id));

function versionFrom(design: UploadDesign, generation: UploadGeneration): StudioVersion {
  return {
    designId: design.id, generationId: generation.id, assetId: generation.assetId, revision: design.revision,
    masterSha256: design.masterSha256, prompt: generation.imagePrompt || '', exactText: design.exactText,
    treatmentId: design.treatmentId, createdAt: design.createdAt, expiresAt: Math.min(design.expiresAt, generation.expiresAt),
    accepted: Boolean(design.acceptedAt),
  };
}

/** Records successful compositions only; the three-slot tray never owns the
 * private objects themselves. Existing accepted/ordered masters are untouched. */
export async function recordStudioVersion(uid: string, designId: string): Promise<{ sessionId: string; versions: StudioVersion[]; selectedDesignId: string }> {
  await requireActiveGrant(uid, 'work');
  const design = await getDesign(designId);
  if (!design || design.uid !== uid) throw new UploadError('not_found', 'This private version is no longer available.', 404);
  const generation = await getGeneration(design.generationId);
  if (!generation || generation.uid !== uid || generation.status !== 'ready') throw new UploadError('source_deleted', 'This version’s source is no longer available for editing.', 409);
  const asset = await getPrivateAsset(uid, generation.assetId);
  if (!asset) throw new UploadError('source_deleted', 'This version’s source is no longer available for editing.', 409);
  const id = sessionId(uid, asset.id); const ref = sessionRef(id); const version = versionFrom(design, generation);
  const saved = await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const old = snap.data() as StoredStudioSession | undefined;
    if (old && (old.uid !== uid || old.assetId !== asset.id)) throw new UploadError('not_found', 'Studio session not found.', 404);
    const versions = (old?.versions || []).filter(item => item.expiresAt > Date.now() && item.designId !== design.id);
    versions.push(version); versions.sort((a, b) => a.createdAt - b.createdAt);
    const evicted = versions.slice(0, Math.max(0, versions.length - MAX_VERSIONS));
    const bounded = versions.slice(-MAX_VERSIONS);
    const evictedRows: Array<UploadDesign & { deletedAt?: number; tombstoneExpiresAt?: number }> = [];
    for (const item of evicted) {
      const evictedRef = uploadCollections.col('uploadDesigns').doc(uploadCollections.envKey(item.designId));
      const evictedSnap = await tx.get(evictedRef); const oldDesign = evictedSnap.data() as (UploadDesign & { deletedAt?: number; tombstoneExpiresAt?: number }) | undefined;
      if (!oldDesign || oldDesign.uid !== uid || oldDesign.generationId !== item.generationId || oldDesign.acceptedAt || oldDesign.ordered || oldDesign.deletedAt) continue;
      const removed = { ...oldDesign, deletedAt: Date.now(), tombstoneExpiresAt: Date.now() + 30 * 86_400_000 };
      evictedRows.push(removed);
    }
    for (const removed of evictedRows) tx.set(uploadCollections.col('uploadDesigns').doc(uploadCollections.envKey(removed.id)), removed);
    const next: StoredStudioSession = { id, uid, assetId: asset.id, versions: bounded, selectedDesignId: design.id, updatedAt: Date.now(), expiresAt: Math.min(asset.expiresAt, ...bounded.map(item => item.expiresAt)) };
    tx.set(ref, next); return { next, evictedRows };
  });
  for (const evicted of saved.evictedRows) {
    if (!evicted.masterKey) continue;
    try {
      await deletePrivateAsset(evicted.masterKey);
      await uploadCollections.col('uploadDesigns').doc(uploadCollections.envKey(evicted.id)).set({ ...evicted, masterKey: '', objectDeletedAt: Date.now() });
    } catch { /* The normal upload cleanup retries this tombstone. */ }
  }
  return { sessionId: id, versions: saved.next.versions, selectedDesignId: design.id };
}

export async function listStudioVersions(uid: string, assetId: string): Promise<{ sessionId: string; versions: StudioVersion[]; selectedDesignId?: string }> {
  await requireActiveGrant(uid, 'read');
  const asset = await getPrivateAsset(uid, assetId);
  if (!asset) throw new UploadError('source_deleted', 'This private image has expired or was removed.', 409);
  const id = sessionId(uid, asset.id); const ref = sessionRef(id); const snap = await ref.get();
  const session = snap.data() as StoredStudioSession | undefined;
  if (!session || session.uid !== uid || session.assetId !== asset.id || session.expiresAt <= Date.now()) return { sessionId: id, versions: [] };
  const versions: StudioVersion[] = [];
  for (const item of session.versions.slice(-MAX_VERSIONS)) {
    if (item.expiresAt <= Date.now()) continue;
    const design = await getDesign(item.designId); const generation = design && await getGeneration(item.generationId);
    if (!design || design.uid !== uid || design.masterSha256 !== item.masterSha256 || !generation || generation.uid !== uid || generation.assetId !== asset.id || generation.status !== 'ready') continue;
    versions.push(versionFrom(design, generation));
  }
  return { sessionId: id, versions, selectedDesignId: versions.some(item => item.designId === session.selectedDesignId) ? session.selectedDesignId : versions.at(-1)?.designId };
}

export async function selectStudioVersion(uid: string, assetId: string, designId: string): Promise<{ sessionId: string; versions: StudioVersion[]; selectedDesignId: string }> {
  await requireActiveGrant(uid, 'read');
  const listed = await listStudioVersions(uid, assetId);
  if (!listed.versions.some(item => item.designId === designId)) throw new UploadError('not_found', 'This private version is no longer available.', 404);
  const ref = sessionRef(listed.sessionId);
  const saved = await firestoreDb.runTransaction(async tx => {
    const snap = await tx.get(ref); const current = snap.data() as StoredStudioSession | undefined;
    if (!current || current.uid !== uid || current.assetId !== assetId || current.expiresAt <= Date.now() || !current.versions.some(item => item.designId === designId && item.expiresAt > Date.now())) throw new UploadError('not_found', 'This private version is no longer available.', 404);
    const next = { ...current, selectedDesignId: designId, updatedAt: Date.now() }; tx.set(ref, next); return next;
  });
  return { sessionId: saved.id, versions: listed.versions, selectedDesignId: designId };
}

export async function getStudioEditContext(uid: string, designId: string): Promise<StudioVersion & { sessionId: string }> {
  await requireActiveGrant(uid, 'work');
  const design = await getDesign(designId);
  if (!design || design.uid !== uid || !design.acceptedAt) throw new UploadError('not_found', 'This accepted front is no longer available to edit.', 404);
  const generation = await getGeneration(design.generationId);
  if (!generation || generation.uid !== uid || generation.status !== 'ready') throw new UploadError('source_deleted', 'The source for this front has expired. Save a source image before continuing to edit.', 409);
  const asset = await getPrivateAsset(uid, generation.assetId);
  if (!asset) throw new UploadError('source_deleted', 'The source for this front has expired. Save a source image before continuing to edit.', 409);
  const session = await listStudioVersions(uid, asset.id);
  if (!session.versions.some(item => item.designId === design.id)) await recordStudioVersion(uid, design.id);
  return { ...versionFrom(design, generation), sessionId: session.sessionId };
}
