/**
 * lib/spend-and-cost-ledger.ts
 *
 * Authenticated, idempotent imports and queries for dated campaign spend,
 * supplier invoice cost allocations, and processor fees.
 *
 * SPRINT-0004-T04: Dated spend and cost inputs.
 * Guarantees:
 * - Repeated imports never double spend or costs (AC04).
 * - Distinguishes verified invoice allocations from estimates.
 * - Missing or zero costs never default to profitability or $0 CAC (AC02).
 * - Fully compatible with mock and cloud Firestore.
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { readBoundedCollection, readBoundedQuery, boundedCoverage } from "./bounded-admin-read";
import { MetricStatus } from "./contracts/admin-overhaul";

export const DATED_SPEND_COLLECTION = "dated_spend_ledger";
export const SUPPLIER_COST_COLLECTION = "supplier_cost_allocations";

// ----------------------------------------------------------------------------
// Interfaces & Types
// ----------------------------------------------------------------------------

export interface DatedSpendRecord {
  id: string;
  idempotencyKey: string;
  date: string; // YYYY-MM-DD in America/Chicago
  channel: string;
  utmCampaign?: string;
  amountCents: number;
  currency: string;
  source: "google_ads_export" | "meta_ads_export" | "csv_import" | "manual_entry" | "system";
  timezone: string;
  isEstimate: boolean;
  importedAt: number;
  importedBy?: string;
  notes?: string;
  correctionOfId?: string;
}

export interface SupplierCostAllocationRecord {
  id: string;
  idempotencyKey: string;
  orderId: string;
  invoiceId: string;
  supplier: "handwrytten" | "usps" | "other";
  basePrintCostCents: number;
  postageCostCents: number;
  totalSupplierCostCents: number;
  currency: string;
  isEstimate: boolean;
  allocatedAt: number;
  importedAt: number;
  importedBy?: string;
  notes?: string;
}

export interface DatedSpendImportItem {
  date: string; // YYYY-MM-DD
  channel: string;
  utmCampaign?: string;
  amountCents: number;
  currency?: string;
  source?: "google_ads_export" | "meta_ads_export" | "csv_import" | "manual_entry" | "system";
  isEstimate?: boolean;
  idempotencyKey?: string;
  notes?: string;
}

export interface DatedSpendImportPreviewItem {
  item: DatedSpendImportItem;
  action: "insert" | "noop_duplicate" | "update";
  computedId: string;
  existingRecord?: DatedSpendRecord;
  reason?: string;
}

export interface DatedSpendImportPreview {
  totalItems: number;
  newItems: number;
  duplicateItems: number;
  updatedItems: number;
  totalAmountCents: number;
  netNewAmountCents: number;
  previewEntries: DatedSpendImportPreviewItem[];
  validationErrors: Array<{ index: number; error: string }>;
}

export interface SupplierCostImportItem {
  orderId: string;
  invoiceId: string;
  supplier?: "handwrytten" | "usps" | "other";
  basePrintCostCents?: number;
  postageCostCents?: number;
  totalSupplierCostCents: number;
  currency?: string;
  isEstimate?: boolean;
  idempotencyKey?: string;
  notes?: string;
}

export interface SupplierCostImportPreviewItem {
  item: SupplierCostImportItem;
  action: "insert" | "noop_duplicate" | "update";
  computedId: string;
  existingRecord?: SupplierCostAllocationRecord;
  reason?: string;
}

export interface SupplierCostImportPreview {
  totalItems: number;
  newItems: number;
  duplicateItems: number;
  updatedItems: number;
  totalCostCents: number;
  netNewCostCents: number;
  previewEntries: SupplierCostImportPreviewItem[];
  validationErrors: Array<{ index: number; error: string }>;
}

export interface SpendAndCostCoverageSummary {
  window: {
    startDate: string;
    endDate: string;
  };
  datedSpend: {
    totalSpendCents: number;
    daysCovered: number;
    totalDaysInWindow: number;
    coverageRatio: number;
    status: MetricStatus;
    byChannel: Record<string, number>;
  };
  supplierCost: {
    totalOrdersEvaluated: number;
    ordersWithVerifiedInvoice: number;
    ordersWithEstimatedCost: number;
    ordersWithMissingCost: number;
    totalActualCostCents: number;
    totalEstimatedCostCents: number;
    coverageRatio: number | null;
    status: MetricStatus;
  };
}

// ----------------------------------------------------------------------------
// Deterministic Key Computation & Sanitation
// ----------------------------------------------------------------------------

function sanitizeSlug(val: string): string {
  return val.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

export function computeDatedSpendId(
  date: string,
  channel: string,
  campaign?: string
): string {
  const normDate = date.trim();
  const normChan = sanitizeSlug(channel);
  const normCamp = campaign ? sanitizeSlug(campaign) : "_all_";
  return `spend_${normDate}_${normChan}_${normCamp}`;
}

export function computeSupplierCostId(orderId: string, invoiceId: string): string {
  const normOrder = sanitizeSlug(orderId);
  const normInv = sanitizeSlug(invoiceId);
  return `cost_${normOrder}_${normInv}`;
}

// ----------------------------------------------------------------------------
// Dated Spend Import & Queries
// ----------------------------------------------------------------------------

export async function previewDatedSpendImport(
  items: DatedSpendImportItem[]
): Promise<DatedSpendImportPreview> {
  const validationErrors: Array<{ index: number; error: string }> = [];
  const previewEntries: DatedSpendImportPreviewItem[] = [];

  let newItems = 0;
  let duplicateItems = 0;
  let updatedItems = 0;
  let totalAmountCents = 0;
  let netNewAmountCents = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Validation
    if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date.trim())) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} has invalid date format: '${item.date}'. Expected YYYY-MM-DD.`,
      });
      continue;
    }
    if (!item.channel || item.channel.trim().length === 0) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} is missing channel.`,
      });
      continue;
    }
    if (typeof item.amountCents !== "number" || isNaN(item.amountCents) || item.amountCents < 0) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} has invalid amountCents: '${item.amountCents}'. Must be non-negative integer.`,
      });
      continue;
    }

    const computedId = item.idempotencyKey
      ? `spend_${sanitizeSlug(item.idempotencyKey)}`
      : computeDatedSpendId(item.date, item.channel, item.utmCampaign);

    totalAmountCents += Math.round(item.amountCents);

    // Check existing
    const existingDoc = await firestoreDb.collection(DATED_SPEND_COLLECTION).doc(computedId).get();

    if (existingDoc.exists) {
      const existingData = existingDoc.data() as DatedSpendRecord;
      const isExactMatch =
        existingData.amountCents === Math.round(item.amountCents) &&
        Boolean(existingData.isEstimate) === Boolean(item.isEstimate);

      if (isExactMatch) {
        duplicateItems++;
        previewEntries.push({
          item,
          action: "noop_duplicate",
          computedId,
          existingRecord: existingData,
          reason: "Identical record already exists in spend ledger. Will not duplicate.",
        });
      } else {
        updatedItems++;
        const deltaCents = Math.round(item.amountCents) - existingData.amountCents;
        netNewAmountCents += deltaCents;
        previewEntries.push({
          item,
          action: "update",
          computedId,
          existingRecord: existingData,
          reason: `Updating amount from ${existingData.amountCents}c to ${Math.round(item.amountCents)}c.`,
        });
      }
    } else {
      newItems++;
      netNewAmountCents += Math.round(item.amountCents);
      previewEntries.push({
        item,
        action: "insert",
        computedId,
        reason: "New spend entry.",
      });
    }
  }

  return {
    totalItems: items.length,
    newItems,
    duplicateItems,
    updatedItems,
    totalAmountCents,
    netNewAmountCents,
    previewEntries,
    validationErrors,
  };
}

export async function commitDatedSpendImport(
  items: DatedSpendImportItem[],
  user?: string
): Promise<{
  committed: number;
  duplicatesSkipped: number;
  totalCents: number;
  errors: Array<{ index: number; error: string }>;
}> {
  const preview = await previewDatedSpendImport(items);

  if (preview.validationErrors.length > 0) {
    return {
      committed: 0,
      duplicatesSkipped: preview.duplicateItems,
      totalCents: 0,
      errors: preview.validationErrors,
    };
  }

  let committed = 0;
  const now = Date.now();

  for (const entry of preview.previewEntries) {
    if (entry.action === "noop_duplicate") {
      continue;
    }

    const record: DatedSpendRecord = {
      id: entry.computedId,
      idempotencyKey: entry.item.idempotencyKey || entry.computedId,
      date: entry.item.date.trim(),
      channel: entry.item.channel.trim(),
      utmCampaign: entry.item.utmCampaign?.trim(),
      amountCents: Math.round(entry.item.amountCents),
      currency: (entry.item.currency || "USD").toUpperCase(),
      source: entry.item.source || "manual_entry",
      timezone: "America/Chicago",
      isEstimate: Boolean(entry.item.isEstimate),
      importedAt: now,
      importedBy: user || "system_import",
      notes: entry.item.notes,
      correctionOfId: entry.action === "update" ? entry.existingRecord?.id : undefined,
    };

    const sanitized = sanitizeFirestoreData(record);
    await firestoreDb.collection(DATED_SPEND_COLLECTION).doc(entry.computedId).set(sanitized);
    committed++;
  }

  return {
    committed,
    duplicatesSkipped: preview.duplicateItems,
    totalCents: preview.totalAmountCents,
    errors: [],
  };
}

export async function queryDatedSpend(params?: {
  startDate?: string;
  endDate?: string;
  channel?: string;
  campaign?: string;
}): Promise<DatedSpendRecord[]> {
  let query: any = firestoreDb.collection(DATED_SPEND_COLLECTION);
  if (params?.startDate) query = query.where("date", ">=", params.startDate);
  if (params?.endDate) query = query.where("date", "<=", params.endDate);
  const snapshot = await readBoundedCollection(query);
  const records: DatedSpendRecord[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as DatedSpendRecord;
    if (!data || !data.date) return;

    if (params?.startDate && data.date < params.startDate) return;
    if (params?.endDate && data.date > params.endDate) return;

    if (params?.channel && params.channel !== "all") {
      if (data.channel.toLowerCase() !== params.channel.toLowerCase()) return;
    }

    if (params?.campaign && params.campaign !== "all") {
      if ((data.utmCampaign || "").toLowerCase() !== params.campaign.toLowerCase()) return;
    }

    records.push(data);
  });

  const sorted = records.sort((a, b) => a.date.localeCompare(b.date));
  Object.defineProperty(sorted, "sourceCoverage", { value: boundedCoverage(snapshot), enumerable: false });
  return sorted;
}

export async function queryDatedSpendWithCoverage(params?: Parameters<typeof queryDatedSpend>[0]): Promise<{ records: DatedSpendRecord[]; coverage: ReturnType<typeof boundedCoverage> }> {
  const records = await queryDatedSpend(params);
  return { records, coverage: (records as any).sourceCoverage };
}

/* Legacy implementation retained for stable callers. */
async function queryDatedSpendOld(params?: Parameters<typeof queryDatedSpend>[0]): Promise<{ records: DatedSpendRecord[]; coverage: ReturnType<typeof boundedCoverage> }> {
  const snapshot = await readBoundedCollection(firestoreDb.collection(DATED_SPEND_COLLECTION));
  const records = snapshot.docs.map((doc) => doc.data() as DatedSpendRecord).filter((data) => {
    if (!data?.date) return false;
    if (params?.startDate && data.date < params.startDate) return false;
    if (params?.endDate && data.date > params.endDate) return false;
    if (params?.channel && params.channel !== "all" && data.channel.toLowerCase() !== params.channel.toLowerCase()) return false;
    if (params?.campaign && params.campaign !== "all" && (data.utmCampaign || "").toLowerCase() !== params.campaign.toLowerCase()) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { records, coverage: boundedCoverage(snapshot) };
}

// ----------------------------------------------------------------------------
// Supplier Cost Import & Queries
// ----------------------------------------------------------------------------

export async function previewSupplierCostImport(
  items: SupplierCostImportItem[]
): Promise<SupplierCostImportPreview> {
  const validationErrors: Array<{ index: number; error: string }> = [];
  const previewEntries: SupplierCostImportPreviewItem[] = [];

  let newItems = 0;
  let duplicateItems = 0;
  let updatedItems = 0;
  let totalCostCents = 0;
  let netNewCostCents = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item.orderId || item.orderId.trim().length === 0) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} is missing orderId.`,
      });
      continue;
    }
    if (!item.invoiceId || item.invoiceId.trim().length === 0) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} is missing invoiceId.`,
      });
      continue;
    }
    if (
      typeof item.totalSupplierCostCents !== "number" ||
      isNaN(item.totalSupplierCostCents) ||
      item.totalSupplierCostCents < 0
    ) {
      validationErrors.push({
        index: i,
        error: `Item at index ${i} has invalid totalSupplierCostCents: '${item.totalSupplierCostCents}'.`,
      });
      continue;
    }

    const computedId = item.idempotencyKey
      ? `cost_${sanitizeSlug(item.idempotencyKey)}`
      : computeSupplierCostId(item.orderId, item.invoiceId);

    totalCostCents += Math.round(item.totalSupplierCostCents);

    const existingDoc = await firestoreDb.collection(SUPPLIER_COST_COLLECTION).doc(computedId).get();

    if (existingDoc.exists) {
      const existingData = existingDoc.data() as SupplierCostAllocationRecord;
      const isExactMatch =
        existingData.totalSupplierCostCents === Math.round(item.totalSupplierCostCents) &&
        Boolean(existingData.isEstimate) === Boolean(item.isEstimate);

      if (isExactMatch) {
        duplicateItems++;
        previewEntries.push({
          item,
          action: "noop_duplicate",
          computedId,
          existingRecord: existingData,
          reason: "Identical supplier cost record already exists. Will not duplicate.",
        });
      } else {
        updatedItems++;
        const deltaCents = Math.round(item.totalSupplierCostCents) - existingData.totalSupplierCostCents;
        netNewCostCents += deltaCents;
        previewEntries.push({
          item,
          action: "update",
          computedId,
          existingRecord: existingData,
          reason: `Updating supplier cost from ${existingData.totalSupplierCostCents}c to ${Math.round(item.totalSupplierCostCents)}c.`,
        });
      }
    } else {
      newItems++;
      netNewCostCents += Math.round(item.totalSupplierCostCents);
      previewEntries.push({
        item,
        action: "insert",
        computedId,
        reason: "New supplier cost allocation.",
      });
    }
  }

  return {
    totalItems: items.length,
    newItems,
    duplicateItems,
    updatedItems,
    totalCostCents,
    netNewCostCents,
    previewEntries,
    validationErrors,
  };
}

