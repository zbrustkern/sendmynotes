import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getCustomCoverAssignment } from "../lib/custom-cover-experiment";
import { POST as postTelemetry } from "../app/api/telemetry/route";
import { firestoreDb } from "../lib/firebase-admin";
import { ALLOWED_BROWSER_EVENT_NAMES, sanitizeMetadata } from "../lib/telemetry-schema";

async function postV2(eventName: string, eventId: string, properties: Record<string, unknown>, sessionId: string) {
  const response = await postTelemetry(new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      schema_version: "v2.0",
      event_id: eventId,
      event_name: eventName,
      session_id: sessionId,
      route_template: "/preview/entry",
      consent_state: "not_required",
      properties,
    }),
  }));
  assert.equal(response.status, 200, `${eventName} is accepted by the V2 collector`);
  const result = await response.json();
  assert.equal(result.accepted, true);
  return firestoreDb.collection("telemetry_events_v2").doc(`ev_${eventId}`);
}

async function main() {
  const a = getCustomCoverAssignment("sess_custom_cover_a");
  const repeated = getCustomCoverAssignment("sess_custom_cover_a");
  const b = getCustomCoverAssignment("sess_custom_cover_b");
  assert.equal(a.eligible, true);
  assert.deepEqual(a, repeated, "assignment is stable for the same session");
  assert.equal(b.eligible, true);
  assert.equal(getCustomCoverAssignment(" ").eligible, false);

  let control = 0;
  let treatment = 0;
  for (let i = 0; i < 10_000; i++) {
    const result = getCustomCoverAssignment(`distribution-session-${i}`);
    assert.equal(result.eligible, true);
    if (result.eligible && result.assignment.variant === "control") control++;
    if (result.eligible && result.assignment.variant === "treatment") treatment++;
  }
  assert.equal(control + treatment, 10_000);
  assert.ok(Math.abs(control - treatment) < 250, `50/50 deterministic allocation is balanced (${control}/${treatment})`);

  const shared = {
    experimentId: "custom-cover-picker",
    experimentVersion: "v1",
    variantId: "treatment",
  };
  const events = [
    ["custom_cover_assigned", "evt_custom_assign_1", shared],
    ["custom_cover_tile_impression", "evt_custom_impres_1", shared],
    ["custom_cover_drawer_opened", "evt_custom_open_1", { ...shared, entrySource: "grid_tile" }],
    ["custom_cover_generation_requested", "evt_custom_req_001", { ...shared, entrySource: "grid_tile" }],
    ["custom_cover_generation_completed", "evt_custom_done_001", { ...shared, entrySource: "grid_tile" }],
    ["custom_cover_generation_failed", "evt_custom_fail_001", { ...shared, entrySource: "top_shortcut" }],
    ["custom_cover_accepted", "evt_custom_accept_1", { ...shared, entrySource: "grid_tile" }],
  ] as const;
  const sessionId = "sess_custom_cover_collector";
  for (const [eventName, eventId, properties] of events) {
    assert.equal(ALLOWED_BROWSER_EVENT_NAMES.has(eventName), true, `${eventName} is on the browser event allowlist`);
    const doc = await postV2(eventName, eventId, {
      ...properties,
      prompt: "private idea should never be stored",
      imageUrl: "https://example.invalid/private-art.png",
      recipientAddress: "1 Private Lane",
    }, sessionId);
    const snapshot = await doc.get();
    assert.equal(snapshot.exists, true, `${eventName} persists in the V2 collection`);
    const saved = snapshot.data() as any;
    assert.equal(saved.session_id, sessionId, "session_id remains the outcome join key");
    assert.equal(saved.properties.experimentId, "custom-cover-picker");
    assert.equal(saved.properties.experimentVersion, "v1");
    assert.equal("prompt" in saved.properties, false);
    assert.equal("imageUrl" in saved.properties, false);
    assert.equal("recipientAddress" in saved.properties, false);
  }

  const accepted = await firestoreDb.collection("telemetry_events_v2").doc("ev_evt_custom_accept_1").get();
  assert.equal((accepted.data() as any).properties.entrySource, "grid_tile");
  assert.deepEqual(
    sanitizeMetadata("custom_cover_generation_failed", { entrySource: "grid_tile", variantId: "private note", prompt: "private" }).sanitized,
    { entrySource: "grid_tile" },
    "event-specific allowlist retains bounded categories only",
  );

  console.log("custom cover experiment and V2 collector contract checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
