import { firestoreDb, isFirestoreMock } from "../firebase-admin";
import { FINANCIAL_FACTS_COLLECTION } from "../financial-ledger";
import {
  fetchHandwryttenOrderStatus,
  prepareHandwryttenCustomCard,
  submitPreparedHandwryttenOrder,
} from "../handwrytten";
import { logIncident } from "../incident-logger";
import { sendIncidentAlertEmail } from "../email-alerts";
import { AUTHORIZED_ADMIN_EMAILS } from "../admin-auth";
import type { HandwryttenOrderParams } from "../types";
import { digest, type WeddingQuote } from "./finance";
import { isWeddingStagingRuntime, weddingStorageEnvironment } from "./server";
import { artworkProjectSegment, artworkSha, weddingArtworkObjects } from "./artwork-storage";
import { ARTWORK_LIMITS } from "./artwork-policy";

export type WeddingDispatchMode = "auto" | "manual_release";

export type WeddingDeliveryState =
  | "held"
  | "pending"
  | "dispatching"
  | "retry"
  | "accepted"
  | "quarantined"
  | "rejected"
  | "mailed"
  | "refunded";

export type WeddingBatchDispatchStatus =
  | "staging_review"
  | "awaiting_release"
  | "queued"
  | "dispatching"
  | "paused"
  | "checking"
  | "partial"
  | "complete"
  | "held";

export interface WeddingDispatchControl {
  paused: boolean;
  reason?: string | null;
  actor?: string | null;
  version: number;
  updatedAt?: number | null;
}

export interface WeddingDeliveryRecord {
  householdId: string;
  ordinal: number;
  contentHash: string;
  status: string;
  state: WeddingDeliveryState;
  holdReason?: string | null;
  stateVersion: number;
  attempts: number;
  fence: number;
  dueAt: number | null;
  dispatchAttemptId?: string | null;
  dispatchStartedAt?: number | null;
  leaseExpiresAt?: number | null;
  supplierOrderId?: string | null;
  supplierStatus?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  dateSent?: string | null;
  mailedAt?: number | null;
  lastStatusSyncAt?: number | null;
  outcome?: "accepted" | "rejected" | "unknown" | null;
  error?: string | null;
  updatedAt?: number;
}

export interface WeddingDispatchDeps {
  db?: FirebaseFirestore.Firestore;
  now?: () => number;
  prepareCard?: typeof prepareHandwryttenCustomCard;
  submitOrder?: typeof submitPreparedHandwryttenOrder;
  fetchStatus?: typeof fetchHandwryttenOrderStatus;
  fetchImpl?: typeof fetch;
  readRetainedCover?: (storageKey: string, expectedSha256: string) => Promise<Buffer>;
  alertFounder?: (input: {
    batchId: string;
    summary: string;
    technicalDetails: string;
    statusCode?: number;
  }) => Promise<void>;
  allowStagingTestDispatch?: boolean;
  dispatchMode?: WeddingDispatchMode;
}

const LEASE_MS = 5 * 60_000;
const RETRY_BASE_MS = 30_000;
const MAX_ATTEMPTS = 3;
const WORKER_LOCK_MS = 180_000;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;

function checkedId(id: string): string {
  if (typeof id !== "string" || !SAFE_ID.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) {
    throw new Error("Invalid wedding batch or household identifier.");
  }
  return id;
}

export function resolveWeddingDispatchMode(env: NodeJS.ProcessEnv = process.env): WeddingDispatchMode {
  return env.WEDDING_DISPATCH_MODE === "manual_release" ? "manual_release" : "auto";
}

function controlRef(db: FirebaseFirestore.Firestore) {
  return db.collection("operational_controls").doc("wedding_dispatch");
}

function batchRef(db: FirebaseFirestore.Firestore, batchId: string) {
  return db.collection("weddingBatches").doc(checkedId(batchId));
}

export async function getWeddingDispatchControl(
  deps: Pick<WeddingDispatchDeps, "db"> = {},
): Promise<WeddingDispatchControl> {
  const db = deps.db || firestoreDb;
  const snap = await controlRef(db).get();
  if (!snap.exists) {
    return { paused: false, version: 0, reason: null, actor: null, updatedAt: null };
  }
  const data = snap.data() as Partial<WeddingDispatchControl> | undefined;
  return {
    paused: data?.paused === true,
    reason: data?.reason ?? null,
    actor: data?.actor ?? null,
    version: Number.isFinite(data?.version) ? Number(data!.version) : 0,
    updatedAt: data?.updatedAt ?? null,
  };
}

export async function pauseWeddingDispatch(
  input: { reason: string; actor: string },
  deps: Pick<WeddingDispatchDeps, "db" | "now"> = {},
): Promise<WeddingDispatchControl> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const reason = (input.reason || "").trim().slice(0, 500) || "Wedding dispatch paused.";
  const actor = (input.actor || "system").trim().slice(0, 160);
  const ref = controlRef(db);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as Partial<WeddingDispatchControl>) : {};
    const next: WeddingDispatchControl = {
      paused: true,
      reason,
      actor,
      version: (Number.isFinite(current.version) ? Number(current.version) : 0) + 1,
      updatedAt: now(),
    };
    tx.set(ref, next);
    return next;
  });
}

export async function resumeWeddingDispatch(
  input: { reason: string; actor: string },
  deps: Pick<WeddingDispatchDeps, "db" | "now"> = {},
): Promise<WeddingDispatchControl> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const reason = (input.reason || "").trim().slice(0, 500) || "Wedding dispatch resumed.";
  const actor = (input.actor || "admin").trim().slice(0, 160);
  const ref = controlRef(db);
  const control = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as Partial<WeddingDispatchControl>) : {};
    const next: WeddingDispatchControl = {
      paused: false,
      reason,
      actor,
      version: (Number.isFinite(current.version) ? Number(current.version) : 0) + 1,
      updatedAt: now(),
    };
    tx.set(ref, next);
    return next;
  });

  // Re-arm paused batches that still have pending or retryable deliveries.
  const pausedBatches = await db
    .collection("weddingBatches")
    .where("dispatchStatus", "==", "paused")
    .limit(25)
    .get();
  for (const doc of pausedBatches.docs) {
    const batch = doc.data();
    if (batch.preparationState === "uncertain") continue;
    const deliveriesSnap = await doc.ref.collection("deliveries").limit(101).get();
    const hasWork = deliveriesSnap.docs.some((d) => {
      const state = normalizeDeliveryState(d.data());
      return state === "pending" || state === "retry";
    });
    if (hasWork) {
      await doc.ref.update({
        dispatchStatus: "queued",
        dispatchEligibleAt: now(),
        dispatchError: null,
        updatedAt: now(),
      });
    }
  }
  return control;
}

