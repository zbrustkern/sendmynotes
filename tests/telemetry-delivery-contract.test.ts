import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as postTelemetry } from "../app/api/telemetry/route";
import { dispatchTelemetryPayload, flushPendingTelemetry, postTelemetryWithRetry, TELEMETRY_OUTBOX_SESSION_KEY, trackEventV2 } from "../lib/telemetry";
import { firestoreDb } from "../lib/firebase-admin";
import { getTelemetrySummary } from "../lib/metrics-rollup";

const accepted = () => new Response(JSON.stringify({ received: true, accepted: true }), { status: 200 });

async function testRetryKeepsOneStablePayload() {
  const body = JSON.stringify({ schema_version: "v2.0", event_id: "evt_retry_001", event_name: "entry_viewed", session_id: "sess_retry_001" });
  const bodies: string[] = [];
  let call = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    call++;
    if (call === 1) return new Response("busy", { status: 429, headers: { "Retry-After": "0" } });
    if (call === 2) return new Response("temporary", { status: 503 });
    return accepted();
  };

  const result = await postTelemetryWithRetry(body, { fetcher, wait: async () => undefined });
  assert.equal(result, "accepted");
  assert.equal(call, 3, "429 and 5xx retry, then ACK");
  assert.deepEqual(bodies, [body, body, body], "every retry reuses the exact immutable payload and event ID");
}

async function testPermanentFailureDoesNotRetry() {
  let call = 0;
  const fetcher: typeof fetch = async () => {
    call++;
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  };
  const result = await postTelemetryWithRetry(
    JSON.stringify({ event_id: "evt_forbidden_001" }),
    { fetcher, wait: async () => undefined }
  );
  assert.equal(result, "permanent_failure");
  assert.equal(call, 1, "403 is permanent and must not be retried");
}

async function testNetworkFailureIsBounded() {
  let call = 0;
  const fetcher: typeof fetch = async () => {
    call++;
    throw new TypeError("offline");
  };
  const result = await postTelemetryWithRetry(
    JSON.stringify({ event_id: "evt_offline_001" }),
    { fetcher, wait: async () => undefined }
  );
  assert.equal(result, "retry_exhausted");
  assert.equal(call, 3, "network failure is retried only up to the bounded attempt count");
}

async function testConcurrentDispatchCoalescesByEventId() {
  let resolveResponse: ((response: Response) => void) | undefined;
  let call = 0;
  const fetcher: typeof fetch = async () => {
    call++;
    return new Promise<Response>((resolve) => { resolveResponse = resolve; });
  };
  const body = JSON.stringify({ event_id: "evt_coalesce_001", event_name: "entry_viewed", session_id: "sess_coalesce_001" });
  const first = dispatchTelemetryPayload(body, "evt_coalesce_001", { fetcher, wait: async () => undefined });
  const second = dispatchTelemetryPayload(body, "evt_coalesce_001", { fetcher, wait: async () => undefined });
  assert.equal(first, second, "concurrent callers share one in-flight delivery");
  resolveResponse?.(accepted());
  assert.equal(await first, "accepted");
  assert.equal(call, 1);
}

async function testSnakeCaseClientAndAttributionCompatibility() {
  const eventId = `evt_nested_${Date.now()}`;
  const request = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      schema_version: "v2.0",
      event_id: eventId,
      event_name: "entry_viewed",
      session_id: `sess_${eventId}`,
      anonymous_id: `anon_${eventId}`,
      route_template: "/send",
      properties: {
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "smn_first_sale_v1",
        referrer: "https://www.google.com/search?personal=private",
        noteText: "private note text must not be stored",
      },
    }),
  });
  const response = await postTelemetry(request);
  assert.equal(response.status, 200, "snake_case V2 clients remain accepted");
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.accepted, true);

  const v2 = await firestoreDb.collection("telemetry_events_v2").doc(`ev_${eventId}`).get();
  assert.equal(v2.exists, true);
  const v2Data = v2.data() as any;
  assert.equal(v2Data.properties.utmSource, "google");
  assert.equal(v2Data.properties.utmMedium, "cpc");
  assert.equal(v2Data.properties.utmCampaign, "smn_first_sale_v1");
  assert.equal(v2Data.properties.referrer, "https://www.google.com/search");
  assert.equal("noteText" in v2Data.properties, false, "unknown personal content is dropped by the event allowlist");

  const duplicateRequest = new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      schema_version: "v2.0",
      event_id: eventId,
      event_name: "entry_viewed",
      session_id: `sess_${eventId}`,
      anonymous_id: `anon_${eventId}`,
      route_template: "/send",
      properties: { utm_source: "google", utm_medium: "cpc", utm_campaign: "smn_first_sale_v1" },
    }),
  });
  const duplicate = await postTelemetry(duplicateRequest);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true, "replay is ACKed as a duplicate without a second raw event");
}

