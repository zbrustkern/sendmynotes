import {firestoreDb} from '../firebase-admin';
import {blankWeddingAddress,WEDDING_DAY,type WeddingProject} from './domain';
import {weddingHash} from './hash';
import {weddingProjectRef} from './server';
import {digest, type WeddingQuoteLine} from './finance';
import {ARTWORK_LIMITS, ARTWORK_POLICY} from './artwork-policy';
import {FINANCIAL_FACTS_COLLECTION} from '../financial-ledger';

const AI_PAGE_SIZE = 10;
const MAX_HOUSEHOLDS = 250;
const GRACE_MS = 7 * WEDDING_DAY;
type Stored = FirebaseFirestore.DocumentData;
type Tx = FirebaseFirestore.Transaction;
type Ref = FirebaseFirestore.DocumentReference;

function expiredAndUnlocked(project: Stored | undefined, at: number) {
  return !!project && Number.isFinite(project.expiresAt) && project.expiresAt <= at - GRACE_MS &&
    !project.activeBatchId && !project.paymentReconciliationRequired && !project.checkoutRevocationRequestedFor &&
    !project.checkoutActorId && !project.activeHouseholdIds?.length;
}

function paidDraftsRetired(project: Stored) {
  return project.draftRetentionVersion === 2 && project.draftsPurgedAt > 0 &&
    project.retentionCheckedFor === project.expiresAt && project.purchasedCount > 0;
}

function settledOrCanceled(batch: Stored) {
  if (batch.refundReservedCents !== 0 || batch.dueAt != null) return false;
  if (batch.status === 'canceled') return batch.capturedCents === 0 && batch.refundedCents === 0;
  return batch.status === 'held' && batch.settledAt > 0 && /^pi_[\w-]+$/.test(batch.paymentIntentId) &&
    Number.isSafeInteger(batch.capturedCents) && batch.capturedCents > 0 &&
    Number.isSafeInteger(batch.refundedCents) && batch.refundedCents >= 0 && batch.refundedCents <= batch.capturedCents &&
    batch.quote?.totalCents === batch.capturedCents && batch.preparedCount === batch.quote.count &&
    batch.completedCount === batch.quote.count;
}

// A lost project lock must not hide an open intent. A capped query also finds
// settled orders that are missing entirely from the project's paid map.
const projectBatches = (ref: Ref) => firestoreDb.collection('weddingBatches')
  .where('projectId', '==', ref.id).limit(MAX_HOUSEHOLDS + 1);

async function canDrainRetiredDrafts(tx: Tx, ref: Ref, at: number) {
  const project = (await tx.get(ref)).data();
  if (!project || !expiredAndUnlocked(project, at)) return false;
  if (project.deletedAt) return !project.purchasedCount && !Object.keys(project.paidHouseholds ?? {}).length;
  if (!paidDraftsRetired(project)) return false;
  const batches = await tx.get(projectBatches(ref));
  return batches.size <= MAX_HOUSEHOLDS && batches.docs.every(doc => settledOrCanceled(doc.data()));
}

