import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdminActor } from '@/lib/admin-auth';
import { getOrderById } from '@/lib/firebase-admin';
import { isMultiSendOrder, listMultiSendDeliveries } from '@/lib/multi-send/orders';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
/** Operational metadata only. Private recipient content uses the existing audited reveal. */
export async function GET(req: NextRequest) {
  if (!getAuthenticatedAdminActor(req)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  const id = req.nextUrl.searchParams.get('orderId') || '';
  if (!/^[\w-]{1,100}$/.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400, headers });
  const order = await getOrderById(id);
  if (!isMultiSendOrder(order)) return NextResponse.json({ error: 'Multi-send order not found.' }, { status: 404, headers });
  const children = await listMultiSendDeliveries(id);
  return NextResponse.json({ quantity: order.multiSend.recipients.length, held: order.fulfillmentStatus === "MULTI_SEND_HELD", deliveries: order.multiSend.recipients.map((recipient, index) => {
    const child = children.find(row => row.parentOrderId === id && row.recipientId === recipient.id);
    return { id: recipient.id, number: index + 1, state: child?.state || 'AWAITING_MANIFEST', stateVersion: child?.stateVersion || 0, amountInCents: recipient.amountInCents, hasSupplierId: Boolean(child?.supplierOrderId), hasRefundId: Boolean(child?.refundId) };
  }) }, { headers });
}
