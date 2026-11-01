import crypto from "crypto";
import { firestoreDb } from "./firebase-admin";

/** Analytics-only rehearsal store. This module deliberately imports no order,
 * checkout, payment, fulfillment, mail, redemption, or queue service. */
export const REPLAY_CHECKPOINTS = "analytics_replay_checkpoints";
export const REPLAY_PROJECTIONS = "analytics_replay_projection";

export interface ReplaySourceEvent {
  event_id: string;
  event_name: string;
  occurred_at: number;
  session_id?: string;
  journey_id?: string;
  route_template?: string;
  experience_version?: string;
  properties?: { experimentId?: string; variantId?: string };
}
export interface ReplayOptions {
  runId: string;
  windowStart: number;
  windowEnd: number;
  schemaVersion: string;
  chunkSize?: number;
  maxChunks?: number;
  sourceEvents: ReplaySourceEvent[];
  baselineCounts?: Record<string, number>;
}
export interface ReplayResult {
  replayKey: string;
  status: "paused" | "complete";
  processed: number;
  total: number;
  checkpoint: { nextIndex: number; sourceChecksum: string; projectionChecksum: string };
  countsByEvent: Record<string, number>;
  shadowDiff: Array<{ eventName: string; replayCount: number; baselineCount: number; delta: number }>;
}

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const validId = (value: string, max = 80) => typeof value === "string" && value.length > 0 && value.length <= max && /^[a-zA-Z0-9._-]+$/.test(value);
const safeRoute = (value: unknown) => typeof value === "string" && value.length <= 160 && /^\/[a-zA-Z0-9_/-]*$/.test(value) && !value.includes("..") ? value : undefined;

function normalize(events: ReplaySourceEvent[], start: number, end: number): ReplaySourceEvent[] {
  const seen = new Map<string, string>();
  const accepted: ReplaySourceEvent[] = [];
  if (events.length > 250_000) throw new Error("Replay source exceeds the 250,000 event safety limit.");
  for (const raw of events) {
    if (!raw || !validId(raw.event_id, 160) || !validId(raw.event_name, 100) || !Number.isFinite(raw.occurred_at)) throw new Error("Replay source contains an invalid event.");
    if (raw.occurred_at < start || raw.occurred_at >= end) continue;
    const event: ReplaySourceEvent = {
      event_id: raw.event_id,
      event_name: raw.event_name,
      occurred_at: raw.occurred_at,
      ...(validId(raw.session_id || "", 120) ? { session_id: raw.session_id } : {}),
      ...(validId(raw.journey_id || "", 120) ? { journey_id: raw.journey_id } : {}),
      ...(safeRoute(raw.route_template) ? { route_template: safeRoute(raw.route_template) } : {}),
      ...(validId(raw.experience_version || "", 80) ? { experience_version: raw.experience_version } : {}),
      ...(raw.event_name === "experiment_exposed" && raw.properties && validId(raw.properties.experimentId || "", 80) && validId(raw.properties.variantId || "", 80)
        ? { properties: { experimentId: raw.properties.experimentId, variantId: raw.properties.variantId } }
        : {}),
    };
    const canonical = JSON.stringify(event);
    const prior = seen.get(event.event_id);
    if (prior && prior !== canonical) throw new Error(`Conflicting duplicate event ID: ${event.event_id}`);
    if (!prior) { seen.set(event.event_id, canonical); accepted.push(event); }
  }
  return accepted.sort((a, b) => a.occurred_at - b.occurred_at || a.event_id.localeCompare(b.event_id));
}

/** Resumable deterministic shadow projection over caller-supplied event fixtures.
 * The only writes are namespaced checkpoint/projection docs in analytics collections. */
