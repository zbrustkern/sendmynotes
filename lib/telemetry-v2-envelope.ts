/**
 * Browser-safe Event V2 envelope builder. Keep server persistence imports out of this module.
 */
import { EventV2Envelope, EventV2Name, EventSourceAuthority, EventEnvironment, ClassificationProvenance, ConsentState, ExperimentExposure } from "./contracts/admin-overhaul";
import { classifyTrafficProvenance, resolveConsentState } from "./journey-identity";
import { sanitizeUrlOrPath } from "./telemetry-schema";

export interface BuildEnvelopeParams<T = Record<string, unknown>> {
  event_name: EventV2Name | string;
  properties?: T;
  event_id?: string;
  occurred_at?: number;
  session_id?: string;
  anonymous_id?: string;
  journey_id?: string;
  order_id?: string;
  payment_attempt_id?: string;
  request_id?: string;
  trace_id?: string;
  route_template?: string;
  experience_version?: string;
  attribution_snapshot_id?: string;
  experiment_exposures?: ExperimentExposure[];
  degraded_identity?: boolean;
  classification?: ClassificationProvenance;
  consent_state?: ConsentState;
  source?: EventSourceAuthority;
  environment?: EventEnvironment;
  secGpcHeader?: string | null;
  userAgent?: string;
  isFounderFlag?: boolean;
  isStaffFlag?: boolean;
}

/**
 * Builds a runtime-validated EventV2Envelope.
 */
export function buildEventV2Envelope<T = Record<string, unknown>>(
  params: BuildEnvelopeParams<T>
): EventV2Envelope<T> {
  const occurred_at = params.occurred_at || Date.now();
  const received_at = Date.now();
  const clock_skew_ms = received_at - occurred_at;

  const event_id =
    params.event_id && params.event_id.trim().length > 0
      ? params.event_id.trim()
      : `evt_v2_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  const classification =
    params.classification ||
    classifyTrafficProvenance({
      isFounderFlag: params.isFounderFlag,
      isStaffFlag: params.isStaffFlag,
      userAgent: params.userAgent,
    });

  const consent_state =
    params.consent_state ||
    resolveConsentState({
      secGpcHeader: params.secGpcHeader,
    });

  const env =
    params.environment ||
    (process.env.NODE_ENV === "production"
      ? "production"
      : process.env.NODE_ENV === "test"
      ? "test"
      : "development");

  const build_sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "local-build";

  return {
    event_id,
    event_name: params.event_name,
    schema_version: "v2.0",
    occurred_at,
    received_at,
    environment: env,
    source: params.source || "browser",
    session_id: params.session_id,
    anonymous_id: params.anonymous_id,
    journey_id: params.journey_id,
    order_id: params.order_id,
    payment_attempt_id: params.payment_attempt_id,
    request_id: params.request_id,
    trace_id: params.trace_id,
    build_sha,
    experience_version: params.experience_version || "candidate_v1",
    route_template: sanitizeUrlOrPath(params.route_template) || "/",
    classification,
    consent_state,
    attribution_snapshot_id: params.attribution_snapshot_id,
    experiment_exposures: params.experiment_exposures,
    degraded_identity: params.degraded_identity ?? false,
    clock_skew_ms,
    properties: (params.properties || {}) as T,
  };
}
