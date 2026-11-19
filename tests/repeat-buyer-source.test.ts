import test from "node:test";
import assert from "node:assert/strict";
import { attributionCampaignKey, adaptLegacyAttribution } from "../lib/attribution-classifier";
import { NextRequest } from "next/server";
import { assemble, type Census, type Parent } from "../lib/repeat-buyers/evidence";
import { report } from "../lib/repeat-buyers/report";
import { repeatBuyerGet } from "../lib/repeat-buyers/handler";
import type { ReportReconciliationEntry } from "../lib/contracts/admin-measurement-report";

const at = Date.parse("2025-01-01T18:00:00Z");
const day = 86400000;
const email = " Sample+one@Synthetic.dev ";
const key = (s: string) => "internal-key-" + s;
const source = (): Census => ({ orders: [], facts: [], reviews: [], spend: [], costs: [], periods: [], deletedOwners: [], incomplete: [] });
function add(d: Census, id: string, time: number, overrides: Partial<Parent> = {}) {
  const o = { id, stripePaymentId: "pi_" + id, createdAt: time, amountInCents: 900, customerEmail: email,
    paymentMethod: "STRIPE", paymentMode: "live", attribution: { utmCampaign: "Internal launch", utmSource: "google", utmMedium: "cpc" }, ...overrides } as Parent;
  const iso = new Date(time).toISOString();
  const r: ReportReconciliationEntry = { orderId: id, classification: "independent_customer", liveMode: true, currency: "USD",
    amountInCents: 900, paymentIntentId: o.stripePaymentId, decidedAt: iso, manifestReviewedAt: iso, revision: 1,
    refundStatus: "none_observed", disputeStatus: "none_observed", repeatBuyer: { capturedAt: time, taxCents: 0,
      identityUseApproved: true, supplierAllocationIds: [], processorFeeCents: 30, otherCostsCents: 5 } };
  d.orders.push(o); d.reviews.push(r); return r;
}
const build = (d: Census, time = at + 400 * day) => assemble(d, time, key);

test("checkout policy and erasure determine which rows can share a sender", () => {
  const d = source();
  add(d,"guest",at);
  add(d,"account",at + day,{ userId: "private-uid", customerEmail: email.trim().toLowerCase(), contactPolicyVersion: 1, contactEmailChoice: "provided", contactEmailSyncStatus: "synced" });
  add(d,"omit",at,{contactEmailChoice:"omitted",contactEmailSyncStatus:"synced",postPurchaseSenderKey:"old"});
  add(d,"unsynced",at,{contactEmailChoice:"provided",contactEmailSyncStatus:"pending"});
  add(d,"redact",at,{isRedacted:true});
  add(d,"placeholder",at,{customerEmail:"someone@example.com"});
  add(d,"no-basis",at).repeatBuyer!.identityUseApproved = false;
  add(d,"restricted",at,{attribution:{gpc:true}});
  add(d,"only-recipient",at,{customerEmail:""});
  const result = build(d);
  assert.equal(result.coverage.matchable,2);
  const actual = report({ ...result,environment:"staging" },{},false);
  assert.equal(actual.summary.buyers,1); assert.equal(actual.summary.repeatBuyers,1);
  const json = JSON.stringify(actual);
  for (const value of [email.trim().toLowerCase(),"internal-key-", "pi_guest","private-uid","Internal launch","only-recipient"]) assert.ok(!json.includes(value),value);
  d.deletedOwners.push("private-uid");
  assert.equal(build(d).coverage.matchable,1);
});

test("preserves plus tags and dots, fails closed on missing keys, and honors current revocation", () => {
  const d=source(); const r=add(d,"a",at);
  add(d,"b",at,{customerEmail:"s.ample@synthetic.dev"});
  assert.equal(new Set(build(d).input.purchases.map(p=>p.buyer)).size,2);
  assert.equal(assemble(d,at,()=>{throw Error("no key")}).coverage.matchable,0);
  d.reviews.push({...r,revision:2,decidedAt:new Date(at+day).toISOString(),repeatBuyer:{...r.repeatBuyer,identityUseApproved:false}});
  assert.equal(build(d,at).coverage.matchable,1);
});

test("exclusions precede identity, technical snapshots alone do not verify independence", () => {
  const d=source(); add(d,"friend",at).classification="friends_family";
  add(d,"founder",at,{isFounderTest:true}); add(d,"comp",at,{isComp:true});
  add(d,"admin",at,{origin:"ADMIN_COMP"}); add(d,"test",at,{paymentMode:"stripe_test"});
  add(d,"unknown",at,{purchaseMeasurement:{version:1,reason:"eligible",eligible:true,amountInCents:900,currency:"USD",transactionId:"unknown",verifiedAt:at,refundStatus:"unknown"}});
  d.reviews.pop(); const result=build(d);
  assert.equal(result.coverage.friendsFamily,1); assert.equal(result.coverage.verified,0);
  assert.equal(result.coverage.unresolved,1); assert.equal(result.input.historyComplete,false);
});

test("payment collisions and truncated history suppress first-purchase metrics", () => {
  const d=source(); add(d,"first",at); add(d,"second",at,{stripePaymentId:"pi_first"});
  assert.equal(build(d).coverage.verified,0);
  const clean=source(); add(clean,"good",at); clean.incomplete.push("orders");
  assert.equal(report({...build(clean),environment:"staging"},{},false).summary.buyers,null);
});

