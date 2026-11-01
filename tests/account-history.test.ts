import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-account-history-'));
process.env.SMN_TEST_DATA_DIR = dataDir;

async function run() {
  const { getOrdersCollection } = await import('../lib/firebase-admin');
  const { listAccountHistory, getAccountHistoryOrder } = await import('../lib/account/history');
  const own = { uid:'owner-a', email:'verified@example.test', emailVerified:true };
  const base = {
    customerEmail: own.email, status:'MAILED', frontImageUrl:'https://private.example.test/master.png', printedMessage:'Dear Jo,', handwrittenNote:'Thank you for being there.', fontStyleId:'hwDavid',
    recipientAddress:{firstName:'Jo',lastName:'Example',street1:'2 Private Lane',city:'Sample',state:'IL',zip:'00000'}, returnAddress:{firstName:'Alex',lastName:'Sender',street1:'1 Private Lane',city:'Sample',state:'IL',zip:'00000'}, amountInCents:900, handwryttenTrackingNumber:'SECRET-TRACKING', stripePaymentId:'pi_private', attribution:{clientIp:'127.0.0.1'}, viewToken:'secret-token',
  };
  await getOrdersCollection().doc('order-own-new').set({ ...base, id:'order-own-new', userId:own.uid, createdAt:300, updatedAt:301 });
  await getOrdersCollection().doc('order-own-tied').set({ ...base, id:'order-own-tied', userId:own.uid, createdAt:300, updatedAt:301 });
  await getOrdersCollection().doc('order-legacy-email').set({ ...base, id:'order-legacy-email', userId:undefined, createdAt:200, updatedAt:201 });
  await getOrdersCollection().doc('order-other-matching-email').set({ ...base, id:'order-other-matching-email', userId:'other-owner', createdAt:250 });
  await getOrdersCollection().doc('order-other').set({ ...base, id:'order-other', userId:'other-owner', customerEmail:'other@example.test', createdAt:400 });
  await getOrdersCollection().doc('order-unpaid').set({ ...base, id:'order-unpaid', userId:own.uid, status:'PENDING_PAYMENT', createdAt:500 });
  await getOrdersCollection().doc('order-failed-unpaid').set({ ...base, id:'order-failed-unpaid', userId:own.uid, status:'FAILED', stripePaymentId:'pi_created_before_capture', createdAt:550 });
  await getOrdersCollection().doc('order-test').set({ ...base, id:'order-test', userId:own.uid, isTest:true, createdAt:600 });

  const page = await listAccountHistory(own, { limit:1 });
  assert.equal(page.data.length,1);
  assert.equal(page.data[0].id,'order-own-tied');
  assert.ok(page.nextCursor);
  assert.equal('stripePaymentId' in page.data[0],false);
  assert.equal('viewToken' in page.data[0],false);
  assert.equal('handwryttenTrackingNumber' in page.data[0],false);
  assert.equal(page.data[0].message,'Dear Jo,\n\nThank you for being there.');

  const next = await listAccountHistory(own,{limit:1,cursor:page.nextCursor!});
  assert.equal(next.data[0].id,'order-own-new');
  assert.ok(next.nextCursor);
  const afterTie = await listAccountHistory(own,{limit:1,cursor:next.nextCursor!});
  assert.equal(afterTie.data[0].id,'order-legacy-email');
  assert.equal(await getAccountHistoryOrder(own,'order-other'),null);
  assert.equal(await getAccountHistoryOrder(own,'order-other-matching-email'),null);
  assert.equal(await getAccountHistoryOrder(own,'order-failed-unpaid'),null);
  const unverified = await listAccountHistory({uid:own.uid,email:own.email,emailVerified:false},{limit:20});
  assert.equal(unverified.data.some(row=>row.id==='order-legacy-email'),false);
  assert.equal(unverified.data.some(row=>row.id==='order-own-new'),true);
  assert.equal(unverified.data.some(row=>row.id==='order-failed-unpaid'),false);
  console.log('account history synthetic-storage checks passed');
}

void run().finally(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
