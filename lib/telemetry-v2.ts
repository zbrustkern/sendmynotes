/**
 * lib/telemetry-v2.ts
 *
 * Implements Event V2 Envelope building, runtime ingestion, deduplication,
 * clock skew diagnostics, collector metrics, and observed milestone bridging.
 *
 * Reference: SPRINT-0003-T01, T03, T04
 * Contracts: lib/contracts/admin-overhaul.ts
 */

import { firestoreDb } from "./firebase-admin";
import {
  EventV2Envelope,
  EventV2Name,
  EventSourceAuthority,
  EventEnvironment,
  ClassificationProvenance,
  ConsentState,
  ExperimentExposure,
  computeEventDedupeKey,
  isBrowserAllowedEventV2,
} from "./contracts/admin-overhaul";

export { computeEventDedupeKey };
import {
  isAuthorityEvent,
  sanitizeMetadata,
  sanitizeUrlOrPath,
} from "./telemetry-schema";
import {
  classifyTrafficProvenance,
  resolveConsentState,
} from "./journey-identity";
import { ingestTelemetryEvent } from "./metrics-rollup";
import { TelemetryEvent, TelemetryEventName } from "./types";

export const TELEMETRY_V2_COLLECTION = "telemetry_events_v2";
export const TELEMETRY_V2_DIAGNOSTICS_DOC = "telemetry_v2_diagnostics";
export const SYSTEM_CONFIG_COLLECTION = "system_config";

export interface TelemetryCollectorDiagnostics {
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  degradedIdentityCount: number;
  gpcRestrictedCount: number;
  clockSkewCount: number;
  lastUpdated: number;
}

const emptyDiagnostics = (): TelemetryCollectorDiagnostics => ({
  acceptedCount: 0,
  duplicateCount: 0,
  rejectedCount: 0,
  rejectionReasons: {},
  degradedIdentityCount: 0,
  gpcRestrictedCount: 0,
  clockSkewCount: 0,
  lastUpdated: Date.now(),
});

export { buildEventV2Envelope } from "./telemetry-v2-envelope";

/** Reads durable collector counters; failures propagate rather than returning process-local guesses. */
export async function getTelemetryCollectorDiagnostics(): Promise<TelemetryCollectorDiagnostics> {
  const snap = await firestoreDb.collection(SYSTEM_CONFIG_COLLECTION).doc(TELEMETRY_V2_DIAGNOSTICS_DOC).get();
  return snap.exists ? { ...emptyDiagnostics(), ...(snap.data() as Partial<TelemetryCollectorDiagnostics>) } : emptyDiagnostics();
}

/** Atomically increments durable diagnostics across collector instances. */
async function updateCollectorDiagnostics(update: (current: TelemetryCollectorDiagnostics) => void): Promise<void> {
  const ref = firestoreDb.collection(SYSTEM_CONFIG_COLLECTION).doc(TELEMETRY_V2_DIAGNOSTICS_DOC);
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const current = snap.exists
      ? { ...emptyDiagnostics(), ...(snap.data() as Partial<TelemetryCollectorDiagnostics>) }
      : emptyDiagnostics();
    update(current);
    current.lastUpdated = Date.now();
    tx.set(ref, current);
  });
}

export async function recordTelemetryCollectorRejection(reasonCategory: string): Promise<void> {
  await updateCollectorDiagnostics((current) => {
    current.rejectedCount++;
    current.rejectionReasons[reasonCategory] = (current.rejectionReasons[reasonCategory] || 0) + 1;
  });
}

export async function recordTelemetryCollectorDuplicate(_eventName: string): Promise<void> {
  await updateCollectorDiagnostics((current) => { current.duplicateCount++; });
}

export async function recordTelemetryCollectorSuccess(
  _eventName: string,
  meta?: { degradedIdentity?: boolean; gpcRestricted?: boolean; clockSkew?: boolean }
): Promise<void> {
  await updateCollectorDiagnostics((current) => {
    current.acceptedCount++;
    if (meta?.degradedIdentity) current.degradedIdentityCount++;
    if (meta?.gpcRestricted) current.gpcRestrictedCount++;
    if (meta?.clockSkew) current.clockSkewCount++;
  });
}

