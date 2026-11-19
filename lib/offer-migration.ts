import { firestoreDb, getDiscountCodesCollection, getOrdersCollection, sanitizeFirestoreData } from "./firebase-admin";
import { getOfferQuotesCollection, getOfferRedemptionsCollection, getOfferReservationsCollection, getOfferVersionsCollection, frozenOfferTotal, legacySpentBaseline, readLegacyOffer, readOfferHold, type OfferHold } from "./offer-engine";
import { offerBalance, offerBalanceRef, applyOfferCounterDeltas, legacyOfferBaselineRef, offerCutoverRef, promotionCounterDeltas } from "./offer-balances";
import type { OfferPriceQuoteSnapshot } from "./contracts/admin-overhaul";
import type { Order } from "./types";

const PAGE = 50;
const MIGRATION = "offer-cutover-v2";
const terminalOrders = new Set(["PROCESSING_HANDWRYTTEN", "MAILED", "AWAITING_RECIPIENT_ADDRESS", "DISPATCHING", "DISPATCH_UNCERTAIN"]);

async function fencedTransaction(tx: FirebaseFirestore.Transaction) {
  const snapshot = await tx.get(offerCutoverRef());
  if (snapshot.data()?.state !== "fenced") throw new Error("The promotion writer must be fenced during migration.");
}

async function seedLegacyCode(code: string, now: number) {
  return firestoreDb.runTransaction(async (tx) => {
    await fencedTransaction(tx);
    const checkpointRef = legacyOfferBaselineRef(code);
    const checkpoint = await tx.get(checkpointRef);
    if (checkpoint.exists) return checkpoint.data()?.state === "isolated" ? "isolated" : "prior";
    const legacy = await readLegacyOffer(tx, code);
    if (!legacy.offer) return "missing";
    const prior = legacySpentBaseline(legacy);
    const codeRef = offerBalanceRef("code", code);
    const campaignRef = offerBalanceRef("campaign", legacy.offer.campaignId || legacy.offer.offerId);
    const [codeBalance, campaignBalance, knownRedemptions] = await Promise.all([
      tx.get(codeRef), tx.get(campaignRef),
      tx.get(getOfferRedemptionsCollection().where("offerId", "==", legacy.offer.offerId).limit(200)),
    ]);
    const valid = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const knownDiscounts = knownRedemptions.docs.map((doc) => doc.data().discountAmountCents);
    const knownSpentCents = knownDiscounts.filter(valid).reduce((sum, value) => sum + value, 0);
    const sourceUses = [prior.spentUses, legacy.legacy?.usedCount].filter(valid);
    const sourceCents = [prior.spentCents, legacy.legacy?.totalDiscountGivenCents].filter(valid);
    const spentUses = Math.max(0, knownRedemptions.size, ...sourceUses);
    const spentCents = Math.max(0, knownSpentCents, ...sourceCents);
    const isolated = Boolean(prior.disagreements.length || codeBalance.exists || !valid(prior.spentUses) || !valid(prior.spentCents) ||
      knownDiscounts.some((value) => !valid(value)) || knownRedemptions.size > prior.spentUses || knownSpentCents > prior.spentCents);
    const campaign = offerBalance(campaignBalance.data());
    // A discrepancy blocks new holds. Keep conservative known exposure so a valid in-flight hold can still settle.
    if (!codeBalance.exists) {
      tx.set(codeRef, offerBalance({ spentUses, spentCents }));
      tx.set(campaignRef, offerBalance({
        ...campaign, spentUses: campaign.spentUses + spentUses, spentCents: campaign.spentCents + spentCents,
      }));
    } else if (!campaignBalance.exists) {
      tx.set(campaignRef, offerBalance({ spentUses, spentCents }));
    }
    tx.set(checkpointRef, {
      state: isolated ? "isolated" : "initialized", writer: MIGRATION, updatedAt: now, spentUses, spentCents,
      ...(isolated ? { reason: "legacy_counter_mismatch", disagreements: prior.disagreements } : {}),
    });
    return isolated ? "isolated" : "seeded";
  });
}

