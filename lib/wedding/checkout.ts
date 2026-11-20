import { prepareWeddingPromotion, finalizeWeddingPromotion } from "./promotion";
import type { OfferCounterDelta } from "../offer-balances";
import { randomUUID } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { firestoreDb, isFirestoreMock } from "../firebase-admin";
import {
  authorizeInternationalCheckout,
  getSupplierCountry,
  validateMailingAddress,
} from "../mailing-destinations";
import { resolvePaymentMode } from "../payment-mode";
import { getStripeClient } from "../stripe";
import { recordPaymentCaptureFact } from "../financial-ledger";
import { analyzeHandwryttenFit } from "../handwrytten-text-policy";
import {
  resolveWeddingNote,
  weddingRowReady,
  type WeddingHousehold,
  type WeddingProject,
  type WeddingActor,
} from "./domain";
import {
  assertWeddingActorInTransaction,
  isWeddingStagingRuntime,
  weddingStorageEnvironment,
} from "./server";
import { sanitizeAttribution } from "../telemetry-schema";
import { sanitizeAttributionSnapshot } from "../attribution-classifier";
import type { OrderAttribution } from "../types";
import type { CommercialKind } from "../contracts/admin-overhaul";
import {
  digest,
  priceWeddingSelection,
  type WeddingQuote,
  type WeddingQuoteLine,
} from "./finance";

