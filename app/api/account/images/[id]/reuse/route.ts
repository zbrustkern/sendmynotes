import { NextRequest, NextResponse } from 'next/server';
import { accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { reuseAccountImage } from '@/lib/account/images';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAccountActor(req, true); const { id } = await params; const body = await readAccountBody(req);
    const result = await reuseAccountImage(actor, id, body.selection as never, req.headers.get('Idempotency-Key'));
    if (result.studioUrl) return accountJson({ studioUrl: result.studioUrl });
    return accountJson({ draft: result.draft });
  } catch (error) { return accountError(error); }
}
