import type { ContactEmailChoice, Order } from "./types";

export function normalizeCheckoutEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email) return "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function contactEmailChoice(value: string): ContactEmailChoice {
  return value.trim() ? "provided" : "omitted";
}

/** Explicit omission wins over Stripe and all historical stored addresses. */
export function effectiveOrderEmail(order: Order, candidate?: string | null): string {
  if (order.contactPolicyVersion === 1 && !order.contactEmailChoice) return "";
  if (order.contactEmailChoice && order.contactEmailSyncStatus !== "synced") return "";
  if (order.contactEmailChoice === "omitted") return "";
  if (order.contactEmailChoice === "provided") return order.customerEmail || "";
  return candidate || order.customerEmail || "";
}

export function checkoutEmailRequired(addressDeferred: boolean, email: string): boolean {
  return addressDeferred && !email;
}
