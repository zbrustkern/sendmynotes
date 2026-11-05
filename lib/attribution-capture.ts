import type { ConsentState } from "./contracts/admin-overhaul";
import type { StorageLike, JourneyIdentity } from "./journey-identity";
import { getOrCreateJourneyIdentity, SMN_SESSION_V2_KEY } from "./journey-identity";
import {
  ATTRIBUTION_CLASSIFIER_VERSION,
  ATTRIBUTION_SCHEMA_VERSION,
  FIRST_OBSERVED_TOUCH_STORAGE_KEY,
  FIRST_OBSERVED_WINDOW_MS,
  SESSION_TOUCH_STORAGE_KEY,
  type AttributionClassification,
  type AttributionMissingReason,
  type AttributionSnapshotV2,
  type AttributionTouchV2,
} from "./attribution-contract";
import { classifyAttributionEvidence } from "./attribution-classifier";
import { sanitizeUrlOrPath } from "./telemetry-schema";

const MEMORY = new Map<string, string>();
const MEMORY_STORAGE: StorageLike = {
  getItem: (key) => MEMORY.get(key) ?? null,
  setItem: (key, value) => { MEMORY.set(key, value); },
  removeItem: (key) => { MEMORY.delete(key); },
};

export interface AttributionCaptureLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface AttributionCaptureOptions {
  /** Current route and query. Query values are allowlisted by this module. */
  url: string;
  pathname: string;
  /** The caller must omit this on SPA transitions. */
  documentReferrer?: string;
  documentEntry: boolean;
  consentState: ConsentState;
  nowMs?: number;
  storage?: StorageLike;
  storagePersistent?: boolean;
  identityResolver?: () => JourneyIdentity;
  locks?: AttributionCaptureLocks;
  origin?: string;
  touchIdFactory?: () => string;
}

function browserStorage(): { storage: StorageLike; persistent: boolean } {
  if (typeof window === "undefined") return { storage: MEMORY_STORAGE, persistent: false };
  for (const key of ["localStorage", "sessionStorage"] as const) {
    try {
      const candidate = window[key];
      const probe = "__smn_attr_probe_" + Math.random().toString(36).slice(2);
      candidate.setItem(probe, "1");
      candidate.removeItem(probe);
      return { storage: candidate, persistent: true };
    } catch {
      // Try the same storage fallback order used by journey identity.
    }
  }
  return { storage: MEMORY_STORAGE, persistent: false };
}

function stableTouchId(sessionId: string, classification: AttributionClassification, landingPath: string, referrerHost?: string): string {
  const input = JSON.stringify([sessionId, classification.channel, classification.source ?? null, classification.medium ?? null, classification.campaign ?? null, landingPath, referrerHost ?? null]);
  let left = 2166136261;
  let right = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    left = Math.imul(left ^ input.charCodeAt(i), 16777619) >>> 0;
    right = Math.imul(right ^ input.charCodeAt(i), 2246822519) >>> 0;
  }
  return "att_" + left.toString(36) + "_" + right.toString(36);
}

function safePath(pathname: string): string | undefined {
  const sanitized = sanitizeUrlOrPath(pathname);
  if (!sanitized || !sanitized.startsWith("/") || sanitized.includes("..")) return undefined;
  return sanitized.slice(0, 200);
}

function safeReferrerHost(referrer: string | undefined, origin: string | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    if (origin && parsed.origin === origin) return undefined;
    return parsed.hostname.toLowerCase().replace(/\.$/, "").slice(0, 253) || undefined;
  } catch {
    return undefined;
  }
}

function param(params: URLSearchParams, key: string, max: number): string | undefined {
  const value = params.get(key)?.trim();
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return undefined;
  return value;
}

function validGoogleClickId(value: string | undefined): boolean {
  return Boolean(value && value.length <= 255 && /^[A-Za-z0-9._~-]+$/.test(value));
}

