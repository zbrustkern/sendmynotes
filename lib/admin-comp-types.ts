export type AdminCompMode = "full_comp" | "individual_adjustments";
export type AdminCompLifecycleStatus =
  | "review_only_held"
  | "payment_pending"
  | "paid_ready"
  | "dispatching"
  | "supplier_accepted"
  | "failed";

export interface AdminCompDestination {
  countryCode: string;
  countryName: string;
  regionRequired: boolean;
  postalCodeRequired: boolean;
  regions: Array<{ code: string; name: string }>;
}

export interface AdminCompCatalogLine {
  lineId: string;
  label: string;
  unitPriceCents: number;
  quantity: number;
  adjustmentEligible: boolean;
}

export interface AdminCompCatalogResponse {
  catalogVersion: string;
  quoteVersion: string;
  currency: "USD";
  destination: AdminCompDestination;
  lines: AdminCompCatalogLine[];
  presets: Array<{ assetId: string; label: string; url: string }>;
  staging: { reviewOnly: boolean; canDispatch: boolean; canCreatePaymentRequest: boolean };
}

export interface AdminCompQuoteRequest {
  mode: AdminCompMode;
  destinationCountryCode: string;
  adjustments?: Array<{ lineId: string; waivedCents: number }>;
  reason: string;
}

export interface AdminCompQuoteLineSnapshot extends AdminCompCatalogLine {
  grossCents: number;
  waivedCents: number;
  dueCents: number;
}

export interface AdminCompQuoteSnapshot {
  quoteId: string;
  version: string;
  catalogVersion: string;
  currency: "USD";
  destinationCountryCode: string;
  lines: AdminCompQuoteLineSnapshot[];
  grossCents: number;
  waivedCents: number;
  customerPayableCents: number;
  mode: AdminCompMode;
  issuedAt: number;
  expiresAt: number;
}

export interface AdminCompQuoteRecord extends AdminCompQuoteSnapshot {
  issuedToActor: string;
  reason: string;
  consumedAt?: number;
  consumedByOrderId?: string;
}

export interface AdminCompQuoteResponse { quote: AdminCompQuoteSnapshot; }

export interface AdminCompOrderRequest {
  quoteId: string;
  idempotencyKey: string;
  frontImageAssetId: string;
  printedMessage?: string;
  handwrittenNote: string;
  fontStyleId: string;
  recipientAddress: import("./types").MailingAddress;
  returnAddress: import("./types").MailingAddress;
  customerEmail?: string;
  scheduledSendDate?: string;
}

export type AdminCompPaymentRequestStatus = "not_needed" | "review_only_held" | "payment_pending" | "paid" | "expired" | "cancelled";
export interface AdminCompPaymentRequestSummary {
  status: AdminCompPaymentRequestStatus;
  requestId?: string;
  amountCents?: number;
  capabilityUrl?: string;
  expiresAt?: number;
}

export interface AdminCompCreateOrderResponse {
  orderId: string;
  origin: "ADMIN_COMP";
  lifecycleStatus: AdminCompLifecycleStatus;
  quote: AdminCompQuoteSnapshot;
  paymentRequest: AdminCompPaymentRequestSummary;
  staging: { held: boolean; message?: string };
}

export interface AdminCompPaymentPageResponse {
  orderId: string;
  status: AdminCompPaymentRequestStatus;
  quote: Pick<AdminCompQuoteSnapshot, "lines" | "grossCents" | "waivedCents" | "customerPayableCents" | "currency">;
  expiresAt: number;
}

export interface AdminCompPaymentRequestRecord {
  requestId: string;
  orderId: string;
  quoteId: string;
  capabilityHash: string;
  expiresAt: number;
  status: AdminCompPaymentRequestStatus;
  amountCents: number;
  createdBy: string;
  paymentIntentId?: string;
  createdAt: number;
  updatedAt: number;
}
