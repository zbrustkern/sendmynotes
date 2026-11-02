import { createHash } from 'node:crypto';
import { getOrdersCollection } from '@/lib/firebase-admin';
import { putPrivateOrderAsset } from '@/lib/upload/access';
import { readOrderUploadMaster } from '@/lib/upload/order-master';
import type { UploadOrderMaster } from '@/lib/upload/contracts';
import type { Order } from '@/lib/types';
import { AccountError } from './http';
import type { AccountActor } from './contracts';
import { getAccountHistoryOrder } from './history';
import { isTrustedOrderFrontSource, readTrustedOrderFrontSource, trustedImageContentType } from './trusted-art';

export type OwnedOrderFront = {
  bytes: Buffer;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  sha256: string;
  source: 'upload_master' | 'preset' | 'generated';
  requiresUploadGrant: boolean;
};
type ResolverDependencies = {
  readMaster?: typeof readOrderUploadMaster;
  readSource?: typeof readTrustedOrderFrontSource;
};

/** Resolve the original front only after the account history service proves order ownership and eligibility. */
export async function resolveOwnedOrderFront(actor:AccountActor,orderId:string,deps:ResolverDependencies={}):Promise<OwnedOrderFront>{
  const owned=await getAccountHistoryOrder(actor,orderId);
  if(!owned)throw new AccountError('not_found','This card front is not available in your account.',404);
  const snapshot=await getOrdersCollection().doc(orderId).get();const order=snapshot.data() as Order|undefined;
  if(!order)throw new AccountError('not_found','This card front is not available in your account.',404);
  let bytes:Buffer;let source:OwnedOrderFront['source'];let requiresUploadGrant=false;
  if(order.uploadMaster){
    if(order.uploadMaster.uid!==actor.uid)throw new AccountError('not_found','This card front is not available in your account.',404);
    bytes=await (deps.readMaster||readOrderUploadMaster)(order.uploadMaster);source='upload_master';requiresUploadGrant=order.uploadMaster.requiresUploadGrant!==false;
  }else{
    const path=owned.safePublicFront||order.frontImageUrl;
    if(!isTrustedOrderFrontSource(path))throw new AccountError('source_unavailable','This older card front is no longer available.',404);
    bytes=await (deps.readSource||readTrustedOrderFrontSource)(path);source=path.startsWith('/presets/')?'preset':'generated';
  }
  if(!bytes.length||bytes.length>15*1024*1024)throw new AccountError('invalid_image','This card front is too large to open.',413);
  const mime=await trustedImageContentType(bytes);
  return {bytes,contentType:mime,sha256:createHash('sha256').update(bytes).digest('hex'),source,requiresUploadGrant};
}

type PinDependencies={readSource?:typeof readTrustedOrderFrontSource;writeMaster?:typeof putPrivateOrderAsset};
/** Copy a trusted generated front to immutable private order storage before checkout acceptance. */
export async function pinGeneratedOrderMaster(uid:string,orderId:string,frontImageUrl:unknown,deps:PinDependencies={}):Promise<UploadOrderMaster|undefined>{
  if(typeof frontImageUrl!=='string'||frontImageUrl.startsWith('/presets/'))return undefined;
  if(!/^order_[A-Za-z0-9_-]{1,128}$/.test(orderId)||!uid||uid.length>128)throw new AccountError('invalid_order','Order artwork identity is invalid.',400);
  if(!isTrustedOrderFrontSource(frontImageUrl))throw new AccountError('source_unavailable','The accepted card front could not be saved safely. Choose it again before continuing.',409);
  // This is called only for the source already accepted by checkout. Do not
  // query image_cache_pool by full URL: its legacy inline data URLs can exceed
  // Firestore's indexed field limit. Ownership comes from the order/actor; the
  // source reader below independently constrains accepted URL/data formats.
  const original=await (deps.readSource||readTrustedOrderFrontSource)(frontImageUrl);
  const mime=await trustedImageContentType(original);
  const hash=createHash('sha256').update(original).digest('hex');
  const masterKey=await (deps.writeMaster||putPrivateOrderAsset)(uid,orderId,original,mime);
  return {designId:`generated_${orderId}`,revision:1,masterSha256:hash,masterKey,uid,requiresUploadGrant:false,contentType:mime};
}
