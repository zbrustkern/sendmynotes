import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || 'playwright');
const mocks = {
  'next/navigation': `export const useParams = () => ({ id: 'fixture' });`,
  'next/link': `export default 'a';`,
  'next/image': `export default 'img';`,
  './Step3EnvelopeAddressing': 'export const isInternationalCountry = () => false;',
  '@/components/CardPreview': 'export const CardPreview = () => null;',
  '@/components/AuthModal': 'export const AuthModal = () => null;',
  '@/context/AuthContext': `export const useAuth = () => ({ user: window.viewer || null });`,
  '@/components/multi-send/MultiSendOrderStatus': `import { createElement } from 'react'; export const MultiSendOrderStatus = () => createElement('div', null, 'Multi-send order status');`,
  'canvas-confetti': `export default () => {};`,
  '@/lib/google-ads': `export const hasGoogleAdsCheckoutProof = () => Boolean(window.__checkoutProof);
    export const purchaseConsentAllowed = () => true;
    export const cancelGoogleAdsPurchaseRetries = () => {};
    export const trackGoogleAdsPurchase = (event) => window.__events.push({ destination: 'google', orderId: event.orderId, url: location.href });`,
  '@/lib/meta-ads': `export const trackMetaPurchase = (event) => window.__events.push({ destination: 'meta', orderId: event.orderId, url: location.href });`,
  '@/lib/checkout-purchase-tags': `export const prepareCheckoutPurchaseTags = () => { window.__tagPreparations++; return true; };`,
};

async function bundle(contents) {
  return build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true,
    write: false,
    jsx: 'automatic',
    plugins: [{
      name: 'synthetic-order-ui',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: 'mock' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: mocks[path], loader: 'js', resolveDir: process.cwd() }));
      },
    }],
  });
}

const trackerBundle = await bundle(`import React from 'react'; import { createRoot } from 'react-dom/client';
  import { OrderTracker } from './app/order/[id]/OrderTracker';
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  window.renderTracker = () => root.render(React.createElement(OrderTracker, { orderId: 'fixture' })); window.renderTracker();`);
const returnBundle = await bundle(`import React from 'react'; import { createRoot } from 'react-dom/client';
  import Page from './app/order/[id]/return/page';
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  root.render(React.createElement(Page));`);
const confirmationBundle = await bundle(`import React from 'react'; import { createRoot } from 'react-dom/client';
  import { Step5Confirmation } from './components/v3/Step5Confirmation';
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  window.renderConfirmation = (cardQuantity = 1) => root.render(React.createElement(Step5Confirmation, {
    cardQuantity, orderId: 'fixture', viewToken: 'checkout-fixture', cardTitle: 'Sample Card', cardUrl: '/front.png',
    occasion: 'Thank you', salutation: '', bodyNote: 'Hello', signOff: '', fontClass: '',
    recipient: { fullName: 'Sample Recipient', firstName: 'Sample', lastName: 'Recipient', street1: '1 Example Lane', city: 'Example City', state: 'IL', zip: '00000', country: 'US' },
    sender: { fullName: 'Sample Sender', firstName: 'Sample', lastName: 'Sender', street1: '2 Example Street', city: 'Example City', state: 'IL', zip: '00000', country: 'US' },
    customerEmail: '', amountInCents: 900, onSendAnotherCard: () => {},
  })); window.renderConfirmation();`);

const address = { firstName: 'Sample', lastName: 'Recipient', street1: '1 Example Lane', city: 'Example City', state: 'IL', zip: '00000', country: 'US' };
const measurement = { version: 1, transactionId: 'fixture', amountInCents: 900, currency: 'USD', verifiedAt: Date.now(), eligible: true, reason: 'eligible', refundStatus: 'unknown', itemCount: 1 };
const privateOrder = (status = 'MAILED', multiSend = false) => ({
  id: 'fixture', origin: 'CUSTOMER_CHECKOUT', status, isRedacted: false,
  recipientAddress: address, returnAddress: { ...address, firstName: 'Sample Sender' },
  customerEmail: '', contactEmailChoice: 'omitted', frontImageUrl: '/front.png', handwrittenNote: 'Synthetic private message',
  printedMessage: '', amountInCents: 900, fulfillmentStatus: status, purchaseMeasurement: measurement,
  ...(status === 'PENDING_PAYMENT' ? { stripePaymentId: 'pi-fixture' } : {}),
  ...(multiSend ? { multiSendView: { redacted: false, quantity: 2, deliveries: [] } } : {}),
});

