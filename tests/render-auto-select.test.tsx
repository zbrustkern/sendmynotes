import React from "react";
import { renderToString } from "react-dom/server";
import { Step2NoteComposition } from "../components/v3/Step2NoteComposition";
import { CARD_PRESETS, matchOccasionToPreset, getTopPresetForOccasion } from "../lib/card-presets";
import { getScenario } from "../lib/seo-scenarios";

console.log("=================================================");
console.log("🧪 RUNNING SSR / COMPONENT RENDERING VERIFICATION");
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

// --- 1. Test Step2NoteComposition renders compact "Swap Cover Design" pill at the top ---
console.log("--- 1. Testing Step2NoteComposition Pill and Structure ---");

const generalPreset = CARD_PRESETS[0];
const htmlGeneral = renderToString(
  <Step2NoteComposition
    hideFixedActionBar={true}
    salutation=""
    onChangeSalutation={() => {}}
    bodyNote=""
    onChangeBodyNote={() => {}}
    signOff=""
    onChangeSignOff={() => {}}
    fontStyleId="hwDavid"
    onChangeFontStyleId={() => {}}
    occasion={generalPreset.occasion}
    cardTitle={generalPreset.title}
    cardUrl={generalPreset.imageUrl}
    onBack={() => {}}
    onContinue={() => {}}
  />
);

assert(htmlGeneral.includes("Write your note"), "Step 2 heading 'Write your note' is rendered");
assert(
  htmlGeneral.includes("Swap Cover Design"),
  "Compact 'Swap Cover Design' pill is present and visible at the top"
);
assert(htmlGeneral.includes(generalPreset.title), `Selected cover title '${generalPreset.title}' is displayed`);
assert(
  htmlGeneral.includes("Selected Cover:"),
  "Selected Cover label is prominently displayed"
);
assert(
  htmlGeneral.includes("Physical Front"),
  "High-visibility front cover preview badge 'Physical Front' is rendered"
);
assert(
  htmlGeneral.includes("Front Cover"),
  "Front Cover label is prominently displayed alongside card preview"
);
assert(
  htmlGeneral.includes("1-Tap Swap: Quick"),
  "1-Tap Mini Cover Strip is present and rendered"
);

// --- 2. Test Step2NoteComposition with Pet Loss Sympathy Scenario ---
console.log("\n--- 2. Testing Pet Loss Sympathy Note Composition ---");

const petLoss = getScenario("sympathy", "loss-of-pet");
assert(!!petLoss, "Pet loss scenario resolved");

const htmlPetLoss = renderToString(
  <Step2NoteComposition
    hideFixedActionBar={true}
    salutation="Dear Sarah,"
    onChangeSalutation={() => {}}
    bodyNote={petLoss?.handwrittenNote || ""}
    onChangeBodyNote={() => {}}
    signOff="With love, Alex"
    onChangeSignOff={() => {}}
    fontStyleId="hwDavid"
    onChangeFontStyleId={() => {}}
    occasion={petLoss?.occasionName || "Sympathy & Support"}
    cardTitle={petLoss?.h1Title || "Rainbow Meadow & Paws"}
    cardUrl={petLoss?.coverUrl || ""}
    scenarioSlug={petLoss?.slug}
    onBack={() => {}}
    onContinue={() => {}}
  />
);

assert(
  htmlPetLoss.includes("Swap Cover Design"),
  "Pet loss editor displays compact 'Swap Cover Design' pill at top"
);
assert(
  htmlPetLoss.includes("Rainbow Bridge / Fond Memories"),
  "Pet loss starter prompts include 'Rainbow Bridge / Fond Memories'"
);
assert(htmlPetLoss.includes("Dear Sarah,"), "Salutation rendered in preview/form");

// --- 3. Test Category Preset Matching Consistency ---
console.log("\n--- 3. Testing Category Preset Matching Consistency ---");

const categoriesToTest = ["sympathy", "thank-you", "birthday", "congratulations", "anniversary", "thinking-of-you"];

for (const cat of categoriesToTest) {
  const matched = matchOccasionToPreset(cat);
  assert(!!matched, `Category '${cat}' matches a preset`);
  assert(matched?.imageUrl.startsWith("/presets/"), `Category '${cat}' has valid preset image (${matched?.imageUrl})`);
  assert(matched?.title.length! > 0, `Category '${cat}' has valid preset title (${matched?.title})`);
}

console.log("\n=================================================");
console.log(`Render Summary: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
