import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  for (const key of Object.keys(process.env)) {
    if (/FIREBASE|GOOGLE|GCLOUD|K_SERVICE|PROMOTION/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    NODE_ENV: 'test', USE_MOCK_FIRESTORE: 'true',
    SMN_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'smn-promotion-net-')),
    PROMOTION_NETWORK_SOURCE: 'firebase-app-hosting',
    PROMOTION_NETWORK_HASH_SECRET: 'synthetic-network-key-for-test-only',
  });
  const { NextRequest } = await import('next/server');
  const { takePromotionAttempt } = await import('../lib/checkout-promotion-limiter');
  const { promotionCodeId, promotionSecret } = await import('../lib/promotions-v2-store');
  const { firestoreDb, isFirestoreMock } = await import('../lib/firebase-admin');
  assert.equal(isFirestoreMock, true);
  const now = 5000;
  const attempt = (ip?: string, cookie?: string) => {
    const headers = new Headers({ 'x-forwarded-for': '192.0.2.9' });
    if (ip) headers.set('x-fah-client-ip', ip);
    if (cookie) headers.set('cookie', `smn_offer_session=${cookie}`);
    return takePromotionAttempt(new NextRequest('https://example.test', { headers }), now);
  };
  await assert.rejects(attempt(), /network validation/);
  await assert.rejects(attempt('192.0.2.7, 192.0.2.9'), /network validation/);
  for (let index = 0; index < 60; index++) {
    assert.equal((await attempt(index % 2 ? '2001:0db8::1' : '2001:db8:0:0:0:0:0:1')).allowed, true);
  }
  assert.equal((await attempt('2001:db8::1')).allowed, false);
  const { session, allowed } = await attempt('192.0.2.44');
  assert.equal(allowed, true);
  for (let index = 1; index < 20; index++) assert.equal((await attempt('192.0.2.44', session)).allowed, true);
  assert.equal((await attempt('192.0.2.44', session)).allowed, false);
  const rows = await firestoreDb.collection('promotion_attempt_limits').get();
  const networks = rows.docs.filter(doc => doc.id.startsWith('network_'));
  assert.equal(networks.length, 2);
  assert.ok(networks.every(doc => /^network_[a-f0-9]{64}$/.test(doc.id)));
  Object.assign(process.env, { NODE_ENV: 'production', ADMIN_SECRET_KEY: 'synthetic-admin-secret-key-just-for-test' });
  assert.equal(promotionSecret('lookup'), null);
  process.env.PROMOTION_PRIVATE_KEY = 'synthetic-pinned-promotion-secret-for-test';
  const id = promotionCodeId('TEST', 'private');
  assert.ok(id);
  process.env.ADMIN_SECRET_KEY = 'second-synthetic-admin-secret-just-for-test';
  assert.equal(promotionCodeId('TEST', 'private'), id);
  console.log('Verified independent promotion network and session limits, rejection of missing edge identity, and private-key isolation.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
