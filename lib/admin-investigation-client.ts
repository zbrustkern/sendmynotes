import type { FinancialFactRecord } from "./contracts/admin-overhaul";
import type { Order } from "@/lib/types";
import type {
  AddressState,
  CommunicationState,
  FulfillmentState,
  PaymentState,
} from "@/lib/investigation-service";

/** Client-safe display helpers. Keep server service dependencies out of client bundles. */
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.trim().split("@");
  if (parts.length !== 2) return "***";
  const [user, domain] = parts;
  return user.length <= 1 ? `${user}***@${domain}` : `${user[0]}***@${domain}`;
}

export function maskName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  const tokens = name.trim().split(/\s+/);
  return tokens.length === 1 ? `${tokens[0][0]}***` : `${tokens[0]} ${tokens[tokens.length - 1][0]}***`;
}

export function maskStreet(street?: string | null): string {
  if (!street || typeof street !== "string") return "";
  const trimmed = street.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return `${trimmed.slice(0, 1)}***`;
  return `${trimmed.slice(0, spaceIndex).slice(0, 1)}*** ${trimmed.slice(spaceIndex + 1)}`;
}

export function deriveFulfillmentStateLabel(state: FulfillmentState): string {
  switch (state) {
    case "submitted_to_supplier": return "Submitted to Supplier";
    case "mailed_confirmed": return "Mailed via USPS";
    case "uncertain": return "Supplier outcome unknown · reconcile before retry";
    case "dispatching_locked": return "Dispatching (Locked)";
    case "queued": return "Queued for Fulfillment";
    case "failed": return "Fulfillment Failed";
    default: return "Awaiting Payment or Address";
  }
}

export function deriveOrderStates(order: Partial<Order>, financialFacts?: FinancialFactRecord[]): {
  paymentState: PaymentState;
  addressState: AddressState;
  fulfillmentState: FulfillmentState;
  fulfillmentStateLabel: string;
  communicationState: CommunicationState;
} {
  let paymentState: PaymentState = "unpaid";
  if (order.isComp || order.paymentMethod === "STUDIO_COMP" || order.paymentMethod === "PROMO_CODE" || order.amountInCents === 0) {
    paymentState = "free_or_comp";
  } else if (order.status === "PAYMENT_VERIFICATION_FAILED") {
    paymentState = "verification_failed";
  } else if (financialFacts?.length) {
    const hasDispute = financialFacts.some((fact) => fact.factType === "dispute");
    const totalCaptured = financialFacts.filter((fact) => fact.factType === "capture").reduce((sum, fact) => sum + fact.amountCents, 0);
    const totalRefunded = financialFacts.filter((fact) => fact.factType === "refund").reduce((sum, fact) => sum + fact.amountCents, 0);
    if (hasDispute) paymentState = "disputed";
    else if (totalRefunded > 0 && totalRefunded >= totalCaptured && totalCaptured > 0) paymentState = "refunded";
    else if (totalRefunded > 0) paymentState = "partially_refunded";
    else if (totalCaptured > 0) paymentState = "captured_verified";
  } else if (["PAYMENT_RECEIVED", "QUEUED_FOR_FULFILLMENT", "PROCESSING_HANDWRYTTEN", "MAILED"].includes(order.status || "")) {
    paymentState = "authorized_pending";
  }

  let addressState: AddressState = "complete";
  if (order.addressDeferred || order.address_deferred || order.status === "AWAITING_RECIPIENT_ADDRESS") addressState = "deferred_awaiting_recipient";
  else if (!order.recipientAddress?.street1) addressState = "missing";
  else if (!order.recipientAddress.city || !order.recipientAddress.state || !order.recipientAddress.zip) addressState = "validation_failed";

  let fulfillmentState: FulfillmentState = "not_ready";
  if (order.status === "MAILED") fulfillmentState = "mailed_confirmed";
  else if (order.status === "PROCESSING_HANDWRYTTEN") fulfillmentState = "submitted_to_supplier";
  else if (order.status === "DISPATCH_UNCERTAIN") fulfillmentState = "uncertain";
  else if (order.status === "DISPATCHING") fulfillmentState = "dispatching_locked";
  else if (order.status === "QUEUED_FOR_FULFILLMENT") fulfillmentState = "queued";
  else if (order.status === "FAILED" || order.fulfillmentError) fulfillmentState = "failed";

  let communicationState: CommunicationState = "pending";
  if (order.addressDeferredEmailSentAt) communicationState = "deferred_magic_link_sent";
  else if (order.receiptEmailSentAt) communicationState = "receipt_sent";

  return { paymentState, addressState, fulfillmentState, fulfillmentStateLabel: deriveFulfillmentStateLabel(fulfillmentState), communicationState };
}
