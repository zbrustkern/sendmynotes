import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb, getOrdersCollection } from "../lib/firebase-admin";
import { generateManualCopy, generateManualDraft, manualOrderView, saveManualDraft, sendManualDraft, MANUAL_MESSAGES } from "../lib/post-purchase/manual";
import { getEmailPreference, getSenderKey, recordPostPurchaseConsent, suppressPostPurchaseEmail } from "../lib/post-purchase/preferences";
import { GET, POST } from "../app/api/admin/manual-followup/route";
import { POST as webhook } from "../app/api/webhooks/resend/route";
import { generateAdminSessionToken, ADMIN_COOKIE_NAME } from "../lib/admin-auth";
import type { Order } from "../lib/types";

async function main() {
 await withSafeTestHarness(async () => {
  process.env.POST_PURCHASE_SENDER_HMAC_KEY = "test-manual-sender-secret-32-or-more-characters";
  process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET = "test-manual-unsubscribe-secret-32-or-more";
  process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS = "Synthetic postal address";
  process.env.RESEND_WEBHOOK_SECRET = "synthetic-configured-webhook";
  process.env.NEXT_PUBLIC_APP_URL = "https://sendmynotes.com";
  process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "true";
  process.env.POST_PURCHASE_DELIVERY_ACTIVE = "false";
  process.env.POST_PURCHASE_AUTO_ENROLL_ACTIVE = "false";
  delete process.env.STAGING_REVIEW_ONLY;
  const actor = "admin:synthetic";
  let count = 0;
  const transport = { async send(payload: Record<string,unknown>, key: string) { count++; assert.ok(key.startsWith("manual_")); assert.ok(String(payload.text).includes("Stop optional follow-ups:")); assert.ok(String(payload.html).includes('<a href="https://sendmynotes.com/email/unsubscribe?')); return { id: `synthetic-${count}` }; } };
  async function seed(id: string, extra: Partial<Order> = {}) {
    const order = { id, customerEmail: `${id}@example.invalid`, createdAt: Date.now(), status: "PENDING_PAYMENT", returnAddress: { firstName: "Alex" }, printedMessage: "DO NOT READ PRIVATE CARD CONTENT", ...extra } as Order;
    await getOrdersCollection().doc(id).set(order); return order;
  }
  const sympathy = await seed("sympathy", { occasion: "sympathy", isFounderTest: true, status: "MAILED" });
  const generated = generateManualCopy(sympathy); assert.ok(generated.sensitiveOccasion); assert.ok(generated.body.includes("no need to reply")); assert.ok(!generated.body.includes("DO NOT READ"));
  const first = await generateManualDraft(sympathy.id, actor); assert.equal(first.permission, "unknown"); assert.equal(first.draft?.state, "draft"); assert.equal(count,0);
  const saved = await saveManualDraft({ orderId: sympathy.id, revision: 1, kind: "service", subject: "Personal subject", body: "Personal service help, without an offer." }, actor);
  assert.equal((await generateManualDraft(sympathy.id, actor)).draft?.body, saved.draft?.body, "one-tap generation preserves existing edits");
  await assert.rejects(saveManualDraft({ orderId:sympathy.id, revision:1,kind:"service",subject:"stale",body:"stale" },actor), /changed/);
  await assert.rejects(sendManualDraft({ orderId:sympathy.id,revision:2,reviewed:true },actor,{transport}), /intentional email test/);
  await assert.rejects(sendManualDraft({ orderId:sympathy.id,revision:2,reviewed:false,testAcknowledged:true },actor,{transport}), /Review/);
  const race = await Promise.allSettled([1,2].map(() => sendManualDraft({ orderId:sympathy.id,revision:2,reviewed:true,testAcknowledged:true },actor,{transport})));
  assert.ok(race.some(r=>r.status === "fulfilled")); assert.equal(count,1,"double-click sends only once");
  await sendManualDraft({ orderId:sympathy.id,revision:2,reviewed:true,testAcknowledged:true },actor,{transport}); assert.equal(count,1,"accepted message cannot resend");
  assert.equal((await getOrdersCollection().doc(sympathy.id).get()).data()?.isFounderTest,true);
  assert.equal((await firestoreDb.collection("post_purchase_enrollments").get()).size,0,"manual email never enrolls automation");
  assert.equal((await firestoreDb.collection("post_purchase_offer_grants").get()).size,0,"manual draft creates no offer");
  assert.equal(await getEmailPreference(sympathy.customerEmail),null,"manual service email never manufactures opt-in");

  const promo = await seed("promo"); await generateManualDraft(promo.id,actor);
  await saveManualDraft({ orderId:promo.id,revision:1,kind:"marketing",subject:"An offer",body:"A promotional follow-up" },actor);
  await assert.rejects(sendManualDraft({orderId:promo.id,revision:2,reviewed:true},actor,{transport}), /marketing permission/);
  await recordPostPurchaseConsent({ email:promo.customerEmail,orderId:promo.id,optedIn:true,disclosureVersion:"synthetic-explicit-permission" });
  await sendManualDraft({orderId:promo.id,revision:2,reviewed:true},actor,{transport}); assert.equal(count,2);

  const disabled = await seed("disabled"); await generateManualDraft(disabled.id,actor);
  process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "false";
  await assert.rejects(sendManualDraft({orderId:disabled.id,revision:1,reviewed:true},actor,{transport}), /not enabled/);
  process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "true"; process.env.STAGING_REVIEW_ONLY = "true";
  await assert.rejects(sendManualDraft({orderId:disabled.id,revision:1,reviewed:true},actor,{transport}), /Staging/); delete process.env.STAGING_REVIEW_ONLY;
  await suppressPostPurchaseEmail(disabled.customerEmail,"unsubscribed");
  await assert.rejects(sendManualDraft({orderId:disabled.id,revision:1,reviewed:true},actor,{transport}), /suppressed/); assert.equal(count,2);

  const moved = await seed("moved"); await generateManualDraft(moved.id,actor); await getOrdersCollection().doc(moved.id).set({ customerEmail:"changed@example.invalid" },{merge:true});
  await assert.rejects(sendManualDraft({orderId:moved.id,revision:1,reviewed:true},actor,{transport}), /destination changed/);

  const uncertain = await seed("uncertain"); const unsure = await generateManualDraft(uncertain.id,actor);
  let attempts=0; const timeout = { async send() { attempts++; throw new Error("timeout after possible acceptance"); } };
  await assert.rejects(sendManualDraft({orderId:uncertain.id,revision:1,reviewed:true},actor,{transport:timeout}), /needs checking/);
  assert.equal((await manualOrderView(uncertain.id)).draft?.state,"uncertain");
  await assert.rejects(sendManualDraft({orderId:uncertain.id,revision:1,reviewed:true},actor,{transport:timeout}), /already started/); assert.equal(attempts,1);
  const secretBytes=Buffer.from("synthetic-manual-webhook-secret-32b");process.env.RESEND_WEBHOOK_SECRET=`whsec_${secretBytes.toString("base64")}`;
  const raw=JSON.stringify({type:"email.bounced",data:{email_id:"provider-uncertain",tags:[{name:"message_id",value:unsure.draft!.id}]}});
  const timestamp=String(Math.floor(Date.now()/1000)), eventId="synthetic-manual-bounce";
  const signature=crypto.createHmac("sha256",secretBytes).update(`${eventId}.${timestamp}.${raw}`).digest("base64");
  const eventRequest=()=>new NextRequest("https://sendmynotes.com/api/webhooks/resend",{method:"POST",headers:{"svix-id":eventId,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`},body:raw});
  assert.equal((await webhook(eventRequest())).status,200);
  assert.equal((await manualOrderView(uncertain.id)).draft?.state,"accepted");
  assert.equal((await manualOrderView(uncertain.id)).draft?.deliveryOutcome,"bounced");
  assert.equal((await getEmailPreference(uncertain.customerEmail))?.state,"bounced");
  assert.equal((await webhook(eventRequest())).status,200);
  const concurrent = (type:string,id:string) => {
    const body=JSON.stringify({type,data:{email_id:"provider-uncertain",tags:[{name:"message_id",value:unsure.draft!.id}]}});
    const signature=crypto.createHmac("sha256",secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
    return new NextRequest("https://sendmynotes.com/api/webhooks/resend",{method:"POST",headers:{"svix-id":id,"svix-timestamp":timestamp,"svix-signature":`v1,${signature}`},body});
  };
  const events=await Promise.all([webhook(concurrent("email.complained","concurrent-complaint")),webhook(concurrent("email.delivered","concurrent-delivery"))]);
  assert.ok(events.every(r=>r.status===200));
  const facts=(await firestoreDb.collection(MANUAL_MESSAGES).doc(unsure.draft!.id).get()).data();
  assert.ok(facts?.deliveryFacts?.complained && facts?.deliveryFacts?.delivered && facts?.deliveryFacts?.bounced,"concurrent delivery facts accumulate");
  assert.equal(facts?.deliveryOutcome,"complained","positive delivery cannot replace complaint");

  assert.equal((await GET(new NextRequest("https://sendmynotes.com/api/admin/manual-followup?orderId=sympathy"))).status,401);
  assert.equal((await POST(new NextRequest("https://sendmynotes.com/api/admin/manual-followup",{method:"POST",body:JSON.stringify({action:"generate",orderId:"sympathy"})}))).status,401);
  const cookie=`${ADMIN_COOKIE_NAME}=${generateAdminSessionToken("zbrustkern@gmail.com")}`;
  const forbidden = await POST(new NextRequest("https://sendmynotes.com/api/admin/manual-followup",{method:"POST",headers:{cookie,origin:"https://evil.invalid"},body:JSON.stringify({action:"send",orderId:"sympathy"})}));assert.equal(forbidden.status,403);
  const response=await GET(new NextRequest("https://sendmynotes.com/api/admin/manual-followup?orderId=sympathy",{headers:{cookie}}));assert.equal(response.status,200);const data=JSON.stringify(await response.json());assert.ok(!data.includes(sympathy.customerEmail));assert.ok(!data.includes("DO NOT READ"));
  assert.equal(process.env.POST_PURCHASE_DELIVERY_ACTIVE,"false"); assert.equal(process.env.POST_PURCHASE_AUTO_ENROLL_ACTIVE,"false");
 });
 console.log("Manual follow-up contracts, concurrent send, suppression, unchanged classification, webhook recovery, auth, and privacy passed.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
