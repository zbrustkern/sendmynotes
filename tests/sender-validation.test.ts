import { NextRequest } from "next/server";
import { POST as createIntentPost } from "../app/api/checkout/create-intent/route";
import { POST as completeFreeOrderPost } from "../app/api/checkout/complete-free-order/route";
import { processPaidOrder, validatePersonalSender } from "../lib/order-processor";
import { fulfillHandwryttenOrder } from "../lib/handwrytten";
import {
  saveOrder,
  getOrderById,
  saveDiscountCode,
} from "../lib/firebase-admin";
import { Order, DiscountCode } from "../lib/types";
import { issueOfferPriceQuote, reserveOfferForCheckout } from "../lib/offer-engine";

async function runSenderValidationTests() {
  console.log("=================================================");
  console.log("📮 RUNNING SENDER VALIDATION & BRAND REMOVAL TESTS (S0-06)");
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

  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Unit Validation of Personal Sender Address
    // ---------------------------------------------------------------------------
    console.log("--- 1. Testing validatePersonalSender Unit Invariants ---");

    assert(
      validatePersonalSender(null).valid === false,
      "Null return address is rejected"
    );

    assert(
      validatePersonalSender({}).valid === false,
      "Empty return address object is rejected"
    );

    assert(
      validatePersonalSender({
        street1: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }).valid === false,
      "Missing sender first name is rejected"
    );

    assert(
      validatePersonalSender({
        firstName: "Aster & Blanche",
        lastName: "Press",
        street1: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }).valid === false,
      "Brand name 'Aster & Blanche' / 'Press' is rejected as personal sender"
    );

    assert(
      validatePersonalSender({
        firstName: "Thomas",
        lastName: "Miller",
        street1: "123 Main St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }).valid === true,
      "Valid personal sender name and complete address is accepted"
    );

    // ---------------------------------------------------------------------------
    // TEST 2: Pre-fulfillment Rejection at create-intent Endpoint
    // ---------------------------------------------------------------------------
    console.log("\n--- 2. Testing Pre-Fulfillment Validation in create-intent ---");

    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    process.env.ALLOW_LOCAL_MOCK_PAYMENTS = "true";

    const basePayload = {
      frontImageUrl: "https://example.com/cover.jpg",
      printedMessage: "Happy Birthday",
      handwrittenNote: "Have a great day!",
      recipientAddress: {
        firstName: "Sarah",
        lastName: "Connor",
        street1: "742 Evergreen Terr",
        city: "Springfield",
        state: "OR",
        zip: "97477",
      },
      customerEmail: "sender@example.com",
    };

    // 2A. Request with missing return address name
    const missingSenderReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        returnAddress: {
          firstName: "",
          street1: "100 Pine St",
          city: "Seattle",
          state: "WA",
          zip: "98101",
        },
      }),
    });

    const missingSenderRes = await createIntentPost(missingSenderReq);
    const missingSenderData = await missingSenderRes.json();
    assert(
      missingSenderRes.status === 400 && Boolean(missingSenderData.error),
      `create-intent rejects missing sender name with HTTP 400 (${missingSenderData.error})`
    );

    // 2B. Request with brand name "Aster & Blanche"
    const brandSenderReq = new NextRequest("http://localhost:3000/api/checkout/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        returnAddress: {
          firstName: "Aster & Blanche",
          lastName: "Press",
          street1: "100 Pine St",
          city: "Seattle",
          state: "WA",
          zip: "98101",
        },
      }),
    });

    const brandSenderRes = await createIntentPost(brandSenderReq);
    const brandSenderData = await brandSenderRes.json();
    assert(
      brandSenderRes.status === 400 && brandSenderData.error.includes("Aster & Blanche"),
      `create-intent rejects brand name 'Aster & Blanche' with HTTP 400 (${brandSenderData.error})`
    );

    // ---------------------------------------------------------------------------
    // TEST 3: Recovery & Safety in order-processor if Order Reaches Processing
    // ---------------------------------------------------------------------------
    console.log("\n--- 3. Testing Recovery in order-processor for Defective Orders ---");

    const defectiveOrderId = `order_defective_sender_${Date.now()}`;
    const defectiveOrder: Order = {
      id: defectiveOrderId,
      customerEmail: "victim@example.com",
      frontImageUrl: "https://example.com/cover.jpg",
      printedMessage: "Hello",
      handwrittenNote: "Note",
      fontStyleId: "1",
      recipientAddress: {
        firstName: "Jane",
        lastName: "Doe",
        street1: "123 Elm St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      returnAddress: {
        firstName: "", // Defective: missing sender name
        lastName: "",
        street1: "500 Oak St",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      status: "PENDING_PAYMENT",
      amountInCents: 900,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveOrder(defectiveOrder);

    const defectiveProcessResult = await processPaidOrder(
      defectiveOrderId,
      "pi_simulated_paid_defective",
      "victim@example.com",
      { paymentMode: "local_mock" }
    );

    assert(
      defectiveProcessResult.success === false &&
        defectiveProcessResult.status === "QUEUED_FOR_FULFILLMENT",
      "Defective order without sender name transitions to QUEUED_FOR_FULFILLMENT"
    );

    const orderInDb = await getOrderById(defectiveOrderId);
    assert(
      orderInDb?.status === "QUEUED_FOR_FULFILLMENT" &&
        Boolean(orderInDb?.fulfillmentError) &&
        !orderInDb?.handwryttenOrderId,
      `Order placed in recoverable operator-visible state (error: ${orderInDb?.fulfillmentError})`
    );

    // ---------------------------------------------------------------------------
    // TEST 4: Supplier Payload Mocking: Never Produces Aster & Blanche Sender
    // ---------------------------------------------------------------------------
    console.log("\n--- 4. Testing Supplier Dispatch Payload (Mocked Supplier) ---");

    process.env.HANDWRYTTEN_API_KEY = "test_handwrytten_key_audit";

    let singleStepPayloadCaptured: any = null;
    let customCardPayloadCaptured: any = null;

    const sampleCoverDataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (urlStr.includes("example.com")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }

      if (urlStr.includes("/v2/cards/uploadCustomLogo")) {
        return new Response(JSON.stringify({ status: "ok", id: 88881 }), { status: 200 });
      }

      if (urlStr.includes("/v2/cards/createCustomCard")) {
        if (init?.body) {
          customCardPayloadCaptured = JSON.parse(init.body as string);
        }
        return new Response(JSON.stringify({ status: "ok", card_id: 99991 }), { status: 200 });
      }

      if (urlStr.includes("/v2/orders/singleStepOrder")) {
        if (init?.body) {
          singleStepPayloadCaptured = JSON.parse(init.body as string);
        }
        return new Response(JSON.stringify({ status: "ok", order_id: 1234567 }), { status: 200 });
      }

      return originalFetch(input, init);
    };

    // 4A. fulfillHandwryttenOrder called with empty sender name refuses dispatch
    const emptySenderDispatch = await fulfillHandwryttenOrder({
      imageUrl: sampleCoverDataUri,
      printedGreeting: "",
      handwrittenMessage: "My note",
      fontId: "1",
      recipient: {
        firstName: "Alice",
        lastName: "Smith",
        street1: "123 Main St",
        city: "Seattle",
        state: "WA",
        zip: "98101",
      },
      returnAddress: {
        firstName: "", // missing
        lastName: "",
        street1: "456 Oak St",
        city: "Seattle",
        state: "WA",
        zip: "98101",
      },
    });

    assert(
      emptySenderDispatch.success === false,
      "fulfillHandwryttenOrder refuses dispatch when sender first name is missing"
    );
    assert(
      singleStepPayloadCaptured === null,
      "singleStepOrder was NOT called with missing sender name"
    );

    // 4B. fulfillHandwryttenOrder called with valid personal sender dispatches without brand names in sender fields
    const validPersonalDispatch = await fulfillHandwryttenOrder({
      orderId: "order_sender_test_99",
      imageUrl: sampleCoverDataUri,
      printedGreeting: "Dear Friend",
      handwrittenMessage: "Thinking of you!",
      fontId: "1",
      recipient: {
        firstName: "Alice",
        lastName: "Smith",
        street1: "123 Main St",
        city: "Seattle",
        state: "WA",
        zip: "98101",
      },
      returnAddress: {
        firstName: "Michael",
        lastName: "Scott",
        street1: "1725 Slough Ave",
        city: "Scranton",
        state: "PA",
        zip: "18503",
      },
    });

    assert(
      validPersonalDispatch.success === true && Boolean(singleStepPayloadCaptured),
      "singleStepOrder dispatched successfully with personal sender"
    );

    assert(
      singleStepPayloadCaptured?.sender_first_name === "Michael",
      `sender_first_name is personal name (got: '${singleStepPayloadCaptured?.sender_first_name}')`
    );

    assert(
      singleStepPayloadCaptured?.sender_last_name === "Scott",
      `sender_last_name is personal name (got: '${singleStepPayloadCaptured?.sender_last_name}')`
    );

    assert(
      singleStepPayloadCaptured?.sender_first_name !== "Aster & Blanche" &&
        singleStepPayloadCaptured?.sender_last_name !== "Press",
      "Supplier sender payload strictly does NOT contain 'Aster & Blanche' or 'Press'"
    );

    // 4C. Assert physical A&B backplate / colophon logic is preserved
    assert(
      customCardPayloadCaptured?.back_type === "logo",
      "Card creation preserves physical backplate logo type for physical colophon"
    );

    // ---------------------------------------------------------------------------
    // TEST 5: Free Order Route Rejection for Defective Sender
    // ---------------------------------------------------------------------------
    console.log("\n--- 5. Testing Free Order Path Sender Validation ---");

    const freeCode = `FREEVOUCH_${Date.now()}`;
    await saveDiscountCode({
      id: freeCode,
      code: freeCode,
      type: "PERCENTAGE",
      value: 100,
      isActive: true,
      usedCount: 0,
      totalDiscountGivenCents: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const defectiveFreeOrderId = `order_free_defect_${Date.now()}`;
    const freeQuote = await issueOfferPriceQuote({ code: freeCode, listPriceCents: 900 });
    if (!freeQuote.valid || !freeQuote.quote?.quoteId) {
      throw new Error(`Could not create authoritative free-order test quote: ${freeQuote.error || "missing quote"}`);
    }
    await reserveOfferForCheckout({
      code: freeCode,
      orderId: defectiveFreeOrderId,
      sessionId: `session_${defectiveFreeOrderId}`,
      quoteId: freeQuote.quote.quoteId,
    });
    await saveOrder({
      ...defectiveOrder,
      id: defectiveFreeOrderId,
      amountInCents: 0,
      discountCode: freeCode,
      quoteId: freeQuote.quote.quoteId,
      finalAmountInCents: freeQuote.finalAmountInCents,
      discountAmountInCents: freeQuote.discountAmountInCents,
    });

    const freeOrderReq = new NextRequest("http://localhost:3000/api/checkout/complete-free-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: defectiveFreeOrderId,
        discountCode: freeCode,
        customerEmail: "victim@example.com",
      }),
    });

    const freeOrderRes = await completeFreeOrderPost(freeOrderReq);
    const freeOrderData = await freeOrderRes.json();
    assert(
      freeOrderRes.status === 200 && freeOrderData.status === "QUEUED_FOR_FULFILLMENT",
      `Free order with defective sender is queued for operator review instead of dispatch (status: ${freeOrderData.status})`
    );

  } finally {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  }

  console.log("\n=================================================");
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSenderValidationTests().catch((err) => {
  console.error("Test execution exception:", err);
  process.exit(1);
});
