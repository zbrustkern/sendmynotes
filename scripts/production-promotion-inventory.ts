import assert from "node:assert/strict";
import { firestoreDb, isFirestoreMock } from "../lib/firebase-admin";
import { offerBalanceRef, offerCutoverRef, legacyOfferBaselineRef } from "../lib/offer-balances";
import { frozenOfferTotal, legacySpentBaseline, readLegacyOffer, readOfferHold } from "../lib/offer-engine";
import { getOperationalControls } from "../lib/operational-controls";
import type { OfferPriceQuoteSnapshot } from "../lib/contracts/admin-overhaul";
import type { Order } from "../lib/types";

const project = "sendmynotes-2a417";
const valid = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
async function inventory() {
  assert.equal(process.env.FIREBASE_PROJECT_ID, project);
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !isFirestoreMock);
  const [codes, versions, holds, state, controls] = await Promise.all([
    firestoreDb.collection("discount_codes").select("perCustomerLimit").get(),
    firestoreDb.collection("offer_versions").select("code", "version", "perCustomerLimit").get(),
    firestoreDb.collection("offer_reservations").where("status", "==", "active").get(),
    offerCutoverRef().get(), getOperationalControls(),
  ]);
  const names = new Set(codes.docs.map(doc => doc.id.trim().toUpperCase()));
  for (const doc of versions.docs) if (doc.get("version") === 1 && typeof doc.get("code") === "string") names.add(doc.get("code").trim().toUpperCase());
  const rows = [];
  for (const name of names) {
    rows.push(await firestoreDb.runTransaction(async tx => {
      const legacy = await readLegacyOffer(tx, name);
      const [balance, checkpoint, reds] = await Promise.all([
        tx.get(offerBalanceRef("code", name)), tx.get(legacyOfferBaselineRef(name)),
        tx.get(firestoreDb.collection("offer_redemptions").where("offerId", "==", legacy.offer?.offerId ?? "unavailable").select("discountAmountCents").limit(200)),
      ]);
      const prior = legacySpentBaseline(legacy);
      const values = reds.docs.map(doc => doc.get("discountAmountCents"));
      const sum = values.filter(valid).reduce((a, b) => a + b, 0);
      const mightIsolate = !!(prior.disagreements.length || balance.exists || !valid(prior.spentUses) || !valid(prior.spentCents) ||
        values.some(n => !valid(n)) || reds.size > prior.spentUses || sum > prior.spentCents);
      return {personal: Number(legacy.version?.perCustomerLimit ?? 0) > 0 || Number(codes.docs.find(doc => doc.id === name)?.get("perCustomerLimit") ?? 0) > 0,
        uses: Math.max(prior.spentUses, legacy.legacy?.usedCount ?? 0, reds.size), cents: Math.max(prior.spentCents, legacy.legacy?.totalDiscountGivenCents ?? 0, sum),
        disagreements: !!prior.disagreements.length, isolated: checkpoint.exists ? checkpoint.get("state") === "isolated" : mightIsolate,
        invalid: !legacy.offer || !/^[A-Z0-9_-]{2,80}$/.test(name), truncated: reds.size === 200 };
    }, {readOnly: true}));
  }
  const holdCounts = { active: holds.size, expired: 0, legacy: 0, potentialIsolation: 0, discountCents: 0, hasPaymentReference: 0 };
  for (const hold of holds.docs) {
    if (hold.get("expiresAt") <= Date.now()) holdCounts.expired++;
    if (hold.get("schemaVersion") === 2) continue;
    holdCounts.legacy++;
    const result = await firestoreDb.runTransaction(async tx => {
      const quoteId = hold.get("quoteId"), orderId = hold.get("orderId");
      if (!orderId || !quoteId) return { disputed: true, cents: 0, payment: false };
      const [q, o, r] = await Promise.all([
        tx.get(firestoreDb.collection("offer_quotes").doc(quoteId)), tx.get(firestoreDb.collection("orders").doc(orderId)),
        tx.get(firestoreDb.collection("offer_redemptions").doc("redemption_" + orderId)),
      ]);
      const quote = q.data() as OfferPriceQuoteSnapshot | undefined, order = o.data() as Order | undefined;
      const code = String(hold.get("code") || quote?.code || "").trim().toUpperCase();
      const other = await readOfferHold(tx, orderId, code);
      const bound = quote && quote.code === code && quote.offerId === hold.get("offerId") && quote.offerVersion === hold.get("offerVersion") &&
        valid(quote.discountAmountCents) && quote.discountAmountCents > 0 && names.has(code) && (!other?.exists || other.id === hold.id);
      const terminal = order && ["PROCESSING_HANDWRYTTEN", "MAILED", "AWAITING_RECIPIENT_ADDRESS", "DISPATCHING", "DISPATCH_UNCERTAIN"].includes(order.status);
      const total = order && quote ? frozenOfferTotal(quote, order.quote?.internationalSurchargeCents, order.multiSend?.recipients.length) : undefined;
      const matching = order && total === order.amountInCents && total === order.finalAmountInCents && order.discountAmountInCents === quote?.discountAmountCents && order.quoteId === quoteId && order.discountCode === code;
      return {disputed: !bound || (!r.exists && (terminal || !matching)), cents: quote?.discountAmountCents ?? 0, payment: !!order?.stripePaymentId};
    }, {readOnly: true});
    holdCounts.potentialIsolation += Number(result.disputed); holdCounts.discountCents += result.cents; holdCounts.hasPaymentReference += Number(result.payment);
  }
  console.log(JSON.stringify({project, asOf: new Date().toISOString(), checkoutPaused: controls.checkout.paused, cutover: state.get("state") ?? "pending",
    distinctCodes: names.size, personalLimitedCodes: rows.filter(r => r.personal).length,
    disputedLegacySources: rows.filter(r => r.disagreements).length, codesSubjectToIsolation: rows.filter(r => r.isolated).length,
    unsupportedCodes: rows.filter(r => r.invalid).length, truncatedRedemptionSamples: rows.filter(r => r.truncated).length,
    conservativeHistoricalUses: rows.reduce((s,r) => s+r.uses,0), conservativeHistoricalCents: rows.reduce((s,r) => s+r.cents,0), holds: holdCounts}, null, 2));
}
inventory().catch(e => {console.error("Production inventory failed", e.code || e.name); process.exitCode = 1;});
