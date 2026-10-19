/**
 * lib/promotions-and-growth-service.ts
 *
 * SPRINT-0008: Promotions and Growth Workspaces Service
 *
 * Provides authoritative logic for:
 * 1. Promotions management:
 *    - Familiar presets (welcome $2 off, launch 20%, vip free card, recovery $1.50 off)
 *    - Destination-aware URL generator with strict allowlist and query aliases (?discount=, ?code=, ?promo=)
 *    - Live non-billable server price quote & subsidy preview
 *    - Consequential change previews (checking active reservations, unexpired quotes, redemptions)
 *    - Audited lifecycle mutations & refusal to hard-delete redeemed codes (archives instead)
 *    - Full offer evidence detail reconciling exposure, applies, redemptions, exact cents, and unconfirmed costs
 * 2. Growth workspace:
 *    - Full-cohort campaign performance merged with dated spend from spend-and-cost-ledger
 *    - Explicit separation of paid discounted orders from free promo and studio comp orders
 *    - Descriptive attribution badge (Descriptive Redemption Share — Not Causal Lift)
 *    - Measured draft recovery tools distinguishing server order drafts from browser-local drafts
 *    - Non-destructive manual recovery links preserving original acquisition attribution
 *    - Strictly zero automated customer outreach and zero ad platform mutations
 */

import { firestoreDb } from "./firebase-admin";
import { readBoundedCollection, readBoundedQuery, boundedCoverage } from "./bounded-admin-read";
import {
  OfferLifecycleStatus,
  OfferVersionRecord,
  OfferReservationRecord,
  OfferRedemptionRecord,
  OfferPriceQuoteSnapshot,
  CommercialKind,
  MetricStatus,
} from "./contracts/admin-overhaul";
import {
  getOrSyncOfferVersion,
  computeOfferLifecycleStatus,
  getOfferVersionsCollection,
  getOfferQuotesCollection,
  getOfferReservationsCollection,
  getOfferRedemptionsCollection,
  extractOfferCodeFromUrlParams,
} from "./offer-engine";
import {
  queryDatedSpend,
  DatedSpendRecord,
} from "./spend-and-cost-ledger";
import { FINANCIAL_FACTS_COLLECTION } from "./financial-ledger";
import { formatDateInTimezone } from "./reporting-engine";
import type { FinancialFactRecord, EventEnvironment } from "./contracts/admin-overhaul";
import { CARD_FLAT_RATE_CENTS } from "./stripe";

// ============================================================================
// Constants & Presets (SPRINT-0008-T01, AC01)
// ============================================================================

export const ADMIN_AUDIT_LOG_COLLECTION = "admin_audit_log";

export const ALLOWED_DESTINATION_PATHS = [
  "/",
  "/new",
  "/send",
  "/send/birthday",
  "/send/thank-you",
  "/send/anniversary",
  "/send/congratulations",
  "/send/thinking-of-you",
  "/send/holiday",
  "/send/love",
  "/preview/entry",
] as const;

export type OfferPresetKey =
  | "welcome_2_off"
  | "launch_20_pct"
  | "vip_free_card"
  | "recovery_150_off";

export interface OfferPreset {
  key: OfferPresetKey;
  name: string;
  codeSuggestion: string;
  purpose: string;
  discountType: "FIXED_AMOUNT" | "PERCENTAGE";
  discountValue: number;
  destinationPath: string;
  description: string;
  maxUses?: number;
  perCustomerLimit?: number;
}

export const OFFER_CREATION_PRESETS: Record<OfferPresetKey, OfferPreset> = {
  welcome_2_off: {
    key: "welcome_2_off",
    name: "Welcome $2.00 Off",
    codeSuggestion: "WELCOME2",
    purpose: "First-time sender introductory gesture",
    discountType: "FIXED_AMOUNT",
    discountValue: 200, // 200 cents ($2.00)
    destinationPath: "/send",
    description: "Applies $2.00 off standard $9.00 card. Final price $7.00.",
    perCustomerLimit: 1,
  },
  launch_20_pct: {
    key: "launch_20_pct",
    name: "Launch 20% Off",
    codeSuggestion: "LAUNCH20",
    purpose: "Early adopter launch campaign",
    discountType: "PERCENTAGE",
    discountValue: 20, // 20%
    destinationPath: "/send",
    description: "20% off standard card. Final price $7.20 (subsidy $1.80).",
  },
  vip_free_card: {
    key: "vip_free_card",
    name: "VIP 100% Free Card (Comp)",
    codeSuggestion: "VIPGIFT",
    purpose: "100% complimentary card gift",
    discountType: "PERCENTAGE",
    discountValue: 100, // 100%
    destinationPath: "/send",
    description: "100% off ($9.00 card becomes $0.00). Counted as free promo.",
    maxUses: 50,
    perCustomerLimit: 1,
  },
  recovery_150_off: {
    key: "recovery_150_off",
    name: "Cart Recovery $1.50 Off",
    codeSuggestion: "FINISH150",
    purpose: "Gentle manual recovery incentive for high-intent abandoned drafts",
    discountType: "FIXED_AMOUNT",
    discountValue: 150, // 150 cents ($1.50)
    destinationPath: "/send",
    description: "Applies $1.50 off standard card. Final price $7.50.",
  },
};

// ============================================================================
// Types
// ============================================================================

