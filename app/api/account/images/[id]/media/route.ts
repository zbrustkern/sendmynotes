import { NextRequest, NextResponse } from 'next/server';
import { accountError, requireAccountActor, PRIVATE_HEADERS } from '@/lib/account/http';
import { readAccountImageMedia } from '@/lib/account/images';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req); const { id } = await params; const media = await readAccountImageMedia(actor, id); return new NextResponse(new Uint8Array(media.bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': media.contentType, 'X-Content-Type-Options': 'nosniff' } }); }
  catch (error) { return accountError(error); }
}
