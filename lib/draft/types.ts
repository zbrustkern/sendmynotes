/**
 * Versioned Draft State & Content Model for SendMyNotes.
 * Implements S1-01 requirements:
 * - Versioned schema (schemaVersion)
 * - Required content separated from optional preferences
 * - Never stores sensitive keys (client secrets, card data, viewTokens)
 * - 24-hour expiry
 */

export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_STORAGE_KEY = "sendmynotes_draft_v1";
export const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SelectedDesign {
  presetId?: string;
  customId?: string;
  imageUrl: string;
  title: string;
  source: "preset" | "custom";
  occasion?: string;
  accepted: boolean;
}

export interface CustomGenerationState {
  status: "idle" | "generating" | "completed" | "failed";
  prompt?: string;
  resultImageUrl?: string;
  error?: string;
}

export interface NoteDraft {
  salutation?: string;
  text: string;
  signOff?: string;
  style: string;
}

export interface AddressDraft {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface ScheduleDraft {
  sendDate?: string;
  isScheduled: boolean;
}

export interface AppliedOfferDraft {
  code: string;
  quoteId?: string;
  offerId?: string;
  offerVersion?: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  discountAmountInCents: number;
  finalAmountInCents: number;
  isFree: boolean;
  quoteExpiresAt?: number;
  appliedAt: number;
}

export interface AttributionDraft {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landingPath?: string;
  clickId?: string;
}

export interface CheckoutContactDraft {
  email: string;
  choice: "untouched" | "provided" | "omitted";
}

/**
 * Required content needed to complete an order.
 */
export interface DraftRequiredContent {
  selectedDesign: SelectedDesign | null;
  note: NoteDraft;
  recipient: AddressDraft | null;
  sender: AddressDraft | null;
}

/**
 * Optional preferences and transient context.
 */
export interface DraftOptionalPreferences {
  schedule: ScheduleDraft | null;
  discountCode: string | null;
  appliedOffer?: AppliedOfferDraft | null;
  attribution: AttributionDraft | null;
  customGeneration: CustomGenerationState;
  checkoutSnapshotId: string | null;
  checkoutContact: CheckoutContactDraft;
  currentStep?: string;
  lastCustomArtwork?: SelectedDesign | null;
}

/**
 * Complete draft state object.
 */
export interface DraftState {
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  draftRevision: number;
  experienceVersion: string;

  // Required content fields
  selectedDesign: SelectedDesign | null;
  note: NoteDraft;
  recipient: AddressDraft | null;
  sender: AddressDraft | null;

  // Optional preferences fields
  schedule: ScheduleDraft | null;
  discountCode: string | null;
  appliedOffer?: AppliedOfferDraft | null;
  attribution: AttributionDraft | null;
  customGeneration: CustomGenerationState;
  checkoutSnapshotId: string | null;
  checkoutContact: CheckoutContactDraft;
  currentStep?: string;
  completed?: boolean;
  lastCustomArtwork?: SelectedDesign | null;
}

/**
 * Allowlisted keys that are safe to persist.
 * Any key not in this list will be excluded from persistent storage.
 */
export const ALLOWED_DRAFT_ROOT_KEYS: readonly (keyof DraftState)[] = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "draftRevision",
  "experienceVersion",
  "selectedDesign",
  "note",
  "recipient",
  "sender",
  "schedule",
  "discountCode",
  "appliedOffer",
  "attribution",
  "customGeneration",
  "checkoutSnapshotId",
  "checkoutContact",
  "currentStep",
  "completed",
  "lastCustomArtwork",
] as const;

/**
 * Forbidden keys that must NEVER be persisted in draft storage.
 */
export const FORBIDDEN_STORAGE_KEYS = [
  "clientSecret",
  "client_secret",
  "card",
  "cardNumber",
  "card_number",
  "cvc",
  "cvv",
  "paymentMethod",
  "payment_method",
  "stripeKey",
  "stripe_key",
  "viewToken",
  "view_token",
  "receiptToken",
  "receipt_token",
  "secret",
] as const;

/**
 * Storage interface matching sessionStorage / localStorage for browser and unit tests.
 */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