export interface DestinationValidationResult {
  isValid: boolean;
  error?: string;
  normalizedPath: string;
  fullRelativeUrl: string;
  fullAbsoluteUrl: string;
  paramUsed: string;
  pricePreview: {
    basePriceCents: number;
    discountAmountCents: number;
    finalAmountCents: number;
    subsidyCents: number;
    isFree: boolean;
  };
}

export interface BuildDestinationLinkInput {
  code: string;
  destinationPath?: string;
  aliasParam?: "discount" | "code" | "promo";
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  baseUrl?: string;
}

export interface ConsequentialChangePreview {
  code: string;
  action: "create" | "update" | "pause" | "activate" | "archive" | "delete";
  currentStatus: OfferLifecycleStatus;
  targetStatus?: OfferLifecycleStatus;
  activeReservationsCount: number;
  unexpiredQuotesHonoredForMinutes: number;
  historicalRedemptionsCount: number;
  totalDiscountGivenCents: number;
  canHardDelete: boolean;
  reasonBlockHardDelete?: string;
  actionSummary: string;
  warnings: string[];
}

export interface AdminAuditLogRecord {
  id: string;
  actorEmail: string;
  action: "create" | "update" | "pause" | "activate" | "archive" | "delete";
  targetType: "offer";
  targetId: string;
  previousState?: Partial<OfferVersionRecord> | null;
  newState?: Partial<OfferVersionRecord> | null;
  reason?: string;
  timestamp: number;
}

export interface AuditedOfferChangeInput {
  actorEmail: string;
  action: "create" | "update" | "pause" | "activate" | "archive" | "delete";
  code: string;
  payload?: Partial<OfferVersionRecord>;
  reason?: string;
}

export interface AuditedOfferChangeResult {
  success: boolean;
  error?: string;
  auditId?: string;
  offer?: OfferVersionRecord;
  action: string;
  actorEmail: string;
  timestamp: number;
}

export interface PromotionsWorkspaceOfferItem extends OfferVersionRecord {
  livePricePreview: {
    basePriceCents: number;
    discountAmountCents: number;
    finalAmountCents: number;
    subsidyCents: number;
    isFree: boolean;
  };
  activeReservationsCount: number;
  historicalRedemptionsCount: number;
  canHardDelete: boolean;
}

export interface OfferEvidenceDetail {
  code: string;
  offer: OfferVersionRecord;
  funnel: {
    views: number;
    applies: number;
    rejects: number;
    reservations: number;
    redemptions: number;
    refunds: number;
  };
  financials: {
    grossListValueCents: number;
    totalDiscountSubsidyCents: number;
    netCapturedRevenueCents: number;
    refundedCents: number;
    costStatus: "unconfirmed";
    verifiedContributionMarginCents: null;
  };
  commercialBreakdown: {
    paidDiscountedCount: number;
    freePromoCount: number;
    studioCompCount: number;
  };
  platformBreakdown: Record<string, number>;
  orders: Array<{
    orderId: string;
    commercialKind: CommercialKind;
    payableAmountCents: number;
    discountAmountCents: number;
    redeemedAt: number;
    refunded: boolean;
    refundAmountCents?: number;
    clientPlatform?: string;
  }>;
  coverageNote: string;
}

export interface GrowthCampaignReportItem {
  campaignId: string;
  channel: string;
  datedSpendCents: number;
  spendStatus: MetricStatus;
  paidOrdersCount: number;
  freePromoOrdersCount: number;
  studioCompOrdersCount: number;
  totalOrdersCount: number;
  netCapturedRevenueCents: number;
  roas: number | null;
}

export interface RecoveryCandidate {
  draftId: string;
  customerEmail?: string;
  recipientName?: string;
  updatedAt: number;
  resumabilityType: "server_order_draft" | "browser_local_only";
  contactEligibility: "eligible" | "anonymous_uncontactable";
  originalChannel?: string;
  originalUtmCampaign?: string;
  suggestedOfferCode?: string;
  destinationPath?: string;
}

export interface GrowthWorkspaceReport {
  attributionBadgeText: string;
  advisoryNote: string;
  totalDatedSpendCents: number;
  spendStatus?: MetricStatus;
  totalPaidOrders: number;
  totalFreePromoOrders: number;
  totalStudioComps: number;
  totalCapturedRevenueCents: number;
  campaigns: GrowthCampaignReportItem[];
  recoveryCandidates: RecoveryCandidate[];
}

export interface ManualRecoveryLinkInput {
  draftId: string;
  resumabilityType: "server_order_draft" | "browser_local_only";
  offerCode: string;
  originalChannel?: string;
  originalUtmCampaign?: string;
  destinationPath?: string;
  baseUrl?: string;
}

export interface ManualRecoveryLinkResult {
  draftId: string;
  resumabilityType: "server_order_draft" | "browser_local_only";
  offerCode: string;
  url: string;
  fullAbsoluteUrl: string;
  preservesAttribution: {
    originalChannel: string;
    originalUtmCampaign: string;
    touchType: "manual_recovery";
  };
  notes: string;
  noAutomatedOutreachDisclaimer: string;
}

// ============================================================================
// 1. Destination Link Builder & Allowlist Validation (AC01)
// ============================================================================

/**
 * Validates a destination path against allowlist and safety rules.
 * Fails closed on unknown routes, external URLs, javascript:, or data: URIs.
 */
