import * as admin from 'firebase-admin';
import {createHash} from 'node:crypto';
import {firestoreDb, isFirestoreMock} from '../firebase-admin';
import {ARTWORK_LIMITS, WeddingArtworkError} from './artwork-policy';
export {firestoreDb};
export const artworkSha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export const artworkProjectSegment = (projectId: string) => artworkSha(projectId).slice(0,32);
export function assertWeddingArtworkRuntime() {
  if (process.env.NODE_ENV === 'test' && isFirestoreMock) throw new WeddingArtworkError('storage_unavailable','Use an isolated artwork test adapter.',503);
  if (isFirestoreMock || process.env.FIREBASE_PROJECT_ID !== 'sendmynotes-staging' || process.env.STAGING_REVIEW_ONLY !== 'true' || process.env.HANDWRYTTEN_TEST_MODE !== 'true' || process.env.UPLOAD_PRIVATE_BUCKET !== 'sendmynotes-staging-upload-private') throw new WeddingArtworkError('staging_only','Wedding photo processing is available only in the staging pilot.',503);
}
export interface ArtworkObjectStore {
  putOnce(key: string, bytes: Buffer, mime: string): Promise<{generation: string}>;
  read(key: string, maxBytes: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
  removeOrphan?(key: string): Promise<void>;
}
function validKey(key: string) {
  if (!/^wedding-(?:pending|normalized|paid-retained)\/staging\/[a-f0-9]{32}\/[A-Za-z0-9_-]{1,128}\.(?:png|bin)$/.test(key)) throw new WeddingArtworkError('not_found','Card front not found.',404);
}
async function privateBucket() {
  assertWeddingArtworkRuntime();
  const bucket = admin.storage().bucket(process.env.UPLOAD_PRIVATE_BUCKET);
  const [metadata] = await bucket.getMetadata();
  if (metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true || metadata.iamConfiguration?.publicAccessPrevention !== 'enforced') throw new WeddingArtworkError('storage_policy','Private artwork storage is unavailable.',503);
  return bucket;
}
export const weddingArtworkObjects: ArtworkObjectStore = {
  async putOnce(key,bytes,mime) {
    validKey(key);
    const bucket=await privateBucket(), file=bucket.file(key), sha256=artworkSha(bytes);
    try {
      await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},public:false,validation:'crc32c',metadata:{contentType:mime,cacheControl:'private, no-store, max-age=0',metadata:{private:'true',sha256,policy:'wedding-raster-v1'}}});
    } catch(error) {
      if (Number((error as {code?:unknown}).code)!==412) throw error;
      const old=await this.read(key,ARTWORK_LIMITS.outputBytes);
      if(artworkSha(old)!==sha256)throw new WeddingArtworkError('asset_conflict','Stored card front does not match this request.',409);
    }
    const [metadata]=await file.getMetadata();
    if (metadata.metadata?.sha256!==sha256 || Number(metadata.size)!==bytes.length) throw new WeddingArtworkError('asset_conflict','Stored card front could not be verified.',409);
    return {generation:String(metadata.generation)};
  },
  async read(key,maxBytes) {
    validKey(key);
    const file=(await privateBucket()).file(key);
    try {
      const [metadata]=await file.getMetadata();
      if (Number(metadata.size)>maxBytes || Number(metadata.size)<=0)throw new WeddingArtworkError('invalid_asset','Stored card front is invalid.',409);
      const chunks:Buffer[]=[];let size=0;
      // Do not permit a metadata/read race to switch generations or download an unbounded object.
      const stream=file.bucket.file(key,{generation:metadata.generation}).createReadStream({validation:'crc32c'});
      for await(const value of stream){const chunk=Buffer.from(value);size+=chunk.length;if(size>maxBytes){stream.destroy();throw new WeddingArtworkError('invalid_asset','Stored card front is invalid.',409);}chunks.push(chunk);}
      return Buffer.concat(chunks,size);
    } catch(error) {if(Number((error as {code?:unknown}).code)===404)throw new WeddingArtworkError('not_found','Card front not found.',404);throw error;}
  },
  async removeOrphan(key) {
    validKey(key);
    if(!key.startsWith('wedding-normalized/'))throw new WeddingArtworkError('retained_asset','This card front is retained.',409);
    await (await privateBucket()).file(key).delete({ignoreNotFound:true});
  },
  async remove(key) {
    validKey(key);
    // This lane's cleanup can never remove immutable paid artwork or project masters.
    if (!key.startsWith('wedding-pending/'))throw new WeddingArtworkError('retained_asset','This card front is retained.',409);
    await (await privateBucket()).file(key).delete({ignoreNotFound:true});
  },
};
