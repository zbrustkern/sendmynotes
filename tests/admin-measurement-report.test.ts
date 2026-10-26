import assert from "node:assert/strict";
import { aggregateMeasurementReport, InvalidReportScope, normalizeReportScope } from "@/lib/admin-measurement-report";
import { SourceCoverage } from "@/lib/contracts/admin-measurement-report";
import { reconciliationApplyTargetError, reconciliationManifestHash, toReconciliationEntries, validateReconciliationManifest, ReconciliationManifest } from "@/lib/admin-measurement-reconciliation";

const complete = (cap = 2000): SourceCoverage => ({ status: "complete", count: 0, cap });

function testChicagoBoundaries() {
  const scope = normalizeReportScope(new URLSearchParams("period=custom&start=2026-03-08&end=2026-03-08"), new Date("2026-03-08T16:00:00Z"));
  assert.equal(scope.startUtc, "2026-03-08T06:00:00.000Z");
  assert.equal(scope.endUtc, "2026-03-09T05:00:00.000Z");
  const fall = normalizeReportScope(new URLSearchParams("period=custom&start=2026-11-01&end=2026-11-01"), new Date("2026-11-01T16:00:00Z"));
  assert.equal(fall.startUtc, "2026-11-01T05:00:00.000Z");
  assert.equal(fall.endUtc, "2026-11-02T06:00:00.000Z");
  assert.throws(() => normalizeReportScope(new URLSearchParams("period=custom&start=2026-02-30&end=2026-03-01")), InvalidReportScope);
  assert.throws(() => normalizeReportScope(new URLSearchParams("period=custom&start=2026-03-02&end=2026-03-01")), InvalidReportScope);
  assert.throws(() => normalizeReportScope(new URLSearchParams("period=wat")), InvalidReportScope);
}