async function importLegacyHold(ref: FirebaseFirestore.DocumentReference, now: number) {
  return firestoreDb.runTransaction(async (tx) => {
    await fencedTransaction(tx);
    const current = (await tx.get(ref)).data() as OfferHold | undefined;
    if (!current || current.status !== "active" || current.schemaVersion === 2) return "prior";
    const quoteSnap = current.quoteId ? await tx.get(getOfferQuotesCollection().doc(current.quoteId)) : null;
    const quote = quoteSnap?.data() as OfferPriceQuoteSnapshot | undefined;
    const code = (current.code || quote?.code || "").trim().toUpperCase();
    const checkpointRef = code ? legacyOfferBaselineRef(code) : null;
    const checkpoint = checkpointRef ? await tx.get(checkpointRef) : null;
    const redemption = await tx.get(getOfferRedemptionsCollection().doc(`redemption_${current.orderId}`));
    const order = (await tx.get(getOrdersCollection().doc(current.orderId))).data() as Order | undefined;
    const existing = await readOfferHold(tx, current.orderId, code);
    const pointer = firestoreDb.collection("offer_order_holds").doc(current.orderId);

    const missingTerms = !quote || quote.code !== code || quote.offerId !== current.offerId ||
      quote.offerVersion !== current.offerVersion || !Number.isSafeInteger(quote.discountAmountCents) || quote.discountAmountCents <= 0;
    const recordConflict = existing?.exists && existing.ref.id !== ref.id;
    if (missingTerms || recordConflict || !checkpoint?.exists) {
      if (checkpointRef) tx.set(checkpointRef, { state: "isolated", reviewReason: "legacy_hold_mismatch", updatedAt: now }, { merge: true });
      tx.update(ref, { migrationIssue: "legacy_hold_mismatch", nextActionAt: current.expiresAt });
      return "isolated";
    }
    if (redemption.exists || (order && terminalOrders.has(order.status))) {
      if (!redemption.exists && checkpointRef) tx.set(checkpointRef, { state: "isolated", reviewReason: "paid_order_without_redemption", updatedAt: now }, { merge: true });
      tx.update(ref, { schemaVersion: 2, migratedAt: now, status: "consumed", nextActionAt: Number.MAX_SAFE_INTEGER });
      tx.set(pointer, { reservationId: ref.id });
      return redemption.exists ? "prior" : "isolated";
    }

    const legacy = await readLegacyOffer(tx, code);
    if (!legacy.offer || !quote) throw new Error("Legacy policy changed during the writer fence.");
    const codeRef = offerBalanceRef("code", code);
    const campaignRef = offerBalanceRef("campaign", legacy.offer.campaignId || legacy.offer.offerId);
    const [codeSnap, campaignSnap] = await Promise.all([tx.get(codeRef), tx.get(campaignRef)]);
    if (!codeSnap.exists || !campaignSnap.exists) throw new Error("Legacy offer balances are missing during migration.");
    const balances = [
      { kind: "code" as const, ref: codeRef, data: offerBalance(codeSnap.data()) },
      { kind: "campaign" as const, ref: campaignRef, data: offerBalance(campaignSnap.data()) },
    ];
    const total = order ? frozenOfferTotal(quote, order.quote?.internationalSurchargeCents, order.multiSend?.recipients.length) : undefined;
    const disputedTotal = Boolean(order && (order.amountInCents !== total || order.finalAmountInCents !== total ||
      order.discountAmountInCents !== quote.discountAmountCents || order.quoteId !== current.quoteId || order.discountCode !== code));
    const expiresAt = Math.min(current.expiresAt, quote.expiresAt);
    const deltas = promotionCounterDeltas(balances, quote.discountAmountCents, 1);
    applyOfferCounterDeltas(tx, deltas, new Map(balances.map((balance) => [balance.ref.id, balance])), "hold");
    tx.set(pointer, { reservationId: ref.id });
    tx.update(ref, sanitizeFirestoreData({
      schemaVersion: 2, migratedAt: now, deltas, expiresAt, nextActionAt: expiresAt, revision: 1,
      expectedTotalCents: disputedTotal ? undefined : total, discountCents: quote.discountAmountCents, currency: "USD",
      paymentIntentId: order?.stripePaymentId, paymentMode: order?.paymentMode,
      checkoutRevision: order?.multiSend?.contentRevision, legacyVersionId: legacy.versionRef.id,
      migrationIssue: disputedTotal || !order ? "legacy_order_binding_missing" : null,
    }));
    if ((disputedTotal || !order) && checkpointRef) tx.set(checkpointRef, { state: "isolated", reviewReason: "legacy_order_binding_missing", updatedAt: now }, { merge: true });
    return disputedTotal || !order ? "isolated" : "imported";
  });
}

async function paged(query: FirebaseFirestore.Query, callback: (doc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>) {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await (cursor ? query.startAfter(cursor) : query).limit(PAGE).get();
    for (const doc of page.docs) await callback(doc);
    if (page.size < PAGE) break;
    cursor = page.docs.at(-1);
  }
}

export async function runLegacyOfferCutover(options: { writerFenced: boolean; now?: number; finalize?: boolean }) {
  if (!options.writerFenced) throw new Error("Pause checkout and stop all legacy offer writers before cutover.");
  const now = options.now ?? Date.now();
  const ref = offerCutoverRef();
  const state = await firestoreDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (current?.state === "active") return "active";
    if (!current) tx.set(ref, { state: "fenced", startedAt: now, writer: MIGRATION });
    return "fenced";
  });
  if (state === "active") return { state, seeded: 0, imported: 0, isolated: 0 };

  const report = { state: "fenced", seeded: 0, imported: 0, isolated: 0 };
  const seen = new Set<string>();
  const seed = async (code: string) => {
    if (!/^[A-Z0-9_-]{2,80}$/.test(code) || seen.has(code)) return;
    seen.add(code);
    const outcome = await seedLegacyCode(code, now);
    if (outcome === "seeded") report.seeded++;
    if (outcome === "isolated") report.isolated++;
  };
  await paged(getDiscountCodesCollection().orderBy("__name__"), async (doc) => {
    await seed(doc.id.trim().toUpperCase());
  });
  await paged(getOfferVersionsCollection().orderBy("__name__"), async (doc) => {
    if (doc.data().version === 1 && typeof doc.data().code === "string") await seed(doc.data().code.trim().toUpperCase());
  });
  await paged(getOfferReservationsCollection().where("status", "==", "active").orderBy("__name__"), async (doc) => {
    const outcome = await importLegacyHold(doc.ref, now);
    if (outcome === "imported") report.imported++;
    if (outcome === "isolated") report.isolated++;
  });

  if (options.finalize) await firestoreDb.runTransaction(async (tx) => {
    await fencedTransaction(tx);
    tx.update(ref, { state: "active", cutoverAt: options.now ?? Date.now(), lastReport: report });
    report.state = "active";
  });
  return report;
}
