/**
 * Unit tests for SendMyNotes Versioned Draft Model & Storage Layer (S1-01)
 *
 * Verifies:
 * 1. Refresh survival via storage interface
 * 2. 24h expiry (discarded when older than 24h)
 * 3. Version mismatch handling (discarded safely)
 * 4. Forbidden keys never stored (asserts keys stored in the underlying storage)
 * 5. draftRevision increments on content changes
 * 6. clearDraft cleans storage and state
 * 7. Contextual preselection starts unaccepted, explicit accept sets accepted=true
 */

import {
  createInitialDraft,
  draftReducer,
  loadDraft,
  saveDraft,
  clearDraft,
  MemoryDraftStorage,
  DRAFT_SCHEMA_VERSION,
  DRAFT_STORAGE_KEY,
  DRAFT_EXPIRY_MS,
  FORBIDDEN_STORAGE_KEYS,
  ALLOWED_DRAFT_ROOT_KEYS,
  DraftState,
} from "../lib/draft";

console.log("=================================================");
console.log("🧪 RUNNING DRAFT MODEL & STORE TESTS (S1-01)");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

// 1. Initial draft creation
console.log("--- 1. Testing Initial Draft Structure ---");
const initial = createInitialDraft("candidate_v1");
assert(initial.schemaVersion === DRAFT_SCHEMA_VERSION, "Schema version is 1");
assert(initial.draftRevision === 0, "Initial draftRevision is 0");
assert(initial.selectedDesign === null, "Initial selectedDesign is null");
assert(initial.experienceVersion === "candidate_v1", "Experience version initialized");
assert(initial.note.text === "", "Initial note text is empty");
assert(initial.recipient === null, "Initial recipient is null");
assert(initial.sender === null, "Initial sender is null");

// 2. Draft revision increments on content change
console.log("\n--- 2. Testing draftRevision Increments ---");
let state = initial;

state = draftReducer(state, {
  type: "SELECT_DESIGN",
  payload: {
    presetId: "preset-bday-balloons",
    imageUrl: "/presets/birthday-balloons.jpg",
    title: "Celebration Garland",
    source: "preset",
    accepted: false,
  },
});
assert(state.draftRevision === 1, "draftRevision increments to 1 on SELECT_DESIGN");
assert(state.selectedDesign !== null, "selectedDesign is set");
assert(state.selectedDesign?.accepted === false, "Selection is not yet accepted (displaying != acceptance)");

state = draftReducer(state, { type: "ACCEPT_DESIGN" });
assert(state.draftRevision === 2, "draftRevision increments to 2 on ACCEPT_DESIGN");
assert(state.selectedDesign?.accepted === true, "selectedDesign is marked accepted");

state = draftReducer(state, {
  type: "UPDATE_NOTE",
  payload: { text: "Happy 30th Birthday Alex! Wishing you joy." },
});
assert(state.draftRevision === 3, "draftRevision increments to 3 on UPDATE_NOTE");
assert(state.note.text.includes("Alex"), "Note text updated");

state = draftReducer(state, {
  type: "UPDATE_RECIPIENT",
  payload: {
    name: "Alex Taylor",
    addressLine1: "123 Main St",
    city: "Austin",
    state: "",
    zip: "100-0001",
    country: "JP",
  },
});
assert(state.draftRevision === 4, "draftRevision increments to 4 on UPDATE_RECIPIENT");

state = draftReducer(state, {
  type: "UPDATE_SENDER",
  payload: {
    name: "Jordan Lee",
    addressLine1: "456 Oak Ave",
    city: "Dallas",
    state: "TX",
    zip: "75201",
  },
});
assert(state.draftRevision === 5, "draftRevision increments to 5 on UPDATE_SENDER");

// 3. Storage survival (simulate page refresh)
console.log("\n--- 3. Testing Storage Survival (Page Refresh) ---");
const mockStorage = new MemoryDraftStorage();
const savedSuccessfully = saveDraft(state, mockStorage);
assert(savedSuccessfully, "Draft saved successfully to storage");

const rawJson = mockStorage.getItem(DRAFT_STORAGE_KEY);
assert(rawJson !== null, "Raw JSON exists in storage");

