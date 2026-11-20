import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { firestoreDb } from "./firebase-admin";
import { readBoundedCollection } from "./bounded-admin-read";
import { configuredAdminEnvironment } from "./admin-environment";
import { getSupplierCountry } from "./mailing-destinations";
import { weddingBatchRef, weddingCheckoutEnabled } from "./wedding/checkout";
import {
  buildSyntheticPromotionBasket, EMPTY_PROMOTION_BALANCE, evaluatePromotion, PROMOTION_COUNTS,
  type PromotionEvaluation, type PromotionPolicy, type PromotionWorkflow,
} from "./promotions-v2";
import {
  adminId, adminInteger, adminObject, adminText, maximumPromotionOrderSubsidy, optionalAdminInteger, parsePromotionCountries,
  parsePromotionPolicy, policyNeedsBudget, policySampleTime, PromotionAdminError, verifyPromotionPayableDomain, withoutUndefined,
} from "./promotions-v2-policy";
import {
  normalizePromotionCode, promotionCodeId, promotionCodeReferences, promotionSecret, promotionUsageRef, readPromotionBalance, readPromotionV2Ready, promotionReservationsEnabled, sealPromotionCode, openPromotionCode, promotionLink, type PromotionReader,
  PROMOTION_CAMPAIGNS, PROMOTION_CODES, PROMOTION_DRAFTS, PROMOTION_POLICIES, type PromotionCampaign, type PromotionCode,
} from "./promotions-v2-store";

interface PromotionDraft {
  campaignId: string;
  revision: number;
  name: string;
  distribution: PromotionCode["distribution"];
  code?: string;
  sealedCode?: string;
  policy: PromotionPolicy;
  maxUses?: number;
  budgetCents?: number;
}
interface IssuedPromotionCode { id: string; code: string; url: string }
interface StoredIssue { id: string; code?: string; sealedCode?: string; workflow?: PromotionWorkflow }
interface PublicationReceipt { campaign: PromotionCampaign; policy: PromotionPolicy; issued: StoredIssue; review: string }

const campaignRef = (id: string) => firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(id);
const draftRef = (id: string) => firestoreDb.collection(PROMOTION_DRAFTS).doc(id);
const policyRef = (id: string) => firestoreDb.collection(PROMOTION_POLICIES).doc(id);
const issuedRef = (id: string) => firestoreDb.collection(PROMOTION_CODES).doc(id);
const receiptRef = (id: string) => firestoreDb.collection("promotion_admin_receipts").doc(id);
const auditRef = () => firestoreDb.collection("admin_audit_log").doc(randomUUID());
const read = <T>(snap: FirebaseFirestore.DocumentSnapshot) => snap.data() as T | undefined;
const REVISION_CONFLICT = "This campaign changed. Reload the current draft and preview it again.";
const WEDDING_UNAVAILABLE = "Wedding offers can be saved and previewed. Publishing opens when authorized wedding checkout is ready.";
export const PROMOTION_ADMIN_ACTIONS = [
  "draft-save", "draft-preview", "draft-publish", "campaign-pause", "campaign-archive", "campaign-issue", "campaign-clone", "campaign-inspect",
] as const;
type PromotionAdminAction = (typeof PROMOTION_ADMIN_ACTIONS)[number];

export async function weddingPromotionCheckoutAvailable(reader?: PromotionReader) {
  return process.env.PROMOTION_WEDDING_CHECKOUT_READY === "true" && promotionReservationsEnabled("wedding", []) &&
    weddingCheckoutEnabled() && await readPromotionV2Ready(reader);
}

function requiredSecret(purpose: string): Buffer {
  const key = promotionSecret(purpose);
  if (!key) throw new PromotionAdminError("Promotion signing is unavailable in this environment.", 503);
  return key;
}

function issuedResponse(stored: StoredIssue): IssuedPromotionCode {
  const code = stored.code ?? openPromotionCode(stored.sealedCode!, stored.id);
  return { id: stored.id, code, url: promotionLink(code, stored.code ? "public" : "private", stored.workflow) };
}

function draftView(draft: PromotionDraft) {
  const { sealedCode, ...visible } = draft;
  return { ...visible, hasPrivateCode: Boolean(sealedCode) };
}

function previewToken(campaignId: string, revision: number, actor: string): string {
  return createHmac("sha256", requiredSecret("admin-preview")).update(JSON.stringify([configuredAdminEnvironment(), campaignId, revision, actor])).digest("hex");
}

