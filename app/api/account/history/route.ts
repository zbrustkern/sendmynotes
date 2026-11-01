import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor } from '@/lib/account/http';
import { listAccountHistory } from '@/lib/account/history';

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req);
    const params = req.nextUrl.searchParams;
    const limitValue = params.get('limit');
    const result = await listAccountHistory(actor, { limit: limitValue ? Number(limitValue) : 20, cursor: params.get('cursor') || undefined, status: params.get('status') || 'all', search: params.get('q') || '' });
    return accountJson(result);
  } catch (error) { return accountError(error); }
}
