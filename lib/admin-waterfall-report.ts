import {
  AdminWaterfallReport,
  FUNNEL_STEP_LABELS,
  FUNNEL_STEP_ORDER,
  REPORT_TIMEZONE,
  StandardFunnelStep,
  STANDARD_FUNNEL_STEPS,
  WaterfallAdSpendInput,
  WaterfallAudience,
  WaterfallChannel,
  WaterfallOrderInput,
  WaterfallOriginRow,
  WaterfallReconciliationInput,
  WaterfallScope,
  WaterfallStepMetric,
  WaterfallTelemetryEventInput,
  WaterfallWindow,
  WATERFALL_AUDIENCES,
  WATERFALL_CHANNELS,
  WATERFALL_WINDOWS,
} from "./contracts/admin-waterfall";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidWaterfallScope extends Error {}

export function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function localDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Convert an America/Chicago wall-clock midnight (00:00:00) on a given YYYY-MM-DD
 * to an ISO UTC string by solving against the zone's actual offset.
 */
export function chicagoMidnight(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const next = guess + target - represented;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

export function normalizeWaterfallScope(
  params: URLSearchParams,
  now = new Date()
): WaterfallScope {
  const rawWindow = (params.get("window") || params.get("period") || "last7").toLowerCase();
  const rawChannel = (params.get("channel") || "all").toLowerCase();
  const rawAudience = (params.get("audience") || "customers").toLowerCase();

  const window: WaterfallWindow = WATERFALL_WINDOWS.includes(rawWindow as WaterfallWindow)
    ? (rawWindow as WaterfallWindow)
    : "last7";

  const channel: WaterfallChannel = WATERFALL_CHANNELS.includes(rawChannel as WaterfallChannel)
    ? (rawChannel as WaterfallChannel)
    : "all";

  const audience: WaterfallAudience = WATERFALL_AUDIENCES.includes(rawAudience as WaterfallAudience)
    ? (rawAudience as WaterfallAudience)
    : "customers";

  const today = localDate(now);
  let startDate: string | null = null;
  let endDate: string | null = null;

  switch (window) {
    case "today":
      startDate = today;
      endDate = today;
      break;
    case "yesterday":
      startDate = addDays(today, -1);
      endDate = addDays(today, -1);
      break;
    case "last7":
      startDate = addDays(today, -6);
      endDate = today;
      break;
    case "last30":
      startDate = addDays(today, -29);
      endDate = today;
      break;
    case "since_oct13":
      startDate = "2026-10-13";
      endDate = today;
      break;
    case "custom": {
      const customStart = params.get("start") || params.get("startDate");
      const customEnd = params.get("end") || params.get("endDate");
      if (!customStart || !customEnd || !validDate(customStart) || !validDate(customEnd) || customStart > customEnd) {
        throw new InvalidWaterfallScope("Invalid or reversed custom dates.");
      }
      startDate = customStart;
      endDate = customEnd;
      break;
    }
    case "all":
    default:
      startDate = null;
      endDate = null;
      break;
  }

  return {
    window,
    startDate,
    endDate,
    channel,
    audience,
    startUtc: startDate ? chicagoMidnight(startDate) : null,
    endUtc: endDate ? chicagoMidnight(addDays(endDate, 1)) : null,
  };
}

export function timestampMillis(
  value: WaterfallOrderInput["createdAt"] | WaterfallTelemetryEventInput["timestamp"]
): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const seconds = (value as any).seconds ?? (value as any)._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

export function mapEventToFunnelStep(eventName?: string): StandardFunnelStep | null {
  if (!eventName || typeof eventName !== "string") return null;
  const name = eventName.trim().toLowerCase();

  // Step 1: Landing
  if (
    [
      "session_start",
      "landing_viewed",
      "scenario_landing_viewed",
      "step_1_landed",
      "entry_viewed",
      "builder_started",
    ].includes(name)
  ) {
    return "1_LANDING";
  }

  // Step 2: Item Select
  if (
    [
      "cover_preset_selected",
      "custom_generation_completed",
      "card_completed",
      "step_2_cover_ready",
      "cover_selected",
      "cover_loaded",
      "generation_completed",
    ].includes(name)
  ) {
    return "2_ITEM_SELECT";
  }

  // Step 3: Compose
  if (
    [
      "inside_note_edited",
      "note_completed",
      "step_3_note_typed",
      "font_style_selected",
      "starter_prompt_used",
      "note_confirmed",
      "note_edit_started",
      "inspiration_applied",
      "note_shuffled",
      "note_template_loaded",
    ].includes(name)
  ) {
    return "3_COMPOSE";
  }

  // Step 4: Address
  if (
    [
      "address_completed",
      "step_4b_address_completed",
      "address_confirmed",
      "address_viewed",
      "step_4a_address_viewed",
      "address_deferred",
    ].includes(name)
  ) {
    return "4_ADDRESS";
  }

  // Step 5: Checkout
  if (
    [
      "checkout_initiated",
      "payment_viewed",
      "step_5_checkout_initiated",
      "checkout_created",
      "checkout_requested",
      "payment_ui_ready",
      "payment_attempted",
      "wallet_availability_observed",
      "wallet_selected",
    ].includes(name)
  ) {
    return "5_CHECKOUT";
  }

  // Authority payment events in telemetry (treated as Step 6 evidence if present)
  if (
    [
      "step_6_paid_order",
      "payment_succeeded",
      "purchase_verified",
      "payment_captured",
    ].includes(name)
  ) {
    return "6_PAID";
  }

  return null;
}

export function classifyChannel(params: {
  source?: string;
  medium?: string;
  campaign?: string;
  fbclid?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  emailClickId?: string;
}): WaterfallChannel {
  const source = (params.source || "").toLowerCase().trim();
  const medium = (params.medium || "").toLowerCase().trim();

  if (params.fbclid || ["facebook", "instagram", "meta"].some((s) => source.includes(s)) || medium === "paid_social" || medium === "social") {
    return "meta";
  }
  if (params.gclid || params.wbraid || params.gbraid || source.includes("google") || ["cpc", "ppc", "paid", "paidsearch"].includes(medium)) {
    return "google";
  }
  if (params.emailClickId || ["email", "e-mail"].includes(medium)) {
    return "email";
  }
  if (medium === "organic") {
    return "organic";
  }
  if (["referral", "affiliate"].includes(medium)) {
    return "referral";
  }
  if (source === "direct" || ["none", "direct"].includes(medium) || (!source && !medium)) {
    return "direct";
  }
  return "direct";
}

export function classifyDevice(deviceType?: string, userAgent?: string): "mobile" | "desktop" | "tablet" {
  const dt = (deviceType || "").toLowerCase();
  const ua = (userAgent || "").toLowerCase();

  if (dt === "tablet" || /ipad|tablet/i.test(ua)) return "tablet";
  if (dt === "mobile" || /mobile|iphone|ipod|android/i.test(ua)) return "mobile";
  if (dt === "desktop" || /macintosh|windows|linux/i.test(ua)) return "desktop";
  return "desktop";
}

const BOT_REGEX = /bot|crawler|spider|googlebot|bingbot|yandex|baidu|slurp|duckduckgo|semrush|ahrefs|lighthouse|headless|facebookexternalhit|whatsapp|twitterbot|pingdom|uptimerobot/i;

export function isBotEvent(event: WaterfallTelemetryEventInput): boolean {
  if (event.isBot === true) return true;
  if (event.userAgent && BOT_REGEX.test(event.userAgent)) return true;
  return false;
}

export function isFounderEvent(event: WaterfallTelemetryEventInput): boolean {
  if (event.isFounder === true || event.is_founder === true) return true;
  if (event.metadata && (event.metadata.is_founder === true || event.metadata.isFounder === true)) return true;
  return false;
}

type OrderClassification = "customer" | "founder" | "comp" | "admin" | "unresolved";

function classifyOrder(order: WaterfallOrderInput, sidecar?: WaterfallReconciliationInput): OrderClassification {
  if (
    order.isFounderTest === true ||
    order.isTest === true ||
    order.paymentMode === "stripe_test" ||
    order.paymentMode === "local_mock" ||
    order.purchaseMeasurement?.reason === "test_payment" ||
    sidecar?.classification === "founder_test"
  ) {
    return "founder";
  }

  if (
    order.isComp === true ||
    order.commercialKind === "studio_comp" ||
    sidecar?.classification === "comp"
  ) {
    return "comp";
  }

  if (
    order.origin === "ADMIN_COMP" ||
    order.commercialKind === "admin_comp_balance" ||
    sidecar?.classification === "admin_origin"
  ) {
    return "admin";
  }

  if (sidecar?.classification === "independent_customer") return "customer";
  if (sidecar?.classification === "unresolved") return "unresolved";

  const m = order.purchaseMeasurement;
  if (
    m &&
    m.version === 1 &&
    m.transactionId === order.id &&
    Number.isFinite(m.verifiedAt) &&
    Number.isInteger(m.amountInCents) &&
    (m.amountInCents ?? 0) > 0 &&
    m.currency === "USD" &&
    ["eligible", "known_refund"].includes(m.reason ?? "") &&
    order.paymentMode !== "stripe_test" &&
    order.paymentMode !== "local_mock" &&
    order.paymentMethod === "STRIPE" &&
    order.stripePaymentId
  ) {
    return "customer";
  }

  return "unresolved";
}

function verifyCustomerCapture(order: WaterfallOrderInput, sidecar?: WaterfallReconciliationInput): { valid: boolean; amountInCents: number } {
  const m = order.purchaseMeasurement;

  const sidecarCapture =
    sidecar?.classification === "independent_customer" &&
    sidecar.liveMode === true &&
    sidecar.currency === "USD" &&
    Number.isInteger(sidecar.amountInCents) &&
    (sidecar.amountInCents ?? 0) > 0 &&
    Boolean(sidecar.paymentIntentId) &&
    sidecar.paymentIntentId === order.stripePaymentId &&
    (!Number.isInteger(order.amountInCents) || order.amountInCents === sidecar.amountInCents) &&
    (!m || (m.amountInCents === sidecar.amountInCents && m.currency === sidecar.currency && m.transactionId === order.id));

  const snapshotCapture =
    m?.version === 1 &&
    m.transactionId === order.id &&
    Number.isFinite(m.verifiedAt) &&
    m.currency === "USD" &&
    Number.isInteger(m.amountInCents) &&
    (m.amountInCents ?? 0) > 0 &&
    Boolean(order.stripePaymentId) &&
    ["eligible", "known_refund"].includes(m.reason ?? "") &&
    (!Number.isInteger(order.amountInCents) || order.amountInCents === m.amountInCents);

  if (sidecarCapture) {
    return { valid: true, amountInCents: sidecar.amountInCents! };
  }
  if (snapshotCapture) {
    return { valid: true, amountInCents: m.amountInCents! };
  }
  return { valid: false, amountInCents: 0 };
}

export interface WaterfallAggregateInput {
  asOf: Date;
  scope: WaterfallScope;
  orders: WaterfallOrderInput[];
  telemetry: WaterfallTelemetryEventInput[];
  reconciliations?: WaterfallReconciliationInput[];
  adSpendRecords?: WaterfallAdSpendInput[];
  ordersCap?: number;
  telemetryCap?: number;
  ordersCount?: number;
  telemetryCount?: number;
}

export function aggregateWaterfallReport(input: WaterfallAggregateInput): AdminWaterfallReport {
  const { asOf, scope } = input;
  const ordersCap = input.ordersCap ?? 2000;
  const telemetryCap = input.telemetryCap ?? 2000;

  // 1. Index reconciliations by orderId (resolving latest revisions)
  const sidecarByOrder = new Map<string, WaterfallReconciliationInput>();
  const sidecarGroups = new Map<string, WaterfallReconciliationInput[]>();
  for (const entry of input.reconciliations ?? []) {
    if (!entry.orderId) continue;
    const group = sidecarGroups.get(entry.orderId) ?? [];
    group.push(entry);
    sidecarGroups.set(entry.orderId, group);
  }
  for (const [orderId, group] of sidecarGroups) {
    const revisions = new Map<number, WaterfallReconciliationInput>();
    for (const entry of group) {
      revisions.set(entry.revision ?? 1, entry);
    }
    const ordered = [...revisions.values()].sort((a, b) => (a.revision ?? 1) - (b.revision ?? 1));
    const latest = ordered.at(-1);
    if (latest) {
      sidecarByOrder.set(orderId, latest);
    }
  }

  // 2. Filter & classify orders
  let capturedRevenueCents = 0;
  let refundedCents = 0;
  let paidCustomerOrders = 0;
  let excludedNonCustomerOrders = 0;
  let dispatchedOrders = 0;
  let heldOrFailedOrders = 0;

  const validPaidCustomerOrders: Array<{
    order: WaterfallOrderInput;
    amountCents: number;
    channel: WaterfallChannel;
    source: string;
    medium: string;
    campaign: string;
    originKey: string;
  }> = [];

  const startMillis = scope.startUtc ? Date.parse(scope.startUtc) : null;
  const endMillis = scope.endUtc ? Date.parse(scope.endUtc) : null;

  for (const order of input.orders) {
    if (!order.id) continue;
    const created = timestampMillis(order.createdAt);
    if (created === null) continue;
    if (startMillis !== null && created < startMillis) continue;
    if (endMillis !== null && created >= endMillis) continue;

    const sidecar = sidecarByOrder.get(order.id);
    const classification = classifyOrder(order, sidecar);

    if (classification === "founder" || classification === "comp" || classification === "admin") {
      excludedNonCustomerOrders++;
      continue;
    }

    if (classification === "customer") {
      const capture = verifyCustomerCapture(order, sidecar);
      if (!capture.valid) {
        continue;
      }

      // Determine order channel & attribution
      const attr = order.attribution ?? {};
      const hasFb = Boolean(attr.fbclid);
      const hasGoogle = Boolean(attr.gclid || attr.wbraid || attr.gbraid);
      const hasEmail = Boolean(attr.emailClickId);

      const rawSource =
        attr.source ||
        attr.utmSource ||
        order.source ||
        (hasFb ? "meta" : hasGoogle ? "google" : hasEmail ? "email" : "direct");

      const rawMedium =
        attr.medium ||
        attr.utmMedium ||
        (hasFb ? "paid_social" : hasGoogle ? "cpc" : hasEmail ? "email" : "none");

      const rawCampaign = attr.campaign || attr.utmCampaign || order.campaignId || "none";

      const orderChannel = classifyChannel({
        source: rawSource,
        medium: rawMedium,
        campaign: rawCampaign,
        fbclid: attr.fbclid,
        gclid: attr.gclid,
        wbraid: attr.wbraid,
        gbraid: attr.gbraid,
        emailClickId: attr.emailClickId,
      });

      if (scope.channel !== "all" && orderChannel !== scope.channel) {
        continue;
      }

      paidCustomerOrders++;
      capturedRevenueCents += capture.amountInCents;

      const refundAmount = order.refundedAmountInCents ?? sidecar?.refundedAmountInCents ?? 0;
      if (refundAmount > 0) {
        refundedCents += refundAmount;
      }

      // Check fulfillment status
      const status = (order.status || "").toUpperCase();
      const isMailedOrProcessing = ["MAILED", "PROCESSING_HANDWRYTTEN"].includes(status);
      const hasHWId = Boolean(order.handwryttenOrderId);
      const isFailed = status === "FAILED" || Boolean(order.fulfillmentError);

      if ((isMailedOrProcessing || hasHWId) && !isFailed) {
        dispatchedOrders++;
      } else {
        heldOrFailedOrders++;
      }

      const sourceClean = (rawSource || "direct").toLowerCase().trim();
      const mediumClean = (rawMedium || "none").toLowerCase().trim();
      const campaignClean = (rawCampaign || "none").toLowerCase().trim();
      const originKey = `${sourceClean}|${mediumClean}|${campaignClean}`;

      validPaidCustomerOrders.push({
        order,
        amountCents: capture.amountInCents,
        channel: orderChannel,
        source: sourceClean,
        medium: mediumClean,
        campaign: campaignClean,
        originKey,
      });
    }
  }

  const netRevenueCents = capturedRevenueCents - refundedCents;

  // 3. Telemetry Session Grouping & Filtering
  const sessionEvents = new Map<string, WaterfallTelemetryEventInput[]>();
  for (const event of input.telemetry) {
    const sId = event.sessionId;
    if (!sId) continue;
    const ts = timestampMillis(event.timestamp ?? event.createdAt);
    if (ts !== null) {
      if (startMillis !== null && ts < startMillis) continue;
      if (endMillis !== null && ts >= endMillis) continue;
    }
    const events = sessionEvents.get(sId) ?? [];
    events.push(event);
    sessionEvents.set(sId, events);
  }

  let botFilteredCount = 0;
  let founderFilteredCount = 0;
  let mobileCount = 0;
  let desktopCount = 0;
  let tabletCount = 0;

  const rawStepCounts: Record<StandardFunnelStep, number> = {
    "1_LANDING": 0,
    "2_ITEM_SELECT": 0,
    "3_COMPOSE": 0,
    "4_ADDRESS": 0,
    "5_CHECKOUT": 0,
    "6_PAID": 0,
  };

  interface SessionSummary {
    sessionId: string;
    maxStepReached: number; // 1 to 5
    channel: WaterfallChannel;
    source: string;
    medium: string;
    campaign: string;
    originKey: string;
  }

  const eligibleSessions: SessionSummary[] = [];

  for (const [sessionId, events] of sessionEvents) {
    const hasBot = events.some(isBotEvent);
    if (hasBot) {
      botFilteredCount++;
      continue;
    }

    const hasFounder = events.some(isFounderEvent);
    if (scope.audience === "customers" && hasFounder) {
      founderFilteredCount++;
      continue;
    }

    // Determine device
    const primaryEvent = events[0];
    const device = classifyDevice(primaryEvent?.deviceType, primaryEvent?.userAgent);

    // Determine attribution from earliest event carrying UTM or click IDs
    let sessionChannel: WaterfallChannel = "direct";
    let sessionSource = "direct";
    let sessionMedium = "none";
    let sessionCampaign = "none";

    for (const ev of events) {
      const src = ev.utmSource || ev.source;
      const med = ev.utmMedium || ev.medium;
      const cmp = ev.utmCampaign || ev.campaign;
      const ch = classifyChannel({
        source: src,
        medium: med,
        campaign: cmp,
        fbclid: ev.fbclid,
        gclid: ev.gclid,
        wbraid: ev.wbraid,
        gbraid: ev.gbraid,
        emailClickId: ev.emailClickId,
      });

      if (ev.fbclid) {
        sessionChannel = "meta";
        sessionSource = src || "meta";
        sessionMedium = med || "paid_social";
        sessionCampaign = cmp || "none";
        break;
      }
      if (ev.gclid || ev.wbraid || ev.gbraid) {
        sessionChannel = "google";
        sessionSource = src || "google";
        sessionMedium = med || "cpc";
        sessionCampaign = cmp || "none";
        break;
      }
      if (src || med || cmp) {
        sessionChannel = ch;
        sessionSource = src || "direct";
        sessionMedium = med || "none";
        sessionCampaign = cmp || "none";
        break;
      }
    }

    if (scope.channel !== "all" && sessionChannel !== scope.channel) {
      continue;
    }

    // Increment device counter for retained sessions
    if (device === "mobile") mobileCount++;
    else if (device === "tablet") tabletCount++;
    else desktopCount++;

    // Calculate step reach
    let maxStep = 1; // Any retained session in telemetry reached at least Step 1 Landing
    for (const ev of events) {
      const step = mapEventToFunnelStep(ev.eventName);
      if (step) {
        rawStepCounts[step]++;
        const orderNum = FUNNEL_STEP_ORDER[step];
        if (orderNum > maxStep && orderNum <= 5) {
          maxStep = orderNum;
        }
      }
    }

    const sourceClean = sessionSource.toLowerCase().trim();
    const mediumClean = sessionMedium.toLowerCase().trim();
    const campaignClean = sessionCampaign.toLowerCase().trim();
    const originKey = `${sourceClean}|${mediumClean}|${campaignClean}`;

    eligibleSessions.push({
      sessionId,
      maxStepReached: maxStep,
      channel: sessionChannel,
      source: sourceClean,
      medium: mediumClean,
      campaign: campaignClean,
      originKey,
    });
  }

  // 4. Construct Origin Matrix
  const originMap = new Map<string, WaterfallOriginRow>();

  for (const s of eligibleSessions) {
    let row = originMap.get(s.originKey);
    if (!row) {
      row = {
        originKey: s.originKey,
        source: s.source,
        medium: s.medium,
        campaign: s.campaign,
        channel: s.channel,
        sessions: 0,
        itemSelect: 0,
        compose: 0,
        address: 0,
        checkout: 0,
        paidOrders: 0,
        conversionRatePct: 0,
        capturedRevenueCents: 0,
      };
      originMap.set(s.originKey, row);
    }

    row.sessions++;
    if (s.maxStepReached >= 2) row.itemSelect++;
    if (s.maxStepReached >= 3) row.compose++;
    if (s.maxStepReached >= 4) row.address++;
    if (s.maxStepReached >= 5) row.checkout++;
  }

  // Add paid orders to Origin Matrix
  for (const paid of validPaidCustomerOrders) {
    let row = originMap.get(paid.originKey);
    if (!row) {
      row = {
        originKey: paid.originKey,
        source: paid.source,
        medium: paid.medium,
        campaign: paid.campaign,
        channel: paid.channel,
        sessions: 0,
        itemSelect: 0,
        compose: 0,
        address: 0,
        checkout: 0,
        paidOrders: 0,
        conversionRatePct: 0,
        capturedRevenueCents: 0,
      };
      originMap.set(paid.originKey, row);
    }
    row.paidOrders++;
    row.capturedRevenueCents += paid.amountCents;
  }

  // Ensure origin row monotonic reach:
  // (sessions, itemSelect, compose, address, checkout must be at least paidOrders)
  const originMatrix: WaterfallOriginRow[] = [];
  for (const row of originMap.values()) {
    row.sessions = Math.max(row.sessions, row.paidOrders);
    row.itemSelect = Math.max(row.itemSelect, row.paidOrders);
    row.compose = Math.max(row.compose, row.paidOrders);
    row.address = Math.max(row.address, row.paidOrders);
    row.checkout = Math.max(row.checkout, row.paidOrders);
    row.conversionRatePct =
      row.sessions > 0
        ? Number(((row.paidOrders / row.sessions) * 100).toFixed(1))
        : 0;
    originMatrix.push(row);
  }

  originMatrix.sort((a, b) => b.sessions - a.sessions || b.paidOrders - a.paidOrders);

  // 5. Monotonic Waterfall Steps Calculation
  // Initial session reach from eligible sessions:
  let step1Sessions = eligibleSessions.length;
  let step2Sessions = eligibleSessions.filter((s) => s.maxStepReached >= 2).length;
  let step3Sessions = eligibleSessions.filter((s) => s.maxStepReached >= 3).length;
  let step4Sessions = eligibleSessions.filter((s) => s.maxStepReached >= 4).length;
  let step5Sessions = eligibleSessions.filter((s) => s.maxStepReached >= 5).length;
  const step6Sessions = paidCustomerOrders;

  // Enforce monotonic reach with paidCustomerOrders:
  // Step 6 is authoritative paidCustomerOrders. Steps 1..5 must be at least paidCustomerOrders.
  step5Sessions = Math.max(step5Sessions, step6Sessions);
  step4Sessions = Math.max(step4Sessions, step5Sessions);
  step3Sessions = Math.max(step3Sessions, step4Sessions);
  step2Sessions = Math.max(step2Sessions, step3Sessions);
  step1Sessions = Math.max(step1Sessions, step2Sessions);

  const stepSessionCounts: Record<StandardFunnelStep, number> = {
    "1_LANDING": step1Sessions,
    "2_ITEM_SELECT": step2Sessions,
    "3_COMPOSE": step3Sessions,
    "4_ADDRESS": step4Sessions,
    "5_CHECKOUT": step5Sessions,
    "6_PAID": step6Sessions,
  };

  const landedSessions = stepSessionCounts["1_LANDING"];
  const waterfallSteps: WaterfallStepMetric[] = [];

  // Compute drops
  const stepDrops: Array<{ step: StandardFunnelStep; dropPct: number | null }> = [];
  for (let i = 0; i < STANDARD_FUNNEL_STEPS.length; i++) {
    const step = STANDARD_FUNNEL_STEPS[i];
    const sess = stepSessionCounts[step];
    if (i === 0) {
      stepDrops.push({ step, dropPct: null });
    } else {
      const prevStep = STANDARD_FUNNEL_STEPS[i - 1];
      const prevSess = stepSessionCounts[prevStep];
      if (prevSess > 0) {
        const drop = Number((((prevSess - sess) / prevSess) * 100).toFixed(1));
        stepDrops.push({ step, dropPct: drop });
      } else {
        stepDrops.push({ step, dropPct: null });
      }
    }
  }

  // Find biggest drop
  let maxDropPct = -1;
  let biggestDropStep: StandardFunnelStep | null = null;
  for (const item of stepDrops) {
    if (item.dropPct !== null && item.dropPct > maxDropPct && item.dropPct > 0) {
      maxDropPct = item.dropPct;
      biggestDropStep = item.step;
    }
  }

  for (let i = 0; i < STANDARD_FUNNEL_STEPS.length; i++) {
    const step = STANDARD_FUNNEL_STEPS[i];
    const sess = stepSessionCounts[step];
    const dropPct = stepDrops[i].dropPct;
    const isBiggestDrop = step === biggestDropStep;
    const pctOfLanded =
      landedSessions > 0
        ? Number(((sess / landedSessions) * 100).toFixed(1))
        : 0;

    waterfallSteps.push({
      step,
      label: FUNNEL_STEP_LABELS[step],
      sessions: sess,
      rawEvents: rawStepCounts[step] || (step === "6_PAID" ? paidCustomerOrders : 0),
      pctOfLanded,
      dropOffFromPrevPct: dropPct,
      isBiggestDrop,
    });
  }

  // 6. Ad Spend & CPA
  let recordedAdSpendCents: number | null = null;
  if (input.adSpendRecords && input.adSpendRecords.length > 0) {
    let spendSum = 0;
    let foundAny = false;
    for (const rec of input.adSpendRecords) {
      if (scope.startDate && rec.date < scope.startDate) continue;
      if (scope.endDate && rec.date > scope.endDate) continue;

      if (scope.channel !== "all" && rec.channel) {
        const ch = classifyChannel({ source: rec.channel });
        if (ch !== scope.channel) continue;
      }

      spendSum += rec.amountCents;
      foundAny = true;
    }
    if (foundAny) {
      recordedAdSpendCents = spendSum;
    }
  }

  const cpaCents =
    recordedAdSpendCents !== null && paidCustomerOrders > 0
      ? Math.round(recordedAdSpendCents / paidCustomerOrders)
      : null;

  const uniqueSessions = landedSessions;
  const conversionRatePct =
    uniqueSessions > 0
      ? Number(((paidCustomerOrders / uniqueSessions) * 100).toFixed(1))
      : 0;

  const totalOrdersObserved = input.ordersCount ?? input.orders.length;
  const totalTelemetryObserved = input.telemetryCount ?? input.telemetry.length;

  return {
    asOf: asOf.toISOString(),
    timezone: REPORT_TIMEZONE,
    scope,
    kpis: {
      capturedRevenueCents,
      refundedCents,
      netRevenueCents,
      paidCustomerOrders,
      excludedNonCustomerOrders,
      uniqueSessions,
      conversionRatePct,
      dispatchedOrders,
      heldOrFailedOrders,
      recordedAdSpendCents,
      cpaCents,
    },
    waterfall: waterfallSteps,
    originMatrix,
    deviceBreakdown: {
      mobile: mobileCount,
      desktop: desktopCount,
      tablet: tabletCount,
      botFilteredCount,
      founderFilteredCount,
    },
    coverage: {
      ordersCount: Math.min(totalOrdersObserved, ordersCap),
      ordersCap,
      telemetryCount: Math.min(totalTelemetryObserved, telemetryCap),
      telemetryCap,
      truncated: totalOrdersObserved > ordersCap || totalTelemetryObserved > telemetryCap,
    },
  };
}