function tokenMatches(left: string, right: unknown) {
  return typeof right === "string" && /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function audit(tx: FirebaseFirestore.Transaction, input: {
  actor: string; action: string; campaignId: string; reason: string; previous?: PromotionCampaign; next?: PromotionCampaign; at: number;
}) {
  const ref = auditRef();
  tx.create(ref, withoutUndefined({
    id: ref.id, actorEmail: input.actor, action: input.action, targetType: "promotion_campaign", targetId: input.campaignId,
    environment: configuredAdminEnvironment(), reason: input.reason, timestamp: input.at,
    previousStatus: input.previous?.status, nextStatus: input.next?.status,
    previousPolicyVersionId: input.previous?.policyVersionId, nextPolicyVersionId: input.next?.policyVersionId,
  }));
}

function requireRevision(campaign: PromotionCampaign | undefined, revision: number): PromotionCampaign {
  if (!campaign) throw new PromotionAdminError("Campaign not found.", 404);
  if (campaign.revision !== revision) throw new PromotionAdminError(REVISION_CONFLICT, 409);
  return campaign;
}

async function canPublish(policy: PromotionPolicy, reader?: PromotionReader) {
  if (process.env.PROMOTION_V2_PUBLICATION_DISABLED === "true") throw new PromotionAdminError("Publishing is paused in this environment.", 409);
  if (policy.workflow === "wedding" && !await weddingPromotionCheckoutAvailable(reader)) throw new PromotionAdminError(WEDDING_UNAVAILABLE, 409);
  if (!promotionReservationsEnabled(policy.workflow, policy.countryCodes)) {
    throw new PromotionAdminError("New offer reservations are paused for this checkout workflow.", 409);
  }
  if (!await readPromotionV2Ready(reader)) throw new PromotionAdminError("Publishing opens when promotion limit migration is active.", 409);
}

function validatePublicationTerms(draft: PromotionDraft, campaign: PromotionCampaign | undefined, at: number) {
  verifyPromotionPayableDomain(draft.policy);
  if (draft.policy.endsAt !== undefined && draft.policy.endsAt <= at) {
    throw new PromotionAdminError("Set the end time in the future before publishing.");
  }
  if ((policyNeedsBudget(draft.policy, draft.distribution) || campaign?.hasPrivateIssues) && draft.budgetCents === undefined) {
    throw new PromotionAdminError("Set a finite campaign budget for per-card, private, or free offers.");
  }
}

async function saveDraft(body: Record<string, unknown>, actor: string) {
  const id = body.campaignId === undefined ? randomUUID() : adminId(body.campaignId, "campaign ID");
  const priorRevision = body.campaignId === undefined ? 0 : adminInteger(body.revision, "revision");
  const name = adminText(body.name, "a campaign name", 100);
  const distribution = body.distribution;
  if (distribution !== "public" && distribution !== "private") throw new PromotionAdminError("Choose public or private distribution.");
  const entered = body.code === undefined || body.code === "" ? undefined : normalizePromotionCode(body.code);
  if (entered === null) throw new PromotionAdminError("Use 2–64 letters, numbers, underscores or hyphens for the code.");
  const revision = priorRevision + 1;
  const policy = parsePromotionPolicy(body.policy, id, `${id}_r${revision}`);
  const maxUses = optionalAdminInteger(body.maxUses, "campaign use limit");
  const budgetCents = optionalAdminInteger(body.budgetCents, "campaign budget cents");
  const at = Date.now();
  const result = await firestoreDb.runTransaction(async (tx) => {
    const [campaignSnap, draftSnap] = await Promise.all([tx.get(campaignRef(id)), tx.get(draftRef(id))]);
    const existing = read<PromotionCampaign>(campaignSnap);
    const previous = read<PromotionDraft>(draftSnap);
    if (priorRevision) requireRevision(existing, priorRevision);
    if (existing && !existing.operatorManaged) throw new PromotionAdminError("This campaign is managed by the follow-up grant workflow.", 409);
    if (existing?.status === "archived") throw new PromotionAdminError("Clone the archived campaign to create a new draft.", 409);
    if (existing?.primaryCodeId) {
      const [codeSnap, policySnap] = await Promise.all([tx.get(issuedRef(existing.primaryCodeId)), tx.get(policyRef(existing.policyVersionId!))]);
      const code = read<PromotionCode>(codeSnap);
      if (read<PromotionPolicy>(policySnap)?.workflow !== policy.workflow) throw new PromotionAdminError("Create a new campaign to change a published workflow.");
      if (!code || code.distribution !== distribution || entered && promotionCodeId(entered, distribution) !== code.id) {
        throw new PromotionAdminError("The campaign’s published code and distribution are fixed.");
      }
    }
    const draft: PromotionDraft = withoutUndefined({
      campaignId: id, name, revision, distribution, policy: { ...policy, version: revision }, maxUses, budgetCents,
      code: distribution === "public" ? entered ?? previous?.code : undefined,
      sealedCode: distribution === "private" ? entered ? sealPromotionCode(entered, id) : previous?.sealedCode : undefined,
    } satisfies PromotionDraft);
    const campaign = { ...existing, id, name, revision, status: existing?.status ?? "draft", operatorManaged: true, createdAt: existing?.createdAt ?? at, updatedAt: at } as PromotionCampaign;
    tx.set(campaignRef(id), campaign);
    tx.set(draftRef(id), draft);
    audit(tx, { actor, action: "save_draft", campaignId: id, reason: "Saved campaign draft", previous: existing, next: campaign, at });
    return { campaign, draft: draftView(draft) };
  });
  return result;
}

function scenarioEvaluation(policy: PromotionPolicy, raw: unknown): PromotionEvaluation & { economics?: { supplierCostCents: number; belowSupplierCost: boolean; referenceStripeFeeCents: number; referenceContributionCents: number }; warnings?: string[] } {
  const input = adminObject(raw, "preview basket");
  const [min, max] = PROMOTION_COUNTS[policy.workflow];
  const count = input.count === undefined ? min : adminInteger(input.count, "card count", min, max);
  const previouslyPurchased = optionalAdminInteger(input.previouslyPurchased, "previously purchased cards", 0, Number.MAX_SAFE_INTEGER - max);
  const previouslyUsedUnits = optionalAdminInteger(input.previouslyUsedUnits, "previously applied project cards", 0, Number.MAX_SAFE_INTEGER);
  const previouslyUsedCents = optionalAdminInteger(input.previouslyUsedCents, "previously applied project cents", 0, Number.MAX_SAFE_INTEGER);
  const parseCountry = (country: unknown): string | null => {
    if (country === null) return null;
    if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) throw new PromotionAdminError("Choose a canonical destination country.");
    return country;
  };
  const countryCode = input.countryCode === undefined ? policy.countryCodes[0] : parseCountry(input.countryCode);
  if (input.countryCodes !== undefined && (!Array.isArray(input.countryCodes) || input.countryCodes.length !== count)) {
    throw new PromotionAdminError("Provide one destination per card.");
  }
  const countryCodes = Array.isArray(input.countryCodes) ? input.countryCodes.map(parseCountry) : undefined;
  const unsupportedCountry = (countryCodes ?? [countryCode]).some((country) => country &&
    (getSupplierCountry(country)?.countryCode !== country || getSupplierCountry(country)?.suspended || policy.workflow === "multisend" && country !== "US"));
  const basket = buildSyntheticPromotionBasket(policy, {
    countryCode, count, previouslyPurchased, countryCodes, verified: input.verified !== false, wrongProject: input.wrongProject === true,
  });
  const result = evaluatePromotion(policy, basket, policySampleTime(policy), {
    unavailable: Boolean(unsupportedCountry), project: { ...EMPTY_PROMOTION_BALANCE, spentUnits: previouslyUsedUnits ?? 0, spentCents: previouslyUsedCents ?? 0 },
  });
  const evaluation = unsupportedCountry ? { ...result, reason: "destination_unavailable" as const } : result;
  if (policy.workflow !== "single" || basket.lines[0].countryCode !== "US") return evaluation;
  return {
    ...evaluation,
    economics: { supplierCostCents: 488, belowSupplierCost: evaluation.netCents < 488, referenceStripeFeeCents: 56, referenceContributionCents: 356 },
    ...(evaluation.netCents < 488 ? { warnings: ["This payable total is below the confirmed $4.88 domestic single-card supplier charge."] } : {}),
  };
}

