import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { firestoreDb } from "@/lib/firebase-admin";
import {
  WaterfallAdSpendInput,
  WaterfallOrderInput,
  WaterfallReconciliationInput,
  WaterfallTelemetryEventInput,
} from "./contracts/admin-waterfall";
import { REPORT_PRIVATE_COLLECTION_PATH } from "@/lib/admin-measurement-reconciliation";

export const WATERFALL_ORDER_CAP = 2000;
export const WATERFALL_TELEMETRY_CAP = 2000;
export const WATERFALL_RECONCILIATION_CAP = 100;
export const WATERFALL_SPEND_CAP = 500;
const DEADLINE_MS = 6500;

function timed<T>(work: Promise<T>, ms = DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("deadline")), ms);
    work.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export interface WaterfallRawSources {
  orders: WaterfallOrderInput[];
  ordersCount: number;
  telemetry: WaterfallTelemetryEventInput[];
  telemetryCount: number;
  reconciliations: WaterfallReconciliationInput[];
  adSpendRecords: WaterfallAdSpendInput[];
}

export async function readWaterfallSources(
  startUtc: string | null,
  endUtc: string | null,
  startDate: string | null,
  endDate: string | null,
  testDb?: any
): Promise<WaterfallRawSources> {
  const db = testDb ?? firestoreDb;

  // 1. Orders
  const ordersTask = (async () => {
    try {
      const fields = [
        "createdAt",
        "amountInCents",
        "stripePaymentId",
        "paymentMode",
        "paymentMethod",
        "isTest",
        "isFounderTest",
        "isComp",
        "origin",
        "commercialKind",
        "status",
        "fulfillmentStatus",
        "handwryttenOrderId",
        "fulfillmentError",
        "purchaseMeasurement",
        "refundStatus",
        "refundedAmountInCents",
        "disputeStatus",
        "campaignId",
        "source",
        "attribution",
      ];
      const snap: any = await timed(
        db
          .collection("orders")
          .select(...fields)
          .orderBy(FieldPath.documentId())
          .limit(WATERFALL_ORDER_CAP + 1)
          .get()
      );
      const rows: WaterfallOrderInput[] = snap.docs
        .slice(0, WATERFALL_ORDER_CAP)
        .map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        }));
      return { rows, count: snap.size };
    } catch {
      return { rows: [], count: 0 };
    }
  })();

  // 2. Telemetry
  const telemetryTask = (async () => {
    try {
      const fields = [
        "eventName",
        "sessionId",
        "timestamp",
        "createdAt",
        "utmSource",
        "utmMedium",
        "utmCampaign",
        "source",
        "medium",
        "campaign",
        "gclid",
        "wbraid",
        "gbraid",
        "fbclid",
        "emailClickId",
        "deviceType",
        "userAgent",
        "isBot",
        "isFounder",
        "is_founder",
        "metadata",
      ];
      let query: any = db.collection("telemetry_events").select(...fields);
      if (startUtc) query = query.where("timestamp", ">=", Date.parse(startUtc));
      if (endUtc) query = query.where("timestamp", "<", Date.parse(endUtc));

      const snap: any = await timed(
        query.orderBy("timestamp", "asc").limit(WATERFALL_TELEMETRY_CAP + 1).get()
      );
      const rows: WaterfallTelemetryEventInput[] = snap.docs
        .slice(0, WATERFALL_TELEMETRY_CAP)
        .map((doc: any) => ({
          id: doc.id,
          eventId: doc.id,
          ...doc.data(),
        }));
      return { rows, count: snap.size };
    } catch {
      return { rows: [], count: 0 };
    }
  })();

  // 3. Reconciliations
  const reconciliationTask = (async () => {
    const collectionPath = REPORT_PRIVATE_COLLECTION_PATH;
    if (!collectionPath || collectionPath.split("/").length % 2 !== 1) {
      return [];
    }
    try {
      const root = db.collection(collectionPath).doc("report_production");
      const snap: any = await timed(
        root
          .collection("current")
          .select(
            "orderId",
            "classification",
            "paymentIntentId",
            "amountInCents",
            "currency",
            "liveMode",
            "refundStatus",
            "refundedAmountInCents",
            "disputeStatus",
            "revision",
            "supersedes"
          )
          .orderBy(FieldPath.documentId())
          .limit(WATERFALL_RECONCILIATION_CAP + 1)
          .get()
      );
      return snap.docs
        .slice(0, WATERFALL_RECONCILIATION_CAP)
        .map((doc: any) => doc.data() as WaterfallReconciliationInput)
        .filter((entry: WaterfallReconciliationInput) => Boolean(entry.orderId));
    } catch {
      return [];
    }
  })();

  // 4. Ad Spend
  const adSpendTask = (async () => {
    try {
      let query: any = db.collection("dated_spend_ledger");
      if (startDate) query = query.where("date", ">=", startDate);
      if (endDate) query = query.where("date", "<=", endDate);

      const snap: any = await timed(
        query.limit(WATERFALL_SPEND_CAP).get()
      );
      const rows: WaterfallAdSpendInput[] = snap.docs.map((doc: any) => {
        const d = doc.data() || {};
        return {
          date: d.date,
          channel: d.channel,
          utmCampaign: d.utmCampaign,
          amountCents: d.amountCents || 0,
        };
      });

      // If dated_spend_ledger is empty, check system_configs/admin_ad_spend fallback
      if (rows.length === 0) {
        try {
          const configDoc = await db.collection("system_configs").doc("admin_ad_spend").get();
          if (configDoc.exists) {
            const data = configDoc.data();
            if (data?.amountCents && typeof data.amountCents === "number" && data.amountCents > 0) {
              const todayStr = new Date().toISOString().slice(0, 10);
              rows.push({
                date: todayStr,
                channel: "all",
                amountCents: data.amountCents,
              });
            }
          }
        } catch {
          // ignore fallback error
        }
      }

      return rows;
    } catch {
      return [];
    }
  })();

  const [ordersResult, telemetryResult, reconciliations, adSpendRecords] = await Promise.all([
    ordersTask,
    telemetryTask,
    reconciliationTask,
    adSpendTask,
  ]);

  return {
    orders: ordersResult.rows,
    ordersCount: ordersResult.count,
    telemetry: telemetryResult.rows,
    telemetryCount: telemetryResult.count,
    reconciliations,
    adSpendRecords,
  };
}
