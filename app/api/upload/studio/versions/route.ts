import { NextRequest, NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/upload/http';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { listStudioVersions, selectStudioVersion } from '@/lib/upload/studio-session';
import { UploadError } from '@/lib/upload/contracts';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const actor = await requireUploadActor(req); const assetId = req.nextUrl.searchParams.get('assetId') || '';
    return NextResponse.json(await listStudioVersions(actor.uid, assetId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return uploadErrorResponse(error); }
}
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) throw new UploadError('origin_forbidden', 'Request origin is not allowed.', 403);
    const actor = await requireUploadActor(req); const body = await req.json();
    if (typeof body.assetId !== 'string' || typeof body.designId !== 'string') throw new UploadError('invalid_selection', 'Choose a private version to preview.', 400);
    return NextResponse.json(await selectStudioVersion(actor.uid, body.assetId, body.designId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return uploadErrorResponse(error); }
}
