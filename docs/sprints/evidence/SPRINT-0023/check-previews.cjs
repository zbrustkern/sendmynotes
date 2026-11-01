const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixtures = require('./browser-fixtures.cjs');

const base = 'http://127.0.0.1:3122';
const out = path.join(__dirname, 'checks/previews');
const viewportWidths = [320, 375, 390, 430, 768, 1280];
fs.mkdirSync(out, { recursive: true });

const styles = ['hwDavid', 'hwChase', 'hwKate', 'hwAdam', 'hwWill'];
const variants = [
  ...styles.map((fontStyleId, index) => ({
    ...fixtures.order,
    id: `preview-font-${fontStyleId}`,
    fontStyleId,
    printedMessage: 'Dear Sample Friend,',
    handwrittenNote: `Thank you for helping our family. This sample checks ${fontStyleId} in the shared approximate interior preview.\n\nWith appreciation,\nSample Sender`,
  })),
  { ...fixtures.order, id: 'preview-font-legacy-numeric', fontStyleId: '1', handwrittenNote: 'Legacy numeric style alias sample.' },
  { ...fixtures.order, id: 'preview-font-legacy-string', fontStyleId: 'font-casual', handwrittenNote: 'Legacy string style alias sample.' },
  { ...fixtures.order, id: 'preview-font-unknown', fontStyleId: 'fixture-unknown-style', handwrittenNote: 'Unknown style should use a disclosed readable fallback.' },
  { ...fixtures.order, id: 'preview-font-blank', fontStyleId: 'hwDavid', printedMessage: '', handwrittenNote: '', intentionalBlank: true },
  { ...fixtures.order, id: 'preview-font-long', fontStyleId: 'hwKate', printedMessage: 'Dear Sample Friend,', handwrittenNote: (`This long synthetic paragraph checks complete readable text, bounded preview sizing, and explicit overflow reporting. ${fixtures.note}\n\n`).repeat(18) + '\nWith care,\nSample Sender' },
];
const orderById = new Map(variants.map((order) => [order.id, order]));
const metrics = { ...fixtures.metrics, recentOrders: variants };

