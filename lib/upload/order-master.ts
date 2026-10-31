import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireUploadActor, putPrivateOrderAsset, readPrivateAsset } from './access';
import { UploadError, type UploadDesign, type UploadOrderMaster } from './contracts';
import { isSameOrigin } from './http';
import { validateUploadCheckoutSelection } from './generation';
import type { Order } from '../types';

type PinDependencies = {
  actor: typeof requireUploadActor;
  validate: (uid: string, selection: unknown) => Promise<UploadDesign>;
  read: typeof readPrivateAsset;
  write: typeof putPrivateOrderAsset;
};
const defaultPinDependencies: PinDependencies = {
  actor: requireUploadActor, validate: (uid, selection) => validateUploadCheckoutSelection(uid, selection as never), read: readPrivateAsset, write: putPrivateOrderAsset,
};

/** Copy the verified accepted master before payment/offer side effects. The order
 * copy lives outside draft cleanup and cannot change with grants or recomposition. */
export async function pinUploadOrderMaster(req: NextRequest, body: Record<string, unknown>, orderId: string, deps: PinDependencies = defaultPinDependencies): Promise<UploadOrderMaster | undefined> {
  if (body.uploadDesign === undefined) {
    if (typeof body.frontImageUrl === 'string' && (/^(blob:|upload:)/.test(body.frontImageUrl) || body.frontImageUrl.includes('/api/upload/'))) {
      throw new UploadError('upload_selection_required', 'Select your accepted upload cover again.', 400);
    }
    return undefined;
  }
  if (body.frontImageUrl !== undefined && body.frontImageUrl !== null && body.frontImageUrl !== '') {
    throw new UploadError('mixed_cover', 'Choose one card front.', 400);
  }
  if (!/^order_[a-zA-Z0-9_-]{1,128}$/.test(orderId)) throw new UploadError('invalid_order_id', 'Invalid order identity.', 400);
  if (!isSameOrigin(req)) throw new UploadError('origin_forbidden', 'Request origin is not allowed.', 403);
  const actor = await deps.actor(req);
  const design = await deps.validate(actor.uid, body.uploadDesign);
  const bytes = await deps.read(design.masterKey);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== design.masterSha256) throw new UploadError('master_mismatch', 'Your card front could not be verified. Please preview it again.', 409);
  const masterKey = await deps.write(actor.uid, orderId, bytes);
  return { designId: design.id, revision: design.revision, masterSha256: hash, masterKey, uid: actor.uid };
}

export async function readOrderUploadMaster(master: UploadOrderMaster): Promise<Buffer> {
  const ownerHash = createHash('sha256').update(master.uid).digest('hex').slice(0,32);
  if (!master.masterKey.startsWith('upload-orders/') || master.masterKey.split('/')[2] !== ownerHash) throw new UploadError('invalid_order_master', 'Invalid saved order artwork.', 409);
  const bytes = await readPrivateAsset(master.masterKey);
  if (createHash('sha256').update(bytes).digest('hex') !== master.masterSha256) throw new UploadError('master_mismatch', 'Saved order artwork could not be verified.', 409);
  return bytes;
}

/** Private media never flows through public order JSON, email or image caches. */
export function stripPrivateOrderMedia<T extends Order>(order: T): Omit<T, 'uploadMaster'> {
  const { uploadMaster: _master, ...safe } = order;
  return safe;
}
