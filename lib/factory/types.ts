/**
 * @file lib/factory/types.ts
 * Core domain contracts and schemas for the Micro-Commerce Software Factory.
 * These interfaces parameterize widgets, brands, funnels, fulfillment, and quantitative trading desks.
 */

import { MailingAddress } from "../types";

// ==========================================
// 1. BRAND & MULTI-TENANCY CONTRACTS
// ==========================================

export interface BrandTheme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamilySerif: string;
  fontFamilySans: string;
}

export interface BrandConfig {
  id: string; // e.g. "aster-and-blanche", "sendmynotes"
  name: string;
  domains: string[]; // e.g. ["sendmynotes.com", "asterandblanche.com", "localhost:3000"]
  theme: BrandTheme;
  colophon: {
    pressMarkText: string;
    backplateImageUrl?: string;
    handwryttenBackplateId?: number;
    headquartersLine: string; // e.g. "Lake Forest, IL"
  };
  tracking: {
    googleAdsId?: string;
    googleAdsConversionLabel?: string;
    googleTagManagerId?: string;
    metaPixelId?: string;
  };
  supportEmail: string;
  createdAt: number;
  updatedAt: number;
}

// ==========================================
// 2. DECLARATIVE WIDGET MANIFEST
// ==========================================

export type WidgetCategory =
  | "stationery"
  | "fine_art_print"
  | "custom_laser_craft"
  | "apparel_merch"
  | "keepsake_object"
  | "curated_physical_goods";

export interface WidgetEconomics {
  retailPriceCents: number; // Retail price to customer (e.g. 900 for $9.00)
  estimatedCogsCents: number; // Fulfillment cost + postage (e.g. 515 for $5.15)
  estimatedStripeFeeCents: number; // e.g. 56 cents for 2.9% + 30c
  targetContributionMarginCents: number; // Break-even margin before marketing (e.g. 329 cents)
  maxTargetCpaDollars: number; // Hard stop-loss CPA ceiling
  probeBudgetDollars: number; // Maximum initial capital to test market viability ($20-$50)
  minAcceptableRoas: number; // Target return on ad spend (e.g. 1.3x)
}

export type FunnelStepType =
  | "visual_asset_selector" // AI image generator, preset catalog, user upload
  | "text_customizer" // Note writer, sentiment shuffle, monogram, inscription
  | "options_selector" // Frame selection, size, material, ink color
  | "shipping_address" // Recipient mailing address with autofill
  | "frictionless_checkout"; // 1-tap Apple Pay / Google Pay / Stripe Elements

export interface FunnelStepConfig {
  stepId: string;
  type: FunnelStepType;
  title: string;
  subtitle?: string;
  required: boolean;
  options?: Record<string, unknown>;
}

export interface GenerativePromptConfig {
  provider: "gemini_imagen" | "nano_banana" | "dall_e" | "custom";
  basePromptTemplate: string;
  negativePromptTemplate?: string;
  aspectRatio: string; // e.g. "5:7", "1:1", "16:9"
  sanitizationRules?: string[];
}

export interface WidgetManifest {
  sku: string; // Unique global SKU (e.g. "SKU-HW-A2-CARD-V1")
  brandId: string; // Maps to BrandConfig.id
  version: string; // e.g. "1.0.0"
  title: string;
  shortDescription: string;
  category: WidgetCategory;
  isActive: boolean;
  economics: WidgetEconomics;
  funnelSteps: FunnelStepConfig[];
  generativeEngine?: GenerativePromptConfig;
  fulfillment: {
    providerId: string; // e.g. "handwrytten", "printful", "prodigi", "lob"
    supplierSku: string;
    defaultOptions: Record<string, unknown>;
  };
  seoPresets?: {
    defaultH1: string;
    defaultMetaDescription: string;
    keywordClusters: string[];
  };
  createdAt: number;
  updatedAt: number;
}

// ==========================================
// 3. PLUGGABLE FULFILLMENT ADAPTER
// ==========================================

export interface NormalizedFulfillmentOrder {
  orderId: string;
  manifestSku: string;
  recipientAddress: MailingAddress;
  returnAddress?: MailingAddress;
  customizationPayload: {
    frontImageUrl?: string;
    printedMessage?: string;
    handwrittenMessage?: string;
    fontId?: string;
    selectedOptions?: Record<string, unknown>;
  };
  scheduledSendDate?: string;
}

export interface FulfillmentSubmissionResult {
  success: boolean;
  supplierOrderId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  rawStatus: string;
  error?: string;
  supplierBillingChargedCents?: number;
}

export interface FulfillmentAdapter {
  readonly providerId: string;
  submitOrder(order: NormalizedFulfillmentOrder): Promise<FulfillmentSubmissionResult>;
  checkOrderStatus(supplierOrderId: string): Promise<{
    status: "pending" | "processing" | "shipped" | "delivered" | "failed";
    trackingNumber?: string;
    trackingUrl?: string;
    shippedAt?: string;
  }>;
  getBalance(): Promise<{
    balanceDollars: number;
    currency: string;
    isBelowAlertThreshold: boolean;
  }>;
  validateAddress?(address: MailingAddress): Promise<{
    isValid: boolean;
    standardizedAddress?: MailingAddress;
    warning?: string;
  }>;
}

// ==========================================
// 4. QUANT RISK DESK & TRADING METRICS
// ==========================================

export type StrategyTradeStatus =
  | "PROBING" // Testing market demand with $20-$35 probe budget
  | "HARVESTING" // Generating positive contribution margin; actively scaling ad spend
  | "DECAYING" // CPA creeping up; evaluating budget trimming
  | "ARCHIVED"; // Unprofitable; stopped out by kill switch

export interface StrategyPositionState {
  campaignKey: string; // e.g. "gads_search_interview_thank_you"
  widgetSku: string;
  brandId: string;
  status: StrategyTradeStatus;
  allocatedBudgetDollars: number;
  spentBudgetDollars: number;
  totalOrders: number;
  grossRevenueCents: number;
  totalCogsCents: number;
  totalStripeFeeCents: number;
  netContributionCents: number;
  effectiveCpaDollars: number;
  effectiveRoas: number;
  killSwitchTriggered: boolean;
  killSwitchReason?: string;
  activatedAt: number;
  lastTradeEvaluatedAt: number;
}

// ==========================================
// 5. DIRECT AD PLATFORM ADAPTER
// ==========================================

export interface OfflineConversionPayload {
  gclid?: string;
  orderId: string;
  conversionValue: number;
  currency: string;
  conversionTime: string; // ISO 8601
  customerEmail?: string;
}

export interface AdPlatformAdapter {
  readonly platformId: "google_ads" | "meta" | "tiktok";
  uploadOfflineConversion(conversion: OfflineConversionPayload): Promise<{ success: boolean; error?: string }>;
  fetchCampaignSpend(campaignId: string, startDate: string, endDate: string): Promise<{ spendDollars: number }>;
  pauseCampaign(campaignId: string): Promise<{ success: boolean }>;
  setDailyBudget(campaignId: string, budgetDollars: number): Promise<{ success: boolean }>;
}
