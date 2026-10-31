import { NextRequest, NextResponse } from 'next/server';
import { UploadError } from '@/lib/upload/contracts';
import { requireUploadActor, uploadCollections, uploadErrorResponse } from '@/lib/upload/access';
import { firestoreDb } from '@/lib/firebase-admin';
import { isSameOrigin } from '@/lib/upload/http';
export const dynamic='force-dynamic';
/** Explicitly releases an already unresolved provider operation without retrying it or refunding quota. */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    if(!isSameOrigin(req)) throw new UploadError('origin_forbidden','Request origin is not allowed.',403);
    const actor=await requireUploadActor(req); const {id}=await params;
    const generationRef=uploadCollections.col('uploadGenerations').doc(uploadCollections.envKey(id));
    const pendingRef=uploadCollections.col('uploadPending').doc(uploadCollections.envKey(actor.uid));
    const eventRef=uploadCollections.col('uploadGenerationEvents').doc();
    await firestoreDb.runTransaction(async tx=>{
      const generationSnap=await tx.get(generationRef);
      const pendingSnap=await tx.get(pendingRef);
      const generation=generationSnap.data() as any;
      if(!generation||generation.id!==id||generation.uid!==actor.uid) throw new UploadError('not_found','Generation not found.',404);
      if(generation.status!=='unresolved') throw new UploadError('cannot_abandon','Only an unresolved generation can be abandoned.',409);
      if(pendingSnap.data()?.id!==id) throw new UploadError('already_resolved','This generation no longer holds the account lock.',409);
      tx.delete(pendingRef);
      tx.set(generationRef,{...generation,abandonedAt:Date.now()});
      tx.set(eventRef,{uid:actor.uid,generationId:id,operation:'explicit_abandon',createdAt:Date.now(),providerOutcome:'unknown',quotaRefunded:false});
    });
    return NextResponse.json({abandoned:true,warning:'The provider may have processed this request. Its allowance remains used.'},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return uploadErrorResponse(error); }
}
