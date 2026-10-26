import assert from "node:assert/strict";

class FakeStorage {
  values = new Map<string, string>();
  denied = false;
  getItem(key: string) { if (this.denied) throw new Error("denied"); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.denied) throw new Error("denied"); this.values.set(key, value); }
  removeItem(key: string) { if (this.denied) throw new Error("denied"); this.values.delete(key); }
}

async function main() {
  const scheduled = new Map<number, () => void>();
  let timerId = 0;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void) => {
    const id = ++timerId;
    scheduled.set(id, () => fn());
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => { scheduled.delete(id as unknown as number); }) as typeof clearTimeout;

  const storage = new FakeStorage();
  const fakeWindow: any = {
    location: { hostname: "sendmynotes.com", pathname: "/order/test" },
    sessionStorage: storage,
    localStorage: storage,
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { globalPrivacyControl: false } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "", referrer: "" } });

  try {
    const [{ trackGoogleAdsPurchase, markGoogleAdsCheckoutActive, hasGoogleAdsCheckoutProof, cancelGoogleAdsPurchaseRetries }, { sanitizeOrderAttribution, mayStoreGoogleClientId }] = await Promise.all([
      import("@/lib/google-ads"), import("@/lib/order-attribution"),
    ]);
    const snapshot = (orderId: string) => ({ version: 1 as const, transactionId: orderId, amountInCents: 765, currency: "USD" as const, verifiedAt: Date.now(), eligible: true, reason: "eligible" as const, refundStatus: "unknown" as const });
    const runTimers = () => { const pending = [...scheduled.values()]; scheduled.clear(); pending.forEach((fn) => fn()); };

    const attributed = sanitizeOrderAttribution({ gclid: "g-123", wbraid: "w-456", gbraid: "b-789", googleClientId: "GA1.1.123.456", googleClientIdNormalized: "123.456", referrer: "https://example.com/path?token=secret", landingPath: "/start?email=a@example.com", fbp: "fb.1.123.456", fbc: "fb.1.123.click" });
    assert.deepEqual([attributed?.gclid, attributed?.wbraid, attributed?.gbraid], ["g-123", "w-456", "b-789"], "Google click identifiers remain separate");
    assert.equal(attributed?.googleClientId, "GA1.1.123.456", "raw GA cookie remains distinct");
    assert.equal(attributed?.googleClientIdNormalized, "123.456", "normalized GA client ID remains distinct");
    assert.equal(attributed?.referrer, "https://example.com", "referrer query is removed");
    assert.equal(attributed?.landingPath, "/start", "landing query is removed");
    assert.equal(attributed?.fbp, "fb.1.123.456", "existing permitted Meta browser attribution is preserved");
    assert.equal(sanitizeOrderAttribution({ gclid: "bad&id=secret" })?.gclid, undefined, "opaque click IDs reject delimiters");
    assert.equal(sanitizeOrderAttribution({ gclid: "old", capturedAt: 1, expiresAt: 2 }, 3), undefined, "expired attribution is discarded");
    assert.equal(mayStoreGoogleClientId(true, null), false, "GPC blocks delayed GA client-ID backfill");
    assert.equal(mayStoreGoogleClientId(false, { gpc: true }), false, "stored GPC choice blocks delayed GA client-ID backfill");
    assert.equal(mayStoreGoogleClientId(false, { optOut: true }), false, "stored opt-out blocks delayed GA client-ID backfill");
    assert.equal(mayStoreGoogleClientId(false, { gpc: false, optOut: false }), true, "backfill is allowed only without GPC or opt-out");

    storage.denied = true;
    markGoogleAdsCheckoutActive("queue_missing_tag");
    assert.equal(hasGoogleAdsCheckoutProof("queue_missing_tag"), true, "checkout proof has an in-memory fallback when storage is denied");
    assert.equal(trackGoogleAdsPurchase({ orderId: "queue_missing_tag", measurement: snapshot("queue_missing_tag") }), "retrying", "missing tag reports retrying, not queued");
    fakeWindow.gtag = () => {};
    runTimers();
    assert.ok([...storage.values.keys()].some((key) => key.includes("queue_missing_tag")) === false, "storage denial does not prevent accepted local tag calls");

    storage.denied = false;
    let purchaseAttempts = 0;
    fakeWindow.gtag = (...args: unknown[]) => {
      if (args[0] === "event" && args[1] === "purchase" && purchaseAttempts++ === 0) throw new Error("GA4 unavailable");
    };
    markGoogleAdsCheckoutActive("queue_resume");
    assert.equal(trackGoogleAdsPurchase({ orderId: "queue_resume", measurement: snapshot("queue_resume") }), "queued", "Ads is accepted independently when GA4 throws");
    cancelGoogleAdsPurchaseRetries("queue_resume");
    const beforeResume = purchaseAttempts;
    assert.equal(trackGoogleAdsPurchase({ orderId: "queue_resume", measurement: snapshot("queue_resume") }), "suppressed", "Ads transaction dedup remains independent");
    assert.ok(purchaseAttempts > beforeResume, "a remount retries GA4 even after Ads dedup and cancellation");
    runTimers();
    assert.ok(purchaseAttempts >= beforeResume, "scheduled retry cancellation is safe");

    markGoogleAdsCheckoutActive("queue_ads_throw");
    let conversionAttempts = 0;
    fakeWindow.gtag = (...args: unknown[]) => {
      if (args[0] === "event" && args[1] === "conversion" && conversionAttempts++ === 0) throw new Error("Ads tag not ready");
    };
    assert.equal(trackGoogleAdsPurchase({ orderId: "queue_ads_throw", measurement: snapshot("queue_ads_throw") }), "retrying", "a throwing Ads tag is reported as retrying");
    runTimers();
    assert.ok(conversionAttempts >= 2, "a late Ads tag is retried after synchronous failure");

    fakeWindow.location.hostname = "sendmynotes.com";
    assert.equal(trackGoogleAdsPurchase({ orderId: "receipt_replay", measurement: snapshot("receipt_replay") }), "suppressed", "generic receipt without active checkout proof is suppressed");
    fakeWindow.location.hostname = "preview.sendmynotes.com";
    markGoogleAdsCheckoutActive("queue_preview");
    assert.equal(trackGoogleAdsPurchase({ orderId: "queue_preview", measurement: snapshot("queue_preview") }), "suppressed", "staging and preview hosts never emit conversions");
    console.log("google-attribution-queue: all deterministic assertions passed");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

void main().catch((error) => { console.error(error); process.exit(1); });
