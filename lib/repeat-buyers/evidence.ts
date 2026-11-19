import { createHash } from "node:crypto";
import type { FinancialFactRecord } from "../contracts/admin-overhaul";
import type { ReportReconciliationEntry } from "../contracts/admin-measurement-report";
import type { DatedSpendRecord, SupplierCostAllocationRecord } from "../spend-and-cost-ledger";
import type { Order } from "../types";
import { effectiveOrderEmail, normalizeCheckoutEmail } from "../checkout-contact-policy";
import { classification, classifyLegacyOrder } from "../admin-measurement-report";
import { attributionCampaignKey } from "../attribution-classifier";
import type { Budget, CohortInput, Purchase } from "./contract";

export type Fact = FinancialFactRecord & { providerRefundStatus?: string; providerStatusObservedAt?: number };
export type Parent = Order & { commercialKind?: string; campaignId?: string; source?: string; refundStatus?: string; disputeStatus?: string; refundedAmountInCents?: number };
export type Period = {
  month: string; campaignKey: string; campaignLabel: string; business: string; reviewedAt: number;
  spendIds: string[]; creativeAndPartnerCents: number | null; creditCents: number | null;
  fullAcquisitionPeriod: boolean;
};
export type Census = {
  orders: Parent[]; reviews: ReportReconciliationEntry[]; facts: Fact[]; costs: SupplierCostAllocationRecord[];
  spend: DatedSpendRecord[]; periods: Period[]; deletedOwners: string[];
  incomplete: string[];
};
type SignalCounts = { coupon: number; googlePaid: number; both: number; unknownSource: number };
type SignalGroup = "independent" | "unresolved" | "family";
const noSignals = (): SignalCounts => ({coupon: 0, googlePaid: 0, both: 0, unknownSource: 0});
export type Coverage = {
  signals: Record<SignalGroup, SignalCounts>;
  verified: number; matchable: number; unresolved: number; friendsFamily: number;
  missingIdentity: number; openDisputes: number; unknownAdjustments: number; missingCosts: number;
  reasons: string[];
};
export const emptyCoverage = (): Coverage => ({ verified: 0, matchable: 0, unresolved: 0, friendsFamily: 0,
  signals: { independent: noSignals(), unresolved: noSignals(), family: noSignals() },
  missingIdentity: 0, openDisputes: 0, unknownAdjustments: 0, missingCosts: 0, reasons: [] });
const cents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const instant = (n: unknown): n is number => cents(n) && n > 0 && n < 8640000000000000;
const campaignId = (key: string) => "c-" + createHash("sha256").update(key).digest("hex").slice(0, 20);
const excludedKinds = new Set(["founder_test", "studio_comp", "admin_comp_balance", "free_promo"]);
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function restricted(order: Parent) {
  const a = order.attribution;
  const blocked = ["consent_denied", "gpc_restricted"];
  return order.isRedacted === true || a?.gpc === true || a?.optOut === true ||
    [a?.attributionV2?.firstObservedMissingReason, a?.attributionV2?.currentSessionMissingReason].some(r => r && blocked.includes(r));
}

function identity(order: Parent, allowed: boolean, makeKey: (email: string) => string): string | null {
  if (!allowed || restricted(order)) return null;
  const email = normalizeCheckoutEmail(effectiveOrderEmail(order));
  if (!email || /@(example\.(com|net|org)|[^@]*\.(test|invalid|example|local))$/i.test(email) ||
      /^(anonymous|no-?email|no-?reply|redacted|deleted|guest|placeholder)@/i.test(email)) return null;
  return makeKey(email);
}

function orderAttribution(order: Parent, withheld: boolean) {
  if (withheld || restricted(order)) return null;
  const a = order.attribution;
  return classifyLegacyOrder({ ...order, attribution: { source: a?.utmSource, medium: a?.utmMedium,
    campaign: a?.utmCampaign, attributionV2: a?.attributionV2, gclid: a?.gclid, wbraid: a?.wbraid, gbraid: a?.gbraid, fbclid: a?.fbclid } });
}

