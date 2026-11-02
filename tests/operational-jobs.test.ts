import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-ops-'));
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true, enumerable: true });
process.env.SMN_TEST_DATA_DIR = dataDir;
process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE = 'false';
process.env.REMINDER_WORKER_SECRET = 'synthetic-worker-secret';
delete process.env.UPLOAD_CLEANUP_SECRET;

const auth = (secret?: string, url = 'http://localhost/api/cron/reminder-dispatch') => new NextRequest(url, { method: 'POST', headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });

async function run() {
  const upload = await import('../app/api/cron/upload-cleanup/route');
  const denied = await upload.POST(auth('wrong-secret', 'http://localhost/api/cron/upload-cleanup'));
  assert.equal(denied.status, 401);
  process.env.UPLOAD_CLEANUP_SECRET = 'synthetic-cleanup-secret';
  const wrong = await upload.POST(auth('wrong-secret', 'http://localhost/api/cron/upload-cleanup'));
  assert.equal(wrong.status, 401);
  const dryRun = await upload.POST(auth('synthetic-cleanup-secret', 'http://localhost/api/cron/upload-cleanup?dryRun=true'));
  assert.equal(dryRun.status, 200);
  const dryBody = await dryRun.json();
  assert.equal(dryBody.data.state, 'dry_run');
  assert.equal(dryBody.data.preview.sampled, true);
  assert.equal(dryBody.data.preview.scanned, 0);
  assert.equal(dryRun.headers.get('cache-control')?.includes('no-store'), true);
  const { firestoreDb } = await import('../lib/firebase-admin');
  for (let index = 0; index < 101; index++) await firestoreDb.collection('uploadAssets').doc(`test_cursor_asset_${String(index).padStart(3, '0')}`).set({ id: `cursor_${index}`, uid: 'synthetic', expiresAt: Date.now() + 86_400_000 });
  const { cleanupExpiredUploads } = await import('../lib/upload/access');
  const firstPass = await cleanupExpiredUploads(Date.now(), 100);
  const secondPass = await cleanupExpiredUploads(Date.now(), 100);
  assert.equal(firstPass.scanned, 100, 'each upload pass scans only one bounded page per collection');
  assert.equal(secondPass.scanned, 1, 'the saved cursor advances to the next page without starvation');
  const cleanupAt = Date.now();
  await firestoreDb.collection('uploadAssets').doc('test_expired_tombstone').set({ id: 'expired_tombstone', uid: 'synthetic', key: '', deletedAt: cleanupAt - 86_400_000, tombstoneExpiresAt: cleanupAt - 1, expiresAt: cleanupAt - 86_400_000 });
  await firestoreDb.collection('uploadDesigns').doc('test_accepted_design').set({ id: 'accepted_design', uid: 'synthetic', generationId: 'missing', revision: 1, masterSha256: 'hash', masterKey: 'upload-private/test/synthetic/design/master.png', exactText: 'private', treatmentId: 'classic-serif', standardsVersion: 1, acceptedAt: cleanupAt - 86_400_000, createdAt: cleanupAt - 86_400_000, expiresAt: cleanupAt - 1 });
  await cleanupExpiredUploads(cleanupAt, 100);
  await cleanupExpiredUploads(cleanupAt, 100);
  assert.equal((await firestoreDb.collection('uploadAssets').doc('test_expired_tombstone').get()).exists, false, 'expired tombstones advance through cleanup');
  assert.equal((await firestoreDb.collection('uploadDesigns').doc('test_accepted_design').get()).exists, true, 'accepted design masters remain durable after temporary expiry');

  const accountCleanup = await import('../app/api/cron/account-library-cleanup/route');
  const accountDry = await accountCleanup.POST(auth('synthetic-cleanup-secret', 'http://localhost/api/cron/account-library-cleanup?dryRun=true'));
  assert.equal(accountDry.status, 200);
  assert.equal((await accountDry.json()).data.state, 'dry_run');

  const reminders = await import('../app/api/cron/reminder-dispatch/route');
  const occurrences = firestoreDb.collection('account_reminder_occurrences');
  const checkAt = Date.now();
  await occurrences.doc('synthetic-pending').set({ state: 'pending', dueAt: checkAt - 2 * 60_000, ownerScope: 'synthetic' });
  await occurrences.doc('synthetic-uncertain').set({ state: 'uncertain', dueAt: checkAt - 5 * 60_000, ownerScope: 'synthetic' });
  await occurrences.doc('synthetic-failed').set({ state: 'failed', dueAt: checkAt - 10 * 60_000, ownerScope: 'synthetic' });
  const noAuth = await reminders.POST(auth(undefined));
  assert.equal(noAuth.status, 401);
  const disabled = await reminders.POST(auth('synthetic-worker-secret'));
  assert.equal(disabled.status, 200);
  const disabledBody = await disabled.json();
  assert.equal(disabledBody.data.state, 'disabled');
  assert.equal(disabledBody.data.summary.deliveryDisabled, true);
  assert.equal(disabledBody.data.summary.backlogCount, 1);
  assert.equal(disabledBody.data.summary.backlogAgeMs >= 60_000, true);
  assert.equal(disabledBody.data.summary.uncertainCount, 1);
  assert.equal(disabledBody.data.summary.failedCount, 1);
  const duplicate = await reminders.POST(auth('synthetic-worker-secret'));
  assert.equal(duplicate.status, 202);
  const { beginOperationalRun, finishOperationalRun, getOperationalRunHealth } = await import('../lib/operational-runs');
  const health = await getOperationalRunHealth();
  assert.equal(health.reminderDelivery, 'disabled');
  assert.equal(health.jobs['reminder-dispatch'].state, 'disabled');
  const staleAt = Math.floor((Date.now() - 3 * 86_400_000) / 86_400_000) * 86_400_000 + 60_000;
  const abandoned = await beginOperationalRun('upload-cleanup', staleAt);
  const reclaimed = await beginOperationalRun('upload-cleanup', staleAt + 31 * 60_000);
  assert.equal(abandoned.acquired, true);
  assert.equal(reclaimed.acquired, true);
  await finishOperationalRun(abandoned.id, abandoned.attemptToken!, 'succeeded', { assets: 999 }, staleAt + 32 * 60_000);
  const afterLateFinish = await firestoreDb.collection('operational_job_runs').doc(abandoned.id).get();
  assert.equal(afterLateFinish.data()?.state, 'running', 'a reclaimed job cannot be finalized by its stale worker');
  await finishOperationalRun(reclaimed.id, reclaimed.attemptToken!, 'succeeded', { assets: 1 }, staleAt + 33 * 60_000);
  const finalRun = (await firestoreDb.collection('operational_job_runs').doc(abandoned.id).get()).data();
  assert.deepEqual(finalRun?.summary, { assets: 1 });
  console.log('operational cron auth, bounded dry-run, replay guard and reminders-off checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
