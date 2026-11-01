import crypto from "crypto";
import {
  AdminCompCatalogLine, AdminCompCatalogResponse, AdminCompMode, AdminCompQuoteRecord,
  AdminCompQuoteRequest, AdminCompQuoteSnapshot, AdminCompQuoteLineSnapshot,
} from "./admin-comp-types";
import { firestoreDb } from "./firebase-admin";
import { getImageCachePoolCollection } from "./firebase-admin";
import { getSupplierCountry, getEnabledDestination, normalizeCountryCode, MAILING_DESTINATIONS_VERSION } from "./mailing-destinations";
import { validateCoverImagePathOrUrl } from "./handwrytten";
import { BASE_PRICE_CENTS, INTERNATIONAL_SURCHARGE_CENTS, ORDER_PRICE_VERSION } from "./order-pricing";

export const ADMIN_COMP_QUOTE_VERSION = "admin-comp-v1";
export const ADMIN_COMP_CATALOG_VERSION = `admin-comp-catalog-${MAILING_DESTINATIONS_VERSION}-${ORDER_PRICE_VERSION}`;
export const ADMIN_COMP_QUOTE_TTL_MS = 15 * 60 * 1000;

const PRESETS = [
  { assetId: "preset:birthday-balloons", label: "Celebration Garland", url: "/presets/birthday-balloons.jpg" },
  { assetId: "preset:thank-you-botanical", label: "Wildflower Meadow", url: "/presets/thank-you-botanical.jpg" },
  { assetId: "preset:thinking-of-you-misty-pines", label: "Misty Pines & Dawn", url: "/presets/thinking-of-you-misty-pines.jpg" },
  { assetId: "preset:congrats-champagne", label: "Golden Cheers Coupes", url: "/presets/congrats-champagne.jpg" },
  { assetId: "preset:anniversary-monstera", label: "Botanical Wreath", url: "/presets/anniversary-monstera.jpg" },
  { assetId: "preset:love-roses", label: "Velvet Blossoms", url: "/presets/love-roses.jpg" },
] as const;

export function resolveAdminCompAsset(assetId: unknown): { url: string; label: string } | null {
  if (typeof assetId !== "string") return null;
  const item = PRESETS.find((preset) => preset.assetId === assetId);
  return item ? { url: item.url, label: item.label } : null;
}

/** A generated image is selectable only by its server-issued cache ID, never by URL. */
export async function resolveAdminCompAssetById(assetId: unknown): Promise<{ url: string; label: string } | null> {
  const preset = resolveAdminCompAsset(assetId);
  if (preset) return preset;
  if (typeof assetId !== "string" || !/^generated:cache_[a-zA-Z0-9_-]{1,96}$/.test(assetId)) return null;
  const cacheId = assetId.slice("generated:".length);
  const snap = await getImageCachePoolCollection().doc(cacheId).get();
  if (!snap.exists) return null;
  const item = snap.data() as { id?: string; imageUrl?: string; status?: string; isGenerated?: boolean; occasion?: string };
  if (item.id !== cacheId || !item.isGenerated || !["AVAILABLE", "CLAIMED"].includes(item.status || "") || !item.imageUrl) return null;
  try { validateCoverImagePathOrUrl(item.imageUrl); } catch { return null; }
  return { url: item.imageUrl, label: item.occasion ? `Generated artwork: ${item.occasion}` : "Generated artwork" };
}

export function isReviewOnlyAdminComp(env: Record<string, string | undefined> = process.env): boolean {
  return env.STAGING_REVIEW_ONLY === "true";
}

export function getAdminCompCatalogLines(countryCode: string): AdminCompCatalogLine[] {
  const lines: AdminCompCatalogLine[] = [
    { lineId: "card_a2", label: "Folded A2 card and domestic mailing", unitPriceCents: BASE_PRICE_CENTS, quantity: 1, adjustmentEligible: true },
  ];
  if (countryCode !== "US") {
    lines.push({ lineId: "international_mailing", label: "International mailing upgrade", unitPriceCents: INTERNATIONAL_SURCHARGE_CENTS, quantity: 1, adjustmentEligible: true });
  }
  return lines;
}