async function testBrowserCannotClaimCapture() {
  const response = await postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: `evt_authority_${Date.now()}`, event_name: "payment_captured", session_id: `sess_authority_${Date.now()}` }),
  }));
  assert.equal(response.status, 403, "payment capture remains server-only");
}

async function testVersionedPayloadRequiresStableId() {
  const missingId = await postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "entry_viewed", session_id: "sess_v2_missing_id" }),
  }));
  assert.equal(missingId.status, 400, "V2-shaped payload cannot silently receive a random event ID");

  const badVersion = await postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema_version: "v3.0", event_id: "evt_bad_version_001", event_name: "entry_viewed", session_id: "sess_v2_bad_version" }),
  }));
  assert.equal(badVersion.status, 400, "unsupported explicit schema versions are rejected permanently");

  const legacy = await postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName: "generation_requested", sessionId: "sess_legacy_no_id" }),
  }));
  assert.equal(legacy.status, 200, "camelCase legacy clients may omit event IDs");
  assert.equal((await legacy.json()).accepted, true);
}

async function testDeniedAndGpcStripAcquisition() {
  const makeRequest = (eventId: string, consentState: string, header?: string) => new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { "Sec-GPC": header } : {}),
    },
    body: JSON.stringify({
      schema_version: "v2.0",
      event_id: eventId,
      event_name: "entry_viewed",
      session_id: `sess_${eventId}`,
      consent_state: consentState,
      utm_source: "google",
      gclid: "top-level-click-id",
      referrer: "https://www.google.com/search?q=private",
      properties: {
        utmCampaign: "campaign-from-properties",
        fbclid: "nested-click-id",
        referrer: "https://www.google.com/search?q=nested-private",
      },
    }),
  });

  const deniedId = "evt_consent_denied_001";
  const denied = await postTelemetry(makeRequest(deniedId, "denied"));
  assert.equal(denied.status, 200, "a denied visitor's minimal operational milestone is still acknowledged");
  assert.equal((await denied.json()).accepted, true);
  const deniedEnvelope = (await firestoreDb.collection("telemetry_events_v2").doc(`ev_${deniedId}`).get()).data() as any;
  assert.equal(deniedEnvelope.consent_state, "denied");
  assert.deepEqual(deniedEnvelope.properties, {}, "denied V2 events retain no acquisition properties");
  const deniedLegacy = (await firestoreDb.collection("telemetry_events").doc(deniedId).get()).data() as any;
  for (const key of ["utmSource", "utmMedium", "utmCampaign", "gclid", "wbraid", "gbraid", "fbclid", "referrer"]) {
    assert.equal(deniedLegacy?.[key], undefined, `denied legacy adapter omits ${key}`);
  }

  const gpcId = "evt_consent_gpc_001";
  const gpc = await postTelemetry(makeRequest(gpcId, "granted", "1"));
  assert.equal(gpc.status, 200, "GPC-restricted operational milestone is still acknowledged");
  assert.equal((await gpc.json()).accepted, true);
  const gpcEnvelope = (await firestoreDb.collection("telemetry_events_v2").doc(`ev_${gpcId}`).get()).data() as any;
  assert.equal(gpcEnvelope.consent_state, "gpc_restricted", "Sec-GPC overrides client-supplied granted consent");
  assert.deepEqual(gpcEnvelope.properties, {}, "GPC-restricted V2 events retain no acquisition properties");
}

