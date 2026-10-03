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

/**
 * Persistently stores a telemetry event and updates the pre-aggregated summary document.
 * This ensures O(1) reads for admin dashboards instead of expensive table scans.
 */
export async function ingestTelemetryEvent(event: TelemetryEvent): Promise<void> {
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

  // Update funnel counters
  switch (event.eventName) {
    case "cover_preset_selected":
    case "ai_generate_succeeded":
      summary.coverSelected++;
      break;
    case "step_navigated":
      if (event.step === 2) summary.noteCompleted++;
      if (event.step === 3) summary.addressCompleted++;
      break;
    case "inside_note_edited":
      summary.noteCompleted++;
      break;
    case "address_completed":
      summary.addressCompleted++;
      break;
    case "checkout_initiated":
      summary.checkoutInitiated++;
      break;
    case "payment_succeeded":
      summary.paid++;
      break;
  }

  // Determine current step number and label
  let stepNum = event.step || 1;
  let stepName = "Cover Selection";
  if (event.eventName === "payment_succeeded") {
    stepNum = 5;
    stepName = "Paid & Penned";
  } else if (event.eventName === "checkout_initiated" || event.step === 4) {
    stepNum = 4;
    stepName = "Stripe Checkout";
  } else if (event.eventName === "address_completed" || event.step === 3) {
    stepNum = 3;
    stepName = "Recipient Address";
  } else if (
    event.eventName === "inside_note_edited" ||
    event.eventName === "inspiration_applied" ||
    event.eventName === "note_shuffled" ||
    event.step === 2
  ) {
    stepNum = 2;
    stepName = "Inside Note";
  } else if (
    event.eventName === "cover_preset_selected" ||
    event.eventName === "ai_generate_succeeded" ||
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

  // Update or insert visitor session record
  let existingSession = summary.recentSessions.find((s) => s.sessionId === event.sessionId);
  if (existingSession) {
    existingSession.lastSeenAt = Date.now();
    if (stepNum > existingSession.highestStep) {
      existingSession.highestStep = stepNum;
      existingSession.highestStepName = stepName;
    }
    if (event.eventName === "payment_succeeded") {
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
  } else {
    const newSession: VisitorSessionRecord = {
      sessionId: event.sessionId,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      highestStep: stepNum,
      highestStepName: stepName,
      dropOffStep: event.eventName === "payment_succeeded" ? undefined : stepName,
      completed: event.eventName === "payment_succeeded",
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
  if (event.eventName === "payment_succeeded") {
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
    if (event.eventName === "session_start" || event.eventName === "scenario_landing_viewed") {
      s.views++;
    } else if (
      event.eventName === "inside_note_edited" ||
      event.eventName === "scenario_customized" ||
      event.eventName === "step_navigated"
    ) {
      s.customizations++;
    } else if (event.eventName === "checkout_initiated") {
      s.checkouts++;
    } else if (event.eventName === "payment_succeeded") {
      s.paid++;
    }
  }

  summary.updatedAt = Date.now();

  // Save updated aggregate summary
  await setSystemConfig(SUMMARY_CONFIG_KEY, summary as unknown as Record<string, unknown>);
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

    snap.forEach((doc) => {
      const evt = doc.data() as TelemetryEvent;
      if (evt.sessionId) sessions.add(evt.sessionId);

      switch (evt.eventName) {
        case "cover_preset_selected":
        case "ai_generate_succeeded":
          summary.coverSelected++;
          break;
        case "step_navigated":
          if (evt.step === 2) summary.noteCompleted++;
          if (evt.step === 3) summary.addressCompleted++;
          break;
        case "inside_note_edited":
          summary.noteCompleted++;
          break;
        case "address_completed":
          summary.addressCompleted++;
          break;
        case "checkout_initiated":
          summary.checkoutInitiated++;
          break;
        case "payment_succeeded":
          summary.paid++;
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
        if (evt.eventName === "session_start" || evt.eventName === "scenario_landing_viewed") {
          s.views++;
        } else if (
          evt.eventName === "inside_note_edited" ||
          evt.eventName === "scenario_customized" ||
          evt.eventName === "step_navigated"
        ) {
          s.customizations++;
        } else if (evt.eventName === "checkout_initiated") {
          s.checkouts++;
        } else if (evt.eventName === "payment_succeeded") {
          s.paid++;
        }
      }
    });

    summary.activeSessionIds = Array.from(sessions).slice(-500);
    summary.totalSessions = sessions.size;
    summary.updatedAt = Date.now();

    // Persist backfilled aggregate
    await setSystemConfig(SUMMARY_CONFIG_KEY, summary as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn("[Metrics Rollup] Backfill notice:", err);
  }

  return summary;
}

/**
 * Computes scalable admin dashboard metrics by combining:
 * 1. Pre-aggregated telemetry summary
 * 2. High-performance order queries with limit and status filtering
 */
export async function getAdminDashboardMetrics(): Promise<AdminMetrics> {
  // 1. Fetch latest 50 orders sorted newest first
  const ordersSnapshot = await getOrdersCollection()
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const recentOrders: Order[] = [];
  ordersSnapshot.forEach((doc) => {
    recentOrders.push(doc.data() as Order);
  });

  // 2. Fetch all orders for status totals (or from summary)
  const allOrdersSnap = await getOrdersCollection().get();
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

  allOrdersSnap.forEach((doc) => {
    const o = doc.data() as Order;
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

      // Group attribution by Campaign / Source
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

    // Font tally
    const fontId = o.fontStyleId || "hwDavid";
    const fontName = FONT_NAME_MAP[fontId] || fontId;
    fontCounts[fontName] = (fontCounts[fontName] || 0) + 1;

    // Occasion tally
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

  const totalCountForBreakdowns = Math.max(allOrdersSnap.size, 1);
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

  // 3. Margin & Unit Economics Summaries
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

  // Fetch operator tracked ad spend from system config
  let adSpendCents = 0;
  try {
    const adSpendDoc = await getSystemConfig<{ amountCents: number }>("admin_ad_spend");
    if (adSpendDoc?.amountCents) {
      adSpendCents = adSpendDoc.amountCents;
    }
  } catch (err) {
    console.warn("[Metrics Rollup] Error reading ad spend config:", err);
  }

  // Fetch saved valuation heuristic assumptions if present
  let valuationAssumptions: any = undefined;
  try {
    const valDoc = await getSystemConfig("admin_valuation_assumptions");
    if (valDoc) {
      valuationAssumptions = valDoc;
    }
  } catch (err) {
    console.warn("[Metrics Rollup] Error reading valuation assumptions:", err);
  }

  // 4. Load pre-aggregated telemetry funnel
  const telemetry = await getTelemetrySummary();

  const totalSessions = Math.max(telemetry.totalSessions, allOrdersSnap.size, 1);
  const coverCount = Math.max(telemetry.coverSelected, allOrdersSnap.size);
  const noteCount = Math.max(telemetry.noteCompleted, allOrdersSnap.size);
  const addressCount = Math.max(telemetry.addressCompleted, allOrdersSnap.size);
  const checkoutCount = Math.max(telemetry.checkoutInitiated, allOrdersSnap.size);
  const paidCount = Math.max(telemetry.paid, processingCount);

  // 5. Construct enriched visitor telemetry
  const totalDev =
    (telemetry.deviceCounts?.mobile || 0) +
    (telemetry.deviceCounts?.desktop || 0) +
    (telemetry.deviceCounts?.tablet || 0);
  const mobCount = telemetry.deviceCounts?.mobile || 0;
  const deskCount = telemetry.deviceCounts?.desktop || 0;
  const tabCount = telemetry.deviceCounts?.tablet || 0;

  const deviceBreakdown = {
    mobile: mobCount,
    desktop: deskCount,
    tablet: tabCount,
    mobilePercent: totalDev > 0 ? Math.round((mobCount / totalDev) * 100) : 0,
    desktopPercent: totalDev > 0 ? Math.round((deskCount / totalDev) * 100) : 0,
    tabletPercent: totalDev > 0 ? Math.round((tabCount / totalDev) * 100) : 0,
  };

  const topLocations = Object.entries(telemetry.geoCounts || {})
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

  const acquisitionSources: AcquisitionSourceMetric[] = Object.entries(telemetry.sourceCounts || {})
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

  const funnelLeaks: FunnelStepLeak[] = [
    {
      stepNumber: 1,
      stepName: "1. Landed & Browsing",
      visitors: totalSessions,
      conversionFromPrior: 100,
      leakToNext: totalSessions > 0 ? Math.max(0, Math.round(((totalSessions - coverCount) / totalSessions) * 100)) : 0,
    },
    {
      stepNumber: 2,
      stepName: "2. Cover Selected",
      visitors: coverCount,
      conversionFromPrior: totalSessions > 0 ? Math.min(100, Math.round((coverCount / totalSessions) * 100)) : 0,
      leakToNext: coverCount > 0 ? Math.max(0, Math.round(((coverCount - noteCount) / coverCount) * 100)) : 0,
    },
    {
      stepNumber: 3,
      stepName: "3. Note Written",
      visitors: noteCount,
      conversionFromPrior: coverCount > 0 ? Math.min(100, Math.round((noteCount / coverCount) * 100)) : 0,
      leakToNext: noteCount > 0 ? Math.max(0, Math.round(((noteCount - addressCount) / noteCount) * 100)) : 0,
    },
    {
      stepNumber: 4,
      stepName: "4. Address Entered",
      visitors: addressCount,
      conversionFromPrior: noteCount > 0 ? Math.min(100, Math.round((addressCount / noteCount) * 100)) : 0,
      leakToNext: addressCount > 0 ? Math.max(0, Math.round(((addressCount - checkoutCount) / addressCount) * 100)) : 0,
    },
    {
      stepNumber: 5,
      stepName: "5. Checkout Initiated",
      visitors: checkoutCount,
      conversionFromPrior: addressCount > 0 ? Math.min(100, Math.round((checkoutCount / addressCount) * 100)) : 0,
      leakToNext: checkoutCount > 0 ? Math.max(0, Math.round(((checkoutCount - paidCount) / checkoutCount) * 100)) : 0,
    },
    {
      stepNumber: 6,
      stepName: "6. Paid Order ($9.00)",
      visitors: paidCount,
      conversionFromPrior: checkoutCount > 0 ? Math.min(100, Math.round((paidCount / checkoutCount) * 100)) : 0,
      leakToNext: 0,
    },
  ];

  const visitorTelemetry: VisitorTelemetryMetrics = {
    funnelLeaks,
    acquisitionSources,
    deviceBreakdown,
    topLocations,
    recentSessions: telemetry.recentSessions || [],
  };

  return {
    totalRevenueCents,
    totalOrders: allOrdersSnap.size,
    ordersByStatus: {
      pending: pendingCount,
      processing: processingCount,
      failed: failedCount,
    },
    funnel: {
      totalSessions,
      coverSelected: coverCount,
      noteCompleted: noteCount,
      addressCompleted: addressCount,
      checkoutInitiated: checkoutCount,
      paid: paidCount,
    },
    visitorTelemetry,
    fontPopularity,
    occasionPopularity,
    margins,
    campaignAttributions,
    adSpendCents,
    valuationAssumptions,
    recentOrders,
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
