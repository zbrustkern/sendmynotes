import { Order, ImageCachePoolItem } from "../lib/types";
import {
  saveOrder,
  getOrderById,
  updateOrderStatus,
  saveImageCacheItem,
  claimImageCacheItem,
  getImageCachePoolCollection,
} from "../lib/firebase-admin";
import { fulfillHandwryttenOrder } from "../lib/handwrytten";
import { CARD_FLAT_RATE_CENTS } from "../lib/stripe";

async function runMilestone4Tests() {
  console.log("=================================================");
  console.log("🧪 RUNNING MILESTONE 4 END-TO-END FULFILLMENT TESTS");
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

  // 1. Setup Draft Order in Firestore
  console.log("--- 1. Setting up Draft Order in Firestore ---");
  const testOrderId = `order_e2e_${Date.now()}`;
  const testCoverUrl = "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1250&h=1750";

  const initialOrder: Order = {
    id: testOrderId,
    stripePaymentId: `pi_test_${Date.now()}`,
    customerEmail: "happycustomer@example.com",
    frontImageUrl: testCoverUrl,
    printedMessage: "Happy Birthday from all of us!",
    handwrittenNote: "Wishing you countless laughs, great health, and unforgettable adventures this year!",
    fontStyleId: "1",
    recipientAddress: {
      firstName: "Eleanor",
      lastName: "Vance",
      street1: "100 Hill House Road",
      city: "Boston",
      state: "MA",
      zip: "02108",
      country: "USA",
    },
    returnAddress: {
      firstName: "Luke",
      lastName: "Sanderson",
      street1: "42 Beacon Street",
      city: "Boston",
      state: "MA",
      zip: "02108",
      country: "USA",
    },
    status: "PENDING_PAYMENT",
    amountInCents: CARD_FLAT_RATE_CENTS,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveOrder(initialOrder);
  const createdDoc = await getOrderById(testOrderId);
  assert(createdDoc?.status === "PENDING_PAYMENT", "Order successfully initiated with PENDING_PAYMENT");

  // 2. Setup Cache Pool Entry
  console.log("\n--- 2. Setting up Image Cache Pool Entry ---");
  const cacheId = `cache_e2e_${Date.now()}`;
  const cacheItem: ImageCachePoolItem = {
    id: cacheId,
    occasion: "Birthday",
    prompt: "Golden pastel balloons",
    imageUrl: testCoverUrl,
    status: "AVAILABLE",
    createdAt: Date.now(),
  };
  await saveImageCacheItem(cacheItem);

  // 3. Simulate Stripe Webhook Execution on payment_intent.succeeded
  console.log("\n--- 3. Simulating Stripe Webhook Fulfillment Execution ---");
  const simulatedStripeEvent = {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_test_${Date.now()}`,
        amount: CARD_FLAT_RATE_CENTS,
        status: "succeeded",
        receipt_email: "happycustomer@example.com",
        metadata: {
          orderId: testOrderId,
        },
      },
    },
  };

  // Webhook handler logic execution:
  const orderToFulfill = await getOrderById(simulatedStripeEvent.data.object.metadata.orderId);
  assert(orderToFulfill !== null, "Found order matching Stripe event metadata");

  // Update status to PAYMENT_RECEIVED
  await updateOrderStatus(testOrderId, {
    status: "PAYMENT_RECEIVED",
    stripePaymentId: simulatedStripeEvent.data.object.id,
  });

  // Call Handwrytten Fulfillment
  console.log("Calling fulfillHandwryttenOrder with full payload...");
  const fulfillmentResult = await fulfillHandwryttenOrder({
    imageUrl: orderToFulfill!.frontImageUrl,
    printedGreeting: orderToFulfill!.printedMessage,
    handwrittenMessage: orderToFulfill!.handwrittenNote,
    fontId: orderToFulfill!.fontStyleId,
    recipient: orderToFulfill!.recipientAddress,
    returnAddress: orderToFulfill!.returnAddress,
  });

  assert(fulfillmentResult.success === true, "Handwrytten order execution succeeded");
  assert(typeof fulfillmentResult.order_id === "string", "Valid Handwrytten Order ID returned");

  // Update order status to PROCESSING_HANDWRYTTEN
  await updateOrderStatus(testOrderId, {
    status: "PROCESSING_HANDWRYTTEN",
    handwryttenOrderId: fulfillmentResult.order_id,
  });

  // Claim image in cache pool
  await claimImageCacheItem(cacheId);

  // 4. Verify Final State
  console.log("\n--- 4. Verifying Final Database State ---");
  const finalOrder = await getOrderById(testOrderId);
  assert(
    finalOrder?.status === "PROCESSING_HANDWRYTTEN",
    "Order status updated to PROCESSING_HANDWRYTTEN"
  );
  assert(
    finalOrder?.handwryttenOrderId === fulfillmentResult.order_id,
    "Handwrytten external order ID recorded on order document"
  );

  const claimedDoc = await getImageCachePoolCollection().doc(cacheId).get();
  const claimedItem = claimedDoc.data() as ImageCachePoolItem;
  assert(claimedItem.status === "CLAIMED", "Cover image marked as CLAIMED in cache pool");

  console.log("\n=================================================");
  console.log(`Pipeline Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runMilestone4Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
