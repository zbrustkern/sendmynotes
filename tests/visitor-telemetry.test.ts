import { describe, it } from "node:test";
import assert from "node:assert";
import { ingestTelemetryEvent, getAdminDashboardMetrics } from "../lib/metrics-rollup";
import { TelemetryEvent } from "../lib/types";

async function runTelemetryTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING VISITOR TELEMETRY & DROP-OFF TESTS");
  console.log("=================================================\n");

  const testSession1 = `test_sess_${Date.now()}_1`;
  const testSession2 = `test_sess_${Date.now()}_2`;

  // 1. Ingest session 1: Lands on site via Google CPC
  const event1: TelemetryEvent = {
    id: `evt_${Date.now()}_1`,
    sessionId: testSession1,
    eventName: "session_start",
    step: 1,
    path: "/send/birthday/milestone-30th",
    timestamp: Date.now(),
    createdAt: Date.now(),
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "Search-Brand-Handwritten",
    gclid: "test_gclid_12345",
    googleClientId: "GA1.1.987654321.1690000000",
    deviceType: "mobile",
    screenResolution: "390x844",
    ipCity: "Austin",
    ipRegion: "TX",
    ipCountry: "US",
  };
  await ingestTelemetryEvent(event1);

  // 2. Ingest session 1 selecting cover
  await ingestTelemetryEvent({
    ...event1,
    id: `evt_${Date.now()}_2`,
    eventName: "cover_preset_selected",
    step: 1,
  });

  // 3. Ingest session 1 entering note
  await ingestTelemetryEvent({
    ...event1,
    id: `evt_${Date.now()}_3`,
    eventName: "inside_note_edited",
    step: 2,
  });

  // 4. Ingest session 2: Organic direct visitor on desktop dropping out at cover
  const event2: TelemetryEvent = {
    id: `evt_${Date.now()}_4`,
    sessionId: testSession2,
    eventName: "session_start",
    step: 1,
    path: "/",
    timestamp: Date.now(),
    createdAt: Date.now(),
    utmSource: "direct",
    utmMedium: "none",
    googleClientId: "GA1.1.112233445.1690000000",
    deviceType: "desktop",
    screenResolution: "1920x1080",
    ipCity: "Chicago",
    ipRegion: "IL",
    ipCountry: "US",
  };
  await ingestTelemetryEvent(event2);

  // 5. Test metrics rollup
  const metrics = await getAdminDashboardMetrics();

  assert.ok(metrics.visitorTelemetry, "Visitor telemetry must be defined on AdminMetrics");
  const vt = metrics.visitorTelemetry;

  // Funnel leaks assertion
  assert.ok(vt.funnelLeaks.length === 6, "Must contain all 6 micro-funnel waterfall steps");
  const step1 = vt.funnelLeaks.find((s) => s.stepNumber === 1);
  assert.ok(step1, "Step 1 must exist");
  assert.ok(step1.visitors >= 2, "Step 1 must have at least 2 visitors");
  assert.strictEqual(step1.conversionFromPrior, 100, "Step 1 prior conversion is 100%");

  console.log("✅ PASS: Micro-funnel waterfall leak calculation verified");

  // Device breakdown assertion
  assert.ok(vt.deviceBreakdown.mobile >= 1, "Mobile count must be at least 1");
  assert.ok(vt.deviceBreakdown.desktop >= 1, "Desktop count must be at least 1");
  assert.ok(vt.deviceBreakdown.mobilePercent > 0, "Mobile percentage calculated");
  assert.ok(vt.deviceBreakdown.desktopPercent > 0, "Desktop percentage calculated");

  console.log("✅ PASS: Device category distribution (Mobile vs Desktop) verified");

  // Geo locations assertion
  const hasAustin = vt.topLocations.some((loc) => loc.city.includes("Austin"));
  assert.ok(hasAustin, "Austin must appear in top locations from edge header telemetry");

  console.log("✅ PASS: Edge header city/region geo telemetry verified");

  // Recent session stream & Google Analytics Client ID assertion
  const recordedSession1 = vt.recentSessions.find((s) => s.sessionId === testSession1);
  assert.ok(recordedSession1, "Test session 1 must be present in recent sessions");
  assert.strictEqual(recordedSession1.googleClientId, "GA1.1.987654321.1690000000", "Google Client ID matches cookie");
  assert.strictEqual(recordedSession1.gclid, "test_gclid_12345", "GCLID preserved for Google Ads match");
  assert.strictEqual(recordedSession1.campaign, "Search-Brand-Handwritten", "UTM Campaign preserved");
  assert.strictEqual(recordedSession1.highestStep, 2, "Highest step reached is Step 2 (Inside Note)");
  assert.strictEqual(recordedSession1.dropOffStep, "Inside Note", "Drop-off step recorded as Inside Note");

  console.log("✅ PASS: Real-time visitor session stream & Google Client ID tracking verified");

  // 6. Test Bot / Crawler Ingestion
  const botSession = `bot_sess_${Date.now()}`;
  const botEvent: TelemetryEvent = {
    id: `evt_bot_${Date.now()}`,
    sessionId: botSession,
    eventName: "session_start",
    step: 1,
    path: "/",
    timestamp: Date.now(),
    createdAt: Date.now(),
    utmSource: "direct",
    utmMedium: "none",
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    isBot: true,
    deviceType: "desktop",
  };
  await ingestTelemetryEvent(botEvent);

  const updatedMetrics = await getAdminDashboardMetrics();
  const updatedVt = updatedMetrics.visitorTelemetry;
  assert.ok(updatedVt, "Updated visitor telemetry must be defined");
  const recordedBotSession = updatedVt.recentSessions.find((s) => s.sessionId === botSession);

  assert.ok(recordedBotSession, "Bot session must be recorded");
  assert.strictEqual(recordedBotSession.isBot, true, "isBot flag preserved on session");
  assert.ok(updatedVt.botVisitors >= 1, "botVisitors count should be >= 1");
  assert.ok(typeof updatedVt.humanVisitors === "number", "humanVisitors count must be numeric");

  console.log("✅ PASS: Automated crawler & bot classification verified");

  console.log("\n=================================================");
  console.log("🎉 ALL VISITOR TELEMETRY & ATTRIBUTION TESTS PASSED");
  console.log("=================================================\n");
}

runTelemetryTests().catch((err) => {
  console.error("❌ Telemetry Test Failed:", err);
  process.exit(1);
});
