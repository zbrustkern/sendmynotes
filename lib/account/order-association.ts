import type { NextRequest } from 'next/server';
import type { Order } from '@/lib/types';
import { updateOrderStatus } from '@/lib/firebase-admin';
import { requireAccountActor, AccountError } from './http';
import { getOccasion } from './occasions';
import { suppressReminderForAcceptedOrder } from '@/lib/reminders-v2/engine';

/** Owner and occurrence are derived from the authenticated account, never a body UID. */
export async function resolveAccountOrderAssociation(req:NextRequest,body:Record<string,unknown>) {
  const needsAccount=Boolean(req.headers.get('authorization')||body.accountOccasionId||body.accountImage||body.uploadDesign);
  if(!needsAccount)return {};
  const actor=await requireAccountActor(req,true);
  if(!body.accountOccasionId)return {userId:actor.uid};
  if(typeof body.accountOccasionId!=='string')throw new AccountError('invalid','Choose a valid saved occasion.');
  const occasion=await getOccasion(actor,body.accountOccasionId);
  if(!occasion?.nextOccurrence)throw new AccountError('occasion_unavailable','This saved date is no longer upcoming. Review it before checkout.',409);
  if(body.accountContactId!==occasion.contactId)throw new AccountError('occasion_mismatch','This date belongs to a different saved person.',409);
  return {userId:actor.uid,accountOccasionId:occasion.id,occasionOccurrenceDate:occasion.nextOccurrence};
}

/** Invoke only after authoritative payment/promo acceptance. No supplier operation. */
export async function recordAcceptedAccountOrder(order:Order) {
  if(!order.userId||order.isTest||order.isFounderTest||order.isComp||order.origin==='ADMIN_COMP'||order.paymentMode==='local_mock'||order.paymentMode==='stripe_test')return;
  await updateOrderStatus(order.id,{accountAcceptedAt:order.accountAcceptedAt||Date.now()});
  if(order.accountOccasionId&&order.occasionOccurrenceDate)await suppressReminderForAcceptedOrder(order.userId,order.accountOccasionId,order.occasionOccurrenceDate,order.id);
}
