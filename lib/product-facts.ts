/**
 * SendMyNotes Canonical Product Facts & Truth Source
 *
 * Governing documents:
 * - /docs/CANONICAL_PRODUCT_SPECS.md (Reviewed October 11, 2026)
 * - /docs/CANONICAL_PROJECT_BRIEF.md
 * - /docs/CONVERSION_REDESIGN_WORK_PLAN.md (§0, §4.4)
 *
 * This module is the single source of truth for pricing, geometry,
 * material terminology, handwriting process, and delivery timing guidance.
 * All customer-facing copy and preview configurations must import from here.
 */

// ============================================================================
// 1. PRICING (Canonical Specs row: "Customer price", CARD_FLAT_RATE_CENTS = 900)
// ============================================================================
export const PRODUCT_PRICE = {
  amountInDollars: 9,
  amountInCents: 900,
  currency: "USD",
  formattedPrice: "$9.00",
  shortFormattedPrice: "$9",
  priceDescription: "$9 including mailing",
  pricingNotice: "$9.00 flat rate per physical card (printing, real ink handwriting, postage, and USPS First-Class mail included).",
} as const;

// ============================================================================
// 2. FORMAT & GEOMETRY (Canonical Specs rows: "Selected format", "Folded dimensions", "Open dimensions", "Front aspect ratio")
// ============================================================================
export const PRODUCT_FORMAT = {
  formatName: "Folded A2",
  foldedWidthInches: 4.25,
  foldedHeightInches: 5.5,
  openWidthInches: 8.5,
  openHeightInches: 5.5,
  foldedDimensionsDisplay: '4.25" × 5.5"',
  openDimensionsDisplay: '8.5" × 5.5"',
  aspectRatioFront: {
    width: 17,
    height: 22,
    ratioString: "17:22",
    ratioDecimal: 17 / 22, // ~0.772727
  },
  aspectRatioOpen: {
    width: 17,
    height: 11,
    ratioString: "17:11",
    ratioDecimal: 17 / 11,
  },
  orientation: "portrait",
  displayDescription: "A2 folded card (4.25 × 5.5 in)",
} as const;

// ============================================================================
// 3. MATERIALS & FINISH (Canonical Specs rows: "Paper weight, composition, finish", "Envelope specifications")
// Rule: Do not claim 100 lb, 120 lb, 70 lb, cotton, archival, letterpress, or embossing.
// ============================================================================
export const PRODUCT_MATERIALS = {
  paperDescription: "cardstock",
  paperDisplay: "Quality cardstock",
  envelopeDescription: "envelope",
  envelopeDisplay: "Paper envelope",
  coverDescription: "Printed front artwork on folded cardstock",
} as const;

// ============================================================================
// 4. HANDWRITING & INTERIOR (Canonical Specs row: "Interior")
// Rule: Equipment holds real pens. Never claim "human handwriting".
// ============================================================================
export const PRODUCT_HANDWRITING = {
  instrument: "real ballpoint pen",
  mechanism: "automated handwriting equipment holding real pens",
  shortDescription: "Written with a real pen by automated handwriting equipment",
  customerFacingDescription: "Written with a real pen and ink, stamped, and mailed for you.",
  adLine: "Your words. Real ink. Mailed for you.",
} as const;

// ============================================================================
// 5. POSTAGE & MAILING ORIGIN (Canonical Specs rows: "Postage", "Mailing origin")
// Rule: USPS First-Class with a real stamp; no stamp design promise; no sender-local postmark promise.
// ============================================================================
export const PRODUCT_POSTAGE = {
  carrier: "USPS",
  serviceClass: "USPS First-Class",
  stampDescription: "Physical USPS First-Class postage stamp",
  stampNotice: "Addressed and stamped with genuine USPS First-Class postage.",
  originFacility: "Phoenix, Arizona",
} as const;

// ============================================================================
// 6. FULFILLMENT & TRANSIT TIMING (Canonical Specs rows: "Preparation time", "Transit time")
// Rule: Preparation typically 1–2 business days. Transit typically 2–7 business days domestically.
// Estimates only, never guarantees; no hard cutoffs or same-day dispatch claims.
// ============================================================================
export const PRODUCT_TIMING = {
  preparationBusinessDaysMin: 1,
  preparationBusinessDaysMax: 2,
  preparationDescription: "Typically 1–2 business days for printing and real-pen inking",
  transitBusinessDaysMin: 2,
  transitBusinessDaysMax: 7,
  transitDescription: "Typically 2–7 business days domestic transit via USPS First-Class",
  summaryGuidance: "Preparation typically takes 1–2 business days, followed by 2–7 business days domestic USPS First-Class transit. Delivery timing is estimated, not guaranteed.",
  isEstimate: true,
} as const;

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Returns the canonical product summary label.
 */
export function getProductSummaryLabel(): string {
  return `${PRODUCT_FORMAT.formatName} Card • ${PRODUCT_PRICE.priceDescription}`;
}

/**
 * Returns a truthful description of materials and handwriting.
 */
export function getMaterialAndInkDescription(): string {
  return `${PRODUCT_MATERIALS.paperDisplay} • ${PRODUCT_HANDWRITING.shortDescription}`;
}

/**
 * Returns delivery timing guidance text suitable for tooltips, FAQs, or checkout notices.
 */
export function getDeliveryTimingGuidance(): string {
  return PRODUCT_TIMING.summaryGuidance;
}
