import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb, getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";
import { TELEMETRY_COLLECTION } from "@/lib/telemetry";
import { TelemetrySummary } from "@/lib/metrics-rollup";

const SUMMARY_CONFIG_KEY = "telemetry_summary";
const REGISTRY_CONFIG_KEY = "founder_device_registry";

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: "Unauthorized access to admin action" }, { status: 401 });
    }

    let unflaggedEventsCount = 0;
    let unflaggedSessionsCount = 0;

    // 1. Clean up founder device registry: purge legacy IPs and UserAgents
    const rawRegistry = (await getSystemConfig<any>(REGISTRY_CONFIG_KEY)) || {};
    await setSystemConfig(REGISTRY_CONFIG_KEY, {
      clientIds: Array.isArray(rawRegistry.clientIds) ? rawRegistry.clientIds : [],
      sessionIds: Array.isArray(rawRegistry.sessionIds) ? rawRegistry.sessionIds : [],
      updatedAt: Date.now(),
    });

    // 2. Unflag mistagged sessions in telemetry_summary config
    const summary = await getSystemConfig<TelemetrySummary>(SUMMARY_CONFIG_KEY);
    if (summary && Array.isArray(summary.recentSessions)) {
      let modified = false;
      for (const s of summary.recentSessions) {
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

        if (s.isFounder) {
          if (isMobile || isPaidOrAd) {
            s.isFounder = false;
            unflaggedSessionsCount++;
            modified = true;
          } else if (s.screenResolution === "3440x1440") {
            s.isFounder = true;
          }
        }
      }
      if (modified) {
        await setSystemConfig(SUMMARY_CONFIG_KEY, summary as unknown as Record<string, unknown>);
      }
    }

    // 3. Scan and un-flag raw telemetry events in Firestore
    try {
      const snap = await firestoreDb.collection(TELEMETRY_COLLECTION).get();
      const batchPromises: Promise<any>[] = [];

      snap.forEach((doc) => {
        const data = doc.data();
        if (data && (data.is_founder === true || data.isFounder === true)) {
          const isMobile =
            data.deviceType === "mobile" ||
            (data.screenResolution && parseInt(String(data.screenResolution).split("x")[0] || "0", 10) < 768);
          const isPaidOrAd = Boolean(
            data.gclid ||
            data.fbclid ||
            data.utmCampaign ||
            (data.utmSource && ["google", "meta", "facebook", "instagram"].includes(String(data.utmSource).toLowerCase())) ||
            (data.utmMedium && ["cpc", "paid", "social"].includes(String(data.utmMedium).toLowerCase()))
          );

          if (isMobile || isPaidOrAd) {
            unflaggedEventsCount++;
            batchPromises.push(
              doc.ref.update({
                is_founder: false,
                isFounder: false,
              })
            );
          }
        }
      });

      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
      }
    } catch (firestoreErr) {
      console.warn("[Unflag Founder Sessions] Firestore scan notice:", firestoreErr);
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up founder flags. Un-flagged ${unflaggedSessionsCount} sessions and ${unflaggedEventsCount} raw events that were mobile or paid ad traffic. Founder 3440x1440 desktop test sessions preserved.`,
      unflaggedSessionsCount,
      unflaggedEventsCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error un-flagging founder sessions";
    console.error("[Unflag Founder Sessions Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