const CHUNK = 20;
const HOUR = 3600000;
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
export class WeddingCheckoutError extends Error {
  constructor(
    message: string,
    public status = 409,
    public code = "checkout_conflict",
  ) {
    super(message);
  }
}
export function safeId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw new WeddingCheckoutError("Invalid reference.", 400);
  return value;
}
export type Selection = { id: string; revision: number };
export function readSelection(value: unknown): Selection[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new WeddingCheckoutError("Select between 1 and 100 households.", 400);
  const rows = value.map((r) => {
    if (!r || !Number.isSafeInteger(r.revision) || r.revision < 0)
      throw new WeddingCheckoutError("Refresh the selected household.", 400);
    return { id: safeId(r.id), revision: r.revision };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new WeddingCheckoutError("Select each household once.", 400);
  return rows;
}
export type Payer = WeddingActor;
type Project = WeddingProject & {
  ownerId: string;
  paidHouseholds?: Record<string, string>;
  checkoutRevocationRequestedFor?: string | null;
};
type Status =
  | "preparing"
  | "ready"
  | "issuing"
  | "awaiting_payment"
  | "held"
  | "canceling"
  | "canceled"
  | "reconciliation";
type Batch = {
  id: string;
  projectId: string;
  actorId: string;
  status: Status;
  quote: WeddingQuote;
  promotionDeltas?: OfferCounterDelta[];
  createdAt: number;
  expiresAt: number;
  preparedCount: number;
  completedCount: number;
  paymentIntentId: string | null;
  issueAt: number | null;
  capturedCents: number;
  refundedCents: number;
  refundReservedCents: number;
  dueAt?: number | null;
  artPin?: { id: string; sha256: string; storageKey: string } | null;
  paymentMode?: "live" | "stripe_test";
  storageEnv?: "staging" | "production";
  buyerEmail?: string | null;
  attribution?: OrderAttribution | null;
  dispatchStatus?: string | null;
  dispatchMode?: "auto" | "manual_release" | null;
  confirmationEmailSentAt?: number | null;
  metaCapiSentAt?: number | null;
};
export const weddingBatchRef = (id: string) =>
  firestoreDb.collection("weddingBatches").doc(safeId(id));
const projectRef = (id: string) =>
  firestoreDb.collection("weddingProjects").doc(safeId(id));
export interface WeddingPaymentRuntime {
  paymentMode: "live" | "stripe_test";
  expectedLivemode: boolean;
  stagingReviewOnly: boolean;
  storageEnv: "staging" | "production";
  publishableKeyPrefix: "pk_live_" | "pk_test_";
}

export function resolveWeddingPaymentRuntime(): WeddingPaymentRuntime | null {
  try {
    const mode = resolvePaymentMode();
    if (mode !== "live" && mode !== "stripe_test") return null;
    if (process.env.NODE_ENV === "production" && isFirestoreMock) return null;
    const staging = isWeddingStagingRuntime();
    const stagingReviewOnly = process.env.STAGING_REVIEW_ONLY === "true";
    const localFixture =
      process.env.NODE_ENV === "test" &&
      isFirestoreMock &&
      Boolean(process.env.SMN_TEST_DATA_DIR);
    const pk = (
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
      ""
    ).trim();

    if (mode === "stripe_test") {
      const hostedStaging =
        staging &&
        process.env.HANDWRYTTEN_TEST_MODE === "true" &&
        !isFirestoreMock;
      if (!((localFixture || hostedStaging) && stagingReviewOnly)) {
        return null;
      }
      if (pk && !pk.startsWith("pk_test_")) return null;
      return {
        paymentMode: "stripe_test",
        expectedLivemode: false,
        stagingReviewOnly: true,
        storageEnv: "staging",
        publishableKeyPrefix: "pk_test_",
      };
    }

    if (staging || stagingReviewOnly || (isFirestoreMock && !localFixture)) {
      return null;
    }
    if (pk && !pk.startsWith("pk_live_")) return null;
    return {
      paymentMode: "live",
      expectedLivemode: true,
      stagingReviewOnly: false,
      storageEnv: "production",
      publishableKeyPrefix: "pk_live_",
    };
  } catch {
    return null;
  }
}

export function heldPaymentRuntime(): boolean {
  return resolveWeddingPaymentRuntime()?.paymentMode === "stripe_test";
}
export function weddingCheckoutEnabled(): boolean {
  return (
    resolveWeddingPaymentRuntime() !== null &&
    process.env.WEDDING_CHECKOUT_ENABLED === "true"
  );
}
function requirePurchasing(): WeddingPaymentRuntime {
  const runtime = resolveWeddingPaymentRuntime();
  if (!runtime || process.env.WEDDING_CHECKOUT_ENABLED !== "true")
    throw new WeddingCheckoutError(
      "Purchasing is currently paused.",
      503,
      "checkout_paused",
    );
  return runtime;
}
function requirePaymentRuntime(): WeddingPaymentRuntime {
  const runtime = resolveWeddingPaymentRuntime();
  if (!runtime)
    throw new WeddingCheckoutError(
      "Payment reconciliation is unavailable.",
      503,
    );
  return runtime;
}
function normalizeBuyerEmail(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new WeddingCheckoutError("Enter a valid email address.", 400, "invalid_email");
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (
    trimmed.length > 254 ||
    /[\r\n]/.test(trimmed) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  ) {
    throw new WeddingCheckoutError("Enter a valid email address.", 400, "invalid_email");
  }
  return trimmed;
}
function sanitizeWeddingAttribution(raw: unknown): OrderAttribution | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const optOut = typeof input.optOut === "boolean" ? input.optOut : undefined;
  const gpc = typeof input.gpc === "boolean" ? input.gpc : undefined;
  const allowClickIds = optOut !== true && gpc !== true;
  const result: OrderAttribution = {
    ...(sanitizeAttributionSnapshot(input.attributionV2)
      ? { attributionV2: sanitizeAttributionSnapshot(input.attributionV2) }
      : {}),
    ...(sanitizeAttribution(input.utmSource ?? input.utm_source)
      ? { utmSource: sanitizeAttribution(input.utmSource ?? input.utm_source) }
      : {}),
    ...(sanitizeAttribution(input.utmMedium ?? input.utm_medium)
      ? { utmMedium: sanitizeAttribution(input.utmMedium ?? input.utm_medium) }
      : {}),
    ...(sanitizeAttribution(input.utmCampaign ?? input.utm_campaign)
      ? { utmCampaign: sanitizeAttribution(input.utmCampaign ?? input.utm_campaign) }
      : {}),
    ...(sanitizeAttribution(input.utmContent ?? input.utm_content)
      ? { utmContent: sanitizeAttribution(input.utmContent ?? input.utm_content) }
      : {}),
    ...(sanitizeAttribution(input.utmTerm ?? input.utm_term)
      ? { utmTerm: sanitizeAttribution(input.utmTerm ?? input.utm_term) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.gclid, 255)
      ? { gclid: sanitizeAttribution(input.gclid, 255) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.wbraid, 255)
      ? { wbraid: sanitizeAttribution(input.wbraid, 255) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.gbraid, 255)
      ? { gbraid: sanitizeAttribution(input.gbraid, 255) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.fbclid, 255)
      ? { fbclid: sanitizeAttribution(input.fbclid, 255) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.fbp, 255)
      ? { fbp: sanitizeAttribution(input.fbp, 255) }
      : {}),
    ...(allowClickIds && sanitizeAttribution(input.fbc, 255)
      ? { fbc: sanitizeAttribution(input.fbc, 255) }
      : {}),
    ...(sanitizeAttribution(input.referrer, 255)
      ? { referrer: sanitizeAttribution(input.referrer, 255) }
      : {}),
    ...(sanitizeAttribution(input.landingPath, 255)
      ? { landingPath: sanitizeAttribution(input.landingPath, 255) }
      : {}),
    ...(gpc !== undefined ? { gpc } : {}),
    ...(optOut !== undefined ? { optOut } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}
function configuredDispatchMode(): "auto" | "manual_release" {
  return process.env.WEDDING_DISPATCH_MODE === "manual_release"
    ? "manual_release"
    : "auto";
}
function checkoutDestination(
  country: string,
  paymentMode?: "live" | "stripe_test",
) {
  const dest = getSupplierCountry(country);
  const resolvedMode =
    paymentMode ??
    resolveWeddingPaymentRuntime()?.paymentMode ??
    (isWeddingStagingRuntime() ? "stripe_test" : "live");
  const policy = authorizeInternationalCheckout({
    countryCode: country,
    addressDeferred: false,
    paymentMode: resolvedMode,
  });
  if (!dest || dest.suspended || !policy.allowed)
    throw new WeddingCheckoutError("Review the destination before purchasing.");
  return dest;
}
function validatedAddress(
  a: WeddingHousehold["address"],
  firstName: string,
  lastName: string,
) {
  if (
    !a ||
    !firstName?.trim() ||
    [...firstName].length > 80 ||
    [...(lastName || "")].length > 80 ||
    !a.zip?.trim()
  ) {
    throw new WeddingCheckoutError(
      "Confirm the envelope name and postal address.",
    );
  }
  const dest = checkoutDestination(a.country);
  const address = {
    firstName,
    lastName: lastName || "",
    street1: a.address1,
    street2: a.address2 || "",
    city: a.city,
    state: a.state || "",
    zip: a.zip,
    country: dest.countryCode,
  };
  const result = validateMailingAddress(address);
  if (!result.valid) throw new WeddingCheckoutError(result.errors[0]);
  return { address, supplierCountryId: dest.supplierCountryId };
}
function freezeCard(
  project: Project,
  row: WeddingHousehold,
  expectedRevision: number,
) {
  if (
    row.revision !== expectedRevision ||
    row.paidBatchId ||
    project.paidHouseholds?.[row.id] ||
    !row.addressConfirmed ||
    row.excluded ||
    !weddingRowReady(project, row)
  )
    throw new WeddingCheckoutError(
      "A selected card changed or needs review. Refresh the selection.",
    );
  const note = resolveWeddingNote(project, row);
  const fit = analyzeHandwryttenFit(note, project.handwriting);
  if (!fit.normalizedText.trim() || !fit.fits)
    throw new WeddingCheckoutError(
      fit.issues[0] || "Review the complete note before paying.",
    );
  const sender = project.returnAddress;
  if (sender?.country !== "US")
    throw new WeddingCheckoutError(
      "Add your personal United States return address.",
    );
  const recipient = validatedAddress(row.address, row.firstName, row.lastName);
  const returnAddress = validatedAddress(
    sender,
    sender.firstName,
    sender.lastName,
  ).address;
  if (!project.cover?.id || !project.handwriting)
    throw new WeddingCheckoutError("Choose the card and handwriting.");
  return {
    householdId: row.id,
    revision: row.revision,
    envelopeName: row.envelopeName,
    recipient,
    returnAddress,
    note,
    handwriting: project.handwriting,
    cover: project.cover,
    approvedFingerprint: row.approvedFingerprint,
  };
}
async function fetchBatch(
  tx: Transaction,
  id: string,
  projectId?: string,
): Promise<Batch> {
  const b = (await tx.get(weddingBatchRef(id))).data() as Batch | undefined;
  if (!b || (projectId && b.projectId !== projectId))
    throw new WeddingCheckoutError("Batch not found.", 404);
  return b;
}
function publicBatch(b: Batch) {
  const runtime = resolveWeddingPaymentRuntime();
  return {
    batchId: b.id,
    status: b.status,
    quote: b.quote,
    count: b.quote.count,
    preparedCount: b.preparedCount,
    completedCount: b.completedCount,
    expiresAt: b.expiresAt,
    capturedCents: b.capturedCents,
    refundedCents: b.refundedCents,
    checkoutEnabled: weddingCheckoutEnabled(),
    paymentMode:
      b.paymentMode ||
      runtime?.paymentMode ||
      (isWeddingStagingRuntime() ? "stripe_test" : "live"),
    stagingReviewOnly: runtime ? runtime.stagingReviewOnly : isWeddingStagingRuntime(),
    buyerEmail: b.buyerEmail || null,
    dispatchStatus: b.dispatchStatus || null,
    dispatchMode: b.dispatchMode || configuredDispatchMode(),
  };
}
function assertBatchPayer(b: Batch, actor: Payer) {
  if (b.actorId !== actor.actorId)
    throw new WeddingCheckoutError(
      "This checkout is reserved by another project member. The owner can cancel it.",
      409,
    );
}
export async function quoteWeddingSelection(
  actor: Payer,
  selection: Selection[],
  reserveHash?: string,
  promotionCode?: string | { issuedId: string },
  options?: { buyerEmail?: unknown; attribution?: unknown },
) {
  const runtime = reserveHash !== undefined ? requirePurchasing() : resolveWeddingPaymentRuntime();
  const buyerEmail = normalizeBuyerEmail(options?.buyerEmail);
  const batchId = "wb_" + randomUUID();
  return firestoreDb.runTransaction(async (tx) => {
    const ref = projectRef(actor.projectId);
    const project = (await tx.get(ref)).data() as Project | undefined;
    if (!project) throw new WeddingCheckoutError("Project not found.", 404);
    if (project.expiresAt <= Date.now())
      throw new WeddingCheckoutError(
        "Extend your project before reserving a new checkout.",
        410,
      );
    await assertWeddingActorInTransaction(
      tx,
      actor,
      reserveHash !== undefined ? "pay" : "edit",
    );
    const existing =
      project.activeBatchId && reserveHash !== undefined
        ? await fetchBatch(tx, project.activeBatchId, actor.projectId)
        : null;
    if (existing) {
      assertBatchPayer(existing, actor);
      if (existing.quote.id !== reserveHash)
        throw new WeddingCheckoutError(
          "Finish or cancel the existing checkout first.",
        );
      return publicBatch(existing);
    }
    const docs = await Promise.all(
      selection.map((s) => tx.get(ref.collection("households").doc(s.id))),
    );
    const lines = docs.map((snap, i) => {
      if (!snap.exists)
        throw new WeddingCheckoutError("A selected household is missing.");
      const row = { ...snap.data(), id: snap.id } as WeddingHousehold;
      const card = freezeCard(project, row, selection[i].revision);
      return {
        id: row.id,
        revision: row.revision,
        country: card.recipient.address.country,
        region: row.address.state || "",
        postal: row.address.zip,
        contentHash: digest(card),
      };
    });
    const baseQuote = priceWeddingSelection(
      actor.projectId,
      project.purchasedCount || 0,
      lines,
    );
    const promoted = promotionCode
      ? await prepareWeddingPromotion(tx, actor, baseQuote, promotionCode)
      : null;
    const quote = promoted?.quote ?? baseQuote;
    if (reserveHash === undefined)
      return {
        quote,
        checkoutEnabled: weddingCheckoutEnabled(),
        paymentMode: runtime?.paymentMode || (isWeddingStagingRuntime() ? "stripe_test" : "live"),
        stagingReviewOnly: runtime ? runtime.stagingReviewOnly : isWeddingStagingRuntime(),
        dispatchMode: configuredDispatchMode(),
      };
    if (quote.id !== reserveHash)
      throw new WeddingCheckoutError(
        "Your batch changed. Review the updated total before paying.",
        409,
        "review_quote",
      );
    const now = Date.now();
    const attribution = sanitizeWeddingAttribution(
      options?.attribution ?? (project as { attribution?: unknown }).attribution,
    );
    const batch: Batch = {
      id: batchId,
      projectId: actor.projectId,
      actorId: actor.actorId,
      status: "preparing",
      quote,
      createdAt: now,
      expiresAt: now + HOUR,
      preparedCount: 0,
      completedCount: 0,
      paymentIntentId: null,
      issueAt: null,
      capturedCents: 0,
      refundedCents: 0,
      refundReservedCents: 0,
      dueAt: now + HOUR,
      paymentMode: runtime!.paymentMode,
      storageEnv: runtime!.storageEnv,
      dispatchMode: configuredDispatchMode(),
      ...(buyerEmail ? { buyerEmail } : {}),
      ...(attribution ? { attribution } : {}),
    };
    if (promoted) {
      promoted.reserve();
      batch.promotionDeltas = promoted.deltas;
    }
    tx.create(weddingBatchRef(batchId), batch);
    tx.update(ref, {
      activeBatchId: batchId,
      activeHouseholdIds: selection.map((s) => s.id),
      checkoutActorId: actor.actorId,
      checkoutRevocationRequestedFor: null,
      paymentReconciliationRequired: false,
    });
    return publicBatch(batch);
  });
}
function chunkHash(lines: WeddingQuoteLine[]) {
  return digest(
    lines.map((l) => [l.householdId, l.ordinal, l.contentHash, l.totalCents]),
  );
}
function assertReserved(project: Project, b: Batch) {
  if (
    project.activeBatchId !== b.id ||
    project.paymentReconciliationRequired ||
    project.checkoutRevocationRequestedFor === b.actorId ||
    Date.now() >= b.expiresAt
  )
    throw new WeddingCheckoutError(
      "This reservation expired or payment permission changed. Cancel and review the cards again.",
    );
}
export async function advanceWeddingPreparation(actor: Payer, id: string) {
  requirePurchasing();
  return firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor.projectId);
    const ref = projectRef(b.projectId);
    const p = (await tx.get(ref)).data() as Project;
    await assertWeddingActorInTransaction(tx, actor, "pay");
    assertBatchPayer(b, actor);
    if (b.status !== "preparing") return publicBatch(b);
    assertReserved(p, b);
    const group = b.quote.lines.slice(b.preparedCount, b.preparedCount + CHUNK);
    const rows = await Promise.all(
      group.map((l) => tx.get(ref.collection("households").doc(l.householdId))),
    );
    const cards = rows.map((snap, i) => {
      if (!snap.exists)
        throw new WeddingCheckoutError("A selected card is missing.");
      const card = freezeCard(
        p,
        { ...snap.data(), id: snap.id } as WeddingHousehold,
        group[i].expectedRevision,
      );
      if (digest(card) !== group[i].contentHash)
        throw new WeddingCheckoutError(
          "Card details changed. Cancel this batch and review again.",
        );
      return card;
    });
    const batchRef = weddingBatchRef(id);
    const updated = { ...b, preparedCount: b.preparedCount + group.length };
    const chunk = Math.floor(b.preparedCount / CHUNK);
    if (updated.preparedCount === b.quote.count) {
      const markers = await Promise.all(
        Array.from({ length: chunk }, (_, i) =>
          tx.get(batchRef.collection("chunks").doc(String(i))),
        ),
      );
      if (
        markers.some(
          (m, i) =>
            m.data()?.hash !==
            chunkHash(b.quote.lines.slice(i * CHUNK, (i + 1) * CHUNK)),
        )
      )
        throw new WeddingCheckoutError(
          "The batch preparation needs reconciliation.",
        );
      updated.status = "ready";
    }
    cards.forEach((card, i) =>
      tx.create(batchRef.collection("cards").doc(card.householdId), {
        card,
        line: group[i],
        refundStatus: null,
      }),
    );
    tx.create(batchRef.collection("chunks").doc(String(chunk)), {
      hash: chunkHash(group),
      count: group.length,
    });
    tx.update(batchRef, {
      preparedCount: updated.preparedCount,
      status: updated.status,
    });
    return publicBatch(updated);
  });
}
export async function getWeddingBatch(actor: Payer, id: string) {
  return firestoreDb.runTransaction(async (tx) => {
    await assertWeddingActorInTransaction(tx, actor, "edit");
    return publicBatch(await fetchBatch(tx, id, actor.projectId));
  });
}
/** Only paid immutable revisions are exposed here. Object keys stay server-side. */
export async function getPaidWeddingCard(
  actor: Payer,
  batchId: string,
  householdId: string,
) {
  return firestoreDb.runTransaction(async (tx) => {
    await assertWeddingActorInTransaction(tx, actor, "edit");
    const b = await fetchBatch(tx, batchId, actor.projectId);
    if (b.status !== "held")
      throw new WeddingCheckoutError("This card has no paid snapshot.", 404);
    const child = (
      await tx.get(
        weddingBatchRef(batchId).collection("cards").doc(safeId(householdId)),
      )
    ).data();
    if (!child || child.card?.householdId !== householdId)
      throw new WeddingCheckoutError("Card not found.", 404);
    const { cover, ...card } = child.card;
    const url = b.artPin
      ? "/api/wedding/checkout?art=" + encodeURIComponent(batchId)
      : cover.url;
    return {
      card: { ...card, cover: { kind: cover.kind, id: cover.id, url } },
      line: child.line,
      refundStatus: child.refundStatus,
    };
  });
}
export async function readPaidWeddingCover(actor: Payer, batchId: string) {
  const { pin, storageEnv } = await firestoreDb.runTransaction(async (tx) => {
    await assertWeddingActorInTransaction(tx, actor, "edit");
    const b = await fetchBatch(tx, batchId, actor.projectId);
    if (b.status !== "held" || !b.artPin)
      throw new WeddingCheckoutError("Card front not found.", 404);
    return {
      pin: b.artPin,
      storageEnv: b.storageEnv || weddingStorageEnvironment(),
    };
  });
  const { weddingArtworkObjects, artworkSha, artworkProjectSegment } =
    await import("./artwork-storage");
  const { ARTWORK_LIMITS } = await import("./artwork-policy");
  const expectedKey =
    `wedding-paid-retained/${storageEnv}/` +
    artworkProjectSegment(actor.projectId) +
    "/" +
    batchId +
    ".png";
  if (pin.storageKey !== expectedKey)
    throw new WeddingCheckoutError("Card front could not be verified.");
  const bytes = await weddingArtworkObjects.read(
    pin.storageKey,
    ARTWORK_LIMITS.outputBytes,
  );
  if (artworkSha(bytes) !== pin.sha256)
    throw new WeddingCheckoutError("Card front could not be verified.");
  return bytes;
}
const clearLock = {
  activeBatchId: null,
  activeHouseholdIds: [],
  checkoutActorId: null,
  checkoutRevocationRequestedFor: null,
  paymentReconciliationRequired: false,
};
export function checkWeddingIntent(
  b: Batch,
  pi: Stripe.PaymentIntent,
  expectedLivemode?: boolean,
) {
  const livemode =
    expectedLivemode ??
    (b.paymentMode
      ? b.paymentMode === "live"
      : (resolveWeddingPaymentRuntime()?.expectedLivemode ?? false));
  if (
    pi.livemode !== livemode ||
    pi.metadata?.weddingBatchId !== b.id ||
    pi.metadata?.weddingQuoteId !== b.quote.id ||
    pi.amount !== b.quote.totalCents ||
    pi.currency !== "usd" ||
    (b.paymentIntentId && b.paymentIntentId !== pi.id)
  )
    throw new WeddingCheckoutError(
      "Payment evidence does not match this frozen batch.",
    );
}
async function retrieveOrCreate(b: Batch) {
  const runtime = requirePaymentRuntime();
  if (b.paymentMode && b.paymentMode !== runtime.paymentMode) {
    throw new WeddingCheckoutError(
      "Payment mode does not match this frozen batch.",
      409,
    );
  }
  const sdk = getStripeClient();
  if (b.paymentIntentId) return sdk.paymentIntents.retrieve(b.paymentIntentId);
  if (!b.issueAt || Date.now() - b.issueAt > 23 * HOUR)
    throw new WeddingCheckoutError(
      "Payment outcome requires processor reconciliation.",
    );
  return sdk.paymentIntents.create(
    {
      amount: b.quote.totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      ...(b.buyerEmail ? { receipt_email: b.buyerEmail } : {}),
      metadata: { weddingBatchId: b.id, weddingQuoteId: b.quote.id },
    },
    { idempotencyKey: "wedding-pay-" + b.id },
  );
}
export async function issueWeddingIntent(
  actor: Payer,
  id: string,
  options?: { buyerEmail?: unknown },
) {
  const runtime = requirePurchasing();
  const buyerEmail = normalizeBuyerEmail(options?.buyerEmail);
  const publishableKey = (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  if (!publishableKey.startsWith(runtime.publishableKeyPrefix))
    throw new WeddingCheckoutError("Payment setup is incomplete.", 503);
  const b = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor.projectId),
      ref = projectRef(b.projectId);
    const p = (await tx.get(ref)).data() as Project;
    await assertWeddingActorInTransaction(tx, actor, "pay");
    assertBatchPayer(b, actor);
    assertReserved(p, b);
    if (!["ready", "issuing", "awaiting_payment"].includes(b.status))
      throw new WeddingCheckoutError(
        "Finish preparing this batch before paying.",
      );
    for (const line of b.quote.lines) {
      checkoutDestination(line.country, b.paymentMode || runtime.paymentMode);
      if (line.expiresAt && line.expiresAt <= Date.now())
        throw new WeddingCheckoutError("Refresh the tax quote.");
    }
    return { batch: b, cover: p.cover };
  });
  let artPin = b.batch.artPin || null;
  if (b.cover.kind === "upload" && !artPin) {
    const { pinWeddingCover } = await import("./artwork");
    artPin = await pinWeddingCover(actor.projectId, b.cover.id, id);
    if (!b.cover.hash || b.cover.hash !== artPin.sha256)
      throw new WeddingCheckoutError(
        "The accepted artwork changed. Review the cover again.",
      );
  }
  const issuing = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor.projectId);
    const p = (await tx.get(projectRef(b.projectId))).data() as Project;
    await assertWeddingActorInTransaction(tx, actor, "pay");
    assertBatchPayer(b, actor);
    assertReserved(p, b);
    if (!["ready", "issuing", "awaiting_payment"].includes(b.status))
      throw new WeddingCheckoutError("This batch has changed.");
    if (b.paymentMode && b.paymentMode !== runtime.paymentMode)
      throw new WeddingCheckoutError("Payment mode mismatch for this batch.");
    if (b.status !== "ready") {
      if (buyerEmail && buyerEmail !== b.buyerEmail && !b.paymentIntentId) {
        tx.update(weddingBatchRef(id), { buyerEmail });
        return { ...b, buyerEmail };
      }
      return b;
    }
    const issueAt = Date.now();
    const resolvedEmail = buyerEmail ?? b.buyerEmail ?? null;
    tx.update(weddingBatchRef(id), {
      status: "issuing",
      issueAt,
      artPin,
      paymentMode: b.paymentMode || runtime.paymentMode,
      storageEnv: b.storageEnv || runtime.storageEnv,
      ...(resolvedEmail ? { buyerEmail: resolvedEmail } : {}),
      dueAt: issueAt + 60000,
    });
    return {
      ...b,
      status: "issuing" as const,
      issueAt,
      artPin,
      paymentMode: b.paymentMode || runtime.paymentMode,
      storageEnv: b.storageEnv || runtime.storageEnv,
      ...(resolvedEmail ? { buyerEmail: resolvedEmail } : {}),
    };
  });
  const pi = await retrieveOrCreate(issuing);
  checkWeddingIntent(issuing, pi);
  if (pi.status === "succeeded") {
    await settleWeddingIntent(pi);
    return getWeddingBatch(actor, id);
  }
  const result = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor.projectId);
    const p = (await tx.get(projectRef(b.projectId))).data() as Project;
    await assertWeddingActorInTransaction(tx, actor, "pay");
    assertBatchPayer(b, actor);
    assertReserved(p, b);
    if (
      !["issuing", "awaiting_payment"].includes(b.status) ||
      !pi.client_secret ||
      pi.status === "canceled"
    )
      throw new WeddingCheckoutError("This payment is unavailable.");
    const updated = {
      ...b,
      status: "awaiting_payment" as const,
      paymentIntentId: pi.id,
    };
    tx.update(weddingBatchRef(id), {
      status: updated.status,
      paymentIntentId: pi.id,
      dueAt: Date.now() + 60000,
    });
    return publicBatch(updated);
  });
  return { ...result, clientSecret: pi.client_secret, publishableKey };
}
async function maybeSendWeddingConfirmationEmail(batchId: string) {
  try {
    const { sendWeddingBatchConfirmationEmail } = await import("./email");
    await sendWeddingBatchConfirmationEmail(batchId);
  } catch (err) {
    console.warn("[Wedding Email] Fail-soft confirmation email notice:", err);
  }
}