export function normalizeDeliveryState(raw: Record<string, unknown> | undefined): WeddingDeliveryState {
  const candidate = String(raw?.state || raw?.status || "held").toLowerCase();
  if (
    candidate === "held" ||
    candidate === "pending" ||
    candidate === "dispatching" ||
    candidate === "retry" ||
    candidate === "accepted" ||
    candidate === "quarantined" ||
    candidate === "rejected" ||
    candidate === "mailed" ||
    candidate === "refunded"
  ) {
    return candidate;
  }
  return "held";
}

function isBatchEligibleForHandwryttenDispatch(
  batch: Record<string, unknown>,
  deps: WeddingDispatchDeps = {},
): { eligible: boolean; allowTestMode: boolean; reason?: string } {
  const stagingTestDispatch =
    deps.allowStagingTestDispatch ?? process.env.WEDDING_STAGING_HANDWRYTTEN_TEST_DISPATCH === "true";

  if (batch.paymentMode === "live") {
    if (process.env.STAGING_REVIEW_ONLY === "true" || isWeddingStagingRuntime()) {
      return { eligible: false, allowTestMode: false, reason: "staging_blocks_live_dispatch" };
    }
    if (process.env.HANDWRYTTEN_TEST_MODE === "true") {
      return { eligible: false, allowTestMode: false, reason: "handwrytten_test_mode_blocks_live_dispatch" };
    }
    return { eligible: true, allowTestMode: false };
  }

  if (batch.paymentMode === "stripe_test" || !batch.paymentMode) {
    if (stagingTestDispatch && process.env.HANDWRYTTEN_TEST_MODE === "true") {
      return { eligible: true, allowTestMode: true };
    }
    return { eligible: false, allowTestMode: false, reason: "staging_review_only" };
  }

  return { eligible: false, allowTestMode: false, reason: "unsupported_payment_mode" };
}

async function verifyBatchCaptureFact(
  db: FirebaseFirestore.Firestore,
  batch: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  const paymentIntentId = typeof batch.paymentIntentId === "string" ? batch.paymentIntentId : "";
  if (!paymentIntentId) {
    return { ok: false, reason: "Missing Stripe payment intent on wedding batch." };
  }
  const factSnap = await db.collection(FINANCIAL_FACTS_COLLECTION).doc(`fact_cap_${paymentIntentId}`).get();
  const fact = factSnap.data() as Record<string, unknown> | undefined;
  const expectedLivemode = batch.paymentMode === "live";
  if (
    !factSnap.exists ||
    !fact ||
    fact.provider !== "stripe" ||
    fact.factType !== "capture" ||
    fact.providerObjectId !== paymentIntentId ||
    fact.operationId !== batch.id ||
    fact.amountCents !== batch.capturedCents ||
    fact.currency !== "usd" ||
    fact.livemode !== expectedLivemode
  ) {
    return { ok: false, reason: "Stripe capture financial fact does not match the settled wedding batch." };
  }
  return { ok: true };
}

async function defaultReadRetainedCover(storageKey: string, expectedSha256: string): Promise<Buffer> {
  const bytes = await weddingArtworkObjects.read(storageKey, ARTWORK_LIMITS.outputBytes);
  if (artworkSha(bytes) !== expectedSha256) {
    throw new Error("Retained wedding cover SHA-256 verification failed.");
  }
  return bytes;
}

async function defaultAlertFounder(input: {
  batchId: string;
  summary: string;
  technicalDetails: string;
  statusCode?: number;
}): Promise<void> {
  await logIncident({
    type: "HANDWRYTTEN",
    category: "STUDIO_BILLING",
    severity: "error",
    summary: input.summary,
    technicalDetails: input.technicalDetails,
    metadata: {
      batchId: input.batchId,
      groupingKey: "wedding_dispatch_systemic",
      ...(input.statusCode ? { statusCode: input.statusCode } : {}),
    },
  });

  // Ensure founder is alerted via Resend even if system_config/alerts was not initialized yet.
  if (process.env.NODE_ENV !== "test" && process.env.STAGING_REVIEW_ONLY !== "true") {
    const alertSnap = await firestoreDb.collection("system_config").doc("alerts").get();
    const configuredAlertEmail = (alertSnap.data() as { alertEmail?: string } | undefined)?.alertEmail;
    if (!configuredAlertEmail) {
      const fallbackAdmin =
        process.env.UPLOAD_ADMIN_EMAILS?.split(",")[0]?.trim() || AUTHORIZED_ADMIN_EMAILS[0];
      if (fallbackAdmin) {
        await sendIncidentAlertEmail({
          incident: {
            id: `wedding_sys_${Date.now()}`,
            type: "HANDWRYTTEN",
            category: "STUDIO_BILLING",
            severity: "error",
            summary: input.summary,
            technicalDetails: input.technicalDetails,
            resolved: false,
            createdAt: Date.now(),
          },
          toEmail: fallbackAdmin,
        }).catch(() => {});
      }
    }
  }
}

