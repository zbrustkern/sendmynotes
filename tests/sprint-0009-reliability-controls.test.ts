import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { firestoreDb } from "../lib/firebase-admin";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { generateAdminSessionToken, ADMIN_COOKIE_NAME } from "../lib/admin-auth";
import { POST as updateControls } from "../app/api/admin/operational-controls/route";
import { GET as reliabilityGet } from "../app/api/admin/reliability/route";
import { POST as createIntent } from "../app/api/checkout/create-intent/route";
import { POST as generateCover } from "../app/api/generate-cover/route";
import { logIncident, setIncidentAlertSinkForTesting } from "../lib/incident-logger";
import { evaluateRetentionFixture, RELIABILITY_RETENTION_POLICY } from "../lib/reliability-policy";
import { GET as incidentsGet } from "../app/api/admin/incidents/route";

async function main() {
  await withSafeTestHarness(async () => {
    const config = firestoreDb.collection("system_config") as any;
    const audit = firestoreDb.collection("operational_control_audit") as any;
    const incident = firestoreDb.collection("system_incidents") as any;
    const outbox = firestoreDb.collection("transactional_outbox") as any;
    const incidentAudit = firestoreDb.collection("operational_incident_audit") as any;
    const incidentGroups = firestoreDb.collection("system_incident_groups") as any;
    const checks = firestoreDb.collection("reliability_checks") as any;
    const backups = [config, audit, incident, outbox, incidentAudit, incidentGroups, checks].map((c) => new Map(c.store));
    [config, audit, incident, outbox, incidentAudit, incidentGroups, checks].forEach((c) => c.store.clear());
    try {
      const token = generateAdminSessionToken("zbrustkern@gmail.com");
      const adminRequest = (body: unknown) => new NextRequest("http://localhost/api/admin/operational-controls", {
        method: "POST", headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE_NAME}=${token}` }, body: JSON.stringify(body),
      });
      const paused = await updateControls(adminRequest({ control: "checkout", paused: true, reason: "Synthetic maintenance drill" }));
      assert.equal(paused.status, 200, "authorized change applies");
      assert.equal(audit.store.size, 1, "change writes audit event");
      const auditEvent = [...audit.store.values()][0] as any;
      assert.equal(auditEvent.actor, "zbrustkern@gmail.com");
      assert.equal(auditEvent.reason, "Synthetic maintenance drill");
      const checkout = await createIntent(new NextRequest("http://localhost/api/checkout/create-intent", { method: "POST", body: "{}" }));
      assert.equal(checkout.status, 503, "checkout pause is enforced on active intent route");
      assert.match(checkout.headers.get("x-operation-id") || "", /^checkout_/);
      assert.equal((await checkout.json()).code, "CHECKOUT_PAUSED");

      await updateControls(adminRequest({ control: "generation", paused: true, reason: "Synthetic provider drill" }));
      const generation = await generateCover(new NextRequest("http://localhost/api/generate-cover", { method: "POST", headers: { "x-correlation-id": "drill-generation-01" }, body: "{}" }));
      assert.equal(generation.status, 503, "generation disable is enforced before provider call");
      assert.equal(generation.headers.get("x-operation-id"), "drill-generation-01", "request correlation token is propagated on response");

      const healthReq = new NextRequest("http://localhost/api/admin/reliability", { headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` } });
      const healthResponse = await reliabilityGet(healthReq);
      assert.equal(healthResponse.status, 200);
      const health = await healthResponse.json();
      assert.equal(health.health.status, "unknown", "missing positive check evidence stays unknown");
      assert.equal(health.consumers.status, "unknown", "empty queue does not imply healthy consumer");
      assert.equal(health.incidents.openCount, 0);
      assert.equal(health.retention.productionTtlActive, false);
      assert.equal(RELIABILITY_RETENTION_POLICY.accountingRecordsExcluded, true);
      const expirationFixture = evaluateRetentionFixture({ kind: "diagnostics", createdAt: 1000, nowMs: 1000 + 90 * 24 * 60 * 60 * 1000 });
      assert.equal(expirationFixture.expired, true, "disposable fixture expires at configured boundary");
      assert.equal(expirationFixture.productionTtlActive, false, "fixture evaluation does not activate deletion");
      await checks.doc("synthetic").set({ checkedAt: Date.now() - 6 * 60_000, succeededAt: Date.now() - 6 * 60_000, coverage: 1, errorRate: 0 });
      assert.equal((await (await reliabilityGet(healthReq)).json()).health.status, "unknown", "stale positive health evidence stays unknown");
      await checks.doc("synthetic").set({ checkedAt: Date.now() + 5_000, succeededAt: Date.now(), coverage: 1, errorRate: 0 });
      assert.equal((await (await reliabilityGet(healthReq)).json()).health.status, "unknown", "future-dated health evidence stays unknown");
      const checkedAt = Date.now();
      await checks.doc("synthetic").set({ checkedAt, succeededAt: checkedAt - 1000, coverage: 1, errorRate: 0, latencyMs: 12 });
      assert.equal((await (await reliabilityGet(healthReq)).json()).health.status, "healthy", "fresh complete positive fixture is recognized as healthy");

      const oldAt = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (let index = 0; index < 60; index++) {
        await incident.doc(`closed-${index}`).set({ id: `closed-${index}`, type: "SYSTEM", severity: "info", summary: "Closed synthetic history", createdAt: Date.now() - index, resolved: true });
      }
      await incident.doc("old-open-incident").set({ id: "old-open-incident", type: "SYSTEM", severity: "error", summary: "Old unresolved synthetic incident", createdAt: oldAt, resolved: false });
      const incidentHistory = await incidentsGet(new NextRequest("http://localhost/api/admin/incidents", { headers: { cookie: `${ADMIN_COOKIE_NAME}=${token}` } }));
      const incidentRows = (await incidentHistory.json()).incidents as Array<{ id: string }>;
      assert(incidentRows.some((row) => row.id === "old-open-incident"), "open incident survives beyond recent history limit");

      const notificationCalls: string[] = [];
      setIncidentAlertSinkForTesting({ deliver: async ({ incident, toEmail }) => { notificationCalls.push(`${incident.id}:${toEmail}`); return { success: true }; } });
      await config.doc("alerts").set({ alertEmail: "ops@example.test" });
      const firstId = await logIncident({ type: "WEBHOOK", summary: "Provider timeout for order order_abc12345", technicalDetails: "contact alice@example.com token sk_live_secret", metadata: { groupingKey: "stripe-capture-timeout", operationId: "op-a", customerEmail: "alice@example.com" } });
      const secondId = await logIncident({ type: "WEBHOOK", summary: "Provider timeout for order order_def67890", technicalDetails: "contact alice@example.com token sk_live_secret", metadata: { groupingKey: "stripe-capture-timeout", operationId: "op-b", address: "private address" } });
      const groupHash = (incident.store.get(firstId) as any).groupId;
      assert.equal(firstId, secondId, "same unresolved operation class is grouped");
      assert.equal([...incident.store.values()].filter((record: any) => record.groupId === groupHash).length, 1, "group keeps one actionable incident record");
      const grouped = incident.store.get(firstId) as any;
      assert.equal(grouped.occurrenceCount, 2);
      assert.deepEqual(grouped.correlatedOperationIds.sort(), ["op-a", "op-b"]);
      assert(!JSON.stringify(grouped).includes("alice@example.com"), "diagnostics redact customer email");
      assert(!JSON.stringify(grouped).includes("sk_live_secret"), "diagnostics redact provider credentials");
      assert.equal(grouped.alertDelivery, "verified", "isolated alert sink delivery is verified");
      assert.equal(notificationCalls.length, 1, "one alert is sent for a grouped open incident");
      await logIncident({ type: "WEBHOOK", summary: "Provider timeout retry", metadata: { groupingKey: "stripe-capture-timeout", operationId: "op-b" } });
      assert.equal((incident.store.get(firstId) as any).occurrenceCount, 2, "retrying the same logged operation does not double-count");
      assert.equal(notificationCalls.length, 1, "duplicate logging does not send a repeat alert");

      const incidentPost = async (status: string, reason: string) => {
        const request = new NextRequest("http://localhost/api/admin/incidents", { method: "POST", headers: { "content-type": "application/json", cookie: `${ADMIN_COOKIE_NAME}=${token}` }, body: JSON.stringify({ action: "update_incident", incidentId: firstId, status, reason, owner: "operator" }) });
        return await (await import("../app/api/admin/incidents/route")).POST(request);
      };
      assert.equal((await incidentPost("acknowledged", "Operator assigned")).status, 200);
      assert.equal((await incidentPost("investigating", "Checking retry evidence")).status, 200);
      assert.equal((await incidentPost("verified", "Should require resolved first")).status, 409);
      assert.equal((await incidentPost("resolved", "Provider confirmed event state")).status, 200);
      assert.equal((await incidentPost("verified", "Reconciliation confirmed")).status, 200);
      assert.equal(incidentAudit.store.size, 4, "each lifecycle transition is atomically audited");
      assert.equal((await incidentPost("investigating", "Should remain closed")).status, 409);

      const reopenedId = await logIncident({ type: "WEBHOOK", summary: "New provider timeout", metadata: { groupingKey: "stripe-capture-timeout", operationId: "op-c" } });
      const sameReopenedId = await logIncident({ type: "WEBHOOK", summary: "Another provider timeout", metadata: { groupingKey: "stripe-capture-timeout", operationId: "op-d" } });
      assert.notEqual(reopenedId, firstId, "a recurrence after resolution starts a new incident record");
      assert.equal(sameReopenedId, reopenedId, "subsequent failures attach to the new active group");
      assert.equal((incident.store.get(reopenedId) as any).occurrenceCount, 2, "new active group increments once per distinct operation");
      assert.equal([...incident.store.values()].filter((record: any) => record.groupId === groupHash).length, 2, "resolved history is retained with one new actionable record");
      assert.equal(notificationCalls.length, 2, "new incident cycle sends one new grouped alert");
    } finally {
      setIncidentAlertSinkForTesting(null);
      [config, audit, incident, outbox, incidentAudit, incidentGroups, checks].forEach((c, i) => { c.store.clear(); for (const [key, value] of backups[i]) c.store.set(key, value); });
    }
  });
  console.log("SPRINT-0009 reliability control tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
