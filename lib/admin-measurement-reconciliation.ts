import { createHash } from "node:crypto";
import { ReportReconciliationEntry } from "@/lib/contracts/admin-measurement-report";

export const REPORT_PRIVATE_COLLECTION_PATH = "system_config/admin_measurement_reconciliation/entries";

export interface ReconciliationManifest {
  version: 1;
  environment: "production" | "staging" | "synthetic";
  projectId: string;
  evidenceMode?: "live" | "synthetic";
  reviewedAt: string;
  cutoff: { timestamp: string; timezone: string };
  evidence: Array<{ orderId: string; paymentIntentId?: string; amountInCents?: number; currency?: string; liveMode?: boolean; refundStatus: string; refundedAmountInCents?: number; disputeStatus?: string; observedAt?: string; sourceReference: string }>;
  decisions: Array<{ orderId: string; classification: ReportReconciliationEntry["classification"]; sourceReference: string; actor: string; decidedAt: string; revision: number; supersedes?: number }>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function reconciliationManifestHash(manifest: ReconciliationManifest): string {
  return createHash("sha256").update(canonical(manifest)).digest("hex");
}

export function reconciliationApplyTargetError(manifest: ReconciliationManifest, target: { projectId?: string; connectedProject?: string; isMock: boolean; syntheticFlag: boolean }): string | null {
  if (target.projectId !== manifest.projectId) return "explicit_project_mismatch";
  if (manifest.environment === "production") {
    if (manifest.projectId !== "sendmynotes-2a417" || manifest.evidenceMode === "synthetic") return "environment_project_mismatch";
    if (target.isMock) return "live_apply_on_mock_store";
    if (target.connectedProject !== manifest.projectId) return "connected_project_mismatch";
    return null;
  }
  if (manifest.environment === "staging") {
    if (manifest.projectId !== "sendmynotes-staging" || manifest.evidenceMode !== "synthetic") return "environment_project_mismatch";
    if (!target.syntheticFlag || target.connectedProject !== manifest.projectId) return "synthetic_staging_fixture_requires_exact_staging_target";
    if (manifest.decisions.some((decision) => decision.classification === "independent_customer")) return "synthetic_stage_customer_forbidden";
    return null;
  }
  if (manifest.environment === "synthetic" && manifest.projectId === "synthetic" && target.syntheticFlag && target.isMock) return null;
  return "synthetic_apply_requires_isolated_mock";
}

export function validateReconciliationManifest(manifest: ReconciliationManifest): string[] {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.evidence) || !Array.isArray(manifest.decisions)) return ["invalid_manifest_shape"];
  if (manifest.version !== 1 || !["production", "staging", "synthetic"].includes(manifest.environment)) errors.push("invalid_manifest_header");
  if (manifest.evidenceMode !== undefined && !["live", "synthetic"].includes(manifest.evidenceMode)) errors.push("invalid_evidence_mode");
  if ((manifest.environment === "production" && (manifest.projectId !== "sendmynotes-2a417" || manifest.evidenceMode === "synthetic")) || (manifest.environment === "staging" && manifest.projectId !== "sendmynotes-staging") || (manifest.environment === "synthetic" && manifest.projectId !== "synthetic")) errors.push("environment_project_mismatch");
  if (manifest.environment === "staging" && manifest.evidenceMode !== "synthetic") errors.push("staging_manifest_must_be_synthetic");
  if (manifest.environment === "synthetic" && manifest.evidenceMode !== "synthetic") errors.push("synthetic_manifest_marker_required");
  if (!manifest.projectId || !manifest.reviewedAt || !manifest.cutoff?.timestamp || manifest.cutoff.timezone !== "America/Chicago") errors.push("missing_review_scope");
  if (!Number.isFinite(Date.parse(manifest.reviewedAt)) || !Number.isFinite(Date.parse(manifest.cutoff.timestamp))) errors.push("invalid_review_timestamp");
  const evidenceIds = manifest.evidence.map((x) => x.orderId);
  const decisionIds = manifest.decisions.map((x) => x.orderId);
  if (new Set(evidenceIds).size !== evidenceIds.length || new Set(decisionIds).size !== decisionIds.length) errors.push("duplicate_order_id");
  if (evidenceIds.length !== decisionIds.length || evidenceIds.some((id) => !decisionIds.includes(id))) errors.push("evidence_decision_set_mismatch");
  for (const item of manifest.evidence) {
    if (!item.orderId || !item.sourceReference || !item.refundStatus) errors.push("incomplete_evidence");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(item.orderId)) errors.push("invalid_order_id");
    if (item.amountInCents !== undefined && (!Number.isInteger(item.amountInCents) || item.amountInCents <= 0)) errors.push("invalid_amount");
    if (item.refundedAmountInCents !== undefined && (!Number.isInteger(item.refundedAmountInCents) || item.refundedAmountInCents < 0)) errors.push("invalid_refund_amount");
    if (!item.disputeStatus || !["none_observed", "disputed", "unknown"].includes(item.disputeStatus)) errors.push("invalid_dispute_status");
    if (item.currency !== undefined && item.currency !== "USD") errors.push("non_usd_evidence");
    if (item.observedAt && !Number.isFinite(Date.parse(item.observedAt))) errors.push("invalid_observation_timestamp");
  }
  for (const item of manifest.decisions) {
    if (!item.orderId || !item.sourceReference || !item.actor || !Number.isInteger(item.revision) || item.revision < 1) errors.push("incomplete_decision");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(item.orderId)) errors.push("invalid_order_id");
    if (!Number.isFinite(Date.parse(item.decidedAt))) errors.push("invalid_decision_timestamp");
    if (!["independent_customer", "founder_test", "comp", "admin_origin", "unresolved"].includes(item.classification)) errors.push("invalid_classification");
    if (item.supersedes !== undefined && (!Number.isInteger(item.supersedes) || item.supersedes < 1)) errors.push("invalid_supersedes");
    if (item.classification === "independent_customer") {
      if (manifest.environment === "staging" && manifest.evidenceMode === "synthetic") errors.push("synthetic_stage_customer_forbidden");
      const evidence = manifest.evidence.find((x) => x.orderId === item.orderId);
      if (!evidence?.paymentIntentId || evidence.amountInCents === undefined || evidence.currency !== "USD" || evidence.liveMode !== true) errors.push("customer_decision_missing_capture_evidence");
    }
  }
  return [...new Set(errors)];
}

export function toReconciliationEntries(manifest: ReconciliationManifest): ReportReconciliationEntry[] {
  const evidence = new Map(manifest.evidence.map((x) => [x.orderId, x]));
  return manifest.decisions.map((decision) => {
    const observed = evidence.get(decision.orderId)!;
    return { orderId: decision.orderId, classification: decision.classification,
      paymentIntentId: observed.paymentIntentId, amountInCents: observed.amountInCents,
      currency: observed.currency, liveMode: observed.liveMode, refundStatus: observed.refundStatus as ReportReconciliationEntry["refundStatus"],
      refundedAmountInCents: observed.refundedAmountInCents,
      disputeStatus: observed.disputeStatus as ReportReconciliationEntry["disputeStatus"],
      sourceReference: decision.sourceReference,
      evidenceSourceReference: observed.sourceReference,
      actor: decision.actor,
      decidedAt: decision.decidedAt,
      manifestReviewedAt: manifest.reviewedAt,
      observedAt: observed.observedAt, revision: decision.revision, supersedes: decision.supersedes };
  });
}
