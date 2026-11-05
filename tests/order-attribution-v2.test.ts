import assert from "node:assert/strict";
import {
  freezeCheckoutOrderAttribution,
  isAttributionV2Enabled,
  prepareCheckoutOrderAttribution,
} from "../lib/order-attribution";

const now = Date.UTC(2026, 10, 5, 12, 0, 0);
const sessionId = "sess_1762344000000_abc123";
const raw = {
  utmSource: "Google",
  utmMedium: "CPC",
  utmCampaign: "Autumn Launch",
  gclid: "gclid.raw.value",
  wbraid: "wbraid.raw.value",
  fbp: "fb.1.123456.789",
  fbc: "fb.1.123456.raw-click",
  gpc: false,
  optOut: false,
  capturedAt: now - 2_000,
  expiresAt: now + 60_000,
  attributionV2: {
    schemaVersion: 2,
    classifierVersion: "untrusted-client-version",
    persistence: "persistent",
    snapshotStage: "client_claimed_stage",
    snapshotCapturedAtServerMs: 1,
    firstObservedTouch: {
      channel: "paid_search",
      group: "paid",
      provenance: "utm",
      reason: "explicit_paid_medium",
      source: "Google",
      medium: "CPC",
      campaign: "Autumn Launch",
      touchId: "touch_first",
      sessionId: "sess_old",
      observedAtClientMs: now - 100_000,
      observedAtServerMs: 1,
      expiresAt: now + 4_000_000,
      clockQuality: "server_anchored",
      landingPath: "/send?email=private@example.test",
      referrerHost: "www.google.com",
      gclid: "must-not-appear-in-v2",
      handwrittenNote: "private card message",
      recipientAddress: { street1: "private address" },
    },
    currentSessionTouch: {
      channel: "paid_search",
      group: "paid",
      provenance: "utm",
      reason: "explicit_paid_medium",
      source: "Google",
      medium: "CPC",
      campaign: "Autumn Launch",
      touchId: "touch_current",
      sessionId,
      observedAtClientMs: now - 1_000,
      observedAtServerMs: 1,
      expiresAt: null,
      clockQuality: "server_anchored",
      landingPath: "/send?address=private",
      referrerHost: "https://www.google.com/search?q=private",
      gclid: "must-not-appear-in-v2",
      cardNumber: "4242424242424242",
    },
  },
};

function testGatedServerSnapshotAndLegacyCompatibility() {
  assert.equal(isAttributionV2Enabled({}), false, "V2 is disabled by default");
  assert.equal(isAttributionV2Enabled({ ATTRIBUTION_V2_ENABLED: "false" }), false);
  assert.equal(isAttributionV2Enabled({ ATTRIBUTION_V2_ENABLED: "true" }), true, "the server flag enables only configured environments");

  const legacyOnly = prepareCheckoutOrderAttribution(raw, { sessionId, serverNowMs: now, v2Enabled: false });
  assert.equal(legacyOnly?.attributionV2, undefined);
  assert.equal(legacyOnly?.gclid, raw.gclid, "Google Ads flat click field remains intact");
  assert.equal(legacyOnly?.fbp, raw.fbp, "Meta browser field remains intact");
  assert.equal(legacyOnly?.fbc, raw.fbc, "Meta click cookie field remains intact");
  assert.equal(legacyOnly?.gpc, false);
  assert.equal(legacyOnly?.optOut, false);

  const result = prepareCheckoutOrderAttribution(raw, { sessionId, serverNowMs: now, v2Enabled: true });
  assert.ok(result?.attributionV2);
  const v2 = result!.attributionV2!;
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.classifierVersion, "2026-11-05.1", "the server writes the canonical classifier version");
  assert.equal(v2.snapshotStage, "checkout_started", "the server owns the snapshot stage");
  assert.equal(v2.snapshotCapturedAtServerMs, now, "client supplied server time is ignored");
  assert.equal(v2.firstObservedTouch?.expiresAt, now + 4_000_000, "first-touch expiry is preserved within the 90-day cap");
  assert.equal(v2.firstObservedTouch?.clockQuality, "client_unanchored", "client time is never presented as server anchored");
  assert.equal(v2.firstObservedTouch?.observedAtServerMs, undefined, "client supplied server event time is ignored");
  assert.equal(v2.firstObservedTouch?.landingPath, "/send");
  assert.equal(v2.firstObservedTouch?.referrerHost, "www.google.com");
  assert.equal(v2.currentSessionTouch?.sessionId, sessionId, "current touch is bound to the exact order session");
  assert.equal(v2.currentSessionTouch?.channel, "paid_search", "channel is recomputed from allowlisted evidence");
  assert.equal(v2.currentSessionTouch?.source, "google");
  assert.equal(v2.currentSessionTouch?.medium, "cpc");
  assert.equal(v2.currentSessionTouch?.expiresAt, null);
  assert.equal(result?.gclid, raw.gclid, "Google Ads still receives the legacy flat field");
  assert.equal(result?.fbp, raw.fbp, "Meta still receives the legacy flat browser field");
  assert.equal(result?.fbc, raw.fbc, "Meta still receives the legacy flat click cookie");
  assert.equal(result?.gpc, false);
  assert.equal(result?.optOut, false);

  const serializedV2 = JSON.stringify(v2);
  for (const secret of ["must-not-appear-in-v2", "private@example.test", "private card message", "private address", "4242424242424242", "private"])
    assert.equal(serializedV2.includes(secret), false, `V2 excludes ${secret}`);
}

