import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.SMN_TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smn-free-order-safety-'));
  process.env.LOB_ENV = 'free_order_safety_test';
  const firebase = await import('../lib/firebase-admin');
  const { POST } = await import('../app/api/checkout/complete-free-order/route');
  const { submitFreeOrderToSupplier } = await import('../lib/free-order-dispatch');
  const orders = firebase.getOrdersCollection();
  const now = Date.now();

  const makeOrder = (id: string, status: string, overrides: Record<string, unknown> = {}) => ({
    id, status, amountInCents: 0, finalAmountInCents: 0, isTest: false,
    discountCode: 'FREE100', createdAt: now, updatedAt: now,
    recipientAddress: { firstName: 'Pat', lastName: 'Sender', street1: '1 Main St', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
    returnAddress: { firstName: 'Alex', lastName: 'Sender', street1: '2 Main St', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
    ...overrides,
  });
  const post = (id: string) => POST(new NextRequest('http://localhost/api/checkout/complete-free-order', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: id, discountCode: 'FREE100' }),
  }));

  for (const status of ['PROCESSING_HANDWRYTTEN', 'MAILED', 'AWAITING_RECIPIENT_ADDRESS', 'DISPATCH_UNCERTAIN']) {
    const id = `replay-${status.toLowerCase()}`;
    await orders.doc(id).set(makeOrder(id, status, { dispatchStartedAt: now - 60_000 }));
    const response = await post(id);
    const body = await response.json();
    assert.equal(response.status, status === 'DISPATCH_UNCERTAIN' ? 409 : 200, `${status} replay is closed without supplier resubmission`);
    assert.equal(body.status, status);
    assert.equal(body.alreadyProcessed, true);
    assert.equal((await orders.doc(id).get()).data()?.status, status, `${status} remains terminal`);
  }

  const staleId = 'replay-stale-dispatch';
  await orders.doc(staleId).set(makeOrder(staleId, 'DISPATCHING', { dispatchStartedAt: now - 6 * 60_000 }));
  const stale = await post(staleId);
  assert.equal(stale.status, 409, 'stale dispatch lock moves to honest reconciliation state');
  assert.equal((await stale.json()).status, 'DISPATCH_UNCERTAIN');
  assert.equal((await orders.doc(staleId).get()).data()?.status, 'DISPATCH_UNCERTAIN');
  assert.equal((await post(staleId)).status, 409, 'replaying an uncertain order cannot reacquire the provider lock');

  const activeId = 'active-dispatch-lock';
  await orders.doc(activeId).set(makeOrder(activeId, 'DISPATCHING', { dispatchStartedAt: Date.now() }));
  const active = await post(activeId);
  assert.equal(active.status, 200, 'a still-live lock remains in progress without starting another supplier call');
  assert.equal((await active.json()).alreadyProcessed, true);
  assert.equal((await orders.doc(activeId).get()).data()?.status, 'DISPATCHING');

  const noTimestampId = 'dispatch-without-timestamp';
  await orders.doc(noTimestampId).set(makeOrder(noTimestampId, 'DISPATCHING'));
  assert.equal((await post(noTimestampId)).status, 409, 'a lock with no trustworthy start time fails closed as uncertain');
  assert.equal((await orders.doc(noTimestampId).get()).data()?.status, 'DISPATCH_UNCERTAIN');

  let providerCalls = 0;
  const updates: Array<{ id: string; update: Record<string, unknown> }> = [];
  const incidents: Array<Record<string, unknown>> = [];
  const dependencies = {
    isPaused: async () => false,
    fulfill: async () => { providerCalls++; throw new Error('timeout after possible supplier acceptance'); },
    updateStatus: async (id: string, update: any) => { updates.push({ id, update }); },
    logIncident: async (incident: any) => { incidents.push(incident); return 'incident-test'; },
  };
  const ambiguousOrder = makeOrder('ambiguous-provider-timeout', 'DISPATCHING') as any;
  const uncertain = await submitFreeOrderToSupplier(ambiguousOrder, dependencies as any);
  assert.deepEqual(uncertain, { kind: 'uncertain' });
  assert.equal(providerCalls, 1, 'fake provider is invoked only for the first claimed dispatch');
  assert.equal(updates[0]?.update.status, 'DISPATCH_UNCERTAIN');
  assert.equal(incidents.length, 1, 'ambiguous provider outcome is operator-visible');
  await orders.doc(ambiguousOrder.id).set(makeOrder(ambiguousOrder.id, 'DISPATCH_UNCERTAIN', { fulfillmentError: updates[0]?.update.fulfillmentError }));
  const ambiguousReplay = await post(ambiguousOrder.id);
  assert.equal(ambiguousReplay.status, 409);
  assert.equal(providerCalls, 1, 'replaying the persisted uncertain order does not invoke the provider again');

  const falseResult = await submitFreeOrderToSupplier(ambiguousOrder, {
    ...dependencies,
    fulfill: async () => { providerCalls++; return { success: false, error: 'provider outcome unconfirmed' } as any; },
  } as any);
  assert.deepEqual(falseResult, { kind: 'uncertain' }, 'an ambiguous false provider result is never converted to a blind-retry queue');
  assert.equal(updates.at(-1)?.update.status, 'DISPATCH_UNCERTAIN');

  let pausedProviderCalls = 0;
  const queued = await submitFreeOrderToSupplier(ambiguousOrder, {
    ...dependencies,
    isPaused: async () => true,
    fulfill: async () => { pausedProviderCalls++; return { success: true, order_id: 'never' } as any; },
  } as any);
  assert.deepEqual(queued, { kind: 'queued' });
  assert.equal(pausedProviderCalls, 0, 'fulfillment pause holds before the provider boundary');
  assert.equal(updates.at(-1)?.update.status, 'QUEUED_FOR_FULFILLMENT');

  console.log('free order safety tests passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