function countSignals(counts: SignalCounts, order: Parent, attribution: ReturnType<typeof orderAttribution>) {
  const coupon = typeof order.discountCode === "string" && !!order.discountCode.trim() &&
    (order.discountAmountInCents ?? order.quote?.discountCents ?? 0) > 0;
  const googlePaid = attribution?.group === "paid" && (attribution.reason === "google_click_untyped" ||
    ["google","googleads","google_ads"].includes(attribution.source?.trim().toLowerCase() ?? ""));
  if (coupon) counts.coupon++;
  if (googlePaid) counts.googlePaid++;
  if (coupon && googlePaid) counts.both++;
  if (!attribution || attribution.group === "unknown") counts.unknownSource++;
}

function datedBudgets(data: Census, cutoff: number) {
  const budgets: Budget[] = [];
  const labels: Record<string, string> = {};
  const spend = new Map(data.spend.filter(row => row.importedAt <= cutoff).map(row => [row.id, row]));
  const periods = data.periods.filter(p => p.business === "sendmynotes" && instant(p.reviewedAt) && p.reviewedAt <= cutoff && monthPattern.test(p.month) &&
    typeof p.campaignKey === "string" && p.campaignKey && Array.isArray(p.spendIds));
  const uses = new Map<string, number>();
  for (const p of periods) for (const id of p.spendIds) uses.set(id, (uses.get(id) ?? 0) + 1);
  for (const p of periods) {
    const id = campaignId(p.campaignKey);
    // A reviewed internal display name is the only campaign text that crosses the API.
    if (/^[A-Za-z][A-Za-z0-9 -]{0,48}$/.test(p.campaignLabel) && !/\d{5}/.test(p.campaignLabel)) labels[id] = p.campaignLabel;
    const selected = p.spendIds.map(key => spend.get(key));
    if (!selected.length || !selected.every(r => r && uses.get(r.id) === 1 && !r.correctionOfId && r.currency?.toUpperCase() === "USD" &&
        r.date?.slice(0, 7) === p.month && r.timezone === "America/Chicago" && r.isEstimate === false && cents(r.amountCents))) continue;
    budgets.push({ month: p.month, campaign: id, media: selected.reduce((sum, r) => sum + r!.amountCents, 0),
      fees: cents(p.creativeAndPartnerCents) ? p.creativeAndPartnerCents : null,
      credits: cents(p.creditCents) ? p.creditCents : null,
      complete: p.fullAcquisitionPeriod === true && !data.incomplete.includes("campaign spend") && !data.incomplete.includes("campaign reviews") });
  }
  return { budgets, labels };
}

function reviewedCost(review: ReportReconciliationEntry, capture: Fact | undefined, costs: SupplierCostAllocationRecord[], cutoff: number) {
  const r = review.repeatBuyer;
  const fee = r?.processorFeeCents ?? capture?.stripeFeeCents;
  if (!Array.isArray(r?.supplierAllocationIds) || !cents(fee) || !cents(r.otherCostsCents)) return null;
  const ids = new Set(r.supplierAllocationIds);
  if (ids.size !== r.supplierAllocationIds.length) return null;
  const rows = costs.filter(c => c.orderId === review.orderId && c.importedAt <= cutoff && c.allocatedAt <= cutoff);
  if (rows.length !== ids.size || !rows.every(c => ids.has(c.id) && c.isEstimate === false && c.currency?.toUpperCase() === "USD" && cents(c.totalSupplierCostCents))) return null;
  return rows.reduce((sum, c) => sum + c.totalSupplierCostCents, fee + r.otherCostsCents);
}

