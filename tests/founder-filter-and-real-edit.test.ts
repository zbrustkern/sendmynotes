import assert from "node:assert";
import { ingestTelemetryEvent, getAdminDashboardMetrics } from "../lib/metrics-rollup";
import { TelemetryEvent } from "../lib/types";
import { setSystemConfig } from "../lib/firebase-admin";

async function runFounderFilterAndRealEditTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING FOUNDER FILTER & REAL-EDIT TELEMETRY TESTS");
  console.log("=================================================\n");

  const ts = Date.now();
  const mobilePaidSession = `test_mob_paid_${ts}`;
  const desktopPaidSession = `test_desk_paid_${ts}`;
  const founderDesktopSession = `test_founder_desk_${ts}`;

  // 1. Mobile visitor via Google CPC (390x844 viewport)
  const mobileEvent: TelemetryEvent = {
    id: `evt_mob_${ts}`,
    sessionId: mobilePaidSession,
    eventName: "step_1_landed",
    step: 1,
    path: "/send/thank-you?auto_select=1",
    timestamp: ts,
    createdAt: ts,
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "Search-ThankYou",
    gclid: "test_gclid_mobile_999",
    deviceType: "mobile",
    screenResolution: "390x844",
    // Even if previous broken IP proxying had marked isFounder: true
    isFounder: false,
    is_founder: false,
  };
  await ingestTelemetryEvent(mobileEvent);
  await ingestTelemetryEvent({
    ...mobileEvent,
    id: `evt_mob_cover_${ts}`,
    eventName: "step_2_cover_ready",
    step: 1,
  });

  // 2. Desktop paid visitor via Meta (1440x900 viewport)
  const metaEvent: TelemetryEvent = {
    id: `evt_meta_${ts}`,
    sessionId: desktopPaidSession,
    eventName: "step_1_landed",
    step: 1,
    path: "/send/birthday?auto_select=1",
    timestamp: ts + 100,
    createdAt: ts + 100,
    utmSource: "meta",
    utmMedium: "paid_social",
    utmCampaign: "Meta-Birthday-Card",
    fbclid: "test_fbclid_meta_888",
    deviceType: "desktop",
    screenResolution: "1440x900",
    isFounder: false,
    is_founder: false,
  };
  await ingestTelemetryEvent(metaEvent);
  await ingestTelemetryEvent({
    ...metaEvent,
    id: `evt_meta_cover_${ts}`,
    eventName: "step_2_cover_ready",
    step: 1,
  });

  // 3. Founder Desktop Test Session (3440x1440 ultra-wide display, direct traffic, marked founder)
  const founderEvent: TelemetryEvent = {
    id: `evt_founder_${ts}`,
    sessionId: founderDesktopSession,
    eventName: "step_1_landed",
    step: 1,
    path: "/",
    timestamp: ts + 200,
    createdAt: ts + 200,
    utmSource: "direct",
    utmMedium: "none",
    deviceType: "desktop",
    screenResolution: "3440x1440",
    isFounder: true,
    is_founder: true,
  };
  await ingestTelemetryEvent(founderEvent);
  await ingestTelemetryEvent({
    ...founderEvent,
    id: `evt_founder_cover_${ts}`,
    eventName: "step_2_cover_ready",
    step: 1,
  });

  // Test 1: With Exclude Founder ON (default)
  console.log("--- 1. Testing Founder Exclusion with Exclude Founder = TRUE ---");
  const metricsExcluded = await getAdminDashboardMetrics({
    dateRange: "all",
    excludeFounder: true,
    channel: "all",
  });
  const vtExcluded = metricsExcluded.visitorTelemetry!;

  const foundMobile = vtExcluded.recentSessions.find((s) => s.sessionId === mobilePaidSession);
  const foundMeta = vtExcluded.recentSessions.find((s) => s.sessionId === desktopPaidSession);
  const foundFounder = vtExcluded.recentSessions.find((s) => s.sessionId === founderDesktopSession);

  assert.ok(foundMobile, "Mobile Google CPC session MUST be present when founder filter is ON");
  assert.strictEqual(foundMobile.deviceType, "mobile", "Mobile device type preserved");
  assert.strictEqual(foundMobile.gclid, "test_gclid_mobile_999", "GCLID preserved");

  assert.ok(foundMeta, "Desktop Meta paid session MUST be present when founder filter is ON");
  assert.strictEqual(foundMeta.fbclid, "test_fbclid_meta_888", "FBCLID preserved");

  assert.ok(!foundFounder, "Founder 3440x1440 desktop test session MUST BE EXCLUDED when founder filter is ON");
  assert.ok(vtExcluded.deviceBreakdown.mobile > 0, "Mobile visitors count is greater than 0%");

  console.log("✅ PASS: Real Mobile and Paid sessions remain 100% visible while Founder 3440x1440 is excluded");

  // Test 2: With Exclude Founder OFF
  console.log("\n--- 2. Testing Founder Inclusion with Exclude Founder = FALSE ---");
  const metricsIncluded = await getAdminDashboardMetrics({
    dateRange: "all",
    excludeFounder: false,
    channel: "all",
  });
  const vtIncluded = metricsIncluded.visitorTelemetry!;
  const foundFounderWhenOff = vtIncluded.recentSessions.find((s) => s.sessionId === founderDesktopSession);
  assert.ok(foundFounderWhenOff, "Founder session is visible when excludeFounder is toggled OFF");
  console.log("✅ PASS: Founder test session correctly appears when excludeFounder is toggled OFF");

  // Test 3: Step 3 Note Typed vs Default Template Loaded (Problem 2)
  console.log("\n--- 3. Testing Passive Template Load vs Active User Note Edit ---");
  const passiveSessionId = `test_passive_${ts}`;
  const activeSessionId = `test_active_${ts}`;

  // Passive Session: Lands with auto_select=1, pre-filled default template (365 chars) loads
  // Emits default_template_loaded, NEVER emits step_3_note_typed
  await ingestTelemetryEvent({
    id: `evt_pas_1_${ts}`,
    sessionId: passiveSessionId,
    eventName: "step_1_landed",
    step: 1,
    path: "/send/thank-you?auto_select=1",
    timestamp: ts + 300,
    createdAt: ts + 300,
    deviceType: "mobile",
    screenResolution: "390x844",
  });
  await ingestTelemetryEvent({
    id: `evt_pas_2_${ts}`,
    sessionId: passiveSessionId,
    eventName: "step_2_cover_ready",
    step: 1,
    path: "/send/thank-you?auto_select=1",
    timestamp: ts + 305,
    createdAt: ts + 305,
    deviceType: "mobile",
    screenResolution: "390x844",
  });
  await ingestTelemetryEvent({
    id: `evt_pas_tpl_${ts}`,
    sessionId: passiveSessionId,
    eventName: "default_template_loaded",
    step: 2,
    path: "/send/thank-you?auto_select=1",
    metadata: {
      charCount: 365,
      noteEdited: false,
    },
    timestamp: ts + 310,
    createdAt: ts + 310,
    deviceType: "mobile",
    screenResolution: "390x844",
  });

  // Active Session: Lands with auto_select=1, then actively edits note
  await ingestTelemetryEvent({
    id: `evt_act_1_${ts}`,
    sessionId: activeSessionId,
    eventName: "step_1_landed",
    step: 1,
    path: "/send/thank-you?auto_select=1",
    timestamp: ts + 400,
    createdAt: ts + 400,
    deviceType: "mobile",
    screenResolution: "390x844",
  });
  await ingestTelemetryEvent({
    id: `evt_act_2_${ts}`,
    sessionId: activeSessionId,
    eventName: "step_2_cover_ready",
    step: 1,
    path: "/send/thank-you?auto_select=1",
    timestamp: ts + 405,
    createdAt: ts + 405,
    deviceType: "mobile",
    screenResolution: "390x844",
  });
  await ingestTelemetryEvent({
    id: `evt_act_step3_${ts}`,
    sessionId: activeSessionId,
    eventName: "step_3_note_typed",
    step: 2,
    path: "/send/thank-you?auto_select=1",
    metadata: {
      charCount: 380,
      noteEdited: true,
      isDirty: true,
      inputField: "body",
    },
    timestamp: ts + 420,
    createdAt: ts + 420,
    deviceType: "mobile",
    screenResolution: "390x844",
  });

  const metricsStep3 = await getAdminDashboardMetrics({
    dateRange: "all",
    excludeFounder: true,
    channel: "all",
  });
  const vtStep3 = metricsStep3.visitorTelemetry!;

  const recPassive = vtStep3.recentSessions.find((s) => s.sessionId === passiveSessionId);
  const recActive = vtStep3.recentSessions.find((s) => s.sessionId === activeSessionId);

  assert.ok(recPassive, "Passive session found in recent sessions");
  assert.strictEqual(recPassive.noteLength, 365, "Passive session preserves template noteLength (365 chars)");
  assert.strictEqual(recPassive.noteEdited, false, "Passive session is marked noteEdited: false (Default Unedited)");

  assert.ok(recActive, "Active session found in recent sessions");
  assert.strictEqual(recActive.noteLength, 380, "Active session reflects edited noteLength (380 chars)");
  assert.strictEqual(recActive.noteEdited, true, "Active session is marked noteEdited: true (Edited)");

  console.log("✅ PASS: Differentiated between default template load (noteEdited: false) and active user edit (noteEdited: true)");

  console.log("\n=================================================");
  console.log("🎉 ALL FOUNDER FILTER & REAL-EDIT TESTS PASSED");
  console.log("=================================================\n");
}

runFounderFilterAndRealEditTests().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
