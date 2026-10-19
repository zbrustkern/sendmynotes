/**
 * lib/webhook-inbox.ts
 *
 * Durable webhook inbox for the SendMyNotes Admin Overhaul (SPRINT-0002-T02).
 * Verifies provider webhook signatures, durably records inbound events,
 * and prevents duplicate side effects from repeated deliveries.
 *
 * Reference: docs/sprints/SPRINT-0002.md
 */

import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { ProviderWebhookInboxRecord } from "./contracts/admin-overhaul";

export const WEBHOOK_INBOX_COLLECTION = "provider_webhook_inbox";

export interface AcceptWebhookInput {
  provider: "stripe" | "handwrytten" | "resend";
  providerEventId: string;
  eventType: string;
  livemode: boolean;
  signatureVerified: boolean;
  payloadSummary: Record<string, string | number | boolean | null>;
  orderId?: string;
  paymentIntentId?: string;
  nowMs?: number;
  leaseDurationMs?: number;
}

/**
 * Durably accepts a webhook event in the provider_webhook_inbox collection.
 * Fails closed if signatureVerified !== true.
 * Returns { duplicate: true } if the event was already received and processed.
 */
export async function acceptWebhookEvent(
  input: AcceptWebhookInput
): Promise<{ record: ProviderWebhookInboxRecord; duplicate: boolean }> {
  // Fail closed: Never accept an unverified webhook
  if (!input.signatureVerified) {
    throw new Error("Unverified webhook signature rejected");
  }

  const docId = `inbox_${input.providerEventId}`;
  const docRef = firestoreDb.collection(WEBHOOK_INBOX_COLLECTION).doc(docId);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);

    if (snapshot.exists) {
      const existing = snapshot.data() as ProviderWebhookInboxRecord;
      const now = input.nowMs ?? Date.now();
      const leaseUntil = (existing as any).leaseUntil ?? 0;
      if (existing.status === "processed" || existing.status === "ignored") {
        return { record: existing, duplicate: true };
      }
      if (existing.status === "processing" && leaseUntil > now) {
        return { record: existing, duplicate: true };
      }
      // Pending/failed records and expired processing leases are retryable.
      const retryRecord = {
        ...existing,
        status: "processing",
        attempts: (existing.attempts || 0) + 1,
        leaseUntil: now + (input.leaseDurationMs ?? 5 * 60_000),
        error: undefined,
      };
      transaction.set(docRef, sanitizeFirestoreData(retryRecord));
      return { record: retryRecord as ProviderWebhookInboxRecord, duplicate: false };
    }

    const now = input.nowMs ?? Date.now();
    const record: ProviderWebhookInboxRecord = {
      inboxId: docId,
      provider: input.provider === "resend" ? ("handwrytten" as any) : input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      receivedAt: now,
      status: "processing",
      attempts: 1,
      leaseUntil: now + (input.leaseDurationMs ?? 5 * 60_000),
      idempotencySignature: `${input.provider}:${input.providerEventId}:${input.eventType}`,
      payloadSummary: {
        ...input.payloadSummary,
        livemode: input.livemode,
        orderId: input.orderId || null,
        paymentIntentId: input.paymentIntentId || null,
      },
    };

    transaction.set(docRef, sanitizeFirestoreData(record));
    return { record, duplicate: false };
  });
}

/**
 * Marks a webhook inbox record as successfully processed.
 */
export async function markWebhookInboxProcessed(providerEventId: string): Promise<void> {
  const docId = `inbox_${providerEventId}`;
  const docRef = firestoreDb.collection(WEBHOOK_INBOX_COLLECTION).doc(docId);

  await docRef.set(
    {
      status: "processed",
      processedAt: Date.now(),
      leaseUntil: 0,
    },
    { merge: true }
  );
}

/**
 * Marks a webhook inbox record as failed.
 */
export async function markWebhookInboxFailed(
  providerEventId: string,
  error: string
): Promise<ProviderWebhookInboxRecord> {
  const docId = `inbox_${providerEventId}`;
  const docRef = firestoreDb.collection(WEBHOOK_INBOX_COLLECTION).doc(docId);

  return firestoreDb.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) {
      throw new Error(`Webhook inbox record ${providerEventId} does not exist`);
    }

    const existing = snapshot.data() as ProviderWebhookInboxRecord;
    const updated: ProviderWebhookInboxRecord = {
      ...existing,
      status: "failed",
      attempts: (existing.attempts || 0) + 1,
      leaseUntil: 0,
      error,
    };

    transaction.set(docRef, sanitizeFirestoreData(updated));
    return updated;
  });
}

/**
 * Retrieves a webhook inbox record by its providerEventId.
 */
export async function getWebhookInboxRecord(
  providerEventId: string
): Promise<ProviderWebhookInboxRecord | null> {
  const docId = `inbox_${providerEventId}`;
  const snapshot = await firestoreDb.collection(WEBHOOK_INBOX_COLLECTION).doc(docId).get();
  if (!snapshot.exists) {
    return null;
  }
  return snapshot.data() as ProviderWebhookInboxRecord;
}
