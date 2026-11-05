import assert from "node:assert/strict";
import type { ConsentState } from "../lib/contracts/admin-overhaul";
import {
  captureAttributionSnapshotV2,
  readAttributionSnapshotV2,
  type AttributionCaptureLocks,
} from "../lib/attribution-capture";
import {
  FIRST_OBSERVED_TOUCH_STORAGE_KEY,
  FIRST_OBSERVED_WINDOW_MS,
  SESSION_TOUCH_STORAGE_KEY,
} from "../lib/attribution-contract";
import {
  getOrCreateJourneyIdentity,
  SMN_SESSION_V2_KEY,
  type JourneyIdentity,
  type StorageLike,
} from "../lib/journey-identity";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const granted: ConsentState = "granted";
async function runAttributionCaptureTests() {
let nowMs = 1_000_000;
const storage = new MemoryStorage();
const resolveIdentity = () => getOrCreateJourneyIdentity({ storage, nowMs });
const base = {
  pathname: "/send",
  consentState: granted,
  storage,
  storagePersistent: true,
  identityResolver: resolveIdentity,
  origin: "https://sendmynotes.com",
  nowMs,
};

const initial = await captureAttributionSnapshotV2({
  ...base,
  url: "/send?utm_source=google&utm_medium=cpc&utm_campaign=Launch-A&gclid=opaque-click",
  documentEntry: true,
  documentReferrer: "https://www.google.com/search?q=private",
  touchIdFactory: () => "touch-first",
});
const initialTouch = initial.currentSessionTouch!;
assert.equal(initialTouch.channel, "paid_search");
assert.equal(initialTouch.sessionId, getOrCreateJourneyIdentity({ storage, nowMs }).sessionId, "the snapshot uses journey-identity's session");
assert.equal(initialTouch.source, "google");
assert.equal(initialTouch.medium, "cpc");
assert.equal(initialTouch.campaign, "Launch-A", "campaign label case is preserved");
assert.equal(initialTouch.landingPath, "/send");
assert.equal(initialTouch.referrerHost, "www.google.com");
assert.equal(initialTouch.clockQuality, "client_unanchored");
assert.equal(initialTouch.expiresAt, null, "session touch is bound to the session rather than a separate timer");
assert.equal(initial.firstObservedTouch?.expiresAt, nowMs + FIRST_OBSERVED_WINDOW_MS);
assert.equal(JSON.stringify(initial).includes("opaque-click"), false, "raw click identifiers never enter V2");
assert.equal(JSON.stringify(initial).includes("private"), false, "referrer paths and queries never enter V2");

const reload = await captureAttributionSnapshotV2({
  ...base,
  url: "/send",
  documentEntry: true,
  documentReferrer: "https://facebook.com/private",
  touchIdFactory: () => "touch-should-not-replace",
});
assert.equal(reload.currentSessionTouch?.touchId, "touch-first", "reload reuses the current session touch");
assert.equal(reload.currentSessionTouch?.source, "google", "reload does not replace touch with a different referrer");

const spaTransition = await captureAttributionSnapshotV2({
  ...base,
  url: "/checkout?utm_source=meta&utm_medium=paid_social&utm_campaign=Late-Tag",
  pathname: "/checkout",
  documentEntry: false,
  documentReferrer: undefined,
  touchIdFactory: () => "touch-spa",
});
assert.equal(spaTransition.currentSessionTouch?.touchId, "touch-first", "SPA route tags do not overwrite the entry touch");
assert.equal(spaTransition.currentSessionTouch?.campaign, "Launch-A");

nowMs += 30 * 60 * 1000 + 1;
const rotatedWithoutEntry = await captureAttributionSnapshotV2({
  ...base,
  nowMs,
  url: "/checkout",
  pathname: "/checkout",
  documentEntry: false,
  documentReferrer: "https://www.google.com/stale-document-referrer",
});
assert.notEqual(rotatedWithoutEntry.currentSessionTouch?.sessionId, initialTouch.sessionId);
assert.equal(rotatedWithoutEntry.currentSessionTouch, null, "a timed-out SPA session cannot reuse the old touch");
assert.equal(rotatedWithoutEntry.currentSessionMissingReason, "entry_not_observed", "stale document referrer does not fabricate a new entry");
assert.notEqual(getOrCreateJourneyIdentity({ storage, nowMs }).sessionId, initialTouch.sessionId, "only journey-identity applies the exact 30-minute rotation");
assert.equal(rotatedWithoutEntry.firstObservedTouch?.touchId, "touch-first", "first touch remains fixed across sessions");

const returning = await captureAttributionSnapshotV2({
  ...base,
  nowMs: nowMs + 1,
  url: "/",
  pathname: "/",
  documentEntry: true,
  documentReferrer: "https://www.google.com/search?q=return",
  touchIdFactory: () => "touch-return",
});
assert.equal(returning.currentSessionTouch?.channel, "organic_search");
assert.equal(returning.currentSessionTouch?.touchId, "touch-return");
assert.equal(returning.firstObservedTouch?.touchId, "touch-first", "returning traffic does not overwrite first observed touch");

const directStorage = new MemoryStorage();
const direct = await captureAttributionSnapshotV2({
  url: "/",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 55_000,
  storage: directStorage,
  storagePersistent: true,
  origin: "https://sendmynotes.com",
  identityResolver: () => getOrCreateJourneyIdentity({ storage: directStorage, nowMs: 55_000 }),
  touchIdFactory: () => "touch-direct",
});
assert.equal(direct.currentSessionTouch?.channel, "direct_observed", "a real entry with no referrer is distinct from an unobserved SPA transition");

const clickOnlyStorage = new MemoryStorage();
const clickOnly = await captureAttributionSnapshotV2({
  url: "/?gclid=opaque-click",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 77_000,
  storage: clickOnlyStorage,
  storagePersistent: true,
  identityResolver: () => getOrCreateJourneyIdentity({ storage: clickOnlyStorage, nowMs: 77_000 }),
});
assert.equal(clickOnly.currentSessionTouch?.source, "google");
assert.equal(clickOnly.currentSessionTouch?.medium, undefined, "click-only data must not invent CPC");
assert.equal(JSON.stringify(clickOnly).includes("opaque-click"), false);

const raceStorage = new MemoryStorage();
const lockQueue: Promise<unknown>[] = [];
let lockTail = Promise.resolve();
const locks: AttributionCaptureLocks = {
  request: async (_name, callback) => {
    const result = lockTail.then(callback);
    lockTail = result.then(() => undefined, () => undefined);
    lockQueue.push(result);
    return result;
  },
};
const raceOptions = {
  url: "/?utm_source=meta&utm_medium=paid_social&utm_campaign=Race-Test",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 88_000,
  storage: raceStorage,
  storagePersistent: true,
  identityResolver: () => getOrCreateJourneyIdentity({ storage: raceStorage, nowMs: 88_000 }),
  locks,
};
const [tabA, tabB] = await Promise.all([
  captureAttributionSnapshotV2({ ...raceOptions, touchIdFactory: () => "shared-touch" }),
  captureAttributionSnapshotV2({ ...raceOptions, touchIdFactory: () => "other-touch" }),
]);
assert.equal(tabA.currentSessionTouch?.sessionId, tabB.currentSessionTouch?.sessionId, "concurrent tabs use the same canonical journey session");
assert.equal(tabA.currentSessionTouch?.touchId, tabB.currentSessionTouch?.touchId, "serialized tabs reuse one entry touch");
assert.equal(tabA.firstObservedTouch?.touchId, tabB.firstObservedTouch?.touchId, "serialized tabs keep one first-touch ID");
assert.equal(lockQueue.length, 2);

const noLockStorage = new MemoryStorage();
const noLockOptions = {
  url: "/?utm_source=google&utm_medium=cpc&utm_campaign=Same-Arrival",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 89_000,
  storage: noLockStorage,
  storagePersistent: true,
  identityResolver: () => getOrCreateJourneyIdentity({ storage: noLockStorage, nowMs: 89_000 }),
};
const [noLockA, noLockB] = await Promise.all([
  captureAttributionSnapshotV2(noLockOptions),
  captureAttributionSnapshotV2(noLockOptions),
]);
assert.equal(noLockA.currentSessionTouch?.touchId, noLockB.currentSessionTouch?.touchId, "same-evidence tabs converge without relying on a storage lock");

const conflictStorage = new MemoryStorage();
conflictStorage.setItem(SMN_SESSION_V2_KEY, JSON.stringify({ sessionId: "session-other" }));
let conflictResolveCalls = 0;
const conflictingIdentity: JourneyIdentity = {
  sessionId: "session-racing",
  anonymousId: "anon-racing",
  journeyId: "journey-racing",
  isNewSession: true,
  degradedIdentity: false,
};
const unresolvedRace = await captureAttributionSnapshotV2({
  url: "/?utm_source=google&utm_medium=cpc",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 99_000,
  storage: conflictStorage,
  storagePersistent: true,
  identityResolver: () => { conflictResolveCalls++; return conflictingIdentity; },
});
assert.equal(unresolvedRace.currentSessionTouch, null, "cross-tab mismatch is not force-joined");
assert.equal(unresolvedRace.currentSessionMissingReason, "session_unavailable");
assert.equal(conflictStorage.getItem(SESSION_TOUCH_STORAGE_KEY), null, "mismatched identity never persists a touch");
assert.equal(conflictResolveCalls, 2, "the race fallback retries canonical resolution once then reports unknown");

const deniedStorage = new MemoryStorage();
deniedStorage.setItem(FIRST_OBSERVED_TOUCH_STORAGE_KEY, JSON.stringify({ touchId: "stale" }));
deniedStorage.setItem(SESSION_TOUCH_STORAGE_KEY, JSON.stringify({ touchId: "stale" }));
const denied = await captureAttributionSnapshotV2({
  url: "/?utm_source=google&utm_medium=cpc",
  pathname: "/",
  documentEntry: true,
  consentState: "denied",
  nowMs: 100_000,
  storage: deniedStorage,
  storagePersistent: true,
});
assert.equal(denied.currentSessionMissingReason, "consent_denied");
assert.equal(denied.persistence, "not_attempted");
assert.equal(deniedStorage.getItem(FIRST_OBSERVED_TOUCH_STORAGE_KEY), null, "denial clears stored V2 touches");
assert.equal(deniedStorage.getItem(SESSION_TOUCH_STORAGE_KEY), null);

class ThrowingStorage implements StorageLike {
  getItem(): string | null { throw new Error("blocked"); }
  setItem(): void { throw new Error("blocked"); }
  removeItem(): void { throw new Error("blocked"); }
}
const memoryOnly = await captureAttributionSnapshotV2({
  url: "/?utm_source=google&utm_medium=cpc",
  pathname: "/",
  documentEntry: true,
  consentState: granted,
  nowMs: 110_000,
  storage: new ThrowingStorage(),
  storagePersistent: false,
  identityResolver: () => ({
    sessionId: "memory-session",
    anonymousId: "memory-anonymous",
    journeyId: "memory-journey",
    isNewSession: true,
    degradedIdentity: true,
  }),
  touchIdFactory: () => "memory-touch",
});
assert.equal(memoryOnly.currentSessionTouch?.sessionId, "memory-session");
assert.equal(memoryOnly.persistence, "memory_only");
assert.equal(memoryOnly.currentSessionMissingReason, "storage_unavailable");
assert.equal(readAttributionSnapshotV2(new ThrowingStorage(), "memory-session")?.persistence, "memory_only", "memory-only recovery remains available to downstream readers");

console.log("attribution capture: entry, SPA, session rotation, click privacy, storage and concurrent-tab assertions passed");
}

runAttributionCaptureTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
