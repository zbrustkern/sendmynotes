import { firestoreDb, getSystemConfig, setSystemConfig, getOrdersCollection, sanitizeFirestoreData } from "./firebase-admin";
import { TELEMETRY_COLLECTION } from "./telemetry";
import {
  TelemetryEvent,
  Order,
  AdminMetrics,
  ScenarioPerformanceMetric,
  FinancialMargins,
  CampaignAttributionMetric,
  VisitorSessionRecord,
  FunnelStepLeak,
  AcquisitionSourceMetric,
  VisitorTelemetryMetrics,
} from "./types";
import { getAllScenarios } from "./seo-scenarios";

export const HANDWRYTTEN_COGS_PER_CARD_CENTS = 488; // $4.88 (Cardstock + Real Pen Inking + USPS First Class postage)

export function calculateStripeFeeCents(amountInCents: number, paymentMethod?: string): number {
  if (paymentMethod === "PROMO_CODE" || paymentMethod === "STUDIO_COMP" || amountInCents === 0) {
    return 0;
  }
  return Math.round(amountInCents * 0.029) + 30; // 2.9% + $0.30 (56¢ on $9.00)
}

export interface TelemetrySummary {
  totalSessions: number;
  activeSessionIds: string[]; // Keep recent 500 session IDs to calculate unique sessions
  coverSelected: number;
  noteCompleted: number;
  addressCompleted: number;
  checkoutInitiated: number;
  paid: number;
  // Per-order durable purchase ledger IDs (Finding 1)
  paidOrderIds?: string[];
  // Unique session tracking per stage (sliding window per stage to prevent unbounded doc growth)
  stageSessionIds?: {
    coverSelected: string[];
    noteCompleted: string[];
    addressCompleted: string[];
    checkoutInitiated: string[];
    paid: string[];
    [stage: string]: string[];
  };
  // Raw event counters (separate from unique session funnel)
  rawEventCounts?: Record<string, number>;
  scenarios: Record<
    string,
    {
      views: number;
      customizations: number;
      checkouts: number;
      paid: number;
    }
  >;
  recentSessions?: VisitorSessionRecord[];
  deviceCounts?: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  geoCounts?: Record<string, number>;
  sourceCounts?: Record<
    string,
    {
      sessions: number;
      paid: number;
      dropOffs: Record<string, number>;
    }
  >;
  updatedAt: number;
}

const SUMMARY_CONFIG_KEY = "telemetry_summary";

let ingestQueue: Promise<void> = Promise.resolve();

/**
 * Persistently stores a telemetry event and updates the pre-aggregated summary document.
 * Serializes concurrent writes to ensure atomic summary updates without race conditions.
 */
export function ingestTelemetryEvent(event: TelemetryEvent): Promise<void> {
  const run = () => executeIngest(event);
  ingestQueue = ingestQueue.then(run, run);
  return ingestQueue;
}

