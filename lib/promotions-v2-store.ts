import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { firestoreDb } from "./firebase-admin";
import { offerBalance, offerBalanceRef, offerCutoverRef, OFFER_USAGE_COLLECTION } from "./offer-balances";
import {
  EMPTY_PROMOTION_BALANCE,
  type PromotionBalance, type PromotionBasket, type PromotionPolicy, type PromotionUsage, type PromotionWorkflow,
} from "./promotions-v2";

export const PROMOTION_CAMPAIGNS = "promotion_campaigns";
export const PROMOTION_DRAFTS = "promotion_drafts";
export const PROMOTION_POLICIES = "promotion_policy_versions";
export const PROMOTION_CODES = "promotion_issued_codes";
export const PROMOTION_USAGE = OFFER_USAGE_COLLECTION;
export const PROMOTION_SESSION_COOKIE = "smn_offer_session";

export interface PromotionCampaign {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  revision: number;
  policyVersionId?: string;
  primaryCodeId?: string;
  hasPrivateIssues?: boolean;
  operatorManaged?: boolean;
  maxUses?: number;
  budgetCents?: number;
  createdAt: number;
  updatedAt: number;
}
export interface PromotionCode {
  id: string;
  campaignId: string;
  distribution: "public" | "private";
  label?: string;
  maxUses?: number;
  budgetCents?: number;
  countryCodes?: string[];
  ownerUid?: string;
  projectId?: string;
  endsAt?: number;
}
export interface ResolvedPromotion { campaign: PromotionCampaign; code: PromotionCode; policy: PromotionPolicy }
export interface PromotionUsageBalance {
  kind: "campaign" | "code" | "sender" | "project";
  ref: FirebaseFirestore.DocumentReference;
  data: PromotionBalance;
  maxUses?: number;
  maxCents?: number;
  maxUnits?: number;
}

export type PromotionReader = Pick<FirebaseFirestore.Transaction, "get">;

export function promotionRead(ref: FirebaseFirestore.DocumentReference, reader?: PromotionReader): Promise<FirebaseFirestore.DocumentSnapshot> {
  return reader ? reader.get(ref) : ref.get();
}

export function normalizePromotionCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(value) ? value : null;
}

export function promotionSecret(purpose: string): Buffer | null {
  const secret = process.env.PROMOTION_PRIVATE_KEY;
  if (secret && secret.length >= 24) return createHmac("sha256", secret).update(`sendmynotes-promotion-v2:${purpose}`).digest();
  if (process.env.NODE_ENV === "test") return createHash("sha256").update(`test-only:sendmynotes-promotion-v2:${purpose}`).digest();
  return null;
}

function privateCodeSecret(): Buffer {
  const key = promotionSecret("admin-private-code");
  if (!key) throw new Error("Private offer issuance is unavailable.");
  return key;
}

