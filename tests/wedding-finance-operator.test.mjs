import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  boundStripeVersion,
  verifySyntheticRefund,
} from "../docs/sprints/evidence/SPRINT-0031/finance-operator.mjs";

const i = {
  projectId: "wp_" + randomUUID(),
  runId: randomUUID(),
  firstId: "wb_" + randomUUID(),
  lastId: "wb_" + randomUUID(),
  householdId: "wh_" + "f".repeat(32),
};
const now = Date.now(),
  ids = Array.from({ length: 100 }, (_, n) =>
    n === 98 ? i.householdId : "h" + (n + 1),
  );
const docs = {
  p: {
    id: i.projectId,
    createdAt: now - 1000,
    householdCount: 100,
    purchasedCount: 100,
    sharedBody:
      "Thank you for your thoughtful wedding gift. We appreciate you thinking of us.",
    returnAddress: {
      address1: "5000 Fictional Wedding Lane",
      firstName: "Alex Patel & Jamie Kim",
    },
    paidHouseholds: Object.fromEntries(
      ids.map((id, n) => [id, n < 98 ? i.firstId : i.lastId]),
    ),
  },
  row: {
    id: i.householdId,
    sourceHouseholdId: "H099",
    paidBatchId: i.lastId,
    address: { country: "FR", zip: "69001" },
    provenance: [{ importId: "finance_" + i.runId + "_75" }],
  },
  child: {
    card: {
      householdId: i.householdId,
      recipient: { address: { country: "FR" } },
    },
    line: { contentHash: "fixture", totalCents: 1200 },
  },
};
for (const [name, id, prior, n, total, mail] of [
  ["first", i.firstId, 0, 98, 72350, 1000],
  ["last", i.lastId, 98, 2, 1850, 500],
]) {
  docs[name] = {
    id,
    projectId: i.projectId,
    status: "held",
    capturedCents: total,
    completedCount: n,
    refundedCents: 0,
    refundReservedCents: 0,
    settledAt: now,
    paymentIntentId: "pi_fixture",
    quote: {
      currency: "USD",
      tax: { mode: "inclusive" },
      addedTaxCents: 0,
      count: n,
      previouslyPurchased: prior,
      totalCents: total,
      mailingCents: mail,
      lines: ids
        .slice(prior, prior + n)
        .map((hid, index) => ({
          householdId: hid,
          ordinal: prior + index + 1,
        })),
    },
  };
}
Object.assign(docs.last.quote.lines[0], {
  country: "FR",
  baseCents: 700,
  mailingCents: 500,
  totalCents: 1200,
  contentHash: "fixture",
});
docs.last.quote.lines[1].totalCents = 650;
verifySyntheticRefund(i, docs, now);
for (const mutate of [
  (d) => {
    d.row.sourceHouseholdId = "H100";
  },
  (d) => {
    d.row.provenance[0].importId = "another-run";
  },
  (d) => {
    d.p.purchasedCount = 99;
  },
  (d) => {
    d.p.claimedAt = now;
  },
  (d) => {
    d.first.projectId = "another-project";
  },
  (d) => {
    d.last.refundedCents = 1;
  },
  (d) => {
    d.last.quote.lines[0].mailingCents = 0;
  },
  (d) => {
    d.p.createdAt = now - 2 * 86400000;
  },
  (d) => {
    d.child.refundRequestId = "unknown";
  },
]) {
  const bad = structuredClone(docs);
  mutate(bad);
  assert.throws(() => verifySyntheticRefund(i, bad, now));
}
const env = {
  STAGING_REVIEW_ONLY: "true",
  HANDWRYTTEN_TEST_MODE: "true",
  WEDDING_CHECKOUT_ENABLED: "true",
  FIREBASE_PROJECT_ID: "sendmynotes-staging",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture",
};
function revision(secret, flags = env) {
  return {
    containers: [
      {
        env: [
          ...Object.entries(flags).map(([name, value]) => ({ name, value })),
          {
            name: "STRIPE_SECRET_KEY",
            valueSource: { secretKeyRef: { secret, version: "1" } },
          },
        ],
      },
    ],
  };
}
assert.equal(
  boundStripeVersion(revision("projects/123/secrets/stripe-secret-key"), "123"),
  "projects/sendmynotes-staging/secrets/stripe-secret-key/versions/1",
);
assert.throws(() =>
  boundStripeVersion(
    revision("projects/sendmynotes-production/secrets/stripe-secret-key"),
    "123",
  ),
);
assert.throws(() =>
  boundStripeVersion(
    revision("stripe-secret-key", {
      ...env,
      STRIPE_PUBLISHABLE_KEY: "pk_live_fixture",
    }),
    "123",
  ),
);
assert.throws(() =>
  boundStripeVersion(
    revision("stripe-secret-key", {
      ...env,
      WEDDING_CHECKOUT_ENABLED: "false",
    }),
    "123",
  ),
);
console.log(
  "Staging-only IAM refund guards reject foreign cohorts, destinations, allocations, prior refunds, non-staging bindings and live keys.",
);

const {selectEndpoint, targetRefundEvents} = await import("../docs/sprints/evidence/SPRINT-0031/refund-webhook.mjs");
const destination = {id:"we_fixture", status:"enabled", livemode:false, url:"https://staging.sendmynotes.com/api/webhooks/stripe"};
assert.equal(selectEndpoint([destination]),destination);
for (const endpoints of [
  [destination,destination], [{...destination,livemode:true}], [{...destination,status:"disabled"}],
  [{...destination,url:destination.url+"/"}], [{...destination,url:destination.url+"?value=1"}],
  [{...destination,url:"https://sendmynotes.com/api/webhooks/stripe"}],
]) assert.throws(()=>selectEndpoint(endpoints));
const job={id:"wr_fixture",batchId:"wb_fixture",providerId:"re_fixture"}, pi={id:"pi_fixture"};
const event={id:"evt_fixture",livemode:false,type:"refund.created",data:{object:{id:job.providerId,payment_intent:pi.id,amount:1200,currency:"usd",metadata:{weddingRefundId:job.id,weddingBatchId:job.batchId}}}};
assert.equal(targetRefundEvents([event],job,pi).length,1);
for(const other of [{...event,livemode:true},{...event,account:"connected"},{...event,type:"refund.failed"},
  {...event,data:{object:{...event.data.object,amount:1250}}},{...event,data:{object:{...event.data.object,id:"re_other"}}},
  {...event,data:{object:{...event.data.object,metadata:{weddingRefundId:job.id,weddingBatchId:"wb_other"}}}}])
  assert.deepEqual(targetRefundEvents([other],job,pi),[]);
console.log("Staging webhook destination and existing-refund identity guards passed.");
