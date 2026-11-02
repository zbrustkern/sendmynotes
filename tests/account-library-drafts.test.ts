import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-account-library-'));
process.env.SMN_TEST_DATA_DIR = dataDir;

async function run() {
  const { accountLibraryKey, deleteLibraryBytes, isAccountLibraryKey, putLibraryBytes, readLibraryBytes, sha256 } = await import('../lib/account/library-storage');
  const { sanitizeAccountDraftContent } = await import('../lib/account/drafts');
  const { cleanupExpiredAccountDrafts, createAccountDraft, deleteAccountDraft, getAccountDraft, listAccountDrafts, updateAccountDraft } = await import('../lib/account/drafts');
  const { deleteAccountImage, getAccountImage, issueGeneratedSaveCapability, listAccountImages, readAccountImageForOrder, renameAccountImage, saveGeneratedClaim, saveHistoricalOrderFront } = await import('../lib/account/images');
  const { accountCollection, accountDoc, accountScope } = await import('../lib/account/http');
  const { getImageCachePoolCollection, getOrdersCollection } = await import('../lib/firebase-admin');
  const { uploadCollections } = await import('../lib/upload/access');
  const { CARD_PRESETS } = await import('../lib/card-presets');
  const store = new Map<string, Buffer>();
  const fake = {
    async put(key: string, bytes: Buffer) { store.set(key, Buffer.from(bytes)); },
    async get(key: string) { const bytes = store.get(key); return bytes ? Buffer.from(bytes) : null; },
    async delete(key: string) { store.delete(key); },
  };
  const bytes = Buffer.from('private image bytes');
  const ownerKey = accountLibraryKey('owner-one', 'img_test', 1, 'front');
  const otherOwnerKey = accountLibraryKey('owner-two', 'img_test', 1, 'front');
  const first = await putLibraryBytes('owner-one', 'img_test', 1, 'front', bytes, fake);
  assert.equal(first.key, ownerKey);
  assert.equal(first.hash, sha256(bytes));
  assert.equal(isAccountLibraryKey('owner-one', ownerKey), true);
  assert.equal(isAccountLibraryKey('owner-two', ownerKey), false);
  assert.notEqual(ownerKey, otherOwnerKey);
  assert.deepEqual(await readLibraryBytes('owner-one', ownerKey, fake), bytes);
  await putLibraryBytes('owner-one', 'img_test', 1, 'front', bytes, fake);
  await assert.rejects(() => putLibraryBytes('owner-one', 'img_test', 1, 'front', Buffer.from('different'), fake), { code: 'conflict' });
  await assert.rejects(() => readLibraryBytes('owner-two', ownerKey, fake), { code: 'not_found' });
  await deleteLibraryBytes('owner-one', ownerKey, fake);
  assert.equal(store.has(ownerKey), false);

  const preset = CARD_PRESETS[0];
  const sanitized = sanitizeAccountDraftContent({
    selectedDesign: { source: 'preset', imageUrl: preset.imageUrl, title: preset.title, accepted: true },
    note: { text: 'A note', style: 'hwDavid' }, recipient: { name: 'Recipient', addressLine1: '1 Main St' }, sender: null,
    currentStep: 'address', privateUploadRecovery: { token: 'secret' },
  });
  assert.equal(sanitized.selectedDesign?.accepted, false, 'a resumed draft requires fresh front acceptance');
  assert.equal('privateUploadRecovery' in sanitized, false, 'private capabilities never persist');
  assert.equal(sanitized.note.text, 'A note');
  for (const unsafe of [
    { source: 'custom', imageUrl: 'https://attacker.invalid/private.png' },
    { source: 'custom', imageUrl: 'blob:https://app.invalid/id' },
    { source: 'preset', imageUrl: '/api/account/images/img_secret/media' },
  ]) {
    assert.throws(() => sanitizeAccountDraftContent({ selectedDesign: unsafe, note: {}, recipient: null, sender: null }), /Save this custom front|current card design/);
  }
  assert.throws(() => sanitizeAccountDraftContent({ selectedDesign: { source: 'upload', imageUrl: '/api/upload/asset' }, note: {}, recipient: null, sender: null }), /Save this front/);

  const actor = { uid: 'library-owner', email: 'owner@example.test', emailVerified: true };
  const otherActor = { uid: 'other-library-owner', email: 'other@example.test', emailVerified: true };
  const cacheId = 'account-library-synthetic-generated';
  await getImageCachePoolCollection().doc(cacheId).set({
    id: cacheId, imageUrl: preset.imageUrl, prompt: 'synthetic prompt', occasion: preset.occasion,
    isGenerated: true, status: 'AVAILABLE',
  });
  const serviceStore = new Map<string, Buffer>();
  const serviceObjects = {
    async put(key: string, value: Buffer) { serviceStore.set(key, Buffer.from(value)); },
    async get(key: string) { const value = serviceStore.get(key); return value ? Buffer.from(value) : null; },
    async delete(key: string) { serviceStore.delete(key); },
  };
  const capability = await issueGeneratedSaveCapability(cacheId);
  assert.ok(capability);
  const image = await saveGeneratedClaim(actor, capability, 'Saved artwork', 'image_save_key_1', serviceObjects);
  const imageRetry = await saveGeneratedClaim(actor, capability, 'Saved artwork', 'image_save_key_1', serviceObjects);
  assert.equal(imageRetry.id, image.id, 'retrying a generated save returns the same library image');
  assert.equal(image.requiresUploadGrant, false);
  assert.equal((await listAccountImages(actor)).data[0]?.id, image.id);
  await assert.rejects(() => getAccountImage(otherActor, image.id), { code: 'not_found' });

  const renamed = await renameAccountImage(actor, image.id, 'Renamed saved artwork', image.version);
  const pinned = await readAccountImageForOrder(actor, image.selection, serviceObjects);
  assert.equal(pinned.image.title, renamed.title, 'metadata rename keeps the immutable master selection valid');
  assert.equal(pinned.masterSha256, image.selection?.masterSha256);
  const content = {
    selectedDesign: { source: 'account', imageUrl: '', title: renamed.title, accepted: false },
    accountImage: renamed.selection,
    note: { salutation: 'Dear Alex', text: 'A saved message', signOff: 'With care', style: 'hwDavid' },
    recipient: null, sender: null, currentStep: 'card',
  };
  const draft = await createAccountDraft(actor, { title: 'Saved card', content, idempotencyKey: 'draft_save_key_1' });
  assert.equal((await createAccountDraft(actor, { title: 'Saved card', content, idempotencyKey: 'draft_save_key_1' })).id, draft.id);
  assert.equal((await listAccountDrafts(actor)).data[0]?.id, draft.id);
  assert.equal((await getAccountDraft(actor, draft.id)).version, 1);
  const updated = await updateAccountDraft(actor, draft.id, { expectedVersion: 1, title: 'Updated card' });
  assert.equal(updated.version, 2);
  await assert.rejects(() => updateAccountDraft(actor, draft.id, { expectedVersion: 1, title: 'Stale edit' }), { code: 'conflict' });
  await assert.rejects(() => deleteAccountImage(actor, image.id, renamed.version), { code: 'image_in_use' });
  await deleteAccountDraft(actor, draft.id, updated.version);
  await deleteAccountImage(actor, image.id, renamed.version, serviceObjects);
  await assert.rejects(() => getAccountImage(actor, image.id), { code: 'not_found' });
  assert.equal((await accountDoc('library_quotas', actor.uid, 'saved').get()).data()?.used, 0, 'deletion releases the image quota');

  const scope=accountScope(actor.uid), now=Date.now();
  for(let index=0;index<100;index++) await accountCollection('drafts').doc(`${scope}_expired_${index}`).set({id:`expired_${index}`,ownerUid:actor.uid,ownerScope:scope,version:1,createdAt:now-1000,updatedAt:now+100-index,title:'Expired',content:{note:{text:''}},expiresAt:now-1,deletedAt:now-1});
  await accountDoc('drafts',actor.uid,'expired_active').set({id:'expired_active',ownerUid:actor.uid,ownerScope:scope,version:1,createdAt:now-1000,updatedAt:now-1000,title:'Expired active',content:{note:{text:''}},expiresAt:now-1});
  await accountDoc('draft_quotas',actor.uid,'saved').set({ownerUid:actor.uid,used:1});
  assert.equal(await cleanupExpiredAccountDrafts(now,100),100,'an initial batch of old tombstones is purged');
  assert.equal((await accountDoc('drafts',actor.uid,'expired_active').get()).exists,true,'later expired records remain for the next cleanup pass');
  assert.equal(await cleanupExpiredAccountDrafts(now,100),1,'a later expired record is not starved by tombstones');
  assert.equal((await accountDoc('draft_quotas',actor.uid,'saved').get()).data()?.used,0,'expired live draft quota is decremented once');
  for(let index=0;index<21;index++) await accountDoc('drafts',actor.uid,`page_draft_${index}`).set({id:`page_draft_${index}`,ownerUid:actor.uid,ownerScope:scope,version:1,createdAt:now,updatedAt:now-1000-index,title:`Live ${index}`,content:{selectedDesign:null,note:{salutation:'',text:'',signOff:'',style:'hwDavid'},recipient:null,sender:null},expiresAt:now+100_000});
  const firstDraftPage=await listAccountDrafts(actor); assert.equal(firstDraftPage.data.length,20); assert.ok(firstDraftPage.nextCursor,'expired records must not hide older live drafts');
  const secondDraftPage=await listAccountDrafts(actor,firstDraftPage.nextCursor||undefined); assert.equal(secondDraftPage.data.length,1); assert.notEqual(secondDraftPage.data[0].id,firstDraftPage.data[19].id);
  for(let index=0;index<30;index++) await accountCollection('images').doc(`${scope}_removed_${index}`).set({id:`removed_${index}`,ownerUid:actor.uid,ownerScope:scope,kind:'generated_front',title:'Removed',width:1275,height:1650,version:1,createdAt:now-1000,updatedAt:now+100-index,requiresUploadGrant:false,masterKey:ownerKey,masterSha256:sha256(bytes),state:'deleted',deletedAt:now});
  for(let index=0;index<21;index++) await accountDoc('images',actor.uid,`page_image_${index}`).set({id:`page_image_${index}`,ownerUid:actor.uid,ownerScope:scope,kind:'generated_front',title:`Live ${index}`,width:1275,height:1650,version:1,createdAt:now,updatedAt:now-1000-index,requiresUploadGrant:false,masterKey:ownerKey,masterSha256:sha256(bytes),state:'ready'});
  const firstImagePage=await listAccountImages(actor); assert.equal(firstImagePage.data.length,20); assert.ok(firstImagePage.nextCursor,'deleted records must not hide older live images');
  const secondImagePage=await listAccountImages(actor,firstImagePage.nextCursor||undefined); assert.equal(secondImagePage.data.length,1);

  const foreignOrderId='order_foreign_history_test';
  await getOrdersCollection().doc(foreignOrderId).set({id:foreignOrderId,userId:'different-owner',customerEmail:actor.email,status:'PAYMENT_RECEIVED',frontImageUrl:preset.imageUrl});
  await assert.rejects(()=>saveHistoricalOrderFront(actor,foreignOrderId,'Foreign card','history_key_1',serviceObjects),{code:'not_found'},'email match cannot override an explicit different owner UID');
  const legacyOrderId='order_legacy_history_test';
  await getOrdersCollection().doc(legacyOrderId).set({id:legacyOrderId,customerEmail:actor.email,status:'PAYMENT_RECEIVED',frontImageUrl:preset.imageUrl});
  const legacySaved=await saveHistoricalOrderFront(actor,legacyOrderId,'Legacy card','history_key_2',serviceObjects);
  assert.equal(legacySaved.kind,'generated_front','verified email can recover a legacy order with no UID owner');
  const uploadOrderId='order_upload_history_test';
  const historicalBytes=await fs.promises.readFile(path.join(process.cwd(),'public',preset.imageUrl));
  const uploadMaster={designId:'upload_design',revision:1,masterSha256:sha256(historicalBytes),masterKey:'upload-orders/test-owner/order_upload_history_test/master.png',uid:actor.uid,requiresUploadGrant:true,contentType:'image/jpeg' as const};
  await getOrdersCollection().doc(uploadOrderId).set({id:uploadOrderId,userId:actor.uid,status:'PAYMENT_RECEIVED',uploadMaster});
  await uploadCollections.col('uploadAccess').doc(uploadCollections.envKey(actor.uid)).set({uid:actor.uid,email:actor.email,expiresAt:Date.now()+60_000,dailyLimit:10,revoked:false,grantedAt:Date.now(),grantedBy:'synthetic'});
  const acceptedUpload=await saveHistoricalOrderFront(actor,uploadOrderId,'Accepted upload','history_key_3',serviceObjects,async()=>historicalBytes);
  assert.equal(acceptedUpload.kind,'upload_front'); assert.equal(acceptedUpload.requiresUploadGrant,true,'history copy preserves its Upload access requirement');assert.equal(acceptedUpload.contentType,'image/jpeg');
  const acceptedUploadStored=await getAccountImage(actor,acceptedUpload.id);
  assert.deepEqual(await readLibraryBytes(actor.uid,acceptedUploadStored.row.masterKey,serviceObjects),historicalBytes,'history reuse keeps the exact accepted image bytes');
  await uploadCollections.col('uploadAccess').doc(uploadCollections.envKey(actor.uid)).update({revoked:true});
  await assert.rejects(()=>readAccountImageForOrder(actor,acceptedUpload.selection,serviceObjects),{code:'access_denied'},'revoked Upload access blocks checkout reuse of accepted uploaded art');
  await assert.rejects(()=>saveHistoricalOrderFront(actor,uploadOrderId,'Accepted upload copy','history_key_5',serviceObjects,async()=>historicalBytes),{code:'access_denied'},'revoked Upload access blocks copying old upload art into the reusable library');
  await assert.rejects(()=>saveHistoricalOrderFront(actor,foreignOrderId,'Failed card','history_key_4',serviceObjects),{code:'not_found'});

  const raceCacheId = 'account-library-cleanup-race';
  await getImageCachePoolCollection().doc(raceCacheId).set({ id: raceCacheId, imageUrl: preset.imageUrl, isGenerated: true, status: 'AVAILABLE' });
  const raceCapability = await issueGeneratedSaveCapability(raceCacheId);
  const raceKey = 'image_cleanup_race_1';
  const raceImageId = `img_${createHash('sha256').update(`${actor.uid}:${raceKey}`).digest('hex').slice(0, 32)}`;
  const raceObjects = {
    async put(key: string, value: Buffer) {
      serviceStore.set(key, Buffer.from(value));
      const ref = accountDoc('images', actor.uid, raceImageId); const current = (await ref.get()).data();
      await ref.set({ ...current, state: 'deleted', deletedAt: Date.now(), objectDeletedAt: null });
    },
    async get(key: string) { const value = serviceStore.get(key); return value ? Buffer.from(value) : null; },
    async delete(key: string) { serviceStore.delete(key); },
  };
  await assert.rejects(() => saveGeneratedClaim(actor, raceCapability, 'Concurrent cleanup', raceKey, raceObjects), { code: 'conflict' }, 'finalization cannot resurrect a row deleted during object upload');
  assert.equal((await accountDoc('images', actor.uid, raceImageId).get()).data()?.state, 'deleted');
  assert.equal([...serviceStore.keys()].some(key => key.includes(raceImageId)), false, 'orphaned bytes are removed after the final state check fails');

  const quotaCacheId = 'account-library-quota-generated';
  await getImageCachePoolCollection().doc(quotaCacheId).set({ id: quotaCacheId, imageUrl: preset.imageUrl, isGenerated: true, status: 'AVAILABLE' });
  await accountDoc('library_quotas', actor.uid, 'saved').set({ ownerUid: actor.uid, used: 100 });
  const quotaCapability = await issueGeneratedSaveCapability(quotaCacheId);
  await assert.rejects(() => saveGeneratedClaim(actor, quotaCapability, 'Over quota', 'image_save_key_2', serviceObjects), { code: 'quota_exceeded' });
  console.log('account library isolation and durable draft allowlist checks passed');
}

void run().finally(() => fs.rmSync(dataDir, { recursive: true, force: true }));
