import { NextRequest, NextResponse } from 'next/server';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { getUploadGeneration } from '@/lib/upload/generation';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await requireUploadActor(req);const {id}=await params;return NextResponse.json(await getUploadGeneration(actor.uid,id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return uploadErrorResponse(error);}}
