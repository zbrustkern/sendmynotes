import type { Order } from "../types";
/** Retention identity and source-order associations are admin-only, even with a receipt capability. */
export function stripPrivateRetention<T extends Partial<Order>>(order: T): T {
  const { postPurchaseSenderKey: _sender, retentionAttribution: _association,
    postPurchaseConsent: _consent, postPurchaseLinkObservation: _link, postPurchaseMailingEvidence: _evidence, postPurchaseMailedAt: _date,
    ...safe } = order;
  return safe as T;
}
