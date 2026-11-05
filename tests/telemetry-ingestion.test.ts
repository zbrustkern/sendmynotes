import assert from "node:assert";
import { NextRequest } from "next/server";
import { POST as telemetryRoutePost } from "../app/api/telemetry/route";
import {
  ingestTelemetryEvent,
  getTelemetrySummary,
  recordServerTelemetry,
} from "../lib/metrics-rollup";
import { firestoreDb } from "../lib/firebase-admin";
import { TELEMETRY_COLLECTION } from "../lib/telemetry";
import { TelemetryEvent } from "../lib/types";

async function runTelemetryIngestionTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING TELEMETRY INGESTION & FUNNEL TESTS (S0-02)");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Browser Authority Rejection
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Browser Authority Protection ---");

  const summaryBefore = await getTelemetrySummary();
  const initialPaidCount = summaryBefore.paid;

  // 1A. Attempt browser POST of payment_succeeded
  const req1 = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "payment_succeeded",
      sessionId: `sess_malicious_${Date.now()}`,
      orderId: "ord_fake_123",
    }),
  });
  const res1 = await telemetryRoutePost(req1);
  testAssert(res1.status === 403, "Browser POST of payment_succeeded is rejected with HTTP 403");

  // 1B. Attempt browser POST of purchase_verified
  const req2 = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "purchase_verified",
      sessionId: `sess_malicious_${Date.now()}`,
      orderId: "ord_fake_456",
    }),
  });
  const res2 = await telemetryRoutePost(req2);
  testAssert(res2.status === 403, "Browser POST of purchase_verified is rejected with HTTP 403");

  // 1C. Attempt browser POST of fulfillment_submitted
  const req3 = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "fulfillment_submitted",
      sessionId: `sess_malicious_${Date.now()}`,
    }),
  });
  const res3 = await telemetryRoutePost(req3);
  testAssert(res3.status === 403, "Browser POST of fulfillment_submitted is rejected with HTTP 403");

  // Verify paid counter remained unchanged
  const summaryAfterAuthority = await getTelemetrySummary();
  testAssert(
    summaryAfterAuthority.paid === initialPaidCount,
    "Paid counter remains unchanged after rejected browser authority events"
  );

  // ---------------------------------------------------------------------------
  // 2. Unique-Session Funnel Deduplication
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Unique-Session Funnel Deduplication ---");

  const sessionA = `sess_unique_${Date.now()}_A`;
  const sessionB = `sess_unique_${Date.now()}_B`;

  const baseSummary = await getTelemetrySummary();
  const baseCoverCount = baseSummary.coverSelected;
  const baseNoteCount = baseSummary.noteCompleted;

  // Session A selects cover 1st time
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_1`,
    sessionId: sessionA,
    eventName: "cover_preset_selected",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { presetId: "preset_1", occasion: "Birthday" },
  });

  let s = await getTelemetrySummary();
  testAssert(s.coverSelected === baseCoverCount + 1, "Session A cover selection increments coverSelected by 1");

  // Session A selects cover 2nd time (should NOT increment unique counter)
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_2`,
    sessionId: sessionA,
    eventName: "cover_preset_selected",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { presetId: "preset_2", occasion: "Birthday" },
  });

  s = await getTelemetrySummary();
  testAssert(s.coverSelected === baseCoverCount + 1, "Repeated cover selection by Session A does NOT increment unique coverSelected");

  // Session A card_completed (should NOT increment unique counter again)
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_3`,
    sessionId: sessionA,
    eventName: "card_completed",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { cardType: "preset" },
  });

  s = await getTelemetrySummary();
  testAssert(s.coverSelected === baseCoverCount + 1, "card_completed by Session A does NOT increment unique coverSelected again");

  // Session B selects cover (different session, should increment)
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_4`,
    sessionId: sessionB,
    eventName: "cover_preset_selected",
    path: "/send/thank-you",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { presetId: "preset_3", occasion: "Thank You" },
  });

  s = await getTelemetrySummary();
  testAssert(s.coverSelected === baseCoverCount + 2, "New session B cover selection increments unique coverSelected to 2");

  // Session A edits note 1st time
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_5`,
    sessionId: sessionA,
    eventName: "inside_note_edited",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { charCount: 25 },
  });

  s = await getTelemetrySummary();
  testAssert(s.noteCompleted === baseNoteCount, "Session A note edit does NOT increment noteCompleted (Finding 1)");

  // Session A emits note_completed
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_6`,
    sessionId: sessionA,
    eventName: "note_completed",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { charCount: 40 },
  });

  s = await getTelemetrySummary();
  testAssert(s.noteCompleted === baseNoteCount + 1, "Session A note_completed increments noteCompleted by 1");

  // Subsequent note_completed by same session does NOT increment noteCompleted again
  await ingestTelemetryEvent({
    id: `evt_test_${Date.now()}_7`,
    sessionId: sessionA,
    eventName: "note_completed",
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { charCount: 45 },
  });

  s = await getTelemetrySummary();
  testAssert(s.noteCompleted === baseNoteCount + 1, "Subsequent note_completed by Session A does NOT increment noteCompleted again");

  // Raw event count increases
  testAssert(
    (s.rawEventCounts?.inside_note_edited || 0) >= 1 && (s.rawEventCounts?.note_completed || 0) >= 1,
    "Raw event counts track total events independently of unique funnel counts"
  );

  // ---------------------------------------------------------------------------
  // 3. Navigation Invariance
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Step Navigation Invariance ---");

  const sessionNav = `sess_nav_${Date.now()}`;
  const preNavSummary = await getTelemetrySummary();

  // Navigate to step 2 (should NOT complete note step)
  await ingestTelemetryEvent({
    id: `evt_nav_${Date.now()}_1`,
    sessionId: sessionNav,
    eventName: "step_navigated",
    step: 2,
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { fromStep: 1, toStep: 2 },
  });

  // Navigate to step 3 (should NOT complete address step)
  await ingestTelemetryEvent({
    id: `evt_nav_${Date.now()}_2`,
    sessionId: sessionNav,
    eventName: "step_navigated",
    step: 3,
    path: "/send/birthday",
    timestamp: Date.now(),
    createdAt: Date.now(),
    metadata: { fromStep: 2, toStep: 3 },
  });

  const postNavSummary = await getTelemetrySummary();
  testAssert(
    postNavSummary.noteCompleted === preNavSummary.noteCompleted,
    "step_navigated (step 2) alone does NOT increment noteCompleted"
  );
  testAssert(
    postNavSummary.addressCompleted === preNavSummary.addressCompleted,
    "step_navigated (step 3) alone does NOT increment addressCompleted"
  );

  // ---------------------------------------------------------------------------
  // 4. Privacy Hygiene: Personal Data & Nested Metadata Stripping
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Privacy Hygiene & Stored Document Hygiene ---");

  const personalDataSession = `sess_privacy_${Date.now()}`;
  const personalReq = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "address_completed",
      sessionId: personalDataSession,
      path: "/checkout",
      // Unknown and forbidden keys with PII
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      metadata: {
        hasReturnAddress: true,
        attributionV2: {
          schemaVersion: 2,
          classifierVersion: "2026-11-05.1",
          persistence: "persistent",
          snapshotStage: "checkout_started",
          snapshotCapturedAtServerMs: 123,
          firstObservedTouch: { touchId: "touch_first_123", sessionId: "sess_prior_123", source: "google", medium: "cpc", campaign: "spring_launch", channel: "paid_search", group: "paid", provenance: "utm", reason: "explicit_paid_medium", observedAtClientMs: Date.now(), expiresAt: Date.now() + 86400000, clockQuality: "server_anchored", referrerHost: "google.com", landingPath: "/start", gclid: "raw-click-secret", printedMessage: "private note" },
          currentSessionTouch: { touchId: "touch_current_123", sessionId: personalDataSession, source: "google", medium: "cpc", campaign: "spring_launch", channel: "paid_search", group: "paid", provenance: "utm", reason: "explicit_paid_medium", observedAtClientMs: Date.now(), expiresAt: Date.now() + 86400000, clockQuality: "server_anchored", referrerHost: "google.com", landingPath: "/start?token=private", gclid: "raw-click-secret" },
        },
        // Forbidden keys in metadata:
        recipientName: "John Smith",
        streetAddress: "123 Main Street",
        contactEmail: "john@example.com",
        secretMessage: "I love you Jane",
        nested: {
          token: "view_secret_token_123",
          creditCard: "4111222233334444",
        },
      },
    }),
  });

  const personalRes = await telemetryRoutePost(personalReq);
  const personalResJson = await personalRes.json();
  testAssert(personalRes.status === 200, "Valid event name with stripped extra keys returns HTTP 200");
  testAssert(Boolean(personalResJson.eventId), "Returns generated eventId");

  // Inspect the persisted document in Firestore
  const storedDocSnap = await firestoreDb.collection(TELEMETRY_COLLECTION).doc(personalResJson.eventId).get();
  testAssert(storedDocSnap.exists, "Event document is stored in Firestore");

  const storedData = storedDocSnap.data() as Record<string, unknown>;
  const storedMetadata = (storedData.metadata || {}) as Record<string, unknown>;

  // Assert allowed key is present
  testAssert(storedMetadata.hasReturnAddress === true, "Allowed metadata key 'hasReturnAddress' is preserved");

  // Assert unknown keys and personal values are completely absent
  testAssert(storedData.customerName === undefined, "Root customerName is NOT stored");
  testAssert(storedData.customerEmail === undefined, "Root customerEmail is NOT stored");
  testAssert(storedMetadata.recipientName === undefined, "Metadata recipientName is NOT stored");
  testAssert(storedMetadata.streetAddress === undefined, "Metadata streetAddress is NOT stored");
  testAssert(storedMetadata.contactEmail === undefined, "Metadata contactEmail is NOT stored");
  testAssert(storedMetadata.secretMessage === undefined, "Metadata secretMessage is NOT stored");
  testAssert(storedMetadata.nested === undefined, "Nested metadata object is NOT stored");
  const storedAttributionV2 = storedMetadata.attributionV2 as Record<string, unknown>;
  const storedCurrentTouch = storedAttributionV2?.currentSessionTouch as Record<string, unknown>;
  testAssert(storedAttributionV2?.schemaVersion === 2, "Known V2 attribution snapshot passes the explicit nested sanitizer");
  testAssert(storedCurrentTouch?.sessionId === personalDataSession, "Current touch is bound to the collector session identity");
  testAssert(storedCurrentTouch?.channel === "paid_search" && storedCurrentTouch?.clockQuality === "client_unanchored", "Collector reclassifies V2 evidence and downgrades client clock trust");
  testAssert(storedAttributionV2?.snapshotStage === undefined && storedAttributionV2?.snapshotCapturedAtServerMs === undefined, "Client cannot set server-only snapshot fields");
  testAssert(!JSON.stringify(storedAttributionV2).includes("raw-click-secret") && !JSON.stringify(storedAttributionV2).includes("private note"), "V2 snapshot excludes click IDs and personal content");
  testAssert(storedCurrentTouch?.landingPath === undefined, "Landing paths containing query values are removed");

  const deniedSession = `sess_privacy_denied_${Date.now()}`;
  const deniedReq = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: "landing_viewed", sessionId: deniedSession, consent_state: "denied", properties: { attributionV2: { schemaVersion: 2, currentSessionTouch: { touchId: "touch_denied_123", sessionId: deniedSession, source: "google", medium: "cpc", provenance: "utm" } } } }),
  });
  const deniedRes = await telemetryRoutePost(deniedReq);
  const deniedResJson = await deniedRes.json();
  const deniedEvent = (await firestoreDb.collection(TELEMETRY_COLLECTION).doc(deniedResJson.eventId).get()).data() as Record<string, unknown>;
  const deniedMetadata = (deniedEvent.metadata || {}) as Record<string, unknown>;
  testAssert(deniedRes.status === 200 && deniedMetadata.attributionV2 === undefined, "Consent denial removes V2 attribution from the persisted event");

  // ---------------------------------------------------------------------------
  // 5. URL Hygiene: Query Strings & Hashes Stripped
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing URL Hygiene (Origin + Pathname Only) ---");

  const urlSession = `sess_url_${Date.now()}`;
  const urlReq = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "landing_viewed",
      sessionId: urlSession,
      path: "/order/abc?viewToken=SECRET&name=Jane#previewSection",
      referrer: "https://sendmynotes.com/send/birthday?email=jane@example.com&token=secret123#heading",
      landingPath: "https://sendmynotes.com/landing?utm_content=promo&user_id=99#hero",
      utmSource: "facebook",
      utmCampaign: "spring_launch jane@example.com", // Contains email with text
      utmTerm: "jane@example.com", // Standalone email
    }),
  });

  const urlRes = await telemetryRoutePost(urlReq);
  const urlResJson = await urlRes.json();
  testAssert(urlRes.status === 200, "URL hygiene request accepted");

  const storedUrlDocSnap = await firestoreDb.collection(TELEMETRY_COLLECTION).doc(urlResJson.eventId).get();
  const storedUrlData = storedUrlDocSnap.data() as TelemetryEvent;

  testAssert(storedUrlData.path === "/order/abc", "Path '/order/abc?viewToken=SECRET&name=Jane' is stored as '/order/abc'");
  testAssert(
    storedUrlData.referrer === "https://sendmynotes.com/send/birthday",
    "Referrer query string and hash are completely stripped"
  );
  testAssert(
    storedUrlData.landingPath === "https://sendmynotes.com/landing",
    "LandingPath query string and hash are completely stripped"
  );
  testAssert(
    storedUrlData.utmCampaign === "spring_launch",
    "Email in UTM campaign parameter is stripped"
  );
  testAssert(
    storedUrlData.utmTerm === undefined,
    "Standalone email in UTM term parameter is stripped completely to undefined"
  );

  // ---------------------------------------------------------------------------
  // 6. Request Size Limit (Reject > 4KB)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing Body Size Limit (> 4KB) ---");

  const hugeString = "a".repeat(5000);
  const largeReq = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "session_start",
      sessionId: "sess_large",
      padding: hugeString,
    }),
  });

  const largeRes = await telemetryRoutePost(largeReq);
  testAssert(largeRes.status === 413, "Body > 4KB is rejected with HTTP 413");

  // ---------------------------------------------------------------------------
  // 7. Unknown Event Name Rejection
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Testing Unknown Event Name Rejection ---");

  const unknownReq = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "unsupported_spoof_event",
      sessionId: "sess_unknown",
    }),
  });

  const unknownRes = await telemetryRoutePost(unknownReq);
  testAssert(unknownRes.status === 400, "Unknown event name is rejected with HTTP 400");

  // ---------------------------------------------------------------------------
  // 8. Server-Side Authority Function
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Testing Server Authority Telemetry (recordServerTelemetry) ---");

  const serverSession = `sess_srv_${Date.now()}`;
  const preServerSummary = await getTelemetrySummary();
  const preServerPaid = preServerSummary.paid;

  const testOrderId = `ord_verified_ingest_${Date.now()}`;
  const srvEventId = await recordServerTelemetry({
    eventName: "purchase_verified",
    sessionId: serverSession,
    orderId: testOrderId,
    metadata: {
      orderId: testOrderId,
      amountInCents: 900,
      customerType: "customer",
    },
    experienceVersion: "v3_target",
    draftRevision: 1,
  });

  testAssert(Boolean(srvEventId), "recordServerTelemetry emits purchase_verified successfully");

  const postServerSummary = await getTelemetrySummary();
  testAssert(
    postServerSummary.paid === preServerPaid + 1,
    "purchase_verified emitted via server authority increments unique paid count"
  );

  // Calling again for same session deduplicates
  await recordServerTelemetry({
    eventName: "purchase_verified",
    sessionId: serverSession,
    orderId: testOrderId,
  });

  const dedupServerSummary = await getTelemetrySummary();
  testAssert(
    dedupServerSummary.paid === preServerPaid + 1,
    "Duplicate purchase_verified for same session does not increment paid count again"
  );

  console.log("\n=================================================");
  console.log(`🎉 INGESTION TESTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTelemetryIngestionTests().catch((err) => {
  console.error("❌ Test suite encountered fatal error:", err);
  process.exit(1);
});
