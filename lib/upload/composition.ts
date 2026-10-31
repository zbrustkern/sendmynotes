import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getActiveStandards, getDesign, getGeneration, getPrivateAsset, putDesign, putPrivateAsset, readPrivateAsset, requireActiveGrant, uploadCollections } from './access';
import { firestoreDb } from '../firebase-admin';
import { UploadAsset, UploadDesign, UploadError, UploadGeneration, UploadSelection, UploadTreatment, UPLOAD_LIMITS } from './contracts';
import { layoutTreatment, renderLetteringSvg } from './treatments';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function composeUploadDesign(uid:string,generationId:string,exactText:string,treatmentId:UploadTreatment):Promise<{design:{designId:string;revision:number;masterSha256:string;exactText:string;treatmentId:UploadTreatment;accepted:false}}> {
  await requireActiveGrant(uid,'work');
  const standards=await getActiveStandards();
  if(!standards.enabledTreatments.includes(treatmentId))throw new UploadError('treatment_disabled','Choose an available lettering style.',400);
  const generation=await getGeneration(generationId);
  if(!generation||generation.uid!==uid||generation.status!=='ready'||!generation.key)throw new UploadError('generation_not_ready','Create the illustration before composing the front.',409);
  const sourceAsset=await getPrivateAsset(uid,generation.assetId);
  if(!sourceAsset)throw new UploadError('source_deleted','This image has been removed.',409);
  const layout=layoutTreatment(exactText,treatmentId);
  const base=await readPrivateAsset(generation.key);
  const svg=renderLetteringSvg(layout);
  const master=svg.includes('<path')?await sharp(base).composite([{input:Buffer.from(svg),left:0,top:0}]).png().toBuffer():base;
  if(master.length>UPLOAD_LIMITS.bytes*4)throw new UploadError('composition_failed','Card front could not be prepared. Try shorter words.',500);
  await requireActiveGrant(uid,'work');
  if(!await getPrivateAsset(uid,generation.assetId))throw new UploadError('source_deleted','This image has been removed.',409);
  const id=randomUUID();const key=await putPrivateAsset(uid,'design',master);const masterSha256=sha(master);
  const record:UploadDesign & {layoutRecord:unknown;fontVersion:string;templateVersion:string}={
    id,uid,generationId,revision:1,masterSha256,masterKey:key,exactText,treatmentId,standardsVersion:generation.standardsVersion,
    createdAt:Date.now(),expiresAt:Date.now()+7*24*60*60*1000,layoutRecord:layout,fontVersion:'Fredoka-400/DM-Serif-Display-400-v1',templateVersion:'upload-lettering-v1',
  };
  try{await putDesign(record);}catch(error){throw error;}
  return {design:{designId:id,revision:1,masterSha256,exactText,treatmentId,accepted:false}};
}

export async function acceptUploadDesign(uid:string,id:string,revision:number,masterSha256:string):Promise<UploadSelection>{
  await requireActiveGrant(uid,'read');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||revision!==1||!/^[a-f0-9]{64}$/.test(masterSha256))throw new UploadError('not_found','Card front not found.',404);
  const preflight=await getDesign(id);
  if(!preflight||preflight.id!==id||preflight.uid!==uid||preflight.revision!==revision||preflight.masterSha256!==masterSha256||preflight.ordered)throw new UploadError('design_changed','This card front changed. Review it again before continuing.',409);
  const preflightGeneration=await getGeneration(preflight.generationId);
  if(!preflightGeneration||preflightGeneration.uid!==uid||preflightGeneration.status!=='ready')throw new UploadError('design_changed','This card front is no longer available. Review it again before continuing.',409);
  const masterBytes=await readPrivateAsset(preflight.masterKey);
  if(sha(masterBytes)!==preflight.masterSha256)throw new UploadError('design_changed','This card front could not be verified. Review it again.',409);
  const {col,envKey}=uploadCollections;
  const ref=col('uploadDesigns').doc(envKey(id));
  const generationRef=col('uploadGenerations').doc(envKey(preflight.generationId));
  const sourceRef=col('uploadAssets').doc(envKey(preflightGeneration.assetId));
  let selected:UploadDesign|undefined;
  await firestoreDb.runTransaction(async tx=>{
    const snap=await tx.get(ref);const design=snap.data() as UploadDesign|undefined;
    const generationSnap=await tx.get(generationRef);const generation=generationSnap.data() as (UploadGeneration & {deletedAt?:number})|undefined;
    const sourceSnap=await tx.get(sourceRef);const source=sourceSnap.data() as (UploadAsset & {deletedAt?:number})|undefined;
    if(!design||design.id!==id||design.uid!==uid||design.revision!==revision||design.masterSha256!==masterSha256||design.expiresAt<=Date.now()||design.ordered||(design as UploadDesign & {deletedAt?:number}).deletedAt)throw new UploadError('design_changed','This card front changed. Review it again before continuing.',409);
    if(!generation||generation.uid!==uid||generation.id!==design.generationId||generation.status!=='ready'||generation.deletedAt||!source||source.uid!==uid||source.deletedAt)throw new UploadError('design_changed','This card front is no longer available. Review it again before continuing.',409);
    if(design.acceptedAt){selected=design;return;}
    const acceptedAt=Date.now();selected={...design,acceptedAt,expiresAt:acceptedAt+30*24*60*60*1000};tx.set(ref,selected);
  });
  if(!selected)throw new UploadError('not_found','Card front not found.',404);
  return {source:'upload',designId:selected.id,revision:selected.revision,masterSha256:selected.masterSha256,title:selected.exactText||'Your custom card front',accepted:true};
}

export async function getAcceptedUploadSelection(uid:string,id:string):Promise<UploadSelection>{
  await requireActiveGrant(uid,'read');
  const {getDesign}=await import('./access');const design=await getDesign(id);
  if(!design||design.uid!==uid||!design.acceptedAt)throw new UploadError('not_found','Accepted card front not found.',404);
  const bytes=await readPrivateAsset(design.masterKey);
  if(sha(bytes)!==design.masterSha256)throw new UploadError('design_changed','This card front could not be verified. Review it again.',409);
  return {source:'upload',designId:design.id,revision:design.revision,masterSha256:design.masterSha256,title:design.exactText||'Your custom card front',accepted:true};
}
