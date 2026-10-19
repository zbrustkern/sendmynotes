/**
 * lib/transactional-outbox.ts
 *
 * Durable transactional outbox for the SendMyNotes Admin Overhaul (SPRINT-0002).
 * Couples order and payment state transitions with reliable asynchronous dispatch.
 * Provides distributed worker leases, retry with exponential backoff, dead-letter
 * isolation, and replay guarantees that forbid external side effects.
 *
 * Reference: docs/sprints/SPRINT-0002.md
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";

export const TRANSACTIONAL_OUTBOX_COLLECTION = "transactional_outbox";

export type OutboxTopic =
  | "analytics_projection"
  | "analytics_event"
  | "fulfillment_dispatch"
  | "fulfillment_submission"
  | "transactional_email"
  | "email_receipt"
  | "reconciliation_check";

export type OutboxStatus = "pending" | "leased" | "dispatched" | "failed" | "dead_letter";

export interface OutboxEntry {
  outboxId: string;
  topic: OutboxTopic;
  aggregateId: string; // e.g. orderId
  orderId?: string;
  paymentIntentId?: string;
  idempotencyKey: string;
  createdAt: number;
  status: OutboxStatus;
  dispatchedAt?: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  lastError?: string;
  payload: Record<string, unknown>;
}

export interface EnqueueOutboxInput {
  id?: string;
  topic: OutboxTopic;
  orderId: string;
  paymentIntentId?: string;
  idempotencyKey: string;
  payload: Record<string, string | number | boolean | null>;
  maxAttempts?: number;
  delayMs?: number;
}

export interface ClaimBatchOptions {
  workerId: string;
  limit?: number;
  nowMs?: number;
  leaseDurationMs?: number;
  topics?: OutboxTopic[];
}

export interface ProcessQueueOptions {
  workerId: string;
  handlers: Partial<Record<OutboxTopic, (entry: OutboxEntry) => Promise<void>>>;
  isReplay?: boolean;
  nowMs?: number;
  leaseDurationMs?: number;
  batchSize?: number;
  topics?: OutboxTopic[];
}

export interface ProcessQueueResult {
  processed: number;
  failed: number;
  deadLettered: number;
  skippedReplayEffects: number;
}

/**
 * Enqueues an entry into the transactional outbox.
 * Can be called inside an active Firestore transaction to guarantee atomicity
 * with order/payment document mutations.
 */
export async function enqueueOutboxEntry(
  input: EnqueueOutboxInput,
  transaction?: any
): Promise<{ record: OutboxEntry; duplicate: boolean }> {
  const collectionRef = firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION);
  const outboxId = input.id || `outbox_${input.idempotencyKey}`;
  const docRef = collectionRef.doc(outboxId);

  const performWrite = async (tx: any) => {
    const snapshot = await tx.get(docRef);

    if (snapshot.exists) {
      const existing = snapshot.data() as OutboxEntry;
      return { record: existing, duplicate: true };
    }

    const now = Date.now();
    const entry: OutboxEntry = {
      outboxId,
      topic: input.topic,
      aggregateId: input.orderId,
      orderId: input.orderId,
      paymentIntentId: input.paymentIntentId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts || 5,
      nextAttemptAt: now + (input.delayMs || 0),
      payload: input.payload,
    };

    tx.set(docRef, sanitizeFirestoreData(entry));
    return { record: entry, duplicate: false };
  };

  if (transaction) {
    return performWrite(transaction);
  } else {
    return firestoreDb.runTransaction(performWrite);
  }
}

/**
 * Atomically claims a batch of pending or expired-lease outbox entries for a worker.
 * Serializes access so concurrent workers never claim the same entry.
 */
export async function claimOutboxBatch(options: ClaimBatchOptions): Promise<OutboxEntry[]> {
  const limit = options.limit || 10;
  const now = options.nowMs || Date.now();
  const leaseDuration = options.leaseDurationMs || 30 * 1000;
  const collectionRef = firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION);

  const snapshot = await collectionRef.get();
  const candidates: OutboxEntry[] = [];
  snapshot.forEach((doc: any) => {
    const entry = doc.data() as OutboxEntry;
    if (options.topics?.length && !options.topics.includes(entry.topic)) return;
    const pendingReady = entry.status === "pending" && (entry.nextAttemptAt || 0) <= now;
    const leaseExpired = entry.status === "leased" && (entry.leaseExpiresAt || 0) <= now;
    if (pendingReady || leaseExpired) candidates.push(entry);
  });

  const claimed: OutboxEntry[] = [];
  for (const candidate of candidates.slice(0, limit)) {
    const docRef = collectionRef.doc(candidate.outboxId);
    const updated = await firestoreDb.runTransaction(async (transaction: any) => {
      const currentSnap = await transaction.get(docRef);
      if (!currentSnap.exists) return null;
      const current = currentSnap.data() as OutboxEntry;
      const pendingReady = current.status === "pending" && (current.nextAttemptAt || 0) <= now;
      const leaseExpired = current.status === "leased" && (current.leaseExpiresAt || 0) <= now;
      if (!pendingReady && !leaseExpired) return null;
      const next: OutboxEntry = {
        ...current,
        status: "leased",
        leaseOwner: options.workerId,
        leaseExpiresAt: now + leaseDuration,
        attempts: (current.attempts || 0) + 1,
      };
      transaction.set(docRef, sanitizeFirestoreData(next));
      return next;
    });
    if (updated) claimed.push(updated);
  }
  return claimed;
}

