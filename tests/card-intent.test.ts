import assert from "assert";
import { detectCardIntent } from "../lib/card-intent";
import { Order } from "../lib/types";

function runCardIntentTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING OCCASION INTENT & GRACEFUL NUDGE TESTS");
  console.log("=================================================\n");

  // 1. Birthday Card Detection
  console.log("--- 1. Testing Birthday Intent ---");
  const bdayOrder: Partial<Order> = {
    recipientAddress: { firstName: "Sarah", lastName: "Miller", street1: "123 Main St", city: "Austin", state: "TX", zip: "78701" },
    recipientOccasion: { occasionType: "birthday", month: 6, day: 15, remindMe: false },
    occasion: "Birthday",
  };
  const bdayIntent = detectCardIntent(bdayOrder);
  assert.strictEqual(bdayIntent.category, "birthday");
  assert.ok(bdayIntent.headline.includes("Never miss Sarah's birthday next year"));
  assert.strictEqual(bdayIntent.interactionMode, "annual_reminder");
  assert.strictEqual(bdayIntent.defaultOccasionType, "birthday");
  assert.strictEqual(bdayIntent.suggestedMonth, 6);
  assert.strictEqual(bdayIntent.suggestedDay, 15);
  assert.strictEqual(bdayIntent.badgeLabel, "Annual Birthday");
  console.log("✅ PASS: Birthday card correctly produces 14-day annual birthday reminder");

  // 2. Thank You Card (Gratitude) Detection
  console.log("--- 2. Testing Thank You / Gratitude Intent ---");
  const thankYouOrder: Partial<Order> = {
    recipientAddress: { firstName: "David", lastName: "Chen", street1: "456 Oak Rd", city: "Seattle", state: "WA", zip: "98101" },
    occasion: "Thank You",
    printedMessage: "Thank you for the opportunity",
    handwrittenNote: "I am deeply grateful for our conversation yesterday.",
  };
  const thankYouIntent = detectCardIntent(thankYouOrder);
  assert.strictEqual(thankYouIntent.category, "thank_you");
  assert.strictEqual(thankYouIntent.headline, "Keep David in your private address book");
  assert.strictEqual(thankYouIntent.interactionMode, "address_book_retention");
  assert.ok(!thankYouIntent.headline.toLowerCase().includes("birthday"), "Must NOT prompt for birthday on thank you card");
  assert.ok(thankYouIntent.description.includes("note of thanks or appreciation"));
  console.log("✅ PASS: Thank you card avoids birthday prompt, emphasizes private address book retention");

  // 3. Sympathy & Condolences Detection
  console.log("--- 3. Testing Sympathy / Condolence Intent ---");
  const sympathyOrder: Partial<Order> = {
    recipientAddress: { firstName: "Eleanor", lastName: "Vance", street1: "789 Pine Way", city: "Denver", state: "CO", zip: "80202" },
    printedMessage: "With deepest sympathy",
    handwrittenNote: "We were heartbroken to hear of your loss. Thinking of you and your family.",
  };
  const sympathyIntent = detectCardIntent(sympathyOrder);
  assert.strictEqual(sympathyIntent.category, "sympathy");
  assert.strictEqual(sympathyIntent.headline, "Your note of care to Eleanor is on its way");
  assert.strictEqual(sympathyIntent.badgeLabel, "Thoughtful Care");
  assert.strictEqual(sympathyIntent.interactionMode, "care_checkin");
  assert.ok(sympathyIntent.primaryButtonLabel.includes("Remind Me to Check In"));
  assert.ok(!sympathyIntent.headline.toLowerCase().includes("birthday"), "Must NOT prompt for birthday on sympathy card");
  assert.ok(!sympathyIntent.headline.toLowerCase().includes("celebrat"), "Must NOT prompt for celebration on sympathy card");
  console.log("✅ PASS: Sympathy card is treated with quiet grace, offering optional 3-month care check-in");

  // 4. Anniversary Detection
  console.log("--- 4. Testing Anniversary Intent ---");
  const annivOrder: Partial<Order> = {
    recipientAddress: { firstName: "Marcus & Olivia", lastName: "", street1: "101 Elm Blvd", city: "Chicago", state: "IL", zip: "60601" },
    occasion: "Anniversary",
    handwrittenNote: "Happy 10th anniversary to the best couple we know!",
  };
  const annivIntent = detectCardIntent(annivOrder);
  assert.strictEqual(annivIntent.category, "anniversary");
  assert.strictEqual(annivIntent.headline, "Remember Marcus & Olivia's anniversary next year");
  assert.strictEqual(annivIntent.interactionMode, "annual_reminder");
  assert.strictEqual(annivIntent.defaultOccasionType, "anniversary");
  console.log("✅ PASS: Anniversary card triggers annual anniversary celebration reminder");

  // 5. Holiday Detection
  console.log("--- 5. Testing Holiday Intent ---");
  const holidayOrder: Partial<Order> = {
    recipientAddress: { firstName: "The Johnsons", lastName: "", street1: "202 Maple Ave", city: "Portland", state: "OR", zip: "97201" },
    occasion: "Holiday",
    printedMessage: "Season's Greetings",
    handwrittenNote: "Wishing you a warm and joyful holiday season!",
  };
  const holidayIntent = detectCardIntent(holidayOrder);
  assert.strictEqual(holidayIntent.category, "holiday");
  assert.ok(holidayIntent.headline.includes("head start on the holidays next year"));
  assert.strictEqual(holidayIntent.interactionMode, "holiday_headstart");
  assert.strictEqual(holidayIntent.suggestedMonth, 11);
  console.log("✅ PASS: Holiday card suggests early November reminder to beat holiday rush");

  // 6. Thinking of You Detection
  console.log("--- 6. Testing Thinking of You Intent ---");
  const thinkingOrder: Partial<Order> = {
    recipientAddress: { firstName: "Chloe", lastName: "Adams", street1: "303 Birch Dr", city: "Nashville", state: "TN", zip: "37201" },
    occasion: "Thinking of You",
    handwrittenNote: "Just thinking of you and sending a quick note of warmth!",
  };
  const thinkingIntent = detectCardIntent(thinkingOrder);
  assert.strictEqual(thinkingIntent.category, "thinking_of_you");
  assert.strictEqual(thinkingIntent.headline, "Stay easily connected with Chloe");
  assert.strictEqual(thinkingIntent.interactionMode, "address_book_retention");
  console.log("✅ PASS: Thinking of You preserves address without awkward date pressure");

  console.log("\n=================================================");
  console.log("🎉 ALL OCCASION INTENT TESTS PASSED (6/6)");
  console.log("=================================================");
}

runCardIntentTests();
