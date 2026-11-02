import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { resolveAccountOrderAssociation, recordAcceptedAccountOrder } from '../lib/account/order-association';
import { createContact } from '../lib/account/people';
import { createOccasion } from '../lib/account/occasions';
import { getOrdersCollection } from '../lib/firebase-admin';
const request=(uid?:string,origin='http://localhost:3000')=>new NextRequest('http://localhost:3000/api/checkout/create-intent',{method:'POST',headers:{host:'localhost:3000',origin,...(uid?{authorization:`Bearer mock_token_${uid}`}:{})}});
async function run(){
  const actor={uid:'association-owner',email:'association-owner@example.com',emailVerified:true};
  assert.deepEqual(await resolveAccountOrderAssociation(request(),{userId:actor.uid}),{},'guest cannot attach forged body uid');
  assert.deepEqual(await resolveAccountOrderAssociation(request(actor.uid),{userId:'another-account'}),{userId:actor.uid});
  await assert.rejects(()=>resolveAccountOrderAssociation(request(actor.uid,'https://foreign.invalid'),{}),/origin/);
  const person=await createContact(actor,{displayName:'Example Person'},'association-person-key');
  const occasion=await createOccasion(actor,{contactId:person.id,title:'Birthday',type:'birthday',month:12,day:20,recurrence:'annual',reminderEnabled:false},'association-occasion-key');
  const body={accountOccasionId:occasion.id,accountContactId:person.id};
  const association=await resolveAccountOrderAssociation(request(actor.uid),body);
  assert.equal(association.userId,actor.uid);assert.equal(association.accountOccasionId,occasion.id);assert.match(association.occasionOccurrenceDate!,/^\d{4}-12-20$/);
  await assert.rejects(()=>resolveAccountOrderAssociation(request('other-owner'),body),/no longer upcoming/);
  await assert.rejects(()=>resolveAccountOrderAssociation(request(actor.uid),{...body,accountContactId:'wrong-person'}),/different saved person/);
  const order={id:'order_account_acceptance_test',...association,status:'PENDING_PAYMENT',isTest:false,paymentMode:'live'} as any;
  await getOrdersCollection().doc(order.id).set(order);
  await recordAcceptedAccountOrder({...order,paymentMode:'stripe_test'});
  assert.equal((await getOrdersCollection().doc(order.id).get()).data()?.accountAcceptedAt,undefined);
  await recordAcceptedAccountOrder(order);
  assert.ok((await getOrdersCollection().doc(order.id).get()).data()?.accountAcceptedAt>0);
  console.log('Account order association: UID authority, CSRF, exact occurrence, foreign owner and trusted acceptance checks passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
