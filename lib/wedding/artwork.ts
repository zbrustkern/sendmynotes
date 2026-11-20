import {randomUUID} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {ARTWORK_LIMITS, ARTWORK_POLICY, artworkComposition, artworkId, rasterMime, WeddingArtworkError, assertNormalizedWeddingFront} from './artwork-policy';
import {artworkProjectSegment, artworkSha, ArtworkObjectStore, assertWeddingArtworkRuntime, firestoreDb, weddingArtworkObjects} from './artwork-storage';
import {weddingStorageEnvironment} from './server';
import {ProcessedArtwork, processWeddingArtwork} from './artwork-processing';
export {WEDDING_ARTWORK_PRESETS, weddingArtworkPreset} from './artwork-policy';

const DAY=86400000;
type Project = {id?:string;expiresAt?:number|string;deletedAt?:unknown;status?:string};
type Asset = {deletedAt?:number;expiresAt?:number;id:string;projectId:string;sha256:string;storageKey:string;sourceKey:string;sourceSha256:string;byteLength:number;sourceBytes:number;createdAt:number;policy:string;verdict:'accepted_for_import';generation:string;sourceGeneration:string;composition:ReturnType<typeof artworkComposition>};
type Budget = {attempts?:number[];leases?:Record<string,number>;sources?:Record<string,boolean>;assets?:number;bytes?:number;reservedBytes?:number};
type Context = {signal?:AbortSignal;authorize?:()=>Promise<void>};
export type WeddingArtworkSelection = {assetId:string;url:string};
type Dependencies = {db:Firestore;objects:ArtworkObjectStore;assertRuntime:()=>void;process?:typeof processWeddingArtwork;now?:()=>number;storageEnv?:'staging'|'production'};
function availableProject(project:Project|undefined, now:number) {
  const expiry=typeof project?.expiresAt==='string'?Date.parse(project.expiresAt):project?.expiresAt;
  if(!project||project.deletedAt||project.status==='deleted'||!expiry||expiry<=now)throw new WeddingArtworkError('project_expired','This project is unavailable or has expired.',404);
}
const selection=(id:string):WeddingArtworkSelection=>({assetId:id,url:`/api/wedding/artwork?id=${id}`});
const liveLeases=(value:Record<string,number>|undefined, now:number)=>Object.fromEntries(Object.entries(value||{}).filter(([,until])=>until>now));

/** Testable service; the public wrappers below always use the real private bucket
 * and Admin Firestore. Authorization remains at each HTTP/AI/checkout boundary. */
