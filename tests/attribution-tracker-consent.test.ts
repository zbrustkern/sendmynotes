import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual component in a fresh module per case. All browser, React,
// capture and provider dependencies are isolated mocks; no network or disk writes.
const source = fs.readFileSync("components/AttributionTracker.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const legacy = { utmSource: "google", utmMedium: "cpc", gclid: "old-click", capturedAt: Date.now(), expiresAt: Date.now() + 60000 };
const oldSnapshot = { schemaVersion: 2, currentSessionTouch: { touchId: "old-touch" } };
const freshSnapshot = { schemaVersion: 2, currentSessionTouch: { touchId: "fresh-touch" } };

type Consent = "granted" | "denied" | "gpc_restricted" | "not_required";
function harness(enabled = true) {
  const state = { consent: "granted" as Consent, blocked: false, cookieReads: 0, snapshotReads: 0, clears: 0,
    snapshot: null as unknown, pending: [] as Array<(snapshot: unknown) => void>, effects: [] as Array<() => unknown> };
  function storage() {
    const data = new Map<string, string>();
    return { data,
      getItem(key: string) { if (state.blocked) throw Error("blocked"); return data.get(key) ?? null; },
      setItem(key: string, value: string) { if (state.blocked) throw Error("blocked"); data.set(key, value); },
      removeItem(key: string) { if (state.blocked) throw Error("blocked"); data.delete(key); },
    };
  }
  const localStorage = storage(), sessionStorage = storage();
  const modules: Record<string, unknown> = {
    react: { useEffect: (effect: () => unknown) => state.effects.push(effect), useRef: (current: unknown) => ({ current }) },
    "react/jsx-runtime": { jsx: () => null },
    "next/navigation": { useSearchParams: () => new URLSearchParams(), usePathname: () => "/" },
    "@/lib/telemetry": { getGoogleClientId: () => undefined },
    "@/lib/google-ads": { GA4_MEASUREMENT_ID: "" },
    "@/lib/order-attribution": { mayStoreGoogleClientId: () => false },
    "@/lib/meta-ads": { getMetaBrowserCookie: () => { state.cookieReads++; return "meta-cookie"; }, buildMetaFbcString: () => undefined },
    "@/lib/telemetry-schema": { sanitizeUrlOrPath: (value: unknown) => value },
    "@/lib/post-purchase/link-client": {},
    "@/lib/journey-identity": { resolveConsentState: () => state.consent, getOrCreateJourneyIdentity: () => ({ sessionId: "test-session" }) },
    "@/lib/attribution-contract": { FIRST_OBSERVED_TOUCH_STORAGE_KEY: "first-v2", SESSION_TOUCH_STORAGE_KEY: "session-v2" },
    "@/lib/attribution-capture": {
      getAttributionStorageForBrowser: () => ({ storage: localStorage }),
      readAttributionSnapshotV2: () => { state.snapshotReads++; return state.snapshot; },
      captureAttributionSnapshotV2: ({ consentState }: { consentState: Consent }) => {
        if (consentState === "denied" || consentState === "gpc_restricted") {
          state.clears++; state.snapshot = null;
          return Promise.resolve({ schemaVersion: 2 });
        }
        return new Promise((resolve) => state.pending.push(resolve));
      },
    },
  };
  const exports: Record<string, any> = {};
  const context = vm.createContext({ exports, module: { exports }, require: (name: string) => {
    if (!(name in modules)) throw Error(`Unmocked import: ${name}`);
    return modules[name];
  }, process: { env: { NEXT_PUBLIC_ATTRIBUTION_V2_ENABLED: String(enabled) } },
  window: { localStorage, sessionStorage, location: { pathname: "/", search: "", origin: "https://example.invalid" } },
  localStorage, sessionStorage, document: { referrer: "", cookie: "" }, navigator: {}, URL, URLSearchParams, console });
  vm.runInContext(compiled + "\nexports.mountForTest = AttributionTrackerInner;", context);
  return { state, localStorage, sessionStorage,
    read: () => exports.getStoredAttribution(),
    seed: (store = sessionStorage) => store.data.set("smn_attribution", JSON.stringify({ ...legacy, attributionV2: oldSnapshot })),
    capture: () => {
      state.effects = [];
      exports.mountForTest();
      // Select by behavior rather than React scheduling: this effect invokes capture.
      const effect = state.effects.find((fn) => fn.toString().includes("captureAttributionSnapshotV2"));
      assert.ok(effect); return effect();
    },
  };
}

async function main() {
  let checks = 0;
  for (const consent of ["denied", "gpc_restricted"] as const) {
    for (const enabled of [true, false]) {
      const h = harness(enabled);
      h.seed(); h.seed(h.localStorage); h.state.snapshot = oldSnapshot;
      h.state.consent = consent;
      const result = h.read();
      assert.equal(result.attributionV2, undefined);
      assert.equal(result.optOut, consent === "denied");
      assert.equal(result.gpc, consent === "gpc_restricted");
      assert.equal(result.utmSource, "google", "legacy campaign compatibility");
      assert.equal(h.state.cookieReads, 0, "no restricted cookie backfill");
      assert.equal(h.state.snapshotReads, 0, "no restricted snapshot read");
      for (const store of [h.localStorage, h.sessionStorage]) {
        assert.equal(JSON.parse(store.data.get("smn_attribution")!).attributionV2, undefined);
      }
      h.state.blocked = true;
      assert.equal(h.read().attributionV2, undefined, "blocked storage uses scrubbed memory");
      h.state.blocked = false; h.state.consent = "granted";
      assert.equal(h.read().attributionV2, undefined, "regrant does not revive old V2");
      assert.equal(h.read().optOut, false, "regrant clears stale optOut");
      assert.equal(h.read().gpc, false, "regrant clears stale GPC");
      h.state.snapshot = freshSnapshot;
      assert.equal(h.read().attributionV2?.currentSessionTouch.touchId, enabled ? "fresh-touch" : undefined);
      checks++;
    }
    const empty = harness(); empty.state.consent = consent;
    assert.equal(empty.read()[consent === "denied" ? "optOut" : "gpc"], true, "no cache still forwards restriction");
    checks++;
  }
  const memory = harness(); memory.state.blocked = true;
  memory.capture(); memory.state.pending.shift()!(oldSnapshot); await Promise.resolve();
  assert.equal(memory.read().attributionV2.currentSessionTouch.touchId, "old-touch");
  memory.state.consent = "denied";
  assert.equal(memory.read().attributionV2, undefined);
  memory.state.consent = "granted";
  assert.equal(memory.read()?.attributionV2, undefined);
  checks++;

  for (const regrant of [false, true]) {
    const h = harness(); h.state.blocked = true;
    h.capture(); h.state.consent = "denied";
    h.read();
    if (regrant) h.state.consent = "granted";
    // Simulate the capture having written just before its asynchronous completion.
    h.state.snapshot = oldSnapshot;
    h.state.pending.shift()!(oldSnapshot); await Promise.resolve();
    assert.equal(h.state.snapshot, null, "stale completed capture is purged");
    assert.equal(h.read()?.attributionV2, undefined, "stale completion cannot populate memory");
    checks++;
  }
  const cachedDenial = harness(); cachedDenial.state.consent = "not_required";
  cachedDenial.sessionStorage.data.set("smn_attribution", JSON.stringify({ ...legacy, optOut: true, attributionV2: oldSnapshot }));
  assert.equal(cachedDenial.read().optOut, true, "cached explicit denial survives unavailable consent preference");
  assert.equal(cachedDenial.read().attributionV2, undefined);
  assert.equal(cachedDenial.state.cookieReads, 0);
  cachedDenial.state.consent = "granted";
  assert.equal(cachedDenial.read().optOut, false); checks++;
  const expiredDenial = harness(); expiredDenial.state.consent = "not_required";
  expiredDenial.sessionStorage.data.set("smn_attribution", JSON.stringify({ ...legacy, expiresAt: Date.now() - 1, optOut: true, attributionV2: oldSnapshot }));
  expiredDenial.state.snapshot = freshSnapshot;
  const expiredResult = expiredDenial.read();
  assert.equal(expiredResult.optOut, true, "campaign expiry cannot expire cached denial");
  assert.equal(expiredResult.attributionV2, undefined);
  assert.equal(expiredResult.utmSource, undefined, "expired campaign evidence is still discarded");
  assert.equal(expiredDenial.state.snapshotReads, 0); checks++;
  for (const blocked of [false, true]) {
    const regrantFallback = harness(); regrantFallback.seed(); regrantFallback.state.consent = "denied";
    regrantFallback.read(); regrantFallback.state.blocked = blocked;
    regrantFallback.state.consent = "granted";
    assert.equal(regrantFallback.read().optOut, false);
    if (!blocked) {
      for (const store of [regrantFallback.sessionStorage, regrantFallback.localStorage]) {
        const saved = JSON.parse(store.data.get("smn_attribution")!);
        assert.equal(saved.optOut, false, "explicit grant persists cleared opt-out");
        assert.equal(saved.gpc, false, "explicit grant persists cleared GPC");
      }
    }
    regrantFallback.state.consent = "not_required";
    assert.equal(regrantFallback.read().optOut, false, "preference fallback cannot undo known grant");
    regrantFallback.state.blocked = false;
    assert.equal(regrantFallback.read().optOut, false, "recovering storage cannot restore pre-grant flags");
    assert.equal(JSON.parse(regrantFallback.sessionStorage.data.get("smn_attribution")!).optOut, false);
    regrantFallback.state.consent = "denied";
    assert.equal(regrantFallback.read().optOut, true, "new explicit denial still supersedes prior grant");
    checks++;
  }
  const forgottenConsent = harness(); forgottenConsent.seed(); forgottenConsent.state.consent = "denied";
  forgottenConsent.read(); forgottenConsent.state.blocked = true;
  forgottenConsent.state.consent = "not_required"; // Real resolver fallback when consent storage is blocked.
  assert.equal(forgottenConsent.read().optOut, true, "blocked consent storage cannot erase an observed denial");
  forgottenConsent.state.blocked = false; forgottenConsent.state.consent = "granted";
  assert.equal(forgottenConsent.read().optOut, false, "explicit regrant clears remembered denial"); checks++;
  const blockedPurge = harness(); blockedPurge.seed(); blockedPurge.state.snapshot = oldSnapshot;
  blockedPurge.state.blocked = true; blockedPurge.state.consent = "denied";
  assert.equal(blockedPurge.read().attributionV2, undefined);
  blockedPurge.state.consent = "granted"; blockedPurge.state.blocked = false;
  blockedPurge.state.snapshot = oldSnapshot;
  assert.equal(blockedPurge.read()?.attributionV2, undefined, "regrant retries purge of inaccessible caches"); checks++;
  const unmounted = harness(); const cleanup = unmounted.capture() as () => void;
  cleanup(); unmounted.state.pending.shift()!(oldSnapshot); await Promise.resolve();
  assert.equal(unmounted.read(), null, "unmounted capture does not attach"); checks++;
  for (const regrant of [false, true]) {
    const inactive = harness(); const stop = inactive.capture() as () => void;
    stop(); inactive.state.consent = "denied"; inactive.read();
    if (regrant) inactive.state.consent = "granted";
    inactive.state.snapshot = oldSnapshot;
    inactive.state.pending.shift()!(oldSnapshot); await Promise.resolve();
    assert.equal(inactive.state.snapshot, null, "inactive stale capture still purges storage");
    assert.equal(inactive.read()?.attributionV2, undefined); checks++;
  }
  const local = harness(); local.seed(local.localStorage); local.state.consent = "denied";
  assert.equal(local.read().attributionV2, undefined, "local-only cached snapshot is gated"); checks++;
  console.log(`PASS: ${checks} isolated attribution tracker consent scenarios`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
