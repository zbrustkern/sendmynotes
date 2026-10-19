import assert from "node:assert";
import { NextRequest } from "next/server";
import { POST as telemetryRoutePost } from "../app/api/telemetry/route";
import {
  getOrCreateJourneyIdentity,
  bindJourneyToDraft,
  resumeJourneyFromDraft,
  classifyTrafficProvenance,
  resolveConsentState,
  SESSION_INACTIVITY_WINDOW_MS,
  StorageLike,
} from "../lib/journey-identity";
import {
  sanitizeMetadata,
  sanitizeUrlOrPath,
  isAuthorityEvent,
  AUTHORITY_EVENTS,
  ALLOWED_BROWSER_EVENT_NAMES,
} from "../lib/telemetry-schema";
import {
  buildEventV2Envelope,
  ingestEventV2,
  computeEventDedupeKey,
  getTelemetryCollectorDiagnostics,
  resetTelemetryCollectorDiagnostics,
  recordTelemetryCollectorSuccess,
  classifyMilestone,
} from "../lib/telemetry-v2";

async function runSprint0003TelemetryV2Tests() {
  console.log("=================================================================");
  console.log("🧪 RUNNING SPRINT-0003: TELEMETRY V2 & JOURNEY IDENTITY TESTS");
  console.log("=================================================================\n");

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
  // SUITE 1: Journey Identity, Inactivity Rotation, and Storage Resilience (AC04)
  // ---------------------------------------------------------------------------
  console.log("--- Suite 1: Journey Identity, Inactivity Rotation & Resilience ---");

  // In-memory mock storage
  class MockStorage implements StorageLike {
    private store = new Map<string, string>();
    getItem(key: string): string | null {
      return this.store.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.store.set(key, value);
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    clear(): void {
      this.store.clear();
    }
  }

  // 1A. Creation of identity
  const mockStorage1 = new MockStorage();
  const id1 = getOrCreateJourneyIdentity({
    storage: mockStorage1,
    nowMs: 1000000,
  });
  testAssert(Boolean(id1.anonymousId && id1.sessionId && id1.journeyId), "Initial journey identity mints anonymousId, sessionId, journeyId");
  testAssert(!id1.degradedIdentity, "Identity in working storage is not degraded");

  // 1B. Activity within 30-minute window preserves sessionId
  const t2 = 1000000 + (SESSION_INACTIVITY_WINDOW_MS - 60000); // 29 minutes later
  const id2 = getOrCreateJourneyIdentity({
    storage: mockStorage1,
    nowMs: t2,
  });
  testAssert(id2.sessionId === id1.sessionId, "Activity within 30m preserves sessionId");
  testAssert(id2.anonymousId === id1.anonymousId, "Activity within 30m preserves anonymousId");
  testAssert(id2.journeyId === id1.journeyId, "Activity within 30m preserves journeyId");

  // 1C. Inactivity > 30 minutes rotates sessionId while preserving anonymousId & journeyId
  const t3 = t2 + SESSION_INACTIVITY_WINDOW_MS + 5000; // 30m 5s after id2
  const id3 = getOrCreateJourneyIdentity({
    storage: mockStorage1,
    nowMs: t3,
  });
  testAssert(id3.sessionId !== id1.sessionId, "Inactivity > 30m rotates sessionId to new session");
  testAssert(id3.anonymousId === id1.anonymousId, "Inactivity > 30m preserves anonymousId");
  testAssert(id3.journeyId === id1.journeyId, "Inactivity > 30m preserves journeyId");

  // 1D. Storage denial / Safari private quota exception falls back gracefully
  class ThrowingStorage implements StorageLike {
    getItem(): string | null {
      throw new Error("QuotaExceededError: The quota has been exceeded.");
    }
    setItem(): void {
      throw new Error("QuotaExceededError: The quota has been exceeded.");
    }
    removeItem(): void {
      throw new Error("QuotaExceededError: The quota has been exceeded.");
    }
    clear(): void {}
  }
  const throwingStorage = new ThrowingStorage();
  const idDegraded = getOrCreateJourneyIdentity({
    storage: throwingStorage,
    nowMs: 2000000,
  });
  testAssert(Boolean(idDegraded.anonymousId && idDegraded.sessionId && idDegraded.journeyId), "Throwing storage generates valid in-memory identity");
  testAssert(idDegraded.degradedIdentity === true, "Identity flagged degradedIdentity: true when storage throws");

  // 1E. Draft binding & resuming
  bindJourneyToDraft("draft_test_123", id1.journeyId, mockStorage1);
  const resumedId = resumeJourneyFromDraft("draft_test_123", { storage: mockStorage1 });
  testAssert(resumedId.journeyId === id1.journeyId, "Draft resume preserves bound journeyId");
  testAssert(resumedId.anonymousId === id1.anonymousId, "Draft resume preserves bound anonymousId");

  // 1F. Traffic provenance classification tests (never uses screen size or IP for founder)
  const provCustomer = classifyTrafficProvenance();
  testAssert(provCustomer.role === "customer", "Standard visitor classifies as customer");

  const provFounder = classifyTrafficProvenance({ isFounderFlag: true });
  testAssert(provFounder.role === "founder", "Explicit founder flag classifies as founder");

  const provStaff = classifyTrafficProvenance({ isStaffFlag: true });
  testAssert(provStaff.role === "staff", "Explicit staff flag classifies as staff");

  const provBot = classifyTrafficProvenance({ userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" });
  testAssert(provBot.role === "known_bot", "Crawler user agent classifies as known_bot");

  const provSynthetic = classifyTrafficProvenance({ userAgent: "Mozilla/5.0 Playwright/1.40.0" });
  testAssert(provSynthetic.role === "synthetic", "Automated test user agent classifies as synthetic");

  const provOverride = classifyTrafficProvenance({ queryOverride: "founder", explicitOverride: true });
  testAssert(provOverride.role === "founder" && provOverride.explicitOverride === true, "Explicit operator override respected");

  // ---------------------------------------------------------------------------
  // SUITE 2: Funnel Milestone Integrity & Bridging (AC01)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 2: Funnel Milestone Integrity & Bridging ---");

  // 2A. cover_loaded and note_template_loaded do NOT advance funnel milestones
  testAssert(classifyMilestone("cover_loaded") === null, "cover_loaded does NOT classify as milestone");
  testAssert(classifyMilestone("note_template_loaded") === null, "note_template_loaded does NOT classify as milestone");
  testAssert(classifyMilestone("note_confirmed") === "note_completed", "note_confirmed classifies as note_completed");
  testAssert(classifyMilestone("address_confirmed") === "address_completed", "address_confirmed classifies as address_completed");
  testAssert(classifyMilestone("address_deferred") === "address_completed", "address_deferred classifies as address_completed");
  testAssert(classifyMilestone("payment_captured") === "paid", "payment_captured classifies as paid");

  // Ingest cover_loaded and note_template_loaded via ingestEventV2
  const envCover = buildEventV2Envelope({
    event_name: "cover_loaded",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { presetId: "sympathy-01", occasion: "sympathy", autoSelected: true },
  });
  const coverResult = await ingestEventV2(envCover);
  testAssert(coverResult.accepted === true, "cover_loaded successfully ingested");

  const envNoteTemplate = buildEventV2Envelope({
    event_name: "note_template_loaded",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { charCount: 120, occasion: "sympathy", noteEdited: false, wasEdited: false },
  });
  const noteTemplateResult = await ingestEventV2(envNoteTemplate);
  testAssert(noteTemplateResult.accepted === true, "note_template_loaded successfully ingested");

  // 2B. note_confirmed bridges to note_completed with noteEdited flag
  const envNoteConfirmedUnedited = buildEventV2Envelope({
    event_name: "note_confirmed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { charCount: 150, fontId: "hwDavid", noteEdited: false, wasEdited: false },
  });
  const noteConfirmedResult = await ingestEventV2(envNoteConfirmedUnedited);
  testAssert(noteConfirmedResult.accepted === true, "note_confirmed with noteEdited: false ingested and bridged");

  const envNoteConfirmedEdited = buildEventV2Envelope({
    event_name: "note_confirmed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { charCount: 210, fontId: "hwDavid", noteEdited: true, wasEdited: true },
  });
  const noteConfirmedEditedResult = await ingestEventV2(envNoteConfirmedEdited);
  testAssert(noteConfirmedEditedResult.accepted === true, "note_confirmed with noteEdited: true ingested and bridged");

  // 2C. address_confirmed and address_deferred bridging
  const envAddrConfirmed = buildEventV2Envelope({
    event_name: "address_confirmed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { hasReturnAddress: true, hasRecipientStreet2: false },
  });
  const addrConfirmedResult = await ingestEventV2(envAddrConfirmed);
  testAssert(addrConfirmedResult.accepted === true, "address_confirmed ingested and bridged to address_completed");

  const envAddrDeferred = buildEventV2Envelope({
    event_name: "address_deferred",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { reason: "sender_will_provide_later" },
  });
  const addrDeferredResult = await ingestEventV2(envAddrDeferred);
  testAssert(addrDeferredResult.accepted === true, "address_deferred ingested and bridged to address_completed");

  // ---------------------------------------------------------------------------
  // SUITE 3: Payment & Offer Failure Diagnostics (AC02)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 3: Payment Diagnostics & Authority Boundary ---");

  // 3A. Browser allowed payment events distinguish payment_ui_failed from canceled/failed/ready
  const paymentEvents = [
    "payment_ui_ready",
    "payment_ui_failed",
    "payment_attempted",
    "payment_failed",
    "payment_action_required",
    "payment_canceled",
    "payment_confirmation_observed",
  ];
  for (const pe of paymentEvents) {
    testAssert(ALLOWED_BROWSER_EVENT_NAMES.has(pe), `Payment diagnostic event '${pe}' is an allowed browser event`);
  }

  // 3B. Ingest payment_ui_failed
  const envUiFailed = buildEventV2Envelope({
    event_name: "payment_ui_failed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { errorCategory: "stripe_element_load_failure", errorMessage: "Failed to mount PaymentElement" },
  });
  const uiFailedResult = await ingestEventV2(envUiFailed);
  testAssert(uiFailedResult.accepted === true, "payment_ui_failed ingested successfully");

  // 3C. Ingest payment_canceled
  const envCanceled = buildEventV2Envelope({
    event_name: "payment_canceled",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { attemptId: "att_123", reason: "user_back_button" },
  });
  const canceledResult = await ingestEventV2(envCanceled);
  testAssert(canceledResult.accepted === true, "payment_canceled ingested successfully");

  // 3D. Authority events check: server-only authority events are identified and forbidden from browser
  const authorityList = [
    "payment_succeeded",
    "card_rendered",
    "mail_dispatched",
    "order_state_transitioned",
    "reconciliation_completed",
  ];
  for (const ae of authorityList) {
    testAssert(isAuthorityEvent(ae), `Event '${ae}' is identified as an authority event`);
    testAssert(AUTHORITY_EVENTS.has(ae), `Event '${ae}' is in AUTHORITY_EVENTS set`);
  }

  // 3E. API route rejection of browser authority events
  await resetTelemetryCollectorDiagnostics();
  const reqAuthority = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: "mail_dispatched",
      sessionId: id1.sessionId,
      orderId: "ord_fake_999",
    }),
  });
  const resAuthority = await telemetryRoutePost(reqAuthority);
  testAssert(resAuthority.status === 403, "Browser POST of authority event 'mail_dispatched' returns 403");

  const diag = await getTelemetryCollectorDiagnostics();
  testAssert(diag.rejectedCount > 0, "Collector rejection diagnostics count incremented for authority rejection");
  testAssert((diag.rejectionReasons["browser_authority_rejected"] || 0) > 0, "Rejection reason 'browser_authority_rejected' recorded in diagnostics");

  // ---------------------------------------------------------------------------
  // SUITE 4: Redaction & Privacy Boundary (AC03)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 4: Redaction & Privacy Boundary ---");

  // 4A. Prohibited metadata keys stripped
  const rawMetadataWithPii = {
    occasion: "sympathy",
    handwrittenNote: "Dear grandma, rest in peace.",
    recipientAddress: { street: "123 Main St", zip: "90210" },
    customerEmail: "private.customer@example.com",
    insideNoteText: "Secret handwritten contents",
    salutation: "Dear Jane,",
    signOff: "With love, Bob",
    addressLine1: "123 Secret Lane",
    recipientName: "Jane Doe",
    senderName: "Bob Smith",
    charCount: 45,
    fontId: "hwDavid",
    wasEdited: true,
  };
  const { sanitized } = sanitizeMetadata("note_confirmed", rawMetadataWithPii);
  testAssert(sanitized.charCount === 45, "Safe metadata key 'charCount' preserved");
  testAssert(sanitized.fontId === "hwDavid", "Safe metadata key 'fontId' preserved");
  testAssert(!("handwrittenNote" in sanitized), "Prohibited key 'handwrittenNote' stripped");
  testAssert(!("recipientAddress" in sanitized), "Prohibited key 'recipientAddress' stripped");
  testAssert(!("customerEmail" in sanitized), "Prohibited key 'customerEmail' stripped");
  testAssert(!("insideNoteText" in sanitized), "Prohibited key 'insideNoteText' stripped");
  testAssert(!("salutation" in sanitized), "Prohibited key 'salutation' stripped");
  testAssert(!("signOff" in sanitized), "Prohibited key 'signOff' stripped");
  testAssert(!("addressLine1" in sanitized), "Prohibited key 'addressLine1' stripped");

  // 4B. Value redaction: emails & bearer tokens in values are dropped
  const rawMetadataWithTokens = {
    fontId: "hwDavid",
    charCount: 30,
    emailValue: "reach me at secret@customer.org for details",
    tokenValue: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz",
  };
  const { sanitized: sanitizedTokens } = sanitizeMetadata("note_confirmed", rawMetadataWithTokens);
  testAssert(sanitizedTokens.fontId === "hwDavid", "Safe string preserved");
  testAssert(!("emailValue" in sanitizedTokens), "Value containing email dropped");
  testAssert(!("tokenValue" in sanitizedTokens), "Value containing Bearer token dropped");

  // 4C. URL sanitization
  const dirtyUrl = "https://sendmynotes.com/preview/entry?token=supersecret123&occasion=birthday#hash";
  const cleanUrl = sanitizeUrlOrPath(dirtyUrl);
  testAssert(cleanUrl === "https://sendmynotes.com/preview/entry", "URL sanitized to origin + pathname without query params/hash");

  // 4D. GPC consent resolution
  const consentHeaderGpc = resolveConsentState({ secGpcHeader: "1" });
  testAssert(consentHeaderGpc === "gpc_restricted", "sec-gpc: 1 header resolves consent to 'gpc_restricted'");

  // ---------------------------------------------------------------------------
  // SUITE 5: Deduplication, Stable Event IDs, Clock Skew (AC04)
  // ---------------------------------------------------------------------------
  console.log("\n--- Suite 5: Deduplication, Stable Event IDs & Clock Skew ---");

  // 5A. Deduplication via ingestEventV2 with stable eventId
  const stableEventId = "evt_dedupe_test_" + Date.now();
  const envelopeFirst = buildEventV2Envelope({
    event_id: stableEventId,
    event_name: "entry_viewed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { entryRoute: "/preview/entry", occasion: "sympathy" },
  });
  const firstIngest = await ingestEventV2(envelopeFirst);
  testAssert(firstIngest.accepted === true && !firstIngest.duplicate, "First event ingestion succeeds with duplicate: false");

  const envelopeSecond = buildEventV2Envelope({
    event_id: stableEventId,
    event_name: "entry_viewed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { entryRoute: "/preview/entry", occasion: "sympathy" },
  });
  const secondIngest = await ingestEventV2(envelopeSecond);
  testAssert(secondIngest.accepted === true && secondIngest.duplicate === true, "Second event ingestion with same eventId returns duplicate: true");
  const concurrentId = `evt_concurrent_${Date.now()}`;
  const concurrentEnvelopes = [1, 2].map((n) => buildEventV2Envelope({ event_name: "entry_viewed", event_id: concurrentId, session_id: `concurrent_sess_${n}` }));
  const concurrentResults = await Promise.all(concurrentEnvelopes.map((env) => ingestEventV2(env)));
  testAssert(concurrentResults.filter((result) => !result.duplicate).length === 1 && concurrentResults.every((result) => result.accepted), "Concurrent identical event IDs persist once and report one duplicate");

  const diagAfterDedupe = await getTelemetryCollectorDiagnostics();
  testAssert(diagAfterDedupe.duplicateCount > 0, "Collector duplicate count incremented");

  const acceptedBeforeConcurrentCounters = diagAfterDedupe.acceptedCount;
  await Promise.all(Array.from({ length: 12 }, () => recordTelemetryCollectorSuccess("entry_viewed")));
  const diagAfterConcurrentCounters = await getTelemetryCollectorDiagnostics();
  testAssert(diagAfterConcurrentCounters.acceptedCount === acceptedBeforeConcurrentCounters + 12, "Concurrent collector counter updates persist without lost increments");

  // 5B. API route deduplication with client-supplied eventId
  const apiEventId = "evt_api_retry_" + Date.now();
  const reqApiFirst = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: apiEventId,
      eventName: "entry_viewed",
      sessionId: id1.sessionId,
      metadata: { entryRoute: "/preview/entry" },
    }),
  });
  const resApiFirst = await telemetryRoutePost(reqApiFirst);
  const jsonApiFirst = await resApiFirst.json();
  testAssert(resApiFirst.status === 200 && jsonApiFirst.accepted === true, "First API ingestion succeeds");

  const reqApiSecond = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: apiEventId,
      eventName: "entry_viewed",
      sessionId: id1.sessionId,
      metadata: { entryRoute: "/preview/entry" },
    }),
  });
  const resApiSecond = await telemetryRoutePost(reqApiSecond);
  const jsonApiSecond = await resApiSecond.json();
  testAssert(resApiSecond.status === 200 && jsonApiSecond.duplicate === true, "Retry API ingestion with same eventId returns duplicate: true");

  // 5C. Clock skew observation
  const clientTimeFuture = Date.now() - 15000; // 15s in past
  const envelopeSkew = buildEventV2Envelope({
    event_name: "entry_viewed",
    session_id: id1.sessionId,
    anonymous_id: id1.anonymousId,
    journey_id: id1.journeyId,
    properties: { entryRoute: "/preview/entry" },
    occurred_at: clientTimeFuture,
  });
  testAssert(typeof envelopeSkew.clock_skew_ms === "number" && envelopeSkew.clock_skew_ms >= 14000, "Envelope records clock_skew_ms");

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`📊 SPRINT-0003 TELEMETRY V2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSprint0003TelemetryV2Tests().catch((err) => {
  console.error("💥 Unhandled test error:", err);
  process.exit(1);
});
