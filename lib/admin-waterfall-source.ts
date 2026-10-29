import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { firestoreDb } from "@/lib/firebase-admin";
import {
  WaterfallAdSpendInput,
  WaterfallOrderInput,
  WaterfallReconciliationInput,
  WaterfallSourceCoverage,
  WaterfallTelemetryEventInput,
} from "./contracts/admin-waterfall";
import { REPORT_PRIVATE_COLLECTION_PATH } from "@/lib/admin-measurement-reconciliation";

/** A hard ceiling protects the request while allowing complete date cohorts well past 500 rows. */
export const WATERFALL_ORDER_CAP = 10_000;
export const WATERFALL_TELEMETRY_CAP = 10_000;
export const WATERFALL_RECONCILIATION_CAP = 2_000;
export const WATERFALL_SPEND_CAP = 2_000;
const PAGE_SIZE = 500;
const DEADLINE_MS = 6_500;

function timed<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("deadline")), Math.max(1, ms));
    work.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}

interface ReadPageResult {
  docs: any[];
  status: WaterfallSourceCoverage["status"];
  recordsRead: number;
  error?: string;
}

/**
 * Read a deterministic cohort in pages. If the hard ceiling or deadline is hit,
 * preserve the rows as lower-bound evidence and mark the source partial/unavailable;
 * callers must suppress rates that need a complete denominator.
 */
