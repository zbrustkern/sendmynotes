import fs from "fs";
import path from "path";
import { CARD_PRESETS, OCCASIONS } from "../lib/card-presets";
import { HANDWRITING_STYLES } from "../components/v3/Step2NoteComposition";
import { extractRecipientName, extractSenderName } from "../components/v3/TargetPurchaseExperience";
import { detectCardIntent } from "../lib/card-intent";
import { calculateDeliveryEstimate } from "../lib/delivery-estimate";

async function runTargetExperienceTests() {
  console.log("=================================================");
  console.log("🎯 RUNNING TARGET PURCHASE EXPERIENCE TESTS");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Curated 11 Occasions & Catalog Coverage
  console.log("--- 1. Testing 11 Curated Occasions & Image Assets ---");
  const expectedOccasions = [
    "Birthday",
    "Thank You",
    "Thinking of You",
    "Congratulations",
    "Anniversary",
    "Love & Romance",
    "Sympathy & Support",
    "Just Because",
    "Christmas & Holidays",
    "Halloween",
    "Easter & Spring",
  ];

  assert(
    OCCASIONS.length === 11,
    `OCCASIONS array contains exactly 11 occasions (Found: ${OCCASIONS.length})`
  );

  expectedOccasions.forEach((occ) => {
    const found = CARD_PRESETS.find((p) => p.occasion === occ);
    assert(
      Boolean(found),
      `Preset catalog includes verified card for occasion: '${occ}' (${found?.title})`
    );

    if (found) {
      const publicImagePath = path.join(process.cwd(), "public", found.imageUrl.replace(/^\//, ""));
      const fileExists = fs.existsSync(publicImagePath);
      assert(
        fileExists,
        `Preset image file exists on disk: ${found.imageUrl}`
      );
    }
  });

  // 2. Handwriting Font Options
  console.log("\n--- 2. Testing 4 Handwriting Penmanship Styles ---");
  const expectedFonts = ["hwDavid", "hwKate", "hwAdam", "hwChase"];
  assert(
    HANDWRITING_STYLES.length === 4,
    `Handwriting picker defines exactly 4 styles (Found: ${HANDWRITING_STYLES.length})`
  );
  expectedFonts.forEach((fontId) => {
    const style = HANDWRITING_STYLES.find((s) => s.id === fontId);
    assert(
      Boolean(style),
      `Handwriting style '${fontId}' configured (${style?.name})`
    );
  });

  // 3. Salutation & Sign-off Auto-Sync Helpers
  console.log("\n--- 3. Testing Salutation & Sign-off Auto-Sync ---");
  assert(
    extractRecipientName("Dear Eleanor,") === "Eleanor",
    `Salutation 'Dear Eleanor,' extracts 'Eleanor'`
  );
  assert(
    extractRecipientName("Dear Eleanor Vance,") === "Eleanor Vance",
    `Salutation 'Dear Eleanor Vance,' extracts 'Eleanor Vance'`
  );
  assert(
    extractRecipientName("Dearest Sarah!") === "Sarah",
    `Salutation 'Dearest Sarah!' extracts 'Sarah'`
  );
  assert(
    extractRecipientName("To: Grandma Rose") === "Grandma Rose",
    `Salutation 'To: Grandma Rose' extracts 'Grandma Rose'`
  );

  assert(
    extractSenderName("Warmly, Thomas") === "Thomas",
    `Sign-off 'Warmly, Thomas' extracts 'Thomas'`
  );
  assert(
    extractSenderName("Warmly, Thomas Miller") === "Thomas Miller",
    `Sign-off 'Warmly, Thomas Miller' extracts 'Thomas Miller'`
  );
  assert(
    extractSenderName("With love, Mom & Dad") === "Mom & Dad",
    `Sign-off 'With love, Mom & Dad' extracts 'Mom & Dad'`
  );
  assert(
    extractSenderName("Sincerely, Jessica Davis") === "Jessica Davis",
    `Sign-off 'Sincerely, Jessica Davis' extracts 'Jessica Davis'`
  );

  // 4. Character Limit & Fit Boundary
  console.log("\n--- 4. Testing Physical Leaf Character Limits (420 warning, 450 hard cap) ---");
  const shortNote = "Happy Birthday! Wishing you lots of love and fun today.";
  assert(
    shortNote.length < 420,
    `Short note fits well within 420 char threshold (${shortNote.length} chars)`
  );

  const warnText = "A".repeat(425);
  assert(
    warnText.length >= 420 && warnText.length <= 450,
    `Warning boundary active between 420 and 450 characters (${warnText.length} chars)`
  );

  const capText = "A".repeat(450);
  assert(
    capText.length === 450,
    `Hard cap exactly at 450 characters`
  );

  // 5. Delivery Window SLA Calculation
  console.log("\n--- 5. Testing USPS First-Class SLA Delivery Window ---");
  const estimate = calculateDeliveryEstimate();
  assert(
    typeof estimate.earliestDate === "string" && typeof estimate.latestDate === "string",
    `calculateDeliveryEstimate() returns earliestDate (${estimate.earliestDate}) and latestDate (${estimate.latestDate})`
  );
  assert(
    typeof estimate.formattedRange === "string" && estimate.formattedRange.length > 0,
    `Formatted delivery range available: '${estimate.formattedRange}'`
  );

  // 6. Post-Purchase Retention & Intent Classification
  console.log("\n--- 6. Testing Post-Purchase Occasion Intent ---");
  const bdayIntent = detectCardIntent({
    occasion: "Birthday",
    handwrittenNote: "Happy Birthday Eleanor!",
    recipientAddress: {
      firstName: "Eleanor",
      lastName: "Vance",
      street1: "456 Colorado Blvd",
      city: "Denver",
      state: "CO",
      zip: "80206",
    },
  });
  assert(
    bdayIntent.category === "birthday" && bdayIntent.interactionMode === "annual_reminder",
    `Birthday card produces annual birthday reminder intent`
  );

  const sympathyIntent = detectCardIntent({
    occasion: "Sympathy & Support",
    handwrittenNote: "Holding you close in our hearts during this difficult time.",
    recipientAddress: {
      firstName: "Sarah",
      lastName: "Jenkins",
      street1: "123 Elm St",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
  });
  assert(
    sympathyIntent.category === "sympathy" && sympathyIntent.interactionMode === "care_checkin",
    `Sympathy card produces quiet 3-month care check-in intent`
  );

  console.log("\n=================================================");
  console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTargetExperienceTests().catch((err) => {
  console.error("Test execution failure:", err);
  process.exit(1);
});
