import {
  hashSha256,
  hashEmail,
  hashPhone,
  hashName,
  hashCity,
  hashState,
  hashZip,
  hashCountry,
  sendMetaCapiEvents,
  sendMetaCapiPurchaseEvent,
  META_PIXEL_ID,
  META_GRAPH_API_VERSION,
} from "../lib/meta-conversions-api";
import { buildMetaFbcString } from "../lib/meta-ads";
import { Order } from "../lib/types";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING META PIXEL & CONVERSIONS API (CAPI) TESTS");
  console.log("=================================================\n");

  console.log("--- 1. Testing Meta PII Normalization & Hashing ---");

  // Email hashing
  const rawEmail = "  Test.Customer@Gmail.Com ";
  const hashedEmail = hashEmail(rawEmail);
  const expectedEmailHash = hashSha256("test.customer@gmail.com");
  assert(hashedEmail === expectedEmailHash, "Email normalized to lowercase, trimmed, and SHA-256 hashed");

  // Invalid email returns undefined
  assert(hashEmail("not-an-email") === undefined, "Invalid email without @ returns undefined");
  assert(hashEmail("") === undefined, "Empty email returns undefined");

  // Phone number hashing
  const rawPhone = " +1 (555) 123-4567 ";
  const hashedPhone = hashPhone(rawPhone);
  const expectedPhoneHash = hashSha256("15551234567");
  assert(hashedPhone === expectedPhoneHash, "Phone stripped of non-numeric characters and SHA-256 hashed");

  // Name hashing
  const rawFirstName = "  Sarah-Jane! ";
  const hashedName = hashName(rawFirstName);
  const expectedNameHash = hashSha256("sarahjane");
  assert(hashedName === expectedNameHash, "Name stripped of punctuation/whitespace and SHA-256 hashed");

  // City hashing
  const rawCity = " Lake Forest ";
  const hashedCity = hashCity(rawCity);
  const expectedCityHash = hashSha256("lakeforest");
  assert(hashedCity === expectedCityHash, "City stripped of whitespace and SHA-256 hashed");

  // State hashing
  const rawState = " Illinois (IL) ";
  const hashedState = hashState("IL");
  const expectedStateHash = hashSha256("il");
  assert(hashedState === expectedStateHash, "State converted to 2 lowercase letters and SHA-256 hashed");

  // Zip code hashing
  const rawZip = "60045-1234";
  const hashedZip = hashZip(rawZip);
  const expectedZipHash = hashSha256("60045");
  assert(hashedZip === expectedZipHash, "Zip code takes first 5 characters and SHA-256 hashed");

  // Country hashing
  const hashedCountry = hashCountry("US");
  const expectedCountryHash = hashSha256("us");
  assert(hashedCountry === expectedCountryHash, "Country converted to 2 lowercase letters and SHA-256 hashed");

  console.log("\n--- 2. Testing Meta Click ID & Cookie Utilities ---");

  const testFbclid = "IwAR0abc123xyz_test_click";
  const formattedFbc = buildMetaFbcString(testFbclid);
  assert(
    formattedFbc !== null && formattedFbc.startsWith("fb.1.") && formattedFbc.endsWith(testFbclid),
    `FBC format conforms to fb.1.<timestamp>.<fbclid> (got: ${formattedFbc})`
  );

  console.log("\n--- 3. Testing Conversions API Graceful Failover when Unconfigured ---");

  // Ensure unset token skips gracefully without crashing or throwing
  const originalToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
  delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;

  const skippedResult = await sendMetaCapiEvents([
    {
      event_name: "Purchase",
      event_id: "test_order_123",
      action_source: "website",
      user_data: { email: "test@example.com" },
    },
  ]);

  assert(skippedResult.success === false, "Returns success: false when token unconfigured");
  assert(skippedResult.skipped === true, "Marks skipped: true when token unconfigured");
  assert(
    skippedResult.error === "META_CONVERSIONS_API_ACCESS_TOKEN not configured",
    "Clear descriptive error message returned"
  );

  console.log("\n--- 4. Testing End-to-End CAPI Purchase Payload with Mocked Fetch ---");

  // Mock global fetch to inspect request body sent to Meta Graph API
  const originalFetch = global.fetch;
  let capturedUrl = "";
  let capturedBody: any = null;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(init?.body as string);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events_received: 1,
        fbtrace_id: "test_fbtrace_999",
      }),
    } as Response;
  };

  process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "EAAG_mock_access_token_for_testing";

  const mockOrder: Order = {
    id: "order_capi_test_888",
    customerEmail: "john.doe@example.com",
    amountInCents: 900,
    frontImageUrl: "https://example.com/card.png",
    printedMessage: "Happy Birthday!",
    handwrittenNote: "Hope you have an amazing day!",
    fontStyleId: "1",
    occasion: "birthday",
    recipientAddress: {
      firstName: "Jane",
      lastName: "Smith",
      street1: "456 Oak Ave",
      city: "Chicago",
      state: "IL",
      zip: "60601",
    },
    returnAddress: {
      firstName: "John",
      lastName: "Doe",
      street1: "123 Main St",
      city: "Lake Forest",
      state: "IL",
      zip: "60045",
    },
    status: "PROCESSING_HANDWRYTTEN",
    paymentMethod: "STRIPE",
    attribution: {
      fbclid: testFbclid,
      fbp: "fb.1.1718000000.987654321",
      clientIp: "98.76.54.32",
      userAgent: "Mozilla/5.0 Test Agent",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const capiResponse = await sendMetaCapiPurchaseEvent({
    order: mockOrder,
    testEventCode: "TEST_VERIFY_CODE",
  });

  assert(capiResponse.success === true, "CAPI purchase returned success: true on HTTP 200");
  assert(capiResponse.eventsReceived === 1, "CAPI purchase reported 1 event received");
  assert(capiResponse.fbtraceId === "test_fbtrace_999", "CAPI purchase returned fbtrace_id");

  // Verify URL and API version
  assert(
    capturedUrl.includes(`graph.facebook.com/${META_GRAPH_API_VERSION}/${META_PIXEL_ID}/events`),
    `Correct Graph API URL and Pixel ID targeted (got: ${capturedUrl})`
  );

  // Verify test event code
  assert(capturedBody.test_event_code === "TEST_VERIFY_CODE", "test_event_code attached to payload");

  // Verify event structure
  const eventPayload = capturedBody.data[0];
  assert(eventPayload.event_name === "Purchase", "event_name is 'Purchase'");
  assert(
    eventPayload.event_id === mockOrder.id,
    "event_id matches mockOrder.id for 1:1 deduplication with browser pixel"
  );
  assert(eventPayload.action_source === "website", "action_source is 'website'");
  assert(
    eventPayload.event_source_url === `https://sendmynotes.com/order/${mockOrder.id}`,
    "event_source_url correctly populated"
  );

  // Verify user_data
  const userData = eventPayload.user_data;
  assert(userData.em[0] === hashSha256("john.doe@example.com"), "Customer email properly hashed with SHA-256");
  assert(userData.fn[0] === hashSha256("john"), "Sender first name properly hashed");
  assert(userData.ln[0] === hashSha256("doe"), "Sender last name properly hashed");
  assert(userData.ct[0] === hashSha256("lakeforest"), "Purchaser city properly hashed from return address");
  assert(userData.st[0] === hashSha256("il"), "State properly hashed");
  assert(userData.zp[0] === hashSha256("60045"), "Purchaser zip properly hashed from return address");
  assert(userData.country[0] === hashSha256("us"), "Country properly hashed");

  // Privacy Safeguard: Verify recipient address information is strictly NOT transmitted to Meta
  assert(userData.ct[0] !== hashSha256("chicago"), "Recipient city (Chicago) is strictly excluded from payload");
  assert(userData.zp[0] !== hashSha256("60601"), "Recipient zip (60601) is strictly excluded from payload");

  // Verify unhashed browser and network data
  assert(userData.client_ip_address === "98.76.54.32", "client_ip_address unhashed");
  assert(userData.client_user_agent === "Mozilla/5.0 Test Agent", "client_user_agent unhashed");
  assert(userData.fbp === "fb.1.1718000000.987654321", "fbp cookie attached unhashed");
  assert(
    userData.fbc && userData.fbc.includes(testFbclid),
    `fbc click ID attached and formatted properly (got: ${userData.fbc})`
  );

  // Verify custom_data
  const customData = eventPayload.custom_data;
  assert(customData.value === 9.0, "custom_data value is 9.0");
  assert(customData.currency === "USD", "custom_data currency is USD");
  assert(customData.content_name === "birthday Card", "custom_data content_name populated");
  assert(customData.content_ids[0] === mockOrder.id, "custom_data content_ids contains order ID");
  assert(customData.contents[0].id === mockOrder.id, "custom_data contents array contains order ID");
  assert(customData.contents[0].item_price === 9.0, "custom_data contents item_price is 9.0");

  // --- 5. Testing GPC / Opt-Out Limited Data Use Handling ---
  const optedOutOrder: Order = {
    ...mockOrder,
    id: "order_capi_test_gpc_999",
    attribution: {
      ...mockOrder.attribution,
      gpc: true,
      optOut: true,
    },
  };

  await sendMetaCapiPurchaseEvent({
    order: optedOutOrder,
  });

  const gpcEventPayload = capturedBody.data[0];
  assert(gpcEventPayload.opt_out === true, "opt_out is true when GPC/opt-out detected");
  assert(
    Array.isArray(gpcEventPayload.data_processing_options) &&
      gpcEventPayload.data_processing_options[0] === "LDU",
    "Limited Data Use (LDU) flag attached when GPC/opt-out detected"
  );

  // Cleanup
  global.fetch = originalFetch;
  if (originalToken) {
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = originalToken;
  } else {
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
  }

  console.log("\n=================================================");
  console.log(`Test Summary: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("=================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
