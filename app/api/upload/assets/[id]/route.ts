import { NextRequest, NextResponse } from 'next/server';
import { UploadError } from '@/lib/upload/contracts';
import { deleteUploadAssetTree, getPrivateAsset, requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { isSameOrigin } from '@/lib/upload/http';
export const dynamic='force-dynamic';
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}) { try { if(!isSameOrigin(req)) throw new UploadError('origin_forbidden','Request origin is not allowed.',403); const a=await requireUploadActor(req); const {id}=await params;
 await deleteUploadAssetTree(a.uid,id);
 return NextResponse.json({deleted:true},{headers:{'Cache-Control':'private, no-store'}}); } catch(e){return uploadErrorResponse(e);} }
