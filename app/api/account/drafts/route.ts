import { NextRequest, NextResponse } from 'next/server';
import { accountError, accountJson, PRIVATE_HEADERS, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { createAccountDraft, listAccountDrafts } from '@/lib/account/drafts';
export async function GET(req: NextRequest) {
  try { const actor = await requireAccountActor(req); return NextResponse.json(await listAccountDrafts(actor, req.nextUrl.searchParams.get('cursor') || undefined), { headers: PRIVATE_HEADERS }); }
  catch (error) { return accountError(error); }
}
export async function POST(req: NextRequest) {
  try { const actor = await requireAccountActor(req, true); const body = await readAccountBody(req); const draft = await createAccountDraft(actor, { title: body.title, content: body.content, idempotencyKey: req.headers.get('Idempotency-Key') }); return accountJson(draft, 201); }
  catch (error) { return accountError(error); }
}
