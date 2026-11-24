import type {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import {firestoreDb} from '../firebase-admin';
import {AccountError, accountDoc, requireAccountActor} from '../account/http';
import type {AccountActor} from '../account/contracts';
import {getAccountImage, readAccountImageForOrder} from '../account/images';
import type {LibraryObjectStore} from '../account/library-storage';
import {evaluateUploadGrant, getDesign, readPrivateAsset, requireActiveGrant, uploadCollections} from '../upload/access';
import {UploadError, type UploadGrant} from '../upload/contracts';
import {isAuthorizedAdminEmail} from '../admin-auth';
import type {Order} from '../types';
import {adoptNormalizedWeddingArtwork} from './artwork';
import {assertNormalizedWeddingFront} from './artwork-policy';
import {WeddingError} from './server';
import {canonicalWeddingJSON, weddingHash} from './hash';

export type TransferArtworkSource =
  | {kind:'account';imageId:string;version:number;masterSha256:string}
  | {kind:'studio';designId:string;revision:number;masterSha256:string}
  | {kind:'order';orderId:string;designId:string};
type Tx=FirebaseFirestore.Transaction;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const record=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const validHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function resolution():never {throw new WeddingError('TRANSFER_COVER_RESOLUTION_REQUIRED','Sign in to reselect an approved owned front, or explicitly choose a preset. Your original design is preserved.',409);}

/** Parse references, never URLs or bytes. Authorization happens separately on
 * server records. A client-selected hash is only an expected revision. */
export function weddingTransferArtworkSource(body:Record<string,unknown>):TransferArtworkSource|undefined {
  if(body.coverResolution!=null)return;
  const d=record(body.draft),s=record(d?.selectedDesign);
  if(!d)return;
  const upload=record(d.uploadSelection??s?.uploadSelection),account=record(d.accountImage);
  if(!account&&!upload&&s?.source==='preset'&&!d.coverChoiceRequired&&!d.privateUploadRecovery)return;
  if(d.coverChoiceRequired||s?.accepted!==true||(account&&upload))resolution();
  if(account){if(!validId(account.imageId)||!Number.isSafeInteger(account.version)||Number(account.version)<1||!validHash(account.masterSha256))resolution();return {kind:'account',imageId:account.imageId,version:Number(account.version),masterSha256:account.masterSha256};}
  if(upload){if(upload.source!=='upload'||upload.accepted!==true||!validId(upload.designId)||upload.revision!==1||!validHash(upload.masterSha256))resolution();return {kind:'studio',designId:upload.designId,revision:1,masterSha256:upload.masterSha256};}
  const previous=record(body.previousCheckout);
  // Only an explicit private generated-master identity may name the previous
  // order front. A public cache ID, image URL, or status token is insufficient.
  if(s?.source==='custom'&&validId(previous?.orderId)&&s.customId===`generated_${previous.orderId}`)return {kind:'order',orderId:previous.orderId,designId:String(s.customId)};
  resolution();
}
export const weddingTransferArtworkIdentity=(source:TransferArtworkSource)=>weddingHash(canonicalWeddingJSON(source));
type Dependencies={libraryStore?:LibraryObjectStore;readPrivate?:typeof readPrivateAsset;adopt?:typeof adoptNormalizedWeddingArtwork};
export function createTransferArtworkBoundary(deps:Dependencies={}) {
  const readPrivate=deps.readPrivate||readPrivateAsset;
  return {
    adopt:deps.adopt||adoptNormalizedWeddingArtwork,
    async resolve(req:NextRequest,actor:AccountActor|null,source:TransferArtworkSource,prior?:Order) {
      try {
        if(!actor?.emailVerified)resolution();
        const uid=actor.uid;
        const pilot=()=>isAuthorizedAdminEmail(actor.email)||(process.env.WEDDING_PILOT_UIDS||'').split(',').map(v=>v.trim()).includes(uid);
        let studioRequired=source.kind==='studio';
        async function policy(tx?:Tx) {
          const current=await requireAccountActor(req,true).catch(error=>{if(error instanceof AccountError)resolution();throw error;});
          if(!current.emailVerified||current.uid!==uid)resolution();
          if(studioRequired||!pilot()){
            if(tx){const grant=(await tx.get(uploadCollections.col('uploadAccess').doc(uploadCollections.envKey(uid)))).data() as UploadGrant | undefined;if(!evaluateUploadGrant(uid, grant).allowed)resolution();}
            else await requireActiveGrant(uid,'read');
          }
        }
        await policy();
        let bytes:Buffer,masterSha256:string,ref:FirebaseFirestore.DocumentReference,expected:Record<string,unknown>;
        let validate:(row:Record<string,any>|undefined)=>void;
        if(source.kind==='account') {
          const owned=await getAccountImage(actor,source.imageId),row=owned.row;
          studioRequired=row.requiresUploadGrant===true;await policy();
          if(row.id!==source.imageId||row.contentType!=='image/png'||!['generated_front','upload_front'].includes(row.kind)||row.masterKey.split('/')[3]!==row.id||!/^front-v\d+\.png$/.test(row.masterKey.split('/')[4]))resolution();
          const saved=await readAccountImageForOrder(actor,{imageId:source.imageId,version:source.version,masterSha256:source.masterSha256},deps.libraryStore);
          bytes=saved.bytes;masterSha256=saved.masterSha256;ref=accountDoc('images',uid,source.imageId);
          expected={key:row.masterKey,hash:masterSha256,kind:row.kind};
          validate=r=>{if(!r||r.ownerUid!==uid||r.id!==source.imageId||r.state!=='ready'||r.deletedAt||(r.expiresAt&&r.expiresAt<=Date.now())||r.version<source.version||r.masterKey!==expected.key||r.masterSha256!==expected.hash||r.kind!==expected.kind||r.contentType!=='image/png'||r.requiresUploadGrant!==row.requiresUploadGrant)resolution();};
        } else if(source.kind==='studio') {
          const design=await getDesign(source.designId);
          if(!design||design.uid!==uid||!design.acceptedAt||design.revision!==source.revision||design.masterSha256!==source.masterSha256)resolution();
          const owner=createHash('sha256').update(uid).digest('hex').slice(0,32),prefix=`upload-private/${process.env.LOB_ENV||process.env.NODE_ENV||'development'}/${owner}/design/`;
          if(!design.masterKey.startsWith(prefix)||!/^([0-9a-f-]{36})\.png$/.test(design.masterKey.slice(prefix.length)))resolution();
          bytes=await readPrivate(design.masterKey);masterSha256=design.masterSha256;ref=uploadCollections.col('uploadDesigns').doc(uploadCollections.envKey(design.id));
          expected={key:design.masterKey,hash:masterSha256};
          validate=r=>{if(!r||r.id!==source.designId||r.uid!==uid||!r.acceptedAt||r.deletedAt||r.expiresAt<=Date.now()||r.revision!==source.revision||r.masterKey!==expected.key||r.masterSha256!==expected.hash)resolution();};
        } else {
          const master=prior?.uploadMaster;
          if(!prior||prior.id!==source.orderId||prior.userId!==uid||master?.uid!==uid||master.designId!==source.designId||master.requiresUploadGrant!==false||master.contentType!=='image/png')resolution();
          const owner=createHash('sha256').update(uid).digest('hex').slice(0,32);
          if(master.masterKey!==`upload-orders/${process.env.LOB_ENV||process.env.NODE_ENV||'development'}/${owner}/order/${prior.id}.png`)resolution();
          bytes=await readPrivate(master.masterKey);masterSha256=master.masterSha256;ref=firestoreDb.collection('orders').doc(prior.id);
          expected={...master};
          validate=r=>{if(!r||r.userId!==uid||r.id!==source.orderId||!r.uploadMaster||canonicalWeddingJSON(r.uploadMaster)!==canonicalWeddingJSON(expected))resolution();};
        }
        if(sha(bytes)!==masterSha256)resolution();
        assertNormalizedWeddingFront(bytes);
        const assertCurrent=async(tx?:Tx)=>{await policy(tx);validate((tx?await tx.get(ref):await ref.get()).data());};
        await assertCurrent();
        return {bytes,sha256:masterSha256,assertCurrent};
      } catch(error) {
        // Preserve the existing explicit-resolution UI contract. Storage outages
        // remain retryable; authorization/provenance failures expose no source.
        if(error instanceof AccountError||error instanceof UploadError||(error instanceof Error&&error.name==='WeddingArtworkError'&&Number((error as any).status)<500))resolution();
        throw error;
      }
    },
  };
}
export const transferArtworkBoundary=createTransferArtworkBoundary();