async function previewDraft(body: Record<string, unknown>, actor: string) {
  const id = adminId(body.campaignId, "campaign ID");
  const revision = adminInteger(body.revision, "revision");
  const [campaignSnap, draftSnap] = await Promise.all([campaignRef(id).get(), draftRef(id).get()]);
  const campaign = requireRevision(read<PromotionCampaign>(campaignSnap), revision);
  const draft = read<PromotionDraft>(draftSnap);
  if (!draft || draft.revision !== revision) throw new PromotionAdminError(REVISION_CONFLICT, 409);
  const { policy } = draft;
  const [min, max] = PROMOTION_COUNTS[policy.workflow];
  const countryCode = policy.chargeTypes.includes("destination_surcharge") ? policy.countryCodes.find((country) => country !== "US") ?? policy.countryCodes[0] : policy.countryCodes[0];
  let count = Math.max(min, policy.minimumQuantity ?? min);
  let qualifying = scenarioEvaluation(policy, { countryCode, count });
  while (!qualifying.eligible && count < max && (qualifying.reason === "minimum_quantity" || qualifying.reason === "minimum_spend")) {
    count++;
    qualifying = scenarioEvaluation(policy, { countryCode, count });
  }
  const near = count > min ? { countryCode, count: count - 1 } : { countryCode: policy.workflow === "multisend" ? null : policy.countryCodes.includes("US") ? null : "US", count };
  const maximumOrderSubsidyCents = maximumPromotionOrderSubsidy(policy);
  const maxCampaignByUses = draft.maxUses === undefined ? Infinity : draft.maxUses * maximumOrderSubsidyCents;
  const maximumCampaignSubsidyCents = Math.min(draft.budgetCents ?? Infinity, maxCampaignByUses);
  const weddingCheckoutAvailable = await weddingPromotionCheckoutAvailable();
  let publicationBlockReason: string | null = null;
  try {
    await canPublish(policy);
    validatePublicationTerms(draft, campaign, Date.now());
  } catch (error) {
    if (!(error instanceof PromotionAdminError)) throw error;
    publicationBlockReason = error.message;
  }
  return {
    revision, previewToken: previewToken(id, revision, actor),
    previews: {
      qualifying,
      nearMiss: scenarioEvaluation(policy, near),
      largest: scenarioEvaluation(policy, { countryCode, count: max }),
      ...(body.scenario !== undefined ? { custom: scenarioEvaluation(policy, body.scenario) } : {}),
    },
    maximumOrderSubsidyCents,
    maximumCampaignSubsidyCents: Number.isFinite(maximumCampaignSubsidyCents) ? maximumCampaignSubsidyCents : null,
    weddingCheckoutAvailable, publicationAvailable: publicationBlockReason === null, publicationBlockReason,
  };
}

