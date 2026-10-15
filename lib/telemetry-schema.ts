import { TelemetryEventName } from "./types";

/**
 * Authority Events that represent financial or fulfillment truth.
 * Browser/client telemetry is strictly forbidden from emitting these.
 */
export const AUTHORITY_EVENTS = new Set<string>([
  "payment_succeeded",
  "purchase_verified",
  "fulfillment_submitted",
  "fulfillment_failed",
]);

/**
 * Evaluates whether an event name represents an authority event.
 * Checks against the explicit set and adheres to the naming rule:
 * fulfillment_*, purchase_*, payment-success-like names.
 */
export function isAuthorityEvent(eventName: string): boolean {
  if (AUTHORITY_EVENTS.has(eventName)) return true;
  if (eventName.startsWith("fulfillment_")) return true;
  if (eventName.startsWith("purchase_")) return true;
  if (/^(payment|order)_succeed(ed)?$/i.test(eventName)) return true;
  if (/^payment_success$/i.test(eventName)) return true;
  return false;
}

/**
 * Allowed client/browser event names.
 */
export const ALLOWED_BROWSER_EVENT_NAMES = new Set<TelemetryEventName>([
  "session_start",
  "landing_viewed",
  "builder_started",
  "scenario_landing_viewed",
  "scenario_customized",
  "agent_url_prefilled",
  "cover_preset_selected",
  "card_completed",
  "ai_generate_started",
  "ai_generate_succeeded",
  "ai_generate_rate_limited",
  "custom_generation_requested",
  "custom_generation_completed",
  "custom_generation_failed",
  "step_navigated",
  "inside_note_edited",
  "inspiration_applied",
  "note_shuffled",
  "font_style_selected",
  "note_completed",
  "address_completed",
  "checkout_initiated",
  "payment_viewed",
  "wallet_availability_observed",
  "payment_attempted",
  "payment_canceled",
  "payment_failed",
  "reminder_opt_in",
  "card_abandoned",
  // Granular 7-Stage Funnel Events:
  "step_1_landed",
  "step_2_cover_ready",
  "step_3_note_typed",
  "step_4a_address_viewed",
  "step_4b_address_completed",
  "step_5_checkout_initiated",
  "step_6_paid_order",
  "starter_prompt_used",
  "default_template_loaded",
]);

export type AllowedFieldType = "string" | "number" | "boolean";

export interface FieldRule {
  type: AllowedFieldType;
  maxLength?: number;
}

/**
 * Common metadata keys allowed on all events.
 */
export const COMMON_METADATA_RULES: Record<string, FieldRule> = {
  experienceVersion: { type: "string", maxLength: 50 },
  draftRevision: { type: "number" },
  elapsedMs: { type: "number" },
  in_app_browser: { type: "boolean" },
  used_address_deferral: { type: "boolean" },
  last_validation_error: { type: "string", maxLength: 200 },
  noteEdited: { type: "boolean" },
  isDirty: { type: "boolean" },
  is_founder: { type: "boolean" },
  isFounder: { type: "boolean" },
  clientId: { type: "string", maxLength: 100 },
};

/**
 * Per-event metadata allowlist schemas.
 * Only primitive types (string, number, boolean) with explicit max lengths.
 * Unknown keys and non-primitives are dropped.
 */