async function verifyPaidHistory(tx: Tx, ref: Ref, project: Stored, rows: FirebaseFirestore.QuerySnapshot) {
  const ledger = project.paidHouseholds ?? {};
  if (project.id !== ref.id || !Number.isSafeInteger(project.purchasedCount) || Array.isArray(ledger) ||
      typeof ledger !== 'object' || Object.keys(ledger).length !== project.purchasedCount ||
      project.householdCount !== rows.size || rows.size > MAX_HOUSEHOLDS) return 'household_ledger_mismatch';
  const rowIds = new Set(rows.docs.map(doc => doc.id));
  if (Object.keys(ledger).some(id => !rowIds.has(id)) || rows.docs.some(doc => {
    const row = doc.data();
    return row.id !== doc.id || (row.paidBatchId && row.paidBatchId !== ledger[doc.id]) ||
      ((row.paymentStatus || row.refundStatus) && !Object.hasOwn(ledger, doc.id));
  })) return 'household_ledger_mismatch';

  const batches = await tx.get(projectBatches(ref));
  if (batches.size > MAX_HOUSEHOLDS) return 'order_history_limit';
  const accounted = new Set<string>(), ordinals = new Set<number>();
  for (const doc of batches.docs) {
    const batch = doc.data();
    if (!settledOrCanceled(batch)) return 'payment_unresolved';
    if (batch.id !== doc.id) return 'batch_identity_mismatch';
    if (batch.status === 'canceled') continue;
    const {id: quoteId, ...quote} = batch.quote;
    const lines = quote.lines as WeddingQuoteLine[];
    if (!Array.isArray(lines) || !lines.length || lines.length > 100 || quote.count !== lines.length ||
        lines.length + accounted.size > project.purchasedCount || digest([ref.id, quote]) !== quoteId ||
        quote.currency !== 'USD' || !Number.isSafeInteger(quote.previouslyPurchased)) return 'quote_mismatch';
    const [factDoc, children, pinDoc] = await Promise.all([
      tx.get(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION).doc('fact_cap_' + batch.paymentIntentId)),
      tx.get(doc.ref.collection('cards').limit(lines.length + 1)),
      tx.get(ref.collection('artworkPins').doc(doc.id)),
    ]);
    const fact = factDoc.data();
    if (!fact || fact.factType !== 'capture' || fact.operationId !== doc.id || fact.providerObjectId !== batch.paymentIntentId ||
        fact.amountCents !== batch.capturedCents || fact.currency !== 'usd' || fact.livemode !== false) return 'capture_fact_mismatch';
    if (children.size !== lines.length) return 'frozen_card_missing';
    const cards = new Map(children.docs.map(child => [child.id, child.data()]));
    let total = 0;
    for (const [index, line] of lines.entries()) {
      const id = line?.householdId, child = cards.get(id), card = child?.card;
      if (!card || card.householdId !== id || !child?.line || digest(card) !== line.contentHash ||
          digest(child.line) !== digest(line) || ['reserved','pending'].includes(child.refundStatus)) return 'frozen_card_mismatch';
      if (ledger[id] !== doc.id || accounted.has(id) || ordinals.has(line.ordinal) ||
          line.ordinal !== quote.previouslyPurchased + index + 1 || line.ordinal < 1 || line.ordinal > project.purchasedCount) return 'paid_ordinal_mismatch';
      if (card.cover?.kind === 'upload') {
        const pin = pinDoc.data(), retained = batch.artPin;
        const expected = 'wedding-paid-retained/staging/' + weddingHash(ref.id).slice(0,32) + '/' + doc.id + '.png';
        if (!pin || !retained || pin.status !== 'ready' || pin.batchId !== doc.id || pin.projectId !== ref.id ||
            pin.storageKey !== expected || retained.storageKey !== expected || pin.id !== card.cover.id ||
            retained.id !== pin.id || !/^[a-f0-9]{64}$/.test(pin.sha256) || retained.sha256 !== pin.sha256 ||
            card.cover.hash !== pin.sha256) return 'paid_master_mismatch';
      } else if (card.cover?.kind !== 'preset' || batch.artPin || pinDoc.exists) return 'paid_master_mismatch';
      accounted.add(id);
      ordinals.add(line.ordinal);
      total += line.totalCents;
    }
    if (total !== batch.capturedCents) return 'capture_total_mismatch';
  }
  return accounted.size === project.purchasedCount ? null : 'paid_batch_missing';
}

// A paid project can be reopened. Detach its draft assets in the retirement
// transaction, then let the existing artwork collector check for re-use under
// the same lease used by new uploads before deleting any normalized bytes.
function detachDraftArtwork(tx: Tx, ref: Ref, assets: FirebaseFirestore.QuerySnapshot, at: number) {
  const segment = weddingHash(ref.id).slice(0,32);
  const keys = new Set<string>();
  for (const doc of assets.docs) {
    const asset = doc.data();
    if (asset.id !== doc.id || asset.projectId !== ref.id || asset.policy !== ARTWORK_POLICY ||
        asset.verdict !== 'accepted_for_import') return false;
    for (const [sha, key] of [[asset.sha256,asset.storageKey],[asset.sourceSha256,asset.sourceKey]]) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha) || key !== `wedding-normalized/staging/${segment}/${sha}.png`) return false;
      keys.add(key);
    }
  }
  const normalizedKeys = [...keys];
  for (let i = 0; i < normalizedKeys.length; i += 20) {
    const jobId = 'retention_' + weddingHash(`${ref.id}:${at}:${i}`);
    tx.create(firestoreDb.collection('weddingArtworkJobs').doc('staging_' + jobId), {
      jobId, projectId: ref.id, policy: ARTWORK_POLICY, pendingExpiresAt: at, createdAt: at,
      pendingKey: `wedding-pending/staging/${segment}/${jobId}.bin`, normalizedKeys: normalizedKeys.slice(i,i+20),
    });
  }
  assets.docs.forEach(doc => tx.delete(doc.ref));
  return true;
}

