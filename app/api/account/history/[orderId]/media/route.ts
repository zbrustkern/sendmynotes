import { NextRequest, NextResponse } from 'next/server';
import { resolveOwnedOrderFront } from '@/lib/account/order-front';
import { PRIVATE_HEADERS, accountError, requireAccountActor } from '@/lib/account/http';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const actor = await requireAccountActor(req);
    const { orderId } = await params;
    const front = await resolveOwnedOrderFront(actor, orderId);
    return new NextResponse(new Uint8Array(front.bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': front.contentType, 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return accountError(error); }
}
