import { createHash, randomUUID } from 'node:crypto';
import { firestoreDb } from '@/lib/firebase-admin';

export type OperationalJob = 'upload-cleanup' | 'account-library-cleanup' | 'reminder-dispatch';
export type RunState = 'running' | 'succeeded' | 'failed' | 'disabled';
export type SafeRunSummary = Record<string, number | boolean | string | null>;

const COLLECTION = 'operational_job_runs';
const SLOT_MS: Record<OperationalJob, number> = {
  'upload-cleanup': 24 * 60 * 60_000,
  'account-library-cleanup': 24 * 60 * 60_000,
  'reminder-dispatch': 5 * 60_000,
};
const MAX_RUNS = 200;
const environment = () => process.env.LOB_ENV || process.env.NODE_ENV || 'development';

function safeSummary(value: unknown): SafeRunSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: SafeRunSummary = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    if (typeof item === 'boolean' || item === null) output[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) output[key] = item;
  }
  return output;
}

function runId(job: OperationalJob, slot: number) {
  return createHash('sha256').update(`${environment()}:${job}:${slot}`).digest('hex');
}

export async function beginOperationalRun(job: OperationalJob, at = Date.now()): Promise<{ id: string; startedAt: number; acquired: boolean; attemptToken: string | null }> {
  const slot = Math.floor(at / SLOT_MS[job]);
  const id = runId(job, slot);
  const ref = firestoreDb.collection(COLLECTION).doc(id);
  const startedAt = at;
  let acquired = false;
  let attemptToken: string | null = null;
  await firestoreDb.runTransaction(async tx => {
    const existing = await tx.get(ref);
    const row = existing.data() as { state?: RunState; startedAt?: number; attempts?: number } | undefined;
    // A second scheduler invocation in the same slot can safely retry a failed
    // job, but it cannot overlap an active worker or replace a success.
    if (row?.state === 'succeeded' || row?.state === 'disabled' || row?.state === 'running' && Number(row.startedAt) > at - 30 * 60_000) return;
    attemptToken = randomUUID();
    tx.set(ref, { environment: environment(), job, slot, state: 'running', startedAt, updatedAt: at, attemptToken, attempts: Number(row?.attempts || 0) + 1, summary: {} });
    acquired = true;
  });
  return { id, startedAt, acquired, attemptToken };
}

export async function finishOperationalRun(id: string, attemptToken: string, state: Exclude<RunState, 'running'>, summary: unknown, at = Date.now()): Promise<void> {
  const ref = firestoreDb.collection(COLLECTION).doc(id);
  await firestoreDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as { state?: RunState; attemptToken?: string } | undefined;
    if (!current || current.state !== 'running' || current.attemptToken !== attemptToken) return;
    tx.set(ref, { ...current, state, completedAt: at, updatedAt: at, summary: safeSummary(summary) });
  });
  const completed = (await ref.get()).data() as { job?: OperationalJob; environment?: string } | undefined;
  if (!completed?.job || completed.environment !== environment()) return;
  const recent = await firestoreDb.collection(COLLECTION).where('environment', '==', environment()).where('job', '==', completed.job).orderBy('updatedAt', 'desc').limit(MAX_RUNS + 50).get();
  for (const old of recent.docs.slice(MAX_RUNS)) await old.ref.delete();
}

export type OperationalRunView = { job: OperationalJob; state: RunState; startedAt: number; updatedAt: number; completedAt?: number; attempts: number; summary: SafeRunSummary };

export async function getOperationalRunHealth(at = Date.now()): Promise<{ jobs: Record<OperationalJob, { state: 'healthy' | 'late' | 'failed' | 'disabled' | 'unknown'; lastRun: OperationalRunView | null; ageMs: number | null }>; reminderDelivery: 'disabled' | 'active' }> {
  const jobsToRead: OperationalJob[] = ['upload-cleanup', 'account-library-cleanup', 'reminder-dispatch'];
  const latest = await Promise.all(jobsToRead.map(async job => {
    const snapshot = await firestoreDb.collection(COLLECTION).where('environment', '==', environment()).where('job', '==', job).orderBy('updatedAt', 'desc').limit(1).get();
    return snapshot.docs[0]?.data() as OperationalRunView | undefined;
  }));
  const rows = latest.filter((row): row is OperationalRunView => Boolean(row));
  const jobs = {} as Record<OperationalJob, { state: 'healthy' | 'late' | 'failed' | 'disabled' | 'unknown'; lastRun: OperationalRunView | null; ageMs: number | null }>;
  for (const job of ['upload-cleanup', 'account-library-cleanup', 'reminder-dispatch'] as OperationalJob[]) {
    const last = rows.find(row => row.job === job) || null;
    const ageMs = last ? Math.max(0, at - Number(last.updatedAt || last.startedAt || 0)) : null;
    const tolerance = job === 'reminder-dispatch' ? 15 * 60_000 : 30 * 60 * 60_000;
    let state: typeof jobs[OperationalJob]['state'] = !last ? 'unknown' : last.state === 'failed' ? 'failed' : last.state === 'disabled' ? 'disabled' : last.state === 'running' && ageMs !== null && ageMs > tolerance ? 'late' : ageMs !== null && ageMs > tolerance ? 'late' : 'healthy';
    if (job === 'reminder-dispatch' && process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE !== 'true') state = 'disabled';
    jobs[job] = { state, lastRun: last ? { ...last, summary: safeSummary(last.summary) } : null, ageMs };
  }
  return { jobs, reminderDelivery: process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE === 'true' ? 'active' : 'disabled' };
}