const reloaded = loadDraft(mockStorage);
assert(reloaded !== null, "Draft successfully loaded from storage");
assert(reloaded?.draftRevision === 5, "Loaded draft preserved draftRevision");
assert(reloaded?.selectedDesign?.title === "Celebration Garland", "Loaded draft preserved card selection");
assert(reloaded?.selectedDesign?.accepted === true, "Loaded draft preserved accepted state");
assert(reloaded?.note.text === "Happy 30th Birthday Alex! Wishing you joy.", "Loaded draft preserved note text");
assert(reloaded?.recipient?.name === "Alex Taylor", "Loaded draft preserved recipient");
assert(reloaded?.recipient?.country === "JP", "Loaded draft preserved the international destination country");
assert(reloaded?.recipient?.zip === "100-0001", "Loaded draft preserved an alphanumeric international postal code");
assert(reloaded?.sender?.name === "Jordan Lee", "Loaded draft preserved sender");

// 4. Expiry handling (24h expiry)
console.log("\n--- 4. Testing 24-Hour Expiry ---");
const expiredStorage = new MemoryDraftStorage();
const now = Date.now();
const expiredDraft: DraftState = {
  ...state,
  updatedAt: now - (DRAFT_EXPIRY_MS + 1000), // 24 hours + 1 second ago
};
saveDraft(expiredDraft, expiredStorage, expiredDraft.updatedAt);

const loadedExpired = loadDraft(expiredStorage, now);
assert(loadedExpired === null, "Draft older than 24h is discarded");
assert(expiredStorage.getItem(DRAFT_STORAGE_KEY) === null, "Storage item removed on expiry");

// Fresh draft within 24h loads fine
const freshStorage = new MemoryDraftStorage();
const recentDraft: DraftState = {
  ...state,
  updatedAt: now - (2 * 60 * 60 * 1000), // 2 hours ago
};
saveDraft(recentDraft, freshStorage, recentDraft.updatedAt);
const loadedRecent = loadDraft(freshStorage, now);
assert(loadedRecent !== null, "Draft updated 2h ago is accepted");

// 5. Version mismatch handling
console.log("\n--- 5. Testing Schema Version Mismatch ---");
const mismatchedStorage = new MemoryDraftStorage();
const mismatchedData = {
  ...state,
  schemaVersion: 999, // Incompatible future version
};
mismatchedStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(mismatchedData));

const loadedMismatched = loadDraft(mismatchedStorage, now);
assert(loadedMismatched === null, "Mismatched schema version is safely discarded");
assert(mismatchedStorage.getItem(DRAFT_STORAGE_KEY) === null, "Mismatched storage item cleared");

// 6. Forbidden sensitive keys verification
console.log("\n--- 6. Testing Forbidden Sensitive Keys Exclusion ---");
// Check keys stored in storage
const storedObject = JSON.parse(mockStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
const storedKeys = Object.keys(storedObject);

for (const forbiddenKey of FORBIDDEN_STORAGE_KEYS) {
  assert(!storedKeys.includes(forbiddenKey), `Stored draft does not contain forbidden key '${forbiddenKey}'`);
}

// Ensure all stored keys are in ALLOWED_DRAFT_ROOT_KEYS
for (const storedKey of storedKeys) {
  assert(
    (ALLOWED_DRAFT_ROOT_KEYS as readonly string[]).includes(storedKey),
    `Stored key '${storedKey}' is on the allowed keys list`
  );
}

// Attempt to inject sensitive keys into draft state and verify saveDraft strips them
const poisonedDraft = {
  ...state,
  clientSecret: "pi_secret_12345_injected",
  card: { number: "4242424242424242", cvc: "123" },
  viewToken: "sensitive_view_token_abc",
  stripeKey: "pk_test_123",
} as unknown as DraftState;

const injectionStorage = new MemoryDraftStorage();
saveDraft(poisonedDraft, injectionStorage);
const rawPoisoned = injectionStorage.getItem(DRAFT_STORAGE_KEY) || "{}";
const parsedPoisoned = JSON.parse(rawPoisoned);

assert(!("clientSecret" in parsedPoisoned), "Poisoned clientSecret was stripped on save");
assert(!("card" in parsedPoisoned), "Poisoned card data was stripped on save");
assert(!("viewToken" in parsedPoisoned), "Poisoned viewToken was stripped on save");
assert(!("stripeKey" in parsedPoisoned), "Poisoned stripeKey was stripped on save");

// 7. clearDraft verification
console.log("\n--- 7. Testing clearDraft ---");
clearDraft(mockStorage);
assert(mockStorage.getItem(DRAFT_STORAGE_KEY) === null, "clearDraft removes item from storage");
const afterClear = loadDraft(mockStorage);
assert(afterClear === null, "loadDraft returns null after clearDraft");

console.log("\n=================================================");
console.log(`🎉 ALL DRAFT MODEL TESTS PASSED (${passedTests}/${totalTests})`);
console.log("=================================================");
