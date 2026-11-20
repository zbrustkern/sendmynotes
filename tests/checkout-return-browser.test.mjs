import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '@stripe/react-stripe-js': `import React from 'react';
    const elements={submit:async()=>({})};
    const stripe={confirmPayment:async({confirmParams})=>{window.returnUrls.push(confirmParams.return_url);return{error:{message:'Simulated return captured'}}}};
    export const useStripe=()=>stripe, useElements=()=>elements;
    export const Elements=({children})=>children;
    export function PaymentElement({onReady}){React.useEffect(()=>{onReady?.()},[]);return <div>Card fields</div>}
    export function ExpressCheckoutElement({onReady,onConfirm}){React.useEffect(()=>{onReady?.({availablePaymentMethods:{applePay:true}})},[]);return <button type="button" onClick={onConfirm}>Synthetic wallet</button>}`,
  '@stripe/stripe-js': 'export const loadStripe = () => Promise.resolve({});',
  'next/image': "import React from 'react'; export default ({alt})=><span>{alt}</span>",
  '@/components/flow/Sheet': "export const Sheet=()=>null;",
  '@/components/CardPreview': "export const CardPreview=()=>null;",
  './Step3EnvelopeAddressing': "export const isInternationalCountry=()=>false;",
  '@/lib/telemetry': 'export const trackEventV2=()=>{};',
  '@/lib/telemetry-milestones': 'export const emitMilestoneOnce=()=>{};',
};
const fixture = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { CheckoutStep } from './components/CheckoutStep';
  import { Step4ReviewAndPayment } from './components/v3/Step4ReviewAndPayment';

  window.returnUrls = [];
  const address = { fullName: 'Sample Person', street1: '1 Fixture Lane', city: 'Sample City', state: 'IL', zip: '00000' };
  const props = {
    orderId: 'order_fixture', viewToken: 'fixture-private-checkout', clientSecret: 'pi_fixture_secret',
    publishableKey: 'pk_test_fixture', isFree: false, isMock: false, customerEmail: 'sender@example.invalid',
    onChangeCustomerEmail() {}, onBack() {}, onSuccess() {}, onPaymentSuccess() {},
    sender: address, recipient: address, bodyNote: 'Synthetic note', cardTitle: 'Sample', signOff: 'Sender',
    fontClass: 'fixture', cardUrl: '/front', salutation: 'Hello', occasion: 'Fixture', amountInCents: 900,
  };
  const PaymentForm = location.pathname === '/legacy' ? CheckoutStep : Step4ReviewAndPayment;
  createRoot(document.getElementById('root')).render(<PaymentForm {...props} />);
`;
const bundle = await build({
  absWorkingDir: root,
  stdin: { resolveDir: root, loader: 'tsx', contents: fixture },
  bundle: true, jsx: 'automatic', write: false,
  define: { 'process.env': '{}', 'process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': JSON.stringify('pk_test_fixture') },
  plugins: [{
    name: 'isolated-checkout',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => {
        if (Object.hasOwn(mocks, path)) return { path, namespace: 'mock' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
        contents: mocks[path], loader: 'tsx', resolveDir: root,
      }));
    },
  }],
});

const browser = await chromium.launch({ executablePath: process.env.SMN_CHROMIUM_EXECUTABLE });
try {
  for (const method of ['legacy', 'card', 'wallet']) {
    const page = await browser.newPage();
    const errors = [];
    const accessHeaders = [];
    const unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== 'http://localhost') return route.abort();
      if (url.pathname === '/' + method) {
        return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/bundle.js"></script>' });
      }
      if (url.pathname === '/bundle.js') return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
      if (url.pathname === '/api/orders/order_fixture/access') {
        accessHeaders.push(request.headers()['x-view-token']);
        return route.fulfill({ json: { returnTicket: 'return_fixture', readToken: 'read_fixture' } });
      }
      if (url.pathname === '/api/checkout/contact') return route.fulfill({ json: { success: true } });
      if (url.pathname.startsWith('/api/')) unexpected.push(url.pathname);
      return route.abort();
    });
    await page.goto('http://localhost/' + method);
    if (method === 'wallet') await page.getByRole('button', { name: 'Synthetic wallet' }).click();
    else await page.locator('button[type=submit]').last().click();
    await page.waitForFunction(() => window.returnUrls.length > 0);
    const url = new URL(await page.evaluate(() => window.returnUrls[0]));
    assert.equal(url.origin, 'http://localhost');
    assert.equal(url.pathname, '/order/order_fixture/return');
    assert.equal(url.search, '');
    assert.equal(url.hash, '#return=return_fixture');
    assert.ok(accessHeaders.includes('fixture-private-checkout'));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await page.close();
    console.log(method + ' supplies a scoped first-party payment return URL.');
  }
} finally {
  await browser.close();
}
