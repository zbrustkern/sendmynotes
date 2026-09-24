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
  | "QUEUED_FOR_FULFILLMENT"
  | "MAILED"
  | "FAILED";

export interface SavedAddress extends MailingAddress {
  id: string;
  label?: string;
  occasionReminderDate?: string; // YYYY-MM-DD for birthdays/anniversaries
}

export interface Order {
  id: string;
  stripePaymentId?: string;
  customerEmail: string;
  userId?: string;
  frontImageUrl: string;
  printedMessage: string;
  handwrittenNote: string;
  fontStyleId: string;
  recipientAddress: MailingAddress;
  returnAddress: MailingAddress;
  status: OrderStatus;
  handwryttenOrderId?: string;
  handwryttenStatus?: string; // e.g. "writing", "mailed", "processing"
  handwryttenTrackingNumber?: string;
  handwryttenTrackingUrl?: string;
  handwryttenMailedDate?: string;
  fulfillmentError?: string;
  scheduledSendDate?: string; // YYYY-MM-DD if scheduled
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
  scheduledSendDate?: string; // YYYY-MM-DD
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
  handwryttenFontLabel?: string;
}

// User Accounts Model
export interface UserAccount {
  uid: string;
  email: string;
  displayName?: string;
  savedAddresses: SavedAddress[];
  defaultReturnAddress?: MailingAddress;
  savedCovers: string[];
  creditsBalance: number;
  createdAt: number;
  updatedAt: number;
}

// Customer Journey Telemetry
export type TelemetryEventName =
  | "session_start"
  | "agent_url_prefilled"
  | "cover_preset_selected"
  | "ai_generate_started"
  | "ai_generate_succeeded"
  | "ai_generate_rate_limited"
  | "step_navigated"
  | "inside_note_edited"
  | "font_style_selected"
  | "address_completed"
  | "checkout_initiated"
  | "payment_attempted"
  | "payment_succeeded"
  | "payment_failed"
  | "card_abandoned";

export interface TelemetryEvent {
  id: string;
  eventName: TelemetryEventName;
  sessionId: string;
  step?: number;
  orderId?: string;
  metadata?: Record<string, unknown>;
  path: string;
  timestamp: number;
  createdAt: number;
}

// Admin Dashboard Analytics
export interface AdminMetrics {
  totalRevenueCents: number;
  totalOrders: number;
  ordersByStatus: {
    pending: number;
    processing: number;
    failed: number;
  };
  funnel: {
    totalSessions: number;
    coverSelected: number;
    noteCompleted: number;
    addressCompleted: number;
    checkoutInitiated: number;
    paid: number;
  };
  recentOrders: Order[];
}