export function summarizeDeliveries(deliveries: Array<Record<string, unknown>>) {
  const counts: Record<WeddingDeliveryState, number> = {
    held: 0,
    pending: 0,
    dispatching: 0,
    retry: 0,
    accepted: 0,
    quarantined: 0,
    rejected: 0,
    mailed: 0,
    refunded: 0,
  };
  for (const row of deliveries) {
    const state = normalizeDeliveryState(row);
    counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}

function deriveBatchStatus(
  deliveries: Array<Record<string, unknown>>,
  options: { systemicFailure?: boolean; paused?: boolean; mode?: WeddingDispatchMode } = {},
): { dispatchStatus: WeddingBatchDispatchStatus; dispatchEligibleAt: number | null } {
  const counts = summarizeDeliveries(deliveries);
  if (options.systemicFailure || options.paused) {
    return { dispatchStatus: "paused", dispatchEligibleAt: null };
  }
  if (counts.pending > 0 || counts.retry > 0) {
    const dueTimes = deliveries
      .filter((d) => {
        const s = normalizeDeliveryState(d);
        return s === "pending" || s === "retry";
      })
      .map((d) => (typeof d.dueAt === "number" && Number.isFinite(d.dueAt) ? d.dueAt : 0));
    const earliest = dueTimes.length ? Math.min(...dueTimes) : Date.now();
    const pristine =
      counts.accepted === 0 &&
      counts.mailed === 0 &&
      counts.quarantined === 0 &&
      counts.rejected === 0 &&
      counts.dispatching === 0;
    return {
      dispatchStatus: pristine ? "queued" : "partial",
      dispatchEligibleAt: earliest,
    };
  }
  if (counts.dispatching > 0 || counts.quarantined > 0) {
    const leaseTimes = deliveries
      .filter((d) => normalizeDeliveryState(d) === "dispatching")
      .map((d) => (typeof d.leaseExpiresAt === "number" && Number.isFinite(d.leaseExpiresAt) ? d.leaseExpiresAt : Date.now() + LEASE_MS));
    return {
      dispatchStatus: "checking",
      dispatchEligibleAt: leaseTimes.length ? Math.min(...leaseTimes) : null,
    };
  }
  if (counts.rejected > 0) {
    return { dispatchStatus: "partial", dispatchEligibleAt: null };
  }
  if (counts.held > 0) {
    const hasAwaitingRelease = deliveries.some(
      (d) => normalizeDeliveryState(d) === "held" && d.holdReason === "awaiting_release",
    );
    const hasStagingReview = deliveries.some(
      (d) => normalizeDeliveryState(d) === "held" && d.holdReason === "staging_review",
    );
    return {
      dispatchStatus: hasAwaitingRelease
        ? "awaiting_release"
        : hasStagingReview
        ? "staging_review"
        : "held",
      dispatchEligibleAt: null,
    };
  }
  return { dispatchStatus: "complete", dispatchEligibleAt: null };
}

export async function enqueueWeddingBatchDispatch(
  batchId: string,
  deps: WeddingDispatchDeps = {},
): Promise<{
  enqueued: boolean;
  alreadyEnqueued?: boolean;
  status: string;
  dispatchMode?: WeddingDispatchMode;
  reason?: string;
}> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const ref = batchRef(db, batchId);
  const initial = (await ref.get()).data() as Record<string, unknown> | undefined;
  const quote = initial?.quote as WeddingQuote | undefined;

  if (
    !initial ||
    initial.status !== "held" ||
    !initial.settledAt ||
    !initial.paymentIntentId ||
    !quote ||
    !quote.count ||
    Number(initial.capturedCents || 0) <= 0 ||
    Number(initial.capturedCents) !== quote.totalCents ||
    Number(initial.completedCount) !== quote.count
  ) {
    return { enqueued: false, status: "not_ready" };
  }

  const eligibility = isBatchEligibleForHandwryttenDispatch(initial, deps);
  if (!eligibility.eligible) {
    if (!initial.dispatchStatus) {
      await ref.update({
        dispatchStatus: "staging_review",
        dispatchMode: deps.dispatchMode || resolveWeddingDispatchMode(),
        dispatchEligibleAt: null,
      });
    }
    return { enqueued: false, status: "staging_review", reason: eligibility.reason };
  }

  const captureCheck = await verifyBatchCaptureFact(db, initial);
  if (!captureCheck.ok) {
    await ref.update({
      dispatchStatus: "held",
      dispatchError: captureCheck.reason || "Capture verification failed.",
      dispatchEligibleAt: null,
    });
    return { enqueued: false, status: "held", reason: captureCheck.reason };
  }

  const control = await getWeddingDispatchControl({ db });
  const mode = deps.dispatchMode || resolveWeddingDispatchMode();
  const targetBatchStatus: WeddingBatchDispatchStatus = control.paused
    ? "paused"
    : mode === "manual_release"
    ? "awaiting_release"
    : "queued";

  return db.runTransaction(async (tx) => {
    const [bSnap, delSnap] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("deliveries").limit(101)),
    ]);
    const b = bSnap.data() as Record<string, unknown> | undefined;
    if (!b) return { enqueued: false, status: "not_found" };
    if (b.dispatchStatus && b.dispatchStatus !== "staging_review") {
      return {
        enqueued: true,
        alreadyEnqueued: true,
        status: String(b.dispatchStatus),
        dispatchMode: (b.dispatchMode as WeddingDispatchMode) || mode,
      };
    }

    const at = now();
    for (const doc of delSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      if (d.holdReason === "destination_review" || d.status === "refunded" || d.state === "refunded") {
        continue;
      }
      if (targetBatchStatus === "queued") {
        tx.update(doc.ref, {
          state: "pending",
          status: "pending",
          holdReason: null,
          stateVersion: Number(d.stateVersion || 0) + 1,
          attempts: Number(d.attempts || 0),
          fence: Number(d.fence || 0),
          dueAt: at,
          updatedAt: at,
        });
      } else {
        tx.update(doc.ref, {
          state: "held",
          status: "held",
          holdReason: control.paused ? "paused" : "awaiting_release",
          stateVersion: Number(d.stateVersion || 0) + 1,
          attempts: Number(d.attempts || 0),
          fence: Number(d.fence || 0),
          dueAt: null,
          updatedAt: at,
        });
      }
    }

    tx.update(ref, {
      dispatchMode: mode,
      dispatchStatus: targetBatchStatus,
      dispatchEligibleAt: targetBatchStatus === "queued" ? at : null,
      dispatchTurn: Number(b.dispatchTurn || 0),
      preparationState: b.preparedCardId ? "ready" : "pending",
      dispatchError: null,
      updatedAt: at,
    });

    return { enqueued: true, status: targetBatchStatus, dispatchMode: mode };
  });
}