export function validateDestinationPath(inputPath: string): { isValid: boolean; normalizedPath: string; error?: string } {
  if (!inputPath || typeof inputPath !== "string") {
    return { isValid: false, normalizedPath: "/", error: "Destination path cannot be empty." };
  }

  const trimmed = inputPath.trim();

  // Reject malicious schemes, external hosts, and traversal
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.toLowerCase().startsWith("javascript:") ||
    trimmed.toLowerCase().startsWith("data:") ||
    trimmed.toLowerCase().startsWith("vbscript:") ||
    trimmed.includes("..")
  ) {
    return {
      isValid: false,
      normalizedPath: "/",
      error: "External URLs, absolute protocols, and path traversals are strictly disallowed.",
    };
  }

  // Parse relative path without query string or hash
  const cleanPath = trimmed.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

  // Check static allowlist
  if (ALLOWED_DESTINATION_PATHS.includes(cleanPath as any)) {
    return { isValid: true, normalizedPath: cleanPath };
  }

  // Check dynamic pattern: /send/:occasion or /send/:occasion/:slug
  const dynamicSendPattern = /^\/send\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/;
  if (dynamicSendPattern.test(cleanPath)) {
    return { isValid: true, normalizedPath: cleanPath };
  }

  return {
    isValid: false,
    normalizedPath: "/",
    error: `Path '${cleanPath}' is not in the approved customer destination allowlist.`,
  };
}

/**
 * Computes non-billable server price quote preview for an offer value.
 * Never touches Stripe, Handwrytten, or external payment gateways.
 */
export function previewOfferPricing(
  discountType: "FIXED_AMOUNT" | "PERCENTAGE",
  discountValue: number,
  basePriceCents: number = CARD_FLAT_RATE_CENTS
): {
  basePriceCents: number;
  discountAmountCents: number;
  finalAmountCents: number;
  subsidyCents: number;
  isFree: boolean;
} {
  let discountAmountCents = 0;

  if (discountType === "PERCENTAGE") {
    const clampedPct = Math.min(100, Math.max(0, discountValue));
    discountAmountCents = Math.round((basePriceCents * clampedPct) / 100);
  } else {
    discountAmountCents = Math.min(basePriceCents, Math.max(0, Math.round(discountValue)));
  }

  const finalAmountCents = Math.max(0, basePriceCents - discountAmountCents);
  const subsidyCents = discountAmountCents;
  const isFree = finalAmountCents === 0;

  return {
    basePriceCents,
    discountAmountCents,
    finalAmountCents,
    subsidyCents,
    isFree,
  };
}

/**
 * Builds destination-aware auto-apply link with offer/distribution/UTM context.
 * Performs dry-run non-billable quote preview.
 */
export function buildDestinationOfferLink(input: BuildDestinationLinkInput): DestinationValidationResult {
  const normalizedCode = (input.code || "").trim().toUpperCase();
  const rawPath = input.destinationPath || "/send";
  const validation = validateDestinationPath(rawPath);

  const baseOrigin = input.baseUrl ? input.baseUrl.replace(/\/+$/, "") : "https://sendmynotes.com";
  const aliasParam = input.aliasParam || "discount";

  const searchParams = new URLSearchParams();
  if (normalizedCode) {
    searchParams.set(aliasParam, normalizedCode);
  }
  if (input.utmSource) searchParams.set("utm_source", input.utmSource.trim());
  if (input.utmMedium) searchParams.set("utm_medium", input.utmMedium.trim());
  if (input.utmCampaign) searchParams.set("utm_campaign", input.utmCampaign.trim());
  if (input.utmContent) searchParams.set("utm_content", input.utmContent.trim());

  const queryString = searchParams.toString();
  const fullRelativeUrl = queryString ? `${validation.normalizedPath}?${queryString}` : validation.normalizedPath;
  const fullAbsoluteUrl = `${baseOrigin}${fullRelativeUrl}`;

  // Dry-run non-billable quote calculation
  const pricePreview = previewOfferPricing("FIXED_AMOUNT", 0);

  return {
    isValid: validation.isValid,
    error: validation.error,
    normalizedPath: validation.normalizedPath,
    fullRelativeUrl,
    fullAbsoluteUrl,
    paramUsed: aliasParam,
    pricePreview,
  };
}

// ============================================================================
// 2. Consequential Change Preview & Audited Mutations (AC04)
// ============================================================================

/**
 * Previews consequential effects of an offer change before executing.
 * Strictly verifies whether an offer can be hard-deleted or must be archived.
 */
