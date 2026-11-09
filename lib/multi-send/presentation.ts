import type { Order } from '../types';
import type { Delivery } from './orders';

export type DeliveryView = {
  id: string; name: string; address: Order['recipientAddress'];
  greeting: string; message: string; status: string; needsSupport: boolean;
};
export type MultiSendView = { quantity: number; redacted: boolean; deliveries: DeliveryView[] };

export function deliveryStatus(state: string): { label: string; needsSupport: boolean } {
  switch (state) {
    case 'MAILED': return { label: 'Mailed', needsSupport: false };
    case 'ACCEPTED': return { label: 'Being prepared', needsSupport: false };
    case 'REJECTED': case 'REJECTED_NOT_SENT': return { label: 'Needs attention · not sent', needsSupport: true };
    case 'DISPATCH_UNCERTAIN': return { label: 'Checking this card', needsSupport: false };
    case 'REFUND_PENDING': return { label: 'Refund being checked', needsSupport: false };
    case 'REFUNDED': return { label: 'Refunded', needsSupport: false };
    case 'CANCELED_NOT_SENT': return { label: 'Canceled · not sent', needsSupport: false };
    default: return { label: 'Preparing your card', needsSupport: false };
  }
}
/** Explicit projection: supplier errors, fences, metadata and credentials never reach customers. */
export function projectMultiSendView(order: Order, children: Delivery[], authorized: boolean): MultiSendView | undefined {
  if (order.multiSend?.kind !== 'parent') return undefined;
  const quantity = order.multiSend.recipients.length;
  if (!authorized) return { quantity, redacted: true, deliveries: [] };
  return { quantity, redacted: false, deliveries: order.multiSend.recipients.map(recipient => {
    const child = children.find(row => row.parentOrderId === order.id && row.recipientId === recipient.id);
    const status = order.status === 'PENDING_PAYMENT'
      ? {label: 'Awaiting payment', needsSupport: false}
      : order.fulfillmentStatus === 'MULTI_SEND_HELD' && (!child || child.state === 'PENDING')
        ? {label: 'On hold', needsSupport: false}
        : deliveryStatus(child?.state || 'PENDING');
    return { id: recipient.id, name: [recipient.address.firstName, recipient.address.lastName].filter(Boolean).join(' '),
      address: child?.correctedAddress || child?.address || recipient.address, greeting: recipient.resolvedGreeting,
      message: recipient.printedMessage, status: status.label, needsSupport: status.needsSupport };
  }) };
}
