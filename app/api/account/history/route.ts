import { NextRequest, NextResponse } from 'next/server';
import { accountError, PRIVATE_HEADERS, requireAccountActor } from '@/lib/account/http';
import { listAccountHistory } from '@/lib/account/history';

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req);
    const params = req.nextUrl.searchParams;
    const limitValue = params.get('limit');
    const result = await listAccountHistory(actor, { limit: limitValue ? Number(limitValue) : 20, cursor: params.get('cursor') || undefined, status: params.get('status') || 'all', search: params.get('q') || '' });
    // listAccountHistory already returns the public pagination envelope.
    // Do not wrap it again as `{ data: { data, nextCursor } }`.
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) { return accountError(error); }
}