async function maybeSendWeddingPurchaseConversion(b: Batch) {
  if (b.paymentMode !== "live" || b.metaCapiSentAt) return;
  try {
    const claimed = await firestoreDb.runTransaction(async (tx) => {
      const ref = weddingBatchRef(b.id);
      const snap = await tx.get(ref);
      const current = snap.data() as Batch | undefined;
      if (!current || current.metaCapiSentAt) return false;
      tx.update(ref, { metaCapiSentAt: Date.now() });
      return true;
    });
    if (!claimed) return;
    const { sendWeddingPurchaseConversion } = await import("./attribution");
    const res = await sendWeddingPurchaseConversion({
      batchId: b.id,
      capturedCents: b.capturedCents,
      count: b.quote.count,
      buyerEmail: b.buyerEmail ?? null,
      attribution: (b.attribution as Record<string, unknown> | null) ?? null,
      livemode: b.paymentMode === "live",
    });
    if (!res.sent && (res.reason === "api_error" || res.reason === "network_error")) {
      await weddingBatchRef(b.id).update({ metaCapiSentAt: null }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Wedding Attribution] Fail-soft Meta CAPI notice:", err);
  }
}

export async function settleWeddingIntent(pi: Stripe.PaymentIntent) {
  const runtime = requirePaymentRuntime();
  const id = safeId(pi.metadata?.weddingBatchId);
  const settledBatch = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id);
    const expectedLivemode = b.paymentMode
      ? b.paymentMode === "live"
      : runtime.expectedLivemode;
    if (expectedLivemode !== runtime.expectedLivemode) {
      throw new WeddingCheckoutError(
        "Payment mode mismatch for this wedding batch.",
      );
    }
    checkWeddingIntent(b, pi, expectedLivemode);
    if (pi.status !== "succeeded" || pi.amount_received !== b.quote.totalCents)
      throw new WeddingCheckoutError("Payment has not settled in full.");
    if (b.status === "held" && b.paymentIntentId === pi.id) return b;
    const ref = projectRef(b.projectId),
      p = (await tx.get(ref)).data() as Project;
    if (
      !["issuing", "awaiting_payment", "canceling"].includes(b.status) ||
      !b.issueAt ||
      b.preparedCount !== b.quote.count ||
      p.activeBatchId !== id ||
      (p.purchasedCount || 0) !== b.quote.previouslyPurchased
    )
      throw new WeddingCheckoutError("Hold this payment for reconciliation.");
    const paidHouseholds = { ...(p.paidHouseholds || {}) };
    for (const l of b.quote.lines) {
      if (paidHouseholds[l.householdId])
        throw new WeddingCheckoutError(
          "A paid household needs reconciliation.",
        );
      paidHouseholds[l.householdId] = id;
    }
    await finalizeWeddingPromotion(tx, b, "consume", pi.id);
    tx.update(ref, {
      ...clearLock,
      purchasedCount: b.quote.previouslyPurchased + b.quote.count,
      paidHouseholds,
    });
    const settledAt = Date.now();
    tx.update(weddingBatchRef(id), {
      status: "held",
      paymentIntentId: pi.id,
      capturedCents: pi.amount_received,
      settledAt,
      dueAt: settledAt,
      paymentMode: b.paymentMode || runtime.paymentMode,
      storageEnv: b.storageEnv || runtime.storageEnv,
    });
    return {
      ...b,
      status: "held" as const,
      paymentIntentId: pi.id,
      capturedCents: pi.amount_received,
      settledAt,
      paymentMode: b.paymentMode || runtime.paymentMode,
      storageEnv: b.storageEnv || runtime.storageEnv,
    };
  });
  await recordVerifiedWeddingCapture(settledBatch, pi.id, pi.amount_received);
  await maybeSendWeddingConfirmationEmail(id);
  await maybeSendWeddingPurchaseConversion(settledBatch);
}

