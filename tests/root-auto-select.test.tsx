import React from "react";
import assert from "node:assert";
import Home from "../app/page";
import { CARD_PRESETS } from "../lib/card-presets";
import { ExperienceRouter } from "../components/ExperienceRouter";

console.log("=================================================");
console.log("🧪 RUNNING ROOT ROUTE AUTO-SELECT REDIRECT / MOUNT TESTS");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function verify(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  // --- 1. Test Server-side Redirect on ?auto_select=1 ---
  console.log("--- 1. Testing Server-side Redirect on ?auto_select=1 ---");
  try {
    await Home({ searchParams: Promise.resolve({ auto_select: "1" }) });
    verify(false, "Expected Home to redirect on auto_select=1, but it did not throw NEXT_REDIRECT");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string; message?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") && digest.includes("/send?auto_select=1"),
      `Redirects to /send?auto_select=1 on ?auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 2. Test Server-side Redirect on utm_source=google ---
  console.log("\n--- 2. Testing Server-side Redirect on utm_source=google ---");
  try {
    await Home({ searchParams: Promise.resolve({ utm_source: "google" }) });
    verify(false, "Expected Home to redirect on utm_source=google, but it did not throw NEXT_REDIRECT");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") &&
        digest.includes("/send?") &&
        digest.includes("utm_source=google") &&
        digest.includes("auto_select=1"),
      `Redirects to /send with utm_source=google & auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 3. Test Server-side Redirect on utm_source=meta ---
  console.log("\n--- 3. Testing Server-side Redirect on utm_source=meta ---");
  try {
    await Home({ searchParams: Promise.resolve({ utm_source: "meta" }) });
    verify(false, "Expected Home to redirect on utm_source=meta, but it did not throw NEXT_REDIRECT");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") &&
        digest.includes("/send?") &&
        digest.includes("utm_source=meta") &&
        digest.includes("auto_select=1"),
      `Redirects to /send with utm_source=meta & auto_select=1 (got digest: '${digest}')`
    );
  }

  // --- 4. Test Preserving Full Campaign Tracking & Ad Click Parameters ---
  console.log("\n--- 4. Testing Preservation of Campaign Query Parameters ---");
  try {
    await Home({
      searchParams: Promise.resolve({
        auto_select: "1",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "no_address_send_now",
        gclid: "test_gclid_abc123",
      }),
    });
    verify(false, "Expected Home to redirect with preserved params");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.includes("utm_medium=cpc") &&
        digest.includes("utm_campaign=no_address_send_now") &&
        digest.includes("gclid=test_gclid_abc123"),
      `Preserves all ad tracking parameters in redirect target (got digest: '${digest}')`
    );
  }

  // --- 5. Test Array auto_select Parameter Handling ---
  console.log("\n--- 5. Testing Array Param Handling (?auto_select=['1']) ---");
  try {
    await Home({ searchParams: Promise.resolve({ auto_select: ["1"] }) });
    verify(false, "Expected Home to redirect on array auto_select");
  } catch (err: unknown) {
    const redirectErr = err as { digest?: string };
    const digest = redirectErr?.digest || "";
    verify(
      digest.startsWith("NEXT_REDIRECT") && digest.includes("/send?auto_select=1"),
      `Handles array query parameter auto_select=['1'] gracefully (got digest: '${digest}')`
    );
  }

  // --- 6. Test Organic Plain Homepage Does NOT Redirect ---
  console.log("\n--- 6. Testing Organic Homepage Pass-through ---");
  try {
    const result = await Home({ searchParams: Promise.resolve({}) });
    verify(!!result, "Organic homepage request resolves without redirect");
    verify(
      React.isValidElement(result),
      "Organic homepage returns valid React Suspense element"
    );
  } catch (err) {
    verify(false, `Organic homepage threw unexpected redirect: ${err}`);
  }

  // --- 7. Test Thinking of You Preset Defaults for Auto-Select Studio ---
  console.log("\n--- 7. Testing Default Thinking of You Note Studio Presets ---");
  const defaultPreset = CARD_PRESETS[0];
  verify(defaultPreset.id === "preset-thinking-coffee", "Default preset is 'preset-thinking-coffee'");
  verify(defaultPreset.occasion === "Thinking of You", "Default preset occasion is 'Thinking of You'");
  verify(defaultPreset.title === "A Quiet Cup", "Default preset title is 'A Quiet Cup'");
  verify(defaultPreset.imageUrl === "/presets/thinking-of-you-quiet-cup.jpg", "Default preset imageUrl matches quiet cup");
  verify(
    defaultPreset.defaultHandwrittenNote.includes("sunshine") && !defaultPreset.defaultHandwrittenNote.includes("["),
    "Default note is bracket-free everyday warm sunshine message"
  );

  console.log("\n=================================================");
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
