import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getActiveStandards, getDesign, getGeneration, getPrivateAsset, putPrivateAsset, readPrivateAsset, reserveGeneration, finishGeneration, requireActiveGrant, markGenerationStarted } from './access';
import { UploadDesign, UploadError, UploadGeneration, UploadOrderMaster, UploadSelection, UPLOAD_LIMITS } from './contracts';
import { buildUploadImagePrompt } from './prompt';
import { generateReferenceImage } from './provider';

export type GenerationResult = { generation: Pick<UploadGeneration, 'id'|'status'|'standardsVersion'|'error'> };
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export async function createUploadGeneration(uid: string, idempotencyKey: string, assetId: string, imagePrompt: string, standardsVersion: number): Promise<GenerationResult> {
  if (typeof imagePrompt !== 'string' || imagePrompt.length > UPLOAD_LIMITS.promptChars) throw new UploadError('invalid_prompt','Image instructions must be 1,000 characters or fewer.');
  const asset = await getPrivateAsset(uid, assetId);
  if (!asset) throw new UploadError('not_found','Image could not be found.',404);
  const requestHash=sha(JSON.stringify({assetId,imagePrompt,standardsVersion}));
  const reserved=await reserveGeneration(uid,idempotencyKey,requestHash,assetId,standardsVersion);
  if (reserved.replay) return {generation:{id:reserved.generation.id,status:reserved.generation.status,standardsVersion:reserved.generation.standardsVersion,error:reserved.generation.error}};
  const generation=reserved.generation;
  let providerModel:string|undefined;let harnessVersion:string|undefined;
  try {
    const standards=await getActiveStandards();
    if (standards.version!==standardsVersion) throw new UploadError('standards_changed','Upload standards changed. Reload before generating.',409);
    await requireActiveGrant(uid,'work');
    const currentAsset=await getPrivateAsset(uid,assetId);
    if(!currentAsset)throw new UploadError('source_deleted','Image was removed before artwork creation started.',409);
    const source=await readPrivateAsset(currentAsset.key);
    const prompt=buildUploadImagePrompt(imagePrompt,standards);
    await markGenerationStarted(uid,generation.id,assetId);
    providerModel=(process.env.UPLOAD_IMAGE_MODEL||'gemini-nano-banana-2.1').trim();harnessVersion='upload-image-harness-v1';
    const result=await generateReferenceImage({prompt,referencePng:source});
    providerModel=result.model;
    let normalized:Buffer;
    try{normalized=await sharp(result.png,{failOn:'error',limitInputPixels:40_000_000}).rotate().resize(UPLOAD_LIMITS.width,UPLOAD_LIMITS.height,{fit:'cover',position:'centre'}).toColourspace('srgb').png().toBuffer();}
    catch{throw new UploadError('provider_invalid_image','Image creation returned an image we could not prepare. Your request was not replaced with another image.',502);}
    await requireActiveGrant(uid,'work');
    if(!await getPrivateAsset(uid,assetId))throw new UploadError('source_deleted','Image was removed while artwork was being created.',409);
    const key=await putPrivateAsset(uid,'generation',normalized);
    const ready={...generation,...(providerModel?{providerModel}:{}),...(harnessVersion?{harnessVersion}:{}),status:'ready' as const,key};
    await finishGeneration(ready);
    return {generation:{id:ready.id,status:ready.status,standardsVersion:ready.standardsVersion}};
  } catch(error) {
    // Known provider/application responses are terminal. A thrown fetch timeout
    // or connection error is ambiguous and must never trigger an automatic retry.
    const outcomeUnknown=!(error instanceof UploadError)||error.code==='provider_outcome_unknown';
    const failureCode=error instanceof UploadError&&!outcomeUnknown?error.code:'provider_outcome_unknown';
    const failed: UploadGeneration={...generation,...(providerModel?{providerModel}:{}),...(harnessVersion?{harnessVersion}:{}),status:outcomeUnknown?'unresolved':'failed',error:failureCode};
    await finishGeneration(failed);
    return {generation:{id:generation.id,status:failed.status,standardsVersion:generation.standardsVersion,error:failed.error}};
  }
}

export async function getUploadGeneration(uid:string,id:string):Promise<GenerationResult> {
  await requireActiveGrant(uid,'read');
  const generation=await getGeneration(id);
  if(!generation||generation.uid!==uid)throw new UploadError('not_found','Generation not found.',404);
  return {generation:{id:generation.id,status:generation.status,standardsVersion:generation.standardsVersion,error:generation.error}};
}

export async function validateUploadCheckoutSelection(uid: string, selection: UploadSelection): Promise<UploadDesign> {
  if (!selection || selection.source!=='upload' || selection.accepted!==true || !selection.designId || selection.revision!==1 || !/^[a-f0-9]{64}$/.test(selection.masterSha256)) throw new UploadError('invalid_upload_selection','Choose a valid accepted card front.',400);
  await requireActiveGrant(uid,'checkout');
  const design=await getDesign(selection.designId);
  if (!design || design.uid!==uid || design.revision!==selection.revision || design.masterSha256!==selection.masterSha256 || !design.acceptedAt || design.ordered) throw new UploadError('invalid_upload_selection','This card front is no longer available. Choose it again.',409);
  const bytes=await readPrivateAsset(design.masterKey);
  if(sha(bytes)!==design.masterSha256)throw new UploadError('invalid_upload_selection','This card front could not be verified. Choose it again.',409);
  return design;
}

export async function readAcceptedMaster(master: UploadOrderMaster): Promise<Buffer> {
  if(!master||!master.uid||!master.designId||master.revision!==1||!master.masterKey||!/^[a-f0-9]{64}$/.test(master.masterSha256))throw new UploadError('invalid_order_master','Card artwork could not be resolved.',409);
  const bytes=await readPrivateAsset(master.masterKey);
  if(sha(bytes)!==master.masterSha256)throw new UploadError('invalid_order_master','Card artwork could not be verified.',409);
  return bytes;
}