function readJson(storage: StorageLike, key: string): AttributionTouchV2 | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as AttributionTouchV2;
    if (!value || typeof value !== "object" || typeof value.touchId !== "string" || typeof value.channel !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

function persistJson(storage: StorageLike, key: string, value: AttributionTouchV2): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function persistedJourneySessionId(storage: StorageLike): string | undefined {
  try {
    const raw = storage.getItem(SMN_SESSION_V2_KEY);
    if (!raw) return undefined;
    const record = JSON.parse(raw) as { sessionId?: unknown };
    return typeof record.sessionId === "string" && record.sessionId ? record.sessionId : undefined;
  } catch {
    return undefined;
  }
}

function withoutEntry(persistence: AttributionSnapshotV2["persistence"], reason: AttributionMissingReason): AttributionSnapshotV2 {
  return {
    schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
    classifierVersion: ATTRIBUTION_CLASSIFIER_VERSION,
    firstObservedTouch: null,
    currentSessionTouch: null,
    firstObservedMissingReason: reason,
    currentSessionMissingReason: reason,
    persistence,
  };
}

function classifyEntry(params: URLSearchParams, referrerHost: string | undefined, entryObserved: boolean): AttributionClassification {
  const googleClick = ["gclid", "wbraid", "gbraid"].some((key) => validGoogleClickId(param(params, key, 255)));
  const metaClick = Boolean(param(params, "fbclid", 255));
  const emailClick = Boolean(param(params, "email_click_id", 255) || param(params, "emailClickId", 255));
  return classifyAttributionEvidence({
    source: param(params, "utm_source", 100),
    medium: param(params, "utm_medium", 100),
    campaign: param(params, "utm_campaign", 100),
    content: param(params, "utm_content", 100),
    term: param(params, "utm_term", 100),
    referrerHost,
    hasGoogleClickId: googleClick,
    hasMetaClickId: metaClick,
    hasEmailClickId: emailClick,
    entryObservation: entryObserved ? "complete" : "missing",
  });
}

function createTouch(
  classification: AttributionClassification,
  sessionId: string,
  nowMs: number,
  pathname: string,
  touchIdFactory: (() => string) | undefined,
  referrerHost?: string
): AttributionTouchV2 {
  const landingPath = safePath(pathname);
  return {
    ...classification,
    touchId: touchIdFactory?.() ?? stableTouchId(sessionId, classification, landingPath ?? "/", referrerHost),
    sessionId,
    observedAtClientMs: nowMs,
    expiresAt: null,
    clockQuality: "client_unanchored",
    ...(landingPath ? { landingPath } : {}),
    ...(referrerHost ? { referrerHost } : {}),
  };
}

function getIdentitySafely(resolve: () => JourneyIdentity, storage: StorageLike): { identity?: JourneyIdentity; consistent: boolean } {
  let identity: JourneyIdentity | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { identity = resolve(); } catch { return { consistent: false }; }
    const storedSessionId = persistedJourneySessionId(storage);
    if (!storedSessionId || storedSessionId === identity.sessionId) return { identity, consistent: true };
  }
  // Cross-tab updates can interleave non-atomic get/set cycles in the shared
  // session store. A mismatch is explicitly unresolved; it is never repaired
  // by inventing a second session identifier here.
  return { identity, consistent: false };
}

