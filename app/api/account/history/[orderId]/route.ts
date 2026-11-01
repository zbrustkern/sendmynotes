import { NextRequest } from 'next/server';
import { AccountError, accountError, accountJson, requireAccountActor } from '@/lib/account/http';
import { getAccountHistoryOrder } from '@/lib/account/history';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const actor = await requireAccountActor(req);
    const { orderId } = await params;
    const result = await getAccountHistoryOrder(actor, orderId);
    if (!result) throw new AccountError('not_found', 'This card is not available in your account.', 404);
    return accountJson(result.order);
  } catch (error) { return accountError(error); }
}
