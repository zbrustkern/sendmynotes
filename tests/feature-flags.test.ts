import { NextRequest } from "next/server";
import {
  getFeatureFlags,
  getFeatureFlagsState,
  updateFeatureFlag,
  isReworkV3Enabled,
  FEATURE_FLAG_KEYS,
  COOKIE_REWORK_V3,
  QUERY_PARAM_V3,
} from "../lib/feature-flags";
import { GET as adminGet, POST as adminPost } from "../app/api/admin/feature-flags/route";
import { GET as publicGet } from "../app/api/feature-flags/route";

async function runFeatureFlagsTests() {
  console.log("=================================================");
  console.log("🚩 RUNNING FEATURE FLAGS & V3 ROLLOUT TESTS");
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

  // ---------------------------------------------------------------------------
  // 1. Initial State & Defaults
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. Testing Default Flags & Fallback Initialization ---");
  {
    // Reset flag to false initially
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, false);

    const flags = await getFeatureFlags();
    assert(
      flags.reworkV3Experience === false,
      `reworkV3Experience defaults to false (Got: ${flags.reworkV3Experience})`
    );

    const isEnabled = await isReworkV3Enabled();
    assert(
      isEnabled === false,
      `isReworkV3Enabled() returns false when flag is disabled without overrides`
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Persistence & Firestore Updates
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Flag Persistence & Firestore Updates ---");
  {
    // Update flag to true
    const updatedFlags = await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, true);
    assert(
      updatedFlags.reworkV3Experience === true,
      `updateFeatureFlag sets reworkV3Experience to true in returned map`
    );

    const reloadedFlags = await getFeatureFlags();
    assert(
      reloadedFlags.reworkV3Experience === true,
      `getFeatureFlags() immediately reflects persisted true flag`
    );

    const isEnabled = await isReworkV3Enabled();
    assert(
      isEnabled === true,
      `isReworkV3Enabled() returns true when flag is enabled in Firestore`
    );

    // Verify metadata
    const state = await getFeatureFlagsState();
    assert(
      typeof state.updatedAt === "number" && state.updatedAt > 0,
      `getFeatureFlagsState() includes valid updatedAt timestamp`
    );

    // Test custom flag
    await updateFeatureFlag("experimentalStudioMode", true);
    const flagsWithCustom = await getFeatureFlags();
    assert(
      flagsWithCustom.experimentalStudioMode === true && flagsWithCustom.reworkV3Experience === true,
      `Custom flag persisted without clobbering existing flags`
    );

    // Reset back to false for further override testing
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, false);
  }

  // ---------------------------------------------------------------------------
  // 3. Query Parameter Overrides (?v3=1 / ?v3=0)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Query Parameter Overrides (?v3=1 / ?v3=0) ---");
  {
    // When flag in Firestore is false:
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, false);

    // Query override v3=1 via searchParams
    const forceOnParams = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=1"),
    });
    assert(
      forceOnParams === true,
      `searchParams v3=1 overrides false Firestore flag to true`
    );

    // Query override v3=true
    const forceOnTrue = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=true"),
    });
    assert(
      forceOnTrue === true,
      `searchParams v3=true overrides false Firestore flag to true`
    );

    // Query override v3=1 via NextRequest URL
    const nextReqOn = new NextRequest("http://localhost:3000/?v3=1");
    const forceOnNextReq = await isReworkV3Enabled(nextReqOn);
    assert(
      forceOnNextReq === true,
      `NextRequest with ?v3=1 overrides false Firestore flag to true`
    );

    // When flag in Firestore is true:
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, true);

    // Query override v3=0
    const forceOffParams = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=0"),
    });
    assert(
      forceOffParams === false,
      `searchParams v3=0 overrides true Firestore flag to false`
    );

    // Query override v3=false
    const forceOffFalse = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=false"),
    });
    assert(
      forceOffFalse === false,
      `searchParams v3=false overrides true Firestore flag to false`
    );

    // NextRequest with ?v3=0
    const nextReqOff = new NextRequest("http://localhost:3000/?v3=0");
    const forceOffNextReq = await isReworkV3Enabled(nextReqOff);
    assert(
      forceOffNextReq === false,
      `NextRequest with ?v3=0 overrides true Firestore flag to false`
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Cookie Overrides (smn_rework_v3=1 / smn_rework_v3=0)
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Cookie Overrides (smn_rework_v3=1 / smn_rework_v3=0) ---");
  {
    // When Firestore flag is false:
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, false);

    // Cookie Map override = 1
    const cookieMapOn = await isReworkV3Enabled({
      cookies: new Map([["smn_rework_v3", "1"]]),
    });
    assert(
      cookieMapOn === true,
      `Cookie Map smn_rework_v3=1 overrides false Firestore flag to true`
    );

    // Cookie getter object
    const cookieGetterOn = await isReworkV3Enabled({
      cookies: {
        get: (name: string) => (name === "smn_rework_v3" ? { value: "1" } : undefined),
      },
    });
    assert(
      cookieGetterOn === true,
      `Cookie getter { value: '1' } overrides false Firestore flag to true`
    );

    // NextRequest with cookie header
    const nextReqCookieOn = new NextRequest("http://localhost:3000/", {
      headers: { cookie: "smn_rework_v3=1; other=abc" },
    });
    const nextReqCookieOnResult = await isReworkV3Enabled(nextReqCookieOn);
    assert(
      nextReqCookieOnResult === true,
      `NextRequest with smn_rework_v3=1 cookie header overrides false Firestore flag to true`
    );

    // When Firestore flag is true:
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, true);

    const cookieMapOff = await isReworkV3Enabled({
      cookies: new Map([["smn_rework_v3", "0"]]),
    });
    assert(
      cookieMapOff === false,
      `Cookie Map smn_rework_v3=0 overrides true Firestore flag to false`
    );

    const nextReqCookieOff = new NextRequest("http://localhost:3000/", {
      headers: { cookie: "smn_rework_v3=0" },
    });
    const nextReqCookieOffResult = await isReworkV3Enabled(nextReqCookieOff);
    assert(
      nextReqCookieOffResult === false,
      `NextRequest with smn_rework_v3=0 cookie header overrides true Firestore flag to false`
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Override Precedence Hierarchy (Query > Cookie > Firestore)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing Override Precedence Hierarchy ---");
  {
    // Firestore is false
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, false);

    // Query=1, Cookie=0 -> Query wins (true)
    const queryWinsOn = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=1"),
      cookies: new Map([["smn_rework_v3", "0"]]),
    });
    assert(
      queryWinsOn === true,
      `Query ?v3=1 takes precedence over Cookie smn_rework_v3=0`
    );

    // Firestore is true
    await updateFeatureFlag(FEATURE_FLAG_KEYS.REWORK_V3_EXPERIENCE, true);

    // Query=0, Cookie=1 -> Query wins (false)
    const queryWinsOff = await isReworkV3Enabled({
      searchParams: new URLSearchParams("v3=0"),
      cookies: new Map([["smn_rework_v3", "1"]]),
    });
    assert(
      queryWinsOff === false,
      `Query ?v3=0 takes precedence over Cookie smn_rework_v3=1`
    );

    // Irrelevant query + Cookie=0 on true Firestore -> Cookie wins
    const cookieWinsOverFirestore = await isReworkV3Enabled({
      searchParams: new URLSearchParams("page=2"),
      cookies: new Map([["smn_rework_v3", "0"]]),
    });
    assert(
      cookieWinsOverFirestore === false,
      `Unrelated query allows Cookie smn_rework_v3=0 to override true Firestore flag`
    );
  }

  // ---------------------------------------------------------------------------
  // 6. Admin API Endpoint Security & Mutation (/api/admin/feature-flags)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing Admin API Endpoint (/api/admin/feature-flags) ---");
  {
    // 6A. Unauthorized GET
    const unauthGetReq = new NextRequest("http://localhost:3000/api/admin/feature-flags");
    const unauthGetRes = await adminGet(unauthGetReq);
    assert(
      unauthGetRes.status === 401,
      `Admin GET without auth rejected with 401 (Got: ${unauthGetRes.status})`
    );

    // 6B. Authorized GET
    const authGetReq = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      headers: { "x-admin-key": "sendmynotes2026" },
    });
    const authGetRes = await adminGet(authGetReq);
    assert(
      authGetRes.status === 200,
      `Admin GET with valid x-admin-key returns 200`
    );
    const authGetData = await authGetRes.json();
    assert(
      typeof authGetData.flags === "object" && "reworkV3Experience" in authGetData.flags,
      `Admin GET response body contains flags map with reworkV3Experience`
    );

    // 6C. Unauthorized POST
    const unauthPostReq = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "POST",
      body: JSON.stringify({ flagKey: "reworkV3Experience", enabled: true }),
    });
    const unauthPostRes = await adminPost(unauthPostReq);
    assert(
      unauthPostRes.status === 401,
      `Admin POST without auth rejected with 401`
    );

    // 6D. Authorized POST with invalid payload
    const invalidPostReq = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "POST",
      headers: {
        "x-admin-key": "sendmynotes2026",
        "content-type": "application/json",
      },
      body: JSON.stringify({ flagKey: "", enabled: "yes" }),
    });
    const invalidPostRes = await adminPost(invalidPostReq);
    assert(
      invalidPostRes.status === 400,
      `Admin POST with invalid payload returns 400`
    );

    // 6E. Authorized POST updating flag
    const validPostReq = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "POST",
      headers: {
        "x-admin-key": "sendmynotes2026",
        "content-type": "application/json",
      },
      body: JSON.stringify({ flagKey: "reworkV3Experience", enabled: false }),
    });
    const validPostRes = await adminPost(validPostReq);
    assert(
      validPostRes.status === 200,
      `Admin POST with valid payload returns 200`
    );
    const validPostData = await validPostRes.json();
    assert(
      validPostData.success === true && validPostData.flags?.reworkV3Experience === false,
      `Admin POST successfully toggles flag in response`
    );
  }

  // ---------------------------------------------------------------------------
  // 7. Public API Endpoint (/api/feature-flags)
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Testing Public Read-Only Endpoint (/api/feature-flags) ---");
  {
    const pubReq = new NextRequest("http://localhost:3000/api/feature-flags");
    const pubRes = await publicGet(pubReq);
    assert(
      pubRes.status === 200,
      `Public GET /api/feature-flags returns 200 without auth`
    );
    const pubData = await pubRes.json();
    assert(
      "flags" in pubData && "reworkV3Effective" in pubData,
      `Public response returns flags and reworkV3Effective`
    );

    // Public with ?v3=1
    const pubOverrideReq = new NextRequest("http://localhost:3000/api/feature-flags?v3=1");
    const pubOverrideRes = await publicGet(pubOverrideReq);
    const pubOverrideData = await pubOverrideRes.json();
    assert(
      pubOverrideData.reworkV3Effective === true,
      `Public GET with ?v3=1 reflects reworkV3Effective: true`
    );
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runFeatureFlagsTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
