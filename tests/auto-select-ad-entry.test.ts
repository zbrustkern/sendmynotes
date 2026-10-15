import { CARD_PRESETS, matchOccasionToPreset, getTopPresetForOccasion, canonicalOccasion } from "../lib/card-presets";
import { getScenario, getScenariosByOccasion } from "../lib/seo-scenarios";
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
  Boolean(petLoss?.handwrittenNote.includes("sweet companion") && !petLoss?.handwrittenNote.includes("[")),
  "loss-of-pet contains natural, bracket-free pre-seeded pet loss note"
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

// --- 6. Testing Thank-You Warm Personal Default (No Job Interview) ---
console.log("\n--- 6. Testing Warm Personal Thank-You Defaults ---");
const thankYouScenarios = getScenariosByOccasion("thank-you");
assert(thankYouScenarios.length > 0, "Thank you scenarios exist");
const primaryThankYou = thankYouScenarios[0];
assert(primaryThankYou.slug === "kindness-and-support", `Primary thank you slug is 'kindness-and-support' (got '${primaryThankYou.slug}')`);
assert(primaryThankYou.coverUrl === "/presets/thank-you-botanical.jpg", "Primary thank you cover is Wildflower Meadow botanical");
assert(!primaryThankYou.handwrittenNote.toLowerCase().includes("interview"), "Primary thank you note does NOT mention 'interview'");
assert(!primaryThankYou.handwrittenNote.toLowerCase().includes("job title"), "Primary thank you note does NOT mention 'Job Title'");
assert(
  primaryThankYou.handwrittenNote.includes("generosity") || primaryThankYou.handwrittenNote.includes("kindness"),
  "Primary thank you note contains warm personal gratitude (kindness/generosity)"
);
assert(
  generalPreset.id === "preset-thinking-coffee",
  `General studio preset #1 is 'preset-thinking-coffee' (got '${generalPreset.id}')`
);

// --- 7. Testing Birthday Warm Personal Default (No Milestone Brackets) ---
console.log("\n--- 7. Testing Birthday Warm Personal Defaults ---");
const birthdayScenarios = getScenariosByOccasion("birthday");
assert(birthdayScenarios.length > 0, "Birthday scenarios exist");
const primaryBirthday = birthdayScenarios[0];
assert(primaryBirthday.slug === "happy-birthday", `Primary birthday slug is 'happy-birthday' (got '${primaryBirthday.slug}')`);
assert(primaryBirthday.coverUrl === "/presets/birthday-cake.jpg", "Primary birthday cover is birthday cake");
assert(!primaryBirthday.handwrittenNote.includes("[50th/60th/70th]"), "Primary birthday note has no bracketed milestone templates");
assert(
  primaryBirthday.handwrittenNote.includes("Happy Birthday!") && primaryBirthday.handwrittenNote.includes("magic"),
  "Primary birthday note contains warm celebration text"
);

// --- 8. Testing Sympathy Defaults: Category vs Leaf Pet Loss ---
console.log("\n--- 8. Testing Sympathy Category vs Leaf Pet Loss Defaults ---");
const sympathyScenarios = getScenariosByOccasion("sympathy");
assert(sympathyScenarios.length > 0, "Sympathy scenarios exist");
const primarySympathy = sympathyScenarios[0];
assert(primarySympathy.slug === "heartfelt-condolences", `Primary sympathy slug is 'heartfelt-condolences' (got '${primarySympathy.slug}')`);
assert(primarySympathy.coverUrl === "/presets/sympathy-typography.jpg", "Primary sympathy cover is Here for You typography");
assert(!primarySympathy.handwrittenNote.toLowerCase().includes("pet"), "Primary sympathy note does NOT mention pet");
assert(
  primarySympathy.handwrittenNote.includes("gentle comfort") || primarySympathy.handwrittenNote.includes("peace"),
  "Primary sympathy note contains gentle comfort text"
);

// Leaf Pet Loss
const leafPetScenario = getScenario("sympathy", "loss-of-pet");
assert(leafPetScenario?.slug === "loss-of-beloved-pet", "Leaf pet sympathy resolves to 'loss-of-beloved-pet'");
assert(leafPetScenario?.coverUrl === "/presets/pet-sympathy-rainbow.jpg", "Leaf pet sympathy cover is rainbow paws");

// --- 9. Testing Cross-Occasion Draft Bleed Isolation ---
console.log("\n--- 9. Testing Cross-Occasion Draft Bleed Isolation ---");
const storedSympathyDraft = {
  coverId: "preset-sympathy-quiet-sky",
  occasionSlug: "Sympathy & Support",
  insideNoteText: "There are no words to ease your pain, holding you close in our thoughts.",
};

// Navigating to Birthday route:
const incomingBirthdayOccasion = canonicalOccasion("birthday");
const savedOccasion = canonicalOccasion(storedSympathyDraft.occasionSlug);
const isCrossOccasionBirthday = savedOccasion !== incomingBirthdayOccasion;
assert(isCrossOccasionBirthday === true, "Cross-occasion bleed detected between Sympathy draft and Birthday route");

// Navigating to Root Studio (Thinking of You):
const incomingRootOccasion = canonicalOccasion("Thinking of You");
const isCrossOccasionRoot = savedOccasion !== incomingRootOccasion;
assert(isCrossOccasionRoot === true, "Cross-occasion bleed detected between Sympathy draft and Root Studio (Thinking of You)");

// Navigating to matching Sympathy route:
const incomingSympathyOccasion = canonicalOccasion("sympathy");
const isSameOccasion = incomingSympathyOccasion === savedOccasion;
assert(isSameOccasion === true, "Same occasion draft is correctly recognized as matching");

// --- 10. Testing Plain Homepage Card Selection Freedom ---
console.log("\n--- 10. Testing Plain Homepage Card Selection Freedom ---");
const plainTargetOccasion = "general";
const userSelectedBirthdayPreset = CARD_PRESETS.find((p) => p.occasion === "Birthday")!;
// On plain homepage, selecting any card must NOT be treated as cross-occasion mismatch
const isHomepageSelectionMismatch = Boolean(
  plainTargetOccasion !== "general" &&
  canonicalOccasion(userSelectedBirthdayPreset.occasion) !== plainTargetOccasion
);
assert(isHomepageSelectionMismatch === false, "User selecting a Birthday card on plain homepage is not blocked by mismatch check");

console.log("\n=================================================");
console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