export async function commitSupplierCostImport(
  items: SupplierCostImportItem[],
  user?: string
): Promise<{
  committed: number;
  duplicatesSkipped: number;
  totalCents: number;
  errors: Array<{ index: number; error: string }>;
}> {
  const preview = await previewSupplierCostImport(items);

  if (preview.validationErrors.length > 0) {
    return {
      committed: 0,
      duplicatesSkipped: preview.duplicateItems,
      totalCents: 0,
      errors: preview.validationErrors,
    };
  }

  let committed = 0;
  const now = Date.now();

  for (const entry of preview.previewEntries) {
    if (entry.action === "noop_duplicate") {
      continue;
    }

    const record: SupplierCostAllocationRecord = {
      id: entry.computedId,
      idempotencyKey: entry.item.idempotencyKey || entry.computedId,
      orderId: entry.item.orderId.trim(),
      invoiceId: entry.item.invoiceId.trim(),
      supplier: entry.item.supplier || "handwrytten",
      basePrintCostCents: Math.round(entry.item.basePrintCostCents ?? entry.item.totalSupplierCostCents),
      postageCostCents: Math.round(entry.item.postageCostCents ?? 0),
      totalSupplierCostCents: Math.round(entry.item.totalSupplierCostCents),
      currency: (entry.item.currency || "USD").toUpperCase(),
      isEstimate: Boolean(entry.item.isEstimate),
      allocatedAt: now,
      importedAt: now,
      importedBy: user || "system_import",
      notes: entry.item.notes,
    };

    const sanitized = sanitizeFirestoreData(record);
    await firestoreDb.collection(SUPPLIER_COST_COLLECTION).doc(entry.computedId).set(sanitized);
    committed++;
  }

  return {
    committed,
    duplicatesSkipped: preview.duplicateItems,
    totalCents: preview.totalCostCents,
    errors: [],
  };
}