function testPaymentClassificationAndTelemetrySeparation() {
  const scope = normalizeReportScope(new URLSearchParams("period=all&records=all"), new Date("2026-10-26T18:00:00Z"));
  const orders = [
    { id: "customer1", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_1", paymentMode: "stripe_live", paymentMethod: "STRIPE", campaignId: "launch", attribution: { source: "google", medium: "cpc", campaign: "launch", gclid: "raw-private-click" }, purchaseMeasurement: { version: 1, transactionId: "customer1", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
    { id: "customer1", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_1", paymentMode: "stripe_live", paymentMethod: "STRIPE", purchaseMeasurement: { version: 1, transactionId: "customer1", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
    { id: "customer2", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_4", paymentMode: "stripe_live", paymentMethod: "STRIPE", purchaseMeasurement: { version: 1, transactionId: "customer2", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
    { id: "admin-comp", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_2", paymentMode: "stripe_live", paymentMethod: "STRIPE", origin: "ADMIN_COMP", commercialKind: "admin_comp_balance", purchaseMeasurement: { version: 1, transactionId: "admin-comp", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
    { id: "founder-paid", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_3", paymentMode: "stripe_live", paymentMethod: "STRIPE", isFounderTest: true, purchaseMeasurement: { version: 1, transactionId: "founder-paid", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
    { id: "duplicate-pi", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_1", paymentMode: "stripe_live", paymentMethod: "STRIPE", purchaseMeasurement: { version: 1, transactionId: "duplicate-pi", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } },
  ];
  const event = { eventId: "event-1", sessionKey: "session-pseudonym", eventName: "step_navigated", source: "google", medium: "cpc", campaign: "launch", hasGoogleClick: true };
  const report = aggregateMeasurementReport({ asOf: new Date("2026-10-26T18:00:00Z"), scope, orders,
    orderCoverage: { status: "complete", count: 6, cap: 2000 }, telemetryCoverage: { status: "complete", count: 1, cap: 500 },
    reconciliationCoverage: complete(100), telemetry: [event, event] });
  assert.equal(report.totals.verifiedCustomerOrders, 1);
  assert.equal(report.totals.capturedCustomerRevenueCents, 900);
  assert.equal(report.totals.adminCompBalanceOrders, 1);
  assert.equal(report.totals.founderTestOrders, 1);
  assert.equal(report.exceptions.filter((e) => e.code === "payment_intent_collision").length, 2);
  assert.equal(report.activity.observedSessions, 1);
  assert.equal(report.activity.eventCounts?.step_navigated, 1);
  assert.equal(report.campaigns.find((x) => x.key === "google|cpc|launch")?.observedSessions, 1);
  assert.equal(JSON.stringify(report).includes("raw-private-click"), false);
  const customerView = aggregateMeasurementReport({ asOf: new Date("2026-10-26T18:00:00Z"), scope: { ...scope, records: "customers" }, orders,
    orderCoverage: { status: "complete", count: 6, cap: 2000 }, telemetryCoverage: { status: "complete", count: 1, cap: 500 }, reconciliationCoverage: complete(100), telemetry: [event, event] });
  assert.equal(customerView.totals.founderTestOrders, 1);
  assert.equal(customerView.totals.compOrders, 0);
  assert.equal(customerView.totals.adminCompBalanceOrders, 1);
  assert.equal(customerView.orderDiagnostics.some((row) => row.orderId === "founder-paid" || row.orderId === "admin-comp"), false);
}

function testIncompleteSourcesSuppressOnlyAffectedTotals() {
  const scope = normalizeReportScope(new URLSearchParams("period=all"), new Date("2026-10-26T18:00:00Z"));
  const report = aggregateMeasurementReport({ asOf: new Date("2026-10-26T18:00:00Z"), scope,
    orders: [{ id: "x", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi_x", paymentMethod: "STRIPE", purchaseMeasurement: { version: 1, transactionId: "x", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } }],
    orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: { status: "partial", count: 500, cap: 500, reason: "overflow" },
    reconciliationCoverage: complete(100), telemetry: [] });
  assert.equal(report.totals.verifiedCustomerOrders, 1);
  assert.equal(report.activity.observedSessions, 0);
  assert.equal(report.activity.sampled, true);
  const noRegistry = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [], orderCoverage: complete(), telemetryCoverage: complete(500),
    reconciliationCoverage: { status: "unavailable", count: null, cap: 100, reason: "privacy_unverified" } });
  assert.equal(noRegistry.totals.verifiedCustomerOrders, null);
  assert.equal(noRegistry.totals.founderTestOrders, null);
  assert.equal(noRegistry.totals.compOrders, null);
  assert.equal(noRegistry.totals.unresolvedOrders, null);
  assert.equal(noRegistry.reconciliation.status, "unavailable");
}

function testCampaignLabelsArePrivacySanitized() {
  const scope = normalizeReportScope(new URLSearchParams("period=all&records=all"), new Date());
  const order = { id: "comp-1", createdAt: "2026-10-20T12:00:00Z", isComp: true, source: "founder@example.test", campaignId: "+1 (312) 555-0199" };
  const report = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [order], orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100), telemetry: [
    { eventId: "e1", sessionKey: "s1", eventName: "step_navigated", source: "meta", medium: "social", campaign: "owner@example.test" },
  ] });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("founder@example.test"), false);
  assert.equal(serialized.includes("312) 555-0199"), false);
  assert.equal(serialized.includes("owner@example.test"), false);
  assert.ok(report.campaigns.some((row) => row.label === "[redacted]"));
}

function testRefundGrossAndUncertainty() {
  const scope = normalizeReportScope(new URLSearchParams("period=all&records=all"), new Date("2026-10-26T18:00:00Z"));
  const mk = (id: string, refundStatus: string, refundedAmountInCents?: number) => ({ id, createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: `pi_${id}`, paymentMethod: "STRIPE", refundStatus, refundedAmountInCents,
    purchaseMeasurement: { version: 1, transactionId: id, amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: false, reason: "known_refund", refundStatus } });
  const report = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [mk("full", "fully_refunded"), mk("partial", "partial", 200)],
    orderCoverage: { status: "complete", count: 2, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(report.totals.verifiedCustomerOrders, 2);
  assert.equal(report.totals.capturedCustomerRevenueCents, 1800);
  assert.equal(report.totals.refunds.knownOrderCount, 2);
  assert.equal(report.totals.refunds.knownRefundedCents, null); // one amount is unknown; never turn it into zero
  const exactRefund = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [mk("exact", "partial", 200)],
    orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(exactRefund.totals.refunds.knownRefundedCents, 200);
  const invalidRefunds = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [mk("negative", "partial", -1), mk("over-capture", "partial", 901)],
    orderCoverage: { status: "complete", count: 2, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(invalidRefunds.totals.refunds.knownOrderCount, 2);
  assert.equal(invalidRefunds.totals.refunds.knownRefundedCents, null);
  assert.equal(invalidRefunds.exceptions.filter((entry) => entry.code === "refund_amount_conflict").length, 2);
  const disputed = { ...mk("disputed", "unknown"), disputeStatus: "disputed" };
  const disputeReport = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [disputed], orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(disputeReport.totals.disputes.knownOrderCount, 1);
  assert.equal(disputeReport.totals.disputes.unknownOrderCount, 0);
}

function testUndatedCollisionOutsideScopeAndInvalidCapture() {
  const scope = normalizeReportScope(new URLSearchParams("period=custom&start=2026-10-20&end=2026-10-20"), new Date("2026-10-26T18:00:00Z"));
  const valid = { id: "in-range", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi-shared", paymentMethod: "STRIPE", purchaseMeasurement: { version: 1, transactionId: "in-range", amountInCents: 900, currency: "USD", verifiedAt: 1792962000000, eligible: true, reason: "eligible" } };
  const outsideFounder = { ...valid, id: "outside-founder", createdAt: "2026-10-19T12:00:00Z", isFounderTest: true };
  const invalid = { ...valid, id: "invalid", stripePaymentId: "pi-invalid", purchaseMeasurement: { ...valid.purchaseMeasurement, transactionId: "wrong-order" } };
  const undated = { ...valid, id: "undated", createdAt: undefined, stripePaymentId: "pi-undated" };
  const report = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [valid, outsideFounder, invalid, undated], orderCoverage: { status: "complete", count: 4, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(report.totals.verifiedCustomerOrders, 0); // collision anywhere in census invalidates the binding
  assert.equal(report.totals.undatedOrders, 1);
  assert.equal(report.orderDiagnostics.some((row) => row.orderId === "undated"), false);
  assert.ok(report.exceptions.some((x) => x.orderId === "in-range" && x.code === "payment_intent_collision"));
  assert.ok(report.orderDiagnostics.some((row) => row.orderId === "invalid" && row.classification === "unresolved"));
}

function testVerifiedAtAndSidecarEvidenceTime() {
  const scope = normalizeReportScope(new URLSearchParams("period=all&records=all"), new Date("2026-10-26T18:00:00Z"));
  const order = { id: "sidecar-only", createdAt: "2026-10-20T12:00:00Z", amountInCents: 900, stripePaymentId: "pi-sidecar", paymentMethod: "STRIPE" };
  const sidecar = { orderId: order.id, classification: "independent_customer" as const, paymentIntentId: order.stripePaymentId, amountInCents: 900, currency: "USD", liveMode: true, observedAt: "2026-10-26T18:00:00Z", revision: 1 };
  const report = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [order], orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100), reconciliations: [sidecar] });
  assert.equal(report.totals.verifiedCustomerOrders, 1);
  assert.equal(report.orderDiagnostics[0].paymentEvidenceSource, "reconciliation");
  assert.equal(report.orderDiagnostics[0].verifiedAt, null);
  assert.equal(report.orderDiagnostics[0].observedAt, "2026-10-26T18:00:00.000Z");

  const invalidSnapshot = { ...order, id: "missing-verified-at", stripePaymentId: "pi-invalid-time", purchaseMeasurement: { version: 1, transactionId: "missing-verified-at", amountInCents: 900, currency: "USD", eligible: true, reason: "eligible" } };
  const invalid = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [invalidSnapshot], orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100) });
  assert.equal(invalid.totals.verifiedCustomerOrders, 0);
  assert.equal(invalid.orderDiagnostics[0].classification, "unresolved");

  const conflicting = [
    { ...sidecar, classification: "founder_test" as const, revision: 1 },
    { ...sidecar, revision: 3, supersedes: 2 },
  ];
  const conflictReport = aggregateMeasurementReport({ asOf: new Date(), scope, orders: [order], orderCoverage: { status: "complete", count: 1, cap: 2000 }, telemetryCoverage: complete(500), reconciliationCoverage: complete(100), reconciliations: conflicting });
  assert.equal(conflictReport.totals.verifiedCustomerOrders, 0);
  assert.ok(conflictReport.exceptions.some((row) => row.code === "conflicting_evidence"));
}