// Reconciliation reads the original job, including run, deviceId and item IDs.
// A lease deadline alone never establishes the outcome of a provider call.
function retainAiJob(job: FirebaseFirestore.DocumentData, fenced: boolean) {
  return fenced || Boolean(job.reconciliation) ||
    !['queued', 'partial', 'ready', 'retryable', 'failed', 'canceled'].includes(job.status) ||
    (job.run != null && !['complete', 'rejected'].includes(job.run.state));
}

function aiJobMetadata(job: FirebaseFirestore.DocumentData) {
  const {headers, excerpt, prompt, result, assetId, items, ...metadata} = job;
  return {
    ...metadata,
    items: (items ?? []).map(({gift, memory, text, ...item}: FirebaseFirestore.DocumentData) => item),
  };
}

async function cleanupRetiredAi(projectRef: FirebaseFirestore.DocumentReference, at: number) {
  const progress = firestoreDb.collection('weddingDraftCleanup').doc(projectRef.id);
  const budget = firestoreDb.collection('weddingAiBudgets').doc(`project_${weddingHash(projectRef.id)}`);
  return firestoreDb.runTransaction(async tx => {
    const counts = {jobsArchived: 0, jobsRedacted: 0, receiptsDeleted: 0};
    if (!await canDrainRetiredDrafts(tx, projectRef, at)) return counts;

    const [cursor, budgetSnapshot] = await Promise.all([tx.get(progress), tx.get(budget)]);
    const fenced = new Set((budgetSnapshot.data()?.inflight ?? []).map((call: {jobId: string}) => call.jobId));
    // Ordering by document ID allows a cursor to outlive a deleted receipt.
    // Wrap at the end to revisit late finishes, reconciliation, and future expiries.
    function page(collection: string, after?: string) {
      let query = projectRef.collection(collection).orderBy('__name__');
      if (after) query = query.startAfter(after);
      return tx.get(query.limit(AI_PAGE_SIZE));
    }
    const last = cursor.data();
    const [jobs, receipts] = await Promise.all([
      page('aiJobs', last?.aiJobAfter), page('aiRequests', last?.aiReceiptAfter),
    ]);
    const jobData = new Map(jobs.docs.map(doc => [doc.id, doc.data()]));
    const expired = (data: FirebaseFirestore.DocumentData) => Number.isFinite(data.expiresAt) && data.expiresAt <= at;
    const expiredReceipts = receipts.docs.filter(doc => expired(doc.data()) &&
      typeof doc.data().jobId === 'string' && /^[\w-]{1,128}$/.test(doc.data().jobId));
    const missingIds = new Set(expiredReceipts.map(doc => doc.data().jobId as string).filter(id => !jobData.has(id)));
    await Promise.all(Array.from(missingIds, async id => {
      const snapshot = await tx.get(projectRef.collection('aiJobs').doc(id));
      if (snapshot.exists) jobData.set(id, snapshot.data()!);
    }));

    for (const doc of jobs.docs) {
      const job = doc.data();
      if (!expired(job) || job.projectId !== projectRef.id || job.id !== doc.id) continue;
      const metadata = aiJobMetadata(job);
      if (retainAiJob(job, fenced.has(doc.id))) {
        if (['headers', 'excerpt', 'prompt', 'result', 'assetId'].some(key => key in job) ||
            job.items?.some((item: object) => 'gift' in item || 'memory' in item || 'text' in item)) {
          tx.set(doc.ref, metadata);
          counts.jobsRedacted++;
        }
      } else {
        // Keep consent, provider, outcome and accounting evidence after retiring the job.
        tx.set(projectRef.collection('aiJobAudit').doc(doc.id), metadata);
        tx.delete(doc.ref);
        counts.jobsArchived++;
      }
    }
    for (const doc of expiredReceipts) {
      const id = doc.data().jobId as string;
      const job = jobData.get(id);
      // Receipts contain hashes and replay IDs only. Preserve them for any fenced call.
      if (fenced.has(id) || (job && (job.projectId !== projectRef.id || job.id !== id ||
          !expired(job) || retainAiJob(job, false)))) continue;
      tx.delete(doc.ref);
      counts.receiptsDeleted++;
    }
    const aiJobAfter = jobs.size === AI_PAGE_SIZE ? jobs.docs[jobs.size - 1].id : null;
    const aiReceiptAfter = receipts.size === AI_PAGE_SIZE ? receipts.docs[receipts.size - 1].id : null;
    if (aiJobAfter !== (last?.aiJobAfter ?? null) || aiReceiptAfter !== (last?.aiReceiptAfter ?? null)) {
      tx.set(progress, {aiJobAfter, aiReceiptAfter}, {merge: true});
    }
    return counts;
  });
}