function adjustments(facts: Fact[], review: ReportReconciliationEntry, at: number, cutoff: number) {
  const entries: Purchase["adjustments"] = [];
  let uncertain = false;
  let open = false;
  const disputes = new Set<string>();
  const seen = new Set<string>();
  for (const f of facts) {
    if (f.factType === "capture") continue;

    if (f.orderId && f.orderId !== review.orderId || f.paymentIntentId !== review.paymentIntentId ||
        f.currency?.toUpperCase() !== "USD" || !instant(f.occurredAt) || !cents(f.amountCents) || !f.providerObjectId || f.provider !== "stripe") { uncertain = true; continue; }
    if (f.factType === "dispute") {
      const outcomes = review.repeatBuyer?.disputeResolutions?.filter(d => d.disputeId === f.providerObjectId) ?? [];
      const result = outcomes[0];
      if (disputes.has(f.providerObjectId)) uncertain = true;
      disputes.add(f.providerObjectId);
      if (outcomes.length !== 1 || !instant(result.resolvedAt) || result.resolvedAt > cutoff || result.resolvedAt < f.occurredAt ||
          !cents(result.netLossCents) || result.netLossCents > f.amountCents ||
          !["won", "lost"].includes(result.outcome) || result.outcome === "won" && result.netLossCents !== 0) {
        open = true;
      } else if (result.outcome === "lost") {
        entries.push({ kind: "lost", reversedTaxCents: review.repeatBuyer?.reversedTaxCents?.[f.providerObjectId], cents: result.netLossCents, at: result.resolvedAt, knownAt: Date.parse(review.decidedAt!) });
      }
      continue;
    }
    if (f.factType !== "refund") continue;
    if (f.providerRefundStatus === "failed" || f.providerRefundStatus === "canceled") continue;
    if (f.providerRefundStatus !== "succeeded" || (f.providerStatusObservedAt ?? 0) > cutoff ||
        seen.has(f.providerObjectId) || f.occurredAt < at) { uncertain = true; continue; }
    seen.add(f.providerObjectId);
    entries.push({ kind: "refund", reversedTaxCents: review.repeatBuyer?.reversedTaxCents?.[f.providerObjectId], at: f.occurredAt, knownAt: Math.max(f.recordedAt, f.providerStatusObservedAt ?? 0), cents: f.amountCents });
  }
  if (review.disputeStatus === "disputed" && !disputes.size) open = true;
  const refunded = entries.filter(x => x.kind === "refund").reduce((n, x) => n + x.cents, 0);
  if (entries.reduce((n, x) => n + x.cents, 0) > (review.amountInCents ?? 0)) uncertain = true;
  if (refunded > (review.amountInCents ?? 0) || review.refundStatus === "full" && refunded !== review.amountInCents ||
      review.refundStatus === "partial" && (!refunded || refunded < (review.refundedAmountInCents ?? 0))) uncertain = true;
  return { entries, open, uncertain: uncertain || open || !review.refundStatus || review.refundStatus === "unknown" ||
    !review.disputeStatus || review.disputeStatus === "unknown" };
}