function codeForDraft(draft: PromotionDraft) {
  return draft.code ?? (draft.sealedCode ? openPromotionCode(draft.sealedCode, draft.campaignId) : `NOTE${randomBytes(12).toString("hex").toUpperCase()}`);
}

async function publishDraft(body: Record<string, unknown>, actor: string) {
  const id = adminId(body.campaignId, "campaign ID");
  const revision = adminInteger(body.revision, "revision");
  const reason = adminText(body.reason, "a publication reason", 400);
  const review = previewToken(id, revision, actor);
  if (!tokenMatches(review, body.previewToken)) throw new PromotionAdminError("Preview the current draft before publishing.", 409);
  const ref = receiptRef(`publish_${id}_${revision}`);
  const at = Date.now();

  // Prove the reviewed draft outside the transaction and recheck its revision inside.
  const saved = read<PromotionDraft>(await draftRef(id).get());
  const priorPublication = read<PublicationReceipt>(await ref.get());
  if (priorPublication?.review === review) return { ...priorPublication, review: undefined, issued: issuedResponse(priorPublication.issued), weddingCheckoutAvailable: await weddingPromotionCheckoutAvailable() };
  if (!saved || saved.revision !== revision) throw new PromotionAdminError(REVISION_CONFLICT, 409);
  await canPublish(saved.policy);
  validatePublicationTerms(saved, undefined, at);
  const result = await firestoreDb.runTransaction(async (tx) => {
    const [campaignSnap, draftSnap, receiptSnap, usageSnap] = await Promise.all([
      tx.get(campaignRef(id)), tx.get(draftRef(id)), tx.get(ref), tx.get(promotionUsageRef("campaign", id)),
    ]);
    const prior = read<PublicationReceipt>(receiptSnap);
    if (prior?.review === review) return prior;
    const existing = requireRevision(read<PromotionCampaign>(campaignSnap), revision);
    const draft = read<PromotionDraft>(draftSnap);
    if (!draft || draft.revision !== revision || existing.status === "archived") throw new PromotionAdminError(REVISION_CONFLICT, 409);
    await canPublish(draft.policy, tx);
    if (existing.hasPrivateIssues && draft.budgetCents === undefined) throw new PromotionAdminError("Keep a finite campaign budget for issued private codes.");
    const usage = readPromotionBalance(usageSnap);
    if ((draft.budgetCents ?? Infinity) < usage.heldCents + usage.spentCents || (draft.maxUses ?? Infinity) < usage.heldUses + usage.spentUses) {
      throw new PromotionAdminError("Campaign limits must cover the current held and spent balance.", 409);
    }
    let stored: StoredIssue;
    if (existing.primaryCodeId) {
      const code = read<PromotionCode>(await tx.get(issuedRef(existing.primaryCodeId)));
      if (!code) throw new PromotionAdminError("The existing issued code needs reconciliation.", 409);
      const previous = read<PublicationReceipt>(await tx.get(receiptRef(`publish_${id}_${existing.policyVersionId?.split("_r").at(-1)}`)));
      if (!previous?.issued) throw new PromotionAdminError("The existing issued code needs reconciliation.", 409);
      stored = previous.issued;
    } else {
      const label = codeForDraft(draft);
      const codeId = promotionCodeId(label, draft.distribution);
      if (!codeId) throw new PromotionAdminError("Private code lookup is unavailable in this environment.", 503);
      const collisions = await Promise.all(promotionCodeReferences(label).map((item) => tx.get(item)));
      if (collisions.some((snap) => snap.exists)) throw new PromotionAdminError("This code is already in use.", 409);
      const record: PromotionCode = withoutUndefined({ id: codeId, campaignId: id, distribution: draft.distribution, label: draft.distribution === "public" ? label : undefined });
      stored = draft.distribution === "public" ? { id: codeId, code: label, workflow: draft.policy.workflow } : { id: codeId, sealedCode: sealPromotionCode(label, codeId), workflow: draft.policy.workflow };
      tx.create(issuedRef(codeId), record);
    }
    const campaign: PromotionCampaign = withoutUndefined({
      ...existing, name: draft.name, status: "active", policyVersionId: draft.policy.id, primaryCodeId: stored.id,
      budgetCents: draft.budgetCents, maxUses: draft.maxUses, updatedAt: at,
      hasPrivateIssues: existing.hasPrivateIssues || draft.distribution === "private",
    } satisfies PromotionCampaign);
    const publication = { campaign, policy: draft.policy, issued: stored, review };
    tx.create(policyRef(draft.policy.id), draft.policy);
    tx.set(campaignRef(id), campaign);
    tx.create(ref, publication);
    audit(tx, { actor, campaignId: id, action: "publish_policy", previous: existing, next: campaign, reason, at });
    return publication;
  });
  return { campaign: result.campaign, policy: result.policy, issued: issuedResponse(result.issued), weddingCheckoutAvailable: await weddingPromotionCheckoutAvailable() };
}

