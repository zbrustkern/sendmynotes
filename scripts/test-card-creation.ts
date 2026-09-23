import fs from "fs";
import path from "path";

// Load .env.local if present
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, ...v] = trimmed.split("=");
      process.env[k.trim()] = v.join("=").trim();
    }
  }
}

import { fulfillHandwryttenOrder, getOrCreateBackplateImageId } from "../lib/handwrytten";

async function runTest() {
  console.log("=== Testing Aster & Blanche Backplate & Handwrytten Card Creation ===");

  const apiKey = process.env.HANDWRYTTEN_API_KEY;
  if (!apiKey) {
    console.error("No HANDWRYTTEN_API_KEY found in .env.local");
    process.exit(1);
  }

  // 1. Verify getOrCreateBackplateImageId
  console.log("\n1. Testing getOrCreateBackplateImageId()...");
  const backplateId = await getOrCreateBackplateImageId(apiKey);
  console.log("-> Returned Backplate ID:", backplateId);

  if (!backplateId) {
    throw new Error("Failed to get or create backplate ID!");
  }

  // 2. Test Custom Card creation with Cover + Backplate + Header Text
  console.log("\n2. Testing fulfillHandwryttenOrder pipeline with backplate & header_text...");
  const result = await fulfillHandwryttenOrder({
    imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1250&h=1750&q=80",
    printedGreeting: "Wishing you a wonderful celebration.",
    handwrittenMessage: "Dear Ezekiel,\nThis is a test verification of the Aster & Blanche Press backplate and custom interior header.\nWarmly,\nSendMyNotes Studio",
    fontId: "hwAdam",
    recipient: {
      firstName: "Ezekiel",
      lastName: "Brustkern",
      street1: "700 N Western Ave",
      city: "Lake Forest",
      state: "IL",
      zip: "60045",
    },
    returnAddress: {
      firstName: "Aster & Blanche",
      lastName: "Press",
      street1: "700 N Western Ave",
      city: "Lake Forest",
      state: "IL",
      zip: "60045",
    },
  });

  console.log("\n=== Fulfillment Result ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.success && result.order_id) {
    console.log(`\nSUCCESS: Card created and order dispatched with ID ${result.order_id}!`);
  } else {
    console.error("\nFAILED:", result.error);
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test failed with exception:", err);
  process.exit(1);
});