/** Test-only reset helper; production ingestion never calls this. */
export async function resetTelemetryCollectorDiagnostics(): Promise<void> {
  await firestoreDb.collection(SYSTEM_CONFIG_COLLECTION).doc(TELEMETRY_V2_DIAGNOSTICS_DOC).set(emptyDiagnostics());
}

export interface IngestEventV2Result {
  accepted: boolean;
  duplicate?: boolean;
  eventId: string;
  dedupeKey: string;
  clockSkewMs?: number;
  error?: string;
  quarantined?: boolean;
}

/**
 * Ingests an Event V2 envelope with deduplication, authority validation,
 * metadata sanitization, and milestone bridging.
 */
export async function ingestEventV2(
  envelope: EventV2Envelope,
  options?: { isServerAuthority?: boolean }
): Promise<IngestEventV2Result> {
  if (!envelope || typeof envelope !== "object") {
    await recordTelemetryCollectorRejection("invalid_payload");
    return { accepted: false, eventId: "", dedupeKey: "", error: "Payload must be an object" };
  }

  if (!envelope.event_name || typeof envelope.event_name !== "string") {
    await recordTelemetryCollectorRejection("missing_event_name");
    return { accepted: false, eventId: "", dedupeKey: "", error: "Missing event_name" };
  }

  // 1. Authority Check
  const isServer = Boolean(options?.isServerAuthority || envelope.source === "server");
  if (!isServer) {
    if (isAuthorityEvent(envelope.event_name) || !isBrowserAllowedEventV2(envelope.event_name)) {
      await recordTelemetryCollectorRejection("browser_authority_rejected");
      return {
        accepted: false,
        eventId: envelope.event_id || "",
        dedupeKey: "",
        error: "Forbidden: Authority events cannot be ingested via browser telemetry",
      };
    }
  }

  // 2. Compute Deduplication Key
  const dedupeKey = computeEventDedupeKey({
    event_id: envelope.event_id,
    event_name: envelope.event_name,
    occurred_at: envelope.occurred_at,
    session_id: envelope.session_id,
    order_id: envelope.order_id,
  });

  // 4. Sanitize Properties (Drop prohibited PII, email, tokens)
  const { sanitized: sanitizedProperties } = sanitizeMetadata(
    envelope.event_name,
    envelope.properties
  );
  envelope.properties = sanitizedProperties;

  // 5. Clock Skew Diagnostics
  const now = Date.now();
  const clockSkewMs = now - (envelope.occurred_at || now);
  envelope.clock_skew_ms = clockSkewMs;
  envelope.received_at = now;
  const isSkewed = Math.abs(clockSkewMs) > 5 * 60 * 1000;

  // 6. Atomically persist with create-if-absent semantics. A persistence error
  // must fail ingestion so the caller can retry instead of claiming acceptance.
  const eventRef = firestoreDb.collection(TELEMETRY_V2_COLLECTION).doc(dedupeKey);
  const inserted = await firestoreDb.runTransaction(async (transaction: any) => {
    const existingDoc = await transaction.get(eventRef);
    if (existingDoc.exists) return false;
    transaction.set(eventRef, envelope);
    return true;
  });
  if (!inserted) {
    await recordTelemetryCollectorDuplicate(envelope.event_name);
    return {
      accepted: true,
      duplicate: true,
      eventId: envelope.event_id,
      dedupeKey,
      clockSkewMs,
    };
  }

  // 7. Update Collector Diagnostics
  await recordTelemetryCollectorSuccess(envelope.event_name, {
    degradedIdentity: envelope.degraded_identity,
    gpcRestricted: envelope.consent_state === "gpc_restricted",
    clockSkew: isSkewed,
  });

  // 8. Bridge to Legacy Telemetry / Metrics Rollup ONLY for True Observed Milestones
  // CRITICAL (SPRINT-0003-AC01):
  // Opening a step, cover_loaded, and note_template_loaded MUST NOT complete note or address!
  try {
    await bridgeV2ToLegacy(envelope);
  } catch (bridgeErr) {
    console.warn("[Telemetry V2] Non-fatal notice bridging to legacy funnel:", bridgeErr);
  }

  return {
    accepted: true,
    duplicate: false,
    eventId: envelope.event_id,
    dedupeKey,
    clockSkewMs,
  };
}