export async function querySupplierCostsForOrders(
  orderIds: string[]
): Promise<Map<string, SupplierCostAllocationRecord> & { sourceCoverage?: ReturnType<typeof boundedCoverage> }> {
  const map = new Map<string, SupplierCostAllocationRecord>();
  if (!orderIds || orderIds.length === 0) return map;

  const orderIdSet = new Set(orderIds);
  const snapshot = await readBoundedCollection(firestoreDb.collection(SUPPLIER_COST_COLLECTION));

  snapshot.forEach((doc) => {
    const data = doc.data() as SupplierCostAllocationRecord;
    if (data && orderIdSet.has(data.orderId)) {
      // If multiple allocations exist for an order, preserve latest non-estimate, or sum them
      const prev = map.get(data.orderId);
      if (!prev || (prev.isEstimate && !data.isEstimate) || data.allocatedAt > prev.allocatedAt) {
        map.set(data.orderId, data);
      }
    }
  });

  Object.defineProperty(map, "sourceCoverage", { value: boundedCoverage(snapshot), enumerable: false });
  return map;
}

// ----------------------------------------------------------------------------
// Spend & Cost Coverage Evaluation
// ----------------------------------------------------------------------------

export async function computeSpendAndCostCoverage(params: {
  orderIds: string[];
  startDate: string;
  endDate: string;
  channels?: string[];
}): Promise<SpendAndCostCoverageSummary> {
  const { orderIds, startDate, endDate } = params;

  // 1. Spend Coverage
  const spendRecords = (await queryDatedSpend({ startDate, endDate })).filter((record) =>
    !params.channels || params.channels.some((channel) => channel.toLowerCase() === record.channel.toLowerCase()));
  let totalSpendCents = 0;
  const daysWithSpend = new Set<string>();
  const byChannel: Record<string, number> = {};

  for (const rec of spendRecords) {
    totalSpendCents += rec.amountCents;
    daysWithSpend.add(rec.date);
    byChannel[rec.channel] = (byChannel[rec.channel] || 0) + rec.amountCents;
  }

  // Calculate day count in [startDate, endDate]
  const dStart = new Date(`${startDate}T12:00:00Z`).getTime();
  const dEnd = new Date(`${endDate}T12:00:00Z`).getTime();
  const totalDaysInWindow = Math.max(1, Math.round((dEnd - dStart) / (24 * 3600 * 1000)) + 1);
  const spendCoverageRatio = totalDaysInWindow > 0 ? daysWithSpend.size / totalDaysInWindow : 0;

  let spendStatus: MetricStatus = "unavailable";
  if (daysWithSpend.size === totalDaysInWindow && !spendRecords.some((record) => record.isEstimate)) {
    spendStatus = "verified";
  } else if (daysWithSpend.size > 0) {
    spendStatus = "partial";
  }

  // 2. Cost Coverage for Orders
  const costMap = await querySupplierCostsForOrders(orderIds);
  let ordersWithVerifiedInvoice = 0;
  let ordersWithEstimatedCost = 0;
  let ordersWithMissingCost = 0;
  let totalActualCostCents = 0;
  let totalEstimatedCostCents = 0;

  for (const orderId of orderIds) {
    const alloc = costMap.get(orderId);
    if (!alloc) {
      ordersWithMissingCost++;
    } else if (alloc.isEstimate) {
      ordersWithEstimatedCost++;
      totalEstimatedCostCents += alloc.totalSupplierCostCents;
    } else {
      ordersWithVerifiedInvoice++;
      totalActualCostCents += alloc.totalSupplierCostCents;
    }
  }

  const totalOrders = orderIds.length;
  let costCoverageRatio: number | null = null;
  let costStatus: MetricStatus = "unavailable";

  if (totalOrders > 0) {
    costCoverageRatio = ordersWithVerifiedInvoice / totalOrders;
    if (ordersWithVerifiedInvoice === totalOrders) {
      costStatus = "verified";
    } else if (ordersWithVerifiedInvoice > 0 || ordersWithEstimatedCost > 0) {
      costStatus = "partial";
    } else {
      costStatus = "unavailable";
    }
  }

  return {
    window: { startDate, endDate },
    datedSpend: {
      totalSpendCents,
      daysCovered: daysWithSpend.size,
      totalDaysInWindow,
      coverageRatio: spendCoverageRatio,
      status: spendStatus,
      byChannel,
    },
    supplierCost: {
      totalOrdersEvaluated: totalOrders,
      ordersWithVerifiedInvoice,
      ordersWithEstimatedCost,
      ordersWithMissingCost,
      totalActualCostCents,
      totalEstimatedCostCents,
      coverageRatio: costCoverageRatio,
      status: costStatus,
    },
  };
}
