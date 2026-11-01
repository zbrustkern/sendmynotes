import { NextRequest, NextResponse } from 'next/server';
import { readOrderUploadMaster } from '@/lib/upload/order-master';
import { getOrdersCollection, isFirestoreMock } from '@/lib/firebase-admin';
import { getAccountHistoryOrder } from '@/lib/account/history';
import { AccountError, PRIVATE_HEADERS, accountError, requireAccountActor } from '@/lib/account/http';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const actor = await requireAccountActor(req);
    const { orderId } = await params;
    const owned = await getAccountHistoryOrder(actor, orderId);
    if (!owned) throw new AccountError('not_found', 'Card front not found.', 404);
    const snap = await getOrdersCollection().doc(orderId).get();
    const raw = snap.data() as any;
    if (raw?.uploadMaster && owned.hasPrivateMaster) {
      const bytes = await readOrderUploadMaster(raw.uploadMaster);
      return new NextResponse(new Uint8Array(bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (!owned.safePublicFront || isFirestoreMock) throw new AccountError('not_found', 'A saved front is not available for this older card.', 404);
    const file = owned.safePublicFront;
    const response = await fetch(new URL(file, req.nextUrl.origin), { cache: 'no-store' });
    if (!response.ok) throw new AccountError('not_found', 'A saved front is not available for this older card.', 404);
    return new NextResponse(await response.arrayBuffer(), { headers: { ...PRIVATE_HEADERS, 'Content-Type': response.headers.get('content-type') || 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return accountError(error); }
}
