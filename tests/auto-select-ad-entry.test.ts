import { CARD_PRESETS, matchOccasionToPreset, getTopPresetForOccasion } from "../lib/card-presets";
import { getScenario } from "../lib/seo-scenarios";
import { EVENT_METADATA_SCHEMAS, sanitizeMetadata } from "../lib/telemetry-schema";

console.log("=================================================");
console.log("🧪 RUNNING AUTO-SELECT AD LANDING ENTRY TESTS");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

// --- 1. Test #1 Bestselling General/Everyday Preset Resolution ---
console.log("--- 1. Testing Root / General Bestselling Preset ---");
const generalPreset = getTopPresetForOccasion();
assert(!!generalPreset, "General preset exists");
assert(generalPreset.id === CARD_PRESETS[0].id, `General preset matches CARD_PRESETS[0] (${generalPreset.id})`);
assert(generalPreset.imageUrl.length > 0, "General preset has valid imageUrl");
assert(generalPreset.title.length > 0, "General preset has valid title");

// --- 2. Test Category Route Presets Resolution ---
console.log("\n--- 2. Testing Category Route Preset Resolutions ---");

// Sympathy
const sympathyPreset = getTopPresetForOccasion("sympathy");
assert(!!sympathyPreset, "sympathy category resolves to a preset");
assert(
  sympathyPreset.occasion === "Sympathy & Support",
  `sympathy category maps to 'Sympathy & Support' (got '${sympathyPreset.occasion}')`
);

// Thank You
const thankYouPreset = getTopPresetForOccasion("thank-you");
assert(!!thankYouPreset, "thank-you category resolves to a preset");
assert(
  thankYouPreset.occasion === "Thank You",
  `thank-you category maps to 'Thank You' (got '${thankYouPreset.occasion}')`
);

// Birthday
const birthdayPreset = getTopPresetForOccasion("birthday");
assert(!!birthdayPreset, "birthday category resolves to a preset");
assert(
  birthdayPreset.occasion === "Birthday",
  `birthday category maps to 'Birthday' (got '${birthdayPreset.occasion}')`
);

// Congratulations / Congrats
const congratsPreset = getTopPresetForOccasion("congratulations");
assert(!!congratsPreset, "congratulations category resolves to a preset");
assert(
  congratsPreset.occasion === "Congratulations",
  `congratulations category maps to 'Congratulations' (got '${congratsPreset.occasion}')`
);

// Thinking of You
const thinkingPreset = getTopPresetForOccasion("thinking-of-you");
assert(!!thinkingPreset, "thinking-of-you category resolves to a preset");
assert(
  thinkingPreset.occasion === "Thinking of You",
  `thinking-of-you category maps to 'Thinking of You' (got '${thinkingPreset.occasion}')`
);

// Anniversary
const annivPreset = getTopPresetForOccasion("anniversary");
assert(!!annivPreset, "anniversary category resolves to a preset");
assert(
  annivPreset.occasion === "Anniversary",
  `anniversary category maps to 'Anniversary' (got '${annivPreset.occasion}')`
);

// --- 3. Test Leaf Occasion Route Cover Resolution ---
console.log("\n--- 3. Testing Leaf Occasion Route Cover Resolution ---");

const petLoss = getScenario("sympathy", "loss-of-pet");
assert(!!petLoss, "Leaf occasion 'sympathy/loss-of-pet' resolves");
assert(petLoss?.slug === "loss-of-beloved-pet", "loss-of-pet slug maps to canonical 'loss-of-beloved-pet'");
assert(
  petLoss?.coverUrl === "/presets/pet-sympathy-rainbow.jpg",
  `loss-of-pet coverUrl is pet sympathy rainbow (got '${petLoss?.coverUrl}')`
);
assert(
  petLoss?.occasionName === "Sympathy & Support",
  `loss-of-pet occasionName is 'Sympathy & Support' (got '${petLoss?.occasionName}')`
);
assert(
  petLoss?.handwrittenNote.includes("sweet [Pet's Name]"),
  "loss-of-pet contains pre-seeded pet loss note"
);