export function assemble(data: Census, asOf: number, makeKey: (email: string) => string) {
  const coverage = emptyCoverage();
  const reasons = new Set(data.incomplete.map(s => "Incomplete read: " + s + "."));
  const purchases: Purchase[] = [];
  const reviews = new Map<string, ReportReconciliationEntry>();
  const current = new Map<string, ReportReconciliationEntry>();
  for (const r of data.reviews) {
    if ((current.get(r.orderId)?.revision ?? 0) < r.revision) current.set(r.orderId, r);
    if (Math.max(Date.parse(r.decidedAt ?? ""), Date.parse(r.manifestReviewedAt ?? ""), Date.parse(r.observedAt || r.decidedAt || "")) <= asOf &&
        (reviews.get(r.orderId)?.revision ?? 0) < r.revision) reviews.set(r.orderId, r);
  }
  const facts = data.facts.filter(f => f.recordedAt <= asOf && f.occurredAt <= asOf && f.livemode === true);
  const owners = new Map<string, Set<string>>();
  for (const o of data.orders) if (o.stripePaymentId) {
    const ids = owners.get(o.stripePaymentId) ?? new Set(); ids.add(o.id); owners.set(o.stripePaymentId, ids);
  }
  const deleted = new Set(data.deletedOwners);
  const orderIds = new Set(data.orders.map(o => o.id));
  const orphan = facts.some(f => f.factType === "capture" && !excludedKinds.has(f.commercialKind) && !orderIds.has(f.orderId)) ||
    [...reviews.values()].some(r => r.classification === "independent_customer" && !orderIds.has(r.orderId));
  let undated = false;
  for (const o of data.orders) {
    const r = reviews.get(o.id);
    const m = o.purchaseMeasurement;
    const related = facts.filter(f => f.orderId === o.id || !!o.stripePaymentId && (f.paymentIntentId === o.stripePaymentId || f.factType === "capture" && f.providerObjectId === o.stripePaymentId));
    const captures = related.filter(f => f.factType === "capture");
    const commercial = classification({ ...o, attribution: undefined }, r);
    const privacyBlocked = !!o.userId && deleted.has(o.userId) || data.incomplete.includes("privacy requests");
    const attribution = orderAttribution(o, privacyBlocked);
    if (commercial === "friends_family") {
      coverage.friendsFamily++;
      countSignals(coverage.signals.family, o, attribution);
    }
    if (["founder", "comp", "admin", "friends_family"].includes(commercial) || excludedKinds.has(o.commercialKind ?? "") ||
        o.paymentMethod === "STUDIO_COMP" || captures.some(f => excludedKinds.has(f.commercialKind))) continue;
    const paid = captures.length > 0 || r?.liveMode === true || m && m.verifiedAt <= asOf && m.amountInCents > 0 && ["eligible", "known_refund"].includes(m.reason);
    if (!paid) continue;
    const capture = captures[0];
    const bound = r?.classification === "independent_customer" && r.liveMode === true && r.currency === "USD" && cents(r.amountInCents) && r.amountInCents > 0 &&
      o.stripePaymentId && r.paymentIntentId === o.stripePaymentId && owners.get(o.stripePaymentId)?.size === 1 &&
      (o.amountInCents === undefined || o.amountInCents === r.amountInCents) &&
      (!m || m.transactionId === o.id && m.amountInCents === r.amountInCents && m.currency === r.currency && ["eligible", "known_refund"].includes(m.reason)) &&
      captures.length <= 1 && (!capture || capture.provider === "stripe" && capture.orderId === o.id && capture.providerObjectId === r.paymentIntentId &&
        capture.amountCents === r.amountInCents && capture.currency?.toUpperCase() === "USD");
    if (!bound) { coverage.unresolved++; countSignals(coverage.signals.unresolved, o, attribution); continue; }
    const at = capture?.occurredAtBasis === "provider_reported" ? capture.occurredAt : r.repeatBuyer?.capturedAt;
    if (instant(at) && at > asOf) continue;
    coverage.verified++;
    countSignals(coverage.signals.independent, o, attribution);
    // Never reconstruct a historical permission after removal, redaction or an account deletion request.
    let buyer: string | null = null;
    try { buyer = identity(o, !privacyBlocked && r.repeatBuyer?.identityUseApproved === true && current.get(o.id)?.repeatBuyer?.identityUseApproved === true, makeKey); }
    catch { reasons.add("The reporting identity key is unavailable."); }
    if (buyer) coverage.matchable++; else coverage.missingIdentity++;
    if (!instant(at)) { undated = true; continue; }
    const adj = adjustments(related, r, at, asOf);
    if (adj.open) coverage.openDisputes++;
    const refunded = adj.entries.filter(x => x.kind === "refund").reduce((sum, x) => sum + x.cents, 0);
    const flagsKnown = instant(o.updatedAt) && o.updatedAt <= asOf;
    const knownFull = ["full", "fully_refunded"].includes(o.refundStatus ?? "") || m?.reason === "known_refund";
    const unknown = adj.uncertain || flagsKnown && (knownFull && refunded !== r.amountInCents ||
      ["partial", "partially_refunded"].includes(o.refundStatus ?? "") && refunded === 0 ||
      cents(o.refundedAmountInCents) && o.refundedAmountInCents > refunded ||
      o.disputeStatus === "disputed" && !related.some(f => f.factType === "dispute"));
    if (unknown) coverage.unknownAdjustments++;
    const laterCosts = r.repeatBuyer?.laterCosts ?? [];
    const validLaterCosts = Array.isArray(laterCosts) && laterCosts.every(c => instant(c.incurredAt) && c.incurredAt >= at && cents(c.cents));
    const cost = !validLaterCosts || data.incomplete.includes("invoices") ? null : reviewedCost(r, capture, data.costs, asOf);
    if (validLaterCosts) for (const c of laterCosts) adj.entries.push({ kind: "cost", at: c.incurredAt, cents: c.cents, knownAt: Date.parse(r.decidedAt!) });
    if (cost === null) coverage.missingCosts++;
    const extra = r.repeatBuyer?.reacquisitionCents;
    if (cents(extra) && extra > 0) adj.entries.push({ kind: "reacquisition", cents: extra, at, knownAt: Date.parse(r.decidedAt!) });
    const tax = r.repeatBuyer?.taxCents;
    purchases.push({ id: o.id, buyer, at, knownAt: Math.max(capture?.recordedAt ?? 0, Date.parse(r.decidedAt!)),
      campaign: attribution?.campaign && attribution.campaign !== "[redacted]" ? campaignId(attributionCampaignKey(attribution)) : null, project: r.repeatBuyer?.projectId || null,
      gross: r.amountInCents!, tax: cents(tax) && tax <= r.amountInCents! ? tax : null,
      cost, adjustments: adj.entries, uncertainPayment: unknown });
  }
  if (undated) reasons.add("A verified payment is missing its capture time.");
  if (orphan) reasons.add("Payment evidence has no unique parent order.");
  if (coverage.unresolved) reasons.add("Paid orders await independent-customer reconciliation.");
  if (coverage.missingIdentity) reasons.add("Orders lack a permitted, usable checkout contact.");
  if (coverage.unknownAdjustments) reasons.add("Some refund timing or dispute outcomes are unknown.");
  if (coverage.missingCosts) reasons.add("Actual payment fees, landed invoices or other variable costs are incomplete.");
  const unmatchedAdjustments = facts.some(f => f.factType !== "capture" &&
    !(f.orderId && orderIds.has(f.orderId)) && !(f.paymentIntentId && owners.has(f.paymentIntentId)));
  if (unmatchedAdjustments) {
    reasons.add("Unlinked financial adjustments could affect retained payments.");
    for (const p of purchases) p.uncertainPayment = true;
    coverage.unknownAdjustments = purchases.length;
  }
  if (purchases.some(p => p.tax === null || !!p.tax && p.adjustments.some(a => ["refund","lost"].includes(a.kind) && a.cents < p.gross && !cents(a.reversedTaxCents)))) reasons.add("Pass-through tax has not been reconciled on every payment.");
  const historyComplete = !orphan && !undated && !coverage.unresolved &&
    !data.incomplete.some(s => ["orders", "financial facts", "commercial reviews"].includes(s));
  const { budgets, labels } = datedBudgets(data, asOf);
  if (!budgets.length) reasons.add("No campaign period has a reviewed allocation of SendMyNotes acquisition spend.");
  const input: CohortInput = { purchases, asOf, budgets, historyComplete, acquisitionComplete: historyComplete &&
    coverage.missingIdentity === 0 && !data.incomplete.length };
  coverage.reasons = [...reasons];
  return { input, coverage, labels };
}
