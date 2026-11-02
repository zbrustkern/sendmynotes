import assert from "node:assert/strict";
import {
  getOrCreateJourneyIdentity,
  resumeJourneyFromDraft,
  SESSION_INACTIVITY_WINDOW_MS,
  StorageLike,
} from "../lib/journey-identity";

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("storage disabled");
  }
  setItem(): void {
    throw new Error("storage disabled");
  }
}

class WorkingStorage implements StorageLike {
  constructor(private values = new Map<string, string>()) {}
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new ThrowingStorage();
const start = 1_000_000;

const first = getOrCreateJourneyIdentity({ storage, nowMs: start });
const second = getOrCreateJourneyIdentity({ storage, nowMs: start + 1_000 });

assert.equal(first.degradedIdentity, true, "blocked storage must be visible as degraded identity");
assert.equal(second.degradedIdentity, true, "degraded status remains visible on every resolution");
assert.equal(second.sessionId, first.sessionId, "session ID is stable across same-page calls");
assert.equal(second.anonymousId, first.anonymousId, "anonymous ID is stable across same-page calls");
assert.equal(second.journeyId, first.journeyId, "journey ID is stable across same-page calls");
assert.equal(second.isNewSession, false, "a repeated call in the active session is not new");

const atBoundary = getOrCreateJourneyIdentity({
  storage,
  nowMs: start + 1_000 + SESSION_INACTIVITY_WINDOW_MS,
});
assert.equal(atBoundary.sessionId, first.sessionId, "the inactivity boundary is inclusive");

const afterBoundary = getOrCreateJourneyIdentity({
  storage,
  nowMs: start + 1_000 + SESSION_INACTIVITY_WINDOW_MS + SESSION_INACTIVITY_WINDOW_MS + 1,
});
assert.notEqual(afterBoundary.sessionId, first.sessionId, "more than 30 minutes of inactivity rotates session");
assert.equal(afterBoundary.anonymousId, first.anonymousId, "session rotation preserves page-memory anonymous ID");
assert.equal(afterBoundary.journeyId, first.journeyId, "session rotation preserves the active page journey");
assert.equal(afterBoundary.isNewSession, true, "rotated session is reported as new");

const freshBlockedContext = getOrCreateJourneyIdentity({
  storage: new ThrowingStorage(),
  nowMs: start + 2_000,
});
assert.equal(freshBlockedContext.degradedIdentity, true, "a fresh blocked-storage context remains marked degraded");
assert.notEqual(freshBlockedContext.sessionId, first.sessionId, "blocked storage does not claim session continuity across reloads");
assert.notEqual(freshBlockedContext.journeyId, first.journeyId, "blocked storage does not claim journey continuity across reloads");

const persistedValues = new Map<string, string>();
const workingStorage = new WorkingStorage(persistedValues);
const activeJourney = getOrCreateJourneyIdentity({ storage: workingStorage, nowMs: start });
const draftAFirst = getOrCreateJourneyIdentity({ storage: workingStorage, draftId: "draft-A", nowMs: start + 1 });
const draftARepeat = getOrCreateJourneyIdentity({ storage: workingStorage, draftId: "draft-A", nowMs: start + 2 });
const draftBFirst = getOrCreateJourneyIdentity({ storage: workingStorage, draftId: "draft-B", nowMs: start + 3 });
// A new Storage wrapper around the same durable backing map models a page reload.
const reloadedStorage = new WorkingStorage(persistedValues);
const draftAResume = resumeJourneyFromDraft("draft-A", { storage: reloadedStorage, nowMs: start + 4 });

assert.equal(getOrCreateJourneyIdentity({ storage: workingStorage, nowMs: start + 5 }).journeyId, activeJourney.journeyId, "no-draft calls retain the active journey");
assert.notEqual(draftAFirst.journeyId, activeJourney.journeyId, "first explicit draft creates its own journey");
assert.equal(draftARepeat.journeyId, draftAFirst.journeyId, "repeated draft A calls preserve its journey");
assert.notEqual(draftBFirst.journeyId, draftAFirst.journeyId, "draft B receives a distinct journey");
assert.equal(draftAResume.journeyId, draftAFirst.journeyId, "draft A remains stable when resumed after draft B");
assert.equal(draftAFirst.sessionId, activeJourney.sessionId, "a draft keeps the current session identity");
assert.equal(draftAFirst.anonymousId, activeJourney.anonymousId, "a draft keeps the current anonymous identity");
assert.equal(draftBFirst.sessionId, activeJourney.sessionId, "a second draft keeps the current session identity");
assert.equal(draftBFirst.anonymousId, activeJourney.anonymousId, "a second draft keeps the current anonymous identity");

console.log("journey identity fallback and draft binding: 23 assertions passed");
