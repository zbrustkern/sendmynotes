import { checkoutOrderPath } from "../order-tracking-links";
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { firestoreDb } from '../firebase-admin';
import { CARD_PRESETS, ALL_FONT_CANDIDATES } from '../card-presets';
import { multiSendCheckoutOwnerKey, multiSendCheckoutRef, type CheckoutGroup } from '../multi-send/checkout';
import { extractGreetingTargetName } from '../multi-send/greeting-guard';
import { AccountError, requireAccountActor } from '../account/http';
import { resolvePaymentMode } from '../payment-mode';
import { getStripeClient } from '../stripe';
import { getActiveOfferReservation, releaseOfferReservation, type OfferIntentEvidence } from '../offer-engine';
import type { Order } from '../types';
import { createWeddingProject, weddingState } from './project';
import { canonicalWeddingJSON, weddingHash } from './hash';
import { newWeddingHousehold, type WeddingActor, type WeddingHousehold, type WeddingProject, type WeddingReturnAddress } from './domain';
import { WeddingError, WEDDING_DEVICE_COOKIE, assertWeddingActorInTransaction, assertWeddingOrigin, assertWeddingRuntime, newWeddingSecret, newWeddingSession, weddingCookie, weddingId, weddingProjectRef, weddingSessionRef, weddingStorageEnvironment } from './server';
import { object, text } from './validation';
import { transferArtworkBoundary, weddingTransferArtworkSource, weddingTransferArtworkIdentity, type TransferArtworkSource } from './transfer-artwork';
import { ARTWORK_POLICY } from './artwork-policy';
import { artworkProjectSegment } from './artwork-storage';

const LEASE_MS = 60_000;
type Proof = {orderId:string;viewToken:string};
type TransferContent = {checkoutId:string;sharedBody:string;signOff:string;handwriting:string;cover:WeddingProject['cover'];returnAddress:WeddingReturnAddress;households:WeddingHousehold[]};
type TransferInput = {content:TransferContent;inputHash:string;paymentAttempted:boolean;proof?:Proof};
export class WeddingTransferError extends WeddingError {
  constructor(code:string,message:string,status=409,public details:Record<string,unknown>={}) {super(code,message,status);}
}
function failure(code:string,message:string,status=409):never {throw new WeddingTransferError(code,message,status);}
function draftAddress(value:unknown) {
  const a=value==null?{}:object(value);
  return {name:text(a.name??'',300),address1:text(a.addressLine1??'',300),address2:text(a.addressLine2??'',300),city:text(a.city??'',100),state:text(a.state??'',100),zip:text(a.zip??'',100),country:text(a.country??'',100)};
}
/** Copy only EntryPrototypeClient's content fields. Never trust client approval,
 * payment, ownership, price, private asset URLs, or v1's implicit US default. */
