import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-account-privacy-'));
Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true, configurable: true, enumerable: true });
process.env.SMN_TEST_DATA_DIR = dataDir;

function request(uid: string, method: 'GET'|'POST', body?: unknown, idempotencyKey?: string) {
  return new NextRequest('http://localhost/api/account/privacy-requests', {
    method,
    headers: { authorization: `Bearer mock_token_${uid}`, origin: 'http://localhost', host: 'localhost', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
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
  assert.equal(exportBody.data.status, 'received');
  assert.equal('ownerUid' in exportBody.data, false);
  assert.equal('ownerScope' in exportBody.data, false);
  const keyed = await route.POST(request('privacy-owner', 'POST', { kind: 'export' }, 'stable-export-key-001'));
  const replay = await route.POST(request('privacy-owner', 'POST', { kind: 'export' }, 'stable-export-key-001'));
  assert.equal(keyed.status, 201);
  assert.equal(replay.status, 200);
  assert.equal((await keyed.json()).data.id, (await replay.json()).data.id);
  const conflictingReplay = await route.POST(request('privacy-owner', 'POST', { kind: 'deletion', confirm: true }, 'stable-export-key-001'));
  assert.equal(conflictingReplay.status, 409);

  const deletionResponse = await route.POST(request('privacy-owner', 'POST', { kind: 'deletion', confirm: true }));
  assert.equal(deletionResponse.status, 201);
  const ownList = await route.GET(request('privacy-owner', 'GET'));
  const ownBody = await ownList.json() as { data: Array<Record<string, unknown>> };
  assert.equal(ownBody.data.length, 3);
  assert.equal(ownBody.data.every(row => row.status === 'received'), true);
  const otherList = await route.GET(request('different-owner', 'GET'));
  const otherBody = await otherList.json() as { data: unknown[] };
  assert.deepEqual(otherBody.data, []);

  const { generateAdminSessionToken, ADMIN_COOKIE_NAME } = await import('../lib/admin-auth');
  const adminCookie = generateAdminSessionToken('zbrustkern@gmail.com');
  const adminHeaders = { cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}`, origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' };
  const adminRoute = await import('../app/api/admin/privacy-requests/route');
  const queueResponse = await adminRoute.GET(new NextRequest('http://localhost/api/admin/privacy-requests', { headers: adminHeaders }));
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json();
  assert.equal(queue.data.requests.length, 3);
  assert.equal('ownerUid' in queue.data.requests[0], false);
  const target = queue.data.requests.find((row: Record<string, unknown>) => row.id === exportBody.data.id);
  const unauthorized = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: target.id, expectedVersion: target.version, status: 'completed' }) }));
  assert.equal(unauthorized.status, 401);
  const assign = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: target.id, expectedVersion: target.version, assignedTo: 'zbrustkern@gmail.com', status: 'manual_review' }) }));
  assert.equal(assign.status, 200);
  const assigned = await assign.json();
  assert.equal(assigned.data.status, 'manual_review');
  assert.equal(assigned.data.assigned, true);
  const stale = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: target.id, expectedVersion: target.version, status: 'in_progress' }) }));
  assert.equal(stale.status, 409);
  const needsReview = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: target.id, expectedVersion: assigned.data.version, status: 'in_progress' }) }));
  assert.equal(needsReview.status, 200);
  const working = await needsReview.json();
  const noEvidence = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: target.id, expectedVersion: working.data.version, status: 'completed', confirmCompletion: true }) }));
  assert.equal(noEvidence.status, 400);
  const wrongOrigin = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: { ...adminHeaders, origin: 'https://attacker.invalid' }, body: JSON.stringify({ id: target.id, expectedVersion: working.data.version, status: 'completed', confirmCompletion: true, evidenceRef: 'ticket:1234' }) }));
  assert.equal(wrongOrigin.status, 403);
  const complete = await adminRoute.PATCH(new NextRequest('http://localhost/api/admin/privacy-requests', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ id: target.id, expectedVersion: working.data.version, status: 'completed', confirmCompletion: true, evidenceRef: 'ticket:1234' }) }));
  assert.equal(complete.status, 200);
  const finalBody = await (await route.GET(request('privacy-owner', 'GET'))).json();
  assert.equal(finalBody.data.find((row: Record<string, unknown>) => row.id === exportBody.data.id).status, 'completed');
  const previewRoute = await import('../app/api/account/privacy-requests/[id]/preview/route');
  const previewRequest = new NextRequest(`http://localhost/api/account/privacy-requests/${exportBody.data.id}/preview`, { headers: { authorization: 'Bearer mock_token_privacy-owner' } });
  const preview = await previewRoute.GET(previewRequest, { params: Promise.resolve({ id: String(exportBody.data.id) }) });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.data.dryRun, true);
  assert.equal(typeof previewBody.data.inventory.people.count, 'number');
  assert.equal('ownerUid' in previewBody.data, false);
  const otherPreview = await previewRoute.GET(new NextRequest(`http://localhost/api/account/privacy-requests/${exportBody.data.id}/preview`, { headers: { authorization: 'Bearer mock_token_different-owner' } }), { params: Promise.resolve({ id: String(exportBody.data.id) }) });
  assert.equal(otherPreview.status, 404);
  console.log('privacy requests route synthetic-storage checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
