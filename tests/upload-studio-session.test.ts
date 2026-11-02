import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.SMN_TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-studio-session-'));
  process.env.LOB_ENV = 'studio_session_test';
  const access = await import('../lib/upload/access');
  const studio = await import('../lib/upload/studio-session');
  const { GET: listRoute, POST: selectRoute } = await import('../app/api/upload/studio/versions/route');
  const { GET: editRoute } = await import('../app/api/upload/designs/[id]/edit/route');

  const uid = 'studio-owner';
  const now = Date.now();
  const assetId = 'source-photo';
  const auth = { authorization: `Bearer mock_token_${uid}` };
  const grantRef = access.uploadCollections.col('uploadAccess').doc(access.uploadCollections.envKey(uid));
  await grantRef.set({ uid, email: 'owner@example.test', expiresAt: now + 60_000, dailyLimit: 20, revoked: false, grantedAt: now, grantedBy: 'test' });
  await access.uploadCollections.col('uploadStandards').doc(access.uploadCollections.envKey('active')).set({ version: 1, enabledTreatments: ['playful-stack', 'gentle-arch', 'classic-serif'], defaultTreatment: 'playful-stack', paused: false });
  await access.uploadCollections.col('uploadAssets').doc(access.uploadCollections.envKey(assetId)).set({ id: assetId, uid, key: '', width: 900, height: 1200, mimeType: 'image/png', createdAt: now, expiresAt: now + 60_000 });

  const designIds: string[] = [];
  for (let index = 1; index <= 4; index++) {
    const generationId = `generation-${index}`;
    const designId = `design-${index}`;
    designIds.push(designId);
    await access.uploadCollections.col('uploadGenerations').doc(access.uploadCollections.envKey(generationId)).set({ id: generationId, uid, assetId, key: '', status: 'ready', standardsVersion: 1, createdAt: now + index, expiresAt: now + 60_000, requestHash: `request-${index}`, imagePrompt: `garden prompt ${index}` });
    await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey(designId)).set({ id: designId, uid, generationId, revision: 1, masterSha256: `hash-${index}`, masterKey: '', exactText: index === 1 ? 'Thank you' : `Version ${index}`, treatmentId: 'playful-stack', standardsVersion: 1, createdAt: now + index, expiresAt: now + 60_000, ...(index === 1 ? { acceptedAt: now } : {}) });
    const saved = await studio.recordStudioVersion(uid, designId);
    assert.equal(saved.selectedDesignId, designId, 'newly composed version becomes the session selection');
    if (index === 3) {
      // A failed/unresolved candidate is not recorded as a composition. The
      // tray refresh must therefore keep the prior accepted design selectable.
      const afterFailedAttempt = await studio.listStudioVersions(uid, assetId);
      assert.equal(afterFailedAttempt.versions[0]?.designId, designIds[0]);
      assert.equal(afterFailedAttempt.versions[0]?.accepted, true);
      assert.equal(afterFailedAttempt.selectedDesignId, designIds[2]);
    }
  }

  const sessionId = `studio_${createHash('sha256').update(`${uid}:${assetId}`).digest('hex').slice(0, 40)}`;
  const sessionRef = access.uploadCollections.col('uploadStudioSessions').doc(access.uploadCollections.envKey(sessionId));
  const sessionAfterFour = (await sessionRef.get()).data();
  assert.deepEqual(sessionAfterFour?.versions.map((version: any) => version.designId), designIds.slice(1), 'refreshable session stores only the newest three successful versions');
  assert.ok((await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey(designIds[0])).get()).data()?.acceptedAt, 'eviction never deletes a previously accepted front');

  const getList = () => listRoute(new NextRequest(`http://localhost/api/upload/studio/versions?assetId=${assetId}`, { headers: auth }));
  const listed = await getList();
  assert.equal(listed.status, 200, 'owner can refresh the version tray');
  const listJson = await listed.json();
  assert.equal(listJson.versions.length, 3);
  assert.equal(listJson.selectedDesignId, designIds[3]);
  assert.equal(JSON.stringify(listJson).includes('masterKey'), false, 'version refresh reveals no private object key');

  const selectRequest = (id: string) => new NextRequest('http://localhost/api/upload/studio/versions', {
    method: 'POST', headers: { ...auth, origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ assetId, designId: id }),
  });
  const selected = await selectRoute(selectRequest(designIds[2]));
  assert.equal(selected.status, 200, 'owner can select a listed version without composing another image');
  assert.equal((await selected.json()).selectedDesignId, designIds[2]);
  assert.equal((await getList().then(response => response.json())).selectedDesignId, designIds[2], 'selection survives refresh');
  assert.equal((await selectRoute(selectRequest(designIds[0]))).status, 404, 'a version evicted from the tray cannot be selected by identifier');
  const crossSiteSelect = new NextRequest('http://localhost/api/upload/studio/versions', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ assetId, designId: designIds[2] }) });
  assert.equal((await selectRoute(crossSiteSelect)).status, 403, 'version selection requires same-origin proof');

  const editRequest = (id: string) => new NextRequest(`http://localhost/api/upload/designs/${id}/edit`, { headers: auth });
  const edit = await editRoute(editRequest(designIds[0]), { params: Promise.resolve({ id: designIds[0] }) });
  assert.equal(edit.status, 200, 'an accepted immutable front can reopen against its still-live source');
  const editJson = await edit.json();
  assert.equal(editJson.edit.prompt, 'garden prompt 1');
  assert.equal(editJson.edit.exactText, 'Thank you');
  assert.equal(JSON.stringify(editJson).includes('masterKey'), false, 'edit metadata does not expose storage keys');
  await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey('foreign-design')).set({ id: 'foreign-design', uid: 'someone-else', generationId: 'foreign-generation', revision: 1, masterSha256: 'secret-hash', masterKey: 'private/foreign', exactText: '', treatmentId: 'classic-serif', standardsVersion: 1, createdAt: now, expiresAt: now + 60_000, acceptedAt: now });
  assert.equal((await editRoute(editRequest('foreign-design'), { params: Promise.resolve({ id: 'foreign-design' }) })).status, 404, 'edit metadata never crosses the owner boundary');

  await grantRef.update({ revoked: true });
  assert.equal((await getList()).status, 403, 'revoking the grant blocks tray refresh immediately');
  assert.equal((await editRoute(editRequest(designIds[0]), { params: Promise.resolve({ id: designIds[0] }) })).status, 403, 'revoking the grant blocks an edit reopen immediately');
  await grantRef.update({ revoked: false });

  await access.uploadCollections.col('uploadAssets').doc(access.uploadCollections.envKey(assetId)).update({ expiresAt: Date.now() - 1 });
  const expiredEdit = await editRoute(editRequest(designIds[0]), { params: Promise.resolve({ id: designIds[0] }) });
  assert.equal(expiredEdit.status, 409, 'an accepted result remains reviewable but cannot edit after its source expires');
  const expiredJson = await expiredEdit.json();
  assert.match(expiredJson.error, /source.*expired/i, 'expired-source error gives a useful recovery explanation');
  assert.equal(JSON.stringify(expiredJson).includes('upload-private/'), false, 'expired-source errors reveal no private storage path');
  assert.equal((await getList()).status, 409, 'tray refresh reports an expired source rather than displaying a stale private session');

  console.log('upload studio session tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
