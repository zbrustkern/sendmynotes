import crypto from "crypto";
import { firestoreDb } from "./firebase-admin";

export const DECISION_LOG_COLLECTION = "decision_log";
export const DECISION_AUDIT_COLLECTION = "decision_log_audit";
export const DECISION_STATUSES = ["proposed", "gathering_evidence", "ready_to_review", "accepted", "rejected"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface DecisionInput {
  hypothesis: string;
  observation: string;
  cohort: string;
  alternatives: string[];
  owner: string;
  proposedChange: string;
  buildId: string;
  primaryMetric: string;
  guardrails: string[];
  reviewDate: string;
  status?: DecisionStatus;
  experimentId?: string;
}
export interface DecisionRecord extends DecisionInput {
  id: string;
  status: DecisionStatus;
  actor: string;
  createdAt: number;
  updatedAt: number;
  idempotencyFingerprint?: string;
}

const MAX_FIELD = 1200;
const containsDirectIdentifier = (value: string) =>
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) || /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/.test(value);
function cleanText(value: unknown, field: string, required = true): string {
  if (typeof value !== "string") {
    if (!required && value === undefined) return "";
    throw new Error(`${field} must be text.`);
  }
  const clean = value.trim();
  if (required && !clean) throw new Error(`${field} is required.`);
  if (clean.length > MAX_FIELD) throw new Error(`${field} must be ${MAX_FIELD} characters or fewer.`);
  if (containsDirectIdentifier(clean)) throw new Error(`${field} must not contain personal contact details.`);
  return clean;
}
function cleanList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list.`);
  if (value.length > 8) throw new Error(`${field} can contain at most 8 items.`);
  return value.map((item, index) => cleanText(item, `${field} item ${index + 1}`));
}
export function validateDecisionInput(value: unknown): DecisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Decision record must be an object.");
  const input = value as Record<string, unknown>;
  const status = input.status === undefined ? "gathering_evidence" : input.status;
  if (!DECISION_STATUSES.includes(status as DecisionStatus)) throw new Error("Unsupported decision status.");
  const reviewDate = cleanText(input.reviewDate, "Review date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || Number.isNaN(Date.parse(`${reviewDate}T00:00:00Z`)) || new Date(`${reviewDate}T00:00:00Z`).toISOString().slice(0, 10) !== reviewDate) throw new Error("Review date must use a valid YYYY-MM-DD date.");
  return {
    hypothesis: cleanText(input.hypothesis, "Hypothesis"),
    observation: cleanText(input.observation, "Observation"),
    cohort: cleanText(input.cohort, "Supporting cohort"),
    alternatives: cleanList(input.alternatives, "Alternative explanations"),
    owner: cleanText(input.owner, "Owner"),
    proposedChange: cleanText(input.proposedChange, "Proposed change"),
    buildId: cleanText(input.buildId, "Build or release identifier"),
    primaryMetric: cleanText(input.primaryMetric, "Primary outcome"),
    guardrails: cleanList(input.guardrails, "Guardrails"),
    reviewDate,
    status: status as DecisionStatus,
    ...(input.experimentId === undefined ? {} : { experimentId: cleanText(input.experimentId, "Experiment ID") }),
  };
}

export async function createDecisionRecord(inputValue: unknown, actor: string, idempotencyKey?: string) {
  const input = validateDecisionInput(inputValue);
  const safeKey = idempotencyKey && /^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey) ? idempotencyKey : undefined;
  const id = safeKey ? `decision_${safeKey}` : `decision_${crypto.randomUUID()}`;
  const idempotencyFingerprint = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const ref = firestoreDb.collection(DECISION_LOG_COLLECTION).doc(id);
  const auditId = `decision_audit_${id}_${Date.now()}`;
  const auditRef = firestoreDb.collection(DECISION_AUDIT_COLLECTION).doc(auditId);
  const now = Date.now();
  const record: DecisionRecord = { ...input, id, status: input.status || "gathering_evidence", actor, createdAt: now, updatedAt: now };
  const result = await firestoreDb.runTransaction(async (tx: any) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const previous = existing.data() as DecisionRecord;
      if (safeKey && previous.idempotencyFingerprint !== idempotencyFingerprint) return { conflict: true as const };
      return { record: previous, duplicate: true as const };
    }
    tx.set(ref, { ...record, ...(safeKey ? { idempotencyFingerprint } : {}) });
    tx.set(auditRef, { id: auditId, decisionId: id, actor, action: "created", to: record.status, at: now });
    return { record, duplicate: false };
  });
  if ("conflict" in result) throw new Error("Idempotency key was already used for a different decision.");
  return result;
}

export async function updateDecisionRecord(input: { id: string; status: DecisionStatus; actor: string; note: string }) {
  if (!/^decision_[a-zA-Z0-9_-]{8,120}$/.test(input.id)) throw new Error("Invalid decision ID.");
  if (!DECISION_STATUSES.includes(input.status)) throw new Error("Unsupported decision status.");
  const note = cleanText(input.note, "Update note");
  const ref = firestoreDb.collection(DECISION_LOG_COLLECTION).doc(input.id);
  const auditId = `decision_audit_${input.id}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const auditRef = firestoreDb.collection(DECISION_AUDIT_COLLECTION).doc(auditId);
  return firestoreDb.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { missing: true as const };
    const current = snapshot.data() as DecisionRecord;
    const updated = { ...current, status: input.status, updatedAt: Date.now() };
    tx.set(ref, updated);
    tx.set(auditRef, { id: auditId, decisionId: input.id, actor: input.actor, action: "status_changed", from: current.status, to: input.status, note, at: updated.updatedAt });
    return { missing: false as const, record: updated };
  });
}

