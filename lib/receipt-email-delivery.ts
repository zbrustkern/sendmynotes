import { firestoreDb, getOrdersCollection, updateOrderStatus } from "./firebase-admin";
import type { Order } from "./types";

/** Shared atomic claim prevents webhook and contact recovery from sending twice. */
export async function claimReceiptEmailDelivery(orderId: string): Promise<Order | null> {
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = getOrdersCollection().doc(orderId);
    const snapshot = await tx.get(ref);
    const order = snapshot.exists ? snapshot.data() as Order : null;
    if (!order || order.receiptEmailSentAt || order.addressDeferredEmailSentAt) return null;
    if (order.receiptEmailDeliveryStatus === "pending" && Date.now() - (order.receiptEmailDeliveryStartedAt || 0) < 120_000) return null;
    tx.update(ref, { receiptEmailDeliveryStatus: "pending", receiptEmailDeliveryStartedAt: Date.now(), updatedAt: Date.now() });
    return order;
  });
}

export async function finishReceiptEmailDelivery(orderId: string, deferred: boolean, error?: string): Promise<void> {
  if (error) {
    await updateOrderStatus(orderId, { receiptEmailDeliveryStatus: "failed", receiptEmailDeliveryError: error } as any);
    return;
  }
  await updateOrderStatus(orderId, {
    receiptEmailDeliveryStatus: "sent",
    ...(deferred ? { addressDeferredEmailSentAt: Date.now() } : { receiptEmailSentAt: Date.now() }),
  } as any);
}
