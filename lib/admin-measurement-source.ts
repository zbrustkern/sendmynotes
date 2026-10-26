import "server-only";
import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import { firestoreDb, isFirestoreMock } from "@/lib/firebase-admin";
import { ReportOrderInput, ReportReconciliationEntry, SourceCoverage } from "@/lib/contracts/admin-measurement-report";
import { REPORT_PRIVATE_COLLECTION_PATH } from "@/lib/admin-measurement-reconciliation";

export const ORDER_CAP = 2000;
export const TELEMETRY_CAP = 500;
export const RECONCILIATION_CAP = 100;
const DEADLINE_MS = 6500;

export interface MeasurementSources {
  orders: ReportOrderInput[];
  telemetry: Array<{ eventId: string; sessionKey?: string; eventName?: string; source?: string; medium?: string; campaign?: string; hasGoogleClick: boolean; hasMetaClick: boolean }>;
  reconciliations: ReportReconciliationEntry[];
  coverage: { orders: SourceCoverage; telemetry: SourceCoverage; reconciliation: SourceCoverage };
  dataEnvironment: "live" | "synthetic" | "unavailable";
}

function failed(cap: number, reason: SourceCoverage["reason"]): SourceCoverage {
  return { status: "unavailable", count: null, cap, reason };
}

export function boundedSourceCoverage(count: number, limit: number): SourceCoverage {
  return { status: count > limit ? "partial" : "complete", count: Math.min(count, limit), cap: limit, ...(count > limit ? { reason: "overflow" as const } : {}) };
}

function timed<T>(work: Promise<T>, ms = DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("deadline")), ms);
    work.then((value) => { clearTimeout(timeout); resolve(value); }, (error) => { clearTimeout(timeout); reject(error); });
  });
}

function expectedProject(): string {
  const options = admin.apps[0]?.options as any;
  const value = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || options?.projectId || options?.credential?.projectId || "";
  return value;
}
function environmentName(): "production" | "staging" | "synthetic" {
  return expectedProject() === "sendmynotes-staging" ? "staging" : "production";
}

function actualProject(): string | undefined {
  const app = admin.apps[0];
  const options = app?.options as any;
  return options?.projectId || options?.credential?.projectId || undefined;
}

export function reportRuntimeIssue(runtime: { isMock: boolean; expectedProject: string; actualProject?: string; nodeEnv?: string }): SourceCoverage["reason"] | null {
  if (runtime.isMock) return "mock_store";
  if (!["sendmynotes-2a417", "sendmynotes-staging"].includes(runtime.expectedProject)) return "project_mismatch";
  if (runtime.actualProject && runtime.actualProject !== runtime.expectedProject) return "project_mismatch";
  if (runtime.nodeEnv === "production" && !runtime.actualProject) return "project_mismatch";
  return null;
}

function assertSafeRuntime(runtime?: { isMock: boolean; expectedProject: string; actualProject?: string; nodeEnv?: string }): "live" {
  const issue = reportRuntimeIssue(runtime ?? { isMock: isFirestoreMock, expectedProject: expectedProject(), actualProject: actualProject(), nodeEnv: process.env.NODE_ENV });
  if (issue) throw new Error(issue);
  return "live";
}