export const EVENT_METADATA_SCHEMAS: Record<string, Record<string, FieldRule>> = {
  session_start: {
    experience: { type: "string", maxLength: 50 },
    scenarioSlug: { type: "string", maxLength: 100 },
  },
  landing_viewed: {
    entryRoute: { type: "string", maxLength: 100 },
    source: { type: "string", maxLength: 50 },
    occasion: { type: "string", maxLength: 50 },
  },
  builder_started: {
    startingMode: { type: "string", maxLength: 50 },
    occasion: { type: "string", maxLength: 50 },
  },
  scenario_landing_viewed: {
    scenarioSlug: { type: "string", maxLength: 100 },
  },
  scenario_customized: {
    scenarioSlug: { type: "string", maxLength: 100 },
  },
  agent_url_prefilled: {
    occasion: { type: "string", maxLength: 50 },
    hasPrinted: { type: "boolean" },
    hasNote: { type: "boolean" },
    hasRecipient: { type: "boolean" },
  },
  cover_preset_selected: {
    presetId: { type: "string", maxLength: 100 },
    occasion: { type: "string", maxLength: 50 },
    title: { type: "string", maxLength: 100 },
  },
  card_completed: {
    cardType: { type: "string", maxLength: 50 },
    presetId: { type: "string", maxLength: 100 },
    occasion: { type: "string", maxLength: 50 },
  },
  ai_generate_started: {
    occasion: { type: "string", maxLength: 50 },
    style: { type: "string", maxLength: 50 },
  },
  ai_generate_succeeded: {
    occasion: { type: "string", maxLength: 50 },
    durationMs: { type: "number" },
  },
  ai_generate_rate_limited: {
    reason: { type: "string", maxLength: 100 },
    errorCode: { type: "string", maxLength: 50 },
  },
  custom_generation_requested: {
    occasion: { type: "string", maxLength: 50 },
    style: { type: "string", maxLength: 50 },
  },
  custom_generation_completed: {
    occasion: { type: "string", maxLength: 50 },
    durationMs: { type: "number" },
  },
  custom_generation_failed: {
    reason: { type: "string", maxLength: 100 },
    errorCode: { type: "string", maxLength: 50 },
    durationMs: { type: "number" },
  },
  step_navigated: {
    fromStep: { type: "number" },
    toStep: { type: "number" },
  },
  inside_note_edited: {
    charCount: { type: "number" },
    hasContent: { type: "boolean" },
  },
  inspiration_applied: {
    occasion: { type: "string", maxLength: 50 },
    tone: { type: "string", maxLength: 50 },
  },
  note_shuffled: {
    occasion: { type: "string", maxLength: 50 },
    tone: { type: "string", maxLength: 50 },
  },
  font_style_selected: {
    fontId: { type: "string", maxLength: 50 },
    fontName: { type: "string", maxLength: 100 },
    cohort: { type: "string", maxLength: 50 },
  },
  note_completed: {
    charCount: { type: "number" },
    fontId: { type: "string", maxLength: 50 },
    hasPrintedGreeting: { type: "boolean" },
  },
  address_completed: {
    hasReturnAddress: { type: "boolean" },
    isInternational: { type: "boolean" },
  },
  checkout_initiated: {
    orderId: { type: "string", maxLength: 100 },
    amount: { type: "number" },
  },
  payment_viewed: {
    methodCategory: { type: "string", maxLength: 50 },
    hasWallet: { type: "boolean" },
  },
  wallet_availability_observed: {
    applePay: { type: "boolean" },
    googlePay: { type: "boolean" },
    browserCategory: { type: "string", maxLength: 50 },
  },
  payment_attempted: {
    paymentMethodType: { type: "string", maxLength: 50 },
    attemptId: { type: "string", maxLength: 100 },
  },
  payment_canceled: {
    attemptId: { type: "string", maxLength: 100 },
    stage: { type: "string", maxLength: 50 },
  },
  payment_failed: {
    attemptId: { type: "string", maxLength: 100 },
    errorCategory: { type: "string", maxLength: 50 },
  },
  reminder_opt_in: {
    optIn: { type: "boolean" },
    occasion: { type: "string", maxLength: 50 },
  },
  card_abandoned: {
    lastStep: { type: "number" },
    reason: { type: "string", maxLength: 50 },
  },
  // Granular 7-Stage Funnel Schemas:
  step_1_landed: {
    landingPath: { type: "string", maxLength: 100 },
    in_app_browser: { type: "boolean" },
    autoSelected: { type: "boolean" },
    auto_selected: { type: "boolean" },
  },
  step_2_cover_ready: {
    presetId: { type: "string", maxLength: 100 },
    occasion: { type: "string", maxLength: 50 },
    title: { type: "string", maxLength: 100 },
    autoSelected: { type: "boolean" },
    auto_selected: { type: "boolean" },
    in_app_browser: { type: "boolean" },
  },
  default_template_loaded: {
    charCount: { type: "number" },
    occasion: { type: "string", maxLength: 50 },
    scenarioSlug: { type: "string", maxLength: 100 },
    noteEdited: { type: "boolean" },
    in_app_browser: { type: "boolean" },
  },
  step_3_note_typed: {
    charCount: { type: "number" },
    fontId: { type: "string", maxLength: 50 },
    usedStarterPrompt: { type: "boolean" },
    noteEdited: { type: "boolean" },
    isDirty: { type: "boolean" },
    inputField: { type: "string", maxLength: 50 },
    in_app_browser: { type: "boolean" },
  },
  step_4a_address_viewed: {
    in_app_browser: { type: "boolean" },
    last_validation_error: { type: "string", maxLength: 200 },
  },
  step_4b_address_completed: {
    used_address_deferral: { type: "boolean" },
    in_app_browser: { type: "boolean" },
    hasReturnAddress: { type: "boolean" },
  },
  step_5_checkout_initiated: {
    orderId: { type: "string", maxLength: 100 },
    amount: { type: "number" },
    used_address_deferral: { type: "boolean" },
    in_app_browser: { type: "boolean" },
  },
  step_6_paid_order: {
    orderId: { type: "string", maxLength: 100 },
    amountInCents: { type: "number" },
    in_app_browser: { type: "boolean" },
    used_address_deferral: { type: "boolean" },
  },
  starter_prompt_used: {
    promptLabel: { type: "string", maxLength: 100 },
    occasion: { type: "string", maxLength: 50 },
    promptNumber: { type: "number" },
    in_app_browser: { type: "boolean" },
  },
  // Server-only authority event schemas (for recordServerTelemetry)
  purchase_verified: {
    orderId: { type: "string", maxLength: 100 },
    paymentIntentId: { type: "string", maxLength: 100 },
    amountInCents: { type: "number" },
    customerType: { type: "string", maxLength: 50 },
  },
  fulfillment_submitted: {
    orderId: { type: "string", maxLength: 100 },
    handwryttenOrderId: { type: "string", maxLength: 100 },
  },
  fulfillment_failed: {
    orderId: { type: "string", maxLength: 100 },
    errorCategory: { type: "string", maxLength: 100 },
  },
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Sanitizes an event's metadata according to its allowlist schema.
 * - Unknown keys are dropped.
 * - Nested objects and arrays are rejected/dropped so no personal values can be stored.
 * - String values are stripped of emails and length-bounded.
 */
export function sanitizeMetadata(
  eventName: string,
  rawMetadata: unknown
): { sanitized: Record<string, unknown>; error?: string } {
  if (rawMetadata === undefined || rawMetadata === null) {
    return { sanitized: {} };
  }

  if (typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return { sanitized: {}, error: "Metadata must be a plain object" };
  }

  const raw = rawMetadata as Record<string, unknown>;
  const eventRules = EVENT_METADATA_SCHEMAS[eventName] || {};
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    // If value is a nested object or array, drop it
    if (value !== null && typeof value === "object") {
      continue;
    }

    const rule = eventRules[key] || COMMON_METADATA_RULES[key];
    if (!rule) {
      // Unknown key dropped
      continue;
    }

    if (rule.type === "string") {
      if (typeof value === "string") {
        // Strip any email pattern
        const stripped = value.replace(new RegExp(EMAIL_REGEX, "g"), "").trim();
        const maxLen = rule.maxLength || 100;
        sanitized[key] = stripped.slice(0, maxLen);
      }
    } else if (rule.type === "number") {
      if (typeof value === "number" && Number.isFinite(value)) {
        sanitized[key] = value;
      }
    } else if (rule.type === "boolean") {
      if (typeof value === "boolean") {
        sanitized[key] = value;
      }
    }
  }

  return { sanitized };
}