export async function captureAttributionSnapshotV2(options: AttributionCaptureOptions): Promise<AttributionSnapshotV2> {
  const resolvedStorage = options.storage ? { storage: options.storage, persistent: options.storagePersistent ?? true } : browserStorage();
  const storage = resolvedStorage.storage;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs! : Date.now();
  if (options.consentState === "denied" || options.consentState === "gpc_restricted") {
    try { storage.removeItem?.(FIRST_OBSERVED_TOUCH_STORAGE_KEY); } catch { /* consent gate still suppresses reads */ }
    try { storage.removeItem?.(SESSION_TOUCH_STORAGE_KEY); } catch { /* consent gate still suppresses reads */ }
    try { MEMORY_STORAGE.removeItem?.(FIRST_OBSERVED_TOUCH_STORAGE_KEY); } catch { /* ignore */ }
    try { MEMORY_STORAGE.removeItem?.(SESSION_TOUCH_STORAGE_KEY); } catch { /* ignore */ }
    return withoutEntry("not_attempted", options.consentState === "denied" ? "consent_denied" : "gpc_restricted");
  }

  const run = async (): Promise<AttributionSnapshotV2> => {
    const resolveIdentity = options.identityResolver ?? (() => getOrCreateJourneyIdentity());
    const resolvedIdentity = getIdentitySafely(resolveIdentity, storage);
    if (!resolvedIdentity.consistent || !resolvedIdentity.identity) return withoutEntry("unavailable", "session_unavailable");
    const identity = resolvedIdentity.identity;
    const oldFirst = readJson(storage, FIRST_OBSERVED_TOUCH_STORAGE_KEY);
    const firstObservedAt = oldFirst?.observedAtClientMs ?? nowMs;
    const firstIsFresh = Boolean(oldFirst && typeof oldFirst.expiresAt === "number" && oldFirst.expiresAt > nowMs && oldFirst.expiresAt <= firstObservedAt + FIRST_OBSERVED_WINDOW_MS);
    if (oldFirst && !firstIsFresh) {
      try { storage.removeItem?.(FIRST_OBSERVED_TOUCH_STORAGE_KEY); } catch { /* keep the bounded new touch below */ }
    }
    const firstTouch = firstIsFresh ? oldFirst : null;
    const savedSessionTouch = readJson(storage, SESSION_TOUCH_STORAGE_KEY);
    let currentTouch = savedSessionTouch?.sessionId === identity.sessionId ? savedSessionTouch : null;
    let missingReason: AttributionMissingReason | undefined;

    if (!currentTouch) {
      let params: URLSearchParams;
      try { params = new URL(options.url, options.origin || "https://sendmynotes.invalid").searchParams; }
      catch { return withoutEntry("unavailable", "invalid_evidence"); }
      const hasCampaignEvidence = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "wbraid", "gbraid", "fbclid", "email_click_id", "emailClickId"].some((key) => Boolean(params.get(key)?.trim()));
      const mayObserveDocument = options.documentEntry;
      const entryObserved = mayObserveDocument || (hasCampaignEvidence && identity.isNewSession);
      const referrerHost = mayObserveDocument ? safeReferrerHost(options.documentReferrer, options.origin) : undefined;
      const classification = classifyEntry(params, referrerHost, entryObserved);
      if (classification.channel === "unknown") {
        missingReason = entryObserved ? "invalid_evidence" : "entry_not_observed";
      } else if (entryObserved || identity.isNewSession) {
        currentTouch = createTouch(classification, identity.sessionId, nowMs, options.pathname, options.touchIdFactory, referrerHost);
      } else {
        missingReason = "entry_not_observed";
      }
    }

    let firstObservedTouch = firstTouch;
    let firstObservedMissingReason: AttributionMissingReason | undefined;
    let storageWriteFailed = false;
    if (!firstObservedTouch && currentTouch) {
      const clientObservedAt = currentTouch.observedAtClientMs;
      const expiresAt = (clientObservedAt ?? nowMs) + FIRST_OBSERVED_WINDOW_MS;
      if (expiresAt > nowMs) {
        firstObservedTouch = { ...currentTouch, expiresAt };
        if (!persistJson(storage, FIRST_OBSERVED_TOUCH_STORAGE_KEY, firstObservedTouch)) {
          persistJson(MEMORY_STORAGE, FIRST_OBSERVED_TOUCH_STORAGE_KEY, firstObservedTouch);
          storageWriteFailed = true;
          firstObservedMissingReason = "storage_unavailable";
        }
      } else {
        firstObservedMissingReason = "expired";
      }
    }

    if (currentTouch && currentTouch !== savedSessionTouch) {
      if (!persistJson(storage, SESSION_TOUCH_STORAGE_KEY, currentTouch)) {
        persistJson(MEMORY_STORAGE, SESSION_TOUCH_STORAGE_KEY, currentTouch);
        storageWriteFailed = true;
        missingReason = "storage_unavailable";
      }
    }
    // A post-write read detects a racing tab without assuming localStorage
    // compare-and-swap semantics. Identical entry evidence converges to the
    // same stable touch ID; conflicting evidence is left unknown.
    if (currentTouch) {
      const persistedTouch = readJson(storage, SESSION_TOUCH_STORAGE_KEY);
      if (persistedTouch?.sessionId === currentTouch.sessionId && persistedTouch.touchId !== currentTouch.touchId) {
        currentTouch = null;
        missingReason = "invalid_evidence";
        try { storage.removeItem?.(SESSION_TOUCH_STORAGE_KEY); } catch { /* report unknown rather than guess */ }
      } else if (persistedTouch?.sessionId === currentTouch.sessionId) {
        currentTouch = persistedTouch;
      }
    }
    if (!firstTouch && firstObservedTouch) {
      const persistedFirst = readJson(storage, FIRST_OBSERVED_TOUCH_STORAGE_KEY);
      if (persistedFirst && persistedFirst.touchId !== firstObservedTouch.touchId) {
        firstObservedTouch = null;
        firstObservedMissingReason = "legacy_touch_role_unknown";
        try { storage.removeItem?.(FIRST_OBSERVED_TOUCH_STORAGE_KEY); } catch { /* report unknown rather than guess */ }
      } else if (persistedFirst) {
        firstObservedTouch = persistedFirst;
      }
    }
    const persistedSessionId = persistedJourneySessionId(storage);
    if (currentTouch && persistedSessionId && persistedSessionId !== currentTouch.sessionId) {
      currentTouch = null;
      missingReason = "session_unavailable";
    }
    const persistence = resolvedStorage.persistent && !storageWriteFailed ? "persistent" : "memory_only";
    if (!firstObservedTouch) firstObservedMissingReason ??= missingReason ?? "entry_not_observed";
    return {
      schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
      classifierVersion: ATTRIBUTION_CLASSIFIER_VERSION,
      firstObservedTouch: firstObservedTouch ?? null,
      currentSessionTouch: currentTouch ?? null,
      ...(firstObservedMissingReason ? { firstObservedMissingReason } : {}),
      ...(missingReason ? { currentSessionMissingReason: missingReason } : {}),
      persistence,
    };
  };

  const locks = options.locks ?? (typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: AttributionCaptureLocks }).locks : undefined);
  if (locks?.request) return locks.request("smn_attribution_v2_capture", run);
  return run();
}