const browser = await chromium.launch({ executablePath: process.env.SMN_CHROMIUM_EXECUTABLE });
let scenario;

async function installApiRoutes(page, { pathBundle = trackerBundle, isReturnRoute = false } = {}) {
  const htmlFor = (script) => `<!doctype html><html><body><script defer src="/${script}.js"></script></body></html>`;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== 'GET') scenario.writes.push({ method: request.method(), path, headers: request.headers() });

    if (path === '/order/fixture/return' && isReturnRoute) return route.fulfill({ contentType: 'text/html', body: htmlFor('return') });
    if (path === '/order/fixture' || path === '/order/fixture/return') return route.fulfill({ contentType: 'text/html', body: htmlFor('tracker') });
    if (path === '/tracker.js') return route.fulfill({ contentType: 'text/javascript', body: trackerBundle.outputFiles[0].text });
    if (path === '/return.js') return route.fulfill({ contentType: 'text/javascript', body: returnBundle.outputFiles[0].text });
    if (path === '/confirmation.js') return route.fulfill({ contentType: 'text/javascript', body: confirmationBundle.outputFiles[0].text });
    if (path === '/confirmation') return route.fulfill({ contentType: 'text/html', body: htmlFor('confirmation') });
    if (path === '/api/orders/fixture') {
      const headers = request.headers();
      scenario.reads.push({ url: request.url(), headers });
      if (headers['x-order-return-ticket']) {
        if (headers['x-order-return-ticket'] !== 'return-fixture' || scenario.invalidTicket) return route.fulfill({ status: 403, json: { error: 'unavailable' } });
        return route.fulfill({ json: { accessKind: 'read', readToken: 'read-fixture', order: privateOrder(scenario.status || 'MAILED') } });
      }
      if (headers['x-view-token']) {
        if (headers['x-view-token'] !== 'checkout-fixture' && headers['x-view-token'] !== 'legacy-view-fixture') return route.fulfill({ json: { order: { id: 'fixture', status: 'MAILED', isRedacted: true } } });
        return route.fulfill({ json: { accessKind: 'checkout', readToken: 'read-fixture', order: privateOrder(scenario.status || 'MAILED', scenario.multiSend) } });
      }
      if (headers['x-order-read-token']) {
        if (headers['x-order-read-token'] !== 'read-fixture') return route.fulfill({ status: 403, json: { error: 'unavailable' } });
        return route.fulfill({ json: { accessKind: 'read', readToken: 'read-fixture', order: privateOrder(scenario.status || 'MAILED', scenario.multiSend) } });
      }
      if (scenario.public) return route.fulfill({ json: { order: { id: 'fixture', status: scenario.status || 'MAILED', isRedacted: true } } });
      return route.fulfill({ json: { accessKind: scenario.accessKind || 'admin', readToken: 'read-fixture', order: privateOrder(scenario.status || 'MAILED', scenario.multiSend) } });
    }
    if (path === '/api/checkout/confirm-order' && request.method() === 'POST') {
      scenario.confirmCalls++;
      const body = request.postDataJSON();
      assert.equal(body.orderId, 'fixture');
      if (body.paymentIntentId !== 'pi-fixture') assert.equal(body.paymentIntentId, undefined);
      return route.fulfill({ json: { success: true, status: 'PAYMENT_RECEIVED', purchaseMeasurement: measurement } });
    }
    if (path === '/api/orders/fixture/access') {
      scenario.accessCalls++;
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers()['x-view-token'], 'checkout-fixture');
      return route.fulfill({ json: { readToken: 'read-fixture', returnTicket: 'return-fixture' } });
    }
    return route.abort();
  });
}

