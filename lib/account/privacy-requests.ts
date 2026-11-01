import { createHash, randomUUID } from 'node:crypto';
import { firestoreDb } from '@/lib/firebase-admin';
import type { AccountActor } from './contracts';
import { AccountError, accountCollection, accountScope, expectedVersion } from './http';

export type PrivacyRequestKind = 'export' | 'deletion';
export type PrivacyRequestStatus = 'received' | 'manual_review' | 'in_progress' | 'completed' | 'needs_info';
export type PrivacyRequestRow = { id: string; kind: PrivacyRequestKind; status: PrivacyRequestStatus; createdAt: number; updatedAt: number; ownerUid: string; ownerScope: string; version: number; assignedTo: string | null; completedAt?: number };
export type PrivacyRequestView = { id: string; kind: PrivacyRequestKind; status: PrivacyRequestStatus; createdAt: number; updatedAt: number; version: number; assigned: boolean };
const VALID_STATUS = new Set<PrivacyRequestStatus>(['received', 'manual_review', 'in_progress', 'completed', 'needs_info']);
const TRANSITIONS: Record<PrivacyRequestStatus, readonly PrivacyRequestStatus[]> = {
  received: ['manual_review', 'in_progress', 'needs_info'],
  manual_review: ['in_progress', 'needs_info'],
  in_progress: ['needs_info', 'completed', 'manual_review'],
  needs_info: ['in_progress', 'manual_review'],
  completed: [],
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const project = (row: Partial<PrivacyRequestRow> & Pick<PrivacyRequestRow, 'id'|'kind'>): PrivacyRequestView => ({ id: row.id, kind: row.kind, status: VALID_STATUS.has(row.status as PrivacyRequestStatus) ? row.status as PrivacyRequestStatus : 'manual_review', createdAt: Number(row.createdAt || 0), updatedAt: Number(row.updatedAt || row.createdAt || 0), version: Number.isSafeInteger(row.version) && Number(row.version) > 0 ? Number(row.version) : 1, assigned: Boolean(row.assignedTo) });
const requestRef = (scope: string, id: string) => accountCollection('privacy_requests').doc(`${scope}_${id}`);

function kindValue(value: unknown): PrivacyRequestKind {
  if (value !== 'export' && value !== 'deletion') throw new AccountError('invalid', 'Choose a data export or account deletion request.');
  return value;
}

export async function submitPrivacyRequest(actor: AccountActor, input: { kind: unknown; confirm?: unknown; idempotencyKey?: string }): Promise<{ request: PrivacyRequestView; created: boolean }> {
  if (!actor.emailVerified) throw new AccountError('verification_required', 'Verify your email before submitting a privacy request.', 403);
  const kind = kindValue(input.kind);
  if (kind === 'deletion' && input.confirm !== true) throw new AccountError('confirmation_required', 'Confirm that you want to request account deletion.');
  const key = input.idempotencyKey?.trim() || randomUUID();
  if (key.length < 8 || key.length > 160) throw new AccountError('invalid_idempotency_key', 'Please retry this request.');
  const scope = accountScope(actor.uid);
  const id = randomUUID();
  const idempotencyRef = accountCollection('privacy_request_idempotency').doc(`${scope}_${digest(key)}`);
  const targetRef = requestRef(scope, id);
  const now = Date.now();
  let result: { request: PrivacyRequestView; created: boolean } | undefined;
  await firestoreDb.runTransaction(async tx => {
    const existing = await tx.get(idempotencyRef);
    const prior = existing.data() as { requestId?: string; kind?: string; ownerUid?: string } | undefined;
    if (prior?.requestId) {
      if (prior.ownerUid !== actor.uid || prior.kind !== kind) throw new AccountError('idempotency_conflict', 'This request key was already used for a different request.', 409);
      const snapshot = await tx.get(requestRef(scope, prior.requestId));
      const row = snapshot.data() as PrivacyRequestRow | undefined;
      if (!row || row.ownerUid !== actor.uid) throw new AccountError('not_found', 'Your request could not be found.', 404);
      result = { request: project(row), created: false };
      return;
    }
    const row: PrivacyRequestRow = { id, kind, status: 'received', createdAt: now, updatedAt: now, ownerUid: actor.uid, ownerScope: scope, version: 1, assignedTo: null };
    tx.set(targetRef, row);
    tx.set(idempotencyRef, { ownerUid: actor.uid, ownerScope: scope, requestId: id, kind, createdAt: now });
    result = { request: project(row), created: true };
  });
  if (!result) throw new AccountError('unavailable', 'Your request could not be recorded.', 503);
  return result;
}

export async function listPrivacyRequestsForOwner(actor: AccountActor): Promise<PrivacyRequestView[]> {
  const scope = accountScope(actor.uid);
  const result = await accountCollection('privacy_requests').where('ownerScope', '==', scope).orderBy('createdAt', 'desc').limit(50).get();
  return result.docs.map(doc => doc.data() as PrivacyRequestRow).filter(row => row.ownerScope === scope && row.ownerUid === actor.uid).map(project);
}

/** Owner-only inventory preview with counts and retention notes; never returns row contents or deletes data. */
export async function previewPrivacyRequest(actor: AccountActor, id: string): Promise<{ request: PrivacyRequestView; dryRun: true; inventory: Record<string, { count: number; sampled: boolean }>; retention: string[] }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AccountError('invalid_id', 'Invalid privacy request.');
  const scope = accountScope(actor.uid);
  const request = (await requestRef(scope, id).get()).data() as PrivacyRequestRow | undefined;
  if (!request || request.id !== id || request.ownerUid !== actor.uid || request.ownerScope !== scope) throw new AccountError('not_found', 'Privacy request not found.', 404);
  const ownerScoped = ['people','occasions','drafts','images','preferences','reminder_occurrences','reminder_unsubscribe_tokens','draft_quotas','library_quotas','privacy_requests','privacy_request_idempotency','privacy_request_events'];
  const limit = 201;
  const inventory: Record<string, { count: number; sampled: boolean }> = {};
  await Promise.all(ownerScoped.map(async name => {
    const snap = await accountCollection(name).where('ownerScope', '==', scope).limit(limit).get();
    inventory[name] = { count: Math.min(snap.size, 200), sampled: snap.size === limit };
  }));
  for (const name of ['uploadAssets','uploadGenerations','uploadDesigns','uploadOrderPins','uploadStudioSessions']) {
    const snap = await firestoreDb.collection(name).where('uid', '==', actor.uid).limit(limit).get();
    inventory[name] = { count: Math.min(snap.size, 200), sampled: snap.size === limit };
  }
  return {
    request: project(request),
    dryRun: true,
    inventory,
    retention: ['Accepted order, payment, supplier, and accounting records may require retention and are reviewed separately.', 'A preview is not an export, deletion, or completion confirmation.', 'No private object bytes, addresses, message text, or recipient names are included.'],
  };
}

