import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-legacy-reminders-'));
process.env.SMN_TEST_DATA_DIR = dataDir;

const req = (method: 'GET'|'POST'|'DELETE', options: { authenticated?: boolean; sameOrigin?: boolean; body?: unknown } = {}) => new NextRequest('http://localhost/api/reminders', {
  method,
  headers: {
    host: 'localhost',
    ...(options.sameOrigin === false ? {} : { origin: 'http://localhost' }),
    ...(options.authenticated ? { authorization: 'Bearer mock_token_reminder-owner' } : {}),
    ...(options.body ? { 'content-type': 'application/json' } : {}),
  },
  ...(options.body ? { body: JSON.stringify(options.body) } : {}),
});

async function run() {
  const route = await import('../app/api/reminders/route');
  const { firestoreDb } = await import('../lib/firebase-admin');
  const { REMINDERS_COLLECTION } = await import('../lib/reminders');
  const before = await firestoreDb.collection(REMINDERS_COLLECTION).get();
  assert.equal(before.size, 0);

  const anonymousPost = await route.POST(req('POST', { sameOrigin: true, body: { userEmail: 'attacker@example.test', month: 2, day: 3, optIn: true } }));
  assert.equal(anonymousPost.status, 401, 'anonymous writes to the retired endpoint are rejected');
  const denied = await anonymousPost.json() as { code: string };
  assert.equal(denied.code, 'unauthorized');
  assert.match(anonymousPost.headers.get('cache-control') || '', /no-store/);
  assert.equal((await firestoreDb.collection(REMINDERS_COLLECTION).get()).size, 0, 'anonymous POST creates no legacy reminder');

  const crossOriginPost = await route.POST(req('POST', { authenticated: true, sameOrigin: false, body: { month: 2, day: 3 } }));
  assert.equal(crossOriginPost.status, 403, 'authenticated writes still require same origin');
  const authenticatedPost = await route.POST(req('POST', { authenticated: true, body: { userEmail: 'owner@example.test', month: 2, day: 3, optIn: true } }));
  assert.equal(authenticatedPost.status, 410, 'authorized writes are directed to the account Dates flow');
  const retired = await authenticatedPost.json() as { data: { href: string } };
  assert.equal(retired.data.href, '/account/dates');
  assert.equal((await firestoreDb.collection(REMINDERS_COLLECTION).get()).size, 0, 'retired writes never persist legacy records');

  assert.equal((await route.GET(req('GET'))).status, 401);
  assert.equal((await route.DELETE(req('DELETE'))).status, 401);
  assert.equal((await route.GET(req('GET', { authenticated: true }))).status, 410);
  assert.equal((await route.DELETE(req('DELETE', { authenticated: true }))).status, 410);
  console.log('legacy reminder retirement synthetic-storage checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