async function testDeniedEmitterKeepsOnlyFirstPartyMilestone() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const values = new Map<string, string>([["smn_privacy_consent", "denied"]]);
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let gtagCalls = 0;
  let sentBody = "";
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/send" },
    innerWidth: 390,
    screen: { width: 390, height: 844 },
    gtag: () => { gtagCalls++; },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", referrer: "https://www.google.com/?private=1" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Mozilla/5.0" } });
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    sentBody = String(init?.body || "");
    return accepted();
  }) as typeof fetch;

  try {
    await trackEventV2("entry_viewed", {
      utmSource: "google",
      utmCampaign: "private-campaign",
      referrer: "https://www.google.com/?private=1",
      gclid: "private-click-id",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(sentBody);
    assert.equal(payload.consent_state, "denied");
    assert.deepEqual(payload.properties, {}, "denied browser event sends only its first-party envelope milestone");
    assert.equal(gtagCalls, 0, "denied consent suppresses third-party gtag forwarding");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as any).window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as any).document;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as any).navigator;
  }
}

async function testGrantedOutboxRecoversAfterRefreshWithoutPersonalContent() {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;
  const values = new Map<string, string>([["smn_privacy_consent", "granted"]]);
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const browserWindow = () => ({
    localStorage: storage,
    sessionStorage: storage,
    location: { pathname: "/send" },
    innerWidth: 390,
    screen: { width: 390, height: 844 },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow() });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", referrer: "" } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Mozilla/5.0", globalPrivacyControl: false } });

  const failedBodies: string[] = [];
  let failures = 0;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    failedBodies.push(String(init?.body || ""));
    failures++;
    return new Response("temporarily unavailable", { status: 503, headers: { "Retry-After": "0" } });
  }) as typeof fetch;

  try {
    await trackEventV2("entry_viewed", {
      utmSource: "google",
      utmCampaign: "quiet_recovery_test",
      noteText: "MUST NEVER BE STORED",
      recipientEmail: "private@example.invalid",
      streetAddress: "123 Private Street",
    });
    for (let i = 0; failures < 3 && i < 200; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(failures, 3, "first-page delivery attempts remain bounded at three");
    const stored = values.get(TELEMETRY_OUTBOX_SESSION_KEY);
    assert.ok(stored, "granted V2 event remains in tab sessionStorage after bounded retry exhaustion");
    const queue = JSON.parse(stored!) as Array<{ eventId: string; payload: string; createdAt: number }>;
    assert.equal(queue.length, 1, "one logical milestone has one queued envelope");
    const parsed = JSON.parse(queue[0].payload);
    assert.equal(parsed.event_id, queue[0].eventId, "outbox stable ID matches the immutable envelope ID");
    for (const forbidden of ["MUST NEVER BE STORED", "private@example.invalid", "123 Private Street"]) {
      assert.equal(stored!.includes(forbidden), false, "outbox stores only the sanitized event contract");
    }

    // A new page runtime receives the same tab-scoped sessionStorage, modeling refresh.
    Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow() });
    const recoveredBodies: string[] = [];
    await flushPendingTelemetry("granted", {
      wait: async () => undefined,
      fetcher: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        recoveredBodies.push(String(init?.body || ""));
        return accepted();
      }) as typeof fetch,
    });
    assert.equal(recoveredBodies.length, 1, "refresh recovery sends the one pending event once");
    assert.equal(recoveredBodies[0], queue[0].payload, "refresh retry reuses the exact same payload and event ID");
    assert.equal(values.has(TELEMETRY_OUTBOX_SESSION_KEY), false, "ACK removes recovered payload from sessionStorage");

    // A later opt-out clears any prior queue and does not persist a new event.
    values.set("smn_privacy_consent", "denied");
    globalThis.fetch = (async () => accepted()) as typeof fetch;
    await trackEventV2("entry_viewed", { utmSource: "google" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(values.has(TELEMETRY_OUTBOX_SESSION_KEY), false, "denied-consent traffic is never persisted to the recovery queue");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as any).window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as any).document;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete (globalThis as any).navigator;
  }
}

