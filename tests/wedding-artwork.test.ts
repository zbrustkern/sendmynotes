import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ARTWORK_LIMITS, artworkComposition, rasterMime, WeddingArtworkError, weddingArtworkPreset} from '../lib/wedding/artwork-policy';
import {processWeddingArtwork} from '../lib/wedding/artwork-processing';

let checks=0;
async function test(name:string,fn:()=>Promise<void>|void){await fn();checks++;console.log(`ok ${checks} - ${name}`);}
const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;
async function main(){
  Object.assign(process.env,{NODE_ENV:'test'});
  const dir=await mkdtemp(join(tmpdir(),'wedding-art-tests-'));
  process.env.SMN_TEST_DATA_DIR=dir;
  try {
    const {firestoreDb:db,isFirestoreMock}=await import('../lib/firebase-admin');
    assert.equal(isFirestoreMock,true,'Artwork tests require the isolated mock Firestore; run via npm run test:wedding with sanitized environment.');
    const {createWeddingArtworkService}=await import('../lib/wedding/artwork');
    const {createWeddingArtworkHandlers,readArtworkRequest,parseArtworkMultipart}=await import('../lib/wedding/artwork-http');
    const {artworkSha}=await import('../lib/wedding/artwork-storage');
    const objects=new Map<string,Buffer>();let writes=0,removes=0,failStore=false;
    const store={
      async putOnce(key:string,bytes:Buffer){if(failStore&&key.startsWith('wedding-normalized'))throw new Error('synthetic storage interruption');const old=objects.get(key);if(old)assert.deepEqual(old,bytes);else{objects.set(key,Buffer.from(bytes));writes++;}return {generation:'1'};},
      async read(key:string,max:number){const bytes=objects.get(key);if(!bytes)throw new WeddingArtworkError('not_found','Not found.',404);assert.ok(bytes.length<=max);return Buffer.from(bytes);},
      async remove(key:string){assert.ok(key.startsWith('wedding-pending/'));objects.delete(key);removes++;},
      async removeOrphan(key:string){assert.ok(key.startsWith('wedding-normalized/'));objects.delete(key);},
    };
    let now=Date.now();
    const project='fictional-alex-robin',foreign='fictional-mira-kit';
    const projectRef=(id:string)=>db.collection('weddingProjects').doc(id);
    const seed=async(id:string)=>projectRef(id).set({id,expiresAt:now+180*86400000,cover:{kind:'preset',id:'preset-thankyou-botanical',url:'/presets/thank-you-botanical.jpg'},revision:1});
    await seed(project);await seed(foreign);
    // Fictional corner chart: red left, blue right, green lower left, yellow lower right.
    const chart=await sharp({create:{width:1200,height:800,channels:3,background:'#ffffff'}}).composite([
      {input:await sharp({create:{width:600,height:400,channels:3,background:'#ff0000'}}).png().toBuffer(),left:0,top:0},
      {input:await sharp({create:{width:600,height:400,channels:3,background:'#0000ff'}}).png().toBuffer(),left:600,top:0},
      {input:await sharp({create:{width:600,height:400,channels:3,background:'#00ff00'}}).png().toBuffer(),left:0,top:400},
      {input:await sharp({create:{width:600,height:400,channels:3,background:'#ffff00'}}).png().toBuffer(),left:600,top:400},
    ]).png().withMetadata({orientation:1,exif:{IFD0:{Artist:'Fictional fixture'}}}).toBuffer();
    const base=await processWeddingArtwork(chart,'image/png',artworkComposition({}));
    const service=createWeddingArtworkService({db,objects:store,assertRuntime:()=>{},now:()=>now});
    const fast=createWeddingArtworkService({db,objects:store,assertRuntime:()=>{},now:()=>now,process:async()=>base});
    let selected:{assetId:string;url:string};
    await test('real isolated raster worker strips metadata, yields exact A2 and private source',async()=>{
      const [source,master]=await Promise.all([sharp(base.source).metadata(),sharp(base.master).metadata()]);
      assert.equal(master.width,1275);assert.equal(master.height,1650);assert.equal(source.exif,undefined);assert.equal(source.icc,undefined);assert.equal(source.orientation,undefined);assert.equal(master.exif,undefined);
      selected=await service.intake(project,async()=>({bytes:chart,mime:'image/png'}));
      assert.deepEqual(await service.read(project,selected.assetId),base.master);
      assert.match(selected.url,/^\/api\/wedding\/artwork\?id=art_[a-f0-9]{64}$/);
      assert.equal(await service.validate(project,selected.assetId),true);
      assert.equal([...objects.keys()].some(k=>k.startsWith('wedding-pending/')),false);
    });
    await test('fit, zoom, x, y and path-based lettering actually affect the composited pixels',async()=>{
      const contain=await processWeddingArtwork(base.source,'image/png',artworkComposition({fit:'contain'}));
      const offset=await processWeddingArtwork(base.source,'image/png',artworkComposition({zoom:2,x:1,y:1}));
      const lettered=await processWeddingArtwork(base.source,'image/png',artworkComposition({lettering:'Alex & Robin\n2026'}));
      assert.notDeepEqual(contain.master,base.master);assert.notDeepEqual(offset.master,base.master);assert.notDeepEqual(lettered.master,base.master);
      const pixel=await sharp(contain.master).extract({left:0,top:0,width:1,height:1}).raw().toBuffer();assert.deepEqual([...pixel],[244,241,235]);
      const corner=await sharp(offset.master).extract({left:1250,top:1600,width:1,height:1}).raw().toBuffer();assert.deepEqual([...corner],[255,255,0]);
      const composed=await service.compose(project,selected!.assetId,{fit:'contain',lettering:'Thank You'});
      const reverted=await service.compose(project,composed.assetId,{});
      assert.equal(reverted.assetId,selected!.assetId,'compose reads the pristine normalized source; lettering does not accumulate');
    });
    await test('normalized panoramic sources remain editable after their short side is resized below 512',async()=>{
      const panorama=await sharp({create:{width:5000,height:700,channels:3,background:'#aaccee'}}).png().toBuffer();
      const normalized=await processWeddingArtwork(panorama,'image/png',artworkComposition({fit:'contain'}));
      assert.ok(normalized.sourceHeight<512);
      const edited=await processWeddingArtwork(normalized.source,'image/png',artworkComposition({fit:'contain',lettering:'Thank You'}),{normalized:true});
      assert.equal(edited.height,1650);assert.deepEqual(edited.source,normalized.source);
    });
    await test('duplicate normalized bytes attach once and keep the accepted project cover unchanged',async()=>{
      const before=(await projectRef(project).collection('artwork').get()).size;
      const [first,second]=[await fast.generated(project,chart),await fast.generated(project,chart)];
      assert.equal(first.assetId,selected!.assetId);assert.deepEqual(first,second);
      assert.equal((await projectRef(project).collection('artwork').get()).size,before);
      assert.equal((await projectRef(project).get()).data()?.cover.kind,'preset');
    });
    await test('foreign, missing, expired and tampered private images cannot be read or accepted',async()=>{
      assert.equal(await service.validate(foreign,selected!.assetId),false);
      await assert.rejects(()=>service.read(foreign,selected!.assetId),code('not_found'));
      await assert.rejects(()=>service.read(project,'../foreign'),code('not_found'));
      assert.equal(await service.validate(project,'missing'),false);
      const record=(await projectRef(project).collection('artwork').doc(selected!.assetId).get()).data()!;
      const recordRef=projectRef(project).collection('artwork').doc(selected!.assetId);
      await recordRef.update({expiresAt:now-1});assert.equal(await service.validate(project,selected!.assetId),false);await recordRef.set(record);
      await recordRef.update({deletedAt:now});await assert.rejects(()=>service.read(project,selected!.assetId),code('not_found'));await recordRef.set(record);
      const original=objects.get(record.storageKey)!;objects.set(record.storageKey,Buffer.from('not an image'));
      await assert.rejects(()=>service.read(project,selected!.assetId),code('asset_changed'));objects.set(record.storageKey,original);
      await projectRef(foreign).update({expiresAt:now-1});assert.equal(await service.validate(foreign,selected!.assetId),false);
      await seed(foreign);
    });
    await test('paid cover pin is immutable, duplicate-safe and retained after project expiry',async()=>{
      const pins=await Promise.all([service.pin(project,selected!.assetId,'fictional-batch-one'),service.pin(project,selected!.assetId,'fictional-batch-one')]);
      assert.deepEqual(pins[0],pins[1]);assert.equal(pins[0].sha256,artworkSha(base.master));assert.match(pins[0].storageKey,/^wedding-paid-retained\/staging\//);
      await assert.rejects(()=>service.pin(project,'art_other','fictional-batch-one'),code('pin_conflict'));
      await projectRef(project).update({expiresAt:now-1});
      assert.deepEqual(await service.pin(project,selected!.assetId,'fictional-batch-one'),pins[0]);
      assert.equal(await service.validate(project,selected!.assetId),false);await seed(project);
    });
    await test('real validators reject malformed, mislabeled, tiny, animated and oversized rasters',async()=>{
      await assert.rejects(()=>service.intake(foreign,async()=>({bytes:chart,mime:'image/jpeg'})),code('unsupported_type'));
      await assert.rejects(()=>processWeddingArtwork(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('broken')]),'image/png',artworkComposition({})),code('invalid_image'));
      const tiny=await sharp({create:{width:30,height:30,channels:3,background:'red'}}).png().toBuffer();
      await assert.rejects(()=>processWeddingArtwork(tiny,'image/png',artworkComposition({})),code('image_too_small'));
      const frames=Buffer.concat([Buffer.alloc(512*512*3,80),Buffer.alloc(512*512*3,180)]);
      const animated=await sharp(frames,{raw:{width:512,height:1024,channels:3,pageHeight:512}}).webp({loop:0,delay:[100,100]}).toBuffer();
      assert.equal((await sharp(animated,{animated:true}).metadata()).pages,2);
      const animationControl=Buffer.alloc(20);animationControl.writeUInt32BE(8,0);animationControl.write('acTL',4);animationControl.writeUInt32BE(2,8);
      const apng=Buffer.concat([chart.subarray(0,33),animationControl,chart.subarray(33)]);
      await assert.rejects(()=>processWeddingArtwork(apng,'image/png',artworkComposition({})),code('invalid_image'));
      await assert.rejects(()=>processWeddingArtwork(animated,'image/webp',artworkComposition({})),code('invalid_image'));
      const huge=await sharp({create:{width:6400,height:6400,channels:3,background:'red'}}).png().toBuffer();
      await assert.rejects(()=>processWeddingArtwork(huge,'image/png',artworkComposition({})),code('invalid_image'));
      await assert.rejects(()=>processWeddingArtwork(Buffer.alloc(ARTWORK_LIMITS.inputBytes+1),'image/png',artworkComposition({})),code('file_too_large'));
      await assert.rejects(()=>service.generated(foreign,Buffer.from('<svg/>')),code('unsupported_type'));
    });
    await test('worker deadline, abort, memory watchdog and local concurrency actually terminate work',async()=>{
      const hanging=join(dir,'hang.cjs');await writeFile(hanging,'setInterval(()=>{},1000);');
      const started=Date.now();await assert.rejects(()=>processWeddingArtwork(chart,'image/png',artworkComposition({}),{workerPath:hanging,deadlineMs:100}),code('processing_timeout'));assert.ok(Date.now()-started<3000);
      const abort=new AbortController();const active=processWeddingArtwork(chart,'image/png',artworkComposition({}),{workerPath:hanging,signal:abort.signal,deadlineMs:3000});
      await assert.rejects(()=>processWeddingArtwork(chart,'image/png',artworkComposition({})),code('processing_busy'));
      setTimeout(()=>abort.abort(),80);await assert.rejects(()=>active,code('cancelled'));
      await assert.rejects(()=>processWeddingArtwork(chart,'image/png',artworkComposition({}),{memoryBytes:1024,deadlineMs:3000}),code('processing_memory'));
      assert.ok((await processWeddingArtwork(chart,'image/png',artworkComposition({}))).master.length>0,'capacity released after kills');
    });
    await test('crop, glyph and trusted template validation rejects executable/foreign references',async()=>{
      for(const value of [{zoom:Infinity},{zoom:0},{x:2},{fit:'fill'},{lettering:[]},{lettering:{text:'x',treatment:'external'}},{lettering:'a'.repeat(41)}])assert.throws(()=>artworkComposition(value));
      await assert.rejects(()=>processWeddingArtwork(chart,'image/png',artworkComposition({lettering:'Thanks 🌿'})),code('unsupported_glyph'));
      assert.equal(weddingArtworkPreset('preset-thankyou-botanical'),'/presets/thank-you-botanical.jpg');assert.equal(weddingArtworkPreset('__proto__'),null);assert.equal(weddingArtworkPreset('https://example.invalid/image'),null);
    });
    await test('raw body reader enforces actual bytes without Content-Length and cancels stalled streams',async()=>{
      let cancelled=false;
      const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(10));c.enqueue(new Uint8Array(10));},cancel(){cancelled=true;}});
      await assert.rejects(()=>readArtworkRequest(new Request('https://cards.example',{method:'POST',body:stream,duplex:'half'} as RequestInit),15),code('file_too_large'));assert.equal(cancelled,true);
      cancelled=false;const stalled=new ReadableStream({cancel(){cancelled=true;}});
      await assert.rejects(()=>readArtworkRequest(new Request('https://cards.example',{method:'POST',body:stalled,duplex:'half'} as RequestInit),15,25),code('upload_timeout'));assert.equal(cancelled,true);
      const abort=new AbortController();const pending=readArtworkRequest(new Request('https://cards.example',{method:'POST',body:new ReadableStream({}),signal:abort.signal,duplex:'half'} as RequestInit),15);abort.abort();await assert.rejects(()=>pending,code('cancelled'));
    });
    const multipart=async()=>{const form=new FormData();form.append('file',new File([new Uint8Array(chart)],'fictional-corners.png',{type:'image/png'}));const request=new Request('https://cards.example/api/wedding/artwork',{method:'POST',headers:{origin:'https://cards.example',host:'cards.example'},body:form});return request;};
    await test('strict multipart accepts browser File and rejects duplicates, incomplete parts and header bombs',async()=>{
      const request=await multipart();const body=Buffer.from(await request.arrayBuffer()),type=request.headers.get('content-type')!;
      const parsed=parseArtworkMultipart(body,type);assert.deepEqual(parsed.bytes,chart);assert.equal(parsed.mime,'image/png');
      assert.throws(()=>parseArtworkMultipart(body.subarray(0,body.length-5),type),code('invalid_multipart'));
      const form=new FormData();form.append('file',new File(['x'],'a.png',{type:'image/png'}));form.append('file',new File(['y'],'b.png',{type:'image/png'}));const duplicate=new Request('https://cards.example',{method:'POST',body:form});
      assert.throws(()=>parseArtworkMultipart(Buffer.from(body.toString('binary').replace('name="file"','name="wrong"'),'binary'),type),code('invalid_file'));
      assert.throws(()=>parseArtworkMultipart(Buffer.from(new Uint8Array([])),type),code('invalid_multipart'));
      assert.throws(()=>parseArtworkMultipart(Buffer.from(`--test\r\n${'x'.repeat(9000)}\r\n\r\nx\r\n--test--`),'multipart/form-data; boundary=test'),code('invalid_multipart'));
      const duplicateBytes=Buffer.from(await duplicate.arrayBuffer());assert.throws(()=>parseArtworkMultipart(duplicateBytes,duplicate.headers.get('content-type')!),code('invalid_multipart'));
    });
    await test('HTTP requires same origin and current project pilot before receiving files; GET rechecks ownership',async()=>{
      let actor={projectId:project,actorId:'fictional-owner',pilot:true,verified:false},authCalls=0,readCalls=0;
      const handlers=createWeddingArtworkHandlers(async()=>{authCalls++;return actor;},{intake:fast.intake,compose:fast.compose,read:async(p,id)=>{readCalls++;return fast.read(p,id);},adopt:async()=>{throw new WeddingArtworkError('unauthorized','Sign in.',401);}});
      const cross=await multipart();cross.headers.set('origin','https://foreign.example');assert.equal((await handlers.POST(cross)).status,403);assert.equal(authCalls,0);
      actor={...actor,pilot:false};assert.equal((await handlers.POST(await multipart())).status,403);
      actor={...actor,pilot:true};now+=61000;const ok=await handlers.POST(await multipart());assert.equal(ok.status,201);assert.deepEqual(await ok.json(),selected!);
      actor={...actor,pilot:false};const preview=await handlers.GET(new Request(`https://cards.example/api/wedding/artwork?id=${selected!.assetId}`));assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(preview.headers.get('content-type'),'image/png');
      actor={...actor,projectId:foreign};assert.equal((await handlers.GET(new Request(`https://cards.example/api/wedding/artwork?id=${selected!.assetId}`))).status,404);assert.equal(readCalls,2);
      const denied=createWeddingArtworkHandlers(async()=>{throw new WeddingArtworkError('session_expired','Sign in.',401);});assert.equal((await denied.GET(new Request('https://cards.example?id=x'))).status,401);
    });
    await test('revocation during decode prevents attachment and preserves the accepted front',async()=>{
      await seed('fictional-revoked');let authorized=true;
      const revoked=createWeddingArtworkService({db,objects:store,assertRuntime:()=>{},now:()=>now,process:async()=>{authorized=false;return base;}});
      await assert.rejects(()=>revoked.intake('fictional-revoked',async()=>({bytes:chart,mime:'image/png'}),{},{authorize:async()=>{if(!authorized)throw new WeddingArtworkError('pilot_required','Revoked.',403);}}),code('pilot_required'));
      assert.equal((await projectRef('fictional-revoked').collection('artwork').get()).size,0);
      assert.equal([...objects.keys()].some(k=>k.startsWith('wedding-pending/')),false);
    });
    await test('concurrent quota claims, failed storage and daily/storage limits fail closed',async()=>{
      const quota='fictional-quota';await seed(quota);
      let unblock:()=>void=()=>{};const gate=new Promise<void>(resolve=>{unblock=resolve;});
      const running=fast.intake(quota,async()=>{await gate;return {bytes:chart,mime:'image/png'};});
      // Allow the serialized mock transaction to claim the lease first.
      await new Promise(resolve=>setTimeout(resolve,20));
      await assert.rejects(()=>fast.generated(quota,chart),code('processing_busy'));unblock();await running;
      const budget=projectRef(quota).collection('artworkControl').doc('budget');
      await budget.update({attempts:Array(100).fill(now)});await assert.rejects(()=>fast.generated(quota,chart),code('artwork_quota'));
      await budget.update({attempts:[],bytes:ARTWORK_LIMITS.projectBytes,sources:{},assets:0});
      const different={...base,master:await sharp(base.master).modulate({brightness:0.5}).png().toBuffer()};
      const exceed=createWeddingArtworkService({db,objects:store,assertRuntime:()=>{},now:()=>now,process:async()=>different});
      const before=objects.size;await assert.rejects(()=>exceed.generated(quota,chart),code('asset_limit'));assert.equal(objects.size,before,'quota checked before normalized object writes');
      await seed('fictional-failure');failStore=true;await assert.rejects(()=>fast.generated('fictional-failure',chart));failStore=false;
      const jobs=await db.collection('weddingArtworkJobs').get();assert.ok(jobs.docs.some(d=>d.data().verdict==='retryable'));assert.ok(jobs.docs.some(d=>d.data().verdict==='rejected'));assert.ok(jobs.docs.some(d=>d.data().verdict==='accepted_for_import'));
      const failedBudget=(await projectRef('fictional-failure').collection('artworkControl').doc('budget').get()).data();assert.ok(failedBudget?.reservedBytes>0);
      now+=8*86400000;const cleanup=await fast.cleanupPending(100);assert.ok(cleanup.deleted>0);assert.equal((await projectRef('fictional-failure').collection('artworkControl').doc('budget').get()).data()?.reservedBytes,0);
      assert.deepEqual(await fast.read(project,selected!.assetId),base.master);assert.ok([...objects.keys()].some(k=>k.startsWith('wedding-paid-retained/')));
    });
    await test('Studio adoption requires the independent account, active grant and accepted design hash',async()=>{
      const {createWeddingStudioAdopter}=await import('../lib/wedding/artwork-studio');
      let granted=true,owner='fictional-verified-account',digest=artworkSha(base.master),stored=0;
      const adopt=createWeddingStudioAdopter({
        actor:async()=>({uid:'fictional-verified-account'}),
        grant:async()=>{if(!granted)throw new WeddingArtworkError('access_denied','Grant expired.',403);},
        accepted:async()=>({masterSha256:digest}),design:async()=>({uid:owner,masterSha256:digest,masterKey:'private-studio-master'}),read:async()=>base.master,
        store:async(p,bytes,ctx)=>{await ctx?.authorize?.();stored++;assert.equal(p,project);assert.deepEqual(bytes,base.master);return selected!;},
      });
      const req=new Request('https://cards.example'),ctx={signal:new AbortController().signal,authorize:async()=>{}};
      assert.deepEqual(await adopt(req,project,'fictional-design',ctx),selected!);assert.equal(stored,1);
      owner='foreign-account';await assert.rejects(()=>adopt(req,project,'fictional-design',ctx),code('not_found'));
      owner='fictional-verified-account';granted=false;await assert.rejects(()=>adopt(req,project,'fictional-design',ctx),code('access_denied'));
      granted=true;digest='0'.repeat(64);await assert.rejects(()=>adopt(req,project,'fictional-design',ctx),code('asset_changed'));
      digest=artworkSha(base.master);await assert.rejects(()=>adopt(req,project,'fictional-design',{...ctx,authorize:async()=>{granted=false;}}),code('access_denied'));assert.equal(stored,1);
    });
    await test('checked-in worker is credential-free and uses shared normalization and lettering',async()=>{
      const bundle=await readFile('lib/wedding/artwork-worker.cjs','utf8');assert.ok(bundle.includes('normalizeUploadImage'));assert.ok(bundle.includes('renderLetteringSvg'));assert.ok(!bundle.includes('firebase-admin'));assert.ok(!bundle.includes('GEMINI_API_KEY'));
      assert.ok(writes>0&&removes>0);assert.equal(rasterMime(base.master),'image/png');
    });
    console.log(`Passed ${checks} wedding artwork scenarios (fictional fixtures only).`);
  } finally {await rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
