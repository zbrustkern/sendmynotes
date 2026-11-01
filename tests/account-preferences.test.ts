import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-account-preferences-'));
process.env.SMN_TEST_DATA_DIR = dataDir;
process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE = 'false';

async function run() {
  const { getAccountPreferences, saveAccountPreferences } = await import('../lib/account/preferences');
  const { accountDoc, accountScope } = await import('../lib/account/http');
  const actor = { uid: 'synthetic-owner', email: 'sender@example.test', emailVerified: true };
  const first = await getAccountPreferences(actor);
  assert.equal(first.timeZone, 'America/Chicago');
  assert.equal(first.timeZoneConfirmed, false);
  assert.equal(first.remindersPaused, false);
  assert.equal(first.reminderEmail, actor.email);
  assert.equal(first.emailVerified, true);
  assert.equal(first.reminderDeliveryAvailable, false);

  const saved = await saveAccountPreferences(actor, {
    expectedVersion: first.version,
    displayName: 'Synthetic Sender',
    timeZone: 'America/New_York',
    remindersPaused: true,
    reminderEmail: 'attacker@example.test',
    defaultReturnAddress: { firstName: 'Sam', lastName: 'Sender', street1: '1 Test Way', city: 'Test City', state: 'IL', zip: '00000', country: 'US' },
  });
  assert.equal(saved.version, first.version + 1);
  assert.equal(saved.timeZone, 'America/New_York');
  assert.equal(saved.timeZoneConfirmed, false, 'choosing a zone without explicit 9 a.m. confirmation remains unconfirmed');
  assert.equal(saved.remindersPaused, true);
  assert.equal(saved.reminderEmail, actor.email);

  const stored = (await accountDoc('preferences', actor.uid, 'current').get()).data() as Record<string, unknown>;
  assert.equal(stored.ownerScope, accountScope(actor.uid));
  assert.equal(stored.ownerUid, actor.uid);
  assert.equal('reminderEmail' in stored, false);
  assert.equal('email' in stored, false);

  await assert.rejects(() => saveAccountPreferences(actor, { expectedVersion: first.version, timeZone: 'America/Los_Angeles' }), { code: 'conflict' });
  const confirmed = await saveAccountPreferences(actor, { expectedVersion: saved.version, timeZone: saved.timeZone, confirmTimeZone: true });
  assert.equal(confirmed.timeZoneConfirmed, true, 'only explicit confirmation confirms the 9 a.m. local reminder time');
  const unrelatedSave = await saveAccountPreferences(actor, { expectedVersion: confirmed.version, displayName: 'Updated profile' });
  assert.equal(unrelatedSave.timeZoneConfirmed, true, 'unrelated saves preserve an already confirmed unchanged zone');
  const changedUnconfirmed = await saveAccountPreferences(actor, { expectedVersion: unrelatedSave.version, timeZone: 'America/Los_Angeles', confirmTimeZone: false });
  assert.equal(changedUnconfirmed.timeZoneConfirmed, false, 'changing zones without confirming clears confirmation');
  await assert.rejects(() => saveAccountPreferences(actor, { expectedVersion: changedUnconfirmed.version, timeZone: 'Not/AZone' }), { code: 'invalid_time_zone' });

  const secondActor = { uid: 'different-owner', email: 'other@example.test', emailVerified: true };
  const isolated = await getAccountPreferences(secondActor);
  assert.equal(isolated.displayName, '');
  assert.equal(isolated.defaultReturnAddress, null);
  assert.equal(isolated.remindersPaused, false);
  console.log('account preferences synthetic-storage checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
