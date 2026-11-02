import { NextRequest, NextResponse } from 'next/server';
import { getActiveStandards, requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { isSameOrigin } from '@/lib/upload/http';
import { createUploadGeneration } from '@/lib/upload/generation';

export const runtime='nodejs';export const maxDuration=180;
export async function POST(req:NextRequest){try{
  if(!isSameOrigin(req))return NextResponse.json({error:'Request origin could not be verified.',code:'origin_denied'},{status:403});
  const actor=await requireUploadActor(req);const body=await req.json();
  const active=await getActiveStandards();
  const version=body.standardsVersion===undefined?active.version:body.standardsVersion;
  const result=await createUploadGeneration(actor.uid,req.headers.get('idempotency-key')||'',body.assetId,body.imagePrompt,version);
  return NextResponse.json(result,{status:result.generation.status==='pending'?202:200,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return uploadErrorResponse(error);}}