async function readPages(query: any, maxRecords: number): Promise<ReadPageResult> {
  const startedAt = Date.now();
  const deadlineAt = startedAt + DEADLINE_MS;
  const docs: any[] = [];
  let cursor: any = undefined;

  try {
    while (docs.length < maxRecords) {
      const remainingTime = deadlineAt - Date.now();
      if (remainingTime <= 0) {
        return { docs, status: "partial", recordsRead: docs.length, error: "read_deadline" };
      }
      const pageSize = Math.min(PAGE_SIZE, maxRecords - docs.length);
      const pageQuery = (cursor ? query.startAfter(cursor) : query).limit(pageSize);
      const snapshot = await timed<any>(pageQuery.get(), remainingTime);
      const pageDocs: any[] = snapshot.docs || [];
      if (pageDocs.length === 0) return { docs, status: "complete", recordsRead: docs.length };
      docs.push(...pageDocs);
      cursor = pageDocs[pageDocs.length - 1];
      if (pageDocs.length < pageSize) return { docs, status: "complete", recordsRead: docs.length };
    }

    // One sentinel read distinguishes exactly-at-cap from silently truncated.
    const remainingTime = deadlineAt - Date.now();
    if (remainingTime <= 0) {
      return { docs, status: "partial", recordsRead: docs.length, error: "read_deadline" };
    }
    const sentinel = await timed<any>(query.startAfter(cursor).limit(1).get(), remainingTime);
    if ((sentinel.docs || []).length > 0) {
      return { docs, status: "partial", recordsRead: docs.length + 1, error: "read_cap_reached" };
    }
    return { docs, status: "complete", recordsRead: docs.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "read_failed";
    return {
      docs,
      status: docs.length > 0 ? "partial" : "unavailable",
      recordsRead: docs.length,
      error: message === "deadline" ? "read_deadline" : "read_failed",
    };
  }
}

function sourceCoverage(result: ReadPageResult, maxRecords: number): WaterfallSourceCoverage {
  return {
    status: result.status,
    recordsRead: result.recordsRead,
    maxRecords,
    ...(result.error ? { error: result.error } : {}),
  };
}

export interface WaterfallRawSources {
  orders: WaterfallOrderInput[];
  ordersCount: number;
  telemetry: WaterfallTelemetryEventInput[];
  telemetryCount: number;
  reconciliations: WaterfallReconciliationInput[];
  adSpendRecords: WaterfallAdSpendInput[];
  sources: {
    orders: WaterfallSourceCoverage;
    telemetry: WaterfallSourceCoverage;
    reconciliation: WaterfallSourceCoverage;
    adSpend: WaterfallSourceCoverage;
  };
}

export async function readWaterfallSources(
  startUtc: string | null,
  endUtc: string | null,
  startDate: string | null,
  endDate: string | null,
  testDb?: any
): Promise<WaterfallRawSources> {
  const db = testDb ?? firestoreDb;

  const orderTask = (async () => {
    const fields = [
      "createdAt", "amountInCents", "stripePaymentId", "paymentMode", "paymentMethod",
      "isTest", "isFounderTest", "isComp", "origin", "commercialKind", "status",
      "fulfillmentStatus", "handwryttenOrderId", "fulfillmentError", "purchaseMeasurement",
      "refundStatus", "refundedAmountInCents", "disputeStatus", "campaignId", "source",
      "sessionId", "attribution",
    ];
    let query: any = db.collection("orders").select(...fields);
    if (startUtc) query = query.where("createdAt", ">=", Date.parse(startUtc));
    if (endUtc) query = query.where("createdAt", "<", Date.parse(endUtc));
    query = query.orderBy("createdAt", "asc").orderBy(FieldPath.documentId(), "asc");
    const result = await readPages(query, WATERFALL_ORDER_CAP);
    return {
      rows: result.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as WaterfallOrderInput[],
      count: result.recordsRead,
      source: sourceCoverage(result, WATERFALL_ORDER_CAP),
    };
  })();

  const telemetryTask = (async () => {
    const fields = [
      "eventName", "sessionId", "timestamp", "createdAt", "utmSource", "utmMedium", "utmCampaign",
      "source", "medium", "campaign", "gclid", "wbraid", "gbraid", "fbclid", "emailClickId",
      "deviceType", "userAgent", "isBot", "isFounder", "is_founder", "metadata",
    ];
    let legacyQuery: any = db.collection("telemetry_events").select(...fields);
    if (startUtc) legacyQuery = legacyQuery.where("timestamp", ">=", Date.parse(startUtc));
    if (endUtc) legacyQuery = legacyQuery.where("timestamp", "<", Date.parse(endUtc));
    legacyQuery = legacyQuery.orderBy("timestamp", "asc").orderBy(FieldPath.documentId(), "asc");

    const v2Fields = [
      "event_id", "event_name", "session_id", "occurred_at", "received_at", "anonymous_id",
      "classification", "consent_state", "properties",
    ];
    let v2Query: any = db.collection("telemetry_events_v2").select(...v2Fields);
    if (startUtc) v2Query = v2Query.where("occurred_at", ">=", Date.parse(startUtc));
    if (endUtc) v2Query = v2Query.where("occurred_at", "<", Date.parse(endUtc));
    v2Query = v2Query.orderBy("occurred_at", "asc").orderBy(FieldPath.documentId(), "asc");

    const [legacy, versioned] = await Promise.all([
      readPages(legacyQuery, WATERFALL_TELEMETRY_CAP),
      readPages(v2Query, WATERFALL_TELEMETRY_CAP),
    ]);
    const propertyString = (properties: Record<string, unknown>, ...keys: string[]): string | undefined => {
      for (const key of keys) if (typeof properties[key] === "string") return properties[key] as string;
      return undefined;
    };
    const legacyRows: WaterfallTelemetryEventInput[] = legacy.docs.map((doc: any) => ({ id: doc.id, eventId: doc.id, ...doc.data() }));
    const v2Rows: WaterfallTelemetryEventInput[] = versioned.docs.map((doc: any) => {
      const data = doc.data() || {};
      const properties = data.properties && typeof data.properties === "object" ? data.properties : {};
      const role = data.classification?.role;
      return {
        id: doc.id,
        eventId: data.event_id,
        eventName: data.event_name,
        sessionId: data.session_id,
        timestamp: data.occurred_at ?? data.received_at,
        source: propertyString(properties, "source"),
        medium: propertyString(properties, "medium"),
        campaign: propertyString(properties, "campaign"),
        utmSource: propertyString(properties, "utmSource", "utm_source"),
        utmMedium: propertyString(properties, "utmMedium", "utm_medium"),
        utmCampaign: propertyString(properties, "utmCampaign", "utm_campaign"),
        gclid: propertyString(properties, "gclid"),
        wbraid: propertyString(properties, "wbraid"),
        gbraid: propertyString(properties, "gbraid"),
        fbclid: propertyString(properties, "fbclid"),
        emailClickId: propertyString(properties, "emailClickId", "email_click_id"),
        deviceType: propertyString(properties, "device_category", "deviceType"),
        isFounder: role === "founder" || role === "staff",
        isBot: role === "known_bot",
        classification: data.classification,
        attributionObserved: properties.attribution_observed === true,
        metadata: properties,
      };
    });

    // Prefer the canonical V2 representation when a bridged legacy record uses
    // the same stable event ID. This keeps the compatibility read quiet.
    const merged = new Map<string, WaterfallTelemetryEventInput>();
    for (const row of legacyRows) merged.set(row.eventId || row.id || `${row.sessionId}:${row.eventName}:${row.timestamp}`, row);
    for (const row of v2Rows) merged.set(row.eventId || row.id || `${row.sessionId}:${row.eventName}:${row.timestamp}`, row);
    const rows = [...merged.values()].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    const hadAnySourceFailure = legacy.status !== "complete" || versioned.status !== "complete";
    const mergedOverCap = rows.length > WATERFALL_TELEMETRY_CAP;
    const cappedRows = rows.slice(0, WATERFALL_TELEMETRY_CAP);
    const combinedResult: ReadPageResult = {
      docs: [],
      recordsRead: rows.length + (mergedOverCap ? 1 : 0),
      status: mergedOverCap ? "partial" : hadAnySourceFailure ? (cappedRows.length ? "partial" : "unavailable") : "complete",
      ...((mergedOverCap || hadAnySourceFailure) ? { error: mergedOverCap ? "read_cap_reached" : [legacy.error, versioned.error].filter(Boolean).join(",") } : {}),
    };
    return {
      rows: cappedRows,
      count: combinedResult.recordsRead,
      source: {
        ...sourceCoverage(combinedResult, WATERFALL_TELEMETRY_CAP),
        details: {
          legacy: sourceCoverage(legacy, WATERFALL_TELEMETRY_CAP),
          versioned: sourceCoverage(versioned, WATERFALL_TELEMETRY_CAP),
        },
      },
    };
  })();

  const reconciliationTask = (async () => {
    const collectionPath = REPORT_PRIVATE_COLLECTION_PATH;
    if (!collectionPath || collectionPath.split("/").length % 2 !== 1) {
      const result: ReadPageResult = { docs: [], status: "unavailable", recordsRead: 0, error: "invalid_reconciliation_path" };
      return { rows: [] as WaterfallReconciliationInput[], source: sourceCoverage(result, WATERFALL_RECONCILIATION_CAP) };
    }
    const root = db.collection(collectionPath).doc("report_production");
    const query = root.collection("current").select(
      "orderId", "classification", "paymentIntentId", "amountInCents", "currency", "liveMode",
      "refundStatus", "refundedAmountInCents", "disputeStatus", "revision", "supersedes"
    ).orderBy(FieldPath.documentId(), "asc");
    const result = await readPages(query, WATERFALL_RECONCILIATION_CAP);
    return {
      rows: result.docs.map((doc: any) => doc.data() as WaterfallReconciliationInput).filter((entry: WaterfallReconciliationInput) => Boolean(entry.orderId)),
      source: sourceCoverage(result, WATERFALL_RECONCILIATION_CAP),
    };
  })();

  const spendTask = (async () => {
    let query: any = db.collection("dated_spend_ledger");
    if (startDate) query = query.where("date", ">=", startDate);
    if (endDate) query = query.where("date", "<=", endDate);
    query = query.orderBy("date", "asc").orderBy(FieldPath.documentId(), "asc");
    const result = await readPages(query, WATERFALL_SPEND_CAP);
    const rows: WaterfallAdSpendInput[] = result.docs.map((doc: any) => {
      const d = doc.data() || {};
      return { date: d.date, channel: d.channel, utmCampaign: d.utmCampaign, amountCents: d.amountCents || 0 };
    });

    // Do not assign an undated account total to today; it cannot be filtered by
    // campaign/window and would create a false CPA.
    return { rows, source: sourceCoverage(result, WATERFALL_SPEND_CAP) };
  })();

  const [ordersResult, telemetryResult, reconciliationsResult, spendResult] = await Promise.all([
    orderTask, telemetryTask, reconciliationTask, spendTask,
  ]);

  return {
    orders: ordersResult.rows,
    ordersCount: ordersResult.count,
    telemetry: telemetryResult.rows,
    telemetryCount: telemetryResult.count,
    reconciliations: reconciliationsResult.rows,
    adSpendRecords: spendResult.rows,
    sources: {
      orders: ordersResult.source,
      telemetry: telemetryResult.source,
      reconciliation: reconciliationsResult.source,
      adSpend: spendResult.source,
    },
  };
}