function testReconciliationManifestSafety() {
  const manifest: ReconciliationManifest = { version: 1, environment: "production", projectId: "sendmynotes-2a417", reviewedAt: "2026-10-26T21:00:00Z", cutoff: { timestamp: "2026-10-26T13:48:55-05:00", timezone: "America/Chicago" },
    evidence: [{ orderId: "sale_1", paymentIntentId: "pi_1", amountInCents: 900, currency: "USD", liveMode: true, refundStatus: "none_observed", refundedAmountInCents: 0, disputeStatus: "none_observed", observedAt: "2026-10-26T21:33:00Z", sourceReference: "private-payment-observation-1" }],
    decisions: [{ orderId: "sale_1", classification: "independent_customer", sourceReference: "founder-confirmation-reference", actor: "operator", decidedAt: "2026-10-26T21:34:00Z", revision: 1 }] };
  assert.deepEqual(validateReconciliationManifest(manifest), []);
  assert.equal(reconciliationManifestHash(manifest), reconciliationManifestHash({ ...manifest }));
  assert.equal(toReconciliationEntries(manifest)[0].evidenceSourceReference, "private-payment-observation-1");
  assert.ok(validateReconciliationManifest({ ...manifest, decisions: [] }).includes("evidence_decision_set_mismatch"));
  assert.equal(reconciliationApplyTargetError(manifest, { projectId: "sendmynotes-2a417", connectedProject: "sendmynotes-2a417", isMock: false, syntheticFlag: false }), null);
  assert.equal(reconciliationApplyTargetError({ ...manifest, environment: "production", projectId: "sendmynotes-staging" }, { projectId: "sendmynotes-staging", connectedProject: "sendmynotes-staging", isMock: false, syntheticFlag: false }), "environment_project_mismatch");
  const staging = { ...manifest, environment: "staging" as const, projectId: "sendmynotes-staging", evidenceMode: "synthetic" as const, decisions: [{ ...manifest.decisions[0], classification: "founder_test" as const }] };
  assert.deepEqual(validateReconciliationManifest(staging), []);
  assert.equal(reconciliationApplyTargetError(staging, { projectId: staging.projectId, connectedProject: staging.projectId, isMock: true, syntheticFlag: true }), null);
  assert.equal(reconciliationApplyTargetError(staging, { projectId: staging.projectId, connectedProject: staging.projectId, isMock: false, syntheticFlag: true }), null);
  assert.equal(reconciliationApplyTargetError(staging, { projectId: staging.projectId, connectedProject: "sendmynotes-2a417", isMock: false, syntheticFlag: true }), "synthetic_staging_fixture_requires_exact_staging_target");
  assert.equal(reconciliationApplyTargetError({ ...staging, decisions: [{ ...staging.decisions[0], classification: "independent_customer" }] }, { projectId: staging.projectId, connectedProject: staging.projectId, isMock: true, syntheticFlag: true }), "synthetic_stage_customer_forbidden");
}

testChicagoBoundaries();
testPaymentClassificationAndTelemetrySeparation();
testIncompleteSourcesSuppressOnlyAffectedTotals();
testCampaignLabelsArePrivacySanitized();
testRefundGrossAndUncertainty();
testUndatedCollisionOutsideScopeAndInvalidCapture();
testVerifiedAtAndSidecarEvidenceTime();
testReconciliationManifestSafety();
process.stdout.write("admin measurement report tests passed\n");