function testMismatchConsentAndUnknownIdentity() {
  const mismatched = {
    ...raw,
    attributionV2: {
      ...raw.attributionV2,
      currentSessionTouch: { ...raw.attributionV2.currentSessionTouch, sessionId: "sess_someone_else" },
    },
  };
  const mismatchResult = prepareCheckoutOrderAttribution(mismatched, { sessionId, serverNowMs: now, v2Enabled: true });
  assert.equal(mismatchResult?.attributionV2?.currentSessionTouch, null, "a mismatched current touch is rejected");
  assert.equal(mismatchResult?.attributionV2?.currentSessionMissingReason, "invalid_evidence");
  assert.equal(mismatchResult?.gclid, raw.gclid, "rejecting V2 does not remove legacy campaign fields");

  const noSession = prepareCheckoutOrderAttribution(raw, { serverNowMs: now, v2Enabled: true });
  assert.equal(noSession?.attributionV2?.currentSessionTouch, null);
  assert.equal(noSession?.attributionV2?.currentSessionMissingReason, "session_unavailable");
  assert.equal(noSession?.attributionV2?.persistence, "not_attempted");

  const gpcRestricted = prepareCheckoutOrderAttribution(raw, { sessionId, serverNowMs: now, v2Enabled: true, globalPrivacyControl: true });
  assert.equal(gpcRestricted?.attributionV2?.firstObservedTouch, null);
  assert.equal(gpcRestricted?.attributionV2?.currentSessionTouch, null);
  assert.equal(gpcRestricted?.attributionV2?.firstObservedMissingReason, "gpc_restricted");
  assert.equal(gpcRestricted?.attributionV2?.currentSessionMissingReason, "gpc_restricted");
  assert.equal(gpcRestricted?.gclid, raw.gclid, "existing flat compatibility fields remain available under the existing consent policy");

  const expiredFirstTouch = {
    ...raw,
    attributionV2: { ...raw.attributionV2, firstObservedTouch: { ...raw.attributionV2.firstObservedTouch, expiresAt: now - 1 } },
  };
  const expired = prepareCheckoutOrderAttribution(expiredFirstTouch, { sessionId, serverNowMs: now, v2Enabled: true });
  assert.equal(expired?.attributionV2?.firstObservedTouch, null);
  assert.equal(expired?.attributionV2?.firstObservedMissingReason, "expired");
}

function testFrozenRetryAndNoFinancialFacts() {
  const first = prepareCheckoutOrderAttribution(raw, { sessionId, serverNowMs: now, v2Enabled: true })!;
  const second = freezeCheckoutOrderAttribution(first, { utmSource: "meta", attributionV2: {} }, {
    sessionId: "sess_new", serverNowMs: now + 60_000, v2Enabled: true,
  });
  assert.deepEqual(second, first, "retry/re-entry cannot replace an already frozen order attribution snapshot");
  const keys = Object.keys(second ?? {});
  assert.deepEqual(keys.sort(), [
    "attributionV2", "capturedAt", "expiresAt", "fbc", "fbp", "gclid", "gpc", "optOut", "utmCampaign", "utmMedium", "utmSource", "wbraid",
  ].sort());
  assert.equal("paymentIntentId" in (second ?? {}), false, "attribution snapshot does not manufacture payment facts");
  assert.equal("stripePaymentId" in (second ?? {}), false);
  assert.equal("fulfillmentStatus" in (second ?? {}), false);
}

testGatedServerSnapshotAndLegacyCompatibility();
testMismatchConsentAndUnknownIdentity();
testFrozenRetryAndNoFinancialFacts();
console.log("order-attribution-v2: gating, server snapshot, identity, consent, privacy and retry assertions passed");