export function sealPromotionCode(code: string, context: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", privateCodeSecret(), nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(code), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openPromotionCode(sealed: string, context: string): string {
  const data = Buffer.from(sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", privateCodeSecret(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString();
}

export function promotionLink(code: string, distribution: PromotionCode["distribution"], workflow?: PromotionWorkflow) {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com");
  if (base.protocol !== "https:" && base.hostname !== "localhost") throw new Error("Offer links are unavailable.");
  const url = new URL(workflow === "wedding" ? "/thank-you/wedding" : "/new", base);
  if (distribution === "private") url.hash = new URLSearchParams({ offer: code }).toString();
  else url.searchParams.set("discount", code);
  return url.toString();
}

export function promotionCodeId(code: string, distribution: PromotionCode["distribution"]): string | null {
  if (distribution === "public") return `public_${createHash("sha256").update(code).digest("hex")}`;
  const key = promotionSecret("lookup");
  return key ? `private_${createHmac("sha256", key).update(code).digest("hex")}` : null;
}

export const promotionUsageRef = offerBalanceRef;

export async function readPromotionV2Ready(reader?: PromotionReader) {
  const migration = (await promotionRead(offerCutoverRef(), reader)).data();
  return migration?.state === "active" && Number.isSafeInteger(migration.cutoverAt);
}

export function promotionReservationsEnabled(workflow: PromotionWorkflow, countries: readonly (string | null)[]) {
  if (process.env.PROMOTION_V2_RESERVATIONS_DISABLED === "true") return false;
  if (workflow === "wedding") return process.env.PROMOTION_WEDDING_RESERVATIONS_DISABLED !== "true";
  if (workflow === "multisend") return process.env.PROMOTION_MULTISEND_RESERVATIONS_DISABLED !== "true";
  if (process.env.PROMOTION_SINGLE_RESERVATIONS_DISABLED === "true") return false;
  return !countries.some((country) => country !== null && country !== "US") ||
    process.env.PROMOTION_INTERNATIONAL_RESERVATIONS_DISABLED !== "true";
}

export function promotionCodeReferences(normalized: string) {
  const refs = [
    firestoreDb.collection("discount_codes").doc(normalized),
    firestoreDb.collection("offer_versions").doc(`offer_${normalized}_v1`),
    firestoreDb.collection(PROMOTION_CODES).doc(promotionCodeId(normalized, "public")!),
  ];
  const privateId = promotionCodeId(normalized, "private");
  if (privateId) refs.push(firestoreDb.collection(PROMOTION_CODES).doc(privateId));
  return refs;
}

function narrowedPolicy(policy: PromotionPolicy, code: PromotionCode): PromotionPolicy {
  return {
    ...policy,
    ...(code.countryCodes ? { countryCodes: policy.countryCodes.filter((country) => code.countryCodes!.includes(country)) } : {}),
    ...(code.endsAt ? { endsAt: Math.min(policy.endsAt ?? Infinity, code.endsAt) } : {}),
    ...(code.projectId ? { audience: "project", projectId: code.projectId } : {}),
  };
}

async function resolvePromotionCode(code: PromotionCode, reader?: PromotionReader): Promise<ResolvedPromotion | null> {
  const campaignSnap = await promotionRead(firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(code.campaignId), reader);
  const campaign = campaignSnap.data() as PromotionCampaign | undefined;
  if (!campaign?.policyVersionId) return null;
  const policySnap = await promotionRead(firestoreDb.collection(PROMOTION_POLICIES).doc(campaign.policyVersionId), reader);
  const policy = policySnap.data() as PromotionPolicy | undefined;
  return policy?.campaignId === campaign.id && policy.id === campaign.policyVersionId
    ? { campaign, code, policy: narrowedPolicy(policy, code) } : null;
}

export async function readPromotionById(id: string, reader?: PromotionReader): Promise<ResolvedPromotion | null> {
  if (!/^(public|private)_[a-f0-9]{64}$/.test(id)) return null;
  const snapshot = await promotionRead(firestoreDb.collection(PROMOTION_CODES).doc(id), reader);
  const code = snapshot.data() as PromotionCode | undefined;
  return code?.id === id ? resolvePromotionCode(code, reader) : null;
}

export async function readPromotionForCode(raw: string, reader?: PromotionReader): Promise<ResolvedPromotion | null> {
  const code = normalizePromotionCode(raw);
  if (!code) return null;
  const publicMatch = await readPromotionById(promotionCodeId(code, "public")!, reader);
  if (publicMatch) return publicMatch;
  const privateId = promotionCodeId(code, "private");
  return privateId ? readPromotionById(privateId, reader) : null;
}

export async function readPromotionUsage(resolved: ResolvedPromotion, basket: PromotionBasket, reader?: PromotionReader): Promise<{
  usage: PromotionUsage; balances: PromotionUsageBalance[];
}> {
  const { campaign, code, policy } = resolved;
  const definitions: Omit<PromotionUsageBalance, "data">[] = [
    { kind: "campaign", ref: promotionUsageRef("campaign", campaign.id), maxUses: campaign.maxUses, maxCents: campaign.budgetCents },
    { kind: "code", ref: promotionUsageRef("code", code.id), maxUses: code.maxUses, maxCents: code.budgetCents },
  ];
  if (basket.ownerUid) definitions.push({
    kind: "sender", ref: promotionUsageRef("sender", campaign.id, basket.ownerUid), maxUses: policy.perSenderLimit,
  });
  if (basket.workflow === "wedding" && basket.projectId && basket.canPayProject) definitions.push({
    kind: "project", ref: promotionUsageRef("project", campaign.id, basket.projectId), maxUnits: policy.maxUnitsPerProject, maxCents: policy.maxDiscountCentsPerProject,
  });
  const usage: PromotionUsage = {
    lifecycle: campaign.status,
    identityRequired: Boolean(code.ownerUid),
    unavailable: Boolean(code.ownerUid && basket.ownerUid && code.ownerUid !== basket.ownerUid || code.projectId && (code.projectId !== basket.projectId || !basket.canPayProject)) ||
      !promotionReservationsEnabled(basket.workflow, basket.lines.map(({ countryCode }) => countryCode)) ||
      !await readPromotionV2Ready(reader),
  };
  const balances = await Promise.all(definitions.map(async (definition) => {
    const snapshot = await promotionRead(definition.ref, reader);
    const data = readPromotionBalance(snapshot);
    const { kind, maxUses, maxCents, maxUnits } = definition;
    usage[kind] = { ...data, maxUses, maxCents, maxUnits };
    return { ...definition, data };
  }));
  return { usage, balances };
}

export function readPromotionBalance(snapshot: FirebaseFirestore.DocumentSnapshot): PromotionBalance {
  return snapshot.exists ? offerBalance(snapshot.data()) : { ...EMPTY_PROMOTION_BALANCE };
}

const REFERENCE_LIFETIME = 24 * 60 * 60_000;
const SESSION_PATTERN = /^[a-f0-9]{48}$/;

export function createPrivatePromotionReference(codeId: string, session: string, now = Date.now()): string {
  const secret = promotionSecret("reference");
  if (!secret || !SESSION_PATTERN.test(session) || !/^private_[a-f0-9]{64}$/.test(codeId)) throw new Error("Private offer references are unavailable.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, nonce);
  cipher.setAAD(Buffer.from(session));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ codeId, expiresAt: now + REFERENCE_LIFETIME })), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export async function readPromotionFromRequestReference(req: NextRequest, reference: unknown, now = Date.now()): Promise<ResolvedPromotion | null> {
  const secret = promotionSecret("reference");
  const session = req.cookies.get(PROMOTION_SESSION_COOKIE)?.value;
  if (!secret || !session || !SESSION_PATTERN.test(session) || typeof reference !== "string" || !/^[A-Za-z0-9_-]{50,300}$/.test(reference)) return null;
  let codeId: string;
  try {
    const encrypted = Buffer.from(reference, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", secret, encrypted.subarray(0, 12));
    decipher.setAAD(Buffer.from(session));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    const decoded = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString());
    if (!Number.isSafeInteger(decoded.expiresAt) || now >= decoded.expiresAt || typeof decoded.codeId !== "string") return null;
    codeId = decoded.codeId;
  } catch {
    return null;
  }
  return readPromotionById(codeId);
}
