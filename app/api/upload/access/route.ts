import { NextRequest, NextResponse } from 'next/server';
import { getUploadAccess, requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { try { const actor = await requireUploadActor(req); return NextResponse.json(await getUploadAccess(actor.uid), { headers: { 'Cache-Control': 'private, no-store' } }); } catch (e) { return uploadErrorResponse(e); } }
