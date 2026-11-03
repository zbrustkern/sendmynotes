import { firestoreDb } from "../firebase-admin";
import type { FollowupStepConfig, PostPurchaseConfig, PostPurchasePublishedVersion } from "./contracts";

const ROOT = "post_purchase_programs";
const PROGRAM = "post_purchase_v1";
const seedStep = (enabled: boolean, delayDays: number, subject: string, previewText: string, paragraphs: string[], signoff: string, buttonLabel?: string): FollowupStepConfig => ({ enabled, delayDays, subject, previewText, paragraphs, signoff, ...(buttonLabel ? { buttonLabel } : {}) });
export const DEFAULT_POST_PURCHASE_CONFIG: PostPurchaseConfig = {
  schemaVersion: 1, revision: 0, mode: "review", globalPaused: true, sendHourLocal: 10, timezone: "America/Chicago", anchor: "accepted_check_in",
  steps: {
    check_in: seedStep(true, 10, "A quick check-in from Zeke at SendMyNotes", "I'd love to hear how sending your card went.", ["Thank you for trusting us with {{cardPhrase}}.", "If you've heard from the person you sent it to, I'd love to know how it went. Was there anything about sending it that felt confusing or harder than it should have?"], "Thanks,\nZeke\nFounder, SendMyNotes"),
    offer: seedStep(true, 7, "{{offerAmount}} off a little note for someone on your mind", "A thank-you from SendMyNotes. Use it yourself or pass it along.", ["A thank-you, a birthday wish, or simply a little hello—someone else may be on your mind.", "As a thank-you for trying SendMyNotes, here's {{offerAmount}} off one card."], "Thanks,\nZeke\nFounder, SendMyNotes", "Send another card"),
  }, offer: { amountCents: 100, maxUses: 1, validDays: 60 }, updatedAt: 0, updatedBy: "system",
};
const configRef = () => firestoreDb.collection(ROOT).doc(PROGRAM);
export async function getPostPurchaseConfig(): Promise<PostPurchaseConfig> {
  const snap = await configRef().get();
  return snap.exists ? { ...DEFAULT_POST_PURCHASE_CONFIG, ...(snap.data() as Partial<PostPurchaseConfig>) } : DEFAULT_POST_PURCHASE_CONFIG;
}
export async function savePostPurchaseDraft(config: Partial<PostPurchaseConfig>, expectedRevision: number, actor: string): Promise<PostPurchaseConfig> {
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = configRef(); const snap = await tx.get(ref);
    const current = snap.exists ? { ...DEFAULT_POST_PURCHASE_CONFIG, ...(snap.data() as Partial<PostPurchaseConfig>) } : DEFAULT_POST_PURCHASE_CONFIG;
    if (current.revision !== expectedRevision) throw new Error("Post-purchase settings changed; reload before saving.");
    const allowed = Object.fromEntries(Object.entries(config).filter(([key]) => ["mode", "globalPaused", "sendHourLocal", "timezone", "anchor", "steps", "offer"].includes(key)));
    const next = validateConfig({ ...current, ...allowed, steps: { ...current.steps, ...(config.steps || {}) }, offer: { ...current.offer, ...(config.offer || {}) }, revision: current.revision + 1, updatedAt: Date.now(), updatedBy: actor });
    if (current.globalPaused && !next.globalPaused) next.resumedAt = Date.now();
    next.stepResumedAt = { ...(current.stepResumedAt || {}) };
    for (const step of ["check_in", "offer"] as const) if (!current.steps[step].enabled && next.steps[step].enabled) next.stepResumedAt[step] = Date.now();
    tx.set(ref, next, { merge: true }); return next;
  });
}
export async function publishPostPurchaseConfig(expectedRevision: number, actor: string): Promise<PostPurchasePublishedVersion> {
  return firestoreDb.runTransaction(async (tx: any) => {
    const ref = configRef(); const snap = await tx.get(ref);
    const current = snap.exists ? { ...DEFAULT_POST_PURCHASE_CONFIG, ...(snap.data() as Partial<PostPurchaseConfig>) } : DEFAULT_POST_PURCHASE_CONFIG;
    if (current.revision !== expectedRevision) throw new Error("Post-purchase settings changed; reload before publishing.");
    const validated = validateConfig(current, true);
    const priorId = snap.data()?.publishedVersionId;
    const prior = priorId ? await tx.get(firestoreDb.collection("post_purchase_versions").doc(priorId)) : null;
    if (validated.mode === "auto") validated.autoActivatedAt = prior?.data()?.mode === "auto" ? prior.data().autoActivatedAt : Date.now();
    const versionId = `ppv_${current.revision}_${Date.now()}`;
    const version: PostPurchasePublishedVersion = { ...validated, versionId, publishedAt: Date.now(), publishedBy: actor };
    tx.create(firestoreDb.collection("post_purchase_versions").doc(versionId), version);
    tx.set(ref, { publishedVersionId: versionId, ...(validated.autoActivatedAt ? { autoActivatedAt: validated.autoActivatedAt } : {}) }, { merge: true });
    return version;
  });
}
export async function getPublishedPostPurchaseConfig(): Promise<PostPurchasePublishedVersion | null> {
  const snap = await configRef().get(); const id = snap.data()?.publishedVersionId;
  if (typeof id !== "string") return null;
  const version = await firestoreDb.collection("post_purchase_versions").doc(id).get();
  return version.exists ? version.data() as PostPurchasePublishedVersion : null;
}
export async function getPostPurchaseVersion(versionId: string): Promise<PostPurchasePublishedVersion | null> {
  if (!/^ppv_[0-9]+_[0-9]+$/.test(versionId)) return null;
  const version = await firestoreDb.collection("post_purchase_versions").doc(versionId).get();
  return version.exists ? version.data() as PostPurchasePublishedVersion : null;
}
export function validateConfig(c: PostPurchaseConfig, publishing = false): PostPurchaseConfig {
  if (c.schemaVersion !== 1 || !Number.isInteger(c.sendHourLocal) || c.sendHourLocal < 9 || c.sendHourLocal > 17 || c.timezone !== "America/Chicago" || !["auto", "review"].includes(c.mode) || typeof c.globalPaused !== "boolean") throw new Error("Choose review or auto mode, and a sending hour from 9 a.m. to 5 p.m. Chicago time.");
  if (c.offer.amountCents !== 100 || c.offer.maxUses !== 1 || c.offer.validDays !== 60) throw new Error("The initial offer terms are fixed at $1, one redemption, 60 days.");
  if (!["mailing_business_days", "accepted_check_in"].includes(c.anchor)) throw new Error("Choose an offer timing anchor.");
  const variables = new Set(["greeting", "cardPhrase", "offerAmount", "offerCode", "offerUrl", "expiryDisplay"]);
  for (const name of ["check_in", "offer"] as const) {
    const step = c.steps[name];
    const minimum = name === "check_in" || c.anchor === "mailing_business_days" ? 10 : 7;
    if (!step || typeof step.enabled !== "boolean" || !Number.isInteger(step.delayDays) || step.delayDays < minimum || step.delayDays > 90) throw new Error(`Invalid ${name} delay; minimum ${minimum}, maximum 90 days.`);
    if (!Array.isArray(step.paragraphs) || step.paragraphs.length < 1 || step.paragraphs.length > 8) throw new Error("Use 1–8 message paragraphs.");
    for (const value of [step.subject, step.previewText, ...step.paragraphs, step.signoff, ...(name === "offer" ? [step.buttonLabel] : [])]) {
      if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error("Complete each message field (up to 2,000 characters).");
      if (/<[^>]*>|https?:|www\./i.test(value)) throw new Error("Use plain text and approved variables; links and HTML are locked.");
      for (const match of value.matchAll(/{{(.*?)}}/g)) if (!variables.has(match[1])) throw new Error("Unsupported template variable.");
      if (value.replace(/{{[A-Za-z]+}}/g, "").includes("{{") || value.includes("\0")) throw new Error("Malformed template variable.");
    }
    if (/[\r\n]/.test(step.subject) || step.subject.length > 180 || step.previewText.length > 250) throw new Error("Use a single-line subject up to 180 characters and preview text up to 250.");
  }
  if (publishing && c.steps.offer.enabled && !c.steps.check_in.enabled && c.anchor === "accepted_check_in") throw new Error("Enable the check-in or explicitly choose an offer after mailing before publishing.");
  return c;
}
