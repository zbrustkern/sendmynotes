import { Order, ImageCachePoolItem } from "../lib/types";
import {
  saveOrder,
  getOrderById,
  updateOrderStatus,
  saveImageCacheItem,
  claimImageCacheItem,
  getImageCachePoolCollection,
} from "../lib/firebase-admin";
import { generateCoverArt, sanitizeArtPrompt, buildRefinedPrompt } from "../lib/nano-banana";
import { fulfillHandwryttenOrder } from "../lib/handwrytten";
import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "../lib/stripe";

async function runMilestone1Tests() {
  console.log("=================================================");
  console.log("🧪 RUNNING MILESTONE 1 VERIFICATION TESTS");
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

  // 1. Firestore Order Model Test
  console.log("--- 1. Testing Firestore Order Model ---");
  const testOrderId = `order_test_${Date.now()}`;
  const mockOrder: Order = {
    id: testOrderId,
    stripePaymentId: "pi_test_123456",
    customerEmail: "collector@example.com",
    frontImageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1250&h=1750",
    printedMessage: "Happy 30th Birthday, Alex!",
    handwrittenNote: "Wishing you a year filled with wonderful adventures, deep laughter, and quiet peace.",
    fontStyleId: "1",
    recipientAddress: {
      firstName: "Alex",
      lastName: "Rivera",
      street1: "742 Evergreen Terrace",
      city: "Springfield",
      state: "OR",
      zip: "97477",
      country: "USA",
    },
    returnAddress: {
      firstName: "Taylor",
      lastName: "Swift",
      street1: "13 Cornelia Street",
      city: "New York",
      state: "NY",
      zip: "10014",
      country: "USA",
    },
    status: "PENDING_PAYMENT",
    amountInCents: CARD_FLAT_RATE_CENTS,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveOrder(mockOrder);
  const fetchedOrder = await getOrderById(testOrderId);
  assert(fetchedOrder !== null, "Order is successfully retrieved from Firestore");
  assert(fetchedOrder?.id === testOrderId, "Order ID matches saved document");
  assert(fetchedOrder?.recipientAddress.lastName === "Rivera", "Recipient address matches");
  assert(fetchedOrder?.status === "PENDING_PAYMENT", "Status is initially PENDING_PAYMENT");

  await updateOrderStatus(testOrderId, {
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: "hw_order_abc123",
  });
  const updatedOrder = await getOrderById(testOrderId);
  assert(
    updatedOrder?.status === "PROCESSING_HANDWRYTTEN",
    "Status updated to PROCESSING_HANDWRYTTEN"
  );
  assert(
    updatedOrder?.handwryttenOrderId === "hw_order_abc123",
    "Handwrytten order ID recorded"
  );

  // 2. Firestore Image Cache Pool Test
  console.log("\n--- 2. Testing Image Cache Pool Model ---");
  const testCacheId = `cache_${Date.now()}`;
  const mockCacheItem: ImageCachePoolItem = {
    id: testCacheId,
    occasion: "Birthday",
    prompt: "Golden foil balloons at sunset",
    imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d",
    status: "AVAILABLE",
    createdAt: Date.now(),
  };

  await saveImageCacheItem(mockCacheItem);
  await claimImageCacheItem(testCacheId);
  const cacheDoc = await getImageCachePoolCollection().doc(testCacheId).get();
  const cacheData = cacheDoc.data() as ImageCachePoolItem;
  assert(cacheData.status === "CLAIMED", "Cache item status successfully transitioned to CLAIMED");

  // 3. Nano Banana Art Client Test
  console.log("\n--- 3. Testing Nano Banana Client Fallback & Anti-Mockup Prompts ---");
  const artResult = await generateCoverArt({
    prompt: "Whimsical watercolor birthday balloons",
    occasion: "Birthday",
  });
  assert(typeof artResult.imageUrl === "string" && artResult.imageUrl.length > 0, "Returned valid image URL");
  assert(artResult.aspectRatio === "5:7", "Maintains 5:7 greeting card portrait aspect ratio");
  assert(artResult.isMock === true, "Identifies fallback mock mode when no external key");

  // Prompt sanitization & anti-mockup instruction tests
  const sanitized = sanitizeArtPrompt("Vintage roses, elegant 5:7 greeting card cover art");
  assert(!sanitized.includes("greeting card") && !sanitized.includes("cover art"), "Sanitizes meta card phrases from prompt");

  const refined = buildRefinedPrompt("Two heart shaped popsicles with flowers", "Love & Romance");
  assert(refined.includes("Do NOT render an image OF a card"), "Refined prompt explicitly prohibits images OF a card");
  assert(refined.includes("Do NOT render any human hands"), "Refined prompt explicitly prohibits hands/fingers holding card");
  assert(refined.includes("zero borders"), "Refined prompt requests edge-to-edge illustration");

  // 4. Handwrytten Fulfillment Client Test
  console.log("\n--- 4. Testing Handwrytten Fulfillment Client ---");
  const hwResult = await fulfillHandwryttenOrder({
    imageUrl: mockOrder.frontImageUrl,
    printedGreeting: mockOrder.printedMessage,
    handwrittenMessage: mockOrder.handwrittenNote,
    fontId: "1",
    recipient: mockOrder.recipientAddress,
    returnAddress: mockOrder.returnAddress,
  });
  assert(hwResult.success === true, "Handwrytten client successfully dispatches simulated order");
  assert(typeof hwResult.order_id === "string" && hwResult.order_id.startsWith("mock_hw_"), "Generated mock Handwrytten order ID");

  // 5. Stripe Client Test
  console.log("\n--- 5. Testing Stripe Payment Intent Helper ---");
  const stripeResult = await createCardPaymentIntent({
    orderId: testOrderId,
    customerEmail: "buyer@example.com",
  });
  assert(CARD_FLAT_RATE_CENTS === 900, "Flat rate price is exactly $9.00 (900 cents)");
  assert(stripeResult.paymentIntentId.length > 0, "Payment intent ID generated");
  assert(stripeResult.clientSecret !== null, "Client secret provided");

  console.log("\n=================================================");
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone1Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