/** Retire editable materials only after proving any paid history independently
 * from the project ledger. All payment and order namespaces stay read-only. */
export async function cleanupWeddingDrafts(at=Date.now(),limit=10) {
  const bound=Math.max(1,Math.min(limit,10));
  const cursorRef=firestoreDb.collection('weddingRetentionControl').doc('drafts'),cursor=(await cursorRef.get()).data();
  let query=firestoreDb.collection('weddingProjects').where('expiresAt','<=',at-7*WEDDING_DAY).orderBy('expiresAt');
  if(cursor?.id){const last=await weddingProjectRef(cursor.id).get();if(last.exists)query=query.startAfter(last);}
  const page=await query.limit(bound).get();
  let purged=0,held=0;
  const ai = {jobsArchived: 0, jobsRedacted: 0, receiptsDeleted: 0, networkSignalsDeleted: 0};
  for(const doc of page.docs){
    const result = await firestoreDb.runTransaction(async tx => {
      const ref = doc.ref, project = (await tx.get(ref)).data();
      if (!project || project.deletedAt || !Number.isFinite(project.expiresAt) || project.expiresAt > at - GRACE_MS) return 'skip';
      if (!expiredAndUnlocked(project, at)) return 'held';
      const progress = firestoreDb.collection('weddingDraftCleanup').doc(ref.id);
      const review = (reason: string) => {
        tx.set(progress, {projectId: ref.id, state: 'operator_review', reason, checkedExpiry: project.expiresAt}, {merge: true});
        return 'held';
      };
      // Older sweeps wrote retentionCheckedFor even when they kept all drafts.
      if (paidDraftsRetired(project)) {
        const queue = (await tx.get(progress)).data();
        if (queue?.state === 'source_deferred' && await canDrainRetiredDrafts(tx, ref, at)) tx.update(progress, {state: 'pending'});
        return 'retired';
      }
      const rows = await tx.get(ref.collection('households').limit(MAX_HOUSEHOLDS + 1));
      const reason = await verifyPaidHistory(tx, ref, project, rows);
      if (reason) return review(reason);
      const paid = project.purchasedCount > 0;
      if (paid) {
        const budgetRef = ref.collection('artworkControl').doc('budget');
        const [assets, budgetDoc] = await Promise.all([
          tx.get(ref.collection('artwork').limit(ARTWORK_LIMITS.revisionCount + 1)), tx.get(budgetRef),
        ]);
        const budget = budgetDoc.data();
        if (budget?.reservedBytes || Object.values(budget?.leases ?? {}).some(until => Number(until) > at)) return 'held';
        if (assets.size > ARTWORK_LIMITS.revisionCount || !detachDraftArtwork(tx, ref, assets, at)) return review('invalid_draft_artwork');
        if (budgetDoc.exists) tx.update(budgetRef, {assets: 0, bytes: 0, sources: {}});
      }
      for (const row of rows.docs) {
        const batchId = project.paidHouseholds?.[row.id];
        if (!batchId) tx.delete(row.ref);
        else {
          // Keep the paid tracker row, delivery/refund state, and approval hash.
          // The immutable child card is the authority for ordered wording and art.
          const {sourceHouseholdId, ...tracker} = row.data();
          tx.set(row.ref, {...tracker, paidBatchId: batchId, gift: '', memory: '', provenance: [], pendingAddress: null});
        }
      }
      tx.set(progress, {projectId: ref.id, createdAt: at, expiresAt: project.expiresAt, importsPending: true,
        artworkPolicy: paid ? 'detached_draft_artwork' : 'expire_draft_artwork', state: 'pending'});
      tx.update(ref, {sharedBody: '', signOff: '', templates: [], returnAddress: {...blankWeddingAddress(), firstName: '', lastName: ''},
        cover: {kind: 'preset', id: 'preset-thankyou-botanical', url: '/presets/thank-you-botanical.jpg'},
        householdCount: project.purchasedCount, revision: project.revision + 1, updatedAt: at, draftsPurgedAt: at,
        retentionCheckedFor: project.expiresAt, draftRetentionVersion: 2, ...(paid ? {} : {deletedAt: at})});
      return 'purged';
    });
    if(result==='purged')purged++;if(result==='held')held++;
    if (result === 'purged' || result === 'retired' || doc.data().deletedAt) {
      const cleaned = await cleanupRetiredAi(doc.ref, at);
      ai.jobsArchived += cleaned.jobsArchived;
      ai.jobsRedacted += cleaned.jobsRedacted;
      ai.receiptsDeleted += cleaned.receiptsDeleted;
    }
  }
  await cursorRef.set({id:page.size===bound?page.docs[page.docs.length-1].id:null});
  // Expired credentials contain only scoped identifiers. Revocation/expiry is
  // checked before every read even when cleanup is delayed.
  let credentials=0;
  for(const name of ['weddingSessions','weddingAddressSessions','weddingInvites','weddingStartLimits','weddingPilotIssueLimits','weddingAccountSessionLimits']){
    credentials+=await firestoreDb.runTransaction(async tx=>{const expired=await tx.get(firestoreDb.collection(name).where('expiresAt','<=',at).limit(100));expired.docs.forEach(row=>tx.delete(row.ref));return expired.size;});
  }
  ai.networkSignalsDeleted = await firestoreDb.runTransaction(async tx => {
    const expired = await tx.get(firestoreDb.collection('weddingAiNetworkSignals').where('expiresAt', '<=', at).limit(100));
    expired.docs.forEach(doc => tx.delete(doc.ref));
    return expired.size;
  });
  return {scanned:page.size,purged,held,credentials,ai};
}
/** Each invocation advances source-record deletion for a single queued project.
 * Artwork is deliberately handed to its owning service through the durable queue. */
