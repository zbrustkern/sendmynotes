import assert from "node:assert/strict";
import { firestoreDb } from "../lib/firebase-admin";
import { withSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import { evaluateCohortAndFunnelReport, getWindowBounds, isTimestampInScopeWindow, startOfCalendarDay } from "../lib/reporting-engine";
import { recordPaymentCaptureFact, recordPaymentRefundFact } from "../lib/financial-ledger";
import { ingestEventV2, buildEventV2Envelope } from "../lib/telemetry-v2";
import { readBoundedQuery } from "../lib/bounded-admin-read";
import type { GlobalReportScope } from "../lib/contracts/admin-overhaul";

async function main() {
 await withSafeTestHarness(async () => {
  const scope: GlobalReportScope = {window:{start:"2026-10-16",end:"2026-10-16",label:"custom"},timezone:"America/Chicago",mode:"customer_reporting",excludeFounder:true};
  const bounds=getWindowBounds({fromDate:scope.window.start,toDate:scope.window.end,timezone:scope.timezone});
  assert.equal(bounds.endMs-bounds.startMs,86400000);
  assert.equal(isTimestampInScopeWindow(bounds.endMs,scope,bounds),false);
  assert.equal(isTimestampInScopeWindow(bounds.startMs,scope,bounds),true);
  assert.equal(startOfCalendarDay("2026-03-09")-startOfCalendarDay("2026-03-08"),23*3600000);
  assert.equal(startOfCalendarDay("2026-11-02")-startOfCalendarDay("2026-11-01"),25*3600000);
  assert.equal(getWindowBounds({dateRange:"all"}).startMs,0);
  await assert.rejects(()=>readBoundedQuery({limit:()=>({get:async()=>({docs:[1,2,3]})})},2),/budget exceeded/);
  const at=bounds.startMs+3600000;
  await recordPaymentCaptureFact({orderId:"qa_old",paymentIntentId:"pi_qa_old",amountCents:900,currency:"usd",livemode:true,commercialKind:"paid_customer",occurredAt:at-2*86400000});
  await recordPaymentRefundFact({orderId:"qa_old",paymentIntentId:"pi_qa_old",refundId:"re_qa_old",amountCents:400,currency:"usd",livemode:true,occurredAt:at});
  await recordPaymentCaptureFact({orderId:"qa_unlinked",paymentIntentId:"pi_qa_unlinked",amountCents:900,currency:"usd",livemode:true,commercialKind:"paid_customer",occurredAt:at});
  await ingestEventV2(buildEventV2Envelope({event_name:"entry_viewed",session_id:"qa_cohort",occurred_at:at}));
  await firestoreDb.collection("orders").doc("qa_later").set({sessionId:"qa_cohort"});
  // Payment after midnight remains in the entry cohort's 24-hour conversion horizon.
  await recordPaymentCaptureFact({orderId:"qa_later",paymentIntentId:"pi_qa_later",amountCents:900,currency:"usd",livemode:true,commercialKind:"paid_customer",occurredAt:bounds.endMs+1800000});
  const report=await evaluateCohortAndFunnelReport({scope});
  assert.equal(report.summaryMetrics.verifiedCapturedRevenue.value,900);
  assert.equal(report.summaryMetrics.refundedAmount.value,400);
  assert.equal(report.summaryMetrics.netReceipts.value,500);
  assert.equal(report.summaryMetrics.paidOrdersCount.value,1,"unlinked captures count as paid orders");
  assert.equal(report.summaryMetrics.paidSessionsCount.value,0,"period paid session count stays distinct from entry cohort conversion");
  assert.equal(report.summaryMetrics.sessionConversionRate.value,1,"next-day payment remains inside 24-hour entry cohort");
  assert.equal(report.summaryMetrics.sessionConversionRate.denominator,1);
  assert.equal(report.summaryMetrics.contributionMarginPercent.value,null);
  assert.ok(report.funnel.stages.every((stage)=>stage.dropOffCount===null && stage.conversionRateFromPrevious===null));
  assert.equal(getBlockedExternalCalls().length,0);
  console.log("Coordinator reporting regression: DST, half-open windows, historical refunds, unmatched orders, cohort horizon, unknown economics, bounded overflow passed.");
 });
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
