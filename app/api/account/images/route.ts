import { NextRequest, NextResponse } from 'next/server';
import { accountError, accountJson, PRIVATE_HEADERS, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { listAccountImages, saveStudioSource } from '@/lib/account/images';

export async function GET(req: NextRequest) {
  try { const actor = await requireAccountActor(req); const cursor = req.nextUrl.searchParams.get('cursor') || undefined; return NextResponse.json(await listAccountImages(actor, cursor), { headers: PRIVATE_HEADERS }); }
  catch (error) { return accountError(error); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req, true); const body = await readAccountBody(req);
    const image = await saveStudioSource(actor, { sourceAssetId: body.sourceAssetId, uploadSelection: body.uploadSelection, title: body.title, idempotencyKey: req.headers.get('Idempotency-Key') });
    return accountJson(image, 201);
  } catch (error) { return accountError(error); }
}
