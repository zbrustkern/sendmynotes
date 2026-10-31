import { NextRequest, NextResponse } from 'next/server';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { isSameOrigin } from '@/lib/upload/http';
import { acceptUploadDesign } from '@/lib/upload/composition';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{if(!isSameOrigin(req))return NextResponse.json({error:'Request origin could not be verified.',code:'origin_denied'},{status:403});const actor=await requireUploadActor(req);const {id}=await params;const body=await req.json();return NextResponse.json({selection:await acceptUploadDesign(actor.uid,id,body.revision,body.masterSha256)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return uploadErrorResponse(error);}}