async function changeLifecycle(body: Record<string, unknown>, actor: string, status: "paused" | "archived") {
  const id = adminId(body.campaignId, "campaign ID");
  const revision = adminInteger(body.revision, "revision");
  const reason = adminText(body.reason, "a reason", 400);
  const at = Date.now();
  const campaign = await firestoreDb.runTransaction(async (tx) => {
    const previous = requireRevision(read<PromotionCampaign>(await tx.get(campaignRef(id))), revision);
    if (previous.status === status) return previous;
    if (previous.status === "archived" || status === "paused" && previous.status !== "active") throw new PromotionAdminError("This campaign cannot change to that status.", 409);
    const campaign: PromotionCampaign = { ...previous, status, revision: revision + 1, updatedAt: at };
    tx.set(campaignRef(id), campaign);
    audit(tx, { actor, campaignId: id, action: `campaign_${status}`, previous, next: campaign, reason, at });
    return campaign;
  });
  return { campaign };
}

async function issuePrivateCodes(body: Record<string, unknown>, actor: string) {
  const id = adminId(body.campaignId, "campaign ID");
  const requestId = adminId(body.requestId, "issuance request ID");
  const count = body.count === undefined ? 1 : adminInteger(body.count, "number of codes", 1, 20);
  const reason = adminText(body.reason, "an issuance reason", 400);
  const restrictions = body.restrictions === undefined ? {} : adminObject(body.restrictions, "code restrictions");
  const requested = withoutUndefined({
    countryCodes: restrictions.countryCodes === undefined ? undefined : parsePromotionCountries(restrictions.countryCodes),
    ownerUid: restrictions.ownerUid === undefined ? undefined : adminId(restrictions.ownerUid, "verified sender ID"),
    projectId: restrictions.projectId === undefined ? undefined : adminId(restrictions.projectId, "project ID"),
    maxUses: optionalAdminInteger(restrictions.maxUses, "code use limit"),
    budgetCents: optionalAdminInteger(restrictions.budgetCents, "code budget cents"),
    endsAt: optionalAdminInteger(restrictions.endsAt, "code end time", 1, 8_640_000_000_000_000),
  });
  const fingerprint = JSON.stringify({ actor, count, reason, requested });
  const ref = receiptRef(`issue_${id}_${requestId}`);
  const at = Date.now();
  const generated = Array.from({ length: count }, () => `NOTE${randomBytes(16).toString("hex").toUpperCase()}`);
  const issued = await firestoreDb.runTransaction(async (tx) => {
    const [campaignSnap, previousSnap] = await Promise.all([tx.get(campaignRef(id)), tx.get(ref)]);
    const existing = read<{ fingerprint: string; issued: StoredIssue[] }>(previousSnap);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new PromotionAdminError("This issuance request ID already has different details.", 409);
      return existing.issued;
    }
    const campaign = read<PromotionCampaign>(campaignSnap);
    if (!campaign?.operatorManaged || !campaign.policyVersionId || campaign.status !== "active") throw new PromotionAdminError("Activate a published campaign before issuing codes.", 409);
    if (campaign.budgetCents === undefined) throw new PromotionAdminError("Set a campaign budget before issuing private codes.");
    const policy = read<PromotionPolicy>(await tx.get(policyRef(campaign.policyVersionId)));
    if (!policy) throw new PromotionAdminError("Campaign policy needs reconciliation.", 409);
    await canPublish(policy, tx);
    if (requested.countryCodes?.some((country) => !policy.countryCodes.includes(country)) ||
      requested.projectId && requested.projectId !== policy.projectId ||
      requested.endsAt !== undefined && (requested.endsAt <= at || requested.endsAt <= (policy.startsAt ?? 0)) ||
      policy.endsAt !== undefined && policy.endsAt <= at) {
      throw new PromotionAdminError("Code rules must narrow an existing, unexpired campaign.");
    }
    const snapshots = await Promise.all(generated.flatMap((raw) => promotionCodeReferences(raw)).map((ref) => tx.get(ref)));
    if (snapshots.some((snapshot) => snapshot.exists)) throw new PromotionAdminError("Code issuance collided. Retry this request.", 409);
    const items = generated.map((raw) => {
      const codeId = promotionCodeId(raw, "private");
      if (!codeId) throw new PromotionAdminError("Private code lookup is unavailable in this environment.", 503);
      tx.create(issuedRef(codeId), { ...requested, id: codeId, campaignId: id, distribution: "private" } satisfies PromotionCode);
      return { id: codeId, sealedCode: sealPromotionCode(raw, codeId), workflow: policy.workflow };
    });
    tx.create(ref, { fingerprint, issued: items });
    if (!campaign.hasPrivateIssues) tx.set(campaignRef(id), { hasPrivateIssues: true }, { merge: true });
    audit(tx, { actor, campaignId: id, action: "issue_private_codes", reason, previous: campaign, next: campaign, at });
    return items;
  });
  return { issued: issued.map(issuedResponse) };
}