export type AdminPrivacyRequestView = PrivacyRequestView & { assignedTo: string | null; requesterRef: string };
export async function listPrivacyRequestsForAdmin(limit = 100, cursor?: string): Promise<{ data: AdminPrivacyRequestView[]; nextCursor: string | null }> {
  const statuses: PrivacyRequestStatus[] = ['received','manual_review','in_progress','needs_info'];
  let query = accountCollection('privacy_requests').where('status', 'in', statuses).orderBy('createdAt', 'asc');
  if (cursor) {
    let cursorId: string;
    try { cursorId = Buffer.from(cursor, 'base64url').toString('utf8'); } catch { throw new AccountError('invalid_cursor', 'Reload the privacy queue.', 400); }
    if (!/^[a-f0-9]{64}_[A-Za-z0-9_-]{1,128}$/.test(cursorId)) throw new AccountError('invalid_cursor', 'Reload the privacy queue.', 400);
    const snapshot = await accountCollection('privacy_requests').doc(cursorId).get();
    if (snapshot.exists) query = query.startAfter(snapshot);
  }
  const bounded = Math.max(1, Math.min(limit, 100));
  const result = await query.limit(bounded + 1).get();
  const rows = result.docs.slice(0, bounded).map(doc => doc.data() as PrivacyRequestRow).filter(row => row.id && row.ownerScope && row.ownerUid);
  const next = result.docs.length > bounded ? result.docs[bounded - 1] : null;
  return { data: rows.map(row => ({ ...project(row), assignedTo: row.assignedTo || null, requesterRef: row.ownerUid })), nextCursor: next ? Buffer.from(next.id).toString('base64url') : null };
}

