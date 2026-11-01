import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb } from "@/lib/firebase-admin";
import { getOperationalControls, previewOperationalControl } from "@/lib/operational-controls";
import { RELIABILITY_RETENTION_POLICY } from "@/lib/reliability-policy";
import { readBoundedCollection, readBoundedQuery, boundedCoverage } from "@/lib/bounded-admin-read";

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [open, incidents, outbox, controls] = await Promise.all([
      readBoundedQuery(firestoreDb.collection("system_incidents").where("resolved", "==", false)),
      readBoundedCollection(firestoreDb.collection("system_incidents")),
      readBoundedCollection(firestoreDb.collection("transactional_outbox")),
      getOperationalControls(),
    ]);
    const queued = outbox.docs.map((doc: any) => doc.data()).filter((entry: any) => ["pending", "leased", "failed", "dead_letter"].includes(entry.status));
    const oldestQueuedAt = queued.reduce((oldest: number | null, entry: any) => Math.min(oldest ?? Infinity, Number(entry.createdAt) || Infinity), null as number | null);
    const probe = await firestoreDb.collection("reliability_checks").doc("synthetic").get();
    const check = probe.exists ? probe.data() as { checkedAt?: number; succeededAt?: number; latencyMs?: number; errorRate?: number; coverage?: number } : null;
    const currentTime = Date.now();
    const checkTimesValid = Boolean(check?.checkedAt && check.succeededAt && check.succeededAt <= check.checkedAt && check.checkedAt <= currentTime && check.succeededAt <= currentTime);
    const isRecent = Boolean(checkTimesValid && check?.succeededAt && currentTime - check.succeededAt < 5 * 60_000);
    const health = isRecent && check?.coverage === 1 && check.errorRate === 0 ? "healthy" : "unknown";
    const previews = await Promise.all((Object.keys(controls) as Array<keyof typeof controls>).map(previewOperationalControl));
    return NextResponse.json({
      generatedAt: Date.now(),
      sourceCoverage: boundedCoverage(open, incidents, outbox),
      health: { status: health, checkedAt: check?.checkedAt ?? null, lastSuccessAt: check?.succeededAt ?? null, latencyMs: check?.latencyMs ?? null, errorRate: check?.errorRate ?? null, coverage: check?.coverage ?? null, evidence: check ? "synthetic_probe" : "none" },
      incidents: { openCount: open.size, currentHistoryCount: incidents.size, historyLimit: incidents.readLimit, historyTruncated: incidents.truncated },
      consumers: { status: outbox.truncated ? "partial" : queued.length ? "degraded" : "unknown", queuedCount: queued.length, queuedCountPartial: outbox.truncated, oldestQueuedAt, lagMs: oldestQueuedAt === null ? null : Date.now() - oldestQueuedAt, workerSuccessAt: null, evidence: "outbox_state_only" },
      controls,
      controlPreviews: previews,
      alertDelivery: { configured: Boolean((await firestoreDb.collection("system_config").doc("alerts").get()).data()?.alertEmail), verified: false, status: "unverified" },
      retention: { ...RELIABILITY_RETENTION_POLICY, status: "prepared_not_active" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read reliability state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
