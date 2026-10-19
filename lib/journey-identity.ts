/**
 * lib/journey-identity.ts
 *
 * Implements session, anonymous visitor, and resumable journey identity
 * adhering to lib/contracts/admin-overhaul.ts:
 * - 30-minute inactivity session rotation (SESSION_INACTIVITY_WINDOW_MS)
 * - Resumable journey & draft correlation
 * - Resilient fallback to memory when storage throws (Safari private mode, quotas)
 * - Classification provenance (customer, founder, staff, synthetic, known_bot, unresolved)
 * - Global Privacy Control (GPC) & consent resolution
 *
 * Reference: SPRINT-0003-T02
 */

import {
  ClassificationProvenance,
  ConsentState,
  TrafficRole,
} from "./contracts/admin-overhaul";

export const SESSION_INACTIVITY_WINDOW_MS = 30 * 60 * 1000;
export const REPORTING_POLICY_VERSION = "2026.10-v2";

export const SMN_SESSION_V2_KEY = "smn_session_v2";
export const SMN_ANON_ID_V2_KEY = "smn_anon_id_v2";
export const SMN_JOURNEY_V2_KEY = "smn_journey_v2";
export const SMN_CONSENT_KEY = "smn_privacy_consent";
export const SMN_DRAFT_JOURNEY_PREFIX = "smn_draft_journey_";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StoredSessionV2 {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
}

export interface JourneyIdentity {
  sessionId: string;
  anonymousId: string;
  journeyId: string;
  isNewSession: boolean;
  degradedIdentity: boolean;
}

export interface GetJourneyIdentityOptions {
  nowMs?: number;
  draftId?: string;
  resumedFromDraft?: boolean;
  storage?: StorageLike;
  sessionOverride?: string;
  anonymousOverride?: string;
  journeyOverride?: string;
}

// In-memory fallback stores for environments with disabled/throwing storage
const inMemorySessionStore = new Map<string, string>();
const inMemoryDraftJourneyMap = new Map<string, string>();

/**
 * Safe in-memory storage proxy that implements StorageLike.
 */