export async function updatePrivacyRequest(input: { id: string; expectedVersion: unknown; status?: unknown; assignedTo?: unknown; operator: string; confirmCompletion?: unknown; evidenceRef?: unknown }): Promise<PrivacyRequestView> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.id)) throw new AccountError('invalid_id', 'Invalid privacy request.');
  const version = expectedVersion(input.expectedVersion);
  const wantedStatus = input.status === undefined ? undefined : input.status as PrivacyRequestStatus;
  if (wantedStatus && !VALID_STATUS.has(wantedStatus)) throw new AccountError('invalid_status', 'Choose a valid request status.');
  if (wantedStatus === 'completed' && input.confirmCompletion !== true) throw new AccountError('completion_confirmation_required', 'Confirm that the approved privacy action is complete.');
  if (wantedStatus === 'completed' && (typeof input.evidenceRef !== 'string' || !/^[A-Za-z0-9:_-]{8,100}$/.test(input.evidenceRef))) throw new AccountError('evidence_reference_required', 'Add a non-personal internal evidence reference before completing this request.');
  if (input.assignedTo !== undefined && input.assignedTo !== null && (typeof input.assignedTo !== 'string' || input.assignedTo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.assignedTo))) throw new AccountError('invalid_assignment', 'Choose a valid operator assignment.');
  const docs = await accountCollection('privacy_requests').where('id', '==', input.id).limit(2).get();
  const found = docs.docs[0];
  const initial = found?.data() as PrivacyRequestRow | undefined;
  if (!found || !initial?.ownerScope || !initial.ownerUid) throw new AccountError('not_found', 'Privacy request not found.', 404);
  const ref = requestRef(initial.ownerScope, input.id);
  let projected: PrivacyRequestView | undefined;
  await firestoreDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as PrivacyRequestRow | undefined;
    if (!current || current.id !== input.id || current.ownerScope !== initial.ownerScope) throw new AccountError('not_found', 'Privacy request not found.', 404);
    const currentVersion = Number.isSafeInteger(current.version) && Number(current.version) > 0 ? Number(current.version) : 1;
    if (currentVersion !== version) throw new AccountError('conflict', 'This request changed elsewhere. Reload before updating it.', 409);
    const currentStatus = VALID_STATUS.has(current.status as PrivacyRequestStatus) ? current.status as PrivacyRequestStatus : 'manual_review';
    const nextStatus = wantedStatus ?? currentStatus;
    if (wantedStatus && nextStatus !== currentStatus && !TRANSITIONS[currentStatus].includes(nextStatus)) throw new AccountError('invalid_transition', 'That request status change is not allowed.', 409);
    if (currentStatus === 'completed' && input.assignedTo !== undefined && input.assignedTo !== current.assignedTo) throw new AccountError('completed_request', 'Completed requests are locked.', 409);
    const now = Date.now();
    const next: PrivacyRequestRow = { ...current, status: nextStatus, assignedTo: input.assignedTo === undefined ? current.assignedTo || null : input.assignedTo as string | null, version: currentVersion + 1, createdAt: Number(current.createdAt || 0), updatedAt: now, ...(nextStatus === 'completed' ? { completedAt: now } : {}) };
    const auditRef = accountCollection('privacy_request_events').doc(`${current.ownerScope}_${current.id}_v${next.version}`);
    tx.set(ref, next);
    tx.set(auditRef, { requestId: current.id, ownerScope: current.ownerScope, actor: input.operator, fromStatus: currentStatus, toStatus: next.status, assigned: Boolean(next.assignedTo), version: next.version, ...(nextStatus === 'completed' ? { evidenceRef: input.evidenceRef } : {}), createdAt: now });
    projected = project(next);
  });
  if (!projected) throw new AccountError('unavailable', 'The request could not be updated.', 503);
  return projected;
}