export function getAdminCompCatalog(country: unknown, env: Record<string, string | undefined> = process.env): AdminCompCatalogResponse {
  const countryCode = normalizeCountryCode(country);
  if (!countryCode) throw new Error("A valid recipient country is required.");
  const supplier = getSupplierCountry(countryCode);
  if (!supplier || supplier.suspended || (countryCode !== "US" && !getEnabledDestination(countryCode))) {
    throw new Error("This recipient country is not enabled for admin complimentary orders.");
  }
  const reviewOnly = isReviewOnlyAdminComp(env);
  return {
    catalogVersion: ADMIN_COMP_CATALOG_VERSION,
    quoteVersion: ADMIN_COMP_QUOTE_VERSION,
    currency: "USD",
    destination: {
      countryCode,
      countryName: supplier.countryName,
      regionRequired: supplier.regionRequired,
      postalCodeRequired: supplier.postalCodeRequired,
      regions: supplier.regions,
    },
    lines: getAdminCompCatalogLines(countryCode),
    presets: [...PRESETS],
    staging: { reviewOnly, canDispatch: !reviewOnly, canCreatePaymentRequest: !reviewOnly },
  };
}

function safeCents(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative integer number of cents.`);
  return value;
}

export function calculateAdminCompQuote(input: {
  countryCode: string;
  mode: AdminCompMode;
  adjustments?: Array<{ lineId: string; waivedCents: number }>;
  /** Internal pure-test seam: inject already server-trusted versioned catalog lines. Routes never pass this. */
  catalogLines?: readonly AdminCompCatalogLine[];
  now?: number;
}): AdminCompQuoteSnapshot {
  const countryCode = normalizeCountryCode(input.countryCode);
  if (!countryCode) throw new Error("A valid recipient country is required.");
  if (input.catalogLines !== undefined && !Array.isArray(input.catalogLines)) throw new Error("A trusted catalog must be an array of lines.");
  const lines = input.catalogLines ? input.catalogLines.map((line) => ({ ...line })) : getAdminCompCatalogLines(countryCode);
  if (lines.length === 0) throw new Error("A trusted catalog must contain at least one line.");
  const adjustments = input.adjustments === undefined ? [] : input.adjustments;
  if (!Array.isArray(adjustments)) throw new Error("Adjustments must be an array.");
  if (input.mode !== "full_comp" && input.mode !== "individual_adjustments") throw new Error("A valid admin-comp mode is required.");
  if (input.mode === "full_comp" && adjustments.length) throw new Error("Full comp does not accept client adjustment values.");
  const catalogIds = new Set<string>();
  for (const line of lines) {
    if (!line || typeof line.lineId !== "string" || !line.lineId || catalogIds.has(line.lineId) || typeof line.label !== "string" ||
        !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || typeof line.adjustmentEligible !== "boolean") {
      throw new Error("Trusted catalog contains an invalid line.");
    }
    catalogIds.add(line.lineId);
  }
  const snapshotLines: AdminCompQuoteLineSnapshot[] = lines.map((line) => {
    const itemAdjustments = adjustments.filter((adjustment) => adjustment?.lineId === line.lineId);
    if (itemAdjustments.length > 1) throw new Error("Duplicate adjustment line IDs are not allowed.");
    const adjustment = itemAdjustments[0];
    const grossCents = safeCents(line.unitPriceCents * line.quantity, "Line total");
    const waivedCents = input.mode === "full_comp" ? grossCents : adjustment ? safeCents(adjustment.waivedCents, "Waived amount") : 0;
    if (!line.adjustmentEligible && waivedCents !== 0) throw new Error("This line is not eligible for adjustment.");
    if (waivedCents > grossCents) throw new Error("Adjustment cannot exceed its line total.");
    return { ...line, grossCents, waivedCents, dueCents: grossCents - waivedCents };
  });
  for (const adjustment of adjustments) {
    if (!adjustment || typeof adjustment.lineId !== "string" || !lines.some((line) => line.lineId === adjustment.lineId)) throw new Error("Unknown line item cannot be adjusted.");
    if (input.mode !== "individual_adjustments") throw new Error("Unexpected adjustment values for full comp.");
  }
  const grossCents = snapshotLines.reduce((sum, line) => sum + line.grossCents, 0);
  const waivedCents = snapshotLines.reduce((sum, line) => sum + line.waivedCents, 0);
  const customerPayableCents = snapshotLines.reduce((sum, line) => sum + line.dueCents, 0);
  const issuedAt = input.now ?? 0;
  return Object.freeze({
    quoteId: "unissued",
    version: ADMIN_COMP_QUOTE_VERSION,
    catalogVersion: ADMIN_COMP_CATALOG_VERSION,
    currency: "USD",
    destinationCountryCode: countryCode,
    lines: snapshotLines,
    grossCents,
    waivedCents,
    customerPayableCents,
    mode: input.mode,
    issuedAt,
    expiresAt: issuedAt + ADMIN_COMP_QUOTE_TTL_MS,
  });
}

export function isAdminCompQuoteSnapshotValid(value: unknown): value is AdminCompQuoteSnapshot {
  if (!value || typeof value !== "object") return false;
  const quote = value as AdminCompQuoteSnapshot;
  if (quote.version !== ADMIN_COMP_QUOTE_VERSION || typeof quote.quoteId !== "string" || !quote.quoteId || typeof quote.catalogVersion !== "string" || !quote.catalogVersion ||
      (quote.mode !== "full_comp" && quote.mode !== "individual_adjustments") || !Number.isSafeInteger(quote.issuedAt) || !Number.isSafeInteger(quote.expiresAt) ||
      quote.expiresAt <= quote.issuedAt || quote.currency !== "USD" || !/^[A-Z]{2}$/.test(quote.destinationCountryCode) || !Array.isArray(quote.lines) || !quote.lines.length) return false;
  if (![quote.grossCents, quote.waivedCents, quote.customerPayableCents].every((n) => Number.isSafeInteger(n) && n >= 0)) return false;
  const ids = new Set<string>();
  let gross = 0, waived = 0, due = 0;
  for (const line of quote.lines) {
    if (!line || typeof line.lineId !== "string" || !line.lineId || typeof line.label !== "string" || !line.label || typeof line.adjustmentEligible !== "boolean" || ids.has(line.lineId) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) return false;
    ids.add(line.lineId);
    const expectedGross = line.unitPriceCents * line.quantity;
    if (![line.grossCents, line.waivedCents, line.dueCents].every((n) => Number.isSafeInteger(n) && n >= 0) || line.grossCents !== expectedGross || line.waivedCents > line.grossCents || line.dueCents !== line.grossCents - line.waivedCents) return false;
    if (quote.mode === "full_comp" && line.waivedCents !== line.grossCents) return false;
    gross += line.grossCents; waived += line.waivedCents; due += line.dueCents;
  }
  return Number.isSafeInteger(gross) && gross === quote.grossCents && waived === quote.waivedCents && due === quote.customerPayableCents && gross - waived === due;
}

export async function issueAdminCompQuote(input: AdminCompQuoteRequest, actor: string): Promise<AdminCompQuoteSnapshot> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500) throw new Error("A reason between 1 and 500 characters is required.");
  const countryCode = normalizeCountryCode(input.destinationCountryCode);
  if (!countryCode) throw new Error("A valid recipient country is required.");
  // Catalog access is the destination policy gate: international admin orders remain preview-only.
  getAdminCompCatalog(countryCode);
  const calculated = calculateAdminCompQuote({ countryCode, mode: input.mode, adjustments: input.adjustments });
  if (calculated.customerPayableCents > 0 && calculated.customerPayableCents < 50) throw new Error("Positive customer balances below Stripe’s $0.50 minimum are not allowed.");
  const issuedAt = Date.now();
  const snapshot: AdminCompQuoteSnapshot = Object.freeze({ ...calculated, quoteId: `acq_${crypto.randomBytes(16).toString("hex")}`, issuedAt, expiresAt: issuedAt + ADMIN_COMP_QUOTE_TTL_MS });
  const record: AdminCompQuoteRecord = { ...snapshot, issuedToActor: actor, reason };
  await firestoreDb.collection("admin_comp_quotes").doc(snapshot.quoteId).set(record);
  await firestoreDb.collection("admin_comp_audit").doc(`quote_${snapshot.quoteId}`).set({
    eventId: `quote_${snapshot.quoteId}`, event: "quote_issued", quoteId: snapshot.quoteId,
    actor, reason, occurredAt: snapshot.issuedAt, destinationCountryCode: countryCode,
    grossCents: snapshot.grossCents, waivedCents: snapshot.waivedCents, customerPayableCents: snapshot.customerPayableCents,
  });
  return snapshot;
}

export function publicAdminCompQuote(record: AdminCompQuoteRecord): AdminCompQuoteSnapshot {
  const { issuedToActor: _actor, reason: _reason, consumedAt: _consumed, consumedByOrderId: _order, ...snapshot } = record;
  return snapshot;
}

export function normalizeCompAddressCountry(address: Record<string, unknown>, countryCode: string): Record<string, unknown> {
  return { ...address, country: countryCode };
}

export const ADMIN_COMP_PRESETS = PRESETS;
