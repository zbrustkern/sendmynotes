import { NextRequest, NextResponse } from 'next/server';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { getAcceptedUploadSelection } from '@/lib/upload/composition';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await requireUploadActor(req);const {id}=await params;return NextResponse.json({selection:await getAcceptedUploadSelection(actor.uid,id)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return uploadErrorResponse(error);}}
