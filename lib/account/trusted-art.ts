import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AccountError } from './http';
import { validateCoverImagePathOrUrl } from '@/lib/handwrytten';

const MAX_BYTES = 15 * 1024 * 1024;
async function within<T>(promise:Promise<T>,milliseconds:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('storage read timed out')),milliseconds)})]);}
  finally{if(timer)clearTimeout(timer);}
}
const EXPECTED_BUCKETS = (): Set<string> => {
  const buckets = new Set([process.env.FIREBASE_STORAGE_BUCKET, process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET].filter((value): value is string => Boolean(value)));
  // Existing generated covers can outlive the explicit bucket env var. If the
  // Admin app has a default bucket, allow that exact bucket only.
  if (admin.apps.length) {
    try { const name = admin.storage().bucket().name; if (name) buckets.add(name); } catch { /* storage may not be configured */ }
  }
  return buckets;
};

export function trustedGeneratedObjectKey(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    let bucket = ''; let object = '';
    if (url.hostname.toLowerCase() === 'storage.googleapis.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      bucket = decodeURIComponent(parts.shift() || ''); object = decodeURIComponent(parts.join('/'));
    } else if (url.hostname.toLowerCase() === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (match) { bucket = decodeURIComponent(match[1]); object = decodeURIComponent(match[2]); }
    }
    if (!bucket || !EXPECTED_BUCKETS().has(bucket) || !/^covers\/[A-Za-z0-9_.\/-]+\.(?:png|jpe?g|webp)$/i.test(object) || object.split('/').some(part => !part || part === '.' || part === '..')) return null;
    return object;
  } catch { return null; }
}

export function isTrustedOrderFrontSource(source: unknown): boolean {
  if (typeof source !== 'string') return false;
  if (/^\/presets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(source)) return true;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(source) && source.length <= Math.ceil(MAX_BYTES * 4 / 3) + 128) return true;
  return trustedGeneratedObjectKey(source) !== null;
}

/** Read only static preset paths or generated objects from the configured covers/ bucket. */
export async function readTrustedOrderFrontSource(source: string): Promise<Buffer> {
  if (source.startsWith('/presets/')) {
    if (!/^\/presets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(source)) throw new AccountError('source_unavailable','This card front is unavailable.',404);
    const root=path.resolve(process.cwd(),'public'); const file=path.resolve(root,`.${source}`);
    if(!file.startsWith(`${root}${path.sep}`))throw new AccountError('source_unavailable','This card front is unavailable.',404);
    const info=await stat(file);if(!info.isFile()||!info.size||info.size>MAX_BYTES)throw new AccountError('invalid_image','This card front is too large to open.',413);
    const bytes=await readFile(file); if(!bytes.length||bytes.length>MAX_BYTES)throw new AccountError('invalid_image','This card front is too large to open.',413); return bytes;
  }
  if(source.startsWith('data:')){
    if(!isTrustedOrderFrontSource(source))throw new AccountError('source_unavailable','This card front is unavailable.',404);
    const bytes=Buffer.from(source.slice(source.indexOf(',')+1),'base64');if(!bytes.length||bytes.length>MAX_BYTES)throw new AccountError('invalid_image','This card front is too large to open.',413);return bytes;
  }
  validateCoverImagePathOrUrl(source);
  const object=trustedGeneratedObjectKey(source);
  if(!object||!admin.apps.length)throw new AccountError('source_unavailable','This older card front is no longer available.',404);
  const bucketName = new URL(source).hostname.toLowerCase() === 'storage.googleapis.com'
    ? decodeURIComponent(new URL(source).pathname.split('/').filter(Boolean)[0] || '')
    : decodeURIComponent(new URL(source).pathname.match(/^\/v0\/b\/([^/]+)\/o\//)?.[1] || '');
  const file=admin.storage().bucket(bucketName).file(object); const [metadata]=await within(file.getMetadata(),8_000);
  const size=Number(metadata.size||0); if(!size||size>MAX_BYTES)throw new AccountError('invalid_image','This card front is too large to open.',413);
  if (metadata.contentType && !/^image\/(?:png|jpeg|webp)$/i.test(metadata.contentType)) throw new AccountError('invalid_image','This saved card front is not a supported image.',422);
  // Do not rely on metadata as a hard memory bound: the object can change
  // between getMetadata and download. Consume a stream with a strict byte cap
  // and timeout instead of an unbounded download() buffer.
  const stream=file.createReadStream();
  const chunks:Buffer[]=[];let total=0;
  try {
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{stream.destroy(new Error('image read timed out'));},10_000);
      stream.on('data',(chunk:Buffer|string)=>{const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=bytes.length;if(total>MAX_BYTES){stream.destroy(new Error('image exceeds size limit'));return;}chunks.push(bytes);});
      stream.once('error',reject);stream.once('end',resolve);stream.once('close',()=>{if(total===0)reject(new Error('image stream was empty'));});
      stream.once('close',()=>clearTimeout(timer));
    });
  } catch { throw new AccountError('source_unavailable','This card front could not be opened safely.',404); }
  const bytes=Buffer.concat(chunks,total);if(!bytes.length||bytes.length>MAX_BYTES)throw new AccountError('invalid_image','This card front is too large to open.',413);return bytes;
}

export async function trustedImageContentType(bytes: Buffer): Promise<'image/png'|'image/jpeg'|'image/webp'> {
  try {
    const format = (await sharp(bytes,{failOn:'error',limitInputPixels:40_000_000,animated:false}).metadata()).format;
    if (format === 'jpeg') return 'image/jpeg';
    if (format === 'webp') return 'image/webp';
    if (format === 'png') return 'image/png';
  } catch { /* use a uniform error below */ }
  throw new AccountError('invalid_image','This saved card front is not a supported image.',422);
}

export async function normalizeOrderFront(raw: Buffer): Promise<{bytes:Buffer;width:number;height:number;sha256:string}> {
  try {
    const bytes=await sharp(raw,{failOn:'error',limitInputPixels:40_000_000,animated:false}).rotate().resize({width:1275,height:1650,fit:'cover',position:'centre'}).toColourspace('srgb').png().toBuffer();
    const metadata=await sharp(bytes).metadata();
    return {bytes,width:metadata.width||1275,height:metadata.height||1650,sha256:createHash('sha256').update(bytes).digest('hex')};
  } catch { throw new AccountError('invalid_image','This card front could not be prepared safely.',422); }
}
