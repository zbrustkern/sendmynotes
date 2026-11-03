import { getOrderById } from "../firebase-admin";
import { effectiveOrderEmail } from "../checkout-contact-policy";
import { recordPostPurchaseConsent } from "./preferences";
import { recordPostPurchaseAttribution } from "./attribution";
import { onVerifiedPostPurchaseOrder } from "./enrollment";

/** Replayable, optional side effects. Checkout never depends on marketing configuration. */
export async function syncPostPurchaseOrder(orderId: string): Promise<void> {
  if (!process.env.POST_PURCHASE_SENDER_HMAC_KEY) return;
  const order = await getOrderById(orderId);
  if (!order?.purchaseMeasurement?.eligible) return;
  const email = effectiveOrderEmail(order);
  const capturedOrder = { ...order, customerEmail: email };
  if (email && order.postPurchaseConsent) {
    const consent = order.postPurchaseConsent;
    await recordPostPurchaseConsent({ orderId, email, optedIn: consent.optedIn, disclosureVersion: consent.disclosureVersion, source: consent.source, at: consent.recordedAt });
  }
  await recordPostPurchaseAttribution(capturedOrder);
  await onVerifiedPostPurchaseOrder(capturedOrder);
}
export async function trySyncPostPurchaseOrder(orderId: string): Promise<void> {
  try { await syncPostPurchaseOrder(orderId); }
  catch { console.warn("[Post-purchase] Deferred reconciliation required."); }
}
