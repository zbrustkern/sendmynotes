export const REPORT_TIMEZONE = "America/Chicago" as const;

export type StandardFunnelStep =
  | "1_LANDING"
  | "2_ITEM_SELECT"
  | "3_COMPOSE"
  | "4_ADDRESS"
  | "5_CHECKOUT"
  | "6_PAID";

export const STANDARD_FUNNEL_STEPS: StandardFunnelStep[] = [
  "1_LANDING",
  "2_ITEM_SELECT",
  "3_COMPOSE",
  "4_ADDRESS",
  "5_CHECKOUT",
  "6_PAID",
];

export const FUNNEL_STEP_LABELS: Record<StandardFunnelStep, string> = {
  "1_LANDING": "1. Landed",
  "2_ITEM_SELECT": "2. Card Selected",
  "3_COMPOSE": "3. Note Composed",
  "4_ADDRESS": "4. Address Completed",
  "5_CHECKOUT": "5. Checkout Initiated",
  "6_PAID": "6. Paid Order",
};

export const FUNNEL_STEP_ORDER: Record<StandardFunnelStep, number> = {
  "1_LANDING": 1,
  "2_ITEM_SELECT": 2,
  "3_COMPOSE": 3,
  "4_ADDRESS": 4,
  "5_CHECKOUT": 5,
  "6_PAID": 6,
};

export type WaterfallWindow =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "since_oct13"
  | "all"
  | "custom";

export const WATERFALL_WINDOWS: WaterfallWindow[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "since_oct13",
  "all",
  "custom",
];

export type WaterfallChannel =
  | "all"
  | "meta"
  | "google"
  | "direct"
  | "unknown"
  | "organic"
  | "email"
  | "referral";

export const WATERFALL_CHANNELS: WaterfallChannel[] = [
  "all",
  "meta",
  "google",
  "direct",
  "unknown",
  "organic",
  "email",
  "referral",
];

export type WaterfallAudience = "customers" | "all_traffic";

export const WATERFALL_AUDIENCES: WaterfallAudience[] = ["customers", "all_traffic"];

export interface WaterfallScope {
  window: WaterfallWindow;
  startDate: string | null;
  endDate: string | null;
  channel: WaterfallChannel;
  audience: WaterfallAudience;
  startUtc: string | null;
  endUtc: string | null;
}

export interface WaterfallStepMetric {
  step: StandardFunnelStep;
  label: string;
  sessions: number;
  rawEvents: number;
  pctOfLanded: number | null;
  dropOffFromPrevPct: number | null;
  isBiggestDrop: boolean;
  /** Verified paid orders are separate from observed unique sessions. */
  paidOrders?: number;
}

export interface WaterfallOriginRow {
  originKey: string;
  source: string;
  medium: string;
  campaign: string;
  channel: WaterfallChannel;
  sessions: number;
  itemSelect: number;
  compose: number;
  address: number;
  checkout: number;
  paidOrders: number;
  conversionRatePct: number | null;
  capturedRevenueCents: number;
}

export interface WaterfallDeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
  botFilteredCount: number;
  founderFilteredCount: number;
  ownerQaSessionCount: number;
  unresolvedSessionCount: number;
}

export interface WaterfallSourceCoverage {
  status: "complete" | "partial" | "unavailable";
  recordsRead: number;
  maxRecords: number;
  error?: string;
  details?: Record<string, WaterfallSourceCoverage>;
}

export interface WaterfallJourneyDiagnostic {
  orderId: string;
  sessionId: string | null;
  campaign: string;
  amountCents: number;
  linkStatus: "joined" | "missing_session_id" | "session_not_observed" | "session_not_qualified" | "attribution_mismatch";
}

export interface WaterfallCoverage {
  ordersCount: number;
  ordersCap: number;
  telemetryCount: number;
  telemetryCap: number;
  truncated: boolean;
  status: "complete" | "partial" | "unavailable";
  ratesAvailable: boolean;
  unmatchedPaidOrders: number;
  unknownAttributionSessions: number;
  lastActivityAt: string | null;
  journeyDiagnostics: WaterfallJourneyDiagnostic[];
  sources: {
    orders: WaterfallSourceCoverage;
    telemetry: WaterfallSourceCoverage;
    reconciliation: WaterfallSourceCoverage;
    adSpend: WaterfallSourceCoverage;
  };
}

export interface WaterfallKPIs {
  capturedRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  paidCustomerOrders: number;
  excludedNonCustomerOrders: number;
  uniqueSessions: number;
  conversionRatePct: number | null;
  dispatchedOrders: number;
  heldOrFailedOrders: number;
  recordedAdSpendCents: number | null;
  cpaCents: number | null;
}

export interface AdminWaterfallReport {
  asOf: string;
  timezone: typeof REPORT_TIMEZONE;
  scope: WaterfallScope;
  kpis: WaterfallKPIs;
  waterfall: WaterfallStepMetric[];
  originMatrix: WaterfallOriginRow[];
  deviceBreakdown: WaterfallDeviceBreakdown;
  coverage: WaterfallCoverage;
}

export interface WaterfallOrderInput {
  id: string;
  sessionId?: string;
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
  status?: string;
  fulfillmentStatus?: string;
  handwryttenOrderId?: string;
  fulfillmentError?: string;
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
  attribution?: {
    sessionId?: string;
    campaignId?: string;
    source?: string;
    medium?: string;
    campaign?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    gclid?: string;
    wbraid?: string;
    gbraid?: string;
    fbclid?: string;
    emailClickId?: string;
  };
  source?: string;
}

export interface WaterfallTelemetryEventInput {
  id?: string;
  eventId?: string;
  sessionId?: string;
  classification?: { role?: string; reason?: string; source?: string };
  attributionObserved?: boolean;
  eventName?: string;
  timestamp?: number | string;
  createdAt?: number | string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  fbclid?: string;
  emailClickId?: string;
  deviceType?: string;
  userAgent?: string;
  isBot?: boolean;
  isFounder?: boolean;
  is_founder?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WaterfallReconciliationInput {
  orderId: string;
  classification: "independent_customer" | "founder_test" | "comp" | "admin_origin" | "unresolved";
  paymentIntentId?: string;
  amountInCents?: number;
  currency?: string;
  liveMode?: boolean;
  refundStatus?: "none_observed" | "partial" | "full" | "unknown";
  refundedAmountInCents?: number;
  disputeStatus?: "none_observed" | "disputed" | "unknown";
  revision?: number;
  supersedes?: number;
}

export interface WaterfallAdSpendInput {
  date: string;
  channel?: string;
  utmCampaign?: string;
  amountCents: number;
}
