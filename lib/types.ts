export interface MailingAddress {
  firstName: string;
  lastName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_RECEIVED"
  | "PROCESSING_HANDWRYTTEN"
  | "FAILED";

export interface Order {
  id: string;
  stripePaymentId?: string;
  customerEmail: string;
  frontImageUrl: string;
  printedMessage: string;
  handwrittenNote: string;
  fontStyleId: string;
  recipientAddress: MailingAddress;
  returnAddress: MailingAddress;
  status: OrderStatus;
  handwryttenOrderId?: string;
  amountInCents: number;
  createdAt: number;
  updatedAt: number;
}

export type ImageCacheStatus = "AVAILABLE" | "RESERVED" | "CLAIMED";

export interface ImageCachePoolItem {
  id: string;
  occasion: string;
  prompt: string;
  imageUrl: string;
  status: ImageCacheStatus;
  reservedAt?: number;
  createdAt: number;
}

export interface HandwryttenAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface HandwryttenOrderParams {
  imageUrl: string;
  printedGreeting?: string;
  handwrittenMessage: string;
  fontId: string;
  recipient: MailingAddress;
  returnAddress: MailingAddress;
}

export interface HandwryttenOrderResult {
  success: boolean;
  order_id?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface FontOption {
  id: string;
  name: string;
  sample: string;
  fontClass: string;
  description: string;
  handwryttenFontId: string;
}
