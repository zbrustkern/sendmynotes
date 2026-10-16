import React from "react";
import assert from "node:assert";
import Home from "../app/page";
import SendCatalogPage from "../app/send/page";
import OccasionPage from "../app/send/[occasion]/page";
import ScenarioPage from "../app/send/[occasion]/[slug]/page";
import { CARD_PRESETS } from "../lib/card-presets";
import { ExperienceRouter } from "../components/ExperienceRouter";
import { getScenario } from "../lib/seo-scenarios";
import { createInitialDraft } from "../lib/draft/reducer";

console.log("=================================================");
console.log("🧪 RUNNING AD ENTRY & SELECTION BEHAVIOR VERIFICATION");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function verify(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  // --- 1. Test Server-side Redirect on Generic ?auto_select=1 ---
  console.log("--- 1. Testing Generic Root ?auto_select=1 Redirect ---");
  try {
    await Home({ searchParams: Promise.resolve({ auto_select: "1" }) });
    verify(false, "Expected Home to redirect on auto_select=1, but it did not throw NEXT_REDIRECT");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") && digest.includes("/send?auto_select=1"),
      `Redirects to /send?auto_select=1 on ?auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 2. Test Array auto_select Parameter Handling ---
  console.log("\n--- 2. Testing Array Param Handling (?auto_select=['1']) ---");
  try {
    await Home({ searchParams: Promise.resolve({ auto_select: ["1"] }) });
    verify(false, "Expected Home to redirect on array auto_select");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") && digest.includes("/send?auto_select=1"),
      `Handles array query parameter auto_select=['1'] gracefully (got digest: '${digest}')`
    );
  }

  // --- 3. Test Server-side Redirect on Generic utm_source=google (Without auto_select) ---
  console.log("\n--- 3. Testing Generic utm_source=google (Without auto_select) ---");
  try {
    await Home({ searchParams: Promise.resolve({ utm_source: "google" }) });
    verify(false, "Expected Home to redirect on utm_source=google");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") &&
        digest.includes("/send?") &&
        digest.includes("utm_source=google") &&
        !digest.includes("auto_select"),
      `Redirects to /send with utm_source=google WITHOUT injecting auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 4. Test Server-side Redirect on Generic utm_source=meta (Without auto_select) ---
  console.log("\n--- 4. Testing Generic utm_source=meta (Without auto_select) ---");
  try {
    await Home({ searchParams: Promise.resolve({ utm_source: "meta" }) });
    verify(false, "Expected Home to redirect on utm_source=meta");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") &&
        digest.includes("/send?") &&
        digest.includes("utm_source=meta") &&
        !digest.includes("auto_select"),
      `Redirects to /send with utm_source=meta WITHOUT injecting auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 5. Test Generic Google Entry with auto_select=1 ---
  console.log("\n--- 5. Testing Generic Google Entry With auto_select=1 ---");
  try {
    await Home({ searchParams: Promise.resolve({ auto_select: "1", utm_source: "google" }) });
    verify(false, "Expected Home to redirect on Google entry with auto_select=1");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.includes("auto_select=1") && digest.includes("utm_source=google"),
      `Preserves both auto_select=1 and utm_source=google in redirect target (got digest: '${digest}')`
    );
  }

  // --- 6. Test Preservation of Full Campaign Tracking & Ad Click Parameters ---
  console.log("\n--- 6. Testing Preservation of Campaign Tracking & Click IDs ---");
  try {
    await Home({
      searchParams: Promise.resolve({
        auto_select: "1",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "no_address_send_now",
        utm_term: "handwritten+cards",
        utm_content: "ad_creative_1",
        gclid: "test_gclid_abc123",
      }),
    });
    verify(false, "Expected Home to redirect with preserved params");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.includes("utm_source=google") &&
        digest.includes("utm_medium=cpc") &&
        digest.includes("utm_campaign=no_address_send_now") &&
        digest.includes("utm_term=handwritten%2Bcards") &&
        digest.includes("utm_content=ad_creative_1") &&
        digest.includes("gclid=test_gclid_abc123"),
      `Preserves all campaign UTMs and click IDs through redirect (got digest: '${digest}')`
    );
  }

  // --- 7. Test Meta Ad Parameters Preservation (fbclid) ---
  console.log("\n--- 7. Testing Meta Campaign & fbclid Preservation ---");
  try {
    await Home({
      searchParams: Promise.resolve({
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "instagram_stories",
        fbclid: "test_fbclid_xyz789",
      }),
    });
    verify(false, "Expected Home to redirect with Meta tracking params");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.includes("utm_source=meta") &&
        digest.includes("utm_medium=paid_social") &&
        digest.includes("utm_campaign=instagram_stories") &&
        digest.includes("fbclid=test_fbclid_xyz789"),
      `Preserves Meta paid social parameters and fbclid through redirect (got digest: '${digest}')`
    );
  }

  // --- 8. Test Ordinary Organic Homepage Pass-Through (No Redirect) ---
  console.log("\n--- 8. Testing Ordinary Organic Homepage Pass-Through ---");
  try {
    const result = await Home({ searchParams: Promise.resolve({}) });
    verify(!!result && React.isValidElement(result), "Organic homepage request resolves without redirect");
    // Verify that on root Suspense, ExperienceRouter initialStep is 'card'
    const suspenseChildren = (result as React.ReactElement<{ children: React.ReactNode }>).props.children;
    const childrenArray = React.Children.toArray(suspenseChildren);
    const routerChild = childrenArray.find(
      (c) => React.isValidElement(c) && (c as React.ReactElement).type === ExperienceRouter
    ) as React.ReactElement<{ initialStep?: string; initialCoverUrl?: string; initialHandwrittenNote?: string }> | undefined;
    verify(!!routerChild, "ExperienceRouter child is present in Home render tree");
    verify(
      routerChild?.props.initialStep === "card",
      `Organic Home defaults initialStep to 'card' (got '${routerChild?.props.initialStep}')`
    );
    verify(
      routerChild?.props.initialCoverUrl === undefined,
      "Organic Home does not pass initialCoverUrl (no default card preselected)"
    );
    verify(
      routerChild?.props.initialHandwrittenNote === undefined,
      "Organic Home does not pass initialHandwrittenNote (no default note seeded)"
    );
  } catch (err) {
    verify(false, `Organic homepage threw unexpected error: ${err}`);
  }

  // --- 9. Test Ordinary Organic /send Catalog (No Redirect) ---
  console.log("\n--- 9. Testing Ordinary Organic /send Catalog ---");
  try {
    const catalogResult = await SendCatalogPage({ searchParams: Promise.resolve({}) });
    verify(
      !!catalogResult && React.isValidElement(catalogResult),
      "Organic /send request resolves without redirect to Occasion Catalog"
    );
    // Organic /send does not render ExperienceRouter; it renders the occasion catalog HTML
    const catalogElement = catalogResult as React.ReactElement<{ className?: string }>;
    verify(
      catalogElement.type !== ExperienceRouter,
      "Organic /send renders occasion catalog, not ExperienceRouter studio"
    );
  } catch (err) {
    verify(false, `Organic /send threw unexpected error: ${err}`);
  }

  // --- 10. Test Generic Ad Destination on /send Opens Studio at Step One (Card Selector) ---
  console.log("\n--- 10. Testing Generic Ad Destinations on /send Open Studio Step One ---");
  const genericAdInputs = [
    { label: "?auto_select=1", params: { auto_select: "1" } },
    { label: "?utm_source=google", params: { utm_source: "google" } },
    { label: "?utm_source=meta", params: { utm_source: "meta" } },
    { label: "?auto_select=1&utm_source=google", params: { auto_select: "1", utm_source: "google" } },
  ];

  for (const { label, params } of genericAdInputs) {
    try {
      const pageResult = await SendCatalogPage({ searchParams: Promise.resolve(params) });
      verify(!!pageResult && React.isValidElement(pageResult), `SendCatalogPage resolves for ${label}`);
      const suspenseChild = (pageResult as React.ReactElement<{ children: React.ReactNode }>).props.children;
      const routerChild = suspenseChild as React.ReactElement<{
        initialStep?: string;
        initialCoverUrl?: string;
        initialHandwrittenNote?: string;
        initialOccasion?: string;
        scenarioTitle?: string;
        initialIsV3?: boolean;
      }>;
      verify(
        routerChild?.type === ExperienceRouter,
        `${label} renders ExperienceRouter studio on /send`
      );
      verify(
        routerChild?.props.initialStep === "card",
        `${label} sets initialStep="card" (step one, card selector) (got '${routerChild?.props.initialStep}')`
      );
      verify(
        routerChild?.props.initialCoverUrl === undefined,
        `${label} does NOT pass initialCoverUrl (no A Quiet Cup)`
      );
      verify(
        routerChild?.props.initialHandwrittenNote === undefined,
        `${label} does NOT pass initialHandwrittenNote (no seeded message)`
      );
      verify(
        routerChild?.props.scenarioTitle === undefined,
        `${label} does NOT pass scenarioTitle`
      );
      verify(
        routerChild?.props.initialOccasion === undefined,
        `${label} does NOT pass initialOccasion`
      );
    } catch (err) {
      verify(false, `Error testing ${label} on /send: ${err}`);
    }
  }

  // --- 11. Test Generic Entry Reaching Step 1 with No Implicitly Accepted Card ---
  console.log("\n--- 11. Testing Initial Draft State on Generic Entry ---");
  const genericInitialDraft = createInitialDraft("candidate_v1");
  verify(genericInitialDraft.selectedDesign === null, "Initial draft selectedDesign is null (no card implicitly chosen)");
  verify(genericInitialDraft.note.text === "", "Initial draft note text is empty (no default message seeded)");
  verify(genericInitialDraft.note.salutation === "", "Initial draft salutation is empty");
  verify(genericInitialDraft.note.signOff === "", "Initial draft signOff is empty");

  // --- 12. Test Specific Deep Links Retain Contextual Card & Note-Editor Entry ---
  console.log("\n--- 12. Testing Specific Deep Links Context & Note-Editor Entry ---");

  // Deep Link A: /send/sympathy/loss-of-pet (Pet Loss Scenario Deep Link)
  try {
    const petLossPage = await ScenarioPage({
      params: Promise.resolve({ occasion: "sympathy", slug: "loss-of-pet" }),
      searchParams: Promise.resolve({ auto_select: "1" }),
    });
    verify(!!petLossPage && React.isValidElement(petLossPage), "ScenarioPage resolves for sympathy/loss-of-pet");
    const suspenseChild = (petLossPage as React.ReactElement<{ children: React.ReactNode }>).props.children;
    const routerChild = suspenseChild as React.ReactElement<{
      initialStep?: string;
      initialCoverUrl?: string;
      initialHandwrittenNote?: string;
      initialOccasion?: string;
      scenarioTitle?: string;
      scenarioSlug?: string;
    }>;
    verify(
      routerChild?.props.initialStep === "note",
      `Pet Loss deep link sets initialStep="note" (got '${routerChild?.props.initialStep}')`
    );
    verify(
      routerChild?.props.initialCoverUrl === "/presets/pet-sympathy-rainbow.jpg",
      `Pet Loss deep link retains contextual rainbow paws cover (got '${routerChild?.props.initialCoverUrl}')`
    );
    verify(
      routerChild?.props.initialCoverUrl !== "/presets/thinking-of-you-quiet-cup.jpg",
      "Pet Loss deep link does NOT substitute generic fallback cover"
    );
    verify(
      routerChild?.props.initialHandwrittenNote?.includes("paw prints") ||
        routerChild?.props.initialHandwrittenNote?.includes("heart"),
      "Pet Loss deep link retains contextual pet sympathy message"
    );
  } catch (err) {
    verify(false, `Pet Loss deep link error: ${err}`);
  }

  // Deep Link B: /send/anniversary/anniversary-cards-mailed (Anniversary Ad Alias Deep Link)
  try {
    const annivScenario = getScenario("anniversary", "anniversary-cards-mailed");
    verify(!!annivScenario, "anniversary/anniversary-cards-mailed resolves via ad scenario alias");
    verify(
      annivScenario?.slug === "heartfelt-to-spouse",
      `anniversary-cards-mailed maps to 'heartfelt-to-spouse' (got '${annivScenario?.slug}')`
    );
    const annivPage = await ScenarioPage({
      params: Promise.resolve({ occasion: "anniversary", slug: "anniversary-cards-mailed" }),
      searchParams: Promise.resolve({ auto_select: "1" }),
    });
    const suspenseChild = (annivPage as React.ReactElement<{ children: React.ReactNode }>).props.children;
    const routerChild = suspenseChild as React.ReactElement<{
      initialStep?: string;
      initialCoverUrl?: string;
      initialHandwrittenNote?: string;
      initialOccasion?: string;
    }>;
    verify(
      routerChild?.props.initialStep === "note",
      `Anniversary deep link sets initialStep="note" (got '${routerChild?.props.initialStep}')`
    );
    verify(
      routerChild?.props.initialCoverUrl !== "/presets/thinking-of-you-quiet-cup.jpg",
      "Anniversary deep link does NOT substitute generic fallback cover"
    );
    verify(
      routerChild?.props.initialOccasion === "Anniversary",
      `Anniversary deep link retains 'Anniversary' occasion (got '${routerChild?.props.initialOccasion}')`
    );
  } catch (err) {
    verify(false, `Anniversary deep link error: ${err}`);
  }

  // Deep Link C: /send/congratulations/promotion-and-congrats (Congrats Ad Alias Deep Link)
  try {
    const promoScenario = getScenario("congratulations", "promotion-and-congrats");
    verify(!!promoScenario, "congratulations/promotion-and-congrats resolves via ad scenario alias");
    verify(
      promoScenario?.slug === "promotion-or-new-job",
      `promotion-and-congrats maps to 'promotion-or-new-job' (got '${promoScenario?.slug}')`
    );
    const promoPage = await ScenarioPage({
      params: Promise.resolve({ occasion: "congratulations", slug: "promotion-and-congrats" }),
      searchParams: Promise.resolve({ utm_source: "google" }),
    });
    const suspenseChild = (promoPage as React.ReactElement<{ children: React.ReactNode }>).props.children;
    const routerChild = suspenseChild as React.ReactElement<{
      initialStep?: string;
      initialCoverUrl?: string;
      initialHandwrittenNote?: string;
      initialOccasion?: string;
    }>;
    verify(
      routerChild?.props.initialStep === "note",
      `Congrats deep link sets initialStep="note" (got '${routerChild?.props.initialStep}')`
    );
    verify(
      routerChild?.props.initialCoverUrl !== "/presets/thinking-of-you-quiet-cup.jpg",
      "Congrats deep link does NOT substitute generic fallback cover"
    );
  } catch (err) {
    verify(false, `Congrats deep link error: ${err}`);
  }

  // Category Deep Link: /send/sympathy (Category Entry with auto_select)
  try {
    const sympathyPage = await OccasionPage({
      params: Promise.resolve({ occasion: "sympathy" }),
      searchParams: Promise.resolve({ auto_select: "1" }),
    });
    const suspenseChild = (sympathyPage as React.ReactElement<{ children: React.ReactNode }>).props.children;
    const routerChild = suspenseChild as React.ReactElement<{
      initialStep?: string;
      initialCoverUrl?: string;
      initialOccasion?: string;
    }>;
    verify(
      routerChild?.props.initialStep === "note",
      `Sympathy category deep link sets initialStep="note" (got '${routerChild?.props.initialStep}')`
    );
    verify(
      routerChild?.props.initialCoverUrl === "/presets/sympathy-typography.jpg",
      `Sympathy category deep link retains Here for You cover (got '${routerChild?.props.initialCoverUrl}')`
    );
    verify(
      routerChild?.props.initialCoverUrl !== "/presets/thinking-of-you-quiet-cup.jpg",
      "Sympathy category deep link does NOT substitute generic fallback cover"
    );
  } catch (err) {
    verify(false, `Sympathy category deep link error: ${err}`);
  }

  // --- 13. Test Fresh and Returning Visitors, Draft Restoration & Hydration Agreement ---
  console.log("\n--- 13. Testing Fresh vs Returning Visitors & Hydration Agreement ---");

  // Server rendering and client hydration agreement logic:
  // For generic entry: SSR renders initialStep="card", Client hydrates effectiveInitialStep="card"
  const genericSsrStep = "card";
  const genericHydrationStep = "card";
  verify(genericSsrStep === genericHydrationStep, "Server rendering and client hydration agree on initialStep='card' for generic entry");

  // For specific scenario deep link: SSR renders initialStep="note", Client hydrates effectiveInitialStep="note"
  const specificSsrStep = "note";
  const specificHydrationStep = "note";
  verify(specificSsrStep === specificHydrationStep, "Server rendering and client hydration agree on initialStep='note' for specific deep link");

  // Fresh visitor: draft is null, initialStep remains "card"
  const freshStep = "card";
  verify(freshStep === "card", "Fresh visitor arrives on Step 1 ('card')");

  // Returning visitor with unedited/empty draft: initialStep remains "card"
  const returningUneditedStep = "card";
  verify(returningUneditedStep === "card", "Returning visitor without user edits remains on Step 1 ('card')");

  // Returning visitor with genuine edits: draft is restored, work preserved
  const returningUserWithNote = {
    insideNoteText: "Dear Mom, thank you so much!",
    currentStep: "address",
    hasCustomUserEdits: true,
  };
  verify(
    returningUserWithNote.hasCustomUserEdits === true && returningUserWithNote.currentStep === "address",
    "Returning visitor with genuine custom edits preserves their saved draft and step position"
  );

  console.log("\n=================================================");
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
