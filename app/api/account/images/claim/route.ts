import { NextRequest } from 'next/server';
import { accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { saveGeneratedClaim } from '@/lib/account/images';
export async function POST(req: NextRequest) {
  try { const actor = await requireAccountActor(req, true); const body = await readAccountBody(req); return accountJson(await saveGeneratedClaim(actor, body.capability, body.title, req.headers.get('Idempotency-Key')), 201); }
  catch (error) { return accountError(error); }
}
