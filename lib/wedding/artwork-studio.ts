import type {NextRequest} from 'next/server';
import {artworkId, WeddingArtworkError} from './artwork-policy';
import {artworkSha} from './artwork-storage';
import {storeWeddingGeneratedArtwork, type WeddingArtworkSelection} from './artwork';
type Context={signal:AbortSignal;authorize:()=>Promise<void>};
type StudioBoundary={
  actor:(req:Request)=>Promise<{uid:string}>;
  grant:(uid:string)=>Promise<unknown>;
  accepted:(uid:string,id:string)=>Promise<{masterSha256:string}>;
  design:(id:string)=>Promise<{uid:string;masterSha256:string;masterKey:string}|null>;
  read:(key:string)=>Promise<Buffer>;
  store:typeof storeWeddingGeneratedArtwork;
};
/** Account Studio is an independent capability: prove both the project session
 * and the current verified Firebase account/grant. Never issue a Studio grant. */
export function createWeddingStudioAdopter(boundary:StudioBoundary) {
  return async(req:Request,projectId:string,designId:string,ctx:Context):Promise<WeddingArtworkSelection>=>{
    artworkId(designId);
    const actor=await boundary.actor(req);await boundary.grant(actor.uid);
    const accepted=await boundary.accepted(actor.uid,designId),design=await boundary.design(designId);
    if(!design||design.uid!==actor.uid||design.masterSha256!==accepted.masterSha256)throw new WeddingArtworkError('not_found','Accepted Studio front not found.',404);
    const bytes=await boundary.read(design.masterKey);
    if(artworkSha(bytes)!==accepted.masterSha256)throw new WeddingArtworkError('asset_changed','The Studio front changed. Review it again.',409);
    return boundary.store(projectId,bytes,{...ctx,authorize:async()=>{
      await ctx.authorize();await boundary.grant(actor.uid);
      const current=await boundary.accepted(actor.uid,designId);
      if(current.masterSha256!==accepted.masterSha256)throw new WeddingArtworkError('asset_changed','The Studio front changed. Review it again.',409);
    }});
  };
}
export async function adoptWeddingStudioArtwork(req:Request,projectId:string,designId:string,ctx:Context) {
  const {requireUploadActor,requireActiveGrant,getDesign,readPrivateAsset}=await import('../upload/access');
  const {getAcceptedUploadSelection}=await import('../upload/composition');
  return createWeddingStudioAdopter({actor:r=>requireUploadActor(r as NextRequest),grant:uid=>requireActiveGrant(uid,'read'),accepted:getAcceptedUploadSelection,design:getDesign,read:readPrivateAsset,store:storeWeddingGeneratedArtwork})(req,projectId,designId,ctx);
}
