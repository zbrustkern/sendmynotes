import { NextRequest, NextResponse } from 'next/server';
import { UploadError } from '@/lib/upload/contracts';
import { getDesign, getGeneration, getPrivateAsset, readPrivateAsset, requireActiveGrant, requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{kind:string;id:string}>}) { try { const actor=await requireUploadActor(req); await requireActiveGrant(actor.uid,'read'); const {kind,id}=await params; let key:string|undefined;
 if(kind==='asset'){const row=await getPrivateAsset(actor.uid,id); key=row?.key;}
 else if(kind==='generation'){const row=await getGeneration(id); if(row?.uid===actor.uid && row.status==='ready' && row.expiresAt>Date.now()) key=row.key;}
 else if(kind==='design'){const row=await getDesign(id); if(row?.uid===actor.uid && row.expiresAt>Date.now()) key=row.masterKey;}
 else throw new UploadError('not_found','Preview not found.',404);
 if(!key) throw new UploadError('not_found','Preview not found.',404); const bytes=await readPrivateAsset(key); return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Authorization,Cookie'}});
 }catch(e){return uploadErrorResponse(e);} }