class MemoryStorage implements StorageLike {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

/**
 * Creates an ID with a given prefix, timestamp, and random suffix.
 */
function generateIdentityId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Detects whether storage is functional or throwing.
 */
function isStorageAvailable(storage: StorageLike | undefined): boolean {
  if (!storage) return false;
  try {
    const testKey = "__smn_storage_probe__";
    storage.setItem(testKey, "probe");
    const val = storage.getItem(testKey);
    if (typeof storage.removeItem === "function") {
      storage.removeItem(testKey);
    }
    return val === "probe";
  } catch {
    return false;
  }
}

/**
 * Obtains safe storage or returns an in-memory fallback, tracking degraded identity.
 */
function resolveStorage(customStorage?: StorageLike): { storage: StorageLike; degraded: boolean } {
  if (customStorage) {
    if (isStorageAvailable(customStorage)) {
      return { storage: customStorage, degraded: false };
    }
    return { storage: new MemoryStorage(), degraded: true };
  }

  if (typeof window === "undefined") {
    return { storage: new MemoryStorage(), degraded: true };
  }

  try {
    if (window.localStorage && isStorageAvailable(window.localStorage)) {
      return { storage: window.localStorage, degraded: false };
    }
  } catch {
    // localStorage threw or access denied
  }

  try {
    if (window.sessionStorage && isStorageAvailable(window.sessionStorage)) {
      return { storage: window.sessionStorage, degraded: false };
    }
  } catch {
    // sessionStorage threw
  }

  return { storage: new MemoryStorage(), degraded: true };
}

/**
 * Core Journey Identity Resolver.
 *
 * Implements:
 * 1. 30-minute inactivity session rotation:
 *    If `nowMs - lastActivityAt > SESSION_INACTIVITY_WINDOW_MS`, rotates to a new
 *    `sessionId`, while preserving persistent `anonymousId` and active `journeyId`.
 * 2. Correlation with draftId when resuming a card.
 * 3. Graceful degradation when storage is blocked/throws.
 */
export function getOrCreateJourneyIdentity(options?: GetJourneyIdentityOptions): JourneyIdentity {
  const nowMs = options?.nowMs ?? Date.now();
  const { storage, degraded } = resolveStorage(options?.storage);
  let degradedIdentity = degraded;

  // 1. Resolve Anonymous ID (Persistent visitor identity across sessions)
  let anonymousId = options?.anonymousOverride;
  if (!anonymousId) {
    try {
      const storedAnon = storage.getItem(SMN_ANON_ID_V2_KEY);
      if (storedAnon && storedAnon.trim().length > 0) {
        anonymousId = storedAnon.trim();
      } else {
        anonymousId = generateIdentityId("anon");
        storage.setItem(SMN_ANON_ID_V2_KEY, anonymousId);
      }
    } catch {
      degradedIdentity = true;
      anonymousId = inMemorySessionStore.get(SMN_ANON_ID_V2_KEY) || generateIdentityId("anon");
      inMemorySessionStore.set(SMN_ANON_ID_V2_KEY, anonymousId);
    }
  }

  // 2. Resolve Journey ID (Active card creation / checkout lifecycle)
  let journeyId = options?.journeyOverride;
  if (!journeyId && options?.draftId) {
    // Check if this draft is already bound to a journey
    journeyId = getDraftBoundJourneyId(options.draftId, storage) || undefined;
  }

  if (!journeyId) {
    try {
      const storedJourney = storage.getItem(SMN_JOURNEY_V2_KEY);
      if (storedJourney && storedJourney.trim().length > 0) {
        journeyId = storedJourney.trim();
      } else {
        journeyId = generateIdentityId("jny");
        storage.setItem(SMN_JOURNEY_V2_KEY, journeyId);
      }
    } catch {
      degradedIdentity = true;
      journeyId = inMemorySessionStore.get(SMN_JOURNEY_V2_KEY) || generateIdentityId("jny");
      inMemorySessionStore.set(SMN_JOURNEY_V2_KEY, journeyId);
    }
  }

  // If a draftId is provided, ensure draft is bound to this journeyId
  if (options?.draftId && journeyId) {
    bindJourneyToDraft(options.draftId, journeyId, storage);
  }

  // 3. Resolve Session ID (30-minute inactivity boundary)
  let sessionId = options?.sessionOverride;
  let isNewSession = false;

  if (sessionId) {
    // Explicit session override provided
    try {
      storage.setItem(
        SMN_SESSION_V2_KEY,
        JSON.stringify({ sessionId, startedAt: nowMs, lastActivityAt: nowMs })
      );
    } catch {
      degradedIdentity = true;
    }
  } else {
    try {
      const rawSession = storage.getItem(SMN_SESSION_V2_KEY);
      if (rawSession) {
        const parsed: StoredSessionV2 = JSON.parse(rawSession);
        const inactiveDuration = nowMs - parsed.lastActivityAt;

        if (inactiveDuration > SESSION_INACTIVITY_WINDOW_MS) {
          // Session expired due to inactivity (>30 mins): rotate sessionId
          sessionId = generateIdentityId("sess");
          isNewSession = true;
          storage.setItem(
            SMN_SESSION_V2_KEY,
            JSON.stringify({ sessionId, startedAt: nowMs, lastActivityAt: nowMs })
          );
        } else {
          // Active session: extend lastActivityAt
          sessionId = parsed.sessionId;
          storage.setItem(
            SMN_SESSION_V2_KEY,
            JSON.stringify({
              sessionId: parsed.sessionId,
              startedAt: parsed.startedAt,
              lastActivityAt: nowMs,
            })
          );
        }
      } else {
        // No existing session: start brand new session
        sessionId = generateIdentityId("sess");
        isNewSession = true;
        storage.setItem(
          SMN_SESSION_V2_KEY,
          JSON.stringify({ sessionId, startedAt: nowMs, lastActivityAt: nowMs })
        );
      }
    } catch {
      degradedIdentity = true;
      const memSession = inMemorySessionStore.get(SMN_SESSION_V2_KEY);
      if (memSession) {
        try {
          const parsed = JSON.parse(memSession);
          if (nowMs - parsed.lastActivityAt > SESSION_INACTIVITY_WINDOW_MS) {
            sessionId = generateIdentityId("sess");
            isNewSession = true;
          } else {
            sessionId = parsed.sessionId;
          }
        } catch {
          sessionId = generateIdentityId("sess");
          isNewSession = true;
        }
      } else {
        sessionId = generateIdentityId("sess");
        isNewSession = true;
      }
      inMemorySessionStore.set(
        SMN_SESSION_V2_KEY,
        JSON.stringify({ sessionId, startedAt: nowMs, lastActivityAt: nowMs })
      );
    }
  }

  return {
    sessionId: sessionId || generateIdentityId("sess"),
    anonymousId,
    journeyId,
    isNewSession,
    degradedIdentity,
  };
}

/**
 * Binds a draft ID to a specific journey ID for resume correlation.
 */
export function bindJourneyToDraft(
  draftId: string,
  journeyId?: string,
  customStorage?: StorageLike
): void {
  if (!draftId) return;
  const targetJourneyId = journeyId || getOrCreateJourneyIdentity({ storage: customStorage }).journeyId;
  const key = `${SMN_DRAFT_JOURNEY_PREFIX}${draftId}`;

  const { storage } = resolveStorage(customStorage);
  try {
    storage.setItem(key, targetJourneyId);
  } catch {
    inMemoryDraftJourneyMap.set(key, targetJourneyId);
  }
}

/**
 * Retrieves the journey ID linked to a given draft ID, if any.
 */
export function getDraftBoundJourneyId(
  draftId: string,
  customStorage?: StorageLike
): string | null {
  if (!draftId) return null;
  const key = `${SMN_DRAFT_JOURNEY_PREFIX}${draftId}`;
  const { storage } = resolveStorage(customStorage);
  try {
    const val = storage.getItem(key);
    if (val && val.trim().length > 0) return val.trim();
  } catch {
    // fallback to memory
  }
  return inMemoryDraftJourneyMap.get(key) || null;
}

/**
 * Resumes a journey from an existing draft ID.
 * Returns the correlated journeyId or creates a fresh identity if none was stored.
 */
export function resumeJourneyFromDraft(
  draftId: string,
  options?: GetJourneyIdentityOptions
): JourneyIdentity {
  const boundJourneyId = getDraftBoundJourneyId(draftId, options?.storage);
  return getOrCreateJourneyIdentity({
    ...options,
    draftId,
    resumedFromDraft: true,
    journeyOverride: boundJourneyId || undefined,
  });
}

/**
 * Classifies traffic provenance according to reporting policy.
 * NEVER classifies traffic as founder based on screen resolution (e.g. 3440x1440) or IP!
 * Separates traffic role from payment mode.
 */
export function classifyTrafficProvenance(params?: {
  isFounderFlag?: boolean;
  isStaffFlag?: boolean;
  isBot?: boolean;
  userAgent?: string;
  queryOverride?: string;
  explicitOverride?: boolean;
}): ClassificationProvenance {
  const isFounder = Boolean(params?.isFounderFlag);
  const isStaff = Boolean(params?.isStaffFlag);
  const isBot = Boolean(params?.isBot);
  const ua = (params?.userAgent || "").toLowerCase();

  if (params?.explicitOverride && params.queryOverride) {
    const roleCandidate = params.queryOverride.toLowerCase();
    if (
      roleCandidate === "customer" ||
      roleCandidate === "founder" ||
      roleCandidate === "staff" ||
      roleCandidate === "synthetic" ||
      roleCandidate === "known_bot"
    ) {
      return {
        role: roleCandidate as TrafficRole,
        reason: "explicit_operator_override",
        version: REPORTING_POLICY_VERSION,
        explicitOverride: true,
      };
    }
  }

  if (isFounder) {
    return {
      role: "founder",
      reason: "explicit_founder_flag",
      version: REPORTING_POLICY_VERSION,
      explicitOverride: false,
    };
  }

  if (isStaff) {
    return {
      role: "staff",
      reason: "explicit_staff_flag",
      version: REPORTING_POLICY_VERSION,
      explicitOverride: false,
    };
  }

  if (
    isBot ||
    /bot|crawler|spider|googlebot|bingbot|yandex|baidu|slurp|duckduckgo|semrush|ahrefs|lighthouse|headless|facebookexternalhit|whatsapp|twitterbot|pingdom|uptimerobot/i.test(
      ua
    )
  ) {
    return {
      role: "known_bot",
      reason: "user_agent_known_crawler",
      version: REPORTING_POLICY_VERSION,
      explicitOverride: false,
    };
  }

  if (ua.includes("playwright") || ua.includes("cypress") || ua.includes("puppeteer")) {
    return {
      role: "synthetic",
      reason: "automated_test_user_agent",
      version: REPORTING_POLICY_VERSION,
      explicitOverride: false,
    };
  }

  return {
    role: "customer",
    reason: "standard_visitor_session",
    version: REPORTING_POLICY_VERSION,
    explicitOverride: false,
  };
}

/**
 * Resolves visitor consent and Global Privacy Control (GPC) state.
 *
 * Rules:
 * - If navigator.globalPrivacyControl === true or secGpcHeader === "1", returns "gpc_restricted".
 * - If stored consent preference is "denied" or "opt_out", returns "denied".
 * - If stored consent preference is "granted", returns "granted".
 * - Otherwise, returns "not_required" for strictly necessary first-party operational diagnostics.
 */
export function resolveConsentState(params?: {
  gpc?: boolean;
  secGpcHeader?: string | null;
  storedConsent?: string | null;
  storage?: StorageLike;
}): ConsentState {
  // 1. Check GPC (Global Privacy Control)
  if (params?.gpc === true || params?.secGpcHeader === "1") {
    return "gpc_restricted";
  }

  if (typeof navigator !== "undefined") {
    const nav = navigator as unknown as { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl === true) {
      return "gpc_restricted";
    }
  }

  // 2. Check stored consent
  let consentVal = params?.storedConsent;
  if (!consentVal) {
    const { storage } = resolveStorage(params?.storage);
    try {
      consentVal = storage.getItem(SMN_CONSENT_KEY);
    } catch {
      // ignore
    }
  }

  if (consentVal === "denied" || consentVal === "opt_out") {
    return "denied";
  }
  if (consentVal === "granted") {
    return "granted";
  }

  return "not_required";
}
