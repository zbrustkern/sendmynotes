import crypto from "crypto";
import { firestoreDb } from "../firebase-admin";
import type { EmailPreference, PermissionState, RecordPostPurchaseConsentInput } from "./contracts";

const COLLECTION = "email_preferences";
function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email address is required");
  return email;
}
function keyVersion(): { version: number; secret: string } {
  const secret = process.env.POST_PURCHASE_SENDER_HMAC_KEY;
  if (!secret || secret.length < 32) throw new Error("Post-purchase sender HMAC key is not configured");
  const version = Number(process.env.POST_PURCHASE_SENDER_HMAC_KEY_VERSION || "1");
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid sender-key version");
  return { version, secret };
}
export function getSenderKey(email: string): string {
  const { version, secret } = keyVersion();
  return `v${version}_${crypto.createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex")}`;
}
export function maskEmail(email: string): string {
  const [local, domain = ""] = normalizeEmail(email).split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}
const refFor = (senderKey: string) => firestoreDb.collection(COLLECTION).doc(senderKey);
export async function getEmailPreference(email: string): Promise<EmailPreference | null> {
  let key: string; try { key = getSenderKey(email); } catch { return null; }
  const snap = await refFor(key).get();
  return snap.exists ? snap.data() as EmailPreference : null;
}
export async function recordPostPurchaseConsent(input: RecordPostPurchaseConsentInput): Promise<EmailPreference> {
  const senderKey = getSenderKey(input.email); const now = input.at ?? Date.now();
  const accepted = input.optedIn === true && Boolean(input.disclosureVersion?.trim());
  const ref = refFor(senderKey);
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() as EmailPreference : undefined;
    if (existing && now < existing.updatedAt) return existing;
    // Unknown/omitted input is never an opt-in; denied does not clear a durable suppression.
    const state: PermissionState = existing && ["unsubscribed", "bounced", "complained"].includes(existing.state)
      ? existing.state
      : accepted ? "granted" : input.optedIn === false ? (existing?.state === "granted" ? "granted" : "denied") : (existing?.state || "unknown");
    const result: EmailPreference = { senderKey, schemaVersion: 1, state, updatedAt: now,
      ...((accepted || existing?.acceptedAt) ? { disclosureVersion: accepted ? input.disclosureVersion!.trim() : existing!.disclosureVersion, source: accepted ? (input.source?.slice(0, 80) || "checkout") : existing!.source, acceptedAt: accepted ? now : existing!.acceptedAt } : {}),
      ...(existing?.unsubscribedAt ? { unsubscribedAt: existing.unsubscribedAt } : {}),
      ...(existing?.suppressedAt ? { suppressedAt: existing.suppressedAt } : {}),
    };
    tx.set(ref, result); return result;
  });
}
export async function suppressPostPurchaseEmail(email: string, reason: "unsubscribed" | "bounced" | "complained", at = Date.now()): Promise<EmailPreference> {
  const senderKey = getSenderKey(email); const ref = refFor(senderKey);
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref); const old = snap.exists ? snap.data() as EmailPreference : undefined;
    const state: PermissionState = old?.state === "complained" || old?.state === "bounced" ? old.state : reason;
    const next: EmailPreference = { ...(old || {} as EmailPreference), senderKey, schemaVersion: 1, state, updatedAt: at, suppressedAt: at, ...(reason === "unsubscribed" ? { unsubscribedAt: at } : {}) };
    tx.set(ref, next); return next;
  });
}
export async function suppressPostPurchaseSender(senderKey: string, reason: "unsubscribed" | "bounced" | "complained", at = Date.now()): Promise<EmailPreference> {
  if (!/^v\d+_[a-f0-9]{64}$/.test(senderKey)) throw new Error("Invalid sender reference");
  const ref = refFor(senderKey);
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref); const old = snap.exists ? snap.data() as EmailPreference : undefined;
    const state: PermissionState = old?.state === "complained" || old?.state === "bounced" ? old.state : reason;
    const next: EmailPreference = { ...(old || {} as EmailPreference), senderKey, schemaVersion: 1, state, updatedAt: at, suppressedAt: at, ...(reason === "unsubscribed" ? { unsubscribedAt: at } : {}) };
    tx.set(ref, next); return next;
  });
}
