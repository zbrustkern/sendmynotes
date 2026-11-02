import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-upload-access-'));
  (process.env as Record<string,string>).NODE_ENV = 'test';
  process.env.SMN_TEST_DATA_DIR = dataDir;
  process.env.LOB_ENV = 'upload_access_test';
  const access = await import('../lib/upload/access');
  const { UploadError } = await import('../lib/upload/contracts');
  const uid = 'test-user';
  const grant = { uid, email:'test@example.com', expiresAt:Date.now()+60_000, dailyLimit:2, revoked:false, grantedAt:Date.now(), grantedBy:'owner@example.com' };
  await access.uploadCollections.col('uploadAccess').doc(access.uploadCollections.envKey(uid)).set(grant);
  await access.uploadCollections.col('uploadAssets').doc(access.uploadCollections.envKey('asset-1')).set({id:'asset-1',uid,key:'upload-private/test/source.png',width:512,height:512,mimeType:'image/png',createdAt:Date.now(),expiresAt:Date.now()+60_000});

  const actor = await access.requireUploadActor({ headers: new Headers({ authorization:`Bearer mock_token_${uid}` }) } as any);
  assert.equal(actor.uid, uid);
  const initial = await access.getUploadAccess(uid);
  assert.equal(initial.allowed, true);
  assert.equal(initial.used, 0);

  const { listStudioVersions, recordStudioVersion, selectStudioVersion, getStudioEditContext } = await import('../lib/upload/studio-session');
  const studioAsset='studio-source-1';
  await access.uploadCollections.col('uploadAssets').doc(access.uploadCollections.envKey(studioAsset)).set({id:studioAsset,uid,key:'upload-private/test/studio-source.png',width:512,height:512,mimeType:'image/png',createdAt:Date.now(),expiresAt:Date.now()+60_000});
  let studioResult:any;
  const studioIds:string[]=[];
  for(let index=1;index<=4;index++){
    const generationId=`studio-generation-${index}`,designId=`studio-design-${index}`;studioIds.push(designId);
    await access.uploadCollections.col('uploadGenerations').doc(access.uploadCollections.envKey(generationId)).set({id:generationId,uid,assetId:studioAsset,status:'ready',key:`private-generation-${index}`,standardsVersion:1,createdAt:Date.now()+index,expiresAt:Date.now()+60_000,requestHash:`studio-hash-${index}`,imagePrompt:`garden illustration ${index}`});
    await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey(designId)).set({id:designId,uid,generationId,revision:1,masterSha256:String(index).padStart(64,'0'),masterKey:`private-design-${index}`,exactText:index===1?'Thank You':'',treatmentId:'playful-stack',standardsVersion:1,createdAt:Date.now()+index,expiresAt:Date.now()+60_000});
    studioResult=await recordStudioVersion(uid,designId);
  }
  assert.equal(studioResult.versions.length,3,'the owner/source tray is bounded to three successful versions');
  assert.equal(studioResult.versions.some((version:any)=>version.designId===studioIds[0]),false,'the fourth success evicts only the oldest tray entry');
  assert.deepEqual(studioResult.versions.map((version:any)=>version.designId),studioIds.slice(1));
  assert.equal(await access.getDesign(studioIds[0]),null,'an evicted unaccepted temporary front is tombstoned and cannot be reused');
  const restored=await listStudioVersions(uid,studioAsset);
  assert.equal(restored.versions[2].prompt,'garden illustration 4','refresh can restore private edit metadata');
  await assert.rejects(listStudioVersions('different-user',studioAsset),(error:any)=>error?.code==='access_denied','a different account cannot list a private source tray');
  await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey(studioIds[3])).set({...((await access.uploadCollections.col('uploadDesigns').doc(access.uploadCollections.envKey(studioIds[3])).get()).data()),acceptedAt:Date.now()});
  const edit=await getStudioEditContext(uid,studioIds[3]);
  assert.equal(edit.assetId,studioAsset);assert.equal(edit.prompt,'garden illustration 4');
  assert.equal('masterKey' in edit,false,'edit handoff contains IDs/metadata only, never a private object key');
  const selected=await selectStudioVersion(uid,studioAsset,studioIds[2]);
  assert.equal(selected.selectedDesignId,studioIds[2],'selecting a version changes the tray pointer without generating artwork');

  const [first, replay] = await Promise.all([
    access.reserveGeneration(uid,'operation_001','hash-one','asset-1',1),
    access.reserveGeneration(uid,'operation_001','hash-one','asset-1',1),
  ]);
  assert.equal(first.generation.id,replay.generation.id);
  assert.equal([first.replay,replay.replay].filter(Boolean).length,1);
  await assert.rejects(access.reserveGeneration(uid,'operation_001','different-hash','asset-1',1),(e:any)=>e instanceof UploadError && e.code==='idempotency_conflict');
  await assert.rejects(access.reserveGeneration(uid,'operation_002','hash-two','asset-1',1),(e:any)=>e instanceof UploadError && e.code==='generation_pending');

  await access.finishGeneration({ ...first.generation, status:'failed' });
  const next = await access.reserveGeneration(uid,'operation_002','hash-two','asset-1',1);
  assert.equal(next.replay,false);
  await assert.rejects(access.reserveGeneration(uid,'operation_003','hash-three','asset-1',1),(e:any)=>e instanceof UploadError && e.code==='quota_exceeded');
  const after = await access.getUploadAccess(uid);
  assert.equal(after.used,2);

  const staleId='stale-provider-operation';
  await access.uploadCollections.col('uploadGenerations').doc(access.uploadCollections.envKey(staleId)).set({id:staleId,uid,assetId:'asset-1',status:'pending',standardsVersion:1,createdAt:Date.now()-6*60_000,expiresAt:Date.now()+60_000,requestHash:'stale-hash'});
  const stale=await access.getGeneration(staleId);
  assert.equal(stale?.status,'unresolved','a worker crash becomes explicitly recoverable after five minutes');
  assert.ok((stale as any)?.unresolvedAt,'recovery transition is timestamped');

  const staleStandardsId='stale-standards-operation';
  await access.uploadCollections.col('uploadGenerations').doc(access.uploadCollections.envKey(staleStandardsId)).set({id:staleStandardsId,uid,assetId:'asset-1',status:'pending',standardsVersion:1,createdAt:Date.now(),expiresAt:Date.now()+60000,requestHash:'stale-standards'});
  const activeStandardsRef=access.uploadCollections.col('uploadStandards').doc(access.uploadCollections.envKey('active'));
  await activeStandardsRef.set({version:2});
  await access.uploadCollections.col('uploadStandards').doc(access.uploadCollections.envKey('2')).set({version:2,creativeGuidance:'updated',enabledTreatments:['classic-serif'],defaultTreatment:'classic-serif',paused:false,publishedAt:Date.now(),publishedBy:'test'});
  await assert.rejects(access.markGenerationStarted(uid,staleStandardsId,'asset-1'),(e:any)=>e instanceof UploadError&&e.code==='standards_changed','provider start rejects standards changed after reservation');

  const standardsRef=access.uploadCollections.col('uploadStandards').doc(access.uploadCollections.envKey('active'));
  await standardsRef.set({version:2});
  await access.uploadCollections.col('uploadStandards').doc(access.uploadCollections.envKey('2')).set({version:2,creativeGuidance:'',enabledTreatments:['classic-serif'],defaultTreatment:'classic-serif',paused:true,publishedAt:Date.now(),publishedBy:'test'});
  await assert.rejects(access.requireActiveGrant(uid,'work'),(e:any)=>e instanceof UploadError && e.code==='paused');
  assert.equal((await access.requireActiveGrant(uid,'read')).uid,uid);
  console.log('upload access tests passed');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
