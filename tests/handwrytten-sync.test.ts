import { fetchHandwryttenOrderStatus } from "../lib/handwrytten";

async function runHandwryttenSyncTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING HANDWRYTTEN ORDER STATUS SYNC TESTS");
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

  // 1. Mock Order ID handling (without API key)
  const mockResult = await fetchHandwryttenOrderStatus("mock_hw_12345");
  assert(mockResult.success === true, "Mock orders return success: true");
  assert(mockResult.status === "processing", "Mock orders return processing status");

  // 2. Test live call against /v2/orders/details with mocked fetch
  const originalFetch = global.fetch;
  const originalEnv = process.env.HANDWRYTTEN_API_KEY;

  try {
    process.env.HANDWRYTTEN_API_KEY = "test_hw_key_xyz";

    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          order: {
            id: 29863234,
            order_status: "mailed",
            date_sent: "2026-09-29 14:30:00",
            tracking_number: "9400111899223190000000",
            tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223190000000",
          },
        }),
      } as Response;
    };

    const liveResult = await fetchHandwryttenOrderStatus("29863234");

    assert(
      capturedUrl.includes("api.handwrytten.com/v2/orders/details"),
      `Endpoint points to /v2/orders/details (URL: ${capturedUrl})`
    );
    assert(
      capturedUrl.includes("id=29863234"),
      `URL contains id parameter (URL: ${capturedUrl})`
    );
    assert(
      capturedHeaders["Authorization"] === "test_hw_key_xyz",
      "API key passed in Authorization header without Bearer prefix"
    );
    assert(liveResult.success === true, "Sync parses response with success: true");
    assert(liveResult.status === "mailed", "Sync parses order status 'mailed'");
    assert(liveResult.dateSent === "2026-09-29 14:30:00", "Sync parses dateSent correctly");
    assert(
      liveResult.trackingNumber === "9400111899223190000000",
      "Sync parses trackingNumber correctly"
    );

    // 3. Test Handwrytten error handling (e.g. invalid order id)
    global.fetch = async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({
          status: "error",
          message: "Order not found",
        }),
      } as Response;
    };

    const errorResult = await fetchHandwryttenOrderStatus("invalid_id_999");
    assert(errorResult.success === false, "Handles 404 error cleanly");
    assert(
      errorResult.error === "Order not found",
      `Preserves error message: ${errorResult.error}`
    );

  } finally {
    global.fetch = originalFetch;
    if (originalEnv) {
      process.env.HANDWRYTTEN_API_KEY = originalEnv;
    } else {
      delete process.env.HANDWRYTTEN_API_KEY;
    }
  }

  console.log(`\n=================================================`);
  if (failed === 0) {
    console.log(`🎉 ALL HANDWRYTTEN SYNC TESTS PASSED (${passed}/${passed})`);
    console.log(`=================================================\n`);
  } else {
    console.error(`💥 SOME TESTS FAILED (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }
}

runHandwryttenSyncTests().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
