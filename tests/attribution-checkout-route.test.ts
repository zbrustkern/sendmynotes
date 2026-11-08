import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run() {
  // This acceptance test cannot use cloud credentials or create real payments.
  for (const key of Object.keys(process.env)) {
    if (/FIREBASE|GOOGLE|GCLOUD|K_SERVICE|STRIPE|HANDWRYTTEN|RESEND/i.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    NODE_ENV: "test", ALLOW_LOCAL_MOCK_PAYMENTS: "true", ATTRIBUTION_V2_ENABLED: "true",
    SMN_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), "smn-attribution-checkout-")),
  });
  const { NextRequest } = await import("next/server");
  const { POST } = await import("../app/api/checkout/create-intent/route");
  const { getOrderById } = await import("../lib/firebase-admin");
  const now = Date.now();
  const sessionId = "sess_attribution_acceptance";
  const touch = { touchId: "touch_acceptance", sessionId, expiresAt: null, observedAtClientMs: now, provenance: "utm", source: "google", medium: "cpc" };
  const baseAttribution = { utmSource: "google", utmMedium: "cpc", capturedAt: now, expiresAt: now + 60_000, attributionV2: { schemaVersion: 2, currentSessionTouch: touch } };
  const body = {
    frontImageUrl: "/presets/test-only.jpg", handwrittenNote: "Synthetic local attribution acceptance only.", sessionId,
    recipientAddress: { firstName: "Test", lastName: "Recipient", street1: "123 Main St", city: "Austin", state: "TX", zip: "78701" },
    returnAddress: { firstName: "Test", lastName: "Sender", street1: "456 Oak St", city: "Austin", state: "TX", zip: "78701" },
  };
  for (const medium of ["cpc", "constructor", "__proto__", "toString", "valueOf"]) {
    const attribution = { ...baseAttribution, attributionV2: { schemaVersion: 2, currentSessionTouch: { ...touch, medium } } };
    const response = await POST(new NextRequest("http://localhost/api/checkout/create-intent", { method: "POST", body: JSON.stringify({ ...body, attribution }) }));
    const result = await response.json();
    assert.equal(response.status, 200, `${medium}: ${JSON.stringify(result)}`);
    assert.equal(result.isMock, true, "only a local simulated payment intent is permitted");
    assert.equal(result.amountInCents, 900, "attribution cannot alter pricing");
    const order = await getOrderById(result.orderId);
    assert.equal(order?.status, "PENDING_PAYMENT", "test never pays or fulfills an order");
    assert.equal(order?.attribution?.attributionV2?.currentSessionTouch?.channel, medium === "cpc" ? "paid_search" : "other_campaign");
  }
  for (const restriction of ["denied", "gpc"] as const) {
    const attribution = { ...baseAttribution, ...(restriction === "denied" ? { optOut: true } : {}) };
    const response = await POST(new NextRequest("http://localhost/api/checkout/create-intent", { method: "POST", headers: restriction === "gpc" ? { "sec-gpc": "1" } : {}, body: JSON.stringify({ ...body, attribution }) }));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.isMock, true);
    const snapshot = (await getOrderById(result.orderId))?.attribution?.attributionV2;
    assert.equal(snapshot?.currentSessionTouch, null);
    assert.equal(snapshot?.firstObservedTouch, null);
    assert.equal(snapshot?.currentSessionMissingReason, restriction === "denied" ? "consent_denied" : "gpc_restricted");
  }
  console.log("attribution-checkout-route: normal/prototype mediums, denied/GPC, pricing and mock-only pending orders passed");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