async function executeIngest(event: TelemetryEvent): Promise<void> {
  // 1. Write the raw event document for audit trail
  const sanitized = sanitizeFirestoreData(event);
  await firestoreDb.collection(TELEMETRY_COLLECTION).doc(sanitized.id).set(sanitized);

  // 2. Fetch existing summary
  const summary = (await getSystemConfig<TelemetrySummary>(SUMMARY_CONFIG_KEY)) || {
    totalSessions: 0,
    activeSessionIds: [],
    coverSelected: 0,
    noteCompleted: 0,
    addressCompleted: 0,
    checkoutInitiated: 0,
    paid: 0,
    paidOrderIds: [],
    scenarios: {},
    recentSessions: [],
    deviceCounts: { mobile: 0, desktop: 0, tablet: 0 },
    geoCounts: {},
    sourceCounts: {},
    updatedAt: Date.now(),
  };

  summary.recentSessions = summary.recentSessions || [];
  summary.deviceCounts = summary.deviceCounts || { mobile: 0, desktop: 0, tablet: 0 };
  summary.geoCounts = summary.geoCounts || {};
  summary.sourceCounts = summary.sourceCounts || {};
  summary.paidOrderIds = summary.paidOrderIds || [];

  // Ensure stageSessionIds and rawEventCounts exist
  summary.stageSessionIds = summary.stageSessionIds || {
    coverSelected: [],
    noteCompleted: [],
    addressCompleted: [],
    checkoutInitiated: [],
    paid: [],
  };
  summary.stageSessionIds.coverSelected = summary.stageSessionIds.coverSelected || [];
  summary.stageSessionIds.noteCompleted = summary.stageSessionIds.noteCompleted || [];
  summary.stageSessionIds.addressCompleted = summary.stageSessionIds.addressCompleted || [];
  summary.stageSessionIds.checkoutInitiated = summary.stageSessionIds.checkoutInitiated || [];
  summary.stageSessionIds.paid = summary.stageSessionIds.paid || [];
  summary.rawEventCounts = summary.rawEventCounts || {};

  // Track raw event count
  summary.rawEventCounts[event.eventName] = (summary.rawEventCounts[event.eventName] || 0) + 1;

  // Track unique session ID
  let isNewSession = false;
  if (event.sessionId) {
    if (!summary.activeSessionIds.includes(event.sessionId)) {
      isNewSession = true;
      summary.activeSessionIds.push(event.sessionId);
      if (summary.activeSessionIds.length > 500) {
        summary.activeSessionIds = summary.activeSessionIds.slice(-500);
      }
      summary.totalSessions = Math.max(summary.totalSessions + 1, summary.activeSessionIds.length);
    }
  }

  // Update unique-session funnel counters (at most once per sessionId; step_navigated never completes a step)
  if (
    event.eventName === "cover_preset_selected" ||
    event.eventName === "ai_generate_succeeded" ||
    event.eventName === "card_completed" ||
    event.eventName === "step_2_cover_ready"
  ) {
    if (event.sessionId && !summary.stageSessionIds.coverSelected.includes(event.sessionId)) {
      summary.stageSessionIds.coverSelected.push(event.sessionId);
      if (summary.stageSessionIds.coverSelected.length > 1000) {
        summary.stageSessionIds.coverSelected = summary.stageSessionIds.coverSelected.slice(-1000);
      }
      summary.coverSelected++;
    }
  } else if (
    event.eventName === "note_completed" ||
    event.eventName === "step_3_note_typed" ||
    event.eventName === "starter_prompt_used"
  ) {
    if (event.sessionId && !summary.stageSessionIds.noteCompleted.includes(event.sessionId)) {
      summary.stageSessionIds.noteCompleted.push(event.sessionId);
      if (summary.stageSessionIds.noteCompleted.length > 1000) {
        summary.stageSessionIds.noteCompleted = summary.stageSessionIds.noteCompleted.slice(-1000);
      }
      summary.noteCompleted++;
    }
  } else if (
    event.eventName === "address_completed" ||
    event.eventName === "step_4b_address_completed"
  ) {
    if (event.sessionId && !summary.stageSessionIds.addressCompleted.includes(event.sessionId)) {
      summary.stageSessionIds.addressCompleted.push(event.sessionId);
      if (summary.stageSessionIds.addressCompleted.length > 1000) {
        summary.stageSessionIds.addressCompleted = summary.stageSessionIds.addressCompleted.slice(-1000);
      }
      summary.addressCompleted++;
    }
  } else if (
    event.eventName === "checkout_initiated" ||
    event.eventName === "payment_viewed" ||
    event.eventName === "step_5_checkout_initiated"
  ) {
    if (event.sessionId && !summary.stageSessionIds.checkoutInitiated.includes(event.sessionId)) {
      summary.stageSessionIds.checkoutInitiated.push(event.sessionId);
      if (summary.stageSessionIds.checkoutInitiated.length > 1000) {
        summary.stageSessionIds.checkoutInitiated = summary.stageSessionIds.checkoutInitiated.slice(-1000);
      }
      summary.checkoutInitiated++;
    }
  } else if (
    event.eventName === "purchase_verified" ||
    event.eventName === "payment_succeeded" ||
    event.eventName === "step_6_paid_order"
  ) {
    if (!summary.paidOrderIds) {
      summary.paidOrderIds = [];
    }
    const orderKey = event.orderId || event.sessionId;
    const isTest = Boolean(event.metadata?.isTest);
    const sessionAlreadyPaid = event.sessionId ? summary.stageSessionIds.paid.includes(event.sessionId) : false;
    const orderAlreadyPaid = orderKey ? summary.paidOrderIds.includes(orderKey) : false;

    // 1. Session conversion tracking (unique visitor sessions that converted)
    if (event.sessionId && !sessionAlreadyPaid) {
      summary.stageSessionIds.paid.push(event.sessionId);
      if (summary.stageSessionIds.paid.length > 1000) {
        summary.stageSessionIds.paid = summary.stageSessionIds.paid.slice(-1000);
      }
    }

    // 2. Durable per-order purchase ledger tracking (counts every paid order, including repeat purchases in same session)
    if (!orderAlreadyPaid) {
      if (orderKey) {
        summary.paidOrderIds.push(orderKey);
        if (summary.paidOrderIds.length > 2000) {
          summary.paidOrderIds = summary.paidOrderIds.slice(-2000);
        }
      }
      if (!isTest) {
        summary.paid++;
      }
    }
  }

  // Determine current step number and label
  let stepNum = event.step || 1;
  let stepName = "Cover Selection";
  if (
    event.eventName === "purchase_verified" ||
    event.eventName === "payment_succeeded" ||
    event.eventName === "step_6_paid_order"
  ) {
    stepNum = 5;
    stepName = "Paid & Penned";
  } else if (
    event.eventName === "checkout_initiated" ||
    event.eventName === "payment_viewed" ||
    event.eventName === "step_5_checkout_initiated" ||
    event.step === 4
  ) {
    stepNum = 4;
    stepName = "Stripe Checkout";
  } else if (
    event.eventName === "address_completed" ||
    event.eventName === "step_4b_address_completed" ||
    event.eventName === "step_4a_address_viewed" ||
    event.step === 3
  ) {
    stepNum = 3;
    stepName = "Recipient Address";
  } else if (
    event.eventName === "note_completed" ||
    event.eventName === "inside_note_edited" ||
    event.eventName === "inspiration_applied" ||
    event.eventName === "note_shuffled" ||
    event.eventName === "step_3_note_typed" ||
    event.eventName === "starter_prompt_used" ||
    event.step === 2
  ) {
    stepNum = 2;
    stepName = "Inside Note";
  } else if (
    event.eventName === "card_completed" ||
    event.eventName === "cover_preset_selected" ||
    event.eventName === "ai_generate_succeeded" ||
    event.eventName === "step_2_cover_ready" ||
    event.eventName === "step_1_landed" ||
    event.step === 1
  ) {
    stepNum = 1;
    stepName = "Cover Selection";
  }

  // Determine source & medium
  let source = event.utmSource || "direct";
  let medium = event.utmMedium || (event.gclid ? "cpc" : "none");
  if (event.gclid) {
    source = "google";
    medium = "cpc";
  } else if (event.referrer && !event.utmSource) {
    try {
      const host = new URL(event.referrer).hostname.toLowerCase();
      if (host.includes("google.")) {
        source = "google";
        medium = "organic";
      } else if (host.includes("bing.")) {
        source = "bing";
        medium = "organic";
      } else if (host.includes("facebook") || host.includes("instagram") || host.includes("meta")) {
        source = "meta";
        medium = "social";
      } else if (host.includes("t.co") || host.includes("twitter") || host.includes("x.com")) {
        source = "x";
        medium = "social";
      } else if (host.includes("reddit")) {
        source = "reddit";
        medium = "social";
      } else {
        source = host;
        medium = "referral";
      }
    } catch {
      // ignore invalid URL
    }
  }

  const inAppBrowser = Boolean(event.metadata?.in_app_browser);
  const usedAddressDeferral = Boolean(event.metadata?.used_address_deferral || event.metadata?.usedAddressDeferral);
  const lastValidationError = (event.metadata?.last_validation_error as string) || (event.metadata?.lastValidationError as string) || undefined;
  const noteLength = typeof event.metadata?.charCount === "number" ? event.metadata.charCount : undefined;

  // Update or insert visitor session record
  let existingSession = summary.recentSessions.find((s) => s.sessionId === event.sessionId);
  if (existingSession) {
    existingSession.lastSeenAt = Date.now();
    if (stepNum > existingSession.highestStep) {
      existingSession.highestStep = stepNum;
      existingSession.highestStepName = stepName;
    }
    if (
      event.eventName === "purchase_verified" ||
      event.eventName === "payment_succeeded" ||
      event.eventName === "step_6_paid_order"
    ) {
      existingSession.completed = true;
      existingSession.dropOffStep = undefined;
      if (event.orderId) existingSession.orderId = event.orderId;
    } else if (!existingSession.completed) {
      existingSession.dropOffStep = existingSession.highestStepName;
    }
    if (event.deviceType) existingSession.deviceType = event.deviceType;
    if (event.ipCity) existingSession.city = event.ipCity;
    if (event.ipRegion) existingSession.region = event.ipRegion;
    if (event.ipCountry) existingSession.country = event.ipCountry;
    if (event.googleClientId) existingSession.googleClientId = event.googleClientId;
    if (event.utmCampaign) existingSession.campaign = event.utmCampaign;
    if (event.isBot !== undefined) existingSession.isBot = event.isBot;
    if (event.userAgent) existingSession.userAgent = event.userAgent;
    if (inAppBrowser) existingSession.inAppBrowser = true;
    if (usedAddressDeferral) existingSession.usedAddressDeferral = true;
    if (lastValidationError) existingSession.lastValidationError = lastValidationError;
    if (noteLength !== undefined) existingSession.noteLength = Math.max(existingSession.noteLength || 0, noteLength);
    const isFounderEvt = Boolean(event.isFounder || event.is_founder || event.metadata?.is_founder || event.metadata?.isFounder);
    if (isFounderEvt) existingSession.isFounder = true;
    if (event.clientId && !existingSession.clientId) existingSession.clientId = event.clientId;
    const isNoteEditEvt = Boolean(
      event.metadata?.noteEdited === true ||
      event.eventName === "step_3_note_typed" ||
      event.eventName === "starter_prompt_used" ||
      event.eventName === "inside_note_edited"
    );
    if (isNoteEditEvt) existingSession.noteEdited = true;
    else if (event.eventName === "default_template_loaded" && existingSession.noteEdited !== true) {
      existingSession.noteEdited = false;
    }
  } else {
    const isCompleted =
      event.eventName === "purchase_verified" ||
      event.eventName === "payment_succeeded" ||
      event.eventName === "step_6_paid_order";
    const isFounderEvt = Boolean(event.isFounder || event.is_founder || event.metadata?.is_founder || event.metadata?.isFounder);
    const isNoteEditEvt = Boolean(
      event.metadata?.noteEdited === true ||
      event.eventName === "step_3_note_typed" ||
      event.eventName === "starter_prompt_used" ||
      event.eventName === "inside_note_edited"
    );
    const newSession: VisitorSessionRecord = {
      sessionId: event.sessionId,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      highestStep: stepNum,
      highestStepName: stepName,
      dropOffStep: isCompleted ? undefined : stepName,
      completed: isCompleted,
      orderId: event.orderId,
      source,
      medium,
      campaign: event.utmCampaign,
      gclid: event.gclid,
      deviceType: event.deviceType || "desktop",
      screenResolution: event.screenResolution,
      city: event.ipCity,
      region: event.ipRegion,
      country: event.ipCountry,
      landingPath: event.landingPath || event.path,
      googleClientId: event.googleClientId,
      userAgent: event.userAgent,
      isBot: event.isBot,
      inAppBrowser,
      usedAddressDeferral,
      lastValidationError,
      noteLength,
      isFounder: isFounderEvt,
      clientId: event.clientId,
      noteEdited: isNoteEditEvt ? true : (event.eventName === "default_template_loaded" ? false : undefined),
    };
    summary.recentSessions.unshift(newSession);
    if (summary.recentSessions.length > 50) {
      summary.recentSessions = summary.recentSessions.slice(0, 50);
    }
  }

  // Update device breakdown
  const dType = event.deviceType || "desktop";
  summary.deviceCounts[dType] = (summary.deviceCounts[dType] || 0) + 1;

  // Update geo breakdown
  if (event.ipCity) {
    const locKey = `${event.ipCity}${event.ipRegion ? ", " + event.ipRegion : ""}`;
    summary.geoCounts[locKey] = (summary.geoCounts[locKey] || 0) + 1;
  }

  // Update traffic source breakdown
  const srcKey = `${source} / ${medium}`;
  if (!summary.sourceCounts[srcKey]) {
    summary.sourceCounts[srcKey] = {
      sessions: 0,
      paid: 0,
      dropOffs: {},
    };
  }
  if (isNewSession) {
    summary.sourceCounts[srcKey].sessions++;
  }
  if (event.eventName === "purchase_verified" || event.eventName === "payment_succeeded") {
    summary.sourceCounts[srcKey].paid++;
  } else {
    summary.sourceCounts[srcKey].dropOffs[stepName] =
      (summary.sourceCounts[srcKey].dropOffs[stepName] || 0) + 1;
  }

  // Update scenario-specific telemetry
  const scenarioSlug =
    (event.metadata?.scenarioSlug as string) ||
    (event.path?.startsWith("/send/") ? event.path.split("/")[3] : undefined);

  if (scenarioSlug) {
    if (!summary.scenarios[scenarioSlug]) {
      summary.scenarios[scenarioSlug] = {
        views: 0,
        customizations: 0,
        checkouts: 0,
        paid: 0,
      };
    }

    const s = summary.scenarios[scenarioSlug];
    if (
      event.eventName === "session_start" ||
      event.eventName === "scenario_landing_viewed" ||
      event.eventName === "landing_viewed"
    ) {
      s.views++;
    } else if (
      event.eventName === "note_completed" ||
      event.eventName === "inside_note_edited" ||
      event.eventName === "scenario_customized" ||
      event.eventName === "card_completed" ||
      event.eventName === "cover_preset_selected"
    ) {
      s.customizations++;
    } else if (
      event.eventName === "checkout_initiated" ||
      event.eventName === "payment_viewed"
    ) {
      s.checkouts++;
    } else if (
      event.eventName === "purchase_verified" ||
      event.eventName === "payment_succeeded"
    ) {
      s.paid++;
    }
  }

  summary.updatedAt = Date.now();

  // Save updated aggregate summary
  await setSystemConfig(SUMMARY_CONFIG_KEY, summary as unknown as Record<string, unknown>);
}

