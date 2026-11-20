import { createHash } from 'node:crypto';
import { firestoreDb, isFirestoreMock } from '../firebase-admin';
import { resolveWeddingNote, weddingResolvedFields, type WeddingActor, type WeddingProject, type WeddingHousehold } from './domain';
import { analyzeHandwryttenFit } from '../handwrytten-text-policy';
import { assertWeddingActorInTransaction, weddingIdentity, WeddingError } from './server';
import { createWeddingAiProvider, WeddingAiProviderError, type WeddingAiProvider, type WeddingAiProviderInfo } from './ai-provider';
import { readWeddingArtwork, storeWeddingGeneratedArtwork } from './artwork';
import { WEDDING_AI_LIMITS as L, WEDDING_AI_POLICY, WeddingAiError, aiId, aiInstructionLike, prepareWeddingAiDraftFields, validateWeddingDraftOutput, validateWeddingMapOutput, type WeddingAiDraftInput, type WeddingAiRequest, type WeddingAiResult, type WeddingAiFeature, type WeddingAiTone, type WeddingAiDraftSuggestion } from './ai-schema';
import type { FieldMapping } from './import-contract';

const hash = (input: string) => createHash('sha256').update(input).digest('hex');
type AIProject = WeddingProject & { activeHouseholdIds?: string[]; paidHouseholds?: Record<string,string> };
type Item = WeddingAiDraftInput & { householdId: string; revision: number; contextHash: string; state: 'pending'|'complete'|'skipped'|'failed'; text?: string; reason?: string };
type Status = 'queued'|'running'|'partial'|'ready'|'retryable'|'failed'|'unresolved'|'canceled';
type Run = { id: string; ids: string[]; startedAt: number; deadline: number; state: 'running'|'complete'|'rejected'|'unresolved'; attempts: number };
type Job = {
  id: string; projectId: string; actorId: string; deviceId: string; action: WeddingAiFeature;
  inputHash: string; provider: WeddingAiProviderInfo; policy: string; status: Status;
  createdAt: number; updatedAt: number; expiresAt: number; estimatedCents: number;
  consents: Record<string, { policy: string; at: number; inputHash: string }>;
  items: Item[]; tone: WeddingAiTone; handwriting?: string; headers?: string[]; excerpt?: string; prompt?: string; assetId?: string;
  requiresVerified: boolean; run: Run|null; completedCalls: number; retryIds?: string[]; retryCount: number;
  error?: string; result?: WeddingAiResult; canceledAt?: number;
  reconciliation?: {runId:string;decision:string;evidenceHash:string;at:number;operatorUid:string};
};
type Event = { at: number; draft: number; map: number; image: number; cents: number };
type Inflight = { jobId: string; callId: string; deadline: number };
type Budget = { events: Event[]; inflight: Inflight[] };
type Limits = { projectCents: number; deploymentCents: number; deviceCents: number; deploymentJobs: number; deviceJobs: number; deploymentCalls: number; draftCents: number; mapCents: number; imageCents: number; deploymentDraftCents: number; deploymentMapCents: number; deploymentImageCents: number };
export type WeddingAiContext = { actor: WeddingActor; deviceId: string; networkSignal?: string; signal: AbortSignal; reauthorize: () => Promise<WeddingActor> };
type Dependencies = {
  provider?: WeddingAiProvider; now?: () => number;
  readArtwork?: typeof readWeddingArtwork; storeArtwork?: typeof storeWeddingGeneratedArtwork;
  /** Direct tests only. There is deliberately no environment flag or API input to enable this. */
  testRuntime?: boolean;
};
function envInt(name: string, fallback: number, max: number): number {
  const value = process.env[name]; if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(+value) || +value > max) throw new WeddingAiError('ai_config', 'AI is temporarily unavailable. Keep working manually.', 503);
  return +value;
}
function limits(): Limits {
  const config = {
    projectCents:envInt('WEDDING_AI_PROJECT_CENTS_24H',1500,100_000),
    deploymentCents:envInt('WEDDING_AI_DEPLOYMENT_CENTS_24H',100_000,1_000_000),
    deviceCents:envInt('WEDDING_AI_DEVICE_CENTS_24H',3000,100_000),
    deploymentJobs:envInt('WEDDING_AI_DEPLOYMENT_JOBS_24H',2000,20_000),
    deviceJobs:envInt('WEDDING_AI_DEVICE_JOBS_24H',30,200),
    deploymentCalls:envInt('WEDDING_AI_DEPLOYMENT_CONCURRENCY',20,100),
    draftCents:envInt('WEDDING_AI_DRAFT_CALL_CENTS',10,10_000),
    mapCents:envInt('WEDDING_AI_MAP_CALL_CENTS',10,10_000),
    imageCents:envInt('WEDDING_AI_IMAGE_CALL_CENTS',100,10_000),
    deploymentDraftCents:envInt('WEDDING_AI_DEPLOYMENT_DRAFT_CENTS_24H',50_000,1_000_000),
    deploymentMapCents:envInt('WEDDING_AI_DEPLOYMENT_MAP_CENTS_24H',10_000,1_000_000),
    deploymentImageCents:envInt('WEDDING_AI_DEPLOYMENT_IMAGE_CENTS_24H',50_000,1_000_000),
  };
  if (!config.draftCents || !config.mapCents || !config.imageCents) throw new WeddingAiError('ai_config','Provider cost reservations must be positive.',503);
  return config;
}
const paused = () => process.env.WEDDING_AI_PAUSED === 'true';
const pilotOnly = () => process.env.WEDDING_AI_PILOT_ONLY === 'true';
const verifiedOnly = (action: string) => (process.env.WEDDING_AI_VERIFIED_ONLY || '').split(',').map(v=>v.trim()).includes(action);
function budget(value: unknown, now: number): Budget {
  const b = value as Budget|undefined;
  // Uncertain calls NEVER disappear when a lease or quota window expires.
  return { events:(b?.events || []).filter(e=>e.at > now-L.dayMs), inflight:b?.inflight || [] };
}
const count = (b: Budget, key: keyof Event) => b.events.reduce((sum,event)=>sum+event[key],0);
function sourceHash(project: AIProject, row: WeddingHousehold) {
  return hash(JSON.stringify({ revision:row.revision, fields:weddingResolvedFields(project,row), gift:row.gift, memory:row.memory, insideName:row.insideName, insideNameConfirmed:row.insideNameConfirmed, greetingNeedsReview:row.greetingNeedsReview || false }));
}
function mutableRow(project: AIProject, row: WeddingHousehold | undefined): row is WeddingHousehold {
  return !!row && !row.paidBatchId && !project.paidHouseholds?.[row.id] && !row.excluded && !(project.activeBatchId && (!project.activeHouseholdIds || project.activeHouseholdIds.includes(row.id))) && !project.paymentReconciliationRequired;
}
function minimalInput(project: AIProject, row: WeddingHousehold, index: number): Item {
  const { greeting, signOff } = weddingResolvedFields(project,row);
  const maxChars = Math.min(400, 450 - [greeting,signOff].filter(Boolean).reduce((n,s)=>n+s.length+2,0));
  const {gift,memory} = prepareWeddingAiDraftFields(row,project.returnAddress);
  const unsafe = aiInstructionLike(gift) || aiInstructionLike(memory);
  const greetingMissing = row.greeting === null && (!row.insideNameConfirmed || !row.insideName.trim()) || row.greetingNeedsReview;
  const reason = unsafe ? 'manual_review_required' : greetingMissing ? 'greeting_review_required' : maxChars < 30 ? 'note_too_long' : gift.length > 300 || memory.length > 400 ? 'input_too_long' : undefined;
  return { id:`r${index+1}`,householdId:row.id,revision:row.revision,contextHash:sourceHash(project,row),gift:reason ? '' : gift,memory:reason ? '' : memory,maxChars:Math.max(0,maxChars),state:reason?'skipped':'pending',...(reason?{reason}:{}) };
}
function safeInput(item: Item): WeddingAiDraftInput { return { id:item.id,gift:item.gift,memory:item.memory,maxChars:item.maxChars }; }
function gate(actor: WeddingActor, feature: WeddingAiFeature, requireVerified = false) {
  if (pilotOnly() && !actor.pilot) throw new WeddingAiError('pilot_required', 'An active staging tester invitation is required.', 403);
  if (paused()) throw new WeddingAiError('ai_paused', 'AI is paused. You can keep writing and mapping manually.', 503);
  if (!actor.verified || ((requireVerified || verifiedOnly(feature)) && !actor.verified)) {
    throw new WeddingAiError('ai_sign_in_required', 'Sign in with a verified account to use AI writing and artwork tools. Your current cards are saved.', 401);
  }
}
function aborted(signal: AbortSignal) { if (signal.aborted) throw new WeddingAiError('request_canceled','This request was canceled. Your existing work is saved.',408); }

