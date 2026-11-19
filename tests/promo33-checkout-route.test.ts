import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';

async function run() {
  for (const key of Object.keys(process.env)) {
    if (/FIREBASE|GOOGLE|GCLOUD|K_SERVICE|STRIPE|HANDWRYTTEN|RESEND|PROMOTION/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { NODE_ENV: 'test', ALLOW_LOCAL_MOCK_PAYMENTS: 'true', INTERNATIONAL_MAILING_FAKE_ADAPTERS: 'true', SMN_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'smn-promo33-buyer-')) });
  const { NextRequest } = await import('next/server');
  const { POST: checkout } = await import('../app/api/checkout/create-intent/route');
  const { POST: validate } = await import('../app/api/discount/validate/route');
  const { POST: exchange } = await import('../app/api/discount/exchange/route');
  const { firestoreDb, getOrderById, getOrdersCollection } = await import('../lib/firebase-admin');
  const { offerCutoverRef } = await import('../lib/offer-balances');
  const { getOfferQuotesCollection, getOfferReservationsCollection } = await import('../lib/offer-engine');
  const { PROMOTION_CAMPAIGNS, PROMOTION_POLICIES, PROMOTION_CODES, promotionCodeId } = await import('../lib/promotions-v2-store');
  const { PROMOTION_SCHEDULES, PROMOTION_SELECTION } = await import('../lib/promotions-v2');
  const { FEATURE_FLAG_KEYS, updateFeatureFlag } = await import('../lib/feature-flags');
  await updateFeatureFlag(FEATURE_FLAG_KEYS.MULTI_SEND, true);
  await offerCutoverRef().set({ state: 'active', cutoverAt: Date.now() - 1000 });

  async function offer(code: string, workflow: 'single' | 'multisend', fields: object, distribution: 'public' | 'private' = 'public') {
    const campaignId = randomUUID();
    const id = `${campaignId}-policy`;
    const codeId = promotionCodeId(code, distribution)!;
    await firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(campaignId).set({ id: campaignId, status: 'active', revision: 1, policyVersionId: id, budgetCents: 30_000 });
    await firestoreDb.collection(PROMOTION_POLICIES).doc(id).set({ id, campaignId, workflow, scheduleVersion: PROMOTION_SCHEDULES[workflow],
      countryCodes: ['US'], match: 'all', audience: 'any', chargeTypes: ['card_base'], payableFloor: 'reject', selectionStrategy: PROMOTION_SELECTION, ...fields });
    await firestoreDb.collection(PROMOTION_CODES).doc(codeId).set({ id: codeId, campaignId, distribution });
    return { campaignId, codeId };
  }
  await offer('SYNTHETICDOMESTIC', 'multisend', { minimumQuantity: 5, maxDiscountCentsPerOrder: 900, benefit: { type: 'percentage', basisPoints: 2000 } });
  await offer('SYNTHETICCANADA', 'single', { countryCodes: ['CA'], chargeTypes: ['destination_surcharge'], benefit: { type: 'fixed_order', amountCents: 300 } });
  const restricted = await offer('SYNTHETICPRIVATE', 'single', { perSenderLimit: 1, benefit: { type: 'fixed_order', amountCents: 100 } }, 'private');

  const post = (handler: (request: InstanceType<typeof NextRequest>) => Promise<Response>, url: string, body: object, cookie?: string, uid?: string) => handler(new NextRequest(`http://localhost${url}`, {
    method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(uid ? { authorization: `Bearer mock_token_${uid}` } : {}) }, body: JSON.stringify(body),
  }));
  const preview = (body: object, cookie?: string, uid?: string) => post(validate, '/api/discount/validate', body, cookie, uid);
  const buy = (body: object, cookie?: string, uid?: string) => post(checkout, '/api/checkout/create-intent', body, cookie, uid);
  const address = { firstName: 'Synthetic', lastName: 'Sender', street1: '10 Main Street', city: 'Austin', state: 'TX', zip: '78701', country: 'US' };
  const canada = { ...address, country: 'CA', city: 'Vancouver', state: 'BC', zip: 'V6B 1A1' };
  const single = { checkoutDraftKey: randomBytes(24).toString('hex'), frontImageUrl: '/presets/synthetic.jpg', handwrittenNote: 'Synthetic test only.', recipientAddress: canada, returnAddress: address, contactPolicyVersion: 1 };
  const recipients = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `test-${i}`, country: 'US', address: { ...address, firstName: `Recipient ${i}`, street1: `${100 + i} Main Street` }, greeting: { mode: 'inherit' } }));
  const batchQuote = (quantity: number) => preview({ code: 'SYNTHETICDOMESTIC', workflow: 'multisend', recipients: recipients(quantity) }).then(res => res.json());
  const four = await batchQuote(4);
  assert.equal(four.reason, 'minimum_quantity');
  assert.equal(four.price.totalCents, 3600);
  for (const [quantity, total] of [[5, 3600], [8, 6300]]) {
    const quote = await batchQuote(quantity);
    assert.equal(quote.price.totalCents, total);
    assert.equal(quote.price.discountCents, 900);
  }
  const missingCountry = await (await preview({ code: 'SYNTHETICCANADA', country: null })).json();
  assert.equal(missingCountry.reason, 'destination_required');
  const wrongCountry = await (await preview({ code: 'SYNTHETICCANADA', country: 'US' })).json();
  assert.equal(wrongCountry.reason, 'wrong_country');
  assert.equal(wrongCountry.price.totalCents, 900);
  const canadaPrice = await (await preview({ code: 'SYNTHETICCANADA', country: 'CA' })).json();
  assert.equal(canadaPrice.price.basePriceCents, 900);
  assert.equal(canadaPrice.price.internationalSurchargeCents, 500);
  assert.equal(canadaPrice.price.discountCents, 300);
  assert.equal(canadaPrice.price.totalCents, 1100);
  assert.equal((await preview({ code: 'SYNTHETICCANADA', country: 'AQ' })).status, 400);
  assert.equal((await getOrdersCollection().get()).size, 0);
  assert.equal((await getOfferQuotesCollection().get()).size, 0);
  assert.equal((await getOfferReservationsCollection().get()).size, 0);

  const batch = await (await buy({ ...single, discountCode: 'SYNTHETICDOMESTIC', multiSend: { version: 1, checkoutId: randomUUID(), note: { text: 'Synthetic test only.', style: 'hwDavid' }, recipients: recipients(8) } })).json();
  assert.equal(batch.amountInCents, 6300);
  const batchOrder = await getOrderById(batch.orderId);
  assert.equal(batchOrder?.multiSend?.recipients.reduce((sum, item) => sum + item.amountInCents, 0), 6300);
  assert.deepEqual(batch.price.lines.map((line: { netCents: number }) => line.netCents), batchOrder?.multiSend?.recipients.map((item) => item.amountInCents));
  const paid = await (await buy({ ...single, discountCode: 'SYNTHETICCANADA' })).json();
  assert.equal(paid.amountInCents, 1100);
  assert.equal(paid.price.lines[0].components[1].discountCents, 300);
  const resume = await (await buy({ ...single, discountCode: 'SYNTHETICCANADA' })).json();
  assert.equal(resume.paymentIntentId, paid.paymentIntentId);
  const replaced = await (await buy({ ...single, recipientAddress: address, replaces: { orderId: paid.orderId, viewToken: paid.viewToken } })).json();
  assert.equal(replaced.amountInCents, 900);
  assert.equal((await getOrderById(paid.orderId))?.status, 'FAILED');
  const reapplied = await (await buy({ ...single, discountCode: 'SYNTHETICCANADA', replaces: { orderId: replaced.orderId, viewToken: replaced.viewToken } })).json();
  assert.equal(reapplied.amountInCents, 1100);
  assert.notEqual(reapplied.orderId, paid.orderId);
  assert.equal((await getOrderById(replaced.orderId))?.status, 'FAILED');

  const exchanged = await post(exchange, '/api/discount/exchange', { code: 'SYNTHETICPRIVATE' });
  assert.equal(exchanged.status, 200);
  const { reference } = await exchanged.json();
  const cookie = exchanged.headers.get('set-cookie')!.split(';')[0];
  assert.ok(reference && !reference.includes('SYNTHETICPRIVATE'));
  assert.equal((await (await preview({ reference, country: 'US' })).json()).reason, 'unavailable');
  assert.equal((await (await preview({ reference, country: 'US' }, cookie)).json()).reason, 'identity_required');
  const verified = await (await preview({ reference, country: 'US' }, cookie, 'same-uid')).json();
  assert.equal(verified.price.totalCents, 800);
  assert.equal(verified.code, undefined);
  const verifiedCheckout = await (await buy({ ...single, recipientAddress: address, checkoutDraftKey: randomBytes(24).toString('hex'), offerReference: reference }, cookie, 'same-uid')).json();
  assert.equal(verifiedCheckout.amountInCents, 800);
  assert.equal(verifiedCheckout.discountCode, restricted.codeId);
  const limited = await (await preview({ reference, country: 'US' }, cookie, 'same-uid')).json();
  assert.equal(limited.reason, 'sender_limit');
  const otherSender = await (await preview({ reference, country: 'US' }, cookie, 'another-uid')).json();
  assert.equal(otherSender.price.totalCents, 800);
  const stored = await getOrderById(verifiedCheckout.orderId);
  assert.ok(!JSON.stringify(stored).includes('SYNTHETICPRIVATE'));
  console.log('Promotion preview, authoritative buyer quote, exact multisend allocations, international repricing, private exchange and sender restrictions passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