test("refunds and net lost disputes use dated nonoverlapping amounts, scoped to the same payment", () => {
  const d=source(); const r=add(d,"a",at);
  r.disputeStatus="disputed";
  r.repeatBuyer!.disputeResolutions=[{disputeId:"dispute",resolvedAt:at+3*day,netLossCents:300,outcome:"lost"}];
  const common = {orderId:"a",paymentIntentId:"pi_a",livemode:true,currency:"usd",provider:"stripe" as const,
    recordedAt:at+day,occurredAt:at+day,commercialKind:"paid_customer" as const};
  d.facts.push({...common,factId:"f1",providerObjectId:"refund",factType:"refund",providerRefundStatus:"succeeded",amountCents:200},
    {...common,factId:"f2",providerObjectId:"dispute",factType:"dispute",amountCents:500});
  let result=build(d); assert.equal(result.coverage.openDisputes,0);
  assert.equal(report({...result,environment:"staging"},{},false).summary.rows[0].revenuePerBuyer,400);
  delete r.repeatBuyer!.disputeResolutions;
  result=build(d); assert.equal(result.coverage.openDisputes,1);
  assert.equal(report({...result,environment:"staging"},{},false).summary.rows[0].contributionPerBuyer,null);
});

test("reviewed actual invoice set and acquisition period bind exact ledger rows", () => {
  const d=source(); const r=add(d,"a",at);
  r.repeatBuyer!.supplierAllocationIds=["invoice"];
  d.costs.push({id:"invoice",orderId:"a",invoiceId:"private-invoice",totalSupplierCostCents:400,allocatedAt:at,importedAt:at,currency:"USD",isEstimate:false} as Census["costs"][number]);
  const period = {month:"2025-01",business:"sendmynotes",campaignKey:attributionCampaignKey(adaptLegacyAttribution({source:"google",medium:"cpc",campaign:"Internal launch",observedEntry:true})),
    campaignLabel:"Winter cards",reviewedAt:at+40*day,spendIds:["media"],creativeAndPartnerCents:500,creditCents:200,fullAcquisitionPeriod:true};
  d.periods.push(period, {...period,business:"docketstamp",spendIds:["other"]});
  d.spend.push({id:"media",date:"2025-01-02",amountCents:8000,currency:"USD",timezone:"America/Chicago",isEstimate:false,importedAt:at} as Census["spend"][number]);
  const result=build(d);
  assert.equal(result.input.purchases[0].cost,435); assert.equal(result.input.budgets.length,1);
  assert.equal(result.input.budgets[0].media,8000);
  const campaign = result.input.purchases[0].campaign!;
  const actual = report({...result,environment:"staging"},{month:period.month,campaign},false);
  assert.equal(actual.summary.cac,8500); assert.equal(actual.campaignNames[campaign],"Winter cards");
  d.costs[0].isEstimate=true; assert.equal(build(d).input.purchases[0].cost,null);
});

test("API requires auth before every read, private no-store and staging-only synthetic access", async () => {
  const req = (query: string) => new NextRequest("https://localhost/api/admin/repeat-buyers"+query);
  let reads=0; const d=source(); add(d,"private_order",at);
  const deps={authorize:()=>false,environment:()=>"staging" as const,read:async()=>{reads++;return {...build(d),environment:"staging" as const};}};
  const denied=await repeatBuyerGet(req("?example=1"),deps); assert.equal(denied.status,401);assert.equal(reads,0);
  assert.match(denied.headers.get("cache-control")!,/private.*no-store/);
  const authorized={...deps,authorize:()=>true};
  assert.equal((await repeatBuyerGet(req("?campaign=raw@email.dev"),authorized)).status,400);
  assert.equal((await repeatBuyerGet(req("?example=1"),{...authorized,environment:()=>"production"})).status,404);
  const demo=await repeatBuyerGet(req("?example=1&month=2025-01&campaign=winter-launch"),authorized);
  assert.equal((await demo.json()).summary.cac,2000); assert.equal(reads,0);
  const live=await repeatBuyerGet(req(""),authorized); assert.equal(live.status,200); assert.equal(reads,1);
  assert.ok(!(await live.text()).includes("private_order"));
  assert.equal((await repeatBuyerGet(req(""),{...authorized,read:async()=>{throw Error("private_order");}})).status,503);
});

test("two friends-and-family purchases create no independent repeat buyer or ad acquisition", () => {
  const d = source();
  add(d, "family-one", at, { attribution: undefined }).classification = "friends_family";
  add(d, "family-two", at + 8 * day, { attribution: undefined }).classification = "friends_family";
  add(d, "independent", at, { customerEmail: "different@synthetic.dev" });
  const sourceData = build(d);
  const actual = report({ ...sourceData, environment: "staging" }, {}, false);
  assert.equal(actual.coverage.friendsFamily, 2);
  assert.equal(actual.coverage.verified, 1);
  assert.equal(actual.summary.buyers, 1);
  assert.equal(actual.summary.repeatBuyers, 0);
  assert.equal(actual.summary.cac, null);
});

test("coupon and paid attribution overlap without changing commercial classification", () => {
  const d = source();
  add(d, "paid-coupon", at, { discountCode: "private-code", discountAmountInCents: 100 });
  add(d, "organic-family", at, { discountCode: "private-code", discountAmountInCents: 100, attribution: undefined }).classification = "friends_family";
  add(d, "restricted", at, { discountCode: "private-code", discountAmountInCents: 100, attribution: { gpc: true, utmSource: "google", utmMedium: "cpc" } });
  const result = build(d);
  assert.equal(result.coverage.verified, 2);
  assert.deepEqual(result.coverage.signals.independent, {coupon:2, googlePaid:1, both:1, unknownSource:1});
  assert.deepEqual(result.coverage.signals.family, {coupon:1, googlePaid:0, both:0, unknownSource:1});
  assert.ok(!JSON.stringify(report({...result,environment:"staging"},{},false)).includes("private-code"));
});
