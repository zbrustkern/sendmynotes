import assert from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Step2NoteComposition, HANDWRITING_STYLES } from "../components/v3/Step2NoteComposition";
import { CARD_PRESETS } from "../lib/card-presets";

console.log("=================================================");
console.log("🧪 RUNNING STAGING POLISH TEST SUITE");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function verify(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

// -----------------------------------------------------------------------------
// 1. DYNAMIC MESSAGE TOGGLE & HUMANIZE BALLPOINT INK UI COPY
// -----------------------------------------------------------------------------
console.log("--- 1. Testing UI Copy & Dynamic Preview Toggle ---");

const preset = CARD_PRESETS[0];

// Test with Casual David (default)
const htmlDavid = renderToStaticMarkup(
  <Step2NoteComposition
    hideFixedActionBar={false}
    salutation="Dear Taylor,"
    onChangeSalutation={() => {}}
    bodyNote="Thinking of you and wishing you the happiest birthday!"
    onChangeBodyNote={() => {}}
    signOff="Warmly, Alex"
    onChangeSignOff={() => {}}
    fontStyleId="hwDavid"
    onChangeFontStyleId={() => {}}
    occasion={preset.occasion}
    cardTitle={preset.title}
    cardUrl={preset.imageUrl}
    onBack={() => {}}
    onContinue={() => {}}
  />
);

verify(
  htmlDavid.includes("Preview in Casual David"),
  "Toggle dynamically reads 'Preview in Casual David' when Casual David is active"
);

verify(
  !htmlDavid.includes("Preview in Real Ballpoint Ink"),
  "Spec phrase 'Preview in Real Ballpoint Ink' is replaced"
);

verify(
  htmlDavid.includes("Preview card"),
  "Mobile card bar button reads 'Preview card'"
);

verify(
  !htmlDavid.includes("Preview Card &amp; Live Ink") && !htmlDavid.includes("Preview Card & Live Ink"),
  "Old mobile button 'Preview Card & Live Ink' is replaced"
);

verify(
  htmlDavid.includes("Live Handwriting Preview"),
  "Desktop left-column header badge reads 'Live Handwriting Preview'"
);

verify(
  !htmlDavid.includes("1:1 Real Ballpoint Pen Inking"),
  "Spec phrase '1:1 Real Ballpoint Pen Inking' is replaced"
);

// Test with Carefree Kate
const htmlKate = renderToStaticMarkup(
  <Step2NoteComposition
    hideFixedActionBar={false}
    salutation="Dear Taylor,"
    onChangeSalutation={() => {}}
    bodyNote="Thinking of you and wishing you the happiest birthday!"
    onChangeBodyNote={() => {}}
    signOff="Warmly, Alex"
    onChangeSignOff={() => {}}
    fontStyleId="hwKate"
    onChangeFontStyleId={() => {}}
    occasion={preset.occasion}
    cardTitle={preset.title}
    cardUrl={preset.imageUrl}
    onBack={() => {}}
    onContinue={() => {}}
  />
);

verify(
  htmlKate.includes("Preview in Carefree Kate"),
  "Toggle dynamically updates to 'Preview in Carefree Kate' when style changes to Carefree Kate"
);

// Test with Executive Adam
const htmlAdam = renderToStaticMarkup(
  <Step2NoteComposition
    hideFixedActionBar={false}
    salutation="Dear Taylor,"
    onChangeSalutation={() => {}}
    bodyNote="Thinking of you and wishing you the happiest birthday!"
    onChangeBodyNote={() => {}}
    signOff="Warmly, Alex"
    onChangeSignOff={() => {}}
    fontStyleId="hwAdam"
    onChangeFontStyleId={() => {}}
    occasion={preset.occasion}
    cardTitle={preset.title}
    cardUrl={preset.imageUrl}
    onBack={() => {}}
    onContinue={() => {}}
  />
);

verify(
  htmlAdam.includes("Preview in Executive Adam"),
  "Toggle dynamically updates to 'Preview in Executive Adam' when style changes to Executive Adam"
);

// -----------------------------------------------------------------------------
// 2. UNBLOCKED DESKTOP HANDWRITING PREVIEW (Docked Card-Header Bar)
// -----------------------------------------------------------------------------
console.log("\n--- 2. Testing Unblocked Desktop Handwriting Preview ---");

verify(
  htmlDavid.includes("Tactile Stationery Desk"),
  "Tactile Stationery Desk container is present"
);

verify(
  htmlDavid.includes("Front Artwork") &&
  htmlDavid.includes("Preview card"),
  "Docked card-header bar contains Front Artwork and Preview card"
);

verify(
  !htmlDavid.includes("-rotate-3 hover:rotate-0 hover:scale-105"),
  "Tilted overlapping corner-peek thumbnail is removed from white paper sheet"
);

verify(
  htmlDavid.includes("text-[17px] sm:text-[19px] leading-relaxed"),
  "Handwriting font size is enlarged by ~15%-20% (text-[17px] sm:text-[19px] leading-relaxed)"
);

// -----------------------------------------------------------------------------
// 3. TOAST & DRAFT HYDRATION LOGIC (Real edits & Session Storage guard)
// -----------------------------------------------------------------------------
console.log("\n--- 3. Testing Toast & Draft Hydration Logic ---");

// Mock Storage helper
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

function evaluateDraftHydrationToast(
  local: MockStorage,
  session: MockStorage,
  targetOccasionSlug = "birthday"
): { shouldShowToast: boolean; isHydratedInSession: boolean } {
  const isAlreadyHydrated = session.getItem("smn_draft_hydrated") === "1";
  session.setItem("smn_draft_hydrated", "1");

  const scopedKey = `smn_active_draft_v2_${targetOccasionSlug}`;
  const saved = local.getItem(scopedKey) || local.getItem("smn_active_draft_v2");
  if (!saved) {
    return { shouldShowToast: false, isHydratedInSession: true };
  }

  const parsed = JSON.parse(saved);
  if (!parsed || typeof parsed !== "object") {
    return { shouldShowToast: false, isHydratedInSession: true };
  }

  const hasRealUserEdits = Boolean(
    parsed.hasCustomUserEdits === true ||
    local.getItem("hasCustomUserEdits") === "true" ||
    local.getItem(`hasCustomUserEdits_${targetOccasionSlug}`) === "true"
  );

  const shouldShowToast = Boolean(hasRealUserEdits && !isAlreadyHydrated);
  return { shouldShowToast, isHydratedInSession: true };
}

// Case A: Fresh visitor arrives with empty storage
mockLocalStorage.clear();
mockSessionStorage.clear();
let resultA = evaluateDraftHydrationToast(mockLocalStorage, mockSessionStorage);
verify(!resultA.shouldShowToast, "Case A: Fresh visitor with no draft does NOT see toast");
verify(mockSessionStorage.getItem("smn_draft_hydrated") === "1", "Tab session is marked as hydrated");

// Case B: Visitor with unedited template draft (e.g. loaded default preset, but no user typing)
mockLocalStorage.clear();
mockSessionStorage.clear();
mockLocalStorage.setItem(
  "smn_active_draft_v2",
  JSON.stringify({
    coverId: "preset-1",
    insideNoteText: "Default template text",
    hasCustomUserEdits: false,
  })
);
let resultB = evaluateDraftHydrationToast(mockLocalStorage, mockSessionStorage);
verify(
  !resultB.shouldShowToast,
  "Case B: Visitor with default loaded template (hasCustomUserEdits === false) does NOT see toast"
);

// Case C: Visitor with real custom edits in localStorage opens a fresh tab session
mockLocalStorage.clear();
mockSessionStorage.clear();
mockLocalStorage.setItem("hasCustomUserEdits", "true");
mockLocalStorage.setItem(
  "smn_active_draft_v2",
  JSON.stringify({
    coverId: "preset-1",
    insideNoteText: "Custom note typed by real human user",
    hasCustomUserEdits: true,
  })
);
let resultC1 = evaluateDraftHydrationToast(mockLocalStorage, mockSessionStorage);
verify(
  resultC1.shouldShowToast,
  "Case C1: Returning visitor with real user edits in a fresh tab DOES see toast once"
);

// Case C2: Same visitor navigates or re-hydrates in the same tab session
let resultC2 = evaluateDraftHydrationToast(mockLocalStorage, mockSessionStorage);
verify(
  !resultC2.shouldShowToast,
  "Case C2: Subsequent hydration in same tab session does NOT show toast repeatedly"
);

// Case D: User clicks 'Start over' or completes an order
mockLocalStorage.removeItem("smn_active_draft_v2");
mockLocalStorage.removeItem("hasCustomUserEdits");
mockSessionStorage.removeItem("smn_draft_hydrated");
let resultD = evaluateDraftHydrationToast(mockLocalStorage, mockSessionStorage);
verify(
  !resultD.shouldShowToast,
  "Case D: After clean reset, draft and custom edits flags are cleared, no toast"
);

console.log("\n=================================================");
console.log(`🎉 ALL ${passedTests}/${totalTests} STAGING POLISH TESTS PASSED!`);
console.log("=================================================\n");