async function cloneCampaign(body: Record<string, unknown>, actor: string) {
  const fromId = adminId(body.campaignId, "campaign ID");
  const source = read<PromotionCampaign>(await campaignRef(fromId).get());
  if (!source) throw new PromotionAdminError("Campaign not found.", 404);
  const previous = read<PromotionDraft>(await draftRef(fromId).get());
  if (!previous) throw new PromotionAdminError("Campaign draft not found.", 404);
  const name = adminText(body.name, "a campaign name", 100);
  const reason = adminText(body.reason, "a cloning reason", 400);
  const id = randomUUID();
  const revision = 1;
  const at = Date.now();
  const campaign: PromotionCampaign = { id, name, revision, status: "draft", operatorManaged: true, createdAt: at, updatedAt: at };
  const draft: PromotionDraft = withoutUndefined({
    campaignId: id, revision, name, distribution: previous.distribution,
    policy: { ...previous.policy, campaignId: id, id: `${id}_r${revision}`, version: revision }, maxUses: previous.maxUses, budgetCents: previous.budgetCents,
  });
  await firestoreDb.runTransaction(async (tx) => {
    tx.create(campaignRef(id), campaign);
    tx.create(draftRef(id), draft);
    audit(tx, { actor, campaignId: id, action: "clone_campaign", reason, next: campaign, at });
  });
  return { campaign, draft: draftView(draft) };
}

