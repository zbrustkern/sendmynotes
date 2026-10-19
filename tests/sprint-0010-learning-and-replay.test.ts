import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { firestoreDb } from "../lib/firebase-admin";
import { withSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import { generateAdminSessionToken, ADMIN_COOKIE_NAME } from "../lib/admin-auth";
import { POST as decisionsPost, GET as decisionsGet } from "../app/api/admin/decisions/route";
import { assignStableJourneyVariant, stableBucket } from "../lib/experiment-assignment";
import { runAnalyticsReplay, REPLAY_CHECKPOINTS, REPLAY_PROJECTIONS, ReplaySourceEvent } from "../lib/analytics-replay";
import DecisionLogWorkspace from "../components/admin/DecisionLogWorkspace";

function req(path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), cookie: `${ADMIN_COOKIE_NAME}=${token}`, ...headers },
  });
}

async function main() {
  await withSafeTestHarness(async () => {
    const names = ["decision_log", "decision_log_audit", "telemetry_events_v2", REPLAY_CHECKPOINTS, REPLAY_PROJECTIONS, "payment_facts", "offer_redemptions", "transactional_outbox"];
    const collections = names.map((name) => firestoreDb.collection(name) as any);
    const backups = collections.map((collection) => new Map(collection.store));
    collections.forEach((collection) => collection.store.clear());
    try {
      const token = generateAdminSessionToken("operator@example.test");
      assert.equal((await decisionsGet(new NextRequest("http://localhost/api/admin/decisions"))).status, 401, "decision API requires admin auth");
      const decision = {
        hypothesis: "A clearer preview may reduce uncertainty.", observation: "The supplied historical dashboard is not a validated funnel.", cohort: "Personal senders on the new card preview; sample is not yet established.",
        alternatives: ["Founder and bot traffic may be present."], owner: "product", proposedChange: "Show a larger preview.", buildId: "test-build-1", primaryMetric: "actual checkout completions by eligible journey", guardrails: ["refunds", "provider failure"], reviewDate: "2026-11-01", experimentId: "preview-size-v1",
      };
      const createBody = { action: "create", decision };
      assert.equal((await decisionsPost(req("/api/admin/decisions", token, createBody, { "idempotency-key": "decision-test-0001" }))).status, 201);
      const repeated = await decisionsPost(req("/api/admin/decisions", token, createBody, { "idempotency-key": "decision-test-0001" }));
      assert.equal(repeated.status, 200, "same decision idempotency key returns prior record");
      assert.equal((firestoreDb.collection("decision_log") as any).store.size, 1);
      assert.equal((firestoreDb.collection("decision_log_audit") as any).store.size, 1, "create retry does not double audit");
      assert.equal((await decisionsPost(req("/api/admin/decisions", token, createBody, { "idempotency-key": "decision-test-0001" }))).status, 200);
      assert.equal((await decisionsPost(req("/api/admin/decisions", token, { action: "create", decision: { ...decision, hypothesis: "different payload" } }, { "idempotency-key": "decision-test-0001" }))).status, 400, "idempotency key cannot bind a different record");
      assert.equal((await decisionsPost(req("/api/admin/decisions", token, { action: "create", decision: { ...decision, owner: "call 555-123-4567" } }))).status, 400, "direct contact identifiers are rejected");
      const update = await decisionsPost(req("/api/admin/decisions", token, { action: "update_status", id: "decision_decision-test-0001", status: "ready_to_review", note: "Evidence reviewed for next check." }));
      assert.equal(update.status, 200);
      assert.equal((firestoreDb.collection("decision_log_audit") as any).store.size, 2, "status change appends audit event");

      await firestoreDb.collection("telemetry_events_v2").doc("exposure-a").set({ event_name: "experiment_exposed", event_id: "exposure-a", properties: { experimentId: "preview-size-v1", variantId: "control" }, received_at: Date.now() });
      await firestoreDb.collection("telemetry_events_v2").doc("exposure-b").set({ event_name: "experiment_exposed", event_id: "exposure-b", properties: { experimentId: "preview-size-v1", variantId: "large" }, received_at: Date.now() });
      const listing = await (await decisionsGet(req("/api/admin/decisions", token))).json();
      assert.equal(listing.exposureSummaries[0].renderedExposureCount, 2);
      assert.equal(listing.exposureSummaries[0].causalLift, null, "API does not manufacture causal lift");
      assert.equal(listing.exposureSummaries[0].liftStatus, "not_estimated");
      assert.equal(listing.decisions[0].status, "ready_to_review");
      const markup = renderToStaticMarkup(React.createElement(DecisionLogWorkspace));
      assert.match(markup, /Decision log/);
      assert.match(markup, /Supporting cohort/);
      assert.match(markup, /Save decision/);

      const cfg = { experimentId: "preview-size-v1", version: "v1", enabled: true, variants: [{ id: "control", weightBasisPoints: 5000 }, { id: "large", weightBasisPoints: 5000 }] };
      assert.equal(assignStableJourneyVariant({ ...cfg, journeyId: "journey-abc", nowMs: 1 }).eligible, true);
      const assignmentA = assignStableJourneyVariant({ ...cfg, journeyId: "journey-abc", nowMs: 1 });
      const assignmentB = assignStableJourneyVariant({ ...cfg, journeyId: "journey-abc", nowMs: 2 });
      assert.equal(assignmentA.eligible && assignmentB.eligible && assignmentA.assignment.variantId === assignmentB.assignment.variantId && assignmentA.assignment.assignmentId === assignmentB.assignment.assignmentId, true, "same journey/version keeps variant and assignment across calls");
      assert.deepEqual(assignStableJourneyVariant({ ...cfg, enabled: false, journeyId: "journey-abc" }), { eligible: false, reason: "disabled" });
      assert.equal(assignStableJourneyVariant({ ...cfg, journeyId: "journey-abc", variants: [{ id: "only", weightBasisPoints: 10000 }] }).eligible, false, "invalid config does not assign");
      assert.equal(stableBucket("journey-abc"), stableBucket("journey-abc"));

      const protectedCollections = ["payment_facts", "offer_redemptions", "transactional_outbox"].map((name) => firestoreDb.collection(name) as any);
      const seeded = [{ id: "keep-payment", value: "cash fact" }, { id: "keep-discount", value: "redemption" }, { id: "keep-queue", value: "queued" }];
      for (let index = 0; index < protectedCollections.length; index++) await protectedCollections[index].doc(seeded[index].id).set(seeded[index]);
      const source: ReplaySourceEvent[] = Array.from({ length: 7 }, (_, index) => ({ event_id: `evt-${index}`, event_name: index % 2 ? "step_viewed" : "experiment_exposed", occurred_at: 1000 + index, session_id: `session-${index % 3}`, journey_id: `journey-${index % 2}`, route_template: "/new", experience_version: "v1", ...(index % 2 ? {} : { properties: { experimentId: "preview-size-v1", variantId: index < 4 ? "control" : "large" } }) }));
      const replayArgs = { runId: "drill-run-01", windowStart: 900, windowEnd: 2000, schemaVersion: "v1", chunkSize: 2, sourceEvents: source, baselineCounts: { step_viewed: 4 } };
      const paused = await runAnalyticsReplay({ ...replayArgs, maxChunks: 1 });
      assert.equal(paused.status, "paused"); assert.equal(paused.processed, 2);
      const complete = await runAnalyticsReplay(replayArgs);
      assert.equal(complete.status, "complete"); assert.equal(complete.processed, 7); assert.deepEqual(complete.countsByEvent, { experiment_exposed: 4, step_viewed: 3 });
      assert.deepEqual(complete.shadowDiff.find((row) => row.eventName === "step_viewed"), { eventName: "step_viewed", replayCount: 3, baselineCount: 4, delta: -1 }, "shadow discrepancies are reported, not adjusted away");
      const replayRetry = await runAnalyticsReplay(replayArgs);
      assert.deepEqual(replayRetry, complete, "completed replay retry is stable and idempotent");
      assert.equal((firestoreDb.collection(REPLAY_PROJECTIONS) as any).store.size, 7, "deterministic projection keys prevent duplicate facts");
      assert.equal((firestoreDb.collection(REPLAY_CHECKPOINTS) as any).store.size, 1);
      const concurrentArgs = { ...replayArgs, runId: "parallel-drill" };
      const parallel = await Promise.all([runAnalyticsReplay(concurrentArgs), runAnalyticsReplay(concurrentArgs)]);
      assert.deepEqual(parallel[0], parallel[1], "parallel retries converge on one deterministic checkpoint");
      assert.equal((firestoreDb.collection(REPLAY_PROJECTIONS) as any).store.size, 14, "parallel retries create one projection per event per replay run");
      await assert.rejects(() => runAnalyticsReplay({ ...replayArgs, sourceEvents: [...source, { ...source[0], occurred_at: 1001 }] }), /Conflicting duplicate/);
      for (let index = 0; index < protectedCollections.length; index++) assert.deepEqual([...protectedCollections[index].store.values()], [seeded[index]], "rehearsal never touches payment, redemption, or queue collections");
      assert.deepEqual(getBlockedExternalCalls(), [], "decision, assignment, and replay fixtures made no external calls");
    } finally {
      collections.forEach((collection, index) => { collection.store.clear(); for (const [key, value] of backups[index]) collection.store.set(key, value); });
    }
  });
  console.log("SPRINT-0010 learning and replay fixture tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
