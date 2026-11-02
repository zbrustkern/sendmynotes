import type { OfferLifecycleStatus, OfferVersionRecord } from "./contracts/admin-overhaul";

export const ALLOWED_DESTINATION_PATHS = [
  "/", "/new", "/send", "/send/birthday", "/send/thank-you", "/send/anniversary",
  "/send/congratulations", "/send/thinking-of-you", "/send/holiday", "/send/love", "/preview/entry",
] as const;

export type OfferPresetKey = "welcome_2_off" | "launch_20_pct" | "vip_free_card" | "recovery_150_off";
export interface OfferPreset {
  key: OfferPresetKey; name: string; codeSuggestion: string; purpose: string;
  discountType: "FIXED_AMOUNT" | "PERCENTAGE"; discountValue: number; destinationPath: string;
  description: string; maxUses?: number; perCustomerLimit?: number;
}
export const OFFER_CREATION_PRESETS: Record<OfferPresetKey, OfferPreset> = {
  welcome_2_off: { key: "welcome_2_off", name: "Welcome $2.00 Off", codeSuggestion: "WELCOME2", purpose: "First-time sender introductory gesture", discountType: "FIXED_AMOUNT", discountValue: 200, destinationPath: "/send", description: "Applies $2.00 off standard $9.00 card. Final price $7.00.", perCustomerLimit: 1 },
  launch_20_pct: { key: "launch_20_pct", name: "Launch 20% Off", codeSuggestion: "LAUNCH20", purpose: "Early adopter launch campaign", discountType: "PERCENTAGE", discountValue: 20, destinationPath: "/send", description: "20% off standard card. Final price $7.20 (subsidy $1.80)." },
  vip_free_card: { key: "vip_free_card", name: "VIP 100% Free Card (Comp)", codeSuggestion: "VIPGIFT", purpose: "100% complimentary card gift", discountType: "PERCENTAGE", discountValue: 100, destinationPath: "/send", description: "100% off ($9.00 card becomes $0.00). Counted as free promo.", maxUses: 50, perCustomerLimit: 1 },
  recovery_150_off: { key: "recovery_150_off", name: "Cart Recovery $1.50 Off", codeSuggestion: "FINISH150", purpose: "Gentle manual recovery incentive for high-intent abandoned drafts", discountType: "FIXED_AMOUNT", discountValue: 150, destinationPath: "/send", description: "Applies $1.50 off standard card. Final price $7.50." },
};

export interface DestinationValidationResult {
  isValid: boolean; error?: string; normalizedPath: string; fullRelativeUrl: string;
  fullAbsoluteUrl: string; paramUsed: string;
  pricePreview: { basePriceCents: number; discountAmountCents: number; finalAmountCents: number; subsidyCents: number; isFree: boolean };
}
export interface BuildDestinationLinkInput {
  code: string; destinationPath?: string; aliasParam?: "discount" | "code" | "promo";
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; baseUrl?: string;
}
export interface PromotionsWorkspaceOfferItem extends OfferVersionRecord {
  livePricePreview: { basePriceCents: number; discountAmountCents: number; finalAmountCents: number; subsidyCents: number; isFree: boolean };
  activeReservationsCount: number; historicalRedemptionsCount: number; canHardDelete: boolean;
}
export interface OfferEvidenceDetail {
  code: string; offer: OfferVersionRecord;
  funnel: { views: number; applies: number; rejects: number; reservations: number; redemptions: number; refunds: number };
  financials: { grossListValueCents: number; totalDiscountSubsidyCents: number; netCapturedRevenueCents: number; refundedCents: number; costStatus: "unconfirmed"; verifiedContributionMarginCents: null };
  commercialBreakdown: { paidDiscountedCount: number; freePromoCount: number; studioCompCount: number };
  platformBreakdown: Record<string, number>;
  orders: Array<{ orderId: string; commercialKind: string; payableAmountCents: number; discountAmountCents: number; redeemedAt: number; refunded: boolean; refundAmountCents?: number; clientPlatform?: string }>;
  coverageNote: string;
}
export interface ConsequentialChangePreview {
  code: string; action: "create" | "update" | "pause" | "activate" | "archive" | "delete";
  currentStatus: OfferLifecycleStatus; targetStatus?: OfferLifecycleStatus; activeReservationsCount: number;
  unexpiredQuotesHonoredForMinutes: number; historicalRedemptionsCount: number; totalDiscountGivenCents: number;
  canHardDelete: boolean; reasonBlockHardDelete?: string; actionSummary: string; warnings: string[];
}

export function validateDestinationPath(inputPath: string): { isValid: boolean; normalizedPath: string; error?: string } {
  if (!inputPath || typeof inputPath !== "string") return { isValid: false, normalizedPath: "/", error: "Destination path cannot be empty." };
  const trimmed = inputPath.trim();
  if (/^(?:https?:|\/\/|javascript:|data:|vbscript:)/i.test(trimmed) || trimmed.includes("..")) {
    return { isValid: false, normalizedPath: "/", error: "External URLs, absolute protocols, and path traversals are strictly disallowed." };
  }
  const cleanPath = trimmed.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (ALLOWED_DESTINATION_PATHS.includes(cleanPath as any) || /^\/send\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/.test(cleanPath)) {
    return { isValid: true, normalizedPath: cleanPath };
  }
  return { isValid: false, normalizedPath: "/", error: `Path '${cleanPath}' is not in the approved customer destination allowlist.` };
}

export function previewOfferPricing(discountType: "FIXED_AMOUNT" | "PERCENTAGE", discountValue: number, basePriceCents = 900) {
  const discountAmountCents = discountType === "PERCENTAGE"
    ? Math.round(basePriceCents * Math.min(100, Math.max(0, discountValue)) / 100)
    : Math.min(basePriceCents, Math.max(0, Math.round(discountValue)));
  const finalAmountCents = Math.max(0, basePriceCents - discountAmountCents);
  return { basePriceCents, discountAmountCents, finalAmountCents, subsidyCents: discountAmountCents, isFree: finalAmountCents === 0 };
}

export function buildDestinationOfferLink(input: BuildDestinationLinkInput): DestinationValidationResult {
  const validation = validateDestinationPath(input.destinationPath || "/send");
  const baseOrigin = input.baseUrl ? input.baseUrl.replace(/\/+$/, "") : "https://sendmynotes.com";
  const aliasParam = input.aliasParam || "discount";
  const params = new URLSearchParams();
  if (input.code.trim()) params.set(aliasParam, input.code.trim().toUpperCase());
  if (input.utmSource) params.set("utm_source", input.utmSource.trim());
  if (input.utmMedium) params.set("utm_medium", input.utmMedium.trim());
  if (input.utmCampaign) params.set("utm_campaign", input.utmCampaign.trim());
  if (input.utmContent) params.set("utm_content", input.utmContent.trim());
  const query = params.toString();
  const fullRelativeUrl = query ? `${validation.normalizedPath}?${query}` : validation.normalizedPath;
  const pricePreview = previewOfferPricing("FIXED_AMOUNT", 0);
  return { ...validation, fullRelativeUrl, fullAbsoluteUrl: `${baseOrigin}${fullRelativeUrl}`, paramUsed: aliasParam, pricePreview };
}

export const DESCRIPTIVE_ATTRIBUTION_BADGE = "Descriptive Redemption Share — Not Causal Lift (No Control Holdout)";
export const GROWTH_ADVISORY_NOTE = "Offer conversion metrics reflect observed redemptions, not verified incremental causal lift. In the absence of randomized control holdouts, automatic code termination on small sample sizes is strongly discouraged.";