async function prepareBatchSharedCard(
  batchId: string,
  allowTestMode: boolean,
  deps: WeddingDispatchDeps,
): Promise<{ ok: true; cardId: string } | { ok: false; error: string; systemic?: boolean }> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const ref = batchRef(db, batchId);

  const claim = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.data() as Record<string, unknown> | undefined;
    if (!b) return { state: "missing" as const };
    if (b.preparedCardId) {
      return { state: "ready" as const, cardId: String(b.preparedCardId) };
    }
    if (b.preparationState === "preparing" || b.preparationState === "uncertain") {
      return { state: "uncertain" as const };
    }
    tx.update(ref, { preparationState: "preparing", updatedAt: now() });
    return { state: "claimed" as const, batch: b };
  });

  if (claim.state === "ready") return { ok: true, cardId: claim.cardId };
  if (claim.state === "missing") return { ok: false, error: "Batch not found." };
  if (claim.state === "uncertain") {
    await ref.update({
      dispatchStatus: "paused",
      dispatchEligibleAt: null,
      dispatchError: "Shared card preparation outcome requires operator review before retry.",
      updatedAt: now(),
    });
    return { ok: false, error: "Shared card preparation requires operator review." };
  }

  const batch = claim.batch;
  const prepareCard = deps.prepareCard || prepareHandwryttenCustomCard;
  const readCover = deps.readRetainedCover || defaultReadRetainedCover;

  try {
    const artPin = batch.artPin as { id: string; sha256: string; storageKey: string } | null | undefined;
    let prepResult: { success: true; cardId: string; environment: "test" | "live" } | { success: false; error: string };

    if (artPin) {
      const storageEnv =
        batch.storageEnv === "staging" || batch.storageEnv === "production"
          ? batch.storageEnv
          : weddingStorageEnvironment();
      const expectedPrefix = `wedding-paid-retained/${storageEnv}/${artworkProjectSegment(String(batch.projectId))}/${batchId}.png`;
      if (artPin.storageKey !== expectedPrefix || !/^[a-f0-9]{64}$/.test(artPin.sha256 || "")) {
        throw new Error("Paid retained artwork pin failed storage integrity validation.");
      }
      const bytes = await readCover(artPin.storageKey, artPin.sha256);
      prepResult = await prepareCard(
        {
          orderId: batchId,
          imageUrl: "",
          rawCoverBytes: {
            bytes,
            mimeType: "image/png",
            fileName: `${batchId}.png`,
            sha256: artPin.sha256,
          },
          allowTestMode,
        },
        deps.fetchImpl,
      );
    } else {
      const firstCardSnap = await ref.collection("cards").limit(1).get();
      const firstCard = firstCardSnap.docs[0]?.data()?.card as { cover?: { kind?: string; url?: string } } | undefined;
      const coverUrl = firstCard?.cover?.url;
      if (!coverUrl) {
        throw new Error("Preset cover URL is missing from frozen batch card.");
      }
      prepResult = await prepareCard(
        {
          orderId: batchId,
          imageUrl: coverUrl,
          allowTestMode,
        },
        deps.fetchImpl,
      );
    }

    if (!prepResult.success) {
      const errText = prepResult.error || "Failed to prepare Handwrytten custom card.";
      const systemic = /\b(401|402|403|unauthorized|forbidden|insufficient|balance|billing|invalid.*key)\b/i.test(
        errText,
      );
      await ref.update({
        preparationState: "uncertain",
        dispatchStatus: "paused",
        dispatchPausedAt: now(),
        dispatchEligibleAt: null,
        dispatchError: errText,
        updatedAt: now(),
      });
      if (systemic) {
        await pauseWeddingDispatch(
          { reason: `Systemic Handwrytten card preparation failure on ${batchId}: ${errText}`, actor: "wedding-dispatch-worker" },
          { db, now },
        );
        const alertFn = deps.alertFounder || defaultAlertFounder;
        await alertFn({
          batchId,
          summary: `Wedding dispatch paused during card preparation (${batchId})`,
          technicalDetails: errText,
        });
      }
      return { ok: false, error: errText, systemic };
    }

    await ref.update({
      preparedCardId: prepResult.cardId,
      preparedCardEnv: prepResult.environment,
      preparationState: "ready",
      dispatchError: null,
      updatedAt: now(),
    });
    return { ok: true, cardId: prepResult.cardId };
  } catch (error) {
    const errText = error instanceof Error ? error.message : String(error);
    await ref.update({
      preparationState: "uncertain",
      dispatchStatus: "paused",
      dispatchPausedAt: now(),
      dispatchEligibleAt: null,
      dispatchError: errText,
      updatedAt: now(),
    });
    return { ok: false, error: errText };
  }
}

async function expireStaleDeliveries(
  db: FirebaseFirestore.Firestore,
  batchId: string,
  now: () => number,
) {
  const ref = batchRef(db, batchId);
  const delSnap = await ref.collection("deliveries").limit(101).get();
  const at = now();
  for (const doc of delSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (normalizeDeliveryState(d) !== "dispatching") continue;
    const leaseUntil = Number(d.leaseExpiresAt || (Number(d.dispatchStartedAt || 0) + LEASE_MS));
    if (leaseUntil > at) continue;
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(doc.ref);
      const fresh = freshSnap.data() as Record<string, unknown> | undefined;
      if (!fresh || normalizeDeliveryState(fresh) !== "dispatching") return;
      if (fresh.dispatchAttemptId !== d.dispatchAttemptId || fresh.stateVersion !== d.stateVersion) return;
      tx.update(doc.ref, {
        state: "quarantined",
        status: "quarantined",
        outcome: "unknown",
        error: "Submission lease expired before supplier acknowledgement; manual reconciliation required.",
        dueAt: null,
        leaseExpiresAt: null,
        stateVersion: Number(fresh.stateVersion || 0) + 1,
        updatedAt: now(),
      });
    });
  }
}

export interface WeddingDispatchPassResult {
  state: "succeeded" | "paused" | "already_running";
  processedBatches: number;
  dispatched: number;
  accepted: number;
  retry: number;
  quarantined: number;
  rejected: number;
  systemicPause: boolean;
}