async function newSyntheticPage(context, opts = {}) {
  const page = await context.newPage();
  scenario = {
    reads: [], writes: [], events: [], confirmCalls: 0, accessCalls: 0,
    public: false, status: 'MAILED', multiSend: false, invalidTicket: false,
    ...opts,
  };
  await page.addInitScript(({ proof, token, clipboardFails, storageDenied, viewer }) => {
    window.viewer = viewer || null;
    window.__checkoutProof = Boolean(proof);
    window.__events = [];
    window.__tagPreparations = 0;
    try {
      if (token) window.sessionStorage.setItem('order_token_fixture', token);
    } catch {}
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value) => {
        if (clipboardFails) throw new Error('clipboard blocked');
        window.__clipboardText = value;
      },
    } });
    if (storageDenied) Object.defineProperty(window, 'sessionStorage', { configurable: true, value: {
      getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('storage denied'); }, removeItem() { throw new Error('storage denied'); },
    } });
  }, { proof: Boolean(opts.proof), token: opts.token, clipboardFails: Boolean(opts.clipboardFails), storageDenied: Boolean(opts.storageDenied), viewer: opts.viewer || null });
  await installApiRoutes(page, opts);
  await page.clock.install();
  return page;
}

try {
  // Bare references show safe status and stop polling as soon as the API redacts the order.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { public: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost/order/fixture');
    await page.getByRole('heading', { name: 'Mailed' }).waitFor();
    assert.equal(await page.getByText(address.street1).count(), 0);
    await page.clock.runFor(12000);
    assert.equal(scenario.reads.length, 1, 'redacted status must stop polling');
    assert.deepEqual(scenario.writes, []);
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // A guest private link is read-only, scrubbed from the address bar before a private copy action.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { storageDenied: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost/order/fixture#read=read-fixture');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.waitForFunction(() => location.pathname === '/order/fixture' && !location.search && !location.hash);
    assert.equal(scenario.reads[0].headers['x-order-read-token'], 'read-fixture');
    assert.equal(await page.locator('input').count(), 0, 'the private credential is absent from the DOM until fallback is needed');
    await page.getByRole('button', { name: 'Copy private order link' }).click();
    assert.equal(await page.evaluate(() => window.__clipboardText), 'http://localhost/order/fixture#read=read-fixture');
    assert.deepEqual(scenario.writes, []);
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Legacy query tracker links still work but credentials are never sent in an order URL.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context);
    await page.goto('http://localhost/order/fixture?token=legacy-view-fixture&payment_intent=pi-untrusted');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.waitForFunction(() => !location.search && !location.hash);
    assert.equal(scenario.reads[0].headers['x-view-token'], 'legacy-view-fixture');
    assert.ok(scenario.reads.every((entry) => !new URL(entry.url).searchParams.has('token')));
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // An authorized admin view stays read-only and never confirms or reports a purchase.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { proof: true, accessKind: 'admin' });
    await page.goto('http://localhost/order/fixture?review=admin');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.clock.runFor(6000);
    assert.equal(scenario.confirmCalls, 0);
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // An active checkout return has an order-bound ticket and active proof; it confirms once and reports once.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { proof: true, token: 'checkout-fixture', status: 'PENDING_PAYMENT' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost/order/fixture#read=read-fixture&return=return-fixture');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.clock.runFor(11000);
    assert.equal(scenario.confirmCalls, 1, 'pending active checkout reconciles once across polls');
    const events = await page.evaluate(() => window.__events);
    assert.deepEqual(events.map((event) => event.destination), ['google', 'meta']);
    assert.ok(events.every((event) => !new URL(event.url).searchParams.has('payment_intent') && !event.url.includes('return-fixture')));
    assert.equal(await page.evaluate(() => window.__tagPreparations), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(scenario.writes.map((write) => write.path), ['/api/checkout/confirm-order']);
    assert.equal(scenario.writes[0].headers['x-view-token'], 'checkout-fixture');
    await context.close();
  }

  // Owner access and account changes are passive views, even in a browser with an unrelated active marker.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { proof: true, accessKind: 'owner', viewer: { uid: 'account-a' } });
    await page.goto('http://localhost/order/fixture');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    for (const uid of [null, 'account-b', 'account-a']) {
      await page.evaluate((nextUid) => { window.viewer = nextUid ? { uid: nextUid } : null; window.renderTracker(); }, uid);
      await page.clock.runFor(5100);
    }
    assert.equal(scenario.confirmCalls, 0);
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // Stripe's return ticket survives a fresh browser without storage and never confirms payment by itself.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { isReturnRoute: true, storageDenied: true, status: 'PENDING_PAYMENT' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost/order/fixture/return?payment_intent=pi-fixture&payment_intent_client_secret=secret#return=return-fixture');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.waitForFunction(() => location.pathname === '/order/fixture' && !location.search && !location.hash);
    await page.clock.runFor(6000);
    assert.ok(scenario.reads.some((entry) => entry.headers['x-order-return-ticket'] === 'return-fixture'));
    assert.ok(scenario.reads.some((entry) => entry.headers['x-order-read-token'] === 'read-fixture'));
    assert.equal(scenario.confirmCalls, 0, 'a ticket alone grants only read access');
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(scenario.writes, []);
    assert.ok(scenario.reads.every((entry) => !new URL(entry.url).searchParams.has('payment_intent')));
    assert.deepEqual(errors, []);
    await context.close();
  }

  // An invalid or expired return ticket falls back to a public order reference without writing or tracking.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { isReturnRoute: true, invalidTicket: true });
    await page.goto('http://localhost/order/fixture/return?payment_intent=pi-fixture#return=return-fixture');
    await page.getByText('Your order link could not be opened').waitFor();
    assert.equal(scenario.confirmCalls, 0);
    assert.deepEqual(await page.evaluate(() => window.__events), []);
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // Single and batch confirmation show a private copy action, including omitted-email orders.
  for (const quantity of [1, 2]) {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { multiSend: quantity > 1 });
    await page.goto('http://localhost/confirmation');
    await page.waitForFunction(() => typeof window.renderConfirmation === 'function');
    await page.evaluate((value) => window.renderConfirmation(value), quantity);
    await page.getByRole('button', { name: 'Copy private order link' }).waitFor();
    if (quantity === 2) await page.getByText('Multi-send order status').waitFor();
    else await page.getByText('No email receipt requested').waitFor();
    assert.equal(await page.locator('input').count(), 0);
    await page.getByRole('button', { name: 'Copy private order link' }).click();
    assert.equal(await page.evaluate(() => window.__clipboardText), 'http://localhost/order/fixture#read=read-fixture');
    await page.clock.runFor(0);
    assert.deepEqual(await page.evaluate(() => window.__events), [], 'a restored confirmation without active checkout proof is passive');
    assert.equal(scenario.confirmCalls, 0);
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // The current confirmation emits one eligible event per destination only while active checkout proof exists.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { proof: true });
    await page.goto('http://localhost/confirmation');
    await page.waitForFunction(() => typeof window.renderConfirmation === 'function');
    await page.evaluate(() => window.renderConfirmation());
    await page.getByRole('button', { name: 'Copy private order link' }).waitFor();
    await page.evaluate(() => window.renderConfirmation());
    await page.waitForFunction(() => window.__events.length === 2);
    assert.deepEqual((await page.evaluate(() => window.__events)).map((event) => event.destination), ['google', 'meta']);
    assert.equal(scenario.confirmCalls, 0, 'confirmation views do not reconcile payment');
    assert.deepEqual(scenario.writes, []);
    await context.close();
  }

  // Clipboard denial presents a selectable fallback only after the explicit copy action.
  {
    const context = await browser.newContext();
    const page = await newSyntheticPage(context, { clipboardFails: true });
    await page.goto('http://localhost/order/fixture#read=read-fixture');
    await page.getByText('Mailing Destination', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Copy private order link' }).click();
    const fallback = page.getByLabel('Select and copy this private link:');
    await fallback.waitFor();
    assert.equal(await fallback.inputValue(), 'http://localhost/order/fixture#read=read-fixture');
    await context.close();
  }

  console.log('Synthetic tracker, payment-return, telemetry, and private-link browser checks passed.');
} finally {
  await browser.close();
}
