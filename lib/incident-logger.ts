import crypto from "crypto";
import { getSystemConfig, firestoreDb } from "./firebase-admin";
import { SystemIncident } from "./types";

export interface LogIncidentParams {
  type: "STRIPE" | "IMAGE_GEN" | "HANDWRYTTEN" | "WEBHOOK" | "SYSTEM";
  category?: "OPERATOR_ACTION" | "STUDIO_BILLING" | "CUSTOMER_RECOVERED" | "TRANSIENT";
  severity?: "error" | "warning" | "info";
  summary: string;
  technicalDetails?: string | unknown;
  metadata?: Record<string, unknown>;
}
export interface IncidentAlertSink {
  deliver(input: { incident: SystemIncident; toEmail: string }): Promise<{ success: boolean; error?: string }>;
}

let injectedAlertSink: IncidentAlertSink | null = null;
/** Test seam for an in-memory sink; passing null restores the production dispatcher. */
export function setIncidentAlertSinkForTesting(sink: IncidentAlertSink | null): void {
  injectedAlertSink = sink;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(sk_live_[a-zA-Z0-9]+)/g, "sk_live_[REDACTED]"],
  [/(sk_test_[a-zA-Z0-9]+)/g, "sk_test_[REDACTED]"],
  [/(mk_[a-zA-Z0-9]+)/g, "mk_[REDACTED]"],
  [/(whsec_[a-zA-Z0-9]+)/g, "whsec_[REDACTED]"],
  [/(AIzaSy[a-zA-Z0-9_-]+)/g, "AIzaSy[REDACTED]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REDACTED]"],
  [/\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g, "[PHONE REDACTED]"],
];
function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).slice(0, 6000);
}
function safeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/address|email|phone|first.?name|last.?name|handwritten|message|prompt|street|zip|postal/i.test(key)) continue;
    if (typeof value === "string") safe[key] = redactText(value.slice(0, 500));
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key] = value;
  }
  if (typeof safe.operationId !== "string") {
    const inheritedId = safe.correlationId ?? safe.providerEventId ?? safe.requestId;
    if (typeof inheritedId === "string") safe.operationId = inheritedId;
  }
  return safe;
}
function deriveGroupKey(params: LogIncidentParams, safeSummary: string): string | undefined {
  const explicit = params.metadata?.groupingKey;
  if (typeof explicit === "string" && explicit.trim()) return `${params.type}:${explicit.trim().slice(0, 160)}`;
  // Fallback groups repeated, normalized provider failure classes, not individual request IDs.
  const normalized = safeSummary
    .replace(/\b(?:order|paymentintent|pi|op|req|trace)[_:# -]?[a-z0-9_-]{5,}\b/gi, "[ID]")
    .replace(/\b\d{4,}\b/g, "[N]")
    .replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length >= 8 ? `${params.type}:${normalized}`.slice(0, 220) : undefined;
}

async function deliverAlert(incident: SystemIncident, toEmail: string) {
  if (injectedAlertSink) return injectedAlertSink.deliver({ incident, toEmail });
  const { sendIncidentAlertEmail } = await import("./email-alerts");
  return sendIncidentAlertEmail({ incident, toEmail });
}

/** Store redacted diagnostics, coalesce repeated operation failures, and dispatch through the configured alert sink. */
export async function logIncident(params: LogIncidentParams): Promise<string> {
  const details = typeof params.technicalDetails === "string"
    ? params.technicalDetails
    : params.technicalDetails ? JSON.stringify(params.technicalDetails) : "";
  const summary = redactText(params.summary);
  const metadata = safeMetadata(params.metadata);
  const now = Date.now();
  const groupingKey = deriveGroupKey(params, summary);
  const groupId = groupingKey ? `inc_group_${crypto.createHash("sha256").update(groupingKey).digest("hex").slice(0, 32)}` : undefined;
  const collection = firestoreDb.collection("system_incidents");
  let incident: SystemIncident;
  let id = groupId || `inc_${now}_${Math.random().toString(36).substring(2, 7)}`;
  let isNewIncident = true;

  if (groupId) {
    const groupReference = firestoreDb.collection("system_incident_groups").doc(groupId);
    const nextIncidentId = `${groupId}_${now}_${Math.random().toString(36).slice(2, 8)}`;
    incident = await firestoreDb.runTransaction(async (tx: any) => {
      const groupSnapshot = await tx.get(groupReference);
      const groupState = groupSnapshot.exists ? groupSnapshot.data() as { activeIncidentId?: string } : {};
      const activeReference = groupState.activeIncidentId ? collection.doc(groupState.activeIncidentId) : null;
      const activeSnapshot = activeReference ? await tx.get(activeReference) : null;
      const current = activeSnapshot?.exists ? activeSnapshot.data() as SystemIncident & { occurrenceCount?: number; correlatedOperationIds?: string[]; correlatedOperationKeys?: string[]; lastSeenAt?: number; lifecycleStatus?: string } : null;
      const occurrenceKey = typeof metadata.operationId === "string" ? metadata.operationId : undefined;
      if (current && !current.resolved) {
        isNewIncident = false;
        if (occurrenceKey && current.correlatedOperationKeys?.includes(occurrenceKey)) return current;
        const operationId = occurrenceKey;
        const ids = [...new Set([...(current.correlatedOperationIds || []), ...(operationId ? [operationId] : [])])].slice(-20);
        const keys = [...new Set([...(current.correlatedOperationKeys || []), ...(occurrenceKey ? [occurrenceKey] : [])])].slice(-100);
        const updated = { ...current, occurrenceCount: (current.occurrenceCount || 1) + 1, lastSeenAt: now, correlatedOperationIds: ids, correlatedOperationKeys: keys };
        tx.set(activeReference, updated);
        return updated;
      }
      const created: any = {
        id: nextIncidentId,
        groupId,
        groupKey: groupingKey,
        type: params.type,
        ...(params.category ? { category: params.category } : {}),
        severity: params.severity || "error",
        summary,
        ...(details ? { technicalDetails: redactText(details) } : {}),
        metadata,
        resolved: false,
        lifecycleStatus: "open",
        occurrenceCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(occurrenceKey ? { correlatedOperationIds: [occurrenceKey], correlatedOperationKeys: [occurrenceKey] } : { correlatedOperationIds: [], correlatedOperationKeys: [] }),
        createdAt: now,
      };
      tx.set(collection.doc(created.id), created);
      tx.set(groupReference, { groupId, activeIncidentId: created.id, updatedAt: now });
      id = created.id;
      return created;
    });
    id = incident.id;
  } else {
    incident = {
      id,
      type: params.type,
      ...(params.category ? { category: params.category } : {}),
      severity: params.severity || "error",
      summary,
      ...(details ? { technicalDetails: redactText(details) } : {}),
      metadata,
      resolved: false,
      createdAt: now,
    };
    await collection.doc(id).set(incident);
  }

  console.error(`[Incident Logged] [${incident.type}] ${incident.summary} (ID: ${id})`);
  const alertConfig = await getSystemConfig<{ alertEmail?: string }>("alerts");
  if (alertConfig?.alertEmail && incident.severity === "error" && isNewIncident) {
    try {
      const delivery = await deliverAlert(incident, alertConfig.alertEmail);
      await collection.doc(id).update({
        alertDelivery: delivery.success ? "verified" : "failed",
        alertDeliveredAt: delivery.success ? Date.now() : undefined,
        alertDeliveryError: delivery.error ? redactText(delivery.error) : undefined,
      } as any);
    } catch (error) {
      const message = error instanceof Error ? redactText(error.message) : "Alert delivery failed";
      await collection.doc(id).update({ alertDelivery: "failed", alertDeliveryError: message } as any).catch(() => {});
      console.warn("[Incident Logger] Notice sending alert:", message);
    }
  }
  return id;
}