export async function runWeddingDispatchPass(
  options: { targetBatchId?: string; maxCardsPerPass?: number; maxParents?: number } = {},
  deps: WeddingDispatchDeps = {},
): Promise<WeddingDispatchPassResult> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const maxCards = Math.max(1, Math.min(options.maxCardsPerPass ?? 8, 10));
  const maxParents = Math.max(1, Math.min(options.maxParents ?? 4, 8));

  const control = await getWeddingDispatchControl({ db });
  if (control.paused) {
    return {
      state: "paused",
      processedBatches: 0,
      dispatched: 0,
      accepted: 0,
      retry: 0,
      quarantined: 0,
      rejected: 0,
      systemicPause: false,
    };
  }

  const lockRef = db.collection("system_config").doc("wedding_dispatch_lock");
  const workerId = `wd_${now()}_${Math.random().toString(36).slice(2, 8)}`;
  const acquired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const current = snap.data() as { workerId?: string; leaseExpiresAt?: number } | undefined;
    if (current?.leaseExpiresAt && current.leaseExpiresAt > now()) {
      return false;
    }
    tx.set(lockRef, {
      workerId,
      leaseExpiresAt: now() + WORKER_LOCK_MS,
      updatedAt: now(),
    });
    return true;
  });

  if (!acquired) {
    return {
      state: "already_running",
      processedBatches: 0,
      dispatched: 0,
      accepted: 0,
      retry: 0,
      quarantined: 0,
      rejected: 0,
      systemicPause: false,
    };
  }

  let totalDispatched = 0;
  let accepted = 0;
  let retry = 0;
  let quarantined = 0;
  let rejected = 0;
  let systemicPause = false;
  const touchedBatches = new Set<string>();

  try {
    const at = now();
    let candidateBatches: Array<Record<string, unknown>> = [];

    if (options.targetBatchId) {
      const snap = await batchRef(db, options.targetBatchId).get();
      const b = snap.data() as Record<string, unknown> | undefined;
      if (b && ["queued", "dispatching", "partial"].includes(String(b.dispatchStatus || ""))) {
        candidateBatches = [{ ...b, id: snap.id }];
      }
    } else {
      const snaps = await Promise.all(
        ["queued", "dispatching", "partial"].map((status) =>
          db.collection("weddingBatches").where("dispatchStatus", "==", status).limit(16).get(),
        ),
      );
      const seen = new Map<string, Record<string, unknown>>();
      for (const s of snaps) {
        for (const doc of s.docs) {
          const data = doc.data() as Record<string, unknown>;
          const eligibleAt = data.dispatchEligibleAt;
          if (eligibleAt == null || Number(eligibleAt) <= at) {
            seen.set(doc.id, { ...data, id: doc.id });
          }
        }
      }
      candidateBatches = [...seen.values()]
        .sort((a, b) => {
          const turnDiff = Number(a.dispatchTurn || 0) - Number(b.dispatchTurn || 0);
          if (turnDiff !== 0) return turnDiff;
          const timeDiff = Number(a.updatedAt || a.createdAt || 0) - Number(b.updatedAt || b.createdAt || 0);
          if (timeDiff !== 0) return timeDiff;
          return String(a.id).localeCompare(String(b.id));
        })
        .slice(0, maxParents);
    }

    type ActiveBatch = {
      id: string;
      batch: Record<string, unknown>;
      preparedCardId: string;
      allowTestMode: boolean;
      pendingQueue: Array<Record<string, unknown>>;
    };
    const activeBatches: ActiveBatch[] = [];

    for (const batch of candidateBatches) {
      const batchId = String(batch.id);
      const eligibility = isBatchEligibleForHandwryttenDispatch(batch, deps);
      if (!eligibility.eligible) {
        await batchRef(db, batchId).update({
          dispatchStatus: "held",
          dispatchEligibleAt: null,
          dispatchError: eligibility.reason || "Environment safeguard prevents dispatch.",
          updatedAt: now(),
        });
        continue;
      }
      const captureCheck = await verifyBatchCaptureFact(db, batch);
      if (!captureCheck.ok) {
        await batchRef(db, batchId).update({
          dispatchStatus: "held",
          dispatchEligibleAt: null,
          dispatchError: captureCheck.reason || "Capture verification failed.",
          updatedAt: now(),
        });
        continue;
      }

      await expireStaleDeliveries(db, batchId, now);

      const prep = await prepareBatchSharedCard(batchId, eligibility.allowTestMode, deps);
      if (!prep.ok) {
        if (prep.systemic) {
          systemicPause = true;
          break;
        }
        continue;
      }

      const freshBatch = ((await batchRef(db, batchId).get()).data() as Record<string, unknown>) || batch;
      await batchRef(db, batchId).update({
        dispatchTurn: Number(freshBatch.dispatchTurn || 0) + 1,
        dispatchStatus: "dispatching",
        updatedAt: now(),
      });
      touchedBatches.add(batchId);

      const delSnap = await batchRef(db, batchId).collection("deliveries").limit(101).get();
      const dueDeliveries = delSnap.docs
        .map((d): Record<string, unknown> => ({ ...(d.data() as Record<string, unknown>), householdId: d.id }))
        .filter((d) => {
          const st = normalizeDeliveryState(d);
          if (st === "pending") return true;
          if (st === "retry") {
            return Number(d.dueAt || 0) <= now();
          }
          return false;
        })
        .sort((a, b) => Number(a.ordinal || 0) - Number(b.ordinal || 0));

      if (dueDeliveries.length > 0) {
        activeBatches.push({
          id: batchId,
          batch: freshBatch,
          preparedCardId: prep.cardId,
          allowTestMode: eligibility.allowTestMode,
          pendingQueue: dueDeliveries,
        });
      }
    }

    const submitOrder = deps.submitOrder || submitPreparedHandwryttenOrder;
    const alertFn = deps.alertFounder || defaultAlertFounder;

    // Fair round-robin across active batches, bounded by maxCards per cron tick.
    let roundMadeProgress = !systemicPause && activeBatches.length > 0;
    while (totalDispatched < maxCards && roundMadeProgress && !systemicPause) {
      roundMadeProgress = false;
      for (const active of activeBatches) {
        if (totalDispatched >= maxCards || systemicPause) break;
        const nextRow = active.pendingQueue.shift();
        if (!nextRow) continue;
        roundMadeProgress = true;

        // Renew worker lease periodically.
        const ownsLock = await db.runTransaction(async (tx) => {
          const snap = await tx.get(lockRef);
          const lease = snap.data() as { workerId?: string; leaseExpiresAt?: number } | undefined;
          if (lease?.workerId !== workerId || !lease.leaseExpiresAt || lease.leaseExpiresAt <= now()) {
            return false;
          }
          tx.update(lockRef, { leaseExpiresAt: now() + WORKER_LOCK_MS, updatedAt: now() });
          return true;
        });
        if (!ownsLock) {
          roundMadeProgress = false;
          break;
        }

        const householdId = String(nextRow.householdId);
        const bRef = batchRef(db, active.id);
        const delRef = bRef.collection("deliveries").doc(householdId);
        const cardRef = bRef.collection("cards").doc(householdId);
        const attemptId = `${active.id}_${householdId}_${now()}_${Math.random().toString(36).slice(2, 6)}`;

        const claimed = await db.runTransaction(async (tx) => {
          const [dSnap, cSnap] = await Promise.all([tx.get(delRef), tx.get(cardRef)]);
          if (!dSnap.exists || !cSnap.exists) return { ok: false as const, reason: "missing" };
          const current = dSnap.data() as Record<string, unknown>;
          const cardDoc = cSnap.data() as { card?: any; refundStatus?: string | null };
          const st = normalizeDeliveryState(current);
          if (st !== "pending" && st !== "retry") return { ok: false as const, reason: "state_changed" };
          if (cardDoc.refundStatus) {
            tx.update(delRef, {
              state: "refunded",
              status: "refunded",
              dueAt: null,
              stateVersion: Number(current.stateVersion || 0) + 1,
              updatedAt: now(),
            });
            return { ok: false as const, reason: "refunded" };
          }
          if (!cardDoc.card || digest(cardDoc.card) !== current.contentHash) {
            tx.update(delRef, {
              state: "quarantined",
              status: "quarantined",
              outcome: "unknown",
              error: "Frozen card snapshot does not match delivery content hash.",
              dueAt: null,
              stateVersion: Number(current.stateVersion || 0) + 1,
              updatedAt: now(),
            });
            return { ok: false as const, reason: "hash_mismatch" };
          }

          const nextVersion = Number(current.stateVersion || 0) + 1;
          const nextAttempts = Number(current.attempts || 0) + 1;
          const atTime = now();
          tx.update(delRef, {
            state: "dispatching",
            status: "dispatching",
            stateVersion: nextVersion,
            attempts: nextAttempts,
            fence: Number(current.fence || 0) + 1,
            dispatchAttemptId: attemptId,
            dispatchStartedAt: atTime,
            leaseExpiresAt: atTime + LEASE_MS,
            dueAt: null,
            updatedAt: atTime,
          });
          return {
            ok: true as const,
            card: cardDoc.card,
            claimedVersion: nextVersion,
            attempts: nextAttempts,
          };
        });

        if (!claimed.ok) continue;

        totalDispatched++;
        const card = claimed.card;
        const orderParams: HandwryttenOrderParams = {
          orderId: `${active.id}-${householdId}`,
          imageUrl: String(card.cover?.url || ""),
          handwrittenMessage: String(card.note || ""),
          fontId: String(card.handwriting || "1"),
          recipient: card.recipient.address,
          returnAddress: card.returnAddress,
          exactMessage: true,
        };

        let result;
        try {
          result = await submitOrder(
            orderParams,
            active.preparedCardId,
            deps.fetchImpl,
            { allowTestMode: active.allowTestMode },
          );
        } catch (err) {
          result = {
            success: false,
            error: `Supplier outcome uncertain: ${err instanceof Error ? err.message : "request threw"}`,
          };
        }

        if (result.success && result.order_id) {
          const hhRef = db
            .collection("weddingProjects")
            .doc(String(active.batch.projectId))
            .collection("households")
            .doc(householdId);
          const finalized = await db.runTransaction(async (tx) => {
            const [snap, hhSnap] = await Promise.all([tx.get(delRef), tx.get(hhRef)]);
            const current = snap.data() as Record<string, unknown> | undefined;
            if (
              !current ||
              normalizeDeliveryState(current) !== "dispatching" ||
              current.dispatchAttemptId !== attemptId ||
              current.stateVersion !== claimed.claimedVersion
            ) {
              return false;
            }
            const atTime = now();
            tx.update(delRef, {
              state: "accepted",
              status: "accepted",
              outcome: "accepted",
              supplierOrderId: result.order_id,
              error: null,
              dueAt: null,
              leaseExpiresAt: null,
              stateVersion: claimed.claimedVersion + 1,
              updatedAt: atTime,
            });
            if (hhSnap.exists) {
              tx.update(hhRef, {
                dispatchStatus: "accepted",
                handwryttenOrderId: result.order_id,
              });
            }
            return true;
          });
          if (finalized) accepted++;
        } else {
          const details = (result.details || {}) as Record<string, unknown>;
          const statusCode = Number(details.providerStatusCode || 0);
          const systemic =
            details.providerSystemicFailure === true ||
            statusCode === 401 ||
            statusCode === 402 ||
            statusCode === 403;
          const knownNotSent = details.providerOutcome === "not_sent";
          const providerRejected = details.providerRejected === true;
          const retryable = details.retryable === true;

          let nextState: WeddingDeliveryState;
          let outcome: "rejected" | "unknown" | null = "unknown";
          let nextDueAt: number | null = null;

          if (systemic && knownNotSent) {
            nextState = "pending";
            outcome = null;
            nextDueAt = now();
          } else if (systemic) {
            // e.g. HTTP 402 or body-text billing/auth error: outcome is unconfirmed -> quarantine!
            nextState = "quarantined";
            outcome = "unknown";
          } else if (providerRejected) {
            nextState = "rejected";
            outcome = "rejected";
          } else if (retryable) {
            if (claimed.attempts >= MAX_ATTEMPTS) {
              nextState = "rejected";
              outcome = "rejected";
            } else {
              nextState = "retry";
              outcome = null;
              nextDueAt = now() + RETRY_BASE_MS * 2 ** (claimed.attempts - 1);
            }
          } else {
            // Ambiguous failure (5xx, timeout, malformed JSON, network throw) -> NEVER blindly retry!
            nextState = "quarantined";
            outcome = "unknown";
          }

          const recorded = await db.runTransaction(async (tx) => {
            const snap = await tx.get(delRef);
            const current = snap.data() as Record<string, unknown> | undefined;
            if (
              !current ||
              normalizeDeliveryState(current) !== "dispatching" ||
              current.dispatchAttemptId !== attemptId ||
              current.stateVersion !== claimed.claimedVersion
            ) {
              return false;
            }
            tx.update(delRef, {
              state: nextState,
              status: nextState,
              outcome,
              error: result.error || "Supplier dispatch did not confirm acceptance.",
              dueAt: nextDueAt,
              dispatchAttemptId: null,
              leaseExpiresAt: null,
              stateVersion: claimed.claimedVersion + 1,
              updatedAt: now(),
            });
            return true;
          });

          if (recorded) {
            if (nextState === "retry") retry++;
            else if (nextState === "rejected") rejected++;
            else if (nextState === "quarantined") quarantined++;
          }

          if (systemic) {
            systemicPause = true;
            const reason =
              result.error ||
              `Systemic Handwrytten failure (HTTP ${statusCode || "unknown"}) paused wedding dispatch.`;
            await pauseWeddingDispatch(
              { reason, actor: "wedding-dispatch-worker" },
              { db, now },
            );
            await bRef.update({
              dispatchStatus: "paused",
              dispatchPausedAt: now(),
              dispatchEligibleAt: null,
              dispatchError: reason,
              updatedAt: now(),
            });
            await alertFn({
              batchId: active.id,
              summary: `Wedding dispatch paused on systemic supplier error (${active.id})`,
              technicalDetails: `${reason} (household: ${householdId}, statusCode: ${statusCode || "n/a"})`,
              statusCode: statusCode || undefined,
            });
            break;
          }
        }
      }
    }

    for (const batchId of touchedBatches) {
      const bRef = batchRef(db, batchId);
      const [bSnap, delSnap] = await Promise.all([
        bRef.get(),
        bRef.collection("deliveries").limit(101).get(),
      ]);
      const b = bSnap.data() as Record<string, unknown> | undefined;
      if (!b || b.dispatchStatus === "paused") continue;
      const derived = deriveBatchStatus(
        delSnap.docs.map((d) => d.data()),
        { systemicFailure: systemicPause },
      );
      await bRef.update({
        dispatchStatus: derived.dispatchStatus,
        dispatchEligibleAt: derived.dispatchEligibleAt,
        updatedAt: now(),
      });
    }

    return {
      state: "succeeded",
      processedBatches: touchedBatches.size,
      dispatched: totalDispatched,
      accepted,
      retry,
      quarantined,
      rejected,
      systemicPause,
    };
  } finally {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists && (snap.data() as { workerId?: string } | undefined)?.workerId === workerId) {
        tx.delete(lockRef);
      }
    });
  }
}