export async function previewConsequentialOfferChange(
  code: string,
  proposedAction: "create" | "update" | "pause" | "activate" | "archive" | "delete",
  payload?: Partial<OfferVersionRecord>
): Promise<ConsequentialChangePreview> {
  const normalized = (code || "").trim().toUpperCase();
  const offer = await getOrSyncOfferVersion(normalized);

  const nowMs = Date.now();
  const currentStatus = offer ? computeOfferLifecycleStatus(offer, nowMs) : "draft";

  // Check active reservations
  const resSnap = await readBoundedQuery(getOfferReservationsCollection().where("code", "==", normalized));
  let activeReservationsCount = 0;
  for (const doc of resSnap.docs) {
    const r = doc.data() as OfferReservationRecord;
    if (r.status === "active" && r.expiresAt > nowMs) {
      activeReservationsCount++;
    }
  }

  // Check historical redemptions
  const redSnap = await readBoundedQuery(getOfferRedemptionsCollection().where("offerId", "==", `offer_${normalized}`));
  const historicalRedemptionsCount = Math.max(offer?.usedCount || 0, redSnap.size);
  const totalDiscountGivenCents = offer?.totalDiscountGivenCents || 0;

  // Invariant: If redemptions exist, hard-delete is strictly disallowed
  const canHardDelete = historicalRedemptionsCount === 0;
  const reasonBlockHardDelete = canHardDelete
    ? undefined
    : "Cannot hard-delete an offer with historical redemptions. Please archive it instead to preserve accounting and ledger history.";

  const warnings: string[] = [];
  let actionSummary = "";

  if (proposedAction === "delete") {
    if (!canHardDelete) {
      warnings.push(`Hard deletion is blocked: ${historicalRedemptionsCount} order redemption(s) exist in accounting records.`);
      warnings.push("Archive this code instead to immediately deactivate it while preserving financial audit history.");
      actionSummary = "Hard delete forbidden. Offer must be archived.";
    } else {
      actionSummary = "Permanently remove unused promotional code configuration.";
    }
  } else if (proposedAction === "archive") {
    actionSummary = "Archive offer code. Blocks future applies while preserving historical redemption reports.";
    if (activeReservationsCount > 0) {
      warnings.push(`${activeReservationsCount} active checkout reservation(s) in flight. They will remain valid until their 30-minute hold expires.`);
    }
    warnings.push("Authoritative quotes already issued within the last 30 minutes remain valid until their expiration.");
  } else if (proposedAction === "pause") {
    actionSummary = "Temporarily pause code redemptions. New checkouts will reject the code until re-activated.";
    if (activeReservationsCount > 0) {
      warnings.push(`${activeReservationsCount} active in-flight reservation(s) will expire naturally.`);
    }
  } else if (proposedAction === "activate") {
    actionSummary = "Re-activate paused code for customer checkout.";
  } else if (proposedAction === "update") {
    actionSummary = "Update configuration terms (caps, schedule, destination).";
    if (activeReservationsCount > 0) {
      warnings.push("Existing in-flight checkouts will honor their issued quote pricing.");
    }
  } else {
    actionSummary = "Create new versioned promotional offer.";
  }

  return {
    code: normalized,
    action: proposedAction,
    currentStatus,
    targetStatus: proposedAction === "archive" ? "archived" : proposedAction === "pause" ? "paused" : proposedAction === "activate" ? "active" : currentStatus,
    activeReservationsCount,
    unexpiredQuotesHonoredForMinutes: 30,
    historicalRedemptionsCount,
    totalDiscountGivenCents,
    canHardDelete,
    reasonBlockHardDelete,
    actionSummary,
    warnings,
  };
}

/**
 * Executes an audited mutation against an offer version.
 * Enforces role, blocks hard-deleting redeemed codes, and writes to admin_audit_log.
 */
export async function executeAuditedOfferChange(
  input: AuditedOfferChangeInput
): Promise<AuditedOfferChangeResult> {
  const normalized = (input.code || "").trim().toUpperCase();
  if (!normalized || normalized.length < 2) {
    return {
      success: false,
      error: "Valid offer code of at least 2 characters is required.",
      action: input.action,
      actorEmail: input.actorEmail,
      timestamp: Date.now(),
    };
  }

  const preview = await previewConsequentialOfferChange(normalized, input.action, input.payload);

  // Guard against illegal hard deletion
  if (input.action === "delete" && !preview.canHardDelete) {
    return {
      success: false,
      error: preview.reasonBlockHardDelete || "Cannot hard-delete an offer with historical redemptions.",
      action: input.action,
      actorEmail: input.actorEmail,
      timestamp: Date.now(),
    };
  }

  const existingOffer = await getOrSyncOfferVersion(normalized);
  const nowMs = Date.now();
  const versionRef = getOfferVersionsCollection().doc(`offer_${normalized}_v1`);

  let finalOffer: OfferVersionRecord | undefined;

  if (input.action === "delete") {
    await versionRef.delete();
    // Also remove from legacy discount_codes collection if present
    try {
      await firestoreDb.collection("discount_codes").doc(normalized).delete();
    } catch {
      // Non-fatal
    }
  } else if (input.action === "archive") {
    const updated: OfferVersionRecord = {
      ...(existingOffer || {
        offerId: `offer_${normalized}`,
        version: 1,
        code: normalized,
        purpose: "Archived Offer",
        destinationPath: "/",
        discountType: "FIXED_AMOUNT",
        discountValue: 0,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: nowMs,
      }),
      status: "archived",
      updatedAt: nowMs,
    };
    await versionRef.set(updated, { merge: true });
    finalOffer = updated;
  } else if (input.action === "pause") {
    const updated: OfferVersionRecord = {
      ...(existingOffer || {
        offerId: `offer_${normalized}`,
        version: 1,
        code: normalized,
        purpose: "Promotional Offer",
        destinationPath: "/",
        discountType: "FIXED_AMOUNT",
        discountValue: 0,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: nowMs,
      }),
      status: "paused",
      updatedAt: nowMs,
    };
    await versionRef.set(updated, { merge: true });
    finalOffer = updated;
  } else if (input.action === "activate") {
    const updated: OfferVersionRecord = {
      ...(existingOffer || {
        offerId: `offer_${normalized}`,
        version: 1,
        code: normalized,
        purpose: "Active Offer",
        destinationPath: "/",
        discountType: "FIXED_AMOUNT",
        discountValue: 0,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: nowMs,
      }),
      status: "active",
      updatedAt: nowMs,
    };
    await versionRef.set(updated, { merge: true });
    finalOffer = updated;
  } else {
    // create or update
    const base: OfferVersionRecord = existingOffer || {
      offerId: `offer_${normalized}`,
      version: 1,
      code: normalized,
      purpose: input.payload?.purpose || "Promotional Offer",
      destinationPath: input.payload?.destinationPath || "/send",
      discountType: input.payload?.discountType || "FIXED_AMOUNT",
      discountValue: input.payload?.discountValue ?? 100,
      status: "active",
      usedCount: 0,
      reservedCount: 0,
      totalDiscountGivenCents: 0,
      stackingAllowed: false,
      timezone: "UTC",
      createdAt: nowMs,
      updatedAt: nowMs,
    };

    const merged: OfferVersionRecord = {
      ...base,
      ...(input.payload || {}),
      code: normalized,
      updatedAt: nowMs,
    };

    await versionRef.set(merged, { merge: true });
    finalOffer = merged;
  }

  // Record Immutable Audit Log Entry
  const auditDocRef = firestoreDb.collection(ADMIN_AUDIT_LOG_COLLECTION).doc();
  const auditRecord: AdminAuditLogRecord = {
    id: auditDocRef.id,
    actorEmail: input.actorEmail,
    action: input.action,
    targetType: "offer",
    targetId: normalized,
    previousState: existingOffer || null,
    newState: finalOffer || null,
    reason: input.reason || preview.actionSummary,
    timestamp: nowMs,
  };
  await auditDocRef.set(auditRecord);

  return {
    success: true,
    auditId: auditDocRef.id,
    offer: finalOffer,
    action: input.action,
    actorEmail: input.actorEmail,
    timestamp: nowMs,
  };
}