export async function runAnalyticsReplay(options: ReplayOptions): Promise<ReplayResult> {
  if (!validId(options.runId, 100) || !validId(options.schemaVersion, 50) || !Number.isFinite(options.windowStart) || !Number.isFinite(options.windowEnd) || options.windowEnd <= options.windowStart) throw new Error("Replay identity or window is invalid.");
  const chunkSize = options.chunkSize ?? 100;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 400) throw new Error("Replay chunk size must be between 1 and 400.");
  const events = normalize(options.sourceEvents, options.windowStart, options.windowEnd);
  const baseline = options.baselineCounts || {};
  for (const [name, count] of Object.entries(baseline)) if (!validId(name, 100) || !Number.isSafeInteger(count) || count < 0) throw new Error("Baseline counts must use valid event names and nonnegative integer counts.");
  const sourceChecksum = hash(JSON.stringify(events));
  const replayKey = `replay_${hash(JSON.stringify([options.runId, options.windowStart, options.windowEnd, options.schemaVersion, chunkSize])).slice(0, 40)}`;
  const checkpointRef = firestoreDb.collection(REPLAY_CHECKPOINTS).doc(replayKey);
  const priorSnapshot = await checkpointRef.get();
  const prior = priorSnapshot.exists ? priorSnapshot.data() as any : null;
  if (prior && (prior.sourceChecksum !== sourceChecksum || prior.total !== events.length)) throw new Error("Replay input changed for this run/window/version; use a new run ID.");
  let nextIndex = prior?.nextIndex || 0;
  let projectionChecksum = prior?.projectionChecksum || hash(`${replayKey}|empty`);
  let counts: Record<string, number> = { ...(prior?.countsByEvent || {}) };
  let chunks = 0;
  if (options.maxChunks !== undefined && (!Number.isSafeInteger(options.maxChunks) || options.maxChunks < 0)) throw new Error("maxChunks must be a nonnegative integer.");
  const maxChunks = options.maxChunks === undefined ? Number.POSITIVE_INFINITY : options.maxChunks;
  while (nextIndex < events.length && chunks < maxChunks) {
    const expectedIndex = nextIndex;
    const result = await firestoreDb.runTransaction(async (tx: any) => {
      const checkpointSnapshot = await tx.get(checkpointRef);
      const current = checkpointSnapshot.exists ? checkpointSnapshot.data() as any : null;
      if (current && (current.sourceChecksum !== sourceChecksum || current.total !== events.length)) throw new Error("Replay input changed for this run/window/version; use a new run ID.");
      const currentIndex = current?.nextIndex || 0;
      const currentCounts: Record<string, number> = { ...(current?.countsByEvent || {}) };
      const currentChecksum = current?.projectionChecksum || hash(`${replayKey}|empty`);
      if (currentIndex !== expectedIndex) return { wrote: false, nextIndex: currentIndex, projectionChecksum: currentChecksum, counts: currentCounts };
      const batch = events.slice(currentIndex, currentIndex + chunkSize);
      const nextCounts = { ...currentCounts };
      for (const event of batch) nextCounts[event.event_name] = (nextCounts[event.event_name] || 0) + 1;
      const batchChecksum = hash(`${currentChecksum}|${batch.map((event) => event.event_id).join("|")}`);
      const next = currentIndex + batch.length;
      // Projection writes and their cursor commit atomically. Retried or parallel
      // workers therefore cannot advance the checkpoint while losing a batch.
      for (const event of batch) {
        const projectionId = `${replayKey}_${hash(event.event_id).slice(0, 32)}`;
        tx.set(firestoreDb.collection(REPLAY_PROJECTIONS).doc(projectionId), { replayKey, event });
      }
      tx.set(checkpointRef, { replayKey, runId: options.runId, windowStart: options.windowStart, windowEnd: options.windowEnd, schemaVersion: options.schemaVersion, chunkSize, sourceChecksum, projectionChecksum: batchChecksum, nextIndex: next, total: events.length, countsByEvent: nextCounts, status: next >= events.length ? "complete" : "paused", updatedAt: Date.now() });
      return { wrote: true, nextIndex: next, projectionChecksum: batchChecksum, counts: nextCounts };
    });
    nextIndex = result.nextIndex;
    projectionChecksum = result.projectionChecksum;
    counts = result.counts;
    if (result.wrote) chunks++;
  }
  if (events.length === 0 && !prior) {
    await firestoreDb.runTransaction(async (tx: any) => {
      const existing = await tx.get(checkpointRef);
      if (!existing.exists) tx.set(checkpointRef, { replayKey, runId: options.runId, windowStart: options.windowStart, windowEnd: options.windowEnd, schemaVersion: options.schemaVersion, chunkSize, sourceChecksum, projectionChecksum, nextIndex: 0, total: 0, countsByEvent: counts, status: "complete", updatedAt: Date.now() });
    });
  }
  const names = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])].sort();
  return { replayKey, status: nextIndex >= events.length ? "complete" : "paused", processed: nextIndex, total: events.length, checkpoint: { nextIndex, sourceChecksum, projectionChecksum }, countsByEvent: counts, shadowDiff: names.map((eventName) => ({ eventName, replayCount: counts[eventName] || 0, baselineCount: baseline[eventName] || 0, delta: (counts[eventName] || 0) - (baseline[eventName] || 0) })) };
}
