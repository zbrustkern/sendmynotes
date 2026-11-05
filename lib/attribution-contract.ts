/**
 * Canonical acquisition attribution contract. This contract is additive: the
 * existing flat OrderAttribution fields remain available to Meta, Google Ads,
 * admin, and older readers while V2 keeps first-observed and checkout-session
 * evidence separate.
 */

export const ATTRIBUTION_SCHEMA_VERSION = 2 as const;
export const ATTRIBUTION_CLASSIFIER_VERSION = "2026-11-05.1" as const;
export const FIRST_OBSERVED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export const FIRST_OBSERVED_TOUCH_STORAGE_KEY = "smn_first_touch_v2";
export const SESSION_TOUCH_STORAGE_KEY = "smn_session_touch_v2";

export type AttributionChannel =
  | "paid_search"
  | "paid_social"
  | "paid_other"
  | "paid_unknown"
  | "organic_search"
  | "social_referral"
  | "referral"
  | "email"
  | "other_campaign"
  | "direct_observed"
  | "unknown";

/** Six quiet top-level groups; granular channel detail remains available below. */
export type AttributionGroup =
  | "paid"
  | "organic_search"
  | "social_referral"
  | "email_other"
  | "direct_observed"
  | "unknown";

export type AttributionGroupFilter = "all" | AttributionGroup;

export const ATTRIBUTION_GROUP_LABELS: Readonly<Record<AttributionGroup, string>> = {
  paid: "Paid",
  organic_search: "Organic Search",
  social_referral: "Social & Referral",
  email_other: "Email & Other Campaign",
  direct_observed: "Direct / No Referrer",
  unknown: "Unknown",
};

export type AttributionReason =
  | "explicit_paid_medium"
  | "google_click_untyped"
  | "meta_click_unverified_paid"
  | "organic_campaign"
  | "search_referrer"
  | "social_referrer"
  | "email_campaign"
  | "referral_campaign"
  | "other_campaign_tags"
  | "direct_observed"
  | "legacy_direct_sentinel"
  | "legacy_organic_sentinel"
  | "legacy_ambiguous"
  | "no_entry_observation"
  | "collection_restricted"
  | "storage_unavailable"
  | "invalid_evidence"
  | "conflicting_evidence";

export type AttributionProvenance =
  | "utm"
  | "click_id"
  | "external_referrer"
  | "observed_no_referrer"
  | "legacy_adapter"
  | "conflict"
  | "unknown";

export type AttributionMissingReason =
  | "consent_denied"
  | "gpc_restricted"
  | "entry_not_observed"
  | "session_unavailable"
  | "storage_unavailable"
  | "expired"
  | "invalid_evidence"
  | "legacy_touch_role_unknown";

export type AttributionClockQuality = "client_unanchored" | "server_anchored" | "legacy_unknown";

export interface AttributionClassifierInput {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  /** Hostname only; never pass or retain a full referrer URL. */
  referrerHost?: string | null;
  hasGoogleClickId?: boolean;
  hasMetaClickId?: boolean;
  hasEmailClickId?: boolean;
  /** `complete` means collection ran and inspected all permitted entry inputs. */
  entryObservation?: "complete" | "missing" | "legacy";
}

export interface AttributionClassification {
  channel: AttributionChannel;
  group: AttributionGroup;
  provenance: AttributionProvenance;
  reason: AttributionReason;
  /** Sanitized, bounded labels; raw URLs and opaque click IDs are excluded. */
  source?: string;
  medium?: string;
  campaign?: string;
}

export interface AttributionTouchV2 extends AttributionClassification {
  touchId: string;
  sessionId: string | null;
  observedAtClientMs: number | null;
  observedAtServerMs?: number | null;
  expiresAt: number | null;
  clockQuality: AttributionClockQuality;
  landingPath?: string;
  referrerHost?: string;
}

export interface AttributionSnapshotV2 {
  schemaVersion: typeof ATTRIBUTION_SCHEMA_VERSION;
  classifierVersion: string;
  /** First eligible entry observed in a fixed, maximum 90-day window. */
  firstObservedTouch: AttributionTouchV2 | null;
  /** Entry touch bound to lib/journey-identity.ts's current sessionId. */
  currentSessionTouch: AttributionTouchV2 | null;
  firstObservedMissingReason?: AttributionMissingReason;
  currentSessionMissingReason?: AttributionMissingReason;
  persistence: "persistent" | "memory_only" | "unavailable" | "not_attempted";
  /** Set only by the server when this snapshot is frozen for a new order. */
  snapshotStage?: "checkout_started";
  snapshotCapturedAtServerMs?: number;
}

/** Legacy report rows are normalized at read time and must not gain V2 roles. */
export interface LegacyAttributionEvidence {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  referrer?: string | null;
  capturedAt?: number | null;
  hasGoogleClickId?: boolean;
  hasMetaClickId?: boolean;
  hasEmailClickId?: boolean;
  /** Legacy `(direct/organic)` is ambiguous unless the matching sentinel exists. */
  observedEntry?: boolean;
}

