import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { pluralize } from "../components/wedding/client";
import {
  ALLOWED_BROWSER_EVENT_NAMES,
  isAuthorityEvent,
  sanitizeMetadata,
} from "../lib/telemetry-schema";
import { sendWeddingPurchaseConversion } from "../lib/wedding/attribution";
import { fireWeddingBrowserPurchase } from "../lib/wedding/attribution-client";
import {
  getThankYouLayoutMetadata,
  getThankYouPageMetadata,
  getWeddingPageMetadata,
} from "../lib/wedding/metadata";

async function testServerMetaCapiConversion() {
  const prevStaging = process.env.STAGING_REVIEW_ONLY;
  const prevToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN;

  try {
    let called = 0;
    const fakeFetch: typeof fetch = async () => {
      called++;
      return new Response(
        JSON.stringify({ events_received: 1, fbtrace_id: "trace_123" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    // 1. Suppresses on staging even when livemode=true and token present
    process.env.STAGING_REVIEW_ONLY = "true";
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "meta_test_token";
    const stagingResult = await sendWeddingPurchaseConversion({
      batchId: "wb_staging_1",
      capturedCents: 9000,
      count: 10,
      buyerEmail: "Couple@Example.com",
      livemode: true,
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(stagingResult, {
      sent: false,
      reason: "staging_or_test_suppressed",
    });
    assert.equal(called, 0);

    // 2. Suppresses when livemode=false
    process.env.STAGING_REVIEW_ONLY = "false";
    const testModeResult = await sendWeddingPurchaseConversion({
      batchId: "wb_test_1",
      capturedCents: 9000,
      count: 10,
      buyerEmail: "Couple@Example.com",
      livemode: false,
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(testModeResult, {
      sent: false,
      reason: "staging_or_test_suppressed",
    });
    assert.equal(called, 0);

    // 3. Suppresses when Meta CAPI token is missing
    delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    const noTokenResult = await sendWeddingPurchaseConversion({
      batchId: "wb_no_token",
      capturedCents: 9000,
      count: 10,
      livemode: true,
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(noTokenResult, {
      sent: false,
      reason: "staging_or_test_suppressed",
    });
    assert.equal(called, 0);

    // 4. Suppresses on optOut, gpc, or attributionV2 denied / gpc_restricted
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "meta_live_token";
    for (const attribution of [
      { optOut: true },
      { gpc: true },
      { attributionV2: { consentState: "denied" } },
      { attributionV2: { consentState: "gpc_restricted" } },
    ]) {
      const consentRes = await sendWeddingPurchaseConversion({
        batchId: "wb_consent_1",
        capturedCents: 9000,
        count: 10,
        buyerEmail: "Couple@Example.com",
        attribution,
        livemode: true,
        fetchImpl: fakeFetch,
      });
      assert.deepEqual(consentRes, {
        sent: false,
        reason: "consent_suppressed",
      });
    }
    assert.equal(called, 0);

    // 5. Sends deduplicated Meta CAPI Purchase on live consented batch
    let capturedUrl = "";
    let capturedBody: { data: Array<Record<string, unknown>> } | null = null;
    const recordingFetch: typeof fetch = async (input, init) => {
      called++;
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({ events_received: 1, fbtrace_id: "trace_live_1" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const liveResult = await sendWeddingPurchaseConversion({
      batchId: "wb_live_42",
      capturedCents: 72700,
      count: 100,
      buyerEmail: "  Bride.And.Groom@Example.COM ",
      attribution: {
        fbp: "fb.1.1700000000.123456",
        fbc: "fb.1.1700000001.AbCdEf",
        attributionV2: { consentState: "granted" },
      },
      livemode: true,
      fetchImpl: recordingFetch,
    });

    assert.equal(called, 1);
    assert.equal(liveResult.sent, true);
    assert.equal(liveResult.eventsReceived, 1);
    assert.ok(capturedUrl.includes("/events?access_token=meta_live_token"));

    assert.ok(capturedBody);
    const events = (capturedBody as { data: Array<Record<string, unknown>> }).data;
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event_name, "Purchase");
    assert.equal(ev.event_id, "wb_live_42");

    const customData = ev.custom_data as Record<string, unknown>;
    assert.equal(customData.value, 727);
    assert.equal(customData.currency, "USD");
    assert.equal(customData.content_type, "product");
    assert.equal(customData.num_items, 100);

    const expectedEmailHash = createHash("sha256")
      .update("bride.and.groom@example.com")
      .digest("hex");
    const userData = ev.user_data as Record<string, unknown>;
    assert.deepEqual(userData.em, [expectedEmailHash]);
    assert.equal(userData.fbp, "fb.1.1700000000.123456");
    assert.equal(userData.fbc, "fb.1.1700000001.AbCdEf");
  } finally {
    if (prevStaging === undefined) delete process.env.STAGING_REVIEW_ONLY;
    else process.env.STAGING_REVIEW_ONLY = prevStaging;
    if (prevToken === undefined)
      delete process.env.META_CONVERSIONS_API_ACCESS_TOKEN;
    else process.env.META_CONVERSIONS_API_ACCESS_TOKEN = prevToken;
  }
}

function testBrowserPurchaseHelper() {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevNav = (globalThis as { navigator?: unknown }).navigator;
  const prevPublicStaging = process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY;

  try {
    delete process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY;
    const fbCalls: unknown[][] = [];
    const gtagCalls: unknown[][] = [];
    const storage = new Map<string, string>();
    (globalThis as { window: unknown }).window = {
      fbq: (...args: unknown[]) => fbCalls.push(args),
      gtag: (...args: unknown[]) => gtagCalls.push(args),
      sessionStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    };
    (globalThis as { navigator: unknown }).navigator = {
      globalPrivacyControl: false,
    };

    // Suppressed on staging
    const staged = fireWeddingBrowserPurchase({
      batchId: "wb_b1",
      totalCents: 900,
      count: 1,
      stagingReviewOnly: true,
    });
    assert.equal(staged.fired, false);
    assert.equal(fbCalls.length, 0);
    assert.equal(gtagCalls.length, 0);

    // Fires Meta Pixel Purchase + Google Ads conversion + GA4 purchase once
    const first = fireWeddingBrowserPurchase({
      batchId: "wb_b2",
      totalCents: 1850,
      count: 2,
      stagingReviewOnly: false,
    });
    assert.equal(first.fired, true);
    assert.equal(fbCalls.length, 1);
    assert.equal(fbCalls[0][0], "track");
    assert.equal(fbCalls[0][1], "Purchase");
    assert.deepEqual(fbCalls[0][3], { eventID: "wb_b2" });
    assert.equal(gtagCalls.length, 2);
    assert.equal(gtagCalls[0][1], "conversion");
    assert.equal(
      (gtagCalls[0][2] as Record<string, unknown>).transaction_id,
      "wb_b2",
    );
    assert.equal(gtagCalls[1][1], "purchase");
    assert.equal(
      (gtagCalls[1][2] as Record<string, unknown>).transaction_id,
      "wb_b2",
    );

    // Deduplicates second call for same batchId
    const second = fireWeddingBrowserPurchase({
      batchId: "wb_b2",
      totalCents: 1850,
      count: 2,
      stagingReviewOnly: false,
    });
    assert.equal(second.fired, false);
    assert.equal(second.reason, "duplicate_suppressed");
    assert.equal(fbCalls.length, 1);
  } finally {
    if (prevWindow === undefined)
      delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = prevWindow;
    if (prevNav === undefined)
      delete (globalThis as { navigator?: unknown }).navigator;
    else (globalThis as { navigator: unknown }).navigator = prevNav;
    if (prevPublicStaging === undefined)
      delete process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY;
    else process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY = prevPublicStaging;
  }
}

function testMetadataGeneration() {
  const prevStaging = process.env.STAGING_REVIEW_ONLY;
  try {
    process.env.STAGING_REVIEW_ONLY = "true";
    assert.deepEqual(getThankYouLayoutMetadata().robots, {
      index: false,
      follow: false,
    });
    assert.deepEqual(getWeddingPageMetadata().robots, {
      index: false,
      follow: false,
    });

    process.env.STAGING_REVIEW_ONLY = "false";
    assert.deepEqual(getThankYouLayoutMetadata().robots, {
      index: true,
      follow: true,
    });
    const thankYouMeta = getThankYouPageMetadata();
    const weddingMeta = getWeddingPageMetadata();
    assert.deepEqual(weddingMeta.robots, { index: true, follow: true });
    assert.deepEqual(thankYouMeta.title, {
      absolute: "Thank-you cards | SendMyNotes",
    });
    assert.deepEqual(weddingMeta.title, {
      absolute:
        "Wedding Thank-You Notes Written in Real Pen & Ink | SendMyNotes",
    });
    const ogImages = weddingMeta.openGraph?.images as Array<{ url: string }>;
    assert.equal(ogImages[0].url, "/wedding/hero-handwritten-note.jpg");
  } finally {
    if (prevStaging === undefined) delete process.env.STAGING_REVIEW_ONLY;
    else process.env.STAGING_REVIEW_ONLY = prevStaging;
  }
}

function testGrammarAndTelemetrySchema() {
  assert.equal(pluralize(0, "envelope"), "0 envelopes");
  assert.equal(pluralize(1, "envelope"), "1 envelope");
  assert.equal(pluralize(2, "envelope"), "2 envelopes");
  assert.equal(pluralize(1, "card"), "1 card");
  assert.equal(pluralize(4, "card"), "4 cards");
  assert.equal(pluralize(1, "address", "addresses"), "1 address");
  assert.equal(pluralize(2, "address", "addresses"), "2 addresses");

  const funnelEvents = [
    "wedding_landing_viewed",
    "wedding_project_started",
    "wedding_sample_started",
    "wedding_cover_saved",
    "wedding_list_imported",
    "wedding_checkout_started",
    "wedding_purchase_completed",
  ];
  for (const name of funnelEvents) {
    assert.ok(
      ALLOWED_BROWSER_EVENT_NAMES.has(name),
      `${name} must be in ALLOWED_BROWSER_EVENT_NAMES`,
    );
    assert.equal(
      isAuthorityEvent(name),
      false,
      `${name} must not be blocked by isAuthorityEvent`,
    );
  }

  const { sanitized } = sanitizeMetadata("wedding_purchase_completed", {
    batchId: "wb_123",
    count: 10,
    totalCents: 9000,
    stagingReviewOnly: false,
    email: "private@example.com",
  });
  assert.deepEqual(sanitized, {
    batchId: "wb_123",
    count: 10,
    totalCents: 9000,
    stagingReviewOnly: false,
  });
}

async function testExportedHeroImages() {
  const files = [
    ["hero-handwritten-note.webp", "webp"],
    ["hero-handwritten-note.jpg", "jpeg"],
    ["hero-card-envelope.webp", "webp"],
    ["hero-card-envelope.jpg", "jpeg"],
  ] as const;

  for (const [name, expectedFormat] of files) {
    const filePath = join(process.cwd(), "public", "wedding", name);
    const stat = statSync(filePath);
    assert.ok(stat.size > 1000, `${name} must be non-empty`);
    const meta = await sharp(filePath).metadata();
    assert.equal(meta.format, expectedFormat);
    assert.equal(meta.width, 960);
    assert.equal(meta.height, 960);
    assert.equal(meta.exif, undefined, `${name} must have no EXIF`);
    assert.equal(meta.icc, undefined, `${name} must have no ICC`);
    assert.equal(meta.iptc, undefined, `${name} must have no IPTC`);
    assert.equal(meta.xmp, undefined, `${name} must have no XMP`);
  }
}

async function main() {
  await testServerMetaCapiConversion();
  testBrowserPurchaseHelper();
  testMetadataGeneration();
  testGrammarAndTelemetrySchema();
  await testExportedHeroImages();
  console.log("Passed all wedding attribution, metadata, hero image, and UX checks.");
}

void main();
