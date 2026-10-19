import assert from "node:assert/strict";
import { firestoreDb } from "../lib/firebase-admin";
import { withSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import { recordPaymentCaptureFact, recordPaymentRefundFact } from "../lib/financial-ledger";
import { evaluateCohortAndFunnelReport } from "../lib/reporting-engine";
import { ingestEventV2, buildEventV2Envelope } from "../lib/telemetry-v2";
import { getEconomicsInvestigationReport, queryOrdersEvidence, queryJourneysEvidence, evaluateFulfillmentRetryGate } from "../lib/investigation-service";
import { getGrowthCampaignAndRecoveryReport, executeAuditedOfferChange, getOfferEvidenceDetail } from "../lib/promotions-and-growth-service";
import { parseAdminGlobalScope, toGlobalReportScope } from "../lib/admin-scope";
import { getOfferRedemptionsCollection } from "../lib/offer-engine";
import { runAnalyticsReplay, REPLAY_PROJECTIONS } from "../lib/analytics-replay";

async function main() {
 await withSafeTestHarness(async()=>{
  const at=Date.parse("2026-10-16T16:00:00Z");
  const cases=[
   {id:"paid",amount:900,status:"PROCESSING_HANDWRYTTEN"},
   {id:"discounted",amount:700,status:"PROCESSING_HANDWRYTTEN"},
   {id:"deferred",amount:900,status:"AWAITING_RECIPIENT_ADDRESS"},
   {id:"failed",amount:900,status:"FAILED"},
   {id:"refunded",amount:900,status:"PAYMENT_RECEIVED"},
   {id:"free",amount:0,status:"QUEUED_FOR_FULFILLMENT"},
  ];
  for(const item of cases) {
   await firestoreDb.collection("orders").doc(item.id).set({id:item.id,createdAt:at,status:item.status,sessionId:`session_${item.id}`,channel:"Google CPC",utmCampaign:"qa-campaign",amountInCents:item.amount,finalAmountInCents:item.amount,...(item.id==="failed"?{fulfillmentError:"synthetic failure"}:{})});
   await ingestEventV2(buildEventV2Envelope({event_name:"entry_viewed",session_id:`session_${item.id}`,journey_id:`journey_${item.id}`,order_id:item.id,occurred_at:at-1000,environment:"production",properties:{utmSource:"google",utmMedium:"cpc",utmCampaign:"qa-campaign"}}));
   if(item.amount>0) {
    const input={orderId:item.id,paymentIntentId:`pi_${item.id}`,amountCents:item.amount,currency:"usd",livemode:true,commercialKind:item.id==="discounted"?"discounted_paid" as const:"paid_customer" as const,occurredAt:at};
    await recordPaymentCaptureFact(input);
    assert.equal((await recordPaymentCaptureFact(input)).duplicate,true);
   }
  }
  // A browser success observation and an arbitrary draft amount cannot create revenue.
  await ingestEventV2(buildEventV2Envelope({event_name:"payment_confirmation_observed",session_id:"session_free",order_id:"free",occurred_at:at,environment:"production"}));
  await firestoreDb.collection("orders").doc("unpaid_draft").set({createdAt:at,status:"PENDING_PAYMENT",amountPaidCents:50000});
  await recordPaymentRefundFact({orderId:"refunded",paymentIntentId:"pi_refunded",refundId:"re_refunded",amountCents:900,currency:"usd",livemode:true,occurredAt:at+1000});
  await recordPaymentCaptureFact({orderId:"founder",paymentIntentId:"pi_founder",amountCents:900,currency:"usd",livemode:true,commercialKind:"founder_test",occurredAt:at});
  await executeAuditedOfferChange({actorEmail:"isolated-qa",action:"create",code:"QAINTEGRATION",payload:{purpose:"Synthetic integration",discountType:"FIXED_AMOUNT",discountValue:200,destinationPath:"/send"}});
  for(const id of ["discounted","free"]) await getOfferRedemptionsCollection().doc(`red_${id}`).set({redemptionId:`red_${id}`,offerId:"offer_QAINTEGRATION",offerVersion:1,code:"QAINTEGRATION",orderId:id,payableAmountCents:id==="free"?0:700,discountAmountCents:id==="free"?900:200,commercialKind:id==="free"?"free_promo":"discounted_paid",redeemedAt:at} as any);
  const scope=parseAdminGlobalScope("?environment=production&datePreset=custom&from=2026-10-16&to=2026-10-16");
  const report=await evaluateCohortAndFunnelReport({scope:toGlobalReportScope(scope)});
  const orders=await queryOrdersEvidence({scope});
  const journeys=await queryJourneysEvidence({scope});
  const economics=await getEconomicsInvestigationReport({scope});
  const growth=await getGrowthCampaignAndRecoveryReport({startDate:"2026-10-16",endDate:"2026-10-16",environment:"production",mode:"customer_reporting"});
  const offer=await getOfferEvidenceDetail("QAINTEGRATION");
  assert.ok(report.campaigns.some((row)=>row.channel==="Google CPC" && row.capturedRevenueCents===4300),"Sanitized campaign context survives collector persistence and reporting");
  assert.equal(report.summaryMetrics.paidOrdersCount.value,5);
  assert.equal(report.summaryMetrics.verifiedCapturedRevenue.value,4300);
  assert.equal(report.summaryMetrics.refundedAmount.value,900);
  assert.equal(report.summaryMetrics.netReceipts.value,3400);
  assert.equal(orders.scopedPaidOrdersTotal,5);
  assert.equal(orders.scopedNetRevenueCents,3400);
  assert.equal(economics.summary.netReceiptsCents,3400);
  assert.equal(economics.summary.totalCapturedRevenueCents,4300);
  assert.equal(growth.totalPaidOrders,5);
  assert.equal(growth.totalFreePromoOrders,1);
  assert.equal(growth.totalCapturedRevenueCents,3400);
  assert.equal(offer?.financials.netCapturedRevenueCents,700);
  assert.equal(offer?.funnel.views,0,"Redemption does not manufacture a view");
  assert.equal(journeys.journeys.find((journey)=>journey.orderId==="free")?.isPaid,false);
  assert.equal(journeys.journeys.reduce((sum,journey)=>sum+journey.revenueCents,0),4300);
  assert.equal(economics.cohortEconomicsView.some((row)=>row.campaign==="fall_launch_2026"),false);
  await firestoreDb.collection("orders").doc("failed").update({status:"DISPATCH_UNCERTAIN"});
  const attention = await evaluateCohortAndFunnelReport({scope:toGlobalReportScope(scope)});
  assert.ok(attention.operationalExceptions.some((exception)=>exception.orderId==="failed" && exception.title.includes("unknown")));
  const retryGate = await evaluateFulfillmentRetryGate("failed");
  assert.equal(retryGate.allowed,false); assert.equal(retryGate.requiresReadSyncFirst,true);
  const reportStarted = performance.now();
  for (let index=0;index<1800;index++) await ingestEventV2(buildEventV2Envelope({event_name:"entry_viewed",session_id:`benchmark_${index}`,occurred_at:at,environment:"production"}));
  const measuredReport = await evaluateCohortAndFunnelReport({scope:toGlobalReportScope(scope)});
  assert.equal(measuredReport.summaryMetrics.totalSessions.value,1806);
  const reportDurationMs = Math.round(performance.now()-reportStarted);
  const before=JSON.stringify((firestoreDb.collection("orders") as any).store?Array.from((firestoreDb.collection("orders") as any).store):[]);
  const source=Array.from({length:10000},(_,index)=>({event_id:`volume_${index}`,event_name:"entry_viewed",occurred_at:at+index,session_id:`volume_session_${index%1000}`}));
  const options={runId:"takeover-volume",schemaVersion:"qa1",windowStart:at,windowEnd:at+20000,sourceEvents:source,chunkSize:400};
  const started=performance.now();
  const paused=await runAnalyticsReplay({...options,maxChunks:2});assert.equal(paused.status,"paused");assert.equal(paused.processed,800);
  const resumed=await runAnalyticsReplay(options);assert.equal(resumed.status,"complete");assert.equal(resumed.processed,10000);
  const retried=await runAnalyticsReplay(options);assert.equal(retried.checkpoint.projectionChecksum,resumed.checkpoint.projectionChecksum);
  assert.equal((await firestoreDb.collection(REPLAY_PROJECTIONS).get()).size,10000);
  assert.equal(JSON.stringify(Array.from((firestoreDb.collection("orders") as any).store)),before);
  assert.equal(getBlockedExternalCalls().length,0);
  console.log(JSON.stringify({scenario:"synthetic evidence reconciliation across Overview/Growth/Promotions/Journeys/Orders/Economics",passed:true,reportEvents:1807,reportIngestAndQueryDurationMs:reportDurationMs,replayEvents:10000,replayDurationMs:Math.round(performance.now()-started),projectionChecksum:resumed.checkpoint.projectionChecksum,externalCalls:0}));
 });
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