export function readAttributionSnapshotV2(
  storage: StorageLike,
  sessionId: string,
  nowMs = Date.now(),
  persistence: AttributionSnapshotV2["persistence"] = "persistent"
): AttributionSnapshotV2 | null {
  const storedFirst = readJson(storage, FIRST_OBSERVED_TOUCH_STORAGE_KEY);
  const memoryFirst = storage === MEMORY_STORAGE ? null : readJson(MEMORY_STORAGE, FIRST_OBSERVED_TOUCH_STORAGE_KEY);
  const first = storedFirst ?? memoryFirst;
  const freshFirst = first && typeof first.expiresAt === "number" && first.expiresAt > nowMs ? first : null;
  const storedSession = readJson(storage, SESSION_TOUCH_STORAGE_KEY);
  const memorySession = storage === MEMORY_STORAGE ? null : readJson(MEMORY_STORAGE, SESSION_TOUCH_STORAGE_KEY);
  const session = storedSession ?? memorySession;
  const current = session?.sessionId === sessionId ? session : null;
  if (!freshFirst && !current) return null;
  const memoryFallbackUsed = Boolean((!storedFirst && !!freshFirst && freshFirst === memoryFirst) || (!storedSession && !!current && current === memorySession));
  return {
    schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
    classifierVersion: ATTRIBUTION_CLASSIFIER_VERSION,
    firstObservedTouch: freshFirst,
    currentSessionTouch: current,
    ...(!freshFirst ? { firstObservedMissingReason: first ? "expired" : "entry_not_observed" } : {}),
    ...(!current ? { currentSessionMissingReason: "entry_not_observed" } : {}),
    persistence: memoryFallbackUsed ? "memory_only" : persistence,
  };
}

export function getAttributionStorageForBrowser(): { storage: StorageLike; persistent: boolean } {
  return browserStorage();
}