export function createWeddingAiService(deps: Dependencies = {}) {
  const provider = deps.provider || createWeddingAiProvider(), now = deps.now || Date.now;
  const readArtwork = deps.readArtwork || readWeddingArtwork, storeArtwork = deps.storeArtwork || storeWeddingGeneratedArtwork;
  const jobRef = (projectId: string,id: string) => firestoreDb.collection('weddingProjects').doc(projectId).collection('aiJobs').doc(id);
  const receiptRef = (projectId: string,key: string) => firestoreDb.collection('weddingProjects').doc(projectId).collection('aiRequests').doc(hash(key));
  const budgetRefs = (projectId: string,deviceId: string) => [
    firestoreDb.collection('weddingAiBudgets').doc(`project_${hash(projectId)}`),
    firestoreDb.collection('weddingAiBudgets').doc(`device_${hash(deviceId)}`),
    firestoreDb.collection('weddingAiBudgets').doc('deployment'),
  ];
  function runtime() {
    if (deps.testRuntime && process.env.NODE_ENV === 'test') return;
    if (isFirestoreMock || provider.info.mode === 'synthetic-test') throw new WeddingAiError('durable_store_required','AI needs the private staging service. You can keep working manually.',503);
  }
  async function fresh(ctx: WeddingAiContext) {
    const actor = await ctx.reauthorize();
    if (actor.projectId !== ctx.actor.projectId || actor.actorId !== ctx.actor.actorId) throw new WeddingAiError('access_changed','Open the current private project again.',403);
    return actor;
  }
  async function authorizedTx(tx: FirebaseFirestore.Transaction, actor: WeddingActor) {
    const authorized = await assertWeddingActorInTransaction(tx,actor);
    if (pilotOnly() && actor.pilotInviteId) {
      const invite = (await tx.get(firestoreDb.collection('weddingInvites').doc(actor.pilotInviteId))).data();
      if (!invite || invite.revoked || invite.expiresAt<=now() || invite.kind!=='pilot' || invite.consumedProjectId!==actor.projectId) throw new WeddingAiError('pilot_required','An active staging tester invitation is required.',403);
    }
    return authorized;
  }
  async function reserve(ctx: WeddingAiContext, request: Exclude<WeddingAiRequest,{action:'advance'|'cancel'}>) {
    runtime(); aborted(ctx.signal);
    const actor = await fresh(ctx); gate(actor,request.action);
    if (!provider.info.available) throw new WeddingAiError('provider_unavailable','AI is unavailable. You can keep writing and mapping manually.',503);
    // A selected candidate need not replace the accepted front before treatment.
    // The helper authorizes immutable, normalized bytes in this project only.
    if (request.action==='image' && request.assetId) await readArtwork(actor.projectId,request.assetId);
    const inputHash = hash(JSON.stringify({ actorId:actor.actorId,request,policy:WEDDING_AI_POLICY }));
    const id = `ai_${hash(`${actor.projectId}:${request.idempotencyKey}`).slice(0,40)}`;
    return firestoreDb.runTransaction(async tx => {
      const receipt = (await tx.get(receiptRef(actor.projectId,request.idempotencyKey))).data();
      const {project:rawProject} = await authorizedTx(tx,actor);
      const project = rawProject as AIProject;
      if (project.expiresAt <= now()) throw new WeddingAiError('project_expired','Extend this project before requesting AI help.',410);
      if (receipt) {
        if (receipt.inputHash !== inputHash || receipt.actorId !== actor.actorId || receipt.action !== request.action) throw new WeddingAiError('idempotency_conflict','This key belongs to a different request.',409);
        const job = (await tx.get(jobRef(actor.projectId,receipt.jobId))).data() as Job|undefined;
        if (!job) throw new WeddingAiError('job_missing','This job is no longer available. Keep working manually.',404);
        return {job,replay:true};
      }
      const rowDocs = request.action === 'draft' ? await Promise.all(request.ids.map(id=>tx.get(firestoreDb.collection('weddingProjects').doc(actor.projectId).collection('households').doc(id)))) : [];
      const rows = rowDocs.map(doc=>doc.data() as WeddingHousehold|undefined);
      if (rows.some(row=>!mutableRow(project,row))) throw new WeddingAiError('invalid_selection','Choose unpaid, editable households in this project.',409);
      const refs = budgetRefs(actor.projectId,ctx.deviceId), snapshots = await Promise.all(refs.map(ref=>tx.get(ref))), budgets = snapshots.map(doc=>budget(doc.data(),now())), [p,d,g] = budgets;
      const networkRef = ctx.networkSignal ? firestoreDb.collection('weddingAiNetworkSignals').doc(hash(ctx.networkSignal)) : null;
      const network = networkRef ? (await tx.get(networkRef)).data() : null;
      const networkAttempts = ((network?.attempts || []) as number[]).filter(at=>at>now()-600_000);
      const config = limits(), units = request.action === 'draft' ? request.ids.length : 1;
      if (count(p,request.action)+units > L[request.action === 'draft'?'drafts':request.action === 'map'?'maps':'images']) throw new WeddingAiError('project_quota','Your project allowance is used for now. Keep working manually; check the reset time.',429);
      const requiresVerified = request.action === 'image' && count(p,'image') >= 2;
      gate(actor,request.action,requiresVerified);
      // A shared IP alone never requires sign-in. Combine a busy network with
      // repeated requests on this device; hard aggregate ceilings still apply.
      if (networkAttempts.length>=20 && d.events.length>=10 && !actor.verified) throw new WeddingAiError('ai_sign_in_required','Sign in to continue this AI request. Your current card and words are saved.',401);
      if (networkAttempts.length>=200) throw new WeddingAiError('network_request_limit','AI requests are busy on this network. Keep working manually and retry shortly.',429);
      if (d.events.length >= config.deviceJobs || g.events.length >= config.deploymentJobs || count(d,'draft')+(request.action==='draft'?units:0)>200 || count(d,'map')+(request.action==='map'?1:0)>8 || count(d,'image')+(request.action==='image'?1:0)>6) throw new WeddingAiError('submission_limit','The request allowance is used for now. Keep working manually.',429);
      const estimatedCents = 2 * (request.action === 'draft' ? Math.ceil(units/L.chunk)*config.draftCents : request.action === 'map' ? config.mapCents : config.imageCents);
      const featureSpend = g.events.filter(event=>event[request.action]>0).reduce((n,event)=>n+event.cents,0);
      const featureCap = request.action==='draft'?config.deploymentDraftCents:request.action==='map'?config.deploymentMapCents:config.deploymentImageCents;
      if ([p,d,g].some((b,i)=>count(b,'cents')+estimatedCents>[config.projectCents,config.deviceCents,config.deploymentCents][i]) || featureSpend+estimatedCents>featureCap) throw new WeddingAiError('spend_limit','AI’s hard allowance is used for now. Keep working manually.',429);
      // Any unresolved call for this project fences replacement requests even when the user changes keys.
      if (p.inflight.some(call=>call.deadline < now())) throw new WeddingAiError('provider_outcome_unknown','An earlier AI request needs reconciliation before another paid request.',409);
      const time = now();
      const job: Job = {
        id,projectId:actor.projectId,actorId:actor.actorId,deviceId:ctx.deviceId,action:request.action,inputHash,provider:provider.info,policy:WEDDING_AI_POLICY,
        status:'queued',createdAt:time,updatedAt:time,expiresAt:project.expiresAt,estimatedCents,
        consents:{[hash(actor.actorId)]:{policy:WEDDING_AI_POLICY,at:time,inputHash}},
        items:rows.map((row,index)=>minimalInput(project,row!,index)),tone:request.action==='draft'?request.tone:'warm',handwriting:project.handwriting,requiresVerified,run:null,completedCalls:0,retryCount:0,
        ...(request.action==='map' && request.headers ? {headers:request.headers} : {}),
        ...(request.action==='map' && request.excerpt ? {excerpt:request.excerpt} : {}),
        ...(request.action==='image' ? {prompt:request.prompt,...(request.assetId?{assetId:request.assetId}:{})} : {}),
      };
      const event: Event = {at:time,draft:request.action==='draft'?units:0,map:request.action==='map'?1:0,image:request.action==='image'?1:0,cents:estimatedCents};
      refs.forEach((ref,index)=>tx.set(ref,{...budgets[index],events:[...budgets[index].events,event]}));
      if(networkRef)tx.set(networkRef,{attempts:[...networkAttempts,time],expiresAt:time+600_000});
      tx.create(jobRef(actor.projectId,id),job);
      tx.create(receiptRef(actor.projectId,request.idempotencyKey),{jobId:id,actorId:actor.actorId,action:request.action,inputHash,at:time,expiresAt:project.expiresAt});
      return {job,replay:false};
    });
  }

  async function load(ctx: WeddingAiContext,id: string): Promise<Job> {
    const actor = await fresh(ctx);
    const doc = await jobRef(actor.projectId,id).get(), job = doc.data() as Job|undefined;
    if (!job || job.projectId!==actor.projectId) throw new WeddingAiError('job_not_found','This job could not be found in your project.',404);
    return job;
  }
  async function presentation(ctx: WeddingAiContext,job: Job): Promise<WeddingAiResult> {
    if (job.action !== 'draft') {
      if (job.status==='ready' && job.result) return job.result;
      if (job.status==='canceled') return {jobId:job.id,canceled:true};
      throw jobError(job);
    }
    const ref = firestoreDb.collection('weddingProjects').doc(ctx.actor.projectId);
    const project = (await ref.get()).data() as AIProject|undefined;
    if (!project) throw new WeddingAiError('not_found','Project not found.',404);
    const completed = job.items.filter(item=>item.state==='complete' && item.text);
    const docs = await Promise.all(completed.map(item=>ref.collection('households').doc(item.householdId).get()));
    const suggestions: WeddingAiDraftSuggestion[] = [];
    completed.forEach((item,i)=>{
      const row = docs[i].data() as WeddingHousehold|undefined;
      if (mutableRow(project,row) && sourceHash(project,row)===item.contextHash && analyzeHandwryttenFit(resolveWeddingNote(project,{...row,bodyOverride:item.text!}),project.handwriting).fits) suggestions.push({id:item.householdId,text:item.text!});
    });
    await fresh(ctx);
    return {jobId:job.id,complete:job.items.filter(item=>item.state!=='pending').length,total:job.items.length,suggestions};
  }
  function jobError(job: Job) {
    return new WeddingAiError(job.error || (job.status==='running'?'job_running':`job_${job.status}`),job.status==='unresolved' ? 'This request may have reached the provider. It is paused to avoid a duplicate charge. Keep working manually while it is reconciled.' : job.status==='retryable' ? 'The provider is busy. Explicitly advance this job to retry once.' : job.status==='running' ? 'This job is still running. Check its status before continuing.' : 'This request could not produce a safe result. Your existing work is saved.',job.status==='retryable'?429:job.status==='failed'?502:409);
  }

  async function claim(ctx: WeddingAiContext,id: string,key: string,initial = false) {
    runtime(); aborted(ctx.signal);
    const actor = await fresh(ctx);
    return firestoreDb.runTransaction(async tx => {
      const {project:rawProject} = await authorizedTx(tx,actor), project=rawProject as AIProject;
      const ref = jobRef(actor.projectId,id), job = (await tx.get(ref)).data() as Job|undefined;
      if (!job) throw new WeddingAiError('job_not_found','This job could not be found in your project.',404);
      if (job.policy !== WEDDING_AI_POLICY || project.expiresAt<=now()) throw new WeddingAiError('job_expired','Review your current project before requesting AI again.',409);
      const receiptDoc = receiptRef(actor.projectId,key), receipt = (await tx.get(receiptDoc)).data();
      if (!initial && receipt) {
        if (receipt.jobId!==id || receipt.actorId!==actor.actorId || receipt.action!=='advance') throw new WeddingAiError('idempotency_conflict','This key belongs to a different request.',409);
        return {job,claimed:false};
      }
      if (job.status==='running') {
        if (job.run && job.run.deadline<now()) { job.status='unresolved';job.error='provider_outcome_unknown';job.run.state='unresolved';tx.set(ref,job); }
        return {job,claimed:false};
      }
      if (['ready','canceled','failed','unresolved'].includes(job.status)) return {job,claimed:false};
      gate(actor,job.action,job.requiresVerified); aborted(ctx.signal);
      if (!provider.info.available || job.provider.model!==provider.info.model || job.provider.imageModel!==provider.info.imageModel || job.provider.mode!==provider.info.mode) throw new WeddingAiError('provider_changed','The provider configuration changed. Keep working manually or review a new request.',409);
      const docs = job.action==='draft' ? await Promise.all(job.items.filter(item=>item.state==='pending').map(item=>tx.get(firestoreDb.collection('weddingProjects').doc(actor.projectId).collection('households').doc(item.householdId)))) : [];
      const current = new Map(docs.map(doc=>[doc.id,doc.data() as WeddingHousehold]));
      for (const item of job.items) if (item.state==='pending') {
        const row = current.get(item.householdId);
        if (!mutableRow(project,row) || sourceHash(project,row)!==item.contextHash) {item.state='skipped';item.reason='source_changed';}
      }
      const ids = job.items.filter(item=>item.state==='pending' && (!job.retryIds || job.retryIds.includes(item.id))).slice(0,L.chunk).map(item=>item.id);
      if (job.action==='draft' && !ids.length) {
        job.status=job.items.some(item=>item.state==='pending')?'partial':'ready';job.updatedAt=now();delete job.retryIds;
        tx.set(ref,job); if(!initial)tx.create(receiptDoc,{jobId:id,actorId:actor.actorId,action:'advance',at:now(),expiresAt:job.expiresAt});
        return {job,claimed:false};
      }
      const refs = budgetRefs(actor.projectId,job.deviceId), snapshots = await Promise.all(refs.map(r=>tx.get(r))), budgets=snapshots.map(doc=>budget(doc.data(),now()));
      if (budgets[0].inflight.some(call=>call.deadline<now())) throw new WeddingAiError('provider_outcome_unknown','An earlier request needs reconciliation before more paid AI work.',409);
      if (budgets[0].inflight.length>=L.concurrency || budgets[2].inflight.length>=limits().deploymentCalls) throw new WeddingAiError('ai_busy','AI is busy. Your job is saved; try the same request shortly.',429);
      const run: Run={id:hash(`${id}:${key}`),ids,startedAt:now(),deadline:now()+(job.action==='image'?125_000:35_000),state:'running',attempts:job.status==='retryable'?2:1};
      job.run=run;job.status='running';job.updatedAt=now();
      job.consents[hash(actor.actorId)]={policy:WEDDING_AI_POLICY,at:now(),inputHash:job.inputHash};
      refs.forEach((r,i)=>tx.set(r,{...budgets[i],inflight:[...budgets[i].inflight,{jobId:id,callId:run.id,deadline:run.deadline}]}));
      tx.set(ref,job);
      if (!initial) tx.create(receiptDoc,{jobId:id,actorId:actor.actorId,action:'advance',at:now(),expiresAt:job.expiresAt});
      return {job,claimed:true};
    });
  }

  async function finish(ctx: WeddingAiContext,started: Job,result?: WeddingAiResult,items?: WeddingAiDraftSuggestion[],error?: unknown) {
    const uncertain = error instanceof WeddingAiProviderError ? error.outcome==='uncertain' : error !== undefined && !(error instanceof WeddingAiError || error instanceof WeddingError);
    const retryable = error instanceof WeddingAiProviderError && error.retryable && started.run?.attempts===1;
    return firestoreDb.runTransaction(async tx=>{
      const ref=jobRef(started.projectId,started.id),job=(await tx.get(ref)).data() as Job|undefined;
      if (!job || !job.run || job.run.id!==started.run?.id) throw new WeddingAiError('job_changed','This job changed. Reload its status.',409);
      if(job.reconciliation?.runId===job.run.id)return job; // Fence a late worker after operator resolution.
      const refs=budgetRefs(started.projectId,started.deviceId),snapshots=await Promise.all(refs.map(r=>tx.get(r))),budgets=snapshots.map(d=>budget(d.data(),now()));
      let authorized = true;
      try { await authorizedTx(tx,ctx.actor); } catch { authorized=false; }
      const canceled = !!job.canceledAt || ctx.signal.aborted || !authorized;
      job.updatedAt=now();job.run.state=uncertain?'unresolved':error?'rejected':'complete';
      if (uncertain) {job.status='unresolved';job.error='provider_outcome_unknown';}
      else if (canceled) {job.status='canceled';job.canceledAt=job.canceledAt||now();job.error='request_canceled';}
      else if (error) {
        job.error=error instanceof WeddingAiError || error instanceof WeddingError ? error.code : 'provider_failed';
        job.status=retryable?'retryable':'failed';
        if(retryable){job.retryIds=job.run.ids;job.retryCount++;}
        else if(job.action==='draft') {for(const item of job.items)if(job.run.ids.includes(item.id)){item.state='failed';item.reason=job.error;} job.status=job.items.some(item=>item.state==='pending')?'partial':'failed';delete job.retryIds;}
      } else {
        if(items)for(const suggestion of items){const item=job.items.find(item=>item.id===suggestion.id);if(item&&job.run.ids.includes(item.id)){item.text=suggestion.text;item.state='complete';}}
        if(result)job.result=result;
        job.status=job.action==='draft'&&job.items.some(item=>item.state==='pending')?'partial':'ready';job.completedCalls++;delete job.error;delete job.retryIds;
      }
      // Lease expiry is never evidence of non-invocation. Hold capacity for uncertain calls.
      if(!uncertain)refs.forEach((ref,i)=>tx.set(ref,{...budgets[i],inflight:budgets[i].inflight.filter(call=>call.callId!==job.run!.id)}));
      else refs.forEach((ref,i)=>tx.set(ref,{...budgets[i],inflight:budgets[i].inflight.map(call=>call.callId===job.run!.id?{...call,deadline:0}:call)}));
      tx.set(ref,job);return job;
    });
  }

  async function execute(ctx: WeddingAiContext,job: Job) {
    let started=false,providerCompleted=false;
    const controller=new AbortController(),onCancel=()=>controller.abort();ctx.signal.addEventListener('abort',onCancel,{once:true});
    const deadline=setTimeout(()=>controller.abort(),job.action==='image'?120_000:30_000);
    try {
      aborted(ctx.signal);
      const actor=await fresh(ctx);gate(actor,job.action,job.requiresVerified);
      if((await load(ctx,job.id)).canceledAt)throw new WeddingAiError('request_canceled','This request was canceled.',408);
      let result: WeddingAiResult|undefined, suggestions: WeddingAiDraftSuggestion[]|undefined;
      if(job.action==='draft') {
        const inputs=job.items.filter(item=>job.run!.ids.includes(item.id)).map(safeInput);
        started=true;const response=await provider.draft(inputs,job.tone,controller.signal);providerCompleted=true;
        suggestions=validateWeddingDraftOutput(response,inputs,job.handwriting);
      } else if(job.action==='map') {
        started=true;const response=await provider.map(job.headers?{headers:job.headers}:{excerpt:job.excerpt},controller.signal);providerCompleted=true;
        const parsed=validateWeddingMapOutput(response,job.headers,job.excerpt);
        result=job.headers?{mapping:parsed as FieldMapping}:{suggestions:parsed as import('./ai-schema').WeddingAiMapSuggestion[],provider:job.provider.provider,model:job.provider.model};
      } else {
        const reference=job.assetId?await readArtwork(job.projectId,job.assetId):undefined;
        aborted(ctx.signal); if(controller.signal.aborted)throw new WeddingAiError('request_canceled','This request timed out before submission.',408);
        // The immutable asset ID selected in this job remains authoritative.
        // Accepting a different front meanwhile does not authorize its use here.
        gate(await fresh(ctx),job.action,job.requiresVerified);
        started=true;const bytes=await provider.image(job.prompt!,reference,controller.signal);providerCompleted=true;
        aborted(ctx.signal);await fresh(ctx);
        if((await load(ctx,job.id)).canceledAt)throw new WeddingAiError('request_canceled','This request was canceled.',408);
        result=await storeArtwork(job.projectId,bytes,{signal:controller.signal,authorize:async()=>{gate(await fresh(ctx),'image',job.requiresVerified);if((await load(ctx,job.id)).canceledAt)throw new WeddingAiError('request_canceled','This request was canceled.',408);}});
      }
      await fresh(ctx);aborted(ctx.signal);
      return await finish(ctx,job,result,suggestions);
    } catch(error) {
      // A disconnected client/timeout after submission is uncertain even when local cancellation is supported.
      const safeError=error instanceof WeddingAiProviderError ? error : started && !providerCompleted && (controller.signal.aborted || !(error instanceof WeddingAiError || error instanceof WeddingError)) ? new WeddingAiProviderError('provider_outcome_unknown','uncertain') : error instanceof WeddingAiError || error instanceof WeddingError ? error : new WeddingAiError(providerCompleted?'result_processing_failed':'input_unavailable','This request could not be completed. Your existing work is saved.',503);
      return await finish(ctx,job,undefined,undefined,safeError);
    } finally {clearTimeout(deadline);ctx.signal.removeEventListener('abort',onCancel);}
  }

  async function cancel(ctx: WeddingAiContext,id: string,key: string): Promise<WeddingAiResult> {
    const actor=await fresh(ctx);
    return firestoreDb.runTransaction(async tx=>{
      await assertWeddingActorInTransaction(tx,actor);
      const ref=jobRef(actor.projectId,id),job=(await tx.get(ref)).data() as Job|undefined,receipt=(await tx.get(receiptRef(actor.projectId,key))).data();
      if(!job)throw new WeddingAiError('job_not_found','This job could not be found in your project.',404);
      if(receipt && (receipt.jobId!==id||receipt.action!=='cancel'||receipt.actorId!==actor.actorId))throw new WeddingAiError('idempotency_conflict','This key belongs to a different request.',409);
      job.canceledAt=job.canceledAt||now();job.updatedAt=now();if(job.status!=='unresolved' && job.status!=='running')job.status='canceled';delete job.result;
      tx.set(ref,job);if(!receipt)tx.create(receiptRef(actor.projectId,key),{jobId:id,action:'cancel',actorId:actor.actorId,at:now(),expiresAt:job.expiresAt});
      return {jobId:id,canceled:true as const};
    });
  }

  return {
    /** Private operator function, deliberately absent from the HTTP action schema.
     * The operator must obtain provider evidence; elapsed time is not evidence. */
    async reconcile(operatorRequest: Request,input: {projectId:string;jobId:string;runId:string;decision:'confirmed_not_invoked'|'confirmed_terminal';evidenceReference:string}) {
      runtime();
      const identity=await weddingIdentity(operatorRequest,true);
      if(!identity?.admin || !identity.authTime || now()-identity.authTime>600_000 || identity.authTime>now()+60_000)throw new WeddingAiError('operator_required','Recent verified administrator sign-in is required.',403);
      const projectId=aiId(input.projectId),id=aiId(input.jobId),runId=aiId(input.runId);
      if(!['confirmed_not_invoked','confirmed_terminal'].includes(input.decision)||typeof input.evidenceReference!=='string'||input.evidenceReference.trim().length<8||input.evidenceReference.length>500)throw new WeddingAiError('evidence_required','A private provider evidence reference is required.');
      const evidenceHash=hash(input.evidenceReference);
      return firestoreDb.runTransaction(async tx=>{
        const ref=jobRef(projectId,id),job=(await tx.get(ref)).data() as Job|undefined;
        if(!job||job.run?.id!==runId)throw new WeddingAiError('job_changed','Select the exact unresolved invocation.',409);
        if(job.reconciliation?.runId===runId) {
          if(job.reconciliation.evidenceHash!==evidenceHash||job.reconciliation.decision!==input.decision)throw new WeddingAiError('evidence_conflict','This invocation was already reconciled with different evidence.',409);
          return {jobId:id,status:job.status};
        }
        if(job.status!=='unresolved' && !(job.status==='running'&&job.run.deadline<now()))throw new WeddingAiError('job_not_unresolved','Only an unresolved invocation can be reconciled.',409);
        const refs=budgetRefs(projectId,job.deviceId),snapshots=await Promise.all(refs.map(r=>tx.get(r))),budgets=snapshots.map(s=>budget(s.data(),now()));
        job.reconciliation={runId,decision:input.decision,evidenceHash,at:now(),operatorUid:identity.uid};job.updatedAt=now();job.run.state='rejected';
        if(job.canceledAt){job.status='canceled';job.error='request_canceled';}
        else if(input.decision==='confirmed_not_invoked'&&job.run.attempts===1){job.status='retryable';job.error='confirmed_not_invoked';job.retryIds=job.run.ids;}
        else {job.status='failed';job.error='reconciled_without_result';for(const item of job.items)if(job.run.ids.includes(item.id)){item.state='failed';item.reason=job.error;}if(job.action==='draft'&&job.items.some(i=>i.state==='pending'))job.status='partial';}
        refs.forEach((r,i)=>tx.set(r,{...budgets[i],inflight:budgets[i].inflight.filter(call=>call.callId!==runId)}));
        tx.set(ref,job);return {jobId:id,status:job.status};
      });
    },
    async post(ctx: WeddingAiContext,request: WeddingAiRequest): Promise<WeddingAiResult> {
      if(request.action==='cancel')return cancel(ctx,request.jobId,request.idempotencyKey);
      let job: Job;
      if(request.action==='advance') {
        const claimed=await claim(ctx,request.jobId,request.idempotencyKey);
        job=claimed.claimed?await execute(ctx,claimed.job):claimed.job;
      } else {
        const reserved=await reserve(ctx,request);
        if(reserved.replay)job=reserved.job;
        else {const claimed=await claim(ctx,reserved.job.id,request.idempotencyKey,true);job=claimed.claimed?await execute(ctx,claimed.job):claimed.job;}
      }
      await fresh(ctx);
      if(['unresolved','failed','retryable','running'].includes(job.status))throw jobError(job);
      return presentation(ctx,job);
    },
    async get(ctx: WeddingAiContext,id?: string) {
      await fresh(ctx);
      const b=budget((await budgetRefs(ctx.actor.projectId,ctx.deviceId)[0].get()).data(),now());
      const metadata={...provider.info,available:provider.info.available&&!isFirestoreMock&&!paused(),paused:paused(),policy:WEDDING_AI_POLICY,networkSignalAvailable:!!ctx.networkSignal,
        features:{draft:ctx.actor.verified&&(!pilotOnly()||ctx.actor.pilot),map:ctx.actor.verified&&(!pilotOnly()||ctx.actor.pilot),image:ctx.actor.verified&&(!pilotOnly()||ctx.actor.pilot)},
        limits:{drafts:100,maps:4,images:3,concurrent:2,chunk:5,excerptChars:L.excerptChars},
        remaining:{drafts:Math.max(0,100-count(b,'draft')),maps:Math.max(0,4-count(b,'map')),images:Math.max(0,3-count(b,'image'))},
        resetsAt:b.events.length?Math.min(...b.events.map(e=>e.at))+L.dayMs:null,
        imageStepUpRequired:!ctx.actor.verified,
        cost:{kind:'reserved_estimate',reservedCents:count(b,'cents'),ceilingCents:limits().projectCents,observedProviderCost:null},
      };
      if(!id) {
        const recent=await firestoreDb.collection('weddingProjects').doc(ctx.actor.projectId).collection('aiJobs').orderBy('createdAt','desc').limit(12).get();
        return {...metadata,jobs:recent.docs.map(doc=>{const j=doc.data() as Job;return {jobId:j.id,action:j.action,status:j.status==='running'&&j.run&&j.run.deadline<now()?'unresolved':j.status,createdAt:j.createdAt,canceled:!!j.canceledAt};})};
      }
      const job=await load(ctx,id);
      // An expired running lease remains fenced. Status accurately communicates uncertainty after a crashed worker.
      const status=job.status==='running'&&job.run&&job.run.deadline<now()?'unresolved':job.status;
      const result=job.action==='draft'?await presentation(ctx,job):job.status==='ready'?job.result:undefined;
      return {...metadata,job:{jobId:job.id,action:job.action,status,canceled:!!job.canceledAt,complete:job.items.filter(i=>i.state!=='pending').length,total:job.items.length,error:status==='unresolved'?'provider_outcome_unknown':job.error||null,sourceRevisions:job.items.map(i=>({id:i.householdId,revision:i.revision,status:i.state,reason:i.reason||null})),provider:job.provider,createdAt:job.createdAt,updatedAt:job.updatedAt,...(result?{result}:{})}};
    },
  };
}