// ============================================================================
// 3. Promotions Workspace Query & Price Preview (AC01)
// ============================================================================

/**
 * Lists all offers in the promotions workspace with live server price preview,
 * active reservation holds, and search/lifecycle filtering.
 */
export async function listPromotionsWorkspaceOffers(params?: {
  searchQuery?: string;
  lifecycleStatus?: OfferLifecycleStatus | "all";
  campaignId?: string;
}): Promise<PromotionsWorkspaceOfferItem[]> {
  const versionSnap = await readBoundedCollection(getOfferVersionsCollection());
  const nowMs = Date.now();

  const offersMap = new Map<string, OfferVersionRecord>();

  // Ingest versioned records
  versionSnap.forEach((doc) => {
    const data = doc.data() as OfferVersionRecord;
    if (data && data.code) {
      offersMap.set(data.code.toUpperCase(), data);
    }
  });

  // Bridge legacy discount_codes if missing from versions
  const legacySnap = await readBoundedCollection(firestoreDb.collection("discount_codes"));
  legacySnap.forEach((doc) => {
    const leg = doc.data() as any;
    const code = (leg.code || doc.id || "").trim().toUpperCase();
    if (code && !offersMap.has(code)) {
      offersMap.set(code, {
        offerId: `offer_${code}`,
        version: 1,
        code,
        purpose: leg.description || "Promotional Discount",
        destinationPath: "/",
        discountType: leg.type === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT",
        discountValue: leg.value || 0,
        status: leg.isActive ? "active" : "paused",
        maxUses: leg.maxUses,
        usedCount: leg.usedCount || 0,
        reservedCount: 0,
        totalDiscountGivenCents: leg.totalDiscountGivenCents || 0,
        stackingAllowed: false,
        timezone: "UTC",
        createdAt: leg.createdAt || nowMs,
        updatedAt: leg.updatedAt || nowMs,
      });
    }
  });

  const allOffers = Array.from(offersMap.values());
  const searchLower = (params?.searchQuery || "").trim().toLowerCase();
  const targetStatus = params?.lifecycleStatus || "all";

  const enriched: PromotionsWorkspaceOfferItem[] = [];

  for (const offer of allOffers) {
    const dynamicStatus = computeOfferLifecycleStatus(offer, nowMs);

    // Apply status filter
    if (targetStatus !== "all" && dynamicStatus !== targetStatus) {
      continue;
    }

    // Apply search filter (matches code, purpose, campaignId)
    if (searchLower) {
      const matchCode = offer.code.toLowerCase().includes(searchLower);
      const matchPurpose = (offer.purpose || "").toLowerCase().includes(searchLower);
      const matchCampaign = (offer.campaignId || "").toLowerCase().includes(searchLower);
      if (!matchCode && !matchPurpose && !matchCampaign) {
        continue;
      }
    }

    // Apply campaignId filter
    if (params?.campaignId && offer.campaignId !== params.campaignId) {
      continue;
    }

    const pricePreview = previewOfferPricing(offer.discountType, offer.discountValue);

    enriched.push({
      ...offer,
      status: dynamicStatus,
      livePricePreview: pricePreview,
      activeReservationsCount: offer.reservedCount || 0,
      historicalRedemptionsCount: offer.usedCount || 0,
      canHardDelete: (offer.usedCount || 0) === 0,
    });
  }

  // Sort: active/scheduled first, then by createdAt desc
  return enriched.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

// ============================================================================
// 4. Offer Evidence Detail (AC02)
// ============================================================================

/**
 * Reconciles offer funnel exposure, applies, redemptions, and exact financial cents.
 * Explicitly flags unknown supplier costs as "unconfirmed" and verified margin as null.
 */
export async function getOfferEvidenceDetail(code: string): Promise<OfferEvidenceDetail | null> {
  const normalized = (code || "").trim().toUpperCase();
  const offer = await getOrSyncOfferVersion(normalized);
  if (!offer) return null;

  // 1. Fetch Redemptions
  const redSnap = await readBoundedQuery(getOfferRedemptionsCollection().where("offerId", "==", `offer_${normalized}`));

  let paidDiscountedCount = 0;
  let freePromoCount = 0;
  let studioCompCount = 0;
  let grossListValueCents = 0;
  let totalDiscountSubsidyCents = 0;
  let netCapturedRevenueCents = 0;
  let refundedCents = 0;
  let refundCount = 0;

  const factSnapshot = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const evidenceFacts = factSnapshot.docs.map((doc) => doc.data() as FinancialFactRecord);
  const orderRows: OfferEvidenceDetail["orders"] = [];
  const platformBreakdown: Record<string, number> = {};

  redSnap.forEach((doc) => {
    const r = doc.data() as OfferRedemptionRecord & { refundAmountCents?: number; clientPlatform?: string };
    const payable = r.payableAmountCents || 0;
    const discount = r.discountAmountCents || 0;

    totalDiscountSubsidyCents += discount;
    netCapturedRevenueCents += evidenceFacts.filter((fact) => fact.orderId === r.orderId && fact.factType === "capture" && fact.currency === "usd").reduce((sum, fact) => sum + fact.amountCents, 0);
    grossListValueCents += payable + discount;

    const refunds = evidenceFacts.filter((fact) => fact.orderId === r.orderId && fact.factType === "refund" && fact.currency === "usd");
    if (refunds.length) refundCount++;
    refundedCents += refunds.reduce((sum, fact) => sum + fact.amountCents, 0);

    if (r.commercialKind === "studio_comp") {
      studioCompCount++;
    } else if (r.commercialKind === "free_promo" || payable === 0) {
      freePromoCount++;
    } else {
      paidDiscountedCount++;
    }

    const platform = r.clientPlatform || "desktop_browser";
    platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;

    orderRows.push({
      orderId: r.orderId,
      commercialKind: r.commercialKind,
      payableAmountCents: payable,
      discountAmountCents: discount,
      redeemedAt: r.redeemedAt,
      refunded: Boolean(r.refunded),
      refundAmountCents: r.refundAmountCents,
      clientPlatform: platform,
    });
  });

  // 2. Fetch Reservations
  const resSnap = await readBoundedQuery(getOfferReservationsCollection().where("code", "==", normalized));
  const totalReservations = resSnap.size;

  // 3. Fetch Quotes (Applies)
  const quotesSnap = await readBoundedQuery(getOfferQuotesCollection().where("code", "==", normalized));
  const totalApplies = quotesSnap.size;

  // 4. Fetch Views from Telemetry
  let viewsCount = 0;
  let rejectsCount = 0;
  try {
    const telemetrySnap = await readBoundedCollection(firestoreDb.collection("telemetry_events_v2"));
    telemetrySnap.forEach((doc) => {
      const data = doc.data() as any;
      const props = data.properties || {};
      const url = props.url || props.path || "";
      if (
        props.promo === normalized ||
        props.discount === normalized ||
        props.code === normalized ||
        url.includes(normalized)
      ) {
        if (data.event_name === "offer_viewed") viewsCount++;
        if (data.event_name === "offer_rejected" || data.event_name === "promo_rejected") rejectsCount++;
      }
    });
  } catch (error) {
    throw error; // Missing evidence must not look like a verified empty funnel.
  }

  return {
    code: normalized,
    offer,
    funnel: {
      views: viewsCount,
      applies: totalApplies,
      rejects: rejectsCount,
      reservations: totalReservations,
      redemptions: redSnap.size,
      refunds: refundCount,
    },
    financials: {
      grossListValueCents,
      totalDiscountSubsidyCents,
      netCapturedRevenueCents,
      refundedCents,
      costStatus: "unconfirmed",
      verifiedContributionMarginCents: null,
    },
    commercialBreakdown: {
      paidDiscountedCount,
      freePromoCount,
      studioCompCount,
    },
    platformBreakdown,
    orders: orderRows.sort((a, b) => b.redeemedAt - a.redeemedAt),
    coverageNote:
      "Guest identity and offer exposure are incomplete by nature. Anonymous sessions may view and apply offers across multiple devices without deterministic identity linkage. Supplier fulfillment costs remain unconfirmed until invoice reconciliation.",
  };
}

// ============================================================================
// 5. Growth Campaigns & Measured Recovery (AC03)
// ============================================================================

export const DESCRIPTIVE_ATTRIBUTION_BADGE =
  "Descriptive Redemption Share — Not Causal Lift (No Control Holdout)";

export const GROWTH_ADVISORY_NOTE =
  "Offer conversion metrics reflect observed redemptions, not verified incremental causal lift. In the absence of randomized control holdouts, automatic code termination on small sample sizes is strongly discouraged.";

/**
 * Builds the comprehensive Growth workspace report:
 * Merges full-cohort dated spend with campaign orders, separating paid vs free promo orders.
 */
export async function getGrowthCampaignAndRecoveryReport(params?: {
  startDate?: string;
  endDate?: string;
  channel?: string;
  device?: string;
  mode?: "customer_reporting" | "operational_all";
  environment?: EventEnvironment;
  timezone?: string;
  startMs?: number;
  endMs?: number;
}): Promise<GrowthWorkspaceReport> {
  // 1. Ingest Dated Spend
  const allDatedSpendRecords = await queryDatedSpend({
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
  const matchesChannel = (value: string, filter?: string) => {
    if (!filter || filter === "all") return true;
    const normalized = value.toLowerCase();
    if (filter === "paid") return normalized.includes("paid") || normalized.includes("cpc") || normalized.includes("ads");
    if (filter === "google_cpc") return normalized.includes("google");
    if (filter === "meta_paid") return normalized.includes("meta") || normalized.includes("facebook");
    if (filter === "organic_direct") return !normalized.includes("paid") && !normalized.includes("cpc") && !normalized.includes("ads");
    return normalized === filter.toLowerCase();
  };
  const datedSpendRecords = allDatedSpendRecords.filter((record) => matchesChannel(record.channel || "direct", params?.channel));

  const spendByCampaign = new Map<string, { spendCents: number; channel: string; status: MetricStatus }>();
  let totalDatedSpendCents = 0;

  for (const s of datedSpendRecords) {
    totalDatedSpendCents += s.amountCents;
    const key = (s.utmCampaign || s.channel || "direct").toLowerCase();
    const existing = spendByCampaign.get(key);
    if (existing) {
      existing.spendCents += s.amountCents;
    } else {
      spendByCampaign.set(key, {
        spendCents: s.amountCents,
        channel: s.channel || "direct",
        status: s.isEstimate ? "partial" : "verified",
      });
    }
  }

  // 2. Fetch Orders & Redemptions
  const ordersSnap = await readBoundedCollection(firestoreDb.collection("orders"));
  const redSnap = await readBoundedCollection(getOfferRedemptionsCollection());
  const factsSnap = await readBoundedCollection(firestoreDb.collection(FINANCIAL_FACTS_COLLECTION));
  const facts = factsSnap.docs.map((doc) => doc.data() as FinancialFactRecord).filter((fact) => fact.currency === "usd" &&
    (!params?.environment || (params.environment === "production" ? fact.livemode === true : fact.livemode === false)));
  const ordersById = new Map(ordersSnap.docs.map((doc) => [doc.id, doc.data() as any]));

  const redemptionsByOrderId = new Map<string, OfferRedemptionRecord>();
  redSnap.forEach((doc) => {
    const r = doc.data() as OfferRedemptionRecord;
    if (r.orderId) redemptionsByOrderId.set(r.orderId, r);
  });

  let totalPaidOrders = 0;
  let totalFreePromoOrders = 0;
  let totalStudioComps = 0;
  let totalCapturedRevenueCents = 0;

  const campaignStats = new Map<
    string,
    {
      paidCount: number;
      freePromoCount: number;
      studioCompCount: number;
      revenueCents: number;
      channel: string;
    }
  >();

  const inPeriod = (at: number) => {
    if (!Number.isFinite(at)) return false;
    if (params?.startMs !== undefined && at < params.startMs) return false;
    if (params?.endMs !== undefined && at >= params.endMs) return false;
    const date = formatDateInTimezone(at, params?.timezone || "America/Chicago");
    return (!params?.startDate || date >= params.startDate) && (!params?.endDate || date <= params.endDate);
  };
  const getStat = (order: any) => {
    const channel = order.channel || order.utmSource || order.attribution?.utmSource || "unattributed";
    if (!matchesChannel(channel, params?.channel)) return null;
    if (params?.device && params.device !== "all" && order.deviceCategory !== params.device) return null;
    const campaignKey = (order.utmCampaign || order.campaignId || order.attribution?.utmCampaign || "unattributed").toLowerCase();
    let stat = campaignStats.get(campaignKey);
    if (!stat) {
      stat = { paidCount: 0, freePromoCount: 0, studioCompCount: 0, revenueCents: 0, channel };
      campaignStats.set(campaignKey, stat);
    }
    return stat;
  };
  const countedOrders = new Set<string>();
  for (const fact of facts) {
    if (!inPeriod(fact.occurredAt)) continue;
    if (params?.mode !== "operational_all" && fact.commercialKind !== "paid_customer" && fact.commercialKind !== "discounted_paid") continue;
    const stat = getStat(ordersById.get(fact.orderId) || {});
    if (!stat) continue;
    if (fact.factType === "capture" && fact.amountCents > 0) {
      if (!countedOrders.has(fact.orderId || fact.providerObjectId)) {
        stat.paidCount++; totalPaidOrders++; countedOrders.add(fact.orderId || fact.providerObjectId);
      }
      stat.revenueCents += fact.amountCents; totalCapturedRevenueCents += fact.amountCents;
    } else if (fact.factType === "refund") {
      stat.revenueCents -= fact.amountCents; totalCapturedRevenueCents -= fact.amountCents;
    }
  }
  for (const redemption of redemptionsByOrderId.values()) {
    if (redemption.payableAmountCents !== 0 || !inPeriod(redemption.redeemedAt)) continue;
    const order = ordersById.get(redemption.orderId) || {};
    const stat = getStat(order); if (!stat) continue;
    if (redemption.commercialKind === "free_promo") { stat.freePromoCount++; totalFreePromoOrders++; }
    if (params?.mode === "operational_all" && redemption.commercialKind === "studio_comp") { stat.studioCompCount++; totalStudioComps++; }
  }

  // Reconcile Campaigns
  const allCampaignKeys = new Set([...spendByCampaign.keys(), ...campaignStats.keys()]);
  const campaignsList: GrowthCampaignReportItem[] = [];

  for (const cKey of allCampaignKeys) {
    const spendInfo = spendByCampaign.get(cKey);
    const orderInfo = campaignStats.get(cKey);

    const datedSpendCents = spendInfo?.spendCents || 0;
    const spendStatus = params?.device && params.device !== "all" ? "unavailable" : spendInfo?.status || "unavailable";
    const channel = spendInfo?.channel || orderInfo?.channel || "organic";

    const paidOrdersCount = orderInfo?.paidCount || 0;
    const freePromoOrdersCount = orderInfo?.freePromoCount || 0;
    const studioCompOrdersCount = orderInfo?.studioCompCount || 0;
    const totalOrdersCount = paidOrdersCount + freePromoOrdersCount + studioCompOrdersCount;
    const netCapturedRevenueCents = orderInfo?.revenueCents || 0;

    const roas =
      datedSpendCents > 0 && spendStatus !== "unavailable"
        ? Number((netCapturedRevenueCents / datedSpendCents).toFixed(2))
        : null;

    campaignsList.push({
      campaignId: cKey,
      channel,
      datedSpendCents,
      spendStatus,
      paidOrdersCount,
      freePromoOrdersCount,
      studioCompOrdersCount,
      totalOrdersCount,
      netCapturedRevenueCents,
      roas,
    });
  }

  // 3. Measured Recovery Candidates
  const recoveryCandidates = await queryRecoveryCandidates();

  return {
    attributionBadgeText: DESCRIPTIVE_ATTRIBUTION_BADGE,
    advisoryNote: GROWTH_ADVISORY_NOTE,
    totalDatedSpendCents,
    spendStatus: (params?.device && params.device !== "all") || datedSpendRecords.length === 0 ? "unavailable" : "partial",
    totalPaidOrders,
    totalFreePromoOrders,
    totalStudioComps,
    totalCapturedRevenueCents,
    campaigns: campaignsList.sort((a, b) => b.netCapturedRevenueCents - a.netCapturedRevenueCents),
    recoveryCandidates,
  };
}

/**
 * Identifies high-intent abandoned drafts and categorizes resumability:
 * - server_order_draft: stored with persistent draft token / orderId in database
 * - browser_local_only: local browser cart without server order draft
 */
export async function queryRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  const candidates: RecoveryCandidate[] = [];

  try {
    const ordersSnap = await readBoundedCollection(firestoreDb.collection("orders"));
    ordersSnap.forEach((doc) => {
      const o = doc.data() as any;
      if (o.status === "draft" || o.status === "pending_payment" || o.status === "abandoned") {
        const hasEmail = Boolean(o.customerEmail || o.senderEmail);
        candidates.push({
          draftId: doc.id,
          customerEmail: o.customerEmail || o.senderEmail || undefined,
          recipientName: o.recipientName || undefined,
          updatedAt: o.updatedAt || o.createdAt || Date.now(),
          resumabilityType: "server_order_draft",
          contactEligibility: hasEmail ? "eligible" : "anonymous_uncontactable",
          originalChannel: o.channel || o.utmSource || "direct",
          originalUtmCampaign: o.utmCampaign || undefined,

          destinationPath: "/send",
        });
      }
    });
  } catch (error) {
    // Don't turn a failed query into an apparently verified empty candidate list.
    throw error;
  }

  return candidates;
}

/**
 * Builds manual recovery link for a founder-assisted customer gesture.
 * Strictly preserves original acquisition attribution alongside recovery touch.
 * Copying or generating this link performs ZERO automated messaging.
 */
export function buildManualRecoveryLink(input: ManualRecoveryLinkInput): ManualRecoveryLinkResult {
  const baseOrigin = input.baseUrl ? input.baseUrl.replace(/\/+$/, "") : "https://sendmynotes.com";
  const rawPath = input.destinationPath || "/send";
  const validation = validateDestinationPath(rawPath);

  const searchParams = new URLSearchParams();
  searchParams.set("discount", input.offerCode.trim().toUpperCase());

  // Invariant: Preserve original channel and utm campaign, tag touch as manual recovery
  const originalChannel = input.originalChannel || "recovery";
  const originalCampaign = input.originalUtmCampaign || "recovery_assist";

  searchParams.set("utm_source", originalChannel);
  searchParams.set("utm_medium", "manual_recovery");
  searchParams.set("utm_campaign", originalCampaign);
  searchParams.set("recovered_from", input.draftId);

  // If server order draft, append draftId so checkout can restore server state
  if (input.resumabilityType === "server_order_draft") {
    searchParams.set("draftId", input.draftId);
  }

  const url = `${validation.normalizedPath}?${searchParams.toString()}`;
  const fullAbsoluteUrl = `${baseOrigin}${url}`;

  let notes = "";
  if (input.resumabilityType === "server_order_draft") {
    notes = "Server-synced draft. Recipient and message text will be restored across devices.";
  } else {
    notes =
      "Draft contents were stored in the visitor's local browser storage. This link applies the discount code at checkout, but cannot restore un-synced text across devices.";
  }

  return {
    draftId: input.draftId,
    resumabilityType: input.resumabilityType,
    offerCode: input.offerCode.toUpperCase(),
    url,
    fullAbsoluteUrl,
    preservesAttribution: {
      originalChannel,
      originalUtmCampaign: originalCampaign,
      touchType: "manual_recovery",
    },
    notes,
    noAutomatedOutreachDisclaimer:
      "Strict Invariant: Generating or copying this link sends zero automated customer messages. Outreach is purely founder-directed manual assistance.",
  };
}
