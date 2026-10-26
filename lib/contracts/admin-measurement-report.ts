export const REPORT_TIME_ZONE = "America/Chicago" as const;

export type ReportPeriod = "today" | "last7" | "since_oct13" | "all" | "custom";
export type ReportChannel = "all" | "google_paid" | "email" | "organic" | "social_meta" | "referral" | "direct" | "unknown";
export type ReportRecordMode = "customers" | "all";
export type SourceStatus = "complete" | "partial" | "unavailable";

export interface ReportScope {
  period: ReportPeriod;
  startDate: string | null;
  endDate: string | null;
  channel: ReportChannel;
  records: ReportRecordMode;
  startUtc: string | null;
  endUtc: string | null;
}

export interface SourceCoverage {
  status: SourceStatus;
  count: number | null;
  cap: number;
  reason?: "overflow" | "read_failed" | "mock_store" | "project_mismatch" | "deadline" | "invalid_data" | "privacy_unverified";
}

export interface ReportException {
  orderId: string;
  code: string;
}

export interface AdminMeasurementReport {
  asOf: string;
  dataEnvironment: "live" | "synthetic" | "unavailable";
  timezone: typeof REPORT_TIME_ZONE;
  scope: ReportScope;
  scopeKey: string;
  status: SourceStatus;
  sources: { orders: SourceCoverage; telemetry: SourceCoverage; reconciliation: SourceCoverage };
  totals: {
    verifiedCustomerOrders: number | null;
    capturedCustomerRevenueCents: number | null;
    founderTestOrders: number | null;
    compOrders: number | null;
    adminCompBalanceOrders: number | null;
    unresolvedOrders: number | null;
    undatedOrders: number | null;
    refunds: { knownOrderCount: number | null; knownRefundedCents: number | null; unknownOrderCount: number | null };
    disputes: { knownOrderCount: number | null; unknownOrderCount: number | null };
  };
  orderDiagnostics: Array<{ orderId: string; createdAt: string | null; classification: "independent_customer" | "founder_test" | "comp" | "admin_origin" | "unresolved"; paymentEvidenceStatus: "verified_capture" | "missing" | "conflict"; paymentEvidenceSource: "purchase_snapshot" | "reconciliation" | "both" | "none" | "conflict"; amountInCents: number | null; currency: string | null; verifiedAt: string | null; observedAt: string | null; campaign: { key: string; source: string; medium: string; campaign: string; label: string; channel: Exclude<ReportChannel, "all"> }; refundStatus: "none_observed" | "partial" | "full" | "unknown"; disputeStatus: "none_observed" | "disputed" | "unknown"; clickIdPresent: boolean | null }>;
  campaigns: Array<{ key: string; source: string; medium: string; campaign: string; label: string; channel: Exclude<ReportChannel, "all">; orders: number | null; capturedCents: number | null; observedSessions: number | null; eventCounts: Record<string, number> | null }>;
  activity: { observedSessions: number | null; eventCounts: Record<string, number> | null; sampled: boolean };
  exceptions: ReportException[];
  attribution: { campaignRecorded: number | null; clickIdPresent: number | null };
  reconciliation: { status: "pending" | "applied" | "unavailable"; asOf?: string; verifiedCustomerOrders: number | null; capturedCents: number | null };
}

export interface ReportOrderInput {
  id: string;
  createdAt?: number | string | { seconds?: number; _seconds?: number };
  amountInCents?: number;
  stripePaymentId?: string;
  paymentMode?: string;
  paymentMethod?: string;
  isTest?: boolean;
  isFounderTest?: boolean;
  isComp?: boolean;
  origin?: string;
  commercialKind?: string;
  purchaseMeasurement?: {
    version?: number;
    transactionId?: string;
    amountInCents?: number;
    currency?: string;
    verifiedAt?: number;
    eligible?: boolean;
    reason?: string;
    refundStatus?: string;
  };
  refundStatus?: string;
  refundedAmountInCents?: number;
  disputeStatus?: string;
  campaignId?: string;
  attribution?: { campaignId?: string; source?: string; medium?: string; campaign?: string; gclid?: string; wbraid?: string; gbraid?: string; fbclid?: string; emailClickId?: string };
  source?: string;
}

export interface ReportReconciliationEntry {
  orderId: string;
  classification: "independent_customer" | "founder_test" | "comp" | "admin_origin" | "unresolved";
  paymentIntentId?: string;
  amountInCents?: number;
  currency?: string;
  liveMode?: boolean;
  refundStatus?: "none_observed" | "partial" | "full" | "unknown";
  refundedAmountInCents?: number;
  disputeStatus?: "none_observed" | "disputed" | "unknown";
  sourceReference?: string;
  evidenceSourceReference?: string;
  actor?: string;
  decidedAt?: string;
  manifestReviewedAt?: string;
  observedAt?: string;
  revision: number;
  supersedes?: number;
}
