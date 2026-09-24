import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb } from "@/lib/firebase-admin";
import { TELEMETRY_COLLECTION } from "@/lib/telemetry";
import { getAllScenarios } from "@/lib/seo-scenarios";
import { ScenarioPerformanceMetric, TelemetryEvent } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scenarios = getAllScenarios();

    // Fetch telemetry events from Firestore
    let allEvents: TelemetryEvent[] = [];
    try {
      const snap = await firestoreDb.collection(TELEMETRY_COLLECTION).get();
      allEvents = snap.docs.map((doc) => doc.data() as TelemetryEvent);
    } catch (e) {
      console.warn("[Admin Scenarios] Telemetry query fallback:", e);
    }

    let totalScenarioViews = 0;
    let totalScenarioOrders = 0;

    const scenarioMetrics: ScenarioPerformanceMetric[] = scenarios.map((scenario) => {
      const targetPath = `/send/${scenario.occasionSlug}/${scenario.slug}`;

      // Events on this path or matching scenarioSlug
      const scenarioEvents = allEvents.filter(
        (evt) =>
          evt.path === targetPath ||
          evt.metadata?.scenarioSlug === scenario.slug
      );

      const uniqueSessions = new Set(scenarioEvents.map((e) => e.sessionId)).size;
      const views = Math.max(
        uniqueSessions,
        scenarioEvents.filter(
          (e) => e.eventName === "session_start" || e.eventName === "scenario_landing_viewed"
        ).length
      );

      const customizations = scenarioEvents.filter(
        (e) =>
          e.eventName === "inside_note_edited" ||
          e.eventName === "scenario_customized" ||
          e.eventName === "step_navigated"
      ).length;

      const checkouts = scenarioEvents.filter(
        (e) => e.eventName === "checkout_initiated"
      ).length;

      const paidOrders = scenarioEvents.filter(
        (e) => e.eventName === "payment_succeeded"
      ).length;

      totalScenarioViews += views;
      totalScenarioOrders += paidOrders;

      const conversionRate = views > 0 ? Number(((paidOrders / views) * 100).toFixed(1)) : 0;

      // Identify primary drop-off bottleneck
      let primaryDropoffStep = "None (Initial Traffic)";
      if (views > 0 && customizations < views * 0.5) {
        primaryDropoffStep = "Step 1 (Cover / Note Read)";
      } else if (customizations > 0 && checkouts < customizations * 0.5) {
        primaryDropoffStep = "Step 2 (Address Form)";
      } else if (checkouts > 0 && paidOrders < checkouts * 0.5) {
        primaryDropoffStep = "Step 3 (Payment Form)";
      }

      // Determine health status
      let status: ScenarioPerformanceMetric["status"] = "gathering_data";
      let actionableInsight = "Waiting for initial search impressions.";

      if (views >= 10) {
        if (conversionRate >= 5) {
          status = "top_performer";
          actionableInsight = "Strong performer! Consider building related long-tail sub-scenarios or running social links.";
        } else if (conversionRate >= 1.5) {
          status = "healthy";
          actionableInsight = "Converting reliably. Test alternate printed sentiment copy to improve initial hook.";
        } else {
          status = "needs_attention";
          actionableInsight = `High dropoff at ${primaryDropoffStep}. Try simplifying the prefilled note copy or adding reassurance.`;
        }
      } else if (views > 0) {
        status = "gathering_data";
        actionableInsight = `${views} visits recorded. Waiting for statistically significant sample (>10 visits).`;
      }

      return {
        slug: scenario.slug,
        occasionSlug: scenario.occasionSlug,
        path: targetPath,
        title: scenario.h1Title,
        category: scenario.category,
        views,
        customizations,
        checkouts,
        paidOrders,
        conversionRate,
        primaryDropoffStep,
        status,
        actionableInsight,
      };
    });

    // Sort by views descending, then orders
    scenarioMetrics.sort((a, b) => b.views - a.views || b.paidOrders - a.paidOrders);

    const overallConversion =
      totalScenarioViews > 0
        ? Number(((totalScenarioOrders / totalScenarioViews) * 100).toFixed(1))
        : 0;

    const topPerformer =
      scenarioMetrics.find((m) => m.status === "top_performer")?.title ||
      scenarioMetrics[0]?.title ||
      "Job Interview Follow-Up";

    return NextResponse.json({
      metrics: scenarioMetrics,
      summary: {
        totalViews: totalScenarioViews,
        totalOrders: totalScenarioOrders,
        overallConversionRate: overallConversion,
        topScenario: topPerformer,
        activeScenariosCount: scenarios.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error fetching scenario analytics";
    console.error("[Admin Scenario Analytics Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
