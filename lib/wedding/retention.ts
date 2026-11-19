import {firestoreDb} from '../firebase-admin';
import {blankWeddingAddress,WEDDING_DAY,type WeddingHousehold,type WeddingProject} from './domain';
import {weddingHash} from './hash';
import {weddingProjectRef} from './server';

/** Draft cleanup is separate from paid-order retention. It never reads/deletes paid
 * masters, batch manifests, ordinals or fulfillment records. At most ten projects
 * and 250 household rows per project are processed in a pass. */
export async function cleanupWeddingDrafts(at=Date.now(),limit=10) {
  const bound=Math.max(1,Math.min(limit,10));
  const cursorRef=firestoreDb.collection('weddingRetentionControl').doc('drafts'),cursor=(await cursorRef.get()).data();
  let query=firestoreDb.collection('weddingProjects').where('expiresAt','<=',at-7*WEDDING_DAY).orderBy('expiresAt');
  if(cursor?.id){const last=await weddingProjectRef(cursor.id).get();if(last.exists)query=query.startAfter(last);}
  const page=await query.limit(bound).get();
  let purged=0,held=0;
  for(const doc of page.docs){
    const result=await firestoreDb.runTransaction(async tx=>{
      const project=(await tx.get(doc.ref)).data() as (WeddingProject & {retentionCheckedFor?:number})|undefined;
      if(!project||project.expiresAt>at-7*WEDDING_DAY||project.retentionCheckedFor===project.expiresAt)return 'skip';
      if(project.activeBatchId||project.paymentReconciliationRequired)return 'held';
      const rows=await tx.get(doc.ref.collection('households').limit(251));
      if(rows.size>250)return 'held';
      const imports=await tx.get(doc.ref.collection('imports').limit(100));
      const paid=project.purchasedCount>0||!!Object.keys(project.paidHouseholds||{}).length||rows.docs.some(d=>(d.data() as WeddingHousehold).paidBatchId);
      if(paid){tx.set(doc.ref,{retentionCheckedFor:project.expiresAt},{merge:true});return 'held';}
      let retained=0;
      for(const row of rows.docs){const data=row.data() as WeddingHousehold;if(data.paidBatchId||project.paidHouseholds?.[row.id])retained++;else tx.delete(row.ref);}
      // Imported source records and normalized artwork have independent bounded
      // cleanup queues; do not recursively delete from within a transaction.
      tx.set(firestoreDb.collection('weddingDraftCleanup').doc(project.id),{projectId:project.id,createdAt:at,importsPending:imports.size>0,artworkPolicy:paid?'retain_paid_project_artwork':'expire_draft_artwork',state:'pending'});
      tx.set(doc.ref,{...project,sharedBody:'',signOff:'',templates:[],returnAddress:{...blankWeddingAddress(),firstName:'',lastName:''},householdCount:retained,revision:project.revision+1,updatedAt:at,retentionCheckedFor:project.expiresAt,draftsPurgedAt:at,...(!paid?{deletedAt:at,cover:{kind:'preset',id:'preset-thankyou-botanical',url:'/presets/thank-you-botanical.jpg'}}:{})});
      return 'purged';
    });
    if(result==='purged')purged++;if(result==='held')held++;
  }
  await cursorRef.set({id:page.size===bound?page.docs[page.docs.length-1].id:null});
  // Expired credentials contain only scoped identifiers. Revocation/expiry is
  // checked before every read even when cleanup is delayed.
  let credentials=0;
  for(const name of ['weddingSessions','weddingAddressSessions','weddingInvites','weddingStartLimits','weddingPilotIssueLimits','weddingAccountSessionLimits']){
    credentials+=await firestoreDb.runTransaction(async tx=>{const expired=await tx.get(firestoreDb.collection(name).where('expiresAt','<=',at).limit(100));expired.docs.forEach(row=>tx.delete(row.ref));return expired.size;});
  }
  return {scanned:page.size,purged,held,credentials};
}
/** Each invocation advances source-record deletion for a single queued project.
 * Artwork is deliberately handed to its owning service through the durable queue. */
export async function cleanupWeddingSourceRecords(limit=1) {
  const jobs=await firestoreDb.collection('weddingDraftCleanup').where('state','==','pending').limit(1).get();let deleted=0;
  for(const job of jobs.docs){const projectId=String(job.data().projectId);const ref=weddingProjectRef(projectId);
    const imports=await ref.collection('imports').limit(Math.min(1,Math.max(1,limit))).get();
    for(const item of imports.docs){await firestoreDb.runTransaction(async tx=>{const [rows,pages]=await Promise.all([tx.get(item.ref.collection('rows').limit(250)),tx.get(item.ref.collection('pages').limit(13))]);[...rows.docs,...pages.docs].forEach(row=>tx.delete(row.ref));tx.delete(item.ref);deleted+=rows.size+pages.size+1;});}
    if(imports.size<Math.min(1,Math.max(1,limit)))await job.ref.set({importsPending:false,state:'artwork_pending'},{merge:true});
  }
  return {deleted};
}

/** Delete only normalized objects of tombstoned, unpaid projects. A paid master
 * uses another namespace and cannot pass this guard, even with corrupt metadata. */
export async function cleanupWeddingDraftArtwork(remove?: (key:string)=>Promise<void>) {
  const jobs=await firestoreDb.collection('weddingDraftCleanup').where('state','==','artwork_pending').limit(1).get();let deleted=0;
  for(const job of jobs.docs){const projectId=String(job.data().projectId),ref=weddingProjectRef(projectId),project=(await ref.get()).data() as WeddingProject|undefined;
    if(!project?.deletedAt||project.purchasedCount||project.activeBatchId||Object.keys(project.paidHouseholds||{}).length)continue;
    let blocked=false;
    const assets=await ref.collection('artwork').limit(20).get(),prefix=`wedding-normalized/staging/${weddingHash(projectId).slice(0,32)}/`;
    for(const asset of assets.docs){const data=asset.data();if(data.projectId!==projectId||data.policy!=='wedding-raster-v1'||data.verdict!=='accepted_for_import'){blocked=true;continue;}
      const paths=[...new Set<string>([data.storageKey,data.sourceKey])];if(paths.some(key=>typeof key!=='string'||!key.startsWith(prefix)||!/^[a-f0-9]{64}\.png$/.test(key.slice(prefix.length)))){blocked=true;continue;}
      const removeObject=remove||(await import('./artwork-storage')).weddingArtworkObjects.removeOrphan!;
      for(const key of paths)await removeObject(key);
      await asset.ref.delete();deleted++;
    }
    if(blocked)await job.ref.set({state:'operator_review',reason:'invalid_artwork_scope'},{merge:true});
    else if(assets.size<20)await job.ref.set({state:'complete',completedAt:Date.now()},{merge:true});
  }
  return {deleted};
}
