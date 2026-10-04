import {
  getScenario,
  getScenariosByOccasion,
  getAllOccasions,
  normalizeOccasionSlug,
  OCCASION_ALIASES,
  OCCASION_METADATA,
} from "../lib/seo-scenarios";

console.log("=================================================");
console.log("🧪 RUNNING AD SCENARIO & ROUTING RESILIENCE TESTS");
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

// --- 1. Test Disapproved Ad URLs Specifically Flagged by Google Ads ---
console.log("--- 1. Testing Specific Google Ads Target URLs ---");

// URL from screenshot: /send/sympathy/loss-of-pet
const petLossScenario = getScenario("sympathy", "loss-of-pet");
assert(!!petLossScenario, "sympathy/loss-of-pet resolves to a scenario");
assert(
  petLossScenario?.slug === "loss-of-beloved-pet",
  `sympathy/loss-of-pet maps to canonical slug 'loss-of-beloved-pet' (got '${petLossScenario?.slug}')`
);

// Anniversary Cards Mailed ad: /send/anniversary/anniversary-cards-mailed
const anniversaryScenario = getScenario("anniversary", "anniversary-cards-mailed");
assert(!!anniversaryScenario, "anniversary/anniversary-cards-mailed resolves");
assert(
  anniversaryScenario?.slug === "heartfelt-to-spouse",
  `anniversary/anniversary-cards-mailed maps to 'heartfelt-to-spouse' (got '${anniversaryScenario?.slug}')`
);

// Promotion & Congrats ad: /send/congratulations/promotion-and-congrats
const promoScenario = getScenario("congratulations", "promotion-and-congrats");
assert(!!promoScenario, "congratulations/promotion-and-congrats resolves");
assert(
  promoScenario?.slug === "promotion-or-new-job",
  `congratulations/promotion-and-congrats maps to 'promotion-or-new-job' (got '${promoScenario?.slug}')`
);

// Birthday Cards Mailed ad: /send/birthday/birthday-cards-mailed
const birthdayScenario = getScenario("birthday", "birthday-cards-mailed");
assert(!!birthdayScenario, "birthday/birthday-cards-mailed resolves");
assert(
  birthdayScenario?.slug === "milestone-birthday",
  `birthday/birthday-cards-mailed maps to 'milestone-birthday' (got '${birthdayScenario?.slug}')`
);

// --- 2. Testing Occasion Aliases ---
console.log("\n--- 2. Testing Occasion Aliases ---");

assert(normalizeOccasionSlug("congrats") === "congratulations", "congrats normalizes to congratulations");
assert(normalizeOccasionSlug("birthdays") === "birthday", "birthdays normalizes to birthday");
assert(normalizeOccasionSlug("anniversaries") === "anniversary", "anniversaries normalizes to anniversary");
assert(normalizeOccasionSlug("get-well-soon") === "get-well", "get-well-soon normalizes to get-well");
assert(normalizeOccasionSlug("thankyou") === "thank-you", "thankyou normalizes to thank-you");
assert(normalizeOccasionSlug("condolences") === "sympathy", "condolences normalizes to sympathy");

// Alternate occasion slug matching
const congratsScenario = getScenario("congrats", "promotion-congrats");
assert(!!congratsScenario, "congrats/promotion-congrats resolves via occasion alias");
assert(congratsScenario?.slug === "promotion-or-new-job", "congrats/promotion-congrats maps correctly");

// --- 3. Testing Semantic & Keyword Fuzzy Matching ---
console.log("\n--- 3. Testing Semantic & Tokenized Fuzzy Matching ---");

const dogLoss = getScenario("sympathy", "dog-loss");
assert(dogLoss?.slug === "loss-of-beloved-pet", "sympathy/dog-loss resolves to loss-of-beloved-pet");

const catLoss = getScenario("sympathy", "cat-sympathy");
assert(catLoss?.slug === "loss-of-beloved-pet", "sympathy/cat-sympathy resolves to loss-of-beloved-pet");

const momLoss = getScenario("sympathy", "loss-of-mother");
assert(momLoss?.slug === "loss-of-parent", "sympathy/loss-of-mother resolves to loss-of-parent");

const closingGift = getScenario("thank-you", "client-closing-gift");
assert(closingGift?.slug === "client-closing-appreciation", "thank-you/client-closing-gift resolves correctly");

// --- 4. Testing Resilient Fallback Protection Against 404s ---
console.log("\n--- 4. Testing Fallback Protection Against 404s ---");

// If an ad agency runs an ad with an unrecognized tracking slug under /send/sympathy/any-custom-slug
const customAdSlug = getScenario("sympathy", "google-ads-spring-campaign-2026");
assert(
  !!customAdSlug && customAdSlug.occasionSlug === "sympathy",
  "Unknown slug under /send/sympathy falls back to primary sympathy scenario (no 404)"
);

const customAnniversarySlug = getScenario("anniversary", "google-ad-special-offer");
assert(
  !!customAnniversarySlug && customAnniversarySlug.occasionSlug === "anniversary",
  "Unknown slug under /send/anniversary falls back to primary anniversary scenario (no 404)"
);

// Cross-occasion query (slug placed in wrong category)
const crossOccasion = getScenario("random-category", "loss-of-pet");
assert(
  crossOccasion?.slug === "loss-of-beloved-pet",
  "Scenario found by slug even if occasion parameter is non-canonical"
);

// --- 5. Testing Occasion-Level Catalog & Metadata ---
console.log("\n--- 5. Testing Occasion-Level Catalog & Metadata ---");

const occasions = getAllOccasions();
assert(occasions.length >= 6, `Found ${occasions.length} distinct occasions`);

for (const occ of occasions) {
  const meta = OCCASION_METADATA[occ.occasionSlug];
  assert(!!meta, `Occasion metadata exists for '${occ.occasionSlug}'`);
  assert(meta?.headline.length > 5, `Occasion headline present for '${occ.occasionSlug}'`);
  const scenariosForOcc = getScenariosByOccasion(occ.occasionSlug);
  assert(scenariosForOcc.length > 0, `Scenarios exist for '${occ.occasionSlug}'`);
}

console.log("\n=================================================");
console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
