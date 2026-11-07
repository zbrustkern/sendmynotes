import type { AddressDraft } from "./types";

export type MultiSendEditorBuffer =
  | { checkoutId: string; mode: "address"; recipientId: string; newRecipient: boolean; address: AddressDraft }
  | { checkoutId: string; mode: "greeting"; recipientId: string; text: string };

export function parseMultiSendEditorBuffer(raw: string | null, checkoutId: string): MultiSendEditorBuffer | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MultiSendEditorBuffer>;
    if (value.checkoutId !== checkoutId || typeof value.recipientId !== "string") return null;
    if (value.mode === "greeting" && typeof value.text === "string") return { checkoutId, mode: "greeting", recipientId: value.recipientId, text: value.text };
    if (value.mode === "address" && value.address && typeof value.address === "object") {
      const address = value.address as AddressDraft;
      if ([address.name, address.addressLine1, address.city, address.state, address.zip].every((part) => typeof part === "string") && (address.addressLine2 === undefined || typeof address.addressLine2 === "string") && (address.country === undefined || typeof address.country === "string")) return { checkoutId, mode: "address", recipientId: value.recipientId, newRecipient: value.newRecipient === true, address: { name: address.name, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, state: address.state, zip: address.zip, country: address.country } };
    }
  } catch { /* ignore malformed session draft */ }
  return null;
}