export function parseWeddingTransfer(body:Record<string,unknown>,ownedSource?:TransferArtworkSource):TransferInput {
  const draft=object(body.draft),batch=object(draft.multiSend),note=object(draft.note);
  const checkoutId=weddingId(batch.checkoutId);
  if(batch.version!==1||!Array.isArray(batch.recipients)||batch.recipients.length<1||batch.recipients.length>25)failure('TRANSFER_INVALID_DRAFT','Choose a general batch with 1–25 draft recipients.',400);
  if(typeof body.paymentAttempted!=='boolean')failure('TRANSFER_PAYMENT_PROOF_REQUIRED','State whether checkout was attempted. Keep the original draft.');
  let proof:Proof|undefined;
  if(body.previousCheckout!=null){const p=object(body.previousCheckout);proof={orderId:weddingId(p.orderId),viewToken:text(p.viewToken,256)};if(!proof.viewToken)failure('TRANSFER_PAYMENT_PROOF_REQUIRED','Open the previous checkout to verify its status.');}
  if((body.paymentAttempted||draft.checkoutSnapshotId||draft.completed)&&!proof)failure('TRANSFER_PAYMENT_PROOF_REQUIRED','Open the previous checkout to verify payment before transferring.');
  const selected=draft.selectedDesign==null?{}:object(draft.selectedDesign);
  const resolution=body.coverResolution==null?null:object(body.coverResolution);
  const privateCover=!!(draft.uploadSelection||draft.accountImage||draft.privateUploadRecovery||draft.coverChoiceRequired||selected.uploadSelection||selected.source!=='preset');
  if(!resolution&&privateCover&&!ownedSource)failure('TRANSFER_COVER_RESOLUTION_REQUIRED','Keep your original design and choose a preset explicitly, or select your authorized artwork in the wedding project.');
  const preset=CARD_PRESETS.find(p=>p.id===(resolution?.presetId??selected.presetId));
  if(!preset&&!ownedSource)failure('TRANSFER_COVER_RESOLUTION_REQUIRED','Choose an available preset explicitly before transferring.');
  const sharedBody=text(note.text,16000),signOff=text(note.signOff??'',2000),salutation=text(note.salutation??'',2000),handwriting=text(note.style,80);
  if(!ALL_FONT_CANDIDATES.some(f=>f.id===handwriting))failure('TRANSFER_INVALID_DRAFT','Choose a supported handwriting style.',400);
  // Unknown inherited openings (including bare names) remain disputed too.
  const named=extractGreetingTargetName(salutation)||salutation.trim().replace(/[,!.:;]+$/,'');
  const reviewInherited=!!named&&!/^(?:(?:my|our|dear) )?(?:friends|family|everyone|everybody|all|you all|folks|neighbors|team|gang|crew|both of you|you two|you both)$/i.test(named);
  const households=batch.recipients.map(value=>{
    const r=object(value),id=weddingId(r.id),a=draftAddress(r.address),g=object(r.greeting);
    if(g.mode!=='inherit'&&g.mode!=='custom')failure('TRANSFER_INVALID_DRAFT','Check each recipient’s greeting choice.',400);
    const greeting=g.mode==='custom'?text(g.text,2000):salutation;
    const {name,...address}=a;
    return {...newWeddingHousehold(id),envelopeName:name,firstName:name,insideName:name,address,greeting,
      // Free-form names are never split. Sender review confirms supplier identity.
      sourceHouseholdId:id,greetingNeedsReview:g.mode==='inherit'&&reviewInherited,
      provenance:[{importId:`multi_send_${checkoutId}`,sourceRowId:id,sourceHash:weddingHash(canonicalWeddingJSON({address:a,greeting}))}]};
  });
  if(new Set(households.map(r=>r.id)).size!==households.length)failure('TRANSFER_INVALID_DRAFT','Each recipient needs a distinct ID.',400);
  const {name,...sender}=draftAddress(draft.sender);
  if(sender.country&&!['US','USA','United States','United States of America'].includes(sender.country))failure('TRANSFER_INVALID_DRAFT','Use a personal United States return address.',400);
  // The source reference fixes retry identity before a destination exists. This
  // internal placeholder is never stored or returned as an accepted front.
  const cover:WeddingProject['cover']=ownedSource?{kind:'upload',id:`transfer_${weddingTransferArtworkIdentity(ownedSource)}`,url:''}:{kind:'preset',id:preset!.id,url:preset!.imageUrl};
  const content:TransferContent={checkoutId,sharedBody,signOff,handwriting,cover,returnAddress:{...sender,country:sender.country?'US':'',firstName:name,lastName:''},households};
  return {content,inputHash:weddingHash(canonicalWeddingJSON(content)),paymentAttempted:body.paymentAttempted||!!draft.checkoutSnapshotId||draft.completed===true,proof};
}
function authorizedStatus(order:Order,paymentState:'paid'|'pending'|'uncertain'):never {
  throw new WeddingTransferError('TRANSFER_ORDER_STATUS','Open the existing order to check payment. Your original draft is preserved.',409,{orderId:order.id,orderPath:checkoutOrderPath(order.id, order.viewToken),paymentState});
}
function paidOrder(order:Order) {return ['PAYMENT_RECEIVED','AWAITING_RECIPIENT_ADDRESS','DISPATCHING','DISPATCH_UNCERTAIN','PROCESSING_HANDWRYTTEN','QUEUED_FOR_FULFILLMENT','MAILED'].includes(order.status)||!!order.purchaseMeasurement;}
function assertIntent(order:Order,pi:Stripe.PaymentIntent) {
  if(pi.id!==order.stripePaymentId||pi.livemode!==false||order.paymentMode!=='stripe_test'||pi.metadata?.orderId!==order.id||pi.metadata?.contentRevision!==order.multiSend?.contentRevision||pi.metadata?.itemCount!==String(order.multiSend?.recipients.length)||pi.amount!==order.amountInCents||pi.currency!=='usd'||(order.discountCode&&(pi.metadata.discountCode!==order.discountCode||pi.metadata.quoteId!==order.quoteId))) authorizedStatus(order,'uncertain');
}
/** A missing saved intent ID is ambiguous: Stripe may have accepted a timed-out
 * create. Never infer nonpayment from our pending/failed status or an old lease. */