// --- 4. Test Telemetry Schema Allows auto_selected ---
console.log("\n--- 4. Testing Telemetry Metadata Schema for auto_selected ---");

assert(
  EVENT_METADATA_SCHEMAS["step_2_cover_ready"].auto_selected?.type === "boolean",
  "step_2_cover_ready schema allows auto_selected boolean"
);
assert(
  EVENT_METADATA_SCHEMAS["step_1_landed"].auto_selected?.type === "boolean",
  "step_1_landed schema allows auto_selected boolean"
);

const sanitized = sanitizeMetadata("step_2_cover_ready", {
  presetId: sympathyPreset.id,
  occasion: sympathyPreset.occasion,
  title: sympathyPreset.title,
  auto_selected: true,
  autoSelected: true,
});

assert(sanitized.sanitized.auto_selected === true, "auto_selected: true is preserved after sanitization");
assert(sanitized.sanitized.autoSelected === true, "autoSelected: true is preserved after sanitization");
assert(sanitized.sanitized.presetId === sympathyPreset.id, "presetId is preserved");

// --- 5. Test Hydration Precedence Logic ---
console.log("\n--- 5. Testing Hydration Precedence Rules ---");

// Rule A: When isAutoSelectMode is true and visitor has no insideNoteText in localStorage,
// step must be 'note' (never 'card').
function determineActiveStep(
  isAutoSelect: boolean,
  draftStep: string | null,
  localDraft: { insideNoteText?: string; currentStep?: string } | null,
  initialStep?: string
): string {
  // 1. Initial State
  let activeStep = isAutoSelect ? "note" : (initialStep || "card");

  // 2. Draft Model Sync Effect
  if (isAutoSelect) {
    if (draftStep === "address" || draftStep === "pay") {
      activeStep = draftStep;
    } else {
      activeStep = "note";
    }
  } else if (draftStep && draftStep !== "confirmation") {
    activeStep = draftStep;
  }

  // 3. LocalStorage Hydration Effect
  if (localDraft && localDraft.currentStep && localDraft.currentStep !== "confirmation") {
    if (isAutoSelect) {
      if (!localDraft.insideNoteText?.trim()) {
        activeStep = "note";
      } else if (localDraft.currentStep !== "card") {
        activeStep = localDraft.currentStep;
      } else {
        activeStep = "note";
      }
    } else if (!initialStep) {
      activeStep = localDraft.currentStep;
    }
  }

  return activeStep;
}

// Case A: Fresh visitor with ?auto_select=1, initial createInitialDraft has currentStep: "card", no localStorage
const freshVisitorStep = determineActiveStep(true, "card", null);
assert(freshVisitorStep === "note", `Fresh visitor with ?auto_select=1 remains on 'note' step (got '${freshVisitorStep}')`);

// Case B: Returning visitor with ?auto_select=1 who had old empty draft with currentStep: "card"
const oldCardDraftVisitorStep = determineActiveStep(true, "card", { currentStep: "card", insideNoteText: "" });
assert(
  oldCardDraftVisitorStep === "note",
  `Visitor with empty note in localStorage with ?auto_select=1 prioritizes 'note' step (got '${oldCardDraftVisitorStep}')`
);

// Case C: Returning visitor who had already written note and reached "address"
const returningAddressVisitorStep = determineActiveStep(true, "address", { currentStep: "address", insideNoteText: "Hello there!" });
assert(
  returningAddressVisitorStep === "address",
  `Returning visitor who typed note and reached address preserves 'address' step (got '${returningAddressVisitorStep}')`
);

// Case D: Organic visitor without auto_select (normal flow)
const organicVisitorStep = determineActiveStep(false, "card", null);
assert(organicVisitorStep === "card", `Normal visitor without auto_select starts on 'card' step (got '${organicVisitorStep}')`);

console.log("\n=================================================");
console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
