/** Build a durable, order-scoped URL without putting credentials in its path or query. */
export function privateOrderPath(orderId: string, readToken: string): string {
  return `/order/${encodeURIComponent(orderId)}#read=${encodeURIComponent(readToken)}`;
}

/** Reopen an existing checkout without marking a new payment submission. */
export function checkoutOrderPath(orderId: string, viewToken?: string | null): string {
  const path = `/order/${encodeURIComponent(orderId)}`;
  return viewToken ? `${path}#viewToken=${encodeURIComponent(viewToken)}` : path;
}

/** Open the separate address-completion action with its required authority. */
export function deferredAddressPath(orderId: string, viewToken: string): string {
  return `/orders/${encodeURIComponent(orderId)}/complete-address#address=${encodeURIComponent(viewToken)}`;
}

/** Stripe returns to this first-party page with a short-lived ticket in the URL fragment. */
export function paymentReturnPath(orderId: string, returnTicket: string): string {
  return `/order/${encodeURIComponent(orderId)}/return#return=${encodeURIComponent(returnTicket)}`;
}

export interface OrderAccessCredentials {
  readToken: string;
  returnTicket: string;
}

/** Exchange the checkout-only capability for read-only recovery and payment-return credentials. */
export async function fetchOrderAccess(orderId: string, viewToken: string): Promise<OrderAccessCredentials> {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/access`, {
    method: "GET",
    headers: { "x-view-token": viewToken },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not prepare a private order link.");
  const data = await response.json();
  if (typeof data?.readToken !== "string" || !data.readToken || typeof data?.returnTicket !== "string" || !data.returnTicket) {
    throw new Error("Could not prepare a private order link.");
  }
  return { readToken: data.readToken, returnTicket: data.returnTicket };
}