export function createWeddingArtworkService(deps:Dependencies) {
  const {db,objects}=deps, now=deps.now||Date.now, processImage=deps.process||processWeddingArtwork;
  const projectRef=(id:string)=>db.collection('weddingProjects').doc(id);
  const assetRef=(projectId:string,id:string)=>projectRef(projectId).collection('artwork').doc(id);
  const budgetRef=(id:string)=>projectRef(id).collection('artworkControl').doc('budget');
  const env=()=>deps.storageEnv||weddingStorageEnvironment();
  const globalRef=()=>db.collection('weddingArtworkControl').doc(env());
  const jobRef=(id:string)=>db.collection('weddingArtworkJobs').doc(`${env()}_${id}`);
  const key=(root:string,projectId:string,id:string,ext='png')=>`wedding-${root}/${env()}/${artworkProjectSegment(projectId)}/${id}.${ext}`;
  async function check(projectId:string,ctx:Context={}) {
    deps.assertRuntime();artworkId(projectId);
    if(ctx.signal?.aborted)throw new WeddingArtworkError('cancelled','Image processing was cancelled.',499);
    await ctx.authorize?.();
    availableProject((await projectRef(projectId).get()).data(),now());
  }
  async function getAsset(projectId:string,id:string):Promise<Asset> {
    artworkId(id);
    const data=(await assetRef(projectId,id).get()).data() as Asset|undefined;
    if(!data||data.deletedAt||(data.expiresAt!==undefined&&data.expiresAt<=now())||!data.generation||!data.sourceGeneration||data.id!==id||data.projectId!==projectId||data.policy!==ARTWORK_POLICY||data.verdict!=='accepted_for_import'||data.storageKey!==key('normalized',projectId,data.sha256)||data.sourceKey!==key('normalized',projectId,data.sourceSha256)||!/^[a-f0-9]{64}$/.test(data.sha256)||!/^[a-f0-9]{64}$/.test(data.sourceSha256))throw new WeddingArtworkError('not_found','Card front not found.',404);
    return data;
  }
  async function verifiedBytes(asset:Asset,source=false) {
    const bytes=await objects.read(source?asset.sourceKey:asset.storageKey,ARTWORK_LIMITS.outputBytes);
    if(artworkSha(bytes)!==(source?asset.sourceSha256:asset.sha256)||rasterMime(bytes)!=='image/png')throw new WeddingArtworkError('asset_changed','Card front could not be verified. Replace the image.',409);
    return bytes;
  }
  async function claim(projectId:string,jobId:string) {
    await db.runTransaction(async tx=>{
      const [p,b,g]=await Promise.all([tx.get(projectRef(projectId)),tx.get(budgetRef(projectId)),tx.get(globalRef())]);
      const at=now();availableProject(p.data(),at);
      const budget=(b.data()||{}) as Budget, global=(g.data()||{}) as Budget;
      const attempts=(budget.attempts||[]).filter(t=>t>at-DAY), leases=liveLeases(budget.leases,at), globalLeases=liveLeases(global.leases,at);
      if(attempts.length>=ARTWORK_LIMITS.dailyAttempts||attempts.filter(t=>t>at-60000).length>=ARTWORK_LIMITS.minuteAttempts)throw new WeddingArtworkError('artwork_quota','The photo editing allowance is used. Retry later.',429);
      if(Object.keys(leases).length>=ARTWORK_LIMITS.projectConcurrency||Object.keys(globalLeases).length>=ARTWORK_LIMITS.globalConcurrency)throw new WeddingArtworkError('processing_busy','Another image is being checked. Retry shortly.',429);
      tx.set(budgetRef(projectId),{...budget,attempts:[...attempts,at],leases:{...leases,[jobId]:at+ARTWORK_LIMITS.leaseMs}});
      tx.set(globalRef(),{leases:{...globalLeases,[jobId]:at+ARTWORK_LIMITS.leaseMs}});
      tx.create(jobRef(jobId),{projectId,jobId,policy:ARTWORK_POLICY,verdict:'pending',createdAt:at,pendingExpiresAt:at+ARTWORK_LIMITS.pendingDays*DAY,pendingKey:key('pending',projectId,jobId,'bin')});
    });
  }
  async function release(projectId:string,jobId:string) {
    await db.runTransaction(async tx=>{
      const [b,g]=await Promise.all([tx.get(budgetRef(projectId)),tx.get(globalRef())]);
      const budget=(b.data()||{}) as Budget, global=(g.data()||{}) as Budget;
      const leases=liveLeases(budget.leases,now()), globalLeases=liveLeases(global.leases,now());
      delete leases[jobId];delete globalLeases[jobId];
      tx.set(budgetRef(projectId),{...budget,leases});tx.set(globalRef(),{leases:globalLeases});
    });
  }
  async function attach(projectId:string,result:ProcessedArtwork,composition:ReturnType<typeof artworkComposition>,jobId:string,ctx:Context):Promise<WeddingArtworkSelection> {
    const sourceSha256=artworkSha(result.source),sha256=artworkSha(result.master),id=`art_${artworkSha(`${ARTWORK_POLICY}:${projectId}:${sourceSha256}:${sha256}`)}`;
    const storageKey=key('normalized',projectId,sha256),sourceKey=key('normalized',projectId,sourceSha256);
    await check(projectId,ctx);
    // Reserve storage BEFORE either object write. Failed/crashed writes remain
    // charged until orphan cleanup; retries cannot create unlimited private data.
    let reservation=0;
    await db.runTransaction(async tx=>{
      const [p,b,existing]=await Promise.all([tx.get(projectRef(projectId)),tx.get(budgetRef(projectId)),tx.get(assetRef(projectId,id))]);
      availableProject(p.data(),now());
      const budget=(b.data()||{}) as Budget, sources=budget.sources||{},isNew=!sources[sourceSha256];
      if(!budget.leases?.[jobId]||budget.leases[jobId]<=now())throw new WeddingArtworkError('processing_expired','The image check expired. Retry.',409);
      reservation=existing.exists?0:result.master.length+(isNew?result.source.length:0);
      if(!existing.exists&&((isNew&&Object.keys(sources).length>=ARTWORK_LIMITS.sourceCount)||(budget.assets||0)>=ARTWORK_LIMITS.revisionCount||(budget.bytes||0)+(budget.reservedBytes||0)+reservation>ARTWORK_LIMITS.projectBytes))throw new WeddingArtworkError('asset_limit','This project has reached its image storage allowance.',429);
      tx.set(budgetRef(projectId),{...budget,reservedBytes:(budget.reservedBytes||0)+reservation});
      tx.set(jobRef(jobId),{normalizedKeys:[sourceKey,storageKey],reservedBytes:reservation},{merge:true});
    });
    const sourceObject=await objects.putOnce(sourceKey,result.source,'image/png');
    const masterObject=await objects.putOnce(storageKey,result.master,'image/png');
    await check(projectId,ctx);
    await db.runTransaction(async tx=>{
      const [p,b,existing]=await Promise.all([tx.get(projectRef(projectId)),tx.get(budgetRef(projectId)),tx.get(assetRef(projectId,id))]);
      availableProject(p.data(),now());
      const budget=(b.data()||{}) as Budget;
      if(!budget.leases?.[jobId]||budget.leases[jobId]<=now())throw new WeddingArtworkError('processing_expired','The image check expired. Retry.',409);
      if(existing.exists) {
        const old=existing.data() as Asset;
        if(old.sha256!==sha256||old.sourceSha256!==sourceSha256||old.projectId!==projectId)throw new WeddingArtworkError('asset_conflict','Card front changed. Retry.',409);
      } else {
        const sources=budget.sources||{}, isNew=!sources[sourceSha256];
        const added=result.master.length+(isNew?result.source.length:0);
        if((isNew&&Object.keys(sources).length>=ARTWORK_LIMITS.sourceCount)||(budget.assets||0)>=ARTWORK_LIMITS.revisionCount||(budget.bytes||0)+added>ARTWORK_LIMITS.projectBytes)throw new WeddingArtworkError('asset_limit','This project has reached its image storage allowance.',429);
        const asset:Asset={id,projectId,sha256,storageKey,sourceKey,sourceSha256,byteLength:result.master.length,sourceBytes:result.source.length,createdAt:now(),policy:ARTWORK_POLICY,verdict:'accepted_for_import',generation:masterObject.generation,sourceGeneration:sourceObject.generation,composition};
        tx.create(assetRef(projectId,id),asset);
        tx.set(budgetRef(projectId),{...budget,sources:{...sources,[sourceSha256]:true},assets:(budget.assets||0)+1,bytes:(budget.bytes||0)+added,reservedBytes:Math.max(0,(budget.reservedBytes||0)-reservation)});
      }
      if(existing.exists&&reservation)tx.set(budgetRef(projectId),{...budget,reservedBytes:Math.max(0,(budget.reservedBytes||0)-reservation)});
      tx.set(jobRef(jobId),{verdict:'accepted_for_import',assetId:id,completedAt:now(),reservedBytes:0},{merge:true});
    });
    return selection(id);
  }
  async function run(projectId:string,load:()=>Promise<{bytes:Buffer;mime:string}>,settings:unknown={},ctx:Context={},normalized=false):Promise<WeddingArtworkSelection> {
    await check(projectId,ctx);const composition=artworkComposition(settings),jobId=randomUUID();
    await claim(projectId,jobId);
    const pendingKey=key('pending',projectId,jobId,'bin');
    try {
      const {bytes,mime}=await load();
      if(bytes.length===0||bytes.length>ARTWORK_LIMITS.inputBytes)throw new WeddingArtworkError('file_too_large','Image must be 15 MB or smaller.',413);
      if(!['image/jpeg','image/png','image/webp'].includes(mime)||rasterMime(bytes)!==mime)throw new WeddingArtworkError('unsupported_type','The file does not match its JPEG, PNG or WebP type.',415);
      await check(projectId,ctx);
      const raw=await objects.putOnce(pendingKey,bytes,'application/octet-stream');
      await jobRef(jobId).set({inputSha256:artworkSha(bytes),inputBytes:bytes.length,inputGeneration:raw.generation},{merge:true});
      const result=await processImage(bytes,mime,composition,{signal:ctx.signal,normalized});
      return await attach(projectId,result,composition,jobId,ctx);
    } catch(error) {
      const e=error as {status?:number;code?:string};
      await jobRef(jobId).set({verdict:!e.status||e.status>=500||e.status===429||e.status===499?'retryable':'rejected',code:e.code||'processing_failed',completedAt:now()},{merge:true});
      throw error;
    } finally {
      // Cleanup failure leaves a durable seven-day cleanup record; never turn a
      // completed attach into a new operation or erase another job's objects.
      try {await objects.remove(pendingKey);await jobRef(jobId).set({pendingDeletedAt:now()},{merge:true});}catch{}
      await release(projectId,jobId);
    }
  }
  return {
    intake:run,
    /** Only trusted server callers may pass an owned accepted master. Preserve
     * its exact bytes; retain quotas, immutable storage, and project isolation. */
    async adoptNormalized(projectId:string,bytes:Buffer,sha256:string,ctx:Context & {authorize:()=>Promise<void>}) {
      await check(projectId,ctx);
      if(!/^[a-f0-9]{64}$/.test(sha256)||artworkSha(bytes)!==sha256)throw new WeddingArtworkError('asset_changed','The accepted front could not be verified.',409);
      assertNormalizedWeddingFront(bytes);
      const jobId=randomUUID();await claim(projectId,jobId);
      try {
        const result={source:bytes,master:bytes,width:ARTWORK_LIMITS.width,height:ARTWORK_LIMITS.height,sourceWidth:ARTWORK_LIMITS.width,sourceHeight:ARTWORK_LIMITS.height};
        return await attach(projectId,result,artworkComposition({}),jobId,ctx);
      } catch(error) {
        await jobRef(jobId).set({verdict:'retryable',code:'adoption_incomplete',completedAt:now()},{merge:true});
        throw error;
      } finally {await release(projectId,jobId);}
    },
    async compose(projectId:string,id:string,settings:unknown,ctx:Context={}) {
      return run(projectId,async()=>({bytes:await verifiedBytes(await getAsset(projectId,id),true),mime:'image/png'}),settings,ctx,true);
    },
    async generated(projectId:string,bytes:Buffer,ctx:Context={}) {
      return run(projectId,async()=>({bytes,mime:rasterMime(bytes)}),{},ctx);
    },
    async read(projectId:string,id:string) {await check(projectId);return verifiedBytes(await getAsset(projectId,id));},
    async validate(projectId:string,id:string):Promise<boolean> {
      try {await check(projectId);await verifiedBytes(await getAsset(projectId,id));return true;}
      catch(error){if(error instanceof WeddingArtworkError&&[400,404,409,415].includes(error.status))return false;throw error;}
    },
    async pin(projectId:string,id:string,batchId:string):Promise<{id:string;sha256:string;storageKey:string}> {
      deps.assertRuntime();artworkId(projectId);artworkId(id);artworkId(batchId);
      const pinRef=projectRef(projectId).collection('artworkPins').doc(batchId);
      const storageKey=key('paid-retained',projectId,batchId);
      // A durable pending pin freezes the source identity before storage work.
      // A retry can read a completed paid copy even after the editable project expires.
      const previous=(await pinRef.get()).data();
      if(previous&&previous.id!==id)throw new WeddingArtworkError('pin_conflict','This batch already has a different card front.',409);
      if(previous?.status==='ready'){
        if(previous.storageKey!==storageKey)throw new WeddingArtworkError('pin_conflict','The retained front is invalid.',409);
        const bytes=await objects.read(storageKey,ARTWORK_LIMITS.outputBytes);
        if(artworkSha(bytes)!==previous.sha256)throw new WeddingArtworkError('asset_changed','Retained card front could not be verified.',409);
        return {id,sha256:previous.sha256,storageKey};
      }
      await check(projectId);
      const asset=await getAsset(projectId,id),bytes=await verifiedBytes(asset);
      await db.runTransaction(async tx=>{
        const [p,pin]=await Promise.all([tx.get(projectRef(projectId)),tx.get(pinRef)]);availableProject(p.data(),now());
        const old=pin.data();
        if(old&&(old.id!==id||old.sha256!==asset.sha256||old.storageKey!==storageKey))throw new WeddingArtworkError('pin_conflict','This batch already has a different card front.',409);
        if(!old)tx.create(pinRef,{id,sha256:asset.sha256,storageKey,projectId,batchId,status:'pending',createdAt:now()});
      });
      await objects.putOnce(storageKey,bytes,'image/png');
      await pinRef.set({status:'ready',readyAt:now()},{merge:true});
      return {id,sha256:asset.sha256,storageKey};
    },
    async cleanupPending(limit=50):Promise<{checked:number;deleted:number}> {
      deps.assertRuntime();
      const rows=await db.collection('weddingArtworkJobs').where('pendingExpiresAt','<=',now()).limit(Math.max(1,Math.min(100,limit))).get();
      let deleted=0;
      for(const row of rows.docs){const job=row.data();if(!row.id.startsWith(`${env()}_`)||job.policy!==ARTWORK_POLICY)continue;
        if(job.pendingKey!==key('pending',job.projectId,job.jobId,'bin'))continue;
        const cleanupLease=`cleanup_${randomUUID()}`;
        const locked=await db.runTransaction(async tx=>{
          const b=await tx.get(budgetRef(job.projectId)),budget=(b.data()||{}) as Budget;
          if(Object.keys(liveLeases(budget.leases,now())).length)return false;
          tx.set(budgetRef(job.projectId),{...budget,leases:{[cleanupLease]:now()+ARTWORK_LIMITS.leaseMs}});return true;
        });
        if(!locked)continue;
        try {
        await objects.remove(job.pendingKey);
        // Only orphan normalized objects are removed. A digest shared by any
        // accepted revision is retained; paid copies use a disjoint namespace.
        for(const objectKey of new Set<string>(job.normalizedKeys||[])) {
          if(!objectKey.startsWith(`wedding-normalized/${env()}/${artworkProjectSegment(job.projectId)}/`))continue;
          const [sources,masters]=await Promise.all([projectRef(job.projectId).collection('artwork').where('sourceKey','==',objectKey).limit(1).get(),projectRef(job.projectId).collection('artwork').where('storageKey','==',objectKey).limit(1).get()]);
          if(sources.empty&&masters.empty&&objects.removeOrphan)await objects.removeOrphan(objectKey);
        }
        await db.runTransaction(async tx=>{
          const [b,j]=await Promise.all([tx.get(budgetRef(job.projectId)),tx.get(row.ref)]);
          const budget=(b.data()||{}) as Budget,current=j.data();
          if(current?.reservedBytes)tx.set(budgetRef(job.projectId),{...budget,reservedBytes:Math.max(0,(budget.reservedBytes||0)-Number(current.reservedBytes))});
          tx.delete(row.ref);
        });deleted++;
        } finally {await release(job.projectId,cleanupLease);}
      }
      return {checked:rows.size,deleted};
    },
  };
}
const service=createWeddingArtworkService({db:firestoreDb,objects:weddingArtworkObjects,assertRuntime:assertWeddingArtworkRuntime});
export const intakeWeddingArtwork=service.intake;
export const composeWeddingArtwork=service.compose;
/** Trusted server callers must authorize the project and current pilot before invoking. */
export const storeWeddingGeneratedArtwork=service.generated;
export const adoptNormalizedWeddingArtwork=service.adoptNormalized;
export const readWeddingArtwork=service.read;
export const validateWeddingArtwork=service.validate;
export const pinWeddingCover=service.pin;
export const cleanupWeddingArtworkPending=service.cleanupPending;
