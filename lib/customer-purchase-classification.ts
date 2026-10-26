export function isCustomerPurchaseOrder(order: { origin?: string; paymentMethod?: string; isComp?: boolean } | null | undefined): boolean {
  return Boolean(order && order.origin !== "ADMIN_COMP" && order.paymentMethod !== "STUDIO_COMP" && order.isComp !== true);
}