function rootState(root) {
  return root.evaluate((node) => ({
    fontId: node.getAttribute('data-font-id'),
    fontAvailable: node.getAttribute('data-font-available'),
    fontState: node.getAttribute('data-font-state'),
    overflow: node.getAttribute('data-overflow'),
    empty: node.getAttribute('data-preview-empty'),
    text: node.innerText,
    leaf: (() => { const el = node.querySelector('[data-note-preview-leaf]'); return el ? { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null; })(),
    renderedText: (() => { const el = node.querySelector('[data-note-preview-text]'); if (!el) return null; const range = document.createRange(); range.selectNodeContents(el); const lineCount = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).length; return { text: el.innerText, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, lineCount }; })(),
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const errors = [];
  const apiCalls = [];
  const externalRequests = [];
  const fontRequests = { delayed: false, failed: false };
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const owner = fixtures.identity('preview-admin', 'preview-admin@example.test');
  await fixtures.seed(context, owner);
  await fixtures.firebase(context, () => owner);
  await context.addInitScript(() => {
    const originalLoad = FontFaceSet.prototype.load;
    window.__previewFontFixture = { delayed: false, failed: false };
    FontFaceSet.prototype.load = function (font, ...args) {
      if (/HandwryttenKate/i.test(font)) { window.__previewFontFixture.failed = true; return Promise.reject(new Error('synthetic failed font load')); }
      if (/HandwryttenAdam/i.test(font)) { window.__previewFontFixture.delayed = true; return new Promise((resolve, reject) => setTimeout(() => originalLoad.call(this, font, ...args).then(resolve, reject), 1600)); }
      return originalLoad.call(this, font, ...args);
    };
  });

  // All app APIs are synthetic and intercepted. This harness never creates an order or calls a supplier.
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    apiCalls.push({ path: url.pathname, method });
    if (url.pathname === '/api/admin/auth') return route.fulfill({ json: { success: true, authenticated: true, email: owner.email } });
    if (url.pathname === '/api/admin/metrics') return route.fulfill({ json: metrics });
    if (url.pathname === '/api/admin/order-proof') {
      const order = orderById.get(url.searchParams.get('orderId'));
      return route.fulfill({ json: { order, handwrytten: null, backplateUrl: '/aster-blanche-backplate.png' } });
    }
    if (url.pathname === '/api/admin/discounts') return route.fulfill({ json: { codes: [], stats: null } });
    if (url.pathname === '/api/admin/incidents') return route.fulfill({ json: { incidents: [], alertEmail: '' } });
    if (url.pathname === '/api/account') return route.fulfill({ json: { user: { uid: owner.uid, email: owner.email, savedAddresses: [] }, orders: [] } });
    if (url.pathname === '/api/upload/access') return route.fulfill({ json: { allowed: false, paused: false, used: 0, dailyLimit: 0 } });
    if (url.pathname.includes('telemetry') || url.pathname.includes('track') || url.pathname.includes('session')) return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: { success: true, fonts: [], addresses: [] } });
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !url.hostname.endsWith('googleapis.com')) {
      externalRequests.push(url.href);
      return route.abort();
    }
    return route.fallback();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${base}/admin`);
    const proofButton = page.getByRole('button', { name: /^(View )?Proof$/ }).first();
    await proofButton.waitFor({ timeout: 45000 });

    const observedFonts = [];
    for (let index = 0; index < variants.length; index++) {
      const order = variants[index];
      await page.getByRole('button', { name: /^(View )?Proof$/ }).nth(index).click();
      const root = page.locator('[data-note-interior-preview]').first();
      await root.waitFor({ timeout: 15000 });
      let state;
      if (order.id === 'preview-font-hwAdam') {
        await page.waitForFunction(() => document.querySelector('[data-note-interior-preview]')?.getAttribute('data-font-state') === 'loading', null, { timeout: 5000 });
        state = await rootState(root);
      } else {
        await page.evaluate(() => document.fonts.ready);
        state = await rootState(root);
      }
      assert(state.leaf, `shared preview leaf exists for ${order.id}`);
      assert(state.renderedText, `shared preview text exists for ${order.id}`);
      if (order.id === 'preview-font-blank') {
        assert.equal(state.empty, 'true', 'intentionally blank order is represented as empty, not placeholder copy as submitted text');
        assert.match(state.renderedText.text, /No note text was saved/i, 'empty preview is represented with explicit placeholder copy');
      } else {
        assert.equal(state.renderedText.text, order.printedMessage.trim() ? `${order.printedMessage.trim()}\n\n${order.handwrittenNote.trim()}` : order.handwrittenNote.trim(), `every character through final signature for ${order.id}`);
      }
      const expectedResolvedFont = order.id === 'preview-font-legacy-numeric' || order.id === 'preview-font-legacy-string' ? 'hwDavid' : order.fontStyleId;
      assert.equal(state.fontId, expectedResolvedFont, `font alias resolves consistently for ${order.id}`);
      if (order.id === 'preview-font-unknown') assert.equal(state.fontState, 'unavailable', 'unknown font is visibly flagged');
      if (order.fontStyleId === 'hwKate' && order.id === 'preview-font-hwKate') {
        fontRequests.failed = await page.evaluate(() => window.__previewFontFixture?.failed === true);
        assert(fontRequests.failed, 'failed-font fixture intercepted hwKate');
        await page.waitForFunction(() => document.querySelector('[data-note-interior-preview]')?.getAttribute('data-font-state') === 'fallback', null, { timeout: 5000 });
        state = await rootState(root);
        assert.equal(state.fontState, 'fallback', 'failed font uses and discloses a readable fallback');
      }
      if (order.fontStyleId === 'hwAdam' && order.id === 'preview-font-hwAdam') {
        fontRequests.delayed = await page.evaluate(() => window.__previewFontFixture?.delayed === true);
        assert(fontRequests.delayed, 'slow-font fixture intercepted hwAdam');
        assert.equal(state.fontState, 'loading', 'slow font loading state is visible before font readiness');await page.waitForFunction(()=>document.querySelector('[data-note-interior-preview]')?.getAttribute('data-font-state')==='ready');state=await rootState(root);
      } else if (styles.includes(order.fontStyleId) && order.fontStyleId !== 'hwKate') {
        await page.waitForFunction(() => document.querySelector('[data-note-interior-preview]')?.getAttribute('data-font-state') === 'ready', null, { timeout: 10000 });
        state = await rootState(root);
      }
      if (order.id === 'preview-font-long') {
        assert(state.renderedText.text.includes('Sample Sender'), 'long-note selectable text retains the sign-off');
        assert.equal(state.overflow, 'true', 'long text reports overflow rather than silently clipping');await root.getByText('Read complete note',{exact:true}).click();assert.equal(await root.getByRole('region',{name:'Complete note text',exact:true}).innerText(),`${order.printedMessage.trim()}\n\n${order.handwrittenNote.trim()}`);
      }
      observedFonts.push({ orderId: order.id, expectedFontId: order.fontStyleId, ...state });
      if (styles.includes(order.fontStyleId) || order.id.includes('unknown') || order.id.includes('long') || order.id.includes('blank')) {
        await page.screenshot({ path: path.join(out, `${order.id}.png`), fullPage: false });
      }

      if (index === 0 || order.id === 'preview-font-long') {
        const wrapMeasurements = [];
        for (const width of viewportWidths) {
          await page.setViewportSize({ width, height: 950 });
          await page.waitForTimeout(120);
          const responsive = await rootState(root);
          assert(responsive.leaf, `preview remains mounted at ${width}px`);const dialogBox=await page.getByRole('dialog').boundingBox();assert(dialogBox.x>=0&&dialogBox.x+dialogBox.width<=width+1&&dialogBox.y>=0&&dialogBox.y+dialogBox.height<=951,'modal stays inside viewport');const closeBox=await page.getByRole('button',{name:'Close card preview',exact:true}).boundingBox();assert(closeBox.x>=0&&closeBox.x+closeBox.width<=width,'close control reachable');
          const ratio = responsive.leaf.width / responsive.leaf.height;
          assert(Math.abs(ratio - (17 / 22)) < 0.04, `leaf keeps 17:22 proportion at ${width}px (got ${ratio})`);
          assert(responsive.renderedText.scrollWidth <= responsive.renderedText.clientWidth + 1, `text does not overflow horizontally at ${width}px`);
          assert(responsive.renderedText.lineCount > 0, `visual text has measurable wrapped lines at ${width}px`);
          wrapMeasurements.push({ width, lineCount: responsive.renderedText.lineCount, leafWidth: responsive.leaf.width, leafHeight: responsive.leaf.height });
          await page.screenshot({ path: path.join(out, `${order.id}-${width}.png`), fullPage: false });
        }
        assert(Math.max(...wrapMeasurements.map((entry) => entry.lineCount)) - Math.min(...wrapMeasurements.map((entry) => entry.lineCount)) <= 1, `reference-scaled wrapping remains stable across tested widths: ${JSON.stringify(wrapMeasurements)}`);
        observedFonts.push({ orderId: `${order.id}-wrap-metrics`, wrapMeasurements });
        await page.setViewportSize({ width: 1280, height: 1000 });
      }

      await page.getByRole('button',{name:'Close card preview',exact:true}).click();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('[data-note-interior-preview]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    }

    // Verify the customer path uses the same component from the real note step and preview-card dialog.
    const customer = await context.newPage();
    customer.on('pageerror', (error) => errors.push(error.message));
    await customer.goto(`${base}/new?step=note`);
    await customer.getByPlaceholder('e.g. Dear Sarah,').fill('Dear Sample Friend,');
    await customer.getByPlaceholder('Write your note from the heart...').fill('Thank you for bringing warmth and kindness to our family.');
    await customer.getByPlaceholder('e.g. Warmly, Ezekiel').fill('With appreciation, Sample Sender');
    await customer.getByRole('button', { name: /Preview card/i }).first().click();
    const customerRoot = customer.locator('[data-note-interior-preview]').first();
    await customerRoot.waitFor({ timeout: 15000 });
    const customerState = await rootState(customerRoot);
    assert(customerState.renderedText, 'customer Preview card shows shared interior renderer');
    assert(customerState.renderedText.text.includes('Dear Sample Friend') && customerState.renderedText.text.includes('With appreciation, Sample Sender'), 'customer preview uses greeting, body, and sign-off');
    await customer.setViewportSize({ width: 390, height: 844 });
    await customer.screenshot({ path: path.join(out, 'customer-preview-390.png'), fullPage: false });

    const summary = {
      passed: true,
      checks: [
        'admin /admin → Proof button → Card preview',
        'all five font IDs, legacy numeric/string aliases, and unknown fallback',
        'blank and long synthetic messages, salutation, note, and sign-off',
        '17:22 leaf geometry and horizontal text bounds at 320/375/390/430/768/1280px',
        'customer /new note step → Preview card uses shared renderer',
      'slow hwAdam font and failed hwKate font states are exercised',
        'all /api/** responses mocked; no supplier/order creation',
      ],
      variants: observedFonts.map(({ orderId, expectedFontId, fontId, fontAvailable, fontState, overflow, empty, wrapMeasurements }) => ({ orderId, expectedFontId, fontId, fontAvailable, fontState, overflow, empty, wrapMeasurements })),
      customerPreview: { fontId: customerState.fontId, fontState: customerState.fontState, overflow: customerState.overflow },
      apiResponses: 'synthetic interception for deterministic UI validation',
      apiCallCount: apiCalls.length,
      pageErrors: errors,
      blockedExternalRequests: externalRequests,
    };
    fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    assert.equal(errors.length, 0, 'no browser page errors');
    assert(externalRequests.every(url=>new URL(url).hostname==='fonts.gstatic.com'||url==='https://js.stripe.com/v3'), 'only expected static font/payment-loader resources were blocked; no supplier requests');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