export async function releaseWeddingBatch(
  batchId: string,
  actor: string,
  deps: WeddingDispatchDeps = {},
): Promise<{ batchId: string; dispatchStatus: WeddingBatchDispatchStatus; releasedCount: number }> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const ref = batchRef(db, batchId);

  const control = await getWeddingDispatchControl({ db });
  if (control.paused) {
    throw new Error("Global wedding dispatch is paused. Resume global dispatch before releasing a batch.");
  }

  const initial = (await ref.get()).data() as Record<string, unknown> | undefined;
  if (!initial || initial.status !== "held") {
    throw new Error("Settled wedding batch not found.");
  }
  const eligibility = isBatchEligibleForHandwryttenDispatch(initial, deps);
  if (!eligibility.eligible) {
    throw new Error(`Batch is not eligible for Handwrytten dispatch (${eligibility.reason || "environment"}).`);
  }
  const captureCheck = await verifyBatchCaptureFact(db, initial);
  if (!captureCheck.ok) {
    throw new Error(captureCheck.reason || "Stripe capture verification failed.");
  }

  return db.runTransaction(async (tx) => {
    const [bSnap, delSnap] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("deliveries").limit(101)),
    ]);
    const b = bSnap.data() as Record<string, unknown> | undefined;
    if (!b) throw new Error("Batch not found.");
    if (!["awaiting_release", "paused", "held"].includes(String(b.dispatchStatus || ""))) {
      throw new Error(`Batch cannot be released from dispatch status "${String(b.dispatchStatus || "unknown")}".`);
    }
    const at = now();
    let releasedCount = 0;
    for (const doc of delSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const st = normalizeDeliveryState(d);
      if (st === "held" && d.holdReason !== "destination_review") {
        tx.update(doc.ref, {
          state: "pending",
          status: "pending",
          holdReason: null,
          dueAt: at,
          stateVersion: Number(d.stateVersion || 0) + 1,
          updatedAt: at,
        });
        releasedCount++;
      }
    }
    tx.update(ref, {
      dispatchStatus: "queued",
      dispatchEligibleAt: at,
      dispatchReleasedAt: at,
      dispatchReleasedBy: actor,
      dispatchError: null,
      updatedAt: at,
    });
    return { batchId, dispatchStatus: "queued" as const, releasedCount };
  });
}