async function inspectCampaign(body: Record<string, unknown>, actor: string) {
  if (body.orderId !== undefined) {
    const orderId = adminId(body.orderId, "order ID");
    const [order, wedding] = await Promise.all([firestoreDb.collection("orders").doc(orderId).get(), weddingBatchRef(orderId).get()]);
    const weddingQuote = wedding.data()?.quote;
    if (weddingQuote?.promotion) {
      return { decision: {
        orderId, reason: "applied", policyVersionId: weddingQuote.promotion.policyVersionId,
        grossCents: weddingQuote.totalCents + weddingQuote.promotion.savingsCents,
        discountCents: weddingQuote.promotion.savingsCents, netCents: weddingQuote.totalCents,
      } };
    }
    const data = order.data();
    const offerQuote = data?.quoteId ? (await firestoreDb.collection("offer_quotes").doc(data.quoteId).get()).data() : null;
    if (!offerQuote && !data?.offerQuoteSnapshot?.promotion && !data?.promotion && !data?.appliedPromotions) {
      throw new PromotionAdminError("Frozen promotion decision not found.", 404);
    }
    const frozen = offerQuote?.promotion ?? data?.offerQuoteSnapshot?.promotion ?? data?.promotion;
    if (!frozen?.evaluation && offerQuote) {
      return { decision: {
        orderId, reason: "applied", policyVersionId: `${offerQuote.offerId}_v${offerQuote.offerVersion}`,
        grossCents: data?.priceQuote?.basePriceCents ? data.priceQuote.basePriceCents + (data.priceQuote.internationalSurchargeCents ?? 0) : offerQuote.basePriceCents,
        discountCents: offerQuote.discountAmountCents, netCents: data?.amountInCents ?? offerQuote.payableAmountCents,
      } };
    }
    return { decision: { ...frozen?.evaluation, orderId, policyVersionId: frozen?.policyVersionId, appliedPromotions: data?.appliedPromotions ?? frozen?.evaluation?.appliedPromotions } };
  }
  const preview = await previewDraft({ ...body, scenario: body.scenario ?? {} }, actor);
  return { decision: preview.previews.custom };
}

async function loadCampaign(campaign: PromotionCampaign) {
  const [draftSnap, policySnap, usageSnap, codesSnap] = await Promise.all([
    draftRef(campaign.id).get(), campaign.policyVersionId ? policyRef(campaign.policyVersionId).get() : Promise.resolve(null),
    promotionUsageRef("campaign", campaign.id).get(),
    firestoreDb.collection(PROMOTION_CODES).where("campaignId", "==", campaign.id).limit(50).get(),
  ]);
  const draft = read<PromotionDraft>(draftSnap);
  const usage = readPromotionBalance(usageSnap);
  return {
    campaign, draft: draft ? draftView(draft) : null, policy: policySnap ? read<PromotionPolicy>(policySnap) ?? null : null,
    balance: { ...usage, remainingCents: campaign.budgetCents === undefined ? null : Math.max(0, campaign.budgetCents - usage.heldCents - usage.spentCents) },
    codes: codesSnap.docs.map((doc) => {
      const { id, distribution, label } = doc.data() as PromotionCode;
      return { id, distribution, label, ...(label ? { url: promotionLink(label, distribution, policySnap ? read<PromotionPolicy>(policySnap)?.workflow : undefined) } : {}) };
    }),
  };
}

export async function getPromotionCampaignHistory(rawId: string | null) {
  const id = adminId(rawId, "campaign ID");
  if (!(await campaignRef(id).get()).exists) throw new PromotionAdminError("Campaign not found.", 404);
  const records = await firestoreDb.collection("admin_audit_log").where("targetId", "==", id)
    .where("targetType", "==", "promotion_campaign").orderBy("timestamp", "desc").limit(100).get();
  const history = records.docs.map((snapshot) => snapshot.data())
    .map(({ id, actorEmail, action, environment, reason, timestamp, previousPolicyVersionId, nextPolicyVersionId }) => ({
      id, actorEmail, action, environment, reason, timestamp, oldVersion: previousPolicyVersionId, newVersion: nextPolicyVersionId,
    }));
  return { history };
}

