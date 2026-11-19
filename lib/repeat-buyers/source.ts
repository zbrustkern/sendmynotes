import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { firestoreDb } from "../firebase-admin";
import { assertSafeRuntime, expectedProject, ORDER_CAP } from "../admin-measurement-source";
import { REPORT_PRIVATE_COLLECTION_PATH } from "../admin-measurement-reconciliation";
import { FINANCIAL_FACTS_COLLECTION } from "../financial-ledger";
import { DATED_SPEND_COLLECTION, SUPPLIER_COST_COLLECTION } from "../spend-and-cost-ledger";
import { getSenderKey } from "../post-purchase/preferences";
import type { ReportReconciliationEntry } from "../contracts/admin-measurement-report";
import type { DatedSpendRecord, SupplierCostAllocationRecord } from "../spend-and-cost-ledger";
import { assemble, type Fact, type Parent, type Period } from "./evidence";

const orderFields = ["discountCode","discountAmountInCents","quote.discountCents","updatedAt","amountInCents","stripePaymentId","isFounderTest","isTest","isComp","isRedacted","paymentMode","paymentMethod",
  "origin","commercialKind","purchaseMeasurement","customerEmail","contactPolicyVersion","contactEmailChoice","contactEmailSyncStatus",
  "userId","sessionId","source","campaignId","attribution.utmSource","attribution.utmMedium","attribution.utmCampaign",
  "attribution.gpc","attribution.optOut","attribution.attributionV2","attribution.gclid","attribution.gbraid","attribution.wbraid","attribution.fbclid",
  "refundStatus","refundedAmountInCents","disputeStatus"];
const reviewFields = ["orderId","classification","revision","decidedAt","manifestReviewedAt","observedAt","liveMode","currency","amountInCents",
  "paymentIntentId","refundStatus","refundedAmountInCents","disputeStatus","repeatBuyer"];
const factFields = ["orderId","provider","providerObjectId","paymentIntentId","factType","commercialKind","currency","amountCents",
  "livemode","occurredAt","occurredAtBasis","recordedAt","stripeFeeCents","providerRefundStatus","providerStatusObservedAt"];

export function reportEnvironment() {
  assertSafeRuntime();
  return expectedProject() === "sendmynotes-staging" ? "staging" as const : "production" as const;
}

export async function readRepeatBuyers(asOf: number) {
  const environment = reportEnvironment();
  const db: Firestore = firestoreDb;
  const root = REPORT_PRIVATE_COLLECTION_PATH + "/report_" + environment;
  // Every projection shares a Firestore read timestamp, including privacy restrictions.
  async function census(tx: Transaction) {
    const incomplete: string[] = [];
    async function read<T>(label: string, path: string, fields: string[], cap: number) {
      const snap = await tx.get(db.collection(path).select(...fields).limit(cap + 1));
      if (snap.size > cap) incomplete.push(label);
      return snap.docs.slice(0, cap).map(doc => ({ ...doc.data(), id: doc.id }) as T);
    }
    const [orders, reviews, facts, costs, spend, periods, requests] = await Promise.all([
      read<Parent>("orders", "orders", orderFields, ORDER_CAP),
      read<ReportReconciliationEntry>("commercial reviews", root + "/revisions", reviewFields, 1000),
      read<Fact>("financial facts", FINANCIAL_FACTS_COLLECTION, factFields, 4000),
      read<SupplierCostAllocationRecord>("invoices", SUPPLIER_COST_COLLECTION,
        ["orderId","invoiceId","totalSupplierCostCents","allocatedAt","importedAt","currency","isEstimate"], 4000),
      read<DatedSpendRecord>("campaign spend", DATED_SPEND_COLLECTION,
        ["amountCents","currency","date","timezone","importedAt","isEstimate","correctionOfId"], 2000),
      read<Period>("campaign reviews", root + "/campaignPeriods",
        ["month","campaignKey","campaignLabel","business","reviewedAt","spendIds","creativeAndPartnerCents","creditCents","fullAcquisitionPeriod"], 1000),
      read<{kind: string; ownerUid: string}>("privacy requests", "account_privacy_requests", ["kind","ownerUid"], 1000),
    ]);
    return { orders, reviews, facts, costs, spend, periods, incomplete, deletedOwners: requests.filter(r => r.kind === "deletion").map(r => r.ownerUid) };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([db.runTransaction(census, {readOnly: true}), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("read_deadline")), 7000);
    })]);
    return { ...assemble(data, asOf, getSenderKey), environment };
  } finally { clearTimeout(timer); }
}
