import { firestoreDb, getSystemConfig, setSystemConfig, getOrdersCollection, sanitizeFirestoreData } from "./firebase-admin";
import { TELEMETRY_COLLECTION } from "./telemetry";
import { TelemetryEvent, Order, AdminMetrics, ScenarioPerformanceMetric } from "./types";
import { getAllScenarios } from "./seo-scenarios";

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
    updatedAt: Date.now(),
  };

  // Track session ID
  if (event.sessionId) {
    if (!summary.activeSessionIds.includes(event.sessionId)) {
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

  allOrdersSnap.forEach((doc) => {
    const o = doc.data() as Order;
    if (
      o.status === "PROCESSING_HANDWRYTTEN" ||
      o.status === "PAYMENT_RECEIVED" ||
      o.status === "MAILED"
    ) {
      totalRevenueCents += o.amountInCents || 900;
      processingCount++;
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

  // 3. Load pre-aggregated telemetry funnel
  const telemetry = await getTelemetrySummary();

  const totalSessions = Math.max(telemetry.totalSessions, allOrdersSnap.size, 1);

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
      coverSelected: Math.max(telemetry.coverSelected, allOrdersSnap.size),
      noteCompleted: Math.max(telemetry.noteCompleted, allOrdersSnap.size),
      addressCompleted: Math.max(telemetry.addressCompleted, allOrdersSnap.size),
      checkoutInitiated: Math.max(telemetry.checkoutInitiated, allOrdersSnap.size),
      paid: Math.max(telemetry.paid, processingCount),
    },
    fontPopularity,
    occasionPopularity,
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
