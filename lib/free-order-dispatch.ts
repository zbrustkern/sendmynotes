import type { Order } from './types';
import type { fulfillHandwryttenOrder } from './handwrytten';
import type { updateOrderStatus } from './firebase-admin';
import type { logIncident } from './incident-logger';

type FulfillmentArgs = Parameters<typeof fulfillHandwryttenOrder>[0];
type FulfillmentResult = Awaited<ReturnType<typeof fulfillHandwryttenOrder>>;
type FreeOrderDispatchDependencies = {
  isPaused: () => Promise<boolean>;
  fulfill: (args: FulfillmentArgs) => Promise<FulfillmentResult>;
  updateStatus: typeof updateOrderStatus;
  logIncident: typeof logIncident;
};

export type FreeOrderDispatchResult =
  | { kind: 'accepted'; orderId?: string }
  | { kind: 'queued' }
  | { kind: 'uncertain' };

/**
 * Submit a claimed zero-balance order once. Supplier false/throw outcomes are
 * ambiguous unless the adapter explicitly grows a typed no-submission result;
 * leave them for reconciliation instead of making the order retryable.
 * Dependencies are injectable for hermetic tests; the route supplies the real
 * provider and persistence adapters.
 */
export async function submitFreeOrderToSupplier(
  order: Order,
  dependencies: FreeOrderDispatchDependencies,
): Promise<FreeOrderDispatchResult> {
  if (await dependencies.isPaused()) {
    await dependencies.updateStatus(order.id, {
      status: 'QUEUED_FOR_FULFILLMENT',
      fulfillmentError: 'Supplier submission is paused by an administrator; order remains queued.',
    });
    return { kind: 'queued' };
  }

  let result: FulfillmentResult;
  try {
    result = await dependencies.fulfill({
      orderId: order.id,
      imageUrl: order.frontImageUrl,
      ...(order.uploadMaster ? { uploadMaster: order.uploadMaster } : {}),
      printedGreeting: order.printedMessage,
      handwrittenMessage: order.handwrittenNote,
      fontId: order.fontStyleId || '1',
      recipient: order.recipientAddress,
      returnAddress: order.returnAddress,
      scheduledSendDate: order.scheduledSendDate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supplier submission outcome is unconfirmed.';
    await dependencies.updateStatus(order.id, {
      status: 'DISPATCH_UNCERTAIN',
      fulfillmentError: message || 'Supplier submission outcome is unconfirmed.',
    });
    await dependencies.logIncident({
      type: 'HANDWRYTTEN', severity: 'error',
      summary: `Supplier submission outcome is uncertain for free order ${order.id}`,
      technicalDetails: message || 'Supplier submission outcome is unconfirmed.',
      metadata: { orderId: order.id, discountCode: order.discountCode },
    }).catch(() => undefined);
    return { kind: 'uncertain' };
  }

  if (!result.success) {
    const message = result.error || 'Supplier submission outcome is unconfirmed.';
    await dependencies.updateStatus(order.id, { status: 'DISPATCH_UNCERTAIN', fulfillmentError: message });
    await dependencies.logIncident({
      type: 'HANDWRYTTEN', severity: 'error',
      summary: `Supplier submission outcome is uncertain for free order ${order.id}`,
      technicalDetails: message,
      metadata: { orderId: order.id, discountCode: order.discountCode },
    }).catch(() => undefined);
    return { kind: 'uncertain' };
  }

  return { kind: 'accepted', orderId: result.order_id };
}