export function summarizeRenderedExposures(records: Array<Record<string, any>>, decisions: DecisionRecord[]) {
  const relevant = records.filter((record) => record.event_name === "experiment_exposed");
  return decisions.map((decision) => {
    const exposures = decision.experimentId ? relevant.filter((record) => record.properties?.experimentId === decision.experimentId) : [];
    const variants = exposures.reduce((counts: Record<string, number>, record) => {
      const variant = typeof record.properties?.variantId === "string" ? record.properties.variantId : "unknown";
      counts[variant] = (counts[variant] || 0) + 1;
      return counts;
    }, {});
    return {
      decisionId: decision.id,
      experimentId: decision.experimentId || null,
      renderedExposureCount: exposures.length,
      countsByVariant: variants,
      outcomeStatus: exposures.length > 0 ? "exposure_only_outcomes_unavailable" : "no_observed_exposures",
      causalLift: null,
      liftStatus: "not_estimated",
    };
  });
}

export async function listDecisionRecords() {
  const [decisionSnapshot, exposureSnapshot] = await Promise.all([
    firestoreDb.collection(DECISION_LOG_COLLECTION).orderBy("updatedAt", "desc").limit(100).get(),
    // Bounded unordered read works in the isolated Firestore harness too. It is
    // deliberately labelled as a sample: reaching the cap means older events
    // may be omitted and does not support a complete exposure estimate.
    firestoreDb.collection("telemetry_events_v2").where("event_name", "==", "experiment_exposed").limit(5000).get(),
  ]);
  const decisions = decisionSnapshot.docs.map((doc: any) => doc.data() as DecisionRecord);
  const exposures = exposureSnapshot.docs.map((doc: any) => doc.data() as Record<string, any>);
  const scopeCoverage = { source: "telemetry_events_v2", readCap: 5000, recordsRead: exposures.length, truncatedPossible: exposures.length >= 5000, orderedOrComplete: false };
  return { decisions, exposureSummaries: summarizeRenderedExposures(exposures, decisions), scopeCoverage, interpretation: "Rendered exposure counts are descriptive. Outcome cohorts and causal lift are unavailable until a predeclared outcome query and adequate evidence are connected." };
}
