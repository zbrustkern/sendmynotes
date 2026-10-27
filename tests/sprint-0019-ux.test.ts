import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialDraft, draftReducer } from "../lib/draft/reducer";
import { ProgressIndicator } from "../components/flow/ProgressIndicator";
import { EnvelopePreview } from "../components/flow/EnvelopePreview";
import { Step2NoteComposition } from "../components/v3/Step2NoteComposition";
import { CARD_PRESETS } from "../lib/card-presets";

console.log("=================================================");
console.log("🧪 RUNNING SPRINT-0019 UX TEST SUITE");
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
// 1. DRAFT REDUCER: PRESERVE & RESTORE LAST CUSTOM ARTWORK
// -----------------------------------------------------------------------------
console.log("--- 1. Testing draftReducer Custom Artwork Preservation ---");

let state = createInitialDraft();
verify(state.lastCustomArtwork === null, "Initial lastCustomArtwork is null");

// Dispatch custom art selection
state = draftReducer(state, {
  type: "SELECT_DESIGN",
  payload: {
    source: "custom",
    imageUrl: "https://example.com/custom-art.png",
    title: "A golden retriever in autumn",
    occasion: "Birthday",
    accepted: true,
  },
});

verify(state.selectedDesign?.source === "custom", "selectedDesign source is custom");
verify(state.lastCustomArtwork !== null, "lastCustomArtwork is populated");
verify(
  state.lastCustomArtwork?.imageUrl === "https://example.com/custom-art.png",
  "lastCustomArtwork retains custom image URL"
);
verify(
  state.lastCustomArtwork?.title === "A golden retriever in autumn",
  "lastCustomArtwork retains custom art title"
);

// Switch to a preset catalog card
state = draftReducer(state, {
  type: "SELECT_DESIGN",
  payload: {
    source: "preset",
    presetId: "preset-bday-balloons",
    imageUrl: "https://example.com/balloons.png",
    title: "Whimsical Balloons",
    occasion: "Birthday",
  },
});

verify(state.selectedDesign?.source === "preset", "selectedDesign switched to preset");
verify(
  state.selectedDesign?.presetId === "preset-bday-balloons",
  "selectedDesign has presetId"
);
verify(
  state.lastCustomArtwork?.imageUrl === "https://example.com/custom-art.png",
  "lastCustomArtwork is preserved when switching to a preset"
);

// Restore custom art
state = draftReducer(state, {
  type: "SELECT_DESIGN",
  payload: {
    ...state.lastCustomArtwork!,
    source: "custom",
    accepted: true,
  },
});

verify(
  state.selectedDesign?.source === "custom" &&
    state.selectedDesign?.imageUrl === "https://example.com/custom-art.png",
  "Custom artwork successfully restored from lastCustomArtwork"
);

// Clear draft resets lastCustomArtwork
state = draftReducer(state, { type: "CLEAR_DRAFT" });
verify(state.lastCustomArtwork === null, "CLEAR_DRAFT resets lastCustomArtwork to null");

// HYDRATE_DRAFT fallback behavior
const hydratedWithoutField = draftReducer(createInitialDraft(), {
  type: "HYDRATE_DRAFT",
  payload: {
    ...createInitialDraft(),
    selectedDesign: {
      source: "custom",
      imageUrl: "https://example.com/hydrated-art.png",
      title: "Hydrated Art",
      occasion: "Thinking of You",
      accepted: true,
    },
  },
});
verify(
  hydratedWithoutField.lastCustomArtwork?.imageUrl === "https://example.com/hydrated-art.png",
  "HYDRATE_DRAFT derives lastCustomArtwork when selectedDesign is custom"
);

// -----------------------------------------------------------------------------
// 2. DECLUTTER STEP 2: NO 1-TAP SWITCHER, NO ALL COVERS
// -----------------------------------------------------------------------------
console.log("\n--- 2. Testing Step2NoteComposition Decluttering ---");

const preset = CARD_PRESETS[0];
const htmlStep2 = renderToStaticMarkup(
  React.createElement(Step2NoteComposition, {
    hideFixedActionBar: false,
    salutation: "Dear Grandma,",
    onChangeSalutation: () => {},
    bodyNote: "Thinking of you and sending big hugs!",
    onChangeBodyNote: () => {},
    signOff: "Warmly, Jane",
    onChangeSignOff: () => {},
    fontStyleId: "hwDavid",
    onChangeFontStyleId: () => {},
    occasion: preset.occasion,
    cardTitle: preset.title,
    cardUrl: preset.imageUrl,
    onBack: () => {},
    onContinue: () => {},
  })
);

