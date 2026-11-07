import crypto from "crypto";
import { firestoreDb } from "../firebase-admin";

const LINK_COLLECTION = "post_purchase_link_refs";
const OBSERVATION_COLLECTION = "post_purchase_link_observations";
export const FOLLOWUP_LINK_OBSERVATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LINK_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const REF_RE = /^[A-Za-z0-9_-]{40,64}$/;

export interface FollowupLinkInput { messageId: string; enrollmentId: string; sourceOrderId: string; at?: number }
export interface ResolvedFollowupLink {
  referenceHash: string;
  messageId: string;
  enrollmentId: string;
  sourceOrderId: string;
  environment: string;
  createdAt: number;
  expiresAt: number;
}

function environmentScope(): string {
  const project = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (project === "sendmynotes-staging") return "staging";
  if (project === "sendmynotes-2a417") return "production";
  return process.env.NODE_ENV === "test" ? "test" : process.env.NODE_ENV || "development";
}
function signingSecret(): string {
  const secret = process.env.POST_PURCHASE_LINK_SECRET;
  if (!secret || secret.length < 32) throw new Error("post_purchase_link_secret_unavailable");
  return secret;
}
function referenceFor(input: FollowupLinkInput, environment: string): string {
  const purpose = ["post_purchase_link_v1", environment, input.messageId, input.enrollmentId, input.sourceOrderId].join(":");
  return crypto.createHmac("sha256", signingSecret()).update(purpose).digest("base64url");
}
function hashReference(reference: string): string { return crypto.createHash("sha256").update(reference).digest("hex"); }
function validId(value: string): boolean { return /^[A-Za-z0-9_-]{1,160}$/.test(value); }

/** Creates an idempotent, environment-scoped public reference. Only its hash is persisted. */
export async function ensureFollowupLink(input: FollowupLinkInput): Promise<{ reference: string; url: string }> {
  if (!validId(input.messageId) || !validId(input.enrollmentId) || !validId(input.sourceOrderId)) throw new Error("invalid_followup_link_scope");
  const at = input.at ?? Date.now();
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("invalid_followup_link_time");
  const environment = environmentScope();
  const reference = referenceFor(input, environment);
  const referenceHash = hashReference(reference);
  const ref = firestoreDb.collection(LINK_COLLECTION).doc(referenceHash);
  const snap = await ref.get();
  if (snap.exists) {
    const current = snap.data() as ResolvedFollowupLink;
    if (current.environment !== environment || current.messageId !== input.messageId || current.enrollmentId !== input.enrollmentId || current.sourceOrderId !== input.sourceOrderId) throw new Error("followup_link_scope_conflict");
  } else {
    const record: ResolvedFollowupLink = { referenceHash, messageId: input.messageId, enrollmentId: input.enrollmentId, sourceOrderId: input.sourceOrderId, environment, createdAt: at, expiresAt: at + LINK_LIFETIME_MS };
    try { await ref.create(record); } catch (error) { const raced = await ref.get(); if (!raced.exists || (raced.data() as ResolvedFollowupLink).messageId !== input.messageId) throw error; }
  }
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com").replace(/\/$/, "");
  return { reference, url: `${origin}/new?followupRef=${encodeURIComponent(reference)}` };
}

/** Resolves only valid, live links for this runtime environment. Never returns customer data. */
export async function resolveFollowupLink(reference: string, now = Date.now()): Promise<ResolvedFollowupLink | null> {
  if (!REF_RE.test(reference) || !Number.isSafeInteger(now) || now < 0) return null;
  let hash: string;
  try { hash = hashReference(reference); } catch { return null; }
  const snap = await firestoreDb.collection(LINK_COLLECTION).doc(hash).get();
  if (!snap.exists) return null;
  const record = snap.data() as ResolvedFollowupLink;
  if (record.referenceHash !== hash || record.environment !== environmentScope() || record.expiresAt <= now || record.createdAt > now + 5 * 60_000) return null;
  return record;
}

/** Stores an optional browser observation only after an explicit analytics-consent check in the client. */
export async function recordFollowupLinkObservation(reference: string, observedAt = Date.now()): Promise<{ reference: string; observedAt: number } | null> {
  const mapping = await resolveFollowupLink(reference, observedAt);
  if (!mapping || !Number.isSafeInteger(observedAt)) return null;
  const id = `${mapping.referenceHash}_${observedAt}`;
  await firestoreDb.collection(OBSERVATION_COLLECTION).doc(id).set({ referenceHash: mapping.referenceHash, environment: mapping.environment, observedAt, expiresAt: observedAt + FOLLOWUP_LINK_OBSERVATION_WINDOW_MS, source: "consented_browser" }, { merge: true });
  return { reference, observedAt };
}

/** Validates an observation timestamp at the payment boundary; timestamps are never treated as conversion evidence. */
export async function hasRecentFollowupLinkObservation(reference: string, observedAt: number, now = Date.now()): Promise<boolean> {
  const mapping = await resolveFollowupLink(reference, now);
  if (!mapping || !Number.isSafeInteger(observedAt) || observedAt > now + 5 * 60_000 || observedAt < now - FOLLOWUP_LINK_OBSERVATION_WINDOW_MS) return false;
  const id = `${mapping.referenceHash}_${observedAt}`;
  const snap = await firestoreDb.collection(OBSERVATION_COLLECTION).doc(id).get();
  const row = snap.data();
  return Boolean(snap.exists && row?.environment === environmentScope() && row?.referenceHash === mapping.referenceHash && row?.expiresAt > now);
}