async function recordVerifiedWeddingCapture(
  b: Batch,
  intentId: string,
  cents: number,
) {
  const isLive = b.paymentMode === "live";
  const commercialKind: CommercialKind = isLive
    ? b.quote.promotion
      ? "discounted_paid"
      : "paid_customer"
    : "founder_test";
  await recordPaymentCaptureFact({
    paymentIntentId: intentId,
    operationId: b.id,
    amountCents: cents,
    currency: "usd",
    livemode: isLive,
    commercialKind,
  });
}

export async function confirmWeddingPayment(actor: Payer, id: string) {
  requirePaymentRuntime();
  const b = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor.projectId);
    await assertWeddingActorInTransaction(tx, actor, "pay");
    return b;
  });
  if (b.status !== "held") {
    if (!b.paymentIntentId)
      throw new WeddingCheckoutError(
        "This checkout has no payment to confirm.",
      );
    await settleWeddingIntent(
      await getStripeClient().paymentIntents.retrieve(b.paymentIntentId),
    );
  }
  await materializeHeldCards(id);
  return getWeddingBatch(actor, id);
}
async function materializeHeldCards(id: string) {
  // Replays close the gap if the process stopped after the ordinal ledger
  // committed but before the shared payment fact was written.
  const held = (await weddingBatchRef(id).get()).data() as Batch;
  if (held.status !== "held" || !held.paymentIntentId) return;
  await recordVerifiedWeddingCapture(
    held,
    held.paymentIntentId,
    held.capturedCents,
  );
  const stagingTestDispatch =
    process.env.WEDDING_STAGING_HANDWRYTTEN_TEST_DISPATCH === "true" &&
    process.env.HANDWRYTTEN_TEST_MODE === "true";
  const dispatchEligible =
    held.paymentMode === "live" || stagingTestDispatch;

  const finished = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id);
    if (b.status !== "held" || b.completedCount >= b.quote.count) return false;
    const group = b.quote.lines.slice(
      b.completedCount,
      b.completedCount + CHUNK,
    );
    const ref = projectRef(b.projectId);
    for (const l of group) {
      const country = getSupplierCountry(l.country);
      const reason =
        !country || country.suspended
          ? "destination_review"
          : dispatchEligible
          ? "awaiting_enqueue"
          : "staging_review";
      tx.update(ref.collection("households").doc(l.householdId), {
        paidBatchId: id,
        paymentStatus: "held",
        holdReason: reason,
      });
      tx.set(weddingBatchRef(id).collection("deliveries").doc(l.householdId), {
        householdId: l.householdId,
        ordinal: l.ordinal,
        contentHash: l.contentHash,
        status: "held",
        holdReason: reason,
      });
    }
    const completedCount = b.completedCount + group.length;
    tx.update(weddingBatchRef(id), {
      completedCount,
      dueAt: completedCount === b.quote.count ? null : Date.now() + 1,
    });
    return completedCount === b.quote.count;
  });

  if (finished) {
    await maybeSendWeddingConfirmationEmail(id);
    if (dispatchEligible) {
      try {
        const { enqueueWeddingBatchDispatch } = await import("./dispatch");
        await enqueueWeddingBatchDispatch(id);
      } catch (err) {
        console.warn("[Wedding Dispatch] Enqueue notice after materialization:", err);
      }
    }
  }
}