export async function retryRejectedWeddingCards(
  batchId: string,
  actor: string,
  householdIds?: string[],
  deps: Pick<WeddingDispatchDeps, "db" | "now"> = {},
): Promise<{ batchId: string; retriedCount: number; dispatchStatus: WeddingBatchDispatchStatus }> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const ref = batchRef(db, batchId);
  const filterSet = householdIds?.length ? new Set(householdIds.map(checkedId)) : null;

  return db.runTransaction(async (tx) => {
    const [bSnap, delSnap, cardsSnap] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("deliveries").limit(101)),
      tx.get(ref.collection("cards").limit(101)),
    ]);
    const b = bSnap.data() as Record<string, unknown> | undefined;
    if (!b || b.status !== "held") {
      throw new Error("Settled wedding batch not found.");
    }
    const cardMap = new Map(cardsSnap.docs.map((c) => [c.id, c.data() as { refundStatus?: string | null }]));
    const at = now();
    let retriedCount = 0;
    const simulatedDeliveries: Array<Record<string, unknown>> = [];

    for (const doc of delSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const st = normalizeDeliveryState(d);
      const card = cardMap.get(doc.id);
      if (st === "rejected" && !card?.refundStatus && (!filterSet || filterSet.has(doc.id))) {
        const nextRow = {
          ...d,
          state: "pending",
          status: "pending",
          error: null,
          dueAt: at,
          stateVersion: Number(d.stateVersion || 0) + 1,
          updatedAt: at,
        };
        tx.update(doc.ref, {
          state: "pending",
          status: "pending",
          error: null,
          dueAt: at,
          retriedBy: actor,
          retriedAt: at,
          stateVersion: Number(d.stateVersion || 0) + 1,
          updatedAt: at,
        });
        retriedCount++;
        simulatedDeliveries.push(nextRow);
      } else {
        simulatedDeliveries.push(d);
      }
    }

    const derived = deriveBatchStatus(simulatedDeliveries);
    tx.update(ref, {
      dispatchStatus: retriedCount > 0 ? "queued" : derived.dispatchStatus,
      dispatchEligibleAt: retriedCount > 0 ? at : derived.dispatchEligibleAt,
      updatedAt: at,
    });

    return {
      batchId,
      retriedCount,
      dispatchStatus: retriedCount > 0 ? "queued" : derived.dispatchStatus,
    };
  });
}

function isHandwryttenMailedStatus(status: string): boolean {
  return /^(mailed|completed|complete|shipped|sent|delivered)$/i.test(status.trim());
}

export async function syncWeddingDeliveryStatuses(
  options: { batchId?: string; limit?: number } = {},
  deps: WeddingDispatchDeps = {},
): Promise<{ checked: number; mailed: number; errors: number }> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const limit = Math.max(1, Math.min(options.limit ?? 15, 30));
  const fetchStatus = deps.fetchStatus || fetchHandwryttenOrderStatus;

  let batchDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
  if (options.batchId) {
    const snap = await batchRef(db, options.batchId).get();
    if (snap.exists) {
      batchDocs = [{ id: snap.id, data: snap.data() as Record<string, unknown> }];
    }
  } else {
    const snaps = await Promise.all(
      ["queued", "dispatching", "partial", "checking", "complete", "paused"].map((status) =>
        db.collection("weddingBatches").where("dispatchStatus", "==", status).limit(15).get(),
      ),
    );
    const seen = new Map<string, Record<string, unknown>>();
    for (const s of snaps) {
      for (const d of s.docs) seen.set(d.id, d.data() as Record<string, unknown>);
    }
    batchDocs = [...seen.entries()].map(([id, data]) => ({ id, data }));
  }

  const candidates: Array<{
    batchId: string;
    projectId: string;
    householdId: string;
    supplierOrderId: string;
    lastStatusSyncAt: number;
  }> = [];

  for (const b of batchDocs) {
    const delSnap = await batchRef(db, b.id).collection("deliveries").limit(101).get();
    for (const doc of delSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      if (normalizeDeliveryState(d) === "accepted" && typeof d.supplierOrderId === "string" && d.supplierOrderId) {
        candidates.push({
          batchId: b.id,
          projectId: String(b.data.projectId || ""),
          householdId: doc.id,
          supplierOrderId: d.supplierOrderId,
          lastStatusSyncAt: Number(d.lastStatusSyncAt || 0),
        });
      }
    }
  }

  candidates.sort((a, b) => a.lastStatusSyncAt - b.lastStatusSyncAt);
  const slice = candidates.slice(0, limit);

  let checked = 0;
  let mailed = 0;
  let errors = 0;
  const updatedBatches = new Set<string>();

  for (const item of slice) {
    checked++;
    const statusRes = await fetchStatus(item.supplierOrderId, deps.fetchImpl);
    if (!statusRes.success || !statusRes.status) {
      errors++;
      continue;
    }

    const at = now();
    const isMailed = isHandwryttenMailedStatus(statusRes.status);
    const delRef = batchRef(db, item.batchId).collection("deliveries").doc(item.householdId);
    const hhRef = item.projectId
      ? db.collection("weddingProjects").doc(item.projectId).collection("households").doc(item.householdId)
      : null;

    const transitioned = await db.runTransaction(async (tx) => {
      const [dSnap, hhSnap] = await Promise.all([
        tx.get(delRef),
        hhRef ? tx.get(hhRef) : Promise.resolve(null),
      ]);
      const current = dSnap.data() as Record<string, unknown> | undefined;
      if (
        !current ||
        normalizeDeliveryState(current) !== "accepted" ||
        current.supplierOrderId !== item.supplierOrderId
      ) {
        return false;
      }

      if (isMailed) {
        tx.update(delRef, {
          state: "mailed",
          status: "mailed",
          supplierStatus: statusRes.status,
          trackingNumber: statusRes.trackingNumber || null,
          trackingUrl: statusRes.trackingUrl || null,
          dateSent: statusRes.dateSent || null,
          mailedAt: at,
          lastStatusSyncAt: at,
          stateVersion: Number(current.stateVersion || 0) + 1,
          updatedAt: at,
        });
        if (hhRef && hhSnap?.exists) {
          tx.update(hhRef, {
            dispatchStatus: "mailed",
            handwryttenOrderId: item.supplierOrderId,
            mailedAt: at,
            ...(statusRes.trackingNumber ? { trackingNumber: statusRes.trackingNumber } : {}),
            ...(statusRes.trackingUrl ? { trackingUrl: statusRes.trackingUrl } : {}),
          });
        }
        return true;
      } else {
        tx.update(delRef, {
          supplierStatus: statusRes.status,
          lastStatusSyncAt: at,
          updatedAt: at,
        });
        return false;
      }
    });

    if (transitioned) {
      mailed++;
      updatedBatches.add(item.batchId);
    }
  }

  for (const batchId of updatedBatches) {
    const bRef = batchRef(db, batchId);
    const [bSnap, delSnap] = await Promise.all([
      bRef.get(),
      bRef.collection("deliveries").limit(101).get(),
    ]);
    const b = bSnap.data() as Record<string, unknown> | undefined;
    if (!b || b.dispatchStatus === "paused") continue;
    const derived = deriveBatchStatus(delSnap.docs.map((d) => d.data()));
    await bRef.update({
      dispatchStatus: derived.dispatchStatus,
      dispatchEligibleAt: derived.dispatchEligibleAt,
      updatedAt: now(),
    });
  }

  return { checked, mailed, errors };
}