export async function reconcileWeddingTransferPayment(order:Order):Promise<OfferIntentEvidence> {
  if(paidOrder(order))authorizedStatus(order,'paid');
  if(!order.stripePaymentId)authorizedStatus(order,'uncertain');
  let mode;try {mode=resolvePaymentMode();}catch {authorizedStatus(order,'uncertain');}
  if(mode==='local_mock'&&process.env.NODE_ENV==='test'&&process.env.SMN_TEST_DATA_DIR&&order.paymentMode==='local_mock'&&order.stripePaymentId===`pi_mock_${order.id}`&&order.status==='PENDING_PAYMENT')return {id:order.stripePaymentId,status:'canceled',amount:order.amountInCents,currency:'usd',livemode:false,metadata:{orderId:order.id,quoteId:order.quoteId || '',contentRevision:order.multiSend?.contentRevision || ''}};
  if(mode!=='stripe_test'||order.paymentMode!=='stripe_test')authorizedStatus(order,'uncertain');
  const stripe=getStripeClient();
  const retrieve=async()=>{try {const pi=await stripe.paymentIntents.retrieve(order.stripePaymentId!);assertIntent(order,pi);return pi;}catch(error){if(error instanceof WeddingTransferError)throw error;authorizedStatus(order,'uncertain');}};
  let pi=await retrieve();
  if(pi.status==='succeeded')authorizedStatus(order,'paid');
  if(pi.status==='processing'||pi.status==='requires_capture')authorizedStatus(order,'pending');
  if(pi.status==='canceled')return pi;
  if(!['requires_payment_method','requires_confirmation','requires_action'].includes(pi.status))authorizedStatus(order,'uncertain');
  try {pi=await stripe.paymentIntents.cancel(pi.id,{}, {idempotencyKey:`wedding-transfer-${order.id}`});assertIntent(order,pi);}catch(error){if(error instanceof WeddingTransferError)throw error;pi=await retrieve();}
  // Verify cancellation response, including a late capture or lost response.
  if(pi.status==='succeeded')authorizedStatus(order,'paid');
  if(pi.status!=='canceled')authorizedStatus(order,pi.status==='processing'||pi.status==='requires_capture'?'pending':'uncertain');
  return pi;
}
function checkProof(group:CheckoutGroup,order:Order|undefined,input:TransferInput) {
  if(!group.currentOrderId){if(input.paymentAttempted||input.proof)failure('TRANSFER_RECONCILIATION_REQUIRED','The previous checkout cannot be verified. Keep the original draft.');return;}
  if(!input.proof||input.proof.orderId!==group.currentOrderId||!order?.viewToken||input.proof.viewToken!==order.viewToken)failure('TRANSFER_PAYMENT_PROOF_REQUIRED','Provide the previous checkout proof before transferring.');
  if(order.id!==group.currentOrderId||order.multiSend?.kind!=='parent'||order.multiSend.version!==1||order.multiSend.checkoutId!==input.content.checkoutId||order.multiSend.contentRevision!==group.currentRevision)failure('TRANSFER_RECONCILIATION_REQUIRED','The previous order does not match this checkout.');
}
async function sourceClaim(input:TransferInput,ownerKey:string,explicitCoverResolution=false) {
  const ref=multiSendCheckoutRef(input.content.checkoutId),leaseId=randomUUID();
  return firestoreDb.runTransaction(async tx=>{
    const group=(await tx.get(ref)).data() as CheckoutGroup|undefined;
    if(group&&group.ownerKey!==ownerKey)failure('TRANSFER_OWNER_MISMATCH','Use the original checkout account or device.',403);
    const order=group?.currentOrderId?(await tx.get(firestoreDb.collection('orders').doc(group.currentOrderId))).data() as Order|undefined:undefined;
    if(group)checkProof(group,order,input);else if(input.paymentAttempted||input.proof)failure('TRANSFER_RECONCILIATION_REQUIRED','The previous checkout cannot be verified.');
    // An explicitly chosen fallback may replace an unfinished, released claim.
    // Completed copies are immutable; rotating the lease fences any old worker.
    const resolvingUnfinished=explicitCoverResolution&&group?.state==='transferring'&&!group.weddingTransfer?.projectId&&Number(group.weddingTransfer?.leaseUntil)<=Date.now();
    if(group?.weddingTransfer&&group.weddingTransfer.inputHash!==input.inputHash&&!resolvingUnfinished)failure('TRANSFER_CONTENT_CONFLICT','This batch already has a different transfer. Resume its project or restore the original transfer content.');
    if(group?.state==='transferred')return {group,order,replay:true,leaseId};
    if(group?.state==='creating'||group?.state==='replacing')failure('TRANSFER_CHECKOUT_BUSY','Checkout is still updating. Check its status before transferring.');
    if(group?.state==='transferring'&&group.weddingTransfer!.leaseUntil>Date.now())failure('TRANSFER_CHECKOUT_BUSY','This transfer is already running. Retry shortly.');
    // A blocked v1 replacement may hide a second, unbound prior intent.
    if(group?.state==='blocked'){if(order)authorizedStatus(order,paidOrder(order)?'paid':'uncertain');failure('TRANSFER_RECONCILIATION_REQUIRED','The previous payment needs reconciliation.');}
    const next:CheckoutGroup={...group,ownerKey,state:'transferring',leaseId,updatedAt:Date.now(),weddingTransfer:{...group?.weddingTransfer,inputHash:input.inputHash,leaseUntil:Date.now()+LEASE_MS}};
    tx.set(ref,next);return {group:next,order,replay:false,leaseId};
  });
}
/** Credentials come only from verified Firebase identity or the v1 HttpOnly
 * cookie. previousCheckout is an additional proof, never an ownership grant. */