/**
 * Server-only function for recording authority events (purchase_verified, fulfillment_*).
 * Webhooks and backend order processors call this directly, completely bypassing /api/telemetry.
 */
export async function recordServerTelemetry(params: {
  eventName: "purchase_verified" | "fulfillment_submitted" | "fulfillment_failed";
  sessionId: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  experienceVersion?: string;
  draftRevision?: number;
}): Promise<string> {
  const eventId = `evt_srv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();
  const eventDoc: TelemetryEvent = {
    id: eventId,
    eventName: params.eventName,
    sessionId: params.sessionId,
    orderId: params.orderId,
    metadata: params.metadata || {},
    path: "/api/server",
    timestamp: now,
    createdAt: now,
    experienceVersion: params.experienceVersion,
    draftRevision: params.draftRevision,
  };

  await ingestTelemetryEvent(eventDoc);
  return eventId;
}

/**
 * Retrieves the funnel summary, backfilling from raw events if the summary doc is missing.
 */
export async function getTelemetrySummary(): Promise<TelemetrySummary> {
  const existing = await getSystemConfig<TelemetrySummary>(SUMMARY_CONFIG_KEY);
  if (existing && existing.totalSessions > 0) {
    return existing;
  }

  // Backfill from raw events if summary does not exist yet
  const summary: TelemetrySummary = {
    totalSessions: 0,
    activeSessionIds: [],
    coverSelected: 0,
    noteCompleted: 0,
    addressCompleted: 0,
    checkoutInitiated: 0,
    paid: 0,
    scenarios: {},
    updatedAt: Date.now(),
  };

  try {
    const snap = await firestoreDb.collection(TELEMETRY_COLLECTION).get();
    const sessions = new Set<string>();
    const coverSessions = new Set<string>();
    const noteSessions = new Set<string>();
    const addressSessions = new Set<string>();
    const checkoutSessions = new Set<string>();
    const paidSessions = new Set<string>();

    snap.forEach((doc) => {
      const evt = doc.data() as TelemetryEvent;
      if (evt.sessionId) sessions.add(evt.sessionId);

      switch (evt.eventName) {
        case "card_completed":
        case "cover_preset_selected":
        case "ai_generate_succeeded":
          if (evt.sessionId) coverSessions.add(evt.sessionId);
          break;
        case "note_completed":
          if (evt.sessionId) noteSessions.add(evt.sessionId);
          break;
        case "address_completed":
          if (evt.sessionId) addressSessions.add(evt.sessionId);
          break;
        case "checkout_initiated":
        case "payment_viewed":
          if (evt.sessionId) checkoutSessions.add(evt.sessionId);
          break;
        case "purchase_verified":
        case "payment_succeeded":
          if (evt.sessionId) paidSessions.add(evt.sessionId);
          break;
      }

      const slug =
        (evt.metadata?.scenarioSlug as string) ||
        (evt.path?.startsWith("/send/") ? evt.path.split("/")[3] : undefined);

      if (slug) {
        if (!summary.scenarios[slug]) {
          summary.scenarios[slug] = { views: 0, customizations: 0, checkouts: 0, paid: 0 };
        }
        const s = summary.scenarios[slug];
        if (
          evt.eventName === "session_start" ||
          evt.eventName === "scenario_landing_viewed" ||
          evt.eventName === "landing_viewed"
        ) {
          s.views++;
        } else if (
          evt.eventName === "note_completed" ||
          evt.eventName === "inside_note_edited" ||
          evt.eventName === "scenario_customized" ||
          evt.eventName === "card_completed" ||
          evt.eventName === "cover_preset_selected"
        ) {
          s.customizations++;
        } else if (
          evt.eventName === "checkout_initiated" ||
          evt.eventName === "payment_viewed"
        ) {
          s.checkouts++;
        } else if (
          evt.eventName === "purchase_verified" ||
          evt.eventName === "payment_succeeded"
        ) {
          s.paid++;
        }
      }
    });

    summary.activeSessionIds = Array.from(sessions).slice(-500);
    summary.totalSessions = sessions.size;
    summary.coverSelected = coverSessions.size;
    summary.noteCompleted = noteSessions.size;
    summary.addressCompleted = addressSessions.size;
    summary.checkoutInitiated = checkoutSessions.size;
    summary.paid = paidSessions.size;
    summary.stageSessionIds = {
      coverSelected: Array.from(coverSessions).slice(-1000),
      noteCompleted: Array.from(noteSessions).slice(-1000),
      addressCompleted: Array.from(addressSessions).slice(-1000),
      checkoutInitiated: Array.from(checkoutSessions).slice(-1000),
      paid: Array.from(paidSessions).slice(-1000),
    };
    summary.updatedAt = Date.now();

    // Persist backfilled aggregate
    await setSystemConfig(SUMMARY_CONFIG_KEY, summary as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn("[Metrics Rollup] Backfill notice:", err);
  }

  return summary;
}

/**
 * Determines whether an order belongs to a non-customer cohort (founder test, studio comp, test mode, or mock).
 * These orders must be excluded from customer conversion and business metrics.
 */
export function isExcludedOrderCohort(o: Partial<Order>): boolean {
  return (
    o.isTest === true ||
    o.isComp === true ||
    o.isFounderTest === true ||
    o.paymentMode === "stripe_test" ||
    o.paymentMode === "local_mock" ||
    o.paymentMethod === "STUDIO_COMP" ||
    Boolean(o.customerEmail && o.customerEmail.toLowerCase().includes("founder"))
  );
}

export interface AdminDashboardFilterOptions {
  dateRange?: string; // "oct13" | "today" | "last7" | "all" | "custom"
  excludeFounder?: boolean; // default: true
  channel?: string; // "all" | "paid" | "google_cpc" | "meta_paid" | "organic_direct"
  customFrom?: number;
  customTo?: number;
}

export const UX_OVERHAUL_BASELINE_MS = new Date("2026-10-13T00:00:00Z").getTime();
export const FOUNDER_REGISTRY_CONFIG_KEY = "founder_device_registry";

export function matchesChannelFilter(
  channel: string,
  source?: string,
  medium?: string,
  campaign?: string,
  gclid?: string,
  fbclid?: string
): boolean {
  if (channel === "all") return true;

  const s = (source || "").toLowerCase();
  const m = (medium || "").toLowerCase();
  const hasGclid = Boolean(gclid);
  const hasFbclid = Boolean(fbclid);
  const isGoogle = s.includes("google") || hasGclid;
  const isMeta = s.includes("meta") || s.includes("facebook") || s.includes("instagram") || hasFbclid;
  const isPaid = m === "cpc" || m === "paid" || hasGclid || hasFbclid || (isMeta && (m.includes("paid") || m.includes("social") || hasFbclid));

  if (channel === "paid") {
    return isPaid || (isGoogle && m === "cpc") || isMeta;
  }
  if (channel === "google_cpc") {
    return (isGoogle && (m === "cpc" || hasGclid)) || (s === "google" && m === "cpc");
  }
  if (channel === "meta_paid") {
    return isMeta;
  }
  if (channel === "organic_direct") {
    return !isPaid && !hasGclid && !hasFbclid && !isMeta;
  }
  return true;
}

/**
 * Computes scalable admin dashboard metrics by combining:
 * 1. Granular 7-stage telemetry events with strict cohort funnel progression
 * 2. High-performance order queries with date range, founder exclusion, and channel attribution filtering
 * 3. High-intent abandoner session diagnostics
 */
export async function getAdminDashboardMetrics(options?: AdminDashboardFilterOptions): Promise<AdminMetrics> {
  const dateRange = options?.dateRange || "oct13";
  const excludeFounder = options?.excludeFounder !== false; // Default: ON
  const channel = options?.channel || "all";

  let fromTime = UX_OVERHAUL_BASELINE_MS;
  let toTime = Date.now();
  if (dateRange === "oct13") {
    fromTime = UX_OVERHAUL_BASELINE_MS;
  } else if (dateRange === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    fromTime = d.getTime();
  } else if (dateRange === "last7") {
    fromTime = Date.now() - 7 * 86400000;
  } else if (dateRange === "all") {
    fromTime = 0;
  } else if (dateRange === "custom") {
    fromTime = options?.customFrom || 0;
    toTime = options?.customTo || Date.now();
  }

  // Load founder device registry from system config (client_id and session_id scoped only)
  const founderRegistry = (await getSystemConfig<{
    clientIds?: string[];
    sessionIds?: string[];
  }>(FOUNDER_REGISTRY_CONFIG_KEY)) || { clientIds: [], sessionIds: [] };
  const founderSessionIds = new Set(founderRegistry.sessionIds || []);
  const founderClientIds = new Set(founderRegistry.clientIds || []);

  // 1. Fetch all orders and apply date, founder exclusion, and channel filters
  const allOrdersSnap = await getOrdersCollection().get();
  const allOrdersList: Order[] = [];
  allOrdersSnap.forEach((doc) => {
    allOrdersList.push(doc.data() as Order);
  });

  const filteredOrders = allOrdersList.filter((o) => {
    const orderCreatedAt = o.createdAt || 0;
    if (dateRange !== "all") {
      if (orderCreatedAt < fromTime || orderCreatedAt > toTime) {
        return false;
      }
    }

    if (excludeFounder) {
      if (isExcludedOrderCohort(o)) return false;
      if (o.sessionId && founderSessionIds.has(o.sessionId)) return false;
      if (o.customerEmail && (o.customerEmail.toLowerCase().includes("founder") || o.customerEmail.toLowerCase().includes("zeke"))) {
        return false;
      }
    }

    const utmSrc = o.attribution?.utmSource;
    const utmMed = o.attribution?.utmMedium;
    const utmCamp = o.attribution?.utmCampaign;
    const gclid = o.attribution?.gclid;
    const fbclid = o.attribution?.fbclid;
    if (!matchesChannelFilter(channel, utmSrc, utmMed, utmCamp, gclid, fbclid)) {
      return false;
    }

    return true;
  });

  let totalRevenueCents = 0;
  let pendingCount = 0;
  let processingCount = 0;
  let failedCount = 0;

  const fontCounts: Record<string, number> = {};
  const occasionCounts: Record<string, number> = {};
  const FONT_NAME_MAP: Record<string, string> = {
    "1": "Casual David",
    "hwDavid": "Casual David",
    "2": "Charming Chase",
    "hwChase": "Charming Chase",
    "3": "Carefree Kate",
    "hwKate": "Carefree Kate",
    "4": "Executive Adam",
    "hwAdam": "Executive Adam",
    "5": "Dapper Will",
    "hwWill": "Dapper Will",
  };

  let stripeFeesCents = 0;
  let fulfillmentCogsCents = 0;
  const campaignAgg: Record<string, CampaignAttributionMetric> = {};

  filteredOrders.forEach((o) => {
    const isPaid =
      o.status === "PROCESSING_HANDWRYTTEN" ||
      o.status === "PAYMENT_RECEIVED" ||
      o.status === "MAILED";

    if (isPaid) {
      const orderRev = o.amountInCents !== undefined ? o.amountInCents : 900;
      totalRevenueCents += orderRev;
      processingCount++;

      const orderStripeFee = calculateStripeFeeCents(orderRev, o.paymentMethod);
      const orderCogs = HANDWRYTTEN_COGS_PER_CARD_CENTS;
      const orderNetMargin = orderRev - orderStripeFee - orderCogs;

      stripeFeesCents += orderStripeFee;
      fulfillmentCogsCents += orderCogs;

      const utmCampaign = o.attribution?.utmCampaign?.trim() || "";
      const utmSource = o.attribution?.utmSource?.trim() || "";
      const utmMedium = o.attribution?.utmMedium?.trim() || "";
      const hasGclid = Boolean(o.attribution?.gclid);

      let key = "Direct / Organic";
      if (utmCampaign) {
        key = utmCampaign;
      } else if (utmSource || utmMedium) {
        key = `${utmSource || "direct"} / ${utmMedium || "none"}`;
      } else if (hasGclid) {
        key = "Google Ads (Auto-tagged)";
      }

      if (!campaignAgg[key]) {
        campaignAgg[key] = {
          campaignKey: key,
          utmSource: utmSource || (hasGclid ? "google" : "direct"),
          utmMedium: utmMedium || (hasGclid ? "cpc" : "none"),
          utmCampaign: utmCampaign || (hasGclid ? "Google Ads" : "(not set)"),
          hasGclid,
          orderCount: 0,
          grossRevenueCents: 0,
          netContributionMarginCents: 0,
          lastOrderAt: o.createdAt,
        };
      }

      campaignAgg[key].orderCount++;
      campaignAgg[key].grossRevenueCents += orderRev;
      campaignAgg[key].netContributionMarginCents += orderNetMargin;
      if (o.createdAt && (!campaignAgg[key].lastOrderAt || o.createdAt > campaignAgg[key].lastOrderAt!)) {
        campaignAgg[key].lastOrderAt = o.createdAt;
      }
    } else if (o.status === "PENDING_PAYMENT") {
      pendingCount++;
    } else if (o.status === "FAILED") {
      failedCount++;
    }

    const fontId = o.fontStyleId || "hwDavid";
    const fontName = FONT_NAME_MAP[fontId] || fontId;
    fontCounts[fontName] = (fontCounts[fontName] || 0) + 1;

    const noteText = `${o.printedMessage || ""} ${o.handwrittenNote || ""}`.toLowerCase();
    let occasion = "Personal Note";
    if (noteText.includes("birthday") || noteText.includes("bday")) occasion = "Birthday";
    else if (noteText.includes("thank") || noteText.includes("grateful") || noteText.includes("gratitude")) occasion = "Thank You";
    else if (noteText.includes("anniversary")) occasion = "Anniversary";
    else if (noteText.includes("congrat") || noteText.includes("milestone") || noteText.includes("proud")) occasion = "Congratulations";
    else if (noteText.includes("sympathy") || noteText.includes("condolence") || noteText.includes("thinking of you")) occasion = "Sympathy";
    else if (noteText.includes("love") || noteText.includes("miss you")) occasion = "Love / Romance";
    occasionCounts[occasion] = (occasionCounts[occasion] || 0) + 1;
  });

  const totalCountForBreakdowns = Math.max(filteredOrders.length, 1);
  const fontPopularity = Object.entries(fontCounts)
    .map(([fontName, count]) => ({
      fontId: fontName,
      fontName,
      count,
      percentage: Math.round((count / totalCountForBreakdowns) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const occasionPopularity = Object.entries(occasionCounts)
    .map(([occasion, count]) => ({
      occasion,
      count,
      percentage: Math.round((count / totalCountForBreakdowns) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const paidCardsCount = processingCount;
  const netContributionMarginCents = totalRevenueCents - stripeFeesCents - fulfillmentCogsCents;
  const netContributionMarginPercent =
    totalRevenueCents > 0
      ? Math.round((netContributionMarginCents / totalRevenueCents) * 1000) / 10
      : 39.6;

  const averageOrderRevenueCents = paidCardsCount > 0 ? Math.round(totalRevenueCents / paidCardsCount) : 900;
  const averageStripeFeeCents = paidCardsCount > 0 ? Math.round(stripeFeesCents / paidCardsCount) : 56;
  const averageFulfillmentCogsCents = paidCardsCount > 0 ? Math.round(fulfillmentCogsCents / paidCardsCount) : HANDWRYTTEN_COGS_PER_CARD_CENTS;
  const averageNetContributionCents = paidCardsCount > 0 ? Math.round(netContributionMarginCents / paidCardsCount) : (900 - 56 - HANDWRYTTEN_COGS_PER_CARD_CENTS);
  const targetBreakevenCpaDollars = Number((averageNetContributionCents / 100).toFixed(2));

  const margins: FinancialMargins = {
    grossRevenueCents: totalRevenueCents,
    stripeFeesCents,
    fulfillmentCogsCents,
    netContributionMarginCents,
    netContributionMarginPercent,
    paidCardsCount,
    averageOrderRevenueCents,
    averageStripeFeeCents,
    averageFulfillmentCogsCents,
    averageNetContributionCents,
    targetBreakevenCpaDollars,
  };

  const campaignAttributions = Object.values(campaignAgg).sort(
    (a, b) => b.netContributionMarginCents - a.netContributionMarginCents
  );

  let adSpendCents = 0;
  try {
    const adSpendDoc = await getSystemConfig<{ amountCents: number }>("admin_ad_spend");
    if (adSpendDoc?.amountCents) {
      adSpendCents = adSpendDoc.amountCents;
    }
  } catch (err) {
    console.warn("[Metrics Rollup] Error reading ad spend config:", err);
  }

  let valuationAssumptions: any = undefined;
  try {
    const valDoc = await getSystemConfig("admin_valuation_assumptions");
    if (valDoc) {
      valuationAssumptions = valDoc;
    }
  } catch (err) {
    console.warn("[Metrics Rollup] Error reading valuation assumptions:", err);
  }

  // 2. Fetch telemetry events and construct sessions
  const telemetry = await getTelemetrySummary();
  const rawEvents: TelemetryEvent[] = [];
  try {
    const snap = await firestoreDb.collection(TELEMETRY_COLLECTION).get();
    snap.forEach((doc) => {
      rawEvents.push(doc.data() as TelemetryEvent);
    });
  } catch (err) {
    console.warn("[Metrics Rollup] Error loading raw telemetry events:", err);
  }

  const sessionMap = new Map<string, VisitorSessionRecord>();
  const sessionStages = new Map<
    string,
    {
      hasStage1: boolean;
      hasStage2: boolean;
      hasStage3: boolean;
      hasStage4a: boolean;
      hasStage4b: boolean;
      hasStage5: boolean;
      hasStage6: boolean;
    }
  >();

  // Aggregate raw events into sessions
  for (const evt of rawEvents) {
    if (!evt.sessionId) continue;
    const sId = evt.sessionId;
    const stages = sessionStages.get(sId) || {
      hasStage1: false,
      hasStage2: false,
      hasStage3: false,
      hasStage4a: false,
      hasStage4b: false,
      hasStage5: false,
      hasStage6: false,
    };

    if (
      evt.eventName === "step_1_landed" ||
      evt.eventName === "session_start" ||
      evt.eventName === "landing_viewed" ||
      evt.eventName === "scenario_landing_viewed" ||
      evt.eventName === "builder_started"
    ) {
      stages.hasStage1 = true;
    }
    if (
      evt.eventName === "step_2_cover_ready" ||
      evt.eventName === "cover_preset_selected" ||
      evt.eventName === "ai_generate_succeeded" ||
      evt.eventName === "card_completed"
    ) {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
    }
    if (
      evt.eventName === "step_3_note_typed" ||
      evt.eventName === "starter_prompt_used" ||
      evt.eventName === "note_completed" ||
      evt.eventName === "inside_note_edited"
    ) {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
      stages.hasStage3 = true;
    }
    if (evt.eventName === "step_4a_address_viewed") {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
      stages.hasStage3 = true;
      stages.hasStage4a = true;
    }
    if (
      evt.eventName === "step_4b_address_completed" ||
      evt.eventName === "address_completed"
    ) {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
      stages.hasStage3 = true;
      stages.hasStage4a = true;
      stages.hasStage4b = true;
    }
    if (
      evt.eventName === "step_5_checkout_initiated" ||
      evt.eventName === "checkout_initiated" ||
      evt.eventName === "payment_viewed"
    ) {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
      stages.hasStage3 = true;
      stages.hasStage4a = true;
      stages.hasStage4b = true;
      stages.hasStage5 = true;
    }
    if (
      evt.eventName === "step_6_paid_order" ||
      evt.eventName === "purchase_verified" ||
      evt.eventName === "payment_succeeded"
    ) {
      stages.hasStage1 = true;
      stages.hasStage2 = true;
      stages.hasStage3 = true;
      stages.hasStage4a = true;
      stages.hasStage4b = true;
      stages.hasStage5 = true;
      stages.hasStage6 = true;
    }
    sessionStages.set(sId, stages);

    // Compute step number & names
    let stepNum = evt.step || 1;
    let stepName = "Cover Selection";
    if (stages.hasStage6) {
      stepNum = 5;
      stepName = "Paid & Penned";
    } else if (stages.hasStage5 || evt.step === 4) {
      stepNum = 4;
      stepName = "Stripe Checkout";
    } else if (stages.hasStage4a || stages.hasStage4b || evt.step === 3) {
      stepNum = 3;
      stepName = "Recipient Address";
    } else if (stages.hasStage3 || evt.step === 2) {
      stepNum = 2;
      stepName = "Inside Note";
    }

    const inAppBrowser = Boolean(evt.metadata?.in_app_browser);
    const usedAddressDeferral = Boolean(evt.metadata?.used_address_deferral || evt.metadata?.usedAddressDeferral);
    const lastValidationError = (evt.metadata?.last_validation_error as string) || (evt.metadata?.lastValidationError as string) || undefined;
    const noteLength = typeof evt.metadata?.charCount === "number" ? evt.metadata.charCount : undefined;
    const isFounderEvt = Boolean(evt.is_founder || (evt as any).isFounder || evt.metadata?.is_founder || evt.metadata?.isFounder);
    const isNoteEditEvt = Boolean(
      evt.metadata?.noteEdited === true ||
      evt.eventName === "step_3_note_typed" ||
      evt.eventName === "starter_prompt_used" ||
      evt.eventName === "inside_note_edited"
    );

    let existing = sessionMap.get(sId);
    if (existing) {
      existing.firstSeenAt = Math.min(existing.firstSeenAt, evt.timestamp || existing.firstSeenAt);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, evt.timestamp || existing.lastSeenAt);
      if (stepNum > existing.highestStep) {
        existing.highestStep = stepNum;
        existing.highestStepName = stepName;
        if (!existing.completed) existing.dropOffStep = stepName;
      }
      if (stages.hasStage6) {
        existing.completed = true;
        existing.dropOffStep = undefined;
      }
      if (inAppBrowser) existing.inAppBrowser = true;
      if (usedAddressDeferral) existing.usedAddressDeferral = true;
      if (lastValidationError) existing.lastValidationError = lastValidationError;
      if (noteLength !== undefined) existing.noteLength = Math.max(existing.noteLength || 0, noteLength);
      if (isFounderEvt) existing.isFounder = true;
      if (evt.clientId && !existing.clientId) existing.clientId = evt.clientId;
      if (isNoteEditEvt) existing.noteEdited = true;
      else if (evt.eventName === "default_template_loaded" && existing.noteEdited !== true) {
        existing.noteEdited = false;
      }
    } else {
      const isPaid = stages.hasStage6;
      sessionMap.set(sId, {
        sessionId: sId,
        firstSeenAt: evt.timestamp || Date.now(),
        lastSeenAt: evt.timestamp || Date.now(),
        highestStep: stepNum,
        highestStepName: stepName,
        dropOffStep: isPaid ? undefined : stepName,
        completed: isPaid,
        orderId: evt.orderId,
        source: evt.utmSource || (evt.gclid ? "google" : "direct"),
        medium: evt.utmMedium || (evt.gclid ? "cpc" : "none"),
        campaign: evt.utmCampaign,
        gclid: evt.gclid,
        fbclid: evt.fbclid,
        deviceType: evt.deviceType || "desktop",
        screenResolution: evt.screenResolution,
        city: evt.ipCity,
        region: evt.ipRegion,
        country: evt.ipCountry,
        landingPath: evt.landingPath || evt.path,
        googleClientId: evt.googleClientId,
        userAgent: evt.userAgent,
        isBot: evt.isBot,
        inAppBrowser,
        usedAddressDeferral,
        lastValidationError,
        noteLength,
        isFounder: isFounderEvt,
        clientId: evt.clientId,
        noteEdited: isNoteEditEvt ? true : (evt.eventName === "default_template_loaded" ? false : undefined),
      });
    }
  }

  // Merge any recent sessions from pre-aggregated summary
  for (const s of telemetry.recentSessions || []) {
    if (!sessionMap.has(s.sessionId)) {
      sessionMap.set(s.sessionId, { ...s });
      sessionStages.set(s.sessionId, {
        hasStage1: true,
        hasStage2: s.highestStep >= 1,
        hasStage3: s.highestStep >= 2,
        hasStage4a: s.highestStep >= 3,
        hasStage4b: s.highestStep >= 3 && s.completed,
        hasStage5: s.highestStep >= 4,
        hasStage6: s.completed,
      });
    }
  }

  // Cross-reference paid orders to ensure conversion completion
  for (const o of filteredOrders) {
    const isPaid =
      o.status === "PROCESSING_HANDWRYTTEN" ||
      o.status === "PAYMENT_RECEIVED" ||
      o.status === "MAILED";
    if (isPaid && o.sessionId) {
      const s = sessionStages.get(o.sessionId);
      if (s) {
        s.hasStage1 = true;
        s.hasStage2 = true;
        s.hasStage3 = true;
        s.hasStage4a = true;
        s.hasStage4b = true;
        s.hasStage5 = true;
        s.hasStage6 = true;
      }
      const rec = sessionMap.get(o.sessionId);
      if (rec) {
        rec.completed = true;
        rec.dropOffStep = undefined;
        rec.orderId = o.id;
      }
    }
  }

  // Filter sessions by date, founder exclusion, and channel
  const allSessions = Array.from(sessionMap.values());
  const filteredSessions = allSessions.filter((s) => {
    if (dateRange !== "all") {
      if (s.lastSeenAt < fromTime || s.firstSeenAt > toTime) {
        return false;
      }
    }

    if (excludeFounder) {
      // Real mobile and paid ad traffic (gclid, fbclid, utm_source google/meta) must NEVER be filtered by IP proxy contamination
      const isMobile =
        s.deviceType === "mobile" ||
        (s.screenResolution && parseInt(s.screenResolution.split("x")[0] || "0", 10) < 768);
      const isPaidOrAd = Boolean(
        s.gclid ||
        s.fbclid ||
        s.campaign ||
        (s.source && ["google", "meta", "facebook", "instagram"].includes(s.source.toLowerCase())) ||
        (s.medium && ["cpc", "paid", "social"].includes(s.medium.toLowerCase()))
      );
      const isProtectedRealTraffic = isMobile || isPaidOrAd;

      // Founder 3440x1440 desktop test sessions are strictly excluded
      const isFounderDesktopResolution = s.screenResolution === "3440x1440";
      if (isFounderDesktopResolution && !isMobile) {
        return false;
      }

      // For non-protected traffic, exclude registered founder sessions and client IDs
      if (!isProtectedRealTraffic) {
        if (s.isFounder) return false;
        if (founderSessionIds.has(s.sessionId)) return false;
        if (s.sessionId.startsWith("test_founder")) return false;
        if (s.clientId && founderClientIds.has(s.clientId)) return false;
      }
    }

    if (!matchesChannelFilter(channel, s.source, s.medium, s.campaign, s.gclid, s.fbclid)) {
      return false;
    }

    return true;
  });

  const botSessions = filteredSessions.filter((s) => s.isBot);
  const humanSessions = filteredSessions.filter((s) => !s.isBot);

  // 3. STRICT COHORT FUNNEL MATH:
  // Monotonically ordered cohort subsets: S1 >= S2 >= S3 >= S4a >= S4b >= S5 >= S6
  const U1 = new Set<string>();
  const U2 = new Set<string>();
  const U3 = new Set<string>();
  const U4a = new Set<string>();
  const U4b = new Set<string>();
  const U5 = new Set<string>();
  const U6 = new Set<string>();

  for (const s of humanSessions) {
    const stages = sessionStages.get(s.sessionId) || {
      hasStage1: true,
      hasStage2: s.highestStep >= 1,
      hasStage3: s.highestStep >= 2,
      hasStage4a: s.highestStep >= 3,
      hasStage4b: s.highestStep >= 3 && s.completed,
      hasStage5: s.highestStep >= 4,
      hasStage6: s.completed,
    };

    U1.add(s.sessionId);
    if (stages.hasStage2 || s.highestStep >= 1) U2.add(s.sessionId);
    if (stages.hasStage3 || s.highestStep >= 2) U3.add(s.sessionId);
    if (stages.hasStage4a || s.highestStep >= 3) U4a.add(s.sessionId);
    if (stages.hasStage4b || (s.highestStep >= 3 && s.completed)) U4b.add(s.sessionId);
    if (stages.hasStage5 || s.highestStep >= 4) U5.add(s.sessionId);
    if (stages.hasStage6 || s.completed) U6.add(s.sessionId);
  }

  // Cohort superset propagation guarantees strict non-increasing monotonic funnel
  const S6 = new Set(U6);
  const S5 = new Set([...U5, ...S6]);
  const S4b = new Set([...U4b, ...S5]);
  const S4a = new Set([...U4a, ...S4b]);
  const S3 = new Set([...U3, ...S4a]);
  const S2 = new Set([...U2, ...S3]);
  const S1 = new Set([...U1, ...S2]);

  let s1Count = S1.size;
  let s2Count = S2.size;
  let s3Count = S3.size;
  let s4aCount = S4a.size;
  let s4bCount = S4b.size;
  let s5Count = S5.size;
  let s6Count = S6.size;

  // Fallback to pre-aggregated summary if no individual raw events are available
  if (s1Count === 0 && telemetry.totalSessions > 0 && dateRange === "all") {
    s6Count = telemetry.paid || 0;
    s5Count = Math.max(telemetry.checkoutInitiated || 0, s6Count);
    s4bCount = Math.max(telemetry.addressCompleted || 0, s5Count);
    s4aCount = s4bCount;
    s3Count = Math.max(telemetry.noteCompleted || 0, s4aCount);
    s2Count = Math.max(telemetry.coverSelected || 0, s3Count);
    s1Count = Math.max(telemetry.totalSessions || 0, s2Count);
  }

  const funnelLeaks: FunnelStepLeak[] = [
    {
      stepNumber: 1,
      stepName: "1. Landed & Browsing",
      visitors: s1Count,
      conversionFromPrior: 100,
      leakToNext: s1Count > 0 ? Math.max(0, Math.round(((s1Count - s2Count) / s1Count) * 100)) : 0,
    },
    {
      stepNumber: 2,
      stepName: "2. Cover Ready",
      visitors: s2Count,
      conversionFromPrior: s1Count > 0 ? Math.min(100, Math.round((s2Count / s1Count) * 100)) : 0,
      leakToNext: s2Count > 0 ? Math.max(0, Math.round(((s2Count - s3Count) / s2Count) * 100)) : 0,
    },
    {
      stepNumber: 3,
      stepName: "3. Note Typed",
      visitors: s3Count,
      conversionFromPrior: s2Count > 0 ? Math.min(100, Math.round((s3Count / s2Count) * 100)) : 0,
      leakToNext: s3Count > 0 ? Math.max(0, Math.round(((s3Count - s4aCount) / s3Count) * 100)) : 0,
    },
    {
      stepNumber: 4,
      stepName: "4A. Address Viewed",
      visitors: s4aCount,
      conversionFromPrior: s3Count > 0 ? Math.min(100, Math.round((s4aCount / s3Count) * 100)) : 0,
      leakToNext: s4aCount > 0 ? Math.max(0, Math.round(((s4aCount - s4bCount) / s4aCount) * 100)) : 0,
    },
    {
      stepNumber: 5,
      stepName: "4B. Address Completed / Deferred",
      visitors: s4bCount,
      conversionFromPrior: s4aCount > 0 ? Math.min(100, Math.round((s4bCount / s4aCount) * 100)) : 0,
      leakToNext: s4bCount > 0 ? Math.max(0, Math.round(((s4bCount - s5Count) / s4bCount) * 100)) : 0,
    },
    {
      stepNumber: 6,
      stepName: "5. Checkout Initiated",
      visitors: s5Count,
      conversionFromPrior: s4bCount > 0 ? Math.min(100, Math.round((s5Count / s4bCount) * 100)) : 0,
      leakToNext: s5Count > 0 ? Math.max(0, Math.round(((s5Count - s6Count) / s5Count) * 100)) : 0,
    },
    {
      stepNumber: 7,
      stepName: "6. Paid Order ($9.00)",
      visitors: s6Count,
      conversionFromPrior: s5Count > 0 ? Math.min(100, Math.round((s6Count / s5Count) * 100)) : 0,
      leakToNext: 0,
    },
  ];

  // 4. HIGH-INTENT ABANDONERS TABLE (Top 25 sessions that reached Step 3 Note or Step 4A Address and abandoned)
  const highIntentAbandoners: VisitorSessionRecord[] = humanSessions
    .filter((s) => (S3.has(s.sessionId) || S4a.has(s.sessionId)) && !S6.has(s.sessionId))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, 25);

  // 5. Device, Geo, and Traffic Source Aggregates from active human cohort
  let mobCount = 0;
  let deskCount = 0;
  let tabCount = 0;
  const geoMap: Record<string, number> = {};
  const sourceMap: Record<string, { sessions: number; paid: number; dropOffs: Record<string, number> }> = {};

  for (const s of humanSessions) {
    if (s.deviceType === "mobile") mobCount++;
    else if (s.deviceType === "tablet") tabCount++;
    else deskCount++;

    if (s.city) {
      const locKey = `${s.city}${s.region ? ", " + s.region : ""}`;
      geoMap[locKey] = (geoMap[locKey] || 0) + 1;
    }

    const srcKey = `${s.source} / ${s.medium}`;
    if (!sourceMap[srcKey]) {
      sourceMap[srcKey] = { sessions: 0, paid: 0, dropOffs: {} };
    }
    sourceMap[srcKey].sessions++;
    if (s.completed || S6.has(s.sessionId)) {
      sourceMap[srcKey].paid++;
    } else {
      const drop = s.dropOffStep || s.highestStepName || "Inside Note";
      sourceMap[srcKey].dropOffs[drop] = (sourceMap[srcKey].dropOffs[drop] || 0) + 1;
    }
  }

  // Fallback to pre-aggregated device counts if humanSessions list is empty
  if (humanSessions.length === 0 && telemetry.deviceCounts) {
    mobCount = telemetry.deviceCounts.mobile || 0;
    deskCount = telemetry.deviceCounts.desktop || 0;
    tabCount = telemetry.deviceCounts.tablet || 0;
  }

  const totalDev = mobCount + deskCount + tabCount;
  const deviceBreakdown = {
    mobile: mobCount,
    desktop: deskCount,
    tablet: tabCount,
    mobilePercent: totalDev > 0 ? Math.round((mobCount / totalDev) * 100) : 0,
    desktopPercent: totalDev > 0 ? Math.round((deskCount / totalDev) * 100) : 0,
    tabletPercent: totalDev > 0 ? Math.round((tabCount / totalDev) * 100) : 0,
  };

  const topLocations = Object.entries(geoMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([loc, count]) => {
      const parts = loc.split(", ");
      return {
        city: parts[0] || loc,
        region: parts[1] || undefined,
        count,
      };
    });

  const acquisitionSources: AcquisitionSourceMetric[] = Object.entries(sourceMap)
    .map(([key, data]) => {
      const [src, med] = key.split(" / ");
      let topDrop = "None";
      let maxDrop = -1;
      for (const [step, count] of Object.entries(data.dropOffs || {})) {
        if (count > maxDrop) {
          maxDrop = count;
          topDrop = step;
        }
      }
      return {
        sourceKey: key,
        source: src || "direct",
        medium: med || "none",
        sessions: data.sessions,
        completedOrders: data.paid,
        conversionRate: data.sessions > 0 ? Math.round((data.paid / data.sessions) * 1000) / 10 : 0,
        topDropOffStep: topDrop,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  const recentSessionsList = [...filteredSessions].sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, 50);
  const botVisitors = botSessions.length;
  const humanVisitors = humanSessions.length;

  const visitorTelemetry: VisitorTelemetryMetrics = {
    totalVisitors: filteredSessions.length,
    humanVisitors,
    botVisitors,
    funnelLeaks,
    acquisitionSources,
    deviceBreakdown,
    topLocations: topLocations.length > 0 ? topLocations : (telemetry.geoCounts ? Object.entries(telemetry.geoCounts).map(([loc, count]) => ({ city: loc.split(", ")[0] || loc, count })).slice(0, 10) : []),
    recentSessions: recentSessionsList,
  };

  const recentOrdersList = [...filteredOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);

  return {
    totalRevenueCents,
    totalOrders: filteredOrders.length,
    ordersByStatus: {
      pending: pendingCount,
      processing: processingCount,
      failed: failedCount,
    },
    funnel: {
      totalSessions: s1Count,
      coverSelected: s2Count,
      noteCompleted: s3Count,
      addressCompleted: s4bCount,
      checkoutInitiated: s5Count,
      paid: s6Count,
    },
    visitorTelemetry,
    fontPopularity,
    occasionPopularity,
    margins,
    campaignAttributions,
    adSpendCents,
    valuationAssumptions,
    recentOrders: recentOrdersList,
    filterDateRange: dateRange,
    filterChannel: channel,
    excludeFounder,
    highIntentAbandoners,
  };
}

/**
 * Scalable scenario performance calculation using the telemetry rollup
 */
export async function getScenarioPerformanceMetrics(): Promise<{
  scenarios: ScenarioPerformanceMetric[];
  totalViews: number;
  totalOrders: number;
}> {
  const allConfigured = getAllScenarios();
  const summary = await getTelemetrySummary();

  let totalViews = 0;
  let totalOrders = 0;

  const scenarios: ScenarioPerformanceMetric[] = allConfigured.map((scenario) => {
    const bucket = summary.scenarios[scenario.slug] || {
      views: 0,
      customizations: 0,
      checkouts: 0,
      paid: 0,
    };

    const views = bucket.views;
    const customizations = bucket.customizations;
    const checkouts = bucket.checkouts;
    const paidOrders = bucket.paid;

    totalViews += views;
    totalOrders += paidOrders;

    const conversionRate = views > 0 ? (paidOrders / views) * 100 : 0;

    let bottleneckStep: "Cover Selection" | "Inside Note" | "Mailing Address" | "Payment" | null = null;
    let recommendation = "Scenario active. Monitor incoming search traffic.";
    let status: "healthy" | "needs_attention" | "top_performer" | "gathering_data" = "gathering_data";

    if (views >= 5) {
      if (customizations < views * 0.4) {
        bottleneckStep = "Inside Note";
        recommendation = "High drop-off on starter note. Test a more concise bracketed template.";
        status = "needs_attention";
      } else if (checkouts < customizations * 0.4) {
        bottleneckStep = "Mailing Address";
        recommendation = "Customizations look strong, but address step drops off. Verify form ease-of-use.";
        status = "needs_attention";
      } else if (paidOrders === 0 && checkouts >= 2) {
        bottleneckStep = "Payment";
        recommendation = "Users reach checkout but abandon. Ensure Apple Pay & promo badges are visible.";
        status = "needs_attention";
      } else if (conversionRate >= 5) {
        status = "top_performer";
        recommendation = "Outstanding conversion rate. Consider spinning up adjacent sub-queries.";
      } else {
        status = "healthy";
        recommendation = "Funnel conversion is healthy and performing within target benchmarks.";
      }
    }

    return {
      slug: scenario.slug,
      occasionSlug: scenario.occasionSlug,
      path: `/send/${scenario.occasionSlug}/${scenario.slug}`,
      title: scenario.h1Title,
      category: scenario.category,
      views,
      customizations,
      checkouts,
      paidOrders,
      conversionRate,
      primaryDropoffStep: bottleneckStep || "None Detected",
      actionableInsight: recommendation,
      status,
    };
  });

  return {
    scenarios,
    totalViews,
    totalOrders,
  };
}
