import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
require('./support/deny-external-network.cjs');
const fixtureDir = mkdtempSync(join(tmpdir(), 'smn-order-tracker-purchase-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  USE_MOCK_FIRESTORE: 'true',
  SMN_TEST_DATA_DIR: fixtureDir,
  ADMIN_AUTHORIZED_EMAILS: 'tracker-admin@example.test',
  ADMIN_SESSION_SIGNING_KEY: 'synthetic-local-order-tracker-test-signing-key',
});
require('tsx/cjs');

const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || 'playwright');
const { NextRequest } = require('next/server');
const { getOrdersCollection, isFirestoreMock } = require('../lib/firebase-admin.ts');
const { createOrderReadToken } = require('../lib/order-access-credentials.ts');
const { GET: orderRoute } = require('../app/api/orders/[id]/route.ts');
const { POST: adminLogin } = require('../app/api/admin/auth/route.ts');

const origin = 'https://sendmynotes.com';
const orderId = 'synthetic-tracker-purchase';
const trackerPath = '/order/' + orderId;
const apiPath = '/api/orders/' + orderId;
const params = { params: Promise.resolve({ id: orderId }) };
const viewToken = 'synthetic-checkout-capability-for-local-browser-test';
const readToken = createOrderReadToken(orderId, viewToken);
const paymentIntentId = 'pi_synthetic_browser_only';
const address = { firstName: 'Synthetic', lastName: 'Recipient', street1: 'Synthetic QA address',
  city: 'Sampletown', state: 'ZZ', zip: '00000', country: 'US' };
const measurement = { version: 1, transactionId: orderId, amountInCents: 900,
  currency: 'USD', eligible: true, reason: 'eligible', refundStatus: 'unknown', verifiedAt: Date.now() };

const mocks = {
  'next/navigation': `export const useParams = () => ({ id: ${JSON.stringify(orderId)} });`,
  'next/link': "export default 'a';",
  'next/image': "export default 'img';",
  '@/components/AuthModal': 'export const AuthModal = () => null;',
  '@/context/AuthContext': `export const useAuth = () => ({
    user: null, saveAddress: () => window.__addressSaves++
  });`,
};