/**
 * Sanitizes URLs and paths to origin + pathname only.
 * Strips query strings (?...) and hashes (#...) to prevent leaking PII, receipt tokens, etc.
 */
export function sanitizeUrlOrPath(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Absolute URL
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      // Fallback: take portion before ? or #
      return trimmed.split(/[?#]/)[0];
    }
  }

  // Relative path
  const withoutQueryOrHash = trimmed.split(/[?#]/)[0];
  if (!withoutQueryOrHash) return "/";
  return withoutQueryOrHash.startsWith("/") ? withoutQueryOrHash : `/${withoutQueryOrHash}`;
}

/**
 * Sanitizes attribution parameters (UTMs, gclid, fbclid).
 * Only allowlisted keys are retained; bounded in length and stripped of any email patterns.
 */
export function sanitizeAttribution(raw: unknown, maxLength = 100): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Strip anything resembling an email
  const stripped = trimmed.replace(new RegExp(EMAIL_REGEX, "g"), "").trim();
  if (!stripped) return undefined;

  return stripped.slice(0, maxLength);
}

/**
 * Validates device type.
 */
export function validateDeviceType(raw: unknown): "mobile" | "tablet" | "desktop" | undefined {
  if (raw === "mobile" || raw === "tablet" || raw === "desktop") {
    return raw;
  }
  return undefined;
}

/**
 * Validates and sanitizes screen resolution string (e.g. "390x844").
 */
export function sanitizeScreenResolution(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const match = raw.trim().match(/^(\d{2,5})x(\d{2,5})$/);
  return match ? match[0] : undefined;
}

/**
 * Validates and sanitizes Google Client ID (e.g. "GA1.1.123456789.1690000000").
 */
export function sanitizeGoogleClientId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (/^GA\d\.\d\.\d+\.\d+$/.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}
