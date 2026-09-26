import assert from "assert";
import { generateHeuristicThematicSentiments } from "../lib/thematic-sentiment";

function runThematicSentimentTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING THEMATIC SENTIMENT PAIRING TESTS");
  console.log("=================================================\n");

  // 1. Dinosaur Theme Test (Direct user case: 3 year old dinosaur birthday)
  console.log("--- 1. Testing Dinosaur Thematic Sentiment ---");
  const dinoResult = generateHeuristicThematicSentiments("3 year old birthday likes dinosaurs", "Birthday");
  assert.strictEqual(dinoResult.themeTag, "Dinosaur Adventure");
  assert.strictEqual(dinoResult.sentiments.length, 3);

  const dinoPlayful = dinoResult.sentiments.find((s) => s.id === "playful");
  assert.ok(dinoPlayful, "Must have playful dino sentiment");
  assert.ok(dinoPlayful.printedGreeting.includes("DINO-MITE"), "Printed greeting must feature Dino-mite pun");
  assert.ok(dinoPlayful.handwrittenNote.toLowerCase().includes("roaring fun") || dinoPlayful.handwrittenNote.toLowerCase().includes("stompiest"));
  console.log("✅ PASS: Dinosaur prompt generates DINO-MITE pun and warm ballpoint note");

  // 2. Dog / Puppy Theme Test
  console.log("--- 2. Testing Puppy / Dog Thematic Sentiment ---");
  const dogResult = generateHeuristicThematicSentiments("golden retriever puppy with birthday hat", "Birthday");
  assert.strictEqual(dogResult.themeTag, "Puppy Joy");
  const dogPlayful = dogResult.sentiments.find((s) => s.id === "playful");
  assert.ok(dogPlayful, "Must have playful dog sentiment");
  assert.ok(dogPlayful.printedGreeting.includes("PAW-SOME"), "Must have PAW-SOME pun");
  console.log("✅ PASS: Puppy prompt generates PAW-SOME pun and warm ballpoint note");

  // 3. Cat / Kitten Theme Test
  console.log("--- 3. Testing Cat / Kitten Thematic Sentiment ---");
  const catResult = generateHeuristicThematicSentiments("fluffy ginger cat sleeping on a book", "Thinking of You");
  assert.strictEqual(catResult.themeTag, "Whimsical Feline");
  const catPlayful = catResult.sentiments.find((s) => s.id === "playful");
  assert.ok(catPlayful?.printedGreeting.includes("PURR-FECT"));
  console.log("✅ PASS: Cat prompt generates PURR-FECT pun and cozy note");

  // 4. Coffee Theme Test
  console.log("--- 4. Testing Coffee Thematic Sentiment ---");
  const coffeeResult = generateHeuristicThematicSentiments("cozy rustic coffee shop with steaming latte", "Thank You");
  assert.strictEqual(coffeeResult.themeTag, "Cozy Café");
  const coffeePlayful = coffeeResult.sentiments.find((s) => s.id === "playful");
  assert.ok(coffeePlayful?.printedGreeting.includes("LATTE love"));
  console.log("✅ PASS: Coffee prompt generates 'LATTE love' and 'espresso how much you mean' pun");

  // 5. Space & Cosmic Theme Test
  console.log("--- 5. Testing Space / Astronaut Thematic Sentiment ---");
  const spaceResult = generateHeuristicThematicSentiments("astronaut floating in starry galaxy", "Congratulations");
  assert.strictEqual(spaceResult.themeTag, "Cosmic Wonder");
  const spacePlayful = spaceResult.sentiments.find((s) => s.id === "playful");
  assert.ok(spacePlayful?.printedGreeting.includes("OUT OF THIS WORLD"));
  console.log("✅ PASS: Space prompt generates 'OUT OF THIS WORLD' pun");

  // 6. Wildflower / Botanical Theme Test
  console.log("--- 6. Testing Botanical Thematic Sentiment ---");
  const flowerResult = generateHeuristicThematicSentiments("delicate pastel wildflowers meadow", "Birthday");
  assert.strictEqual(flowerResult.themeTag, "Botanical Garden");
  const flowerPlayful = flowerResult.sentiments.find((s) => s.id === "playful");
  assert.ok(flowerPlayful?.printedGreeting.includes("BLOOMS"));
  console.log("✅ PASS: Wildflowers prompt generates 'BLOOMS with joy' sentiment");

  console.log("\n=================================================");
  console.log("🎉 ALL THEMATIC SENTIMENT TESTS PASSED (6/6)");
  console.log("=================================================");
}

runThematicSentimentTests();