export async function transferWeddingDraft(req:NextRequest,body:Record<string,unknown>,onCapability?:(name:string,value:string)=>void,artwork=transferArtworkBoundary) {
  assertWeddingRuntime(req);assertWeddingOrigin(req);
  const checkoutId=weddingId(object(object(body.draft).multiSend).checkoutId);
  const account=req.headers.has('authorization')?await requireAccountActor(req,true).catch(error=>{if(error instanceof AccountError)throw new WeddingTransferError(error.code,error.message,error.status);throw error;}):null;
  const cookieName=`smn_multi_send_${checkoutId}`;
  const rawCookie=req.cookies.get(cookieName)?.value;
  if(rawCookie&&!/^[a-f0-9]{64}$/.test(rawCookie))failure('TRANSFER_OWNER_MISMATCH','Use the original checkout device.',403);
  const capability=rawCookie||newWeddingSecret().token;
  const ownerKey=multiSendCheckoutOwnerKey({checkoutId,userId:account?.uid,guestCapability:capability});
  // Paid status must be reachable even when the editable draft now needs cover
  // resolution. This read does not grant ownership or permit a transfer.
  let knownPrior:Order|undefined;
  if(body.previousCheckout!=null) {
    const proof=object(body.previousCheckout),orderId=weddingId(proof.orderId),viewToken=text(proof.viewToken,256);
    await firestoreDb.runTransaction(async tx=>{
      const group=(await tx.get(multiSendCheckoutRef(checkoutId))).data() as CheckoutGroup|undefined;
      if(!group||group.ownerKey!==ownerKey)failure('TRANSFER_OWNER_MISMATCH','Use the original checkout account or device.',403);
      const order=group.currentOrderId?(await tx.get(firestoreDb.collection('orders').doc(group.currentOrderId))).data() as Order|undefined:undefined;
      if(!order?.viewToken||group.currentOrderId!==orderId||order.viewToken!==viewToken||order.multiSend?.checkoutId!==checkoutId)failure('TRANSFER_PAYMENT_PROOF_REQUIRED','Provide the previous checkout proof before transferring.');
      if(paidOrder(order))authorizedStatus(order,'paid');
      knownPrior=order;
    });
  }
  const artworkSource=weddingTransferArtworkSource(body),input=parseWeddingTransfer(body,artworkSource);
  const ref=multiSendCheckoutRef(checkoutId);
  // A completed transfer owns its independent copy. Replays must not require a
  // still-live source library item or grant, and cannot replace that copy.
  const observed=artworkSource?(await ref.get()).data() as CheckoutGroup|undefined:undefined;
  if(observed&&observed.ownerKey!==ownerKey)failure('TRANSFER_OWNER_MISMATCH','Use the original checkout account or device.',403);
  const ownedFront=artworkSource&&observed?.state!=='transferred'?await artwork.resolve(req,account,artworkSource,knownPrior):undefined;
  const deviceToken=weddingCookie(req,WEDDING_DEVICE_COOKIE)||newWeddingSecret().token;
  const claim=await sourceClaim(input,ownerKey,body.coverResolution!=null);
  if(!account)onCapability?.(cookieName,capability);
  try {
    let releasedOffer = false;
    if (!claim.replay && claim.order) {
      const order = claim.order;
      const paymentIntent = await reconcileWeddingTransferPayment(order);
      if (order.discountCode) {
        const hold = await getActiveOfferReservation(order.id);
        if (hold) {
          releasedOffer = await releaseOfferReservation(order.id, 'removed', {
            ownerKey, ownerId: account?.uid, sessionId: order.sessionId || hold.sessionId,
            checkoutRevision: order.checkoutRevision || hold.checkoutRevision, paymentIntent,
          });
          if (!releasedOffer) authorizedStatus(order, 'uncertain');
        }
      }
    }
    // A fresh core-owned private project is never exposed until the atomic copy
    // and source fence finish. Failure can leave only an empty expiring project.
    const fresh=claim.replay?null:await createWeddingProject(account?ownerKey:deviceToken);
    const session=claim.replay?newWeddingSecret():{token:fresh!.token,id:fresh!.sessionId};
    let adopted:{assetId:string;url:string}|undefined;
    if(!claim.replay&&ownedFront) {
      const authorize=async()=>{await firestoreDb.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data() as CheckoutGroup|undefined;
        if(current?.state!=='transferring'||current.ownerKey!==ownerKey||current.leaseId!==claim.leaseId)failure('TRANSFER_CHECKOUT_BUSY','This transfer changed. Retry to open its project.');
        await assertWeddingActorInTransaction(tx,{projectId:fresh!.projectId,actorId:fresh!.actorId,role:'owner',verified:false,pilot:false,sessionId:fresh!.sessionId},'owner');
        await ownedFront.assertCurrent(tx);
      });};
      adopted=await artwork.adopt(fresh!.projectId,ownedFront.bytes,ownedFront.sha256,{signal:req.signal,authorize});
    }
    const result=await firestoreDb.runTransaction(async tx=>{
      const group=(await tx.get(ref)).data() as CheckoutGroup|undefined;
      if(!group||group.ownerKey!==ownerKey||group.weddingTransfer?.inputHash!==input.inputHash||(!claim.replay&&(group.leaseId!==claim.leaseId||group.state!=='transferring')))failure('TRANSFER_CHECKOUT_BUSY','The transfer changed. Retry to open the current project.');
      const prior=group.currentOrderId?(await tx.get(firestoreDb.collection('orders').doc(group.currentOrderId))).data() as Order|undefined:undefined;
      checkProof(group,prior,input);
      if(!claim.replay&&prior){
        if(paidOrder(prior))authorizedStatus(prior,'paid');
        if(prior.stripePaymentId!==claim.order?.stripePaymentId||(prior.status!==claim.order?.status && !(releasedOffer && prior.status==='FAILED' && prior.fulfillmentStatus==='OFFER_RESERVATION_RELEASED')))authorizedStatus(prior,'uncertain');
      }
      const projectId=claim.replay?group.weddingTransfer!.projectId!:fresh!.projectId;
      const actorId=claim.replay?group.weddingTransfer!.actorId!:fresh!.actorId;
      const originalSessionId=claim.replay?group.weddingTransfer!.sessionId!:fresh!.sessionId;
      const actor:WeddingActor={projectId,actorId,role:'owner',verified:false,pilot:false,canPay:true,canExport:true,sessionId:originalSessionId};
      const {project,member}=await assertWeddingActorInTransaction(tx,actor,'owner');
      if(claim.replay&&member.uid&&member.uid!==account?.uid)failure('TRANSFER_OWNER_MISMATCH','Sign in with the account now linked to this private project.',403);
      if(member.uid&&member.uid===account?.uid){actor.uid=account.uid;actor.verified=account.emailVerified;}
      if(project.expiresAt<=Date.now())failure('project_expired','Open your project recovery link and extend the project.',410);
      if(claim.replay){
        tx.create(weddingSessionRef(session.id),newWeddingSession(projectId,actorId));
        return {actor:{...actor,sessionId:session.id},copiedCount:group.weddingTransfer!.copiedCount!,greetingReviewIds:group.weddingTransfer!.greetingReviewIds!};
      }
      if(project.householdCount||project.activeBatchId||project.purchasedCount)failure('TRANSFER_PROJECT_CONFLICT','The new project is no longer empty.');
      const {households,...content}=input.content;
      const {checkoutId:_source,...settings}=content;
      if(artworkSource) {
        if(!adopted||!ownedFront)failure('TRANSFER_COVER_RESOLUTION_REQUIRED','Reselect your approved front before transferring.');
        await ownedFront.assertCurrent(tx);
        const asset=(await tx.get(weddingProjectRef(projectId).collection('artwork').doc(adopted.assetId))).data();
        const key=`wedding-normalized/${weddingStorageEnvironment()}/${artworkProjectSegment(projectId)}/${ownedFront.sha256}.png`;
        if(!asset||asset.projectId!==projectId||asset.id!==adopted.assetId||asset.policy!==ARTWORK_POLICY||asset.verdict!=='accepted_for_import'||asset.deletedAt||!asset.generation||!asset.sourceGeneration||asset.sha256!==ownedFront.sha256||asset.sourceSha256!==ownedFront.sha256||asset.storageKey!==key||asset.sourceKey!==key)failure('TRANSFER_COVER_RESOLUTION_REQUIRED','The private front could not be attached. Retry your transfer.');
        settings.cover={kind:'upload',id:asset.id,url:`/api/wedding/artwork?id=${asset.id}`,hash:asset.sha256,masterKey:asset.storageKey};
      }
      const greetingReviewIds=households.filter(r=>r.greetingNeedsReview).map(r=>r.id);
      tx.update(weddingProjectRef(projectId),{...settings,revision:project.revision+1,householdCount:households.length,updatedAt:Date.now(),paymentReconciliationRequired:false});
      if(artworkSource&&ownedFront&&adopted)tx.create(weddingProjectRef(projectId).collection('transferSources').doc('cover'),{version:1,source:artworkSource,ownerUid:account!.uid,sha256:ownedFront.sha256,assetId:adopted.assetId,createdAt:Date.now()});
      for(const row of households)tx.create(weddingProjectRef(projectId).collection('households').doc(row.id),row);
      if(prior)tx.update(firestoreDb.collection('orders').doc(prior.id),{status:'FAILED',fulfillmentStatus:'WEDDING_TRANSFERRED',fulfillmentError:'Prior unpaid payment was canceled before transfer.',updatedAt:Date.now()});
      tx.update(ref,{state:'transferred',leaseId:null,updatedAt:Date.now(),weddingTransfer:{inputHash:input.inputHash,leaseUntil:0,projectId,actorId,sessionId:originalSessionId,copiedCount:households.length,greetingReviewIds}});
      return {actor,copiedCount:households.length,greetingReviewIds};
    });
    return {body:{...await weddingState(result.actor),transferred:true,replay:claim.replay,projectId:result.actor.projectId,projectPath:'/thank-you/wedding',copiedCount:result.copiedCount,greetingReviewIds:result.greetingReviewIds},sessionToken:session.token,deviceToken};
  } catch(error) {
    // Release only the transfer lease. The source remains fenced from all v1
    // intent creation/retry/recovery, including uncertain Stripe outcomes.
    if(!claim.replay)await firestoreDb.runTransaction(async tx=>{const current=(await tx.get(ref)).data() as CheckoutGroup|undefined;if(current?.state==='transferring'&&current.leaseId===claim.leaseId&&current.weddingTransfer)tx.update(ref,{weddingTransfer:{...current.weddingTransfer,leaseUntil:0}});});
    throw error;
  }
}