async function fixtureBundle() {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import Tracker from './app/order/[id]/page';
        createRoot(document.body.appendChild(document.createElement('div'))).render(React.createElement(Tracker));`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, jsx: 'automatic',
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'synthetic-next-router', setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: 'tracker-fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'tracker-fixture' }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  return result.outputFiles[0].text;
}

async function checkTracker(browser, bundle, scenario) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [];
  try {
    if (scenario.adminCookie) {
      const { name, value } = scenario.adminCookie;
      await context.addCookies([{ name, value, url: origin, httpOnly: true, secure: true }]);
    }
    await context.addInitScript(({ id, token }) => {
      window.__google = [];
      window.__meta = [];
      window.__addressSaves = 0;
      window.gtag = (...args) => window.__google.push(args);
      window.fbq = (...args) => window.__meta.push(args);
      // Each context starts with a same-order proof, but no prior deduplication keys.
      sessionStorage.setItem('smn_checkout_active_' + id, String(Date.now() + 120000));
      sessionStorage.setItem('order_token_' + id, token);
    }, { id: orderId, token: viewToken });
    const mutations = [];
    let apiReads = 0;
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (request.method() === 'GET') {
        if (url.pathname === trackerPath) return route.fulfill({ contentType: 'text/html',
          body: '<script defer src="/tracker.js"></script>' });
        if (url.pathname === '/tracker.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
        if (url.pathname === apiPath) {
          apiReads++;
          const headers = new Headers(await request.allHeaders());
          const cookies = await context.cookies(url.href);
          if (cookies.length) headers.set('cookie', cookies.map(cookie => cookie.name + '=' + cookie.value).join('; '));
          const response = await orderRoute(new NextRequest(url.href, { headers }), params);
          return route.fulfill({ status: response.status, body: await response.text(), contentType: 'application/json' });
        }
      } else if (request.method() === 'POST' && url.pathname === '/api/checkout/confirm-order') {
        mutations.push('confirm');
        assert.equal(request.headers()['x-view-token'], viewToken);
        assert.deepEqual(request.postDataJSON(), { orderId, paymentIntentId });
        // Only the synthetic fixture is settled. The real confirmation and fulfillment handlers are never invoked.
        await getOrdersCollection().doc(orderId).update({ status: 'PROCESSING_HANDWRYTTEN', purchaseMeasurement: measurement });
        return route.fulfill({ json: { success: true, status: 'PROCESSING_HANDWRYTTEN', purchaseMeasurement: measurement } });
      } else if (request.method() === 'POST' && url.pathname === '/api/telemetry/conversion-queue') {
        mutations.push('conversion-queue');
        return route.fulfill({ status: 204 });
      } else {
        mutations.push(url.pathname);
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(origin + trackerPath + scenario.suffix);
    const expected = scenario.public ? 'Your order details are private' : address.street1;
    await page.getByText(expected, { exact: true }).waitFor();
    if (scenario.public) {
      const readsBeforeClock = apiReads;
      await page.clock.runFor(15500);
      assert.equal(apiReads, readsBeforeClock, 'public tracker stops polling');
    } else {
      for (let poll = 0; poll < 2; poll++) {
        const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === apiPath);
        await page.clock.runFor(5200);
        await response;
        await page.waitForTimeout(50);
      }
    }
    const events = await page.evaluate(() => ({
      google: window.__google.map(call => call[1]),
      meta: window.__meta.map(call => [call[0], call[1]]),
      addressSaves: window.__addressSaves,
    }));
    const expectedCount = scenario.active ? 1 : 0;
    assert.equal(events.google.filter(event => event === 'conversion').length, expectedCount);
    assert.equal(events.google.filter(event => event === 'purchase').length, expectedCount);
    assert.equal(events.meta.filter(([method, event]) => method === 'track' && event === 'Purchase').length, expectedCount);
    assert.equal(events.meta.filter(([method]) => method === 'setUserProperties').length, expectedCount);
    assert.equal(events.addressSaves, 0);
    assert.equal(mutations.filter(target => target === 'confirm').length, expectedCount);
    assert.ok(mutations.every(target => scenario.active && ['confirm', 'conversion-queue'].includes(target)));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

let browser;
try {
  assert.equal(isFirestoreMock, true);
  await getOrdersCollection().doc(orderId).set({
    id: orderId, status: 'PENDING_PAYMENT', origin: 'CUSTOMER_CHECKOUT', paymentMethod: 'STRIPE',
    customerEmail: 'synthetic-buyer@example.test', recipientAddress: address,
    returnAddress: { ...address, street1: 'Synthetic return address' },
    viewToken, stripePaymentId: paymentIntentId, amountInCents: 900,
    handwrittenNote: 'Synthetic order', printedMessage: 'Synthetic note', fontStyleId: 'hwDavid',
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  const admin = await adminLogin(new NextRequest(origin + '/api/admin/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: 'mock_token_tracker-admin@example.test' }),
  }));
  const adminCookie = admin.cookies.get('smn_admin_session');
  assert.equal(admin.status, 200);
  assert.ok(adminCookie?.value);
  const bundle = await fixtureBundle();
  browser = await chromium.launch({ executablePath: process.env.SMN_CHROMIUM_EXECUTABLE,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  await checkTracker(browser, bundle, { suffix: '#checkout=1', active: true });
  await checkTracker(browser, bundle, { suffix: '', public: true });
  await checkTracker(browser, bundle, { suffix: '?review=admin', adminCookie });
  await checkTracker(browser, bundle, { suffix: '#read=' + encodeURIComponent(readToken) });
  await checkTracker(browser, bundle, { suffix: '?token=' + encodeURIComponent(viewToken) });
  await checkTracker(browser, bundle, { suffix: '?viewToken=' + encodeURIComponent(viewToken) });
  await checkTracker(browser, bundle, { suffix: '#viewToken=' + encodeURIComponent(viewToken) });
  console.log('Active checkout confirms and reports Google and Meta once. Public, admin, receipt, and legacy revisits stay passive with prior checkout proof.');
} finally {
  await browser?.close();
  rmSync(fixtureDir, { recursive: true, force: true });
}