/**
 * Bridges observed v2 milestones to legacy funnel events strictly according to SPRINT-0003-AC01.
 */
async function bridgeV2ToLegacy(envelope: EventV2Envelope): Promise<void> {
  const sessionId = envelope.session_id || "unknown_session";
  const properties = (envelope.properties || {}) as Record<string, unknown>;

  let legacyEventName: TelemetryEventName | null = null;
  let legacyStep: number | undefined = undefined;
  const metadata: Record<string, unknown> = { ...properties };

  switch (envelope.event_name) {
    case "entry_viewed":
      legacyEventName = "landing_viewed";
      legacyStep = 1;
      break;

    case "builder_engaged":
      legacyEventName = "builder_started";
      legacyStep = 1;
      break;

    case "cover_loaded":
      // AC01: Automatic cover load records stage 2 readiness but NEVER implies deliberate selection
      legacyEventName = "step_2_cover_ready";
      legacyStep = 1;
      metadata.autoSelected = true;
      break;

    case "cover_selected":
      // Explicit deliberate selection by user
      legacyEventName = "cover_preset_selected";
      legacyStep = 1;
      break;

    case "note_template_loaded":
      // AC01: Automatic note template load records template loaded but NEVER completes note step
      legacyEventName = "default_template_loaded";
      legacyStep = 2;
      metadata.noteEdited = false;
      break;

    case "note_edit_started":
      legacyEventName = "inside_note_edited";
      legacyStep = 2;
      break;

    case "note_confirmed":
      // User explicitly confirms note step
      legacyEventName = "note_completed";
      legacyStep = 2;
      metadata.noteEdited = Boolean(properties.wasEdited ?? properties.noteEdited);
      break;

    case "address_viewed":
      legacyEventName = "step_4a_address_viewed";
      legacyStep = 3;
      break;

    case "address_confirmed":
      legacyEventName = "address_completed";
      legacyStep = 3;
      break;

    case "address_deferred":
      legacyEventName = "address_completed";
      legacyStep = 3;
      metadata.used_address_deferral = true;
      break;

    case "checkout_requested":
      legacyEventName = "checkout_initiated";
      legacyStep = 4;
      break;

    case "payment_confirmation_observed":
      legacyEventName = "payment_confirmation_observed";
      legacyStep = 4;
      break;

    default:
      // Other events are not mapped to funnel aggregate milestones
      break;
  }

  if (legacyEventName) {
    const legacyDoc: TelemetryEvent = {
      id: envelope.event_id,
      eventName: legacyEventName,
      sessionId,
      step: legacyStep,
      orderId: envelope.order_id,
      metadata,
      path: envelope.route_template || "/",
      timestamp: envelope.occurred_at,
      createdAt: envelope.received_at,
      experienceVersion: envelope.experience_version,
      isFounder: envelope.classification?.role === "founder",
      is_founder: envelope.classification?.role === "founder",
    };

    await ingestTelemetryEvent(legacyDoc);
  }
}

/**
 * Classifies an event name for funnel milestone mapping.
 * Verifies SPRINT-0003-AC01: cover_loaded and note_template_loaded do not mark note or address completion.
 */
export function classifyMilestone(
  eventName: string
): "note_completed" | "address_completed" | "paid" | null {
  if (eventName === "cover_loaded" || eventName === "note_template_loaded") {
    return null;
  }
  if (eventName === "note_confirmed") return "note_completed";
  if (eventName === "address_confirmed" || eventName === "address_deferred") return "address_completed";
  if (eventName === "payment_captured") return "paid";
  return null;
}