export async function cleanupWeddingSourceRecords(_limit=1) {
  const jobs = await firestoreDb.collection('weddingDraftCleanup').where('state','==','pending').limit(1).get();
  const job = jobs.docs[0];
  if (!job) return {deleted: 0};
  const deleted = await firestoreDb.runTransaction(async tx => {
    const current = (await tx.get(job.ref)).data();
    if (!current || current.state !== 'pending' || current.projectId !== job.id) return 0;
    const ref = weddingProjectRef(job.id);
    if (!await canDrainRetiredDrafts(tx, ref, Date.now())) {
      // Renewal or a refund can race this page. A later eligible sweep resumes it.
      tx.update(job.ref, {state: 'source_deferred'});
      return 0;
    }
    const imports = await tx.get(ref.collection('imports').limit(1));
    const item = imports.docs[0];
    if (!item) {
      tx.update(job.ref, {importsPending: false, state: current.artworkPolicy === 'detached_draft_artwork' ? 'complete' : 'artwork_pending'});
      return 0;
    }
    const [rows, pages] = await Promise.all([tx.get(item.ref.collection('rows').limit(251)), tx.get(item.ref.collection('pages').limit(14))]);
    if (rows.size > 250 || pages.size > 13) {
      tx.update(job.ref, {state: 'operator_review', reason: 'import_receipt_limit'});
      return 0;
    }
    [...rows.docs, ...pages.docs].forEach(row => tx.delete(row.ref));
    tx.delete(item.ref);
    return rows.size + pages.size + 1;
  });
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