async function closeReservation(id: string, actor?: Payer) {
  const b = await firestoreDb.runTransaction(async (tx) => {
    const b = await fetchBatch(tx, id, actor?.projectId);
    const p = (await tx.get(projectRef(b.projectId))).data() as Project;
    if (actor) {
      await assertWeddingActorInTransaction(tx, actor, "pay");
      if (actor.role !== "owner") assertBatchPayer(b, actor);
    }
    if (b.status === "held" || b.status === "canceled") return b;
    if (p.activeBatchId !== id)
      throw new WeddingCheckoutError("Reservation requires review.");
    if (!b.issueAt) {
      await finalizeWeddingPromotion(tx, b, "release");
      tx.update(projectRef(b.projectId), clearLock);
      tx.update(weddingBatchRef(id), { status: "canceled", dueAt: null });
      return { ...b, status: "canceled" as const };
    }
    tx.update(weddingBatchRef(id), { status: "canceling", dueAt: Date.now() });
    return { ...b, status: "canceling" as const };
  });
  if (b.status !== "canceling") return publicBatch(b);
  const sdk = getStripeClient();
  let pi = await retrieveOrCreate(b);
  checkWeddingIntent(b, pi);
  if (pi.status !== "succeeded" && pi.status !== "canceled") {
    try {
      pi = await sdk.paymentIntents.cancel(
        pi.id,
        {},
        { idempotencyKey: "wedding-cancel-" + id },
      );
    } catch {
      pi = await sdk.paymentIntents.retrieve(pi.id);
    }
  }
  checkWeddingIntent(b, pi);
  if (pi.status === "succeeded") await settleWeddingIntent(pi);
  else if (pi.status === "canceled") {
    await firestoreDb.runTransaction(async (tx) => {
      const latest = await fetchBatch(tx, id);
      const p = (await tx.get(projectRef(b.projectId))).data() as Project;
      if (latest.status === "canceled") return;
      if (latest.status !== "canceling" || p.activeBatchId !== id)
        throw new WeddingCheckoutError("Cancellation requires review.");
      await finalizeWeddingPromotion(tx, latest, "release");
      tx.update(projectRef(b.projectId), clearLock);
      tx.update(weddingBatchRef(id), {
        status: "canceled",
        paymentIntentId: pi.id,
        dueAt: null,
      });
    });
  } else
    throw new WeddingCheckoutError(
      "Payment is still processing. This reservation is held for reconciliation.",
    );
  return publicBatch((await weddingBatchRef(id).get()).data() as Batch);
}
export async function cancelWeddingBatch(actor: Payer, id: string) {
  requirePaymentRuntime();
  return closeReservation(id, actor);
}
export async function reconcileWeddingRevocation(
  projectId: string,
  actorId: string,
) {
  if (!resolveWeddingPaymentRuntime()) return;
  const p = (await projectRef(projectId).get()).data();
  if (p?.checkoutActorId === actorId && p.activeBatchId)
    await closeReservation(p.activeBatchId);
}
async function reconcileDueBatch(id: string) {
  const b = (await weddingBatchRef(id).get()).data() as Batch;
  if (b.status === "held") {
    await materializeHeldCards(id);
    return;
  }
  if (b.status === "canceled" || b.status === "reconciliation") return;
  const ref = projectRef(b.projectId),
    p = (await ref.get()).data() as Project;
  const m =
    b.actorId === p.ownerId
      ? null
      : (await ref.collection("members").doc(b.actorId).get()).data();
  if (
    b.status === "canceling" ||
    b.expiresAt <= Date.now() ||
    p.paymentReconciliationRequired ||
    p.checkoutRevocationRequestedFor === b.actorId ||
    (b.actorId !== p.ownerId && (!m?.canPay || m.revoked))
  ) {
    await closeReservation(id);
    return;
  }
  if (!b.issueAt) return;
  const pi = await retrieveOrCreate(b);
  checkWeddingIntent(b, pi);
  if (pi.status === "succeeded") {
    await settleWeddingIntent(pi);
    await materializeHeldCards(id);
    return;
  }
  if (pi.status === "canceled") {
    await closeReservation(id);
    return;
  }
  await firestoreDb.runTransaction(async (tx) => {
    const latest = await fetchBatch(tx, id);
    if (["issuing", "awaiting_payment"].includes(latest.status))
      tx.update(weddingBatchRef(id), {
        paymentIntentId: pi.id,
        status: "awaiting_payment",
        dueAt: Date.now() + 60000,
      });
  });
}
export async function runWeddingReconciliation() {
  if (!resolveWeddingPaymentRuntime()) return { visited: 0, deferred: 0 };
  const now = Date.now();
  // Single-field range index excludes null via the numeric lower bound. Every visited
  // parent advances at most one chunk before returning to the back of the due queue.
  const due = await firestoreDb
    .collection("weddingBatches")
    .where("dueAt", ">", 0)
    .where("dueAt", "<=", now)
    .orderBy("dueAt", "asc")
    .limit(4)
    .get();
  let deferred = 0;
  await Promise.all(
    due.docs.map(async (doc) => {
      try {
        await reconcileDueBatch(doc.id);
      } catch {
        deferred++;
        await firestoreDb.runTransaction(async (tx) => {
          const b = await fetchBatch(tx, doc.id);
          if (b.dueAt !== null && b.dueAt !== undefined && b.dueAt <= now)
            tx.update(weddingBatchRef(b.id), {
              dueAt: Date.now() + 300000,
              lastFailure: "reconciliation_required",
            });
        });
      }
    }),
  );
  return { visited: due.size, deferred };
}
