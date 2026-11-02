import { NextRequest } from 'next/server';
import { AccountError, accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { listPrivacyRequestsForOwner, submitPrivacyRequest } from '@/lib/account/privacy-requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req);
    return accountJson(await listPrivacyRequestsForOwner(actor));
  } catch (error) { return accountError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req, true);
    const body = await readAccountBody(req);
    if (body.kind !== 'export' && body.kind !== 'deletion') throw new AccountError('invalid', 'Choose a data export or account deletion request.');
    const result = await submitPrivacyRequest(actor, { kind: body.kind, confirm: body.confirm, idempotencyKey: req.headers.get('idempotency-key') || undefined });
    return accountJson(result.request, result.created ? 201 : 200);
  } catch (error) { return accountError(error); }
}