export async function listWeddingBatchesForAdmin(
  options: { limit?: number } = {},
  deps: Pick<WeddingDispatchDeps, "db"> = {},
) {
  const db = deps.db || firestoreDb;
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const [snap, control] = await Promise.all([
    db.collection("weddingBatches").orderBy("createdAt", "desc").limit(limit).get(),
    getWeddingDispatchControl({ db }),
  ]);

  const batches = await Promise.all(
    snap.docs.map(async (doc) => {
      const b = doc.data() as Record<string, unknown>;
      const delSnap = await doc.ref.collection("deliveries").limit(101).get();
      const counts = summarizeDeliveries(delSnap.docs.map((d) => d.data()));
      const quote = (b.quote || {}) as Partial<WeddingQuote>;
      return {
        batchId: doc.id,
        projectId: String(b.projectId || ""),
        status: String(b.status || ""),
        paymentMode: String(b.paymentMode || "stripe_test"),
        buyerEmail: typeof b.buyerEmail === "string" ? b.buyerEmail : null,
        dispatchMode: (b.dispatchMode as WeddingDispatchMode) || resolveWeddingDispatchMode(),
        dispatchStatus: String(b.dispatchStatus || (b.status === "held" ? "staging_review" : b.status || "unknown")),
        dispatchError: typeof b.dispatchError === "string" ? b.dispatchError : null,
        preparedCardId: typeof b.preparedCardId === "string" ? b.preparedCardId : null,
        preparationState: typeof b.preparationState === "string" ? b.preparationState : null,
        count: Number(quote.count || 0),
        capturedCents: Number(b.capturedCents || 0),
        refundedCents: Number(b.refundedCents || 0),
        createdAt: Number(b.createdAt || 0),
        settledAt: typeof b.settledAt === "number" ? b.settledAt : null,
        counts,
      };
    }),
  );

  return {
    batches,
    dispatchMode: resolveWeddingDispatchMode(),
    globalControl: control,
  };
}

export async function getWeddingBatchDetailForAdmin(
  batchId: string,
  deps: Pick<WeddingDispatchDeps, "db"> = {},
) {
  const db = deps.db || firestoreDb;
  const ref = batchRef(db, batchId);
  const [bSnap, delSnap, cardsSnap, control] = await Promise.all([
    ref.get(),
    ref.collection("deliveries").limit(101).get(),
    ref.collection("cards").limit(101).get(),
    getWeddingDispatchControl({ db }),
  ]);

  if (!bSnap.exists) {
    throw new Error("Wedding batch not found.");
  }

  const b = bSnap.data() as Record<string, unknown>;
  const cardMap = new Map(cardsSnap.docs.map((d) => [d.id, d.data()]));
  const deliveries = delSnap.docs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>;
      const c = cardMap.get(doc.id) as {
        card?: {
          envelopeName?: string;
          handwriting?: string;
          recipient?: { address?: { city?: string; state?: string; country?: string } };
        };
        line?: { totalCents?: number };
        refundStatus?: string | null;
      } | undefined;
      return {
        householdId: doc.id,
        ordinal: Number(d.ordinal || 0),
        state: normalizeDeliveryState(d),
        holdReason: typeof d.holdReason === "string" ? d.holdReason : null,
        attempts: Number(d.attempts || 0),
        supplierOrderId: typeof d.supplierOrderId === "string" ? d.supplierOrderId : null,
        supplierStatus: typeof d.supplierStatus === "string" ? d.supplierStatus : null,
        trackingNumber: typeof d.trackingNumber === "string" ? d.trackingNumber : null,
        error: typeof d.error === "string" ? d.error : null,
        envelopeName: c?.card?.envelopeName || doc.id,
        destination: c?.card?.recipient?.address
          ? `${c.card.recipient.address.city || ""}, ${c.card.recipient.address.state || ""} ${c.card.recipient.address.country || ""}`.trim()
          : "",
        totalCents: Number(c?.line?.totalCents || 0),
        refundStatus: c?.refundStatus || null,
      };
    })
    .sort((a, bRow) => a.ordinal - bRow.ordinal);

  const counts = summarizeDeliveries(delSnap.docs.map((d) => d.data()));
  const quote = (b.quote || {}) as Partial<WeddingQuote>;

  return {
    batchId: bSnap.id,
    projectId: String(b.projectId || ""),
    status: String(b.status || ""),
    paymentMode: String(b.paymentMode || "stripe_test"),
    buyerEmail: typeof b.buyerEmail === "string" ? b.buyerEmail : null,
    dispatchMode: (b.dispatchMode as WeddingDispatchMode) || resolveWeddingDispatchMode(),
    dispatchStatus: String(b.dispatchStatus || (b.status === "held" ? "staging_review" : b.status || "unknown")),
    dispatchError: typeof b.dispatchError === "string" ? b.dispatchError : null,
    preparedCardId: typeof b.preparedCardId === "string" ? b.preparedCardId : null,
    preparationState: typeof b.preparationState === "string" ? b.preparationState : null,
    count: Number(quote.count || 0),
    capturedCents: Number(b.capturedCents || 0),
    refundedCents: Number(b.refundedCents || 0),
    createdAt: Number(b.createdAt || 0),
    settledAt: typeof b.settledAt === "number" ? b.settledAt : null,
    counts,
    deliveries,
    globalControl: control,
  };
}