verify(
  !htmlStep2.includes("1-Tap Card &amp; Message Switch") &&
    !htmlStep2.includes("1-Tap Card & Message Switch"),
  "Step2NoteComposition no longer renders '1-Tap Card & Message Switch'"
);
verify(
  !htmlStep2.includes("All Covers"),
  "Step2NoteComposition no longer renders 'All Covers'"
);
verify(
  !htmlStep2.includes("See All"),
  "Step2NoteComposition no longer renders 'See All'"
);
verify(
  htmlStep2.includes("Preview card"),
  "Step2NoteComposition retains compact 'Preview card' affordance"
);

// -----------------------------------------------------------------------------
// 3. PROGRESS INDICATOR: BACK NAVIGATION HOME
// -----------------------------------------------------------------------------
console.log("\n--- 3. Testing ProgressIndicator Back Navigation ---");

const htmlCard = renderToStaticMarkup(
  React.createElement(ProgressIndicator, { currentStep: "card", onBack: () => {} })
);
verify(
  !htmlCard.includes("← Back to"),
  "ProgressIndicator renders NO back button on 'card' step"
);

const htmlNote = renderToStaticMarkup(
  React.createElement(ProgressIndicator, { currentStep: "note", onBack: () => {} })
);
verify(
  htmlNote.includes("← Back to covers"),
  "ProgressIndicator renders '← Back to covers' on 'note' step"
);

const htmlAddress = renderToStaticMarkup(
  React.createElement(ProgressIndicator, { currentStep: "address", onBack: () => {} })
);
verify(
  htmlAddress.includes("← Back to note"),
  "ProgressIndicator renders '← Back to note' on 'address' step"
);

const htmlPay = renderToStaticMarkup(
  React.createElement(ProgressIndicator, { currentStep: "pay", onBack: () => {} })
);
verify(
  htmlPay.includes("← Back to address"),
  "ProgressIndicator renders '← Back to address' on 'pay' step"
);

// -----------------------------------------------------------------------------
// 4. REALISTIC ENVELOPE PREVIEW: NO BARCODES, CLEAN WHITE PAPER, INTERNATIONAL
// -----------------------------------------------------------------------------
console.log("\n--- 4. Testing EnvelopePreview Component ---");

const domesticSender = {
  fullName: "Alice Smith",
  street1: "123 Elm St",
  city: "Springfield",
  state: "IL",
  zip: "62701",
  country: "USA",
};

const domesticRecipient = {
  fullName: "Bob Jones",
  street1: "456 Oak Ave",
  city: "Denver",
  state: "CO",
  zip: "80202",
  country: "USA",
};

const htmlDomesticEnvelope = renderToStaticMarkup(
  React.createElement(EnvelopePreview, {
    sender: domesticSender,
    recipient: domesticRecipient,
    fontClass: "font-hwDavid",
  })
);

verify(
  htmlDomesticEnvelope.includes("Alice Smith") && htmlDomesticEnvelope.includes("123 Elm St"),
  "EnvelopePreview renders sender address top-left"
);
verify(
  htmlDomesticEnvelope.includes("Bob Jones") && htmlDomesticEnvelope.includes("456 Oak Ave"),
  "EnvelopePreview renders recipient address"
);
verify(
  htmlDomesticEnvelope.includes("Illustrative preview · Postage design may vary."),
  "EnvelopePreview renders mandatory caption 'Illustrative preview · Postage design may vary.'"
);
verify(
  !htmlDomesticEnvelope.includes("<rect"),
  "EnvelopePreview renders NO fake barcodes"
);
verify(
  htmlDomesticEnvelope.includes("postage-domestic.webp"),
  "Domestic envelope renders the illustrative postage asset"
);

// International Recipient
const intlRecipient = {
  fullName: "Claire Dupont",
  street1: "10 Rue de la Paix",
  city: "Paris",
  state: "Île-de-France",
  zip: "75002",
  country: "France",
};

const htmlIntlEnvelope = renderToStaticMarkup(
  React.createElement(EnvelopePreview, {
    sender: domesticSender,
    recipient: intlRecipient,
    isInternational: true,
    countryName: "France",
    fontClass: "font-hwDavid",
  })
);

verify(
  htmlIntlEnvelope.includes("France"),
  "International envelope displays the supplied country name"
);
verify(
  htmlIntlEnvelope.includes("Postage") && !htmlIntlEnvelope.includes("AIRMAIL"),
  "International envelope uses neutral postage treatment without an unsupported service claim"
);
verify(
  !htmlIntlEnvelope.includes("<rect"),
  "International envelope renders NO barcodes"
);
verify(
  htmlIntlEnvelope.includes("Illustrative preview · Postage design may vary."),
  "International envelope renders caption"
);

console.log("\n=================================================");
console.log(`🎉 ALL ${passedTests}/${totalTests} SPRINT-0019 UX TESTS PASSED!`);
console.log("=================================================\n");
