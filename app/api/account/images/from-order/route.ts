import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor, readAccountBody } from '@/lib/account/http';
import { saveHistoricalOrderFront } from '@/lib/account/images';
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req, true); const body = await readAccountBody(req);
    const image = await saveHistoricalOrderFront(actor, body.orderId, body.title || 'Card front', req.headers.get('Idempotency-Key'));
    return accountJson({ image }, 201);
  } catch (error) { return accountError(error); }
}
