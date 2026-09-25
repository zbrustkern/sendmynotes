import { getSystemConfig, firestoreDb } from "./firebase-admin";
import { SystemIncident } from "./types";

export interface LogIncidentParams {
  type: "STRIPE" | "IMAGE_GEN" | "HANDWRYTTEN" | "WEBHOOK" | "SYSTEM";
  severity?: "error" | "warning" | "info";
  summary: string;
  technicalDetails?: string | unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Centrally records system errors, third-party API rejections, and checkout issues.
 * Sanitizes credentials before persisting to Firestore, and checks alert subscriptions.
 */
export async function logIncident(params: LogIncidentParams): Promise<string> {
  const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const techStr =
    typeof params.technicalDetails === "string"
      ? params.technicalDetails
      : params.technicalDetails
      ? JSON.stringify(params.technicalDetails, null, 2)
      : "";

  // Sanitize any accidentally leaked keys in technicalDetails
  const sanitizedDetails = techStr
    .replace(/(sk_live_[a-zA-Z0-9]+)/g, "sk_live_[REDACTED]")
    .replace(/(mk_[a-zA-Z0-9]+)/g, "mk_[REDACTED]")
    .replace(/(whsec_[a-zA-Z0-9]+)/g, "whsec_[REDACTED]")
    .replace(/(AIzaSy[a-zA-Z0-9_-]+)/g, "AIzaSy[REDACTED]");

  const incident: SystemIncident = {
    id,
    type: params.type,
    severity: params.severity || "error",
    summary: params.summary,
    ...(sanitizedDetails ? { technicalDetails: sanitizedDetails } : {}),
    metadata: params.metadata || {},
    resolved: false,
    createdAt: Date.now(),
  };

  try {
    await firestoreDb.collection("system_incidents").doc(id).set(incident);
    console.error(`[Incident Logged] [${incident.type}] ${incident.summary} (ID: ${id})`);

    // Check if an alert subscriber email is registered
    const alertConfig = await getSystemConfig<{ alertEmail?: string }>("alerts");
    if (alertConfig?.alertEmail) {
      console.log(
        `[Alert Notification Ready] Subscriber: ${alertConfig.alertEmail} | Incident: ${id}`
      );
    }
  } catch (err) {
    console.error("[Incident Logger] Failed to save incident to Firestore:", err);
  }

  return id;
}