/** One bounded census pass per source. Only projected fields cross into the report reducer. */
export async function readMeasurementSources(startUtc: string | null, endUtc: string | null, fixture?: Omit<MeasurementSources, "dataEnvironment">, testOptions?: { db: any; isMock: boolean; expectedProject: string; actualProject?: string; nodeEnv?: string; deadlineMs?: number }): Promise<MeasurementSources> {
  if (fixture) {
    if (process.env.ADMIN_MEASUREMENT_SYNTHETIC !== "true" || process.env.NODE_ENV === "production") throw new Error("Synthetic source injection is disabled.");
    return { ...fixture, dataEnvironment: "synthetic" };
  }
  let dataEnvironment: "live" | "synthetic";
  try {
    assertSafeRuntime(testOptions);
    const project = testOptions?.expectedProject ?? expectedProject();
    dataEnvironment = project === "sendmynotes-staging" ? "synthetic" : "live";
  }
  catch (error) {
    const reason = String(error).includes("mock_store") ? "mock_store" : "project_mismatch";
    return { orders: [], telemetry: [], reconciliations: [], dataEnvironment: "unavailable", coverage: {
      orders: failed(ORDER_CAP, reason), telemetry: failed(TELEMETRY_CAP, reason), reconciliation: failed(RECONCILIATION_CAP, reason),
    } };
  }

  const ordersTask = (async () => {
    const db = testOptions?.db ?? firestoreDb;
    const fields = ["createdAt", "amountInCents", "stripePaymentId", "paymentMode", "paymentMethod", "isTest", "isFounderTest", "isComp", "origin", "commercialKind", "purchaseMeasurement", "refundStatus", "refundedAmountInCents", "disputeStatus", "campaignId", "source", "attribution.utmSource", "attribution.utmMedium", "attribution.utmCampaign", "attribution.gclid", "attribution.wbraid", "attribution.gbraid", "attribution.fbclid"];
    const snap: any = await timed(db.collection("orders").select(...fields).orderBy(FieldPath.documentId()).limit(ORDER_CAP + 1).get(), testOptions?.deadlineMs ?? DEADLINE_MS);
    return { rows: snap.docs.slice(0, ORDER_CAP).map((doc: any) => ({ id: doc.id, ...doc.data(), attribution: normalizeAttribution(doc.data()?.attribution) })), coverage: boundedSourceCoverage(snap.size, ORDER_CAP) };
  })();
  const telemetryTask = (async () => {
    const db = testOptions?.db ?? firestoreDb;
    let query: any = db.collection("telemetry_events").select("eventName", "sessionId", "timestamp", "utmSource", "utmMedium", "utmCampaign", "gclid", "wbraid", "gbraid", "fbclid");
    if (startUtc) query = query.where("timestamp", ">=", Date.parse(startUtc));
    if (endUtc) query = query.where("timestamp", "<", Date.parse(endUtc));
    const snap: any = await timed(query.orderBy("timestamp", "asc").limit(TELEMETRY_CAP + 1).get(), testOptions?.deadlineMs ?? DEADLINE_MS);
    return { rows: snap.docs.slice(0, TELEMETRY_CAP).map((doc: any) => { const d = doc.data() ?? {}; return { eventId: doc.id, sessionKey: safeSessionKey(d.sessionId), eventName: typeof d.eventName === "string" ? d.eventName.slice(0, 80) : undefined, source: safeText(d.utmSource), medium: safeText(d.utmMedium), campaign: safeText(d.utmCampaign), hasGoogleClick: !!(d.gclid || d.wbraid || d.gbraid), hasMetaClick: !!d.fbclid }; }), coverage: boundedSourceCoverage(snap.size, TELEMETRY_CAP) };
  })();

  // The private collection must be selected only after its deployed read/write rules are verified.
  // Coordinator sets this fixed server environment value after that check; no request can choose it.
  const reconciliationCollection = REPORT_PRIVATE_COLLECTION_PATH;
  let reconciliationTask: Promise<{ rows: ReportReconciliationEntry[]; coverage: SourceCoverage }>;
  if (!reconciliationCollection || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(reconciliationCollection) || reconciliationCollection.split("/").length % 2 !== 1) {
    reconciliationTask = Promise.resolve({ rows: [], coverage: failed(RECONCILIATION_CAP, "privacy_unverified") });
  } else {
    reconciliationTask = (async () => {
      const db = testOptions?.db ?? firestoreDb;
      const env = testOptions ? testOptions.expectedProject === "sendmynotes-staging" ? "staging" : "production" : environmentName();
      const root = db.collection(reconciliationCollection).doc(`report_${env}`);
      const snap: any = await timed(root.collection("current").where("environment", "==", env).select("environment", "orderId", "classification", "paymentIntentId", "amountInCents", "currency", "liveMode", "refundStatus", "refundedAmountInCents", "disputeStatus", "sourceReference", "evidenceSourceReference", "actor", "decidedAt", "manifestReviewedAt", "observedAt", "revision", "supersedes").orderBy(FieldPath.documentId()).limit(RECONCILIATION_CAP + 1).get(), testOptions?.deadlineMs ?? DEADLINE_MS);
      return { rows: snap.docs.slice(0, RECONCILIATION_CAP).map((doc: any) => doc.data() as ReportReconciliationEntry).filter((entry: ReportReconciliationEntry) => !!entry.orderId), coverage: boundedSourceCoverage(snap.size, RECONCILIATION_CAP) };
    })();
  }
  const safeResult = async <T>(task: Promise<T>, cap: number, fallback: (result: T) => unknown) => {
    try { return await task; } catch (error) { return fallback(failed(cap, String(error).includes("deadline") ? "deadline" : "read_failed") as any); }
  };
  const [orders, events, sidecar] = await Promise.all([
    safeResult(ordersTask, ORDER_CAP, (c) => ({ rows: [] as ReportOrderInput[], coverage: c })),
    safeResult(telemetryTask, TELEMETRY_CAP, (c) => ({ rows: [] as MeasurementSources["telemetry"], coverage: c })),
    safeResult(reconciliationTask, RECONCILIATION_CAP, (c) => ({ rows: [] as ReportReconciliationEntry[], coverage: c })),
  ]);
  return { orders: (orders as any).rows, telemetry: (events as any).rows, reconciliations: (sidecar as any).rows, dataEnvironment,
    coverage: { orders: (orders as any).coverage, telemetry: (events as any).coverage, reconciliation: (sidecar as any).coverage } };
}

function safeSessionKey(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 200 ? value : undefined;
}

function normalizeAttribution(value: any): ReportOrderInput["attribution"] {
  if (!value || typeof value !== "object") return undefined;
  return {
    source: safeText(value.utmSource), medium: safeText(value.utmMedium), campaign: safeText(value.utmCampaign),
    gclid: safeText(value.gclid), wbraid: safeText(value.wbraid), gbraid: safeText(value.gbraid), fbclid: safeText(value.fbclid),
  };
}
function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().slice(0, 200);
  if (/@/.test(clean) || /\+?\d[\d\s().-]{6,}\d/.test(clean)) return "[redacted]";
  return clean;
}