/** Full environment totals use campaign balances a single time across code and policy versions. */
export async function getPromotionCampaignTotals(now = Date.now()) {
  const [campaigns, codes, migrationActive] = await Promise.all([
    readBoundedCollection(firestoreDb.collection(PROMOTION_CAMPAIGNS)),
    readBoundedCollection(firestoreDb.collection(PROMOTION_CODES)),
    readPromotionV2Ready(),
  ]);
  const totals = { totalCodes: codes.size, activeCodes: 0, totalRedemptions: 0, totalSavingsCents: 0, heldUses: 0, heldCents: 0 };
  const activePolicies = new Map<string, PromotionPolicy>();
  for (let index = 0; index < campaigns.size; index += 25) {
    const batch = await Promise.all(campaigns.docs.slice(index, index + 25).map(async (document) => {
      const campaign = document.data() as PromotionCampaign;
      const balance = readPromotionBalance(await promotionUsageRef("campaign", campaign.id).get());
      const mayRedeem = migrationActive && campaign.status === "active" && campaign.policyVersionId &&
        (campaign.maxUses === undefined || balance.heldUses + balance.spentUses < campaign.maxUses) &&
        (campaign.budgetCents === undefined || balance.heldCents + balance.spentCents < campaign.budgetCents);
      const policy = mayRedeem ? read<PromotionPolicy>(await policyRef(campaign.policyVersionId!).get()) : undefined;
      return { campaign, balance, policy };
    }));
    const weddingReady = batch.some(({ policy }) => policy?.workflow === "wedding") && await weddingPromotionCheckoutAvailable();
    for (const { campaign, balance, policy } of batch) {
      totals.totalRedemptions += balance.spentUses;
      totals.totalSavingsCents += balance.spentCents;
      totals.heldUses += balance.heldUses;
      totals.heldCents += balance.heldCents;
      if (policy && (policy.startsAt === undefined || policy.startsAt <= now) && (policy.endsAt === undefined || now < policy.endsAt) &&
        (policy.workflow !== "wedding" || weddingReady)) activePolicies.set(campaign.id, policy);
    }
  }
  const activeCodes = codes.docs.map((document) => document.data() as PromotionCode).filter((code) => {
    const policy = activePolicies.get(code.campaignId);
    return policy && (code.endsAt === undefined || now < code.endsAt) && policy.countryCodes.some((country) =>
      (code.countryCodes === undefined || code.countryCodes.includes(country)) && promotionReservationsEnabled(policy.workflow, [country]));
  });
  for (let index = 0; index < activeCodes.length; index += 25) {
    const batch = await Promise.all(activeCodes.slice(index, index + 25).map(async (code) => {
      if (code.maxUses === undefined && code.budgetCents === undefined) return true;
      const balance = readPromotionBalance(await promotionUsageRef("code", code.id).get());
      return (code.maxUses === undefined || balance.heldUses + balance.spentUses < code.maxUses) &&
        (code.budgetCents === undefined || balance.heldCents + balance.spentCents < code.budgetCents);
    }));
    totals.activeCodes += batch.filter(Boolean).length;
  }
  return totals;
}

export async function getPromotionCampaigns(id?: string) {
  const environment = configuredAdminEnvironment();
  const weddingCheckoutAvailable = await weddingPromotionCheckoutAvailable();
  if (id !== undefined) {
    const campaign = read<PromotionCampaign>(await campaignRef(adminId(id, "campaign ID")).get());
    if (!campaign) throw new PromotionAdminError("Campaign not found.", 404);
    return { campaign: await loadCampaign(campaign), weddingCheckoutAvailable, environment };
  }
  const snap = await firestoreDb.collection(PROMOTION_CAMPAIGNS).where("operatorManaged", "==", true).orderBy("updatedAt", "desc").limit(50).get();
  return { campaigns: await Promise.all(snap.docs.map((doc) => loadCampaign(doc.data() as PromotionCampaign))), weddingCheckoutAvailable, environment };
}

export async function executePromotionAdminAction(action: PromotionAdminAction, body: Record<string, unknown>, actor: string) {
  switch (action) {
    case "draft-save": return saveDraft(body, actor);
    case "draft-preview": return previewDraft(body, actor);
    case "draft-publish": return publishDraft(body, actor);
    case "campaign-pause": return changeLifecycle(body, actor, "paused");
    case "campaign-archive": return changeLifecycle(body, actor, "archived");
    case "campaign-issue": return issuePrivateCodes(body, actor);
    case "campaign-clone": return cloneCampaign(body, actor);
    case "campaign-inspect": return inspectCampaign(body, actor);
  }
}

export function isPromotionAdminAction(action: unknown): action is PromotionAdminAction {
  return typeof action === "string" && PROMOTION_ADMIN_ACTIONS.includes(action as PromotionAdminAction);
}