async function testV2DuplicateRepairsPartialLegacyProjectionExactlyOnce() {
  const eventId = "evt_partial_projection_001";
  const sessionId = "sess_partial_projection_001";
  const makeRequest = () => new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "v2.0",
      event_id: eventId,
      event_name: "generation_requested",
      session_id: sessionId,
      properties: { occasion: "birthday" },
    }),
  });

  const legacyCollection = firestoreDb.collection("telemetry_events") as any;
  const originalDoc = legacyCollection.doc.bind(legacyCollection);
  let failFirstFullProjection = true;
  legacyCollection.doc = (id?: string) => {
    const ref = originalDoc(id);
    if (id === eventId) {
      const originalSet = ref.set.bind(ref);
      ref.set = async (data: any, options?: any) => {
        if (failFirstFullProjection && typeof data?.eventName === "string") {
          failFirstFullProjection = false;
          throw new Error("synthetic legacy projection write failure");
        }
        return originalSet(data, options);
      };
    }
    return ref;
  };

  try {
    const before = await getTelemetrySummary();
    const rawBefore = before.rawEventCounts?.generation_requested || 0;
    const first = await postTelemetry(makeRequest());
    assert.equal(first.status, 500, "first request reports the simulated post-V2 legacy write failure");
    const v2BeforeRetry = await firestoreDb.collection("telemetry_events_v2").doc(`ev_${eventId}`).get();
    assert.equal(v2BeforeRetry.exists, true, "V2 envelope remains durable after legacy adapter failure");
    const canonicalBefore = JSON.stringify(v2BeforeRetry.data());
    const legacyAfterFailure = await firestoreDb.collection("telemetry_events").doc(eventId).get();
    assert.equal((legacyAfterFailure.data() as any)?.eventName, undefined, "failed adapter left only a retry marker");

    const retry = await postTelemetry(makeRequest());
    assert.equal(retry.status, 200, "same event ID retries the legacy adapter after V2 deduplication");
    assert.equal((await retry.json()).duplicate, true, "V2 duplicate is reported while legacy projection is repaired");
    const legacyAfterRetry = await firestoreDb.collection("telemetry_events").doc(eventId).get();
    assert.equal((legacyAfterRetry.data() as any)?.eventName, "generation_requested");
    assert.equal((legacyAfterRetry.data() as any)?._telemetryProjectionState, undefined, "transient projection fields are removed after success");

    const replay = await postTelemetry(makeRequest());
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).duplicate, true);
    const after = await getTelemetrySummary();
    assert.equal(after.rawEventCounts?.generation_requested, rawBefore + 1, "semantic event count increments exactly once across failure, retry, and replay");
    const v2AfterReplay = await firestoreDb.collection("telemetry_events_v2").doc(`ev_${eventId}`).get();
    assert.equal(JSON.stringify(v2AfterReplay.data()), canonicalBefore, "V2 raw envelope stays canonical and unchanged");
  } finally {
    legacyCollection.doc = originalDoc;
  }
}

async function main() {
  await testRetryKeepsOneStablePayload();
  await testPermanentFailureDoesNotRetry();
  await testNetworkFailureIsBounded();
  await testConcurrentDispatchCoalescesByEventId();
  await testSnakeCaseClientAndAttributionCompatibility();
  await testBrowserCannotClaimCapture();
  await testVersionedPayloadRequiresStableId();
  await testDeniedAndGpcStripAcquisition();
  await testDeniedEmitterKeepsOnlyFirstPartyMilestone();
  await testGrantedOutboxRecoversAfterRefreshWithoutPersonalContent();
  await testV2DuplicateRepairsPartialLegacyProjectionExactlyOnce();
  console.log("PASS telemetry-delivery-contract: retries bounded, idempotent ACK, snake_case attribution, privacy allowlist, authority guard");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
