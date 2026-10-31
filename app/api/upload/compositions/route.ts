import { NextRequest, NextResponse } from 'next/server';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { isSameOrigin } from '@/lib/upload/http';
import { UploadTreatment } from '@/lib/upload/contracts';
import { composeUploadDesign } from '@/lib/upload/composition';
export const runtime='nodejs';
export async function POST(req:NextRequest){try{if(!isSameOrigin(req))return NextResponse.json({error:'Request origin could not be verified.',code:'origin_denied'},{status:403});const actor=await requireUploadActor(req);const body=await req.json();return NextResponse.json(await composeUploadDesign(actor.uid,body.generationId,body.exactText,body.treatmentId as UploadTreatment),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return uploadErrorResponse(error);}}
