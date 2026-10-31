import { NextRequest, NextResponse } from 'next/server';
import { UploadError } from '@/lib/upload/contracts';
import { normalizeUploadImage } from '@/lib/upload/media';
import { isSameOrigin } from '@/lib/upload/http';
import { getActiveUploadAssetCount, getUploadAccess, putPrivateAsset, requireActiveGrant, requireUploadActor, uploadCollections, uploadErrorResponse } from '@/lib/upload/access';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
 try {
  if (!isSameOrigin(req)) throw new UploadError('origin_forbidden','Request origin is not allowed.',403);
  const actor = await requireUploadActor(req); await requireActiveGrant(actor.uid,'work');
  const contentLength=Number(req.headers.get('content-length'));
  if(Number.isFinite(contentLength)&&contentLength>16*1024*1024) throw new UploadError('file_too_large','Image must be 15 MB or smaller.',413);
  if(await getActiveUploadAssetCount(actor.uid)>=20) throw new UploadError('asset_limit','Remove an existing image before uploading another.',429);
  const form = await req.formData(); const input = form.get('file');
  if (!(input instanceof File)) throw new UploadError('invalid_file','Choose a JPEG, PNG, or WebP image.',400);
  if(input.size<=0||input.size>15*1024*1024) throw new UploadError('file_too_large','Image must be 15 MB or smaller.',413);
  if (input.name.length > 255 || /[\/\\\u0000-\u001f\u007f]/.test(input.name)) throw new UploadError('invalid_filename','Image filename is invalid.',400);
  const raw = Buffer.from(await input.arrayBuffer());
  const normalized = await normalizeUploadImage(raw,input.type);
  const width = normalized.width, height = normalized.height;
  const key = await putPrivateAsset(actor.uid,'source',normalized.bytes); const id = key.split('/').at(-1)!.replace('.png','');
  const createdAt = Date.now(), expiresAt = createdAt + 7*86400000;
  await uploadCollections.col('uploadAssets').doc(uploadCollections.envKey(id)).create({ id, uid:actor.uid, key, width, height, mimeType:'image/png', createdAt, expiresAt });
  const access = await getUploadAccess(actor.uid);
  return NextResponse.json({ asset:{ id,width,height,mimeType:'image/png',expiresAt }, ...(normalized.warning ? { warning:normalized.warning } : {}), quota:{used:access.used,dailyLimit:access.dailyLimit} },{status:201,headers:{'Cache-Control':'private, no-store'}});
 } catch(e) { return uploadErrorResponse(e); }
}