/**
 * Marks an outbox entry as successfully dispatched.
 */
export async function completeOutboxEntry(id: string, workerId: string): Promise<void> {
  const docRef = firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(id);

  await firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new Error(`Outbox entry ${id} not found`);
    }

    const existing = snapshot.data() as OutboxEntry;
    if (existing.status === "dispatched") return;
    if (existing.status !== "leased" || existing.leaseOwner !== workerId) {
      throw new Error(`Outbox lease for ${id} is not owned by ${workerId}`);
    }

    const updated: Partial<OutboxEntry> = {
      status: "dispatched",
      dispatchedAt: Date.now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };

    transaction.set(docRef, sanitizeFirestoreData(updated), { merge: true });
  });
}

/** Releases a lease without consuming the queued work (for replay isolation). */
export async function releaseOutboxLease(id: string, workerId: string, nowMs: number = Date.now()): Promise<void> {
  const docRef = firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(id);
  await firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) throw new Error(`Outbox entry ${id} not found`);
    const existing = snapshot.data() as OutboxEntry;
    if (existing.status !== "leased" || existing.leaseOwner !== workerId) return;
    transaction.set(docRef, sanitizeFirestoreData({
      status: "pending",
      nextAttemptAt: nowMs,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    }), { merge: true });
  });
}

/**
 * Marks an outbox entry as failed, applying exponential backoff or moving to dead_letter.
 */
export async function failOutboxEntry(
  id: string,
  workerId: string,
  errorMessage: string,
  backoffBaseMs: number = 2000
): Promise<OutboxEntry> {
  const docRef = firestoreDb.collection(TRANSACTIONAL_OUTBOX_COLLECTION).doc(id);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new Error(`Outbox entry ${id} not found`);
    }

    const existing = snapshot.data() as OutboxEntry;
    if (existing.status !== "leased" || existing.leaseOwner !== workerId) {
      throw new Error(`Outbox lease for ${id} is not owned by ${workerId}`);
    }
    const now = Date.now();
    const attempts = existing.attempts || 1;
    const isExhausted = attempts >= (existing.maxAttempts || 5);

    let nextStatus: OutboxStatus;
    let nextAttemptAt: number;

    if (isExhausted) {
      nextStatus = "dead_letter";
      nextAttemptAt = now + 365 * 24 * 60 * 60 * 1000;
    } else {
      nextStatus = "pending";
      // Exponential backoff: base * 2^(attempts-1)
      const delay = backoffBaseMs * Math.pow(2, attempts - 1);
      nextAttemptAt = now + delay;
    }

    const updated: OutboxEntry = {
      ...existing,
      status: nextStatus,
      nextAttemptAt,
      lastError: errorMessage,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    };

    transaction.set(docRef, sanitizeFirestoreData(updated));
    return updated;
  });
}

/**
 * Processes outbox queue entries using registered topic handlers.
 *
 * CRITICAL SAFETY (SPRINT-0002-AC03):
 * When `isReplay === true`, external side-effect topics ("fulfillment_dispatch",
 * "fulfillment_submission", "transactional_email", "email_receipt") are STRICTLY
 * skipped and never dispatched.
 */
export async function processOutboxQueue(
  options: ProcessQueueOptions
): Promise<ProcessQueueResult> {
  const claimed = await claimOutboxBatch({
    workerId: options.workerId,
    limit: options.batchSize || 10,
    nowMs: options.nowMs,
    leaseDurationMs: options.leaseDurationMs,
    topics: options.topics,
  });

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;
  let skippedReplayEffects = 0;

  for (const entry of claimed) {
    const isExternalSideEffect =
      entry.topic === "fulfillment_dispatch" ||
      entry.topic === "fulfillment_submission" ||
      entry.topic === "transactional_email" ||
      entry.topic === "email_receipt";

    // Enforce SPRINT-0002-AC03: Replay isolation
    if (options.isReplay && isExternalSideEffect) {
      skippedReplayEffects++;
      // Keep real work pending; replay must not consume a production side effect.
      await releaseOutboxLease(entry.outboxId, options.workerId, options.nowMs ?? Date.now());
      continue;
    }

    const handler = options.handlers[entry.topic];
    if (!handler) {
      // Preserve work until an actual topic handler is available.
      const failedEntry = await failOutboxEntry(
        entry.outboxId,
        options.workerId,
        `No handler registered for outbox topic: ${entry.topic}`
      );
      if (failedEntry.status === "dead_letter") deadLettered++;
      else failed++;
      continue;
    }

    try {
      await handler(entry);
      await completeOutboxEntry(entry.outboxId, options.workerId);
      processed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const failedEntry = await failOutboxEntry(entry.outboxId, options.workerId, msg);
      if (failedEntry.status === "dead_letter") {
        deadLettered++;
      } else {
        failed++;
      }
    }
  }

  return {
    processed,
    failed,
    deadLettered,
    skippedReplayEffects,
  };
}
