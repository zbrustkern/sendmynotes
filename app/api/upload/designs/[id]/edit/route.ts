import { NextRequest, NextResponse } from 'next/server';
import { requireUploadActor, uploadErrorResponse } from '@/lib/upload/access';
import { getStudioEditContext } from '@/lib/upload/studio-session';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUploadActor(req); const { id } = await params;
    return NextResponse.json({ edit: await getStudioEditContext(actor.uid, id) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return uploadErrorResponse(error); }
}
