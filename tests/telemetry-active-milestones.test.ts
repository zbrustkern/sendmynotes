import assert from "node:assert/strict";
import { emitMilestoneOnce, MilestoneEnvelopeOptions } from "../lib/telemetry-milestones";
import { getOrCreateJourneyIdentity, StorageLike } from "../lib/journey-identity";

class MemoryStorage implements StorageLike {
  constructor(private readonly values = new Map<string, string>()) {}
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const seen = new Set<string>();
const sent: Array<{ name: string; options: MilestoneEnvelopeOptions }> = [];
const send = (name: string, _properties: Record<string, unknown>, options: MilestoneEnvelopeOptions) => {
  sent.push({ name, options });
};
const draftId = "draft_test_opaque_1";

// A burst of edits/re-renders produces one deliberate builder-engagement fact.
for (let i = 0; i < 80; i++) {
  emitMilestoneOnce(seen, send, "builder_engaged", { control: "note" }, {
    scope: "session-test:draft_test_opaque_1",
    draftId,
  });
}
assert.equal(sent.length, 1, "typing and rerender churn emits one builder_engaged event");
assert.equal(sent[0].name, "builder_engaged");
assert.equal(sent[0].options.draftId, draftId);

// Transport retry and remount use the same logical scope, so the envelope ID is stable.
const retrySeen = new Set<string>();
emitMilestoneOnce(retrySeen, send, "note_confirmed", { charCount: 20 }, {
  scope: "session-test:draft_test_opaque_1",
  draftId,
});
const originalId = sent[1].options.eventId;
const remountSeen = new Set<string>();
emitMilestoneOnce(remountSeen, send, "note_confirmed", { charCount: 20 }, {
  scope: "session-test:draft_test_opaque_1",
  draftId,
});
assert.equal(sent[2].options.eventId, originalId, "same draft and milestone keep the same event ID across remounts");
assert.equal(sent[2].options.draftId, draftId, "the resumed event remains linked to its draft");

const backing = new Map<string, string>();
const storage = new MemoryStorage(backing);
const session = getOrCreateJourneyIdentity({ storage, nowMs: 1_000_000 });
const firstDraft = getOrCreateJourneyIdentity({ storage, draftId, nowMs: 1_000_001 });
const sameDraft = getOrCreateJourneyIdentity({ storage: new MemoryStorage(backing), draftId, nowMs: 1_000_002 });
const nextDraft = getOrCreateJourneyIdentity({ storage, draftId: "draft_test_opaque_2", nowMs: 1_000_003 });
assert.equal(firstDraft.journeyId, sameDraft.journeyId, "resume preserves the draft's journey identity");
assert.notEqual(nextDraft.journeyId, firstDraft.journeyId, "a new draft starts a distinct journey");
assert.equal(nextDraft.sessionId, session.sessionId, "draft changes retain the active session ID");

console.log("active telemetry milestones: exact-count, retry-ID, draft binding assertions passed");
