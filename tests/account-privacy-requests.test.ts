import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-account-privacy-'));
process.env.SMN_TEST_DATA_DIR = dataDir;

function request(uid: string, method: 'GET'|'POST', body?: unknown) {
  return new NextRequest('http://localhost/api/account/privacy-requests', {
    method,
    headers: { authorization: `Bearer mock_token_${uid}`, origin: 'http://localhost', host: 'localhost', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function run() {
  const route = await import('../app/api/account/privacy-requests/route');
  const missingConfirmation = await route.POST(request('privacy-owner', 'POST', { kind: 'deletion' }));
  assert.equal(missingConfirmation.status, 400);
  const exportResponse = await route.POST(request('privacy-owner', 'POST', { kind: 'export' }));
  assert.equal(exportResponse.status, 201);
  assert.match(exportResponse.headers.get('cache-control') || '', /no-store/);
  const exportBody = await exportResponse.json() as { data: Record<string, unknown> };
  assert.equal(exportBody.data.kind, 'export');
  assert.equal(exportBody.data.status, 'manual_review');
  assert.equal('ownerUid' in exportBody.data, false);
  assert.equal('ownerScope' in exportBody.data, false);

  const deletionResponse = await route.POST(request('privacy-owner', 'POST', { kind: 'deletion', confirm: true }));
  assert.equal(deletionResponse.status, 201);
  const ownList = await route.GET(request('privacy-owner', 'GET'));
  const ownBody = await ownList.json() as { data: Array<Record<string, unknown>> };
  assert.equal(ownBody.data.length, 2);
  assert.equal(ownBody.data.every(row => row.status === 'manual_review'), true);
  const otherList = await route.GET(request('different-owner', 'GET'));
  const otherBody = await otherList.json() as { data: unknown[] };
  assert.deepEqual(otherBody.data, []);
  console.log('privacy requests route synthetic-storage checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
