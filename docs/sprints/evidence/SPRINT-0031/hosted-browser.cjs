#!/usr/bin/env node
'use strict';

/**
 * Independent hosted acceptance harness for Sprint 0031.
 *
 * Usage:
 *   node docs/sprints/evidence/SPRINT-0031/hosted-browser.cjs \
 *     --origin https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app \
 *     --output docs/sprints/evidence/SPRINT-0031/passed/staging
 *
 * Optional explicit arms:
 *   --control-session sess_smn31_control --treatment-session sess_smn31_treatment
 * Optional route for the quick second entry: --quick-path /send?utm_source=google
 *
 * The script uses the existing SMN_PLAYWRIGHT_MODULE fallback (or `playwright`),
 * and BROWSER_EXECUTABLE_PATH when set. No package installation is performed.
 * Every browser context uses a synthetic Playwright user-agent and deterministic
 * smn_session_v2 / smn_journey_v2 identities. It does not use a feature bypass.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = process.env.SMN_PLAYWRIGHT_MODULE
  ? require(process.env.SMN_PLAYWRIGHT_MODULE)
  : require('playwright');

const args = parseArgs(process.argv.slice(2));
const origin = requireArg('origin');
const outputDir = path.resolve(requireArg('output'));
const quickPath = args['quick-path'] || '/send?utm_source=google';
const maxSeeds = 48;
const checks = [];
const intercepted = { telemetry: 0, analytics: 0, deniedSideEffects: 0, generationFixture: 0 };
const screenshots = [];

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'help') { result.help = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    result[key] = value;
  }
  return result;
}
function requireArg(name) {
  if (args.help) {
    console.log('Required: --origin https://host --output passed/directory');
    process.exit(0);
  }
  const value = args[name];
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}
function record(name, detail) { checks.push({ name, ...detail }); }
function safeOrigin(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--origin must use http or https');
  return parsed.origin;
}
const baseOrigin = safeOrigin(origin);
const syntheticImage = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 440"><rect width="340" height="440" fill="#dce6d7"/><circle cx="170" cy="205" r="92" fill="#d98743"/><path d="M105 147l-8-57 54 34m82 23 9-57-55 34" fill="#d98743"/><ellipse cx="170" cy="220" rx="60" ry="48" fill="#f2c28e"/><circle cx="148" cy="207" r="6"/><circle cx="192" cy="207" r="6"/><path d="M161 230q9 10 18 0" fill="none" stroke="#553b30" stroke-width="5" stroke-linecap="round"/><text x="170" y="390" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#31443c">Synthetic preview fixture</text></svg>'
);

function seededIds(sessionId) {
  const token = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45);
  return { sessionId: token, journeyId: `jny_${token.replace(/^sess_/, '')}` };
}
async function createContext(browser, sessionId, viewport) {
  const observedTelemetry = [];
  const context = await browser.newContext({
    viewport,
    userAgent: 'Mozilla/5.0 (compatible; Playwright Synthetic Acceptance)',
    deviceScaleFactor: 1,
  });
  const ids = seededIds(sessionId);
  await context.addInitScript(({ identity }) => {
    const now = Date.now();
    const session = JSON.stringify({ sessionId: identity.sessionId, startedAt: now, lastActivityAt: now });
    // journey-identity.ts checks localStorage first, then sessionStorage.
    localStorage.setItem('smn_session_v2', session);
    localStorage.setItem('smn_journey_v2', identity.journeyId);
    sessionStorage.setItem('smn_session_v2', session);
    sessionStorage.setItem('smn_journey_v2', identity.journeyId);
    // This is a synthetic, consented diagnostic session. All measurement is intercepted below.
    localStorage.setItem('smn_privacy_consent', 'granted');
  }, { identity: ids });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.toLowerCase();
    if (/\/api\/(?:generate-cover)(?:\/|$)/.test(pathname)) {
      intercepted.generationFixture++;
      if (intercepted.generationFixture === 1) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic retry fixture' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrl: syntheticImage }) });
    }
    if (/\/api\/(?:metrics|telemetry)(?:\/|$)|\/api\/telemetry-v2(?:\/|$)/.test(pathname)) {
      intercepted.telemetry++;
      const body = request.postData();
      if (body) {
        try { observedTelemetry.push(JSON.parse(body)); } catch { /* retain only parseable diagnostic payloads */ }
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({accepted:true}) });
    }
    if (/google-analytics\.com|googletagmanager\.com|connect\.facebook\.net|facebook\.com\/tr\//i.test(url.hostname + url.pathname)) {
      intercepted.analytics++;
      return route.fulfill({ status: 204, body: '' });
    }
    if (/^\/api\/.*(?:checkout|payment|order|fulfillment|fulfilment|handwrytten)/.test(pathname) || /\/create-payment-intent|\/submit-order|\/fulfill(?:ment)?\//.test(pathname)) {
      intercepted.deniedSideEffects++;
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Denied by Sprint 0031 browser acceptance harness' }) });
    }
    if (url.origin !== baseOrigin && /^https?:$/.test(url.protocol)) return route.abort();
    if (request.method() !== 'GET' && request.method() !== 'HEAD') {
      intercepted.deniedSideEffects++;
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    // Prevent navigator.sendBeacon from reaching any origin, including when a
    // site queues telemetry outside fetch/XHR interception.
    window.__smnBeaconPayloads = [];
    try {
      Object.defineProperty(Navigator.prototype, 'sendBeacon', {
        configurable: true,
        value: function (_url, data) {
          try { window.__smnBeaconPayloads.push(typeof data === 'string' ? JSON.parse(data) : data); } catch { /* never forward the payload */ }
          return true;
        },
      });
    } catch { /* route interception remains the network fallback */ }
  });
  context.__smnObservedTelemetry = observedTelemetry;
  return context;
}
function tile(page) {
  return page.getByRole('button', { name: /create my cover/i });
}
function drawer(page) {
  return page.getByRole('dialog');
}
async function hasTile(page) {
  return await tile(page).count() > 0;
}
async function readAssignedArm(page, context) {
  const deadline = Date.now() + 5000;
  do {
    const assignment = context.__smnObservedTelemetry.find(event => event.event_name === 'custom_cover_assigned');
    if (assignment) return assignment.properties?.variantId || null;
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  return null;
}
async function openPicker(page, routePath = '/new') {
  page.context().__smnObservedTelemetry.length = 0;
  await page.goto(new URL(routePath, baseOrigin).toString(), { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /your words|choose a card|cards/i }).first().waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('region', { name: /card designs/i }).waitFor({ state: 'visible', timeout: 30000 });
  const arm = await readAssignedArm(page, page.context());
  assert.ok(arm === 'control' || arm === 'treatment', 'Fresh eligible picker emits an assignment');
  if (arm === 'treatment') await tile(page).waitFor({state:'visible'});

}
async function screenshot(page, name) {
  const file = path.join(outputDir, name);
  if (name.includes('treatment-all') || name.includes('treatment-birthday')) {
    await tile(page).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.evaluate(() => Promise.all([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).map(i => i.decode().catch(() => {}))));
  }
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  screenshots.push(name);
}
async function noHorizontalOverflow(page, width, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(dimensions.document <= width + 1 && dimensions.body <= width + 1,
    `${label}: horizontal overflow at ${width}px (${JSON.stringify(dimensions)})`);
  record(`${label}: no horizontal overflow`, { width, ...dimensions });
}
async function tilePlacement(page, kind) {
  const invite = tile(page);
  await invite.waitFor({ state: 'visible' });
  const result = await invite.evaluate((button) => {
    const section = button.closest('[aria-label="Card designs"]');
    const grid = button.parentElement;
    if (!section?.contains(grid) || getComputedStyle(grid).display !== 'grid') return { validGridChild: false, preceding: -1, total: 0, columns: 0 };
    const children = Array.from(grid.children);
    return { validGridChild: true, preceding: children.indexOf(button), total: children.length, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
  });
  assert.equal(result.validGridChild, true, 'Invitation must be a direct card-grid item');
  if (kind === 'all') assert.equal(result.preceding, 5, `All list: invitation must follow five ready-made cards; saw ${result.preceding}`);
  if (kind === 'short') assert.ok(result.preceding <= 5, `Short filter: invitation should append after at most five cards; saw ${result.preceding}`);
  if (kind === 'all' && result.columns === 4) assert.equal(result.preceding, 5, 'At desktop width, invitation follows the first row of four and the next ready-made card');
  record(`Invitation placement in ${kind}`, result);
}
async function findArm(browser, wanted, explicitSession) {
  const candidates = explicitSession
    ? [explicitSession]
    : Array.from({ length: maxSeeds }, (_, index) => `sess_smn31_seed_${String(index).padStart(2, '0')}`);
  const mismatches = [];
  for (const sessionId of candidates) {
    const context = await createContext(browser, sessionId, { width: 1200, height: 900 });
    const page = await context.newPage();
    try {
      await openPicker(page, '/new');
      await page.waitForTimeout(800);
      const tileVisible = await hasTile(page);
      const assigned = await readAssignedArm(page, context);
      const observed = assigned || (tileVisible ? 'treatment' : null);
      if (observed === wanted && tileVisible === (wanted === 'treatment')) return { context, page, sessionId, observed, seedAttempts: mismatches.length + 1 };
      mismatches.push({ sessionId, assigned, tileVisible });
      await context.close();
      if (explicitSession) break;
    } catch (error) {
      await context.close();
      if (explicitSession) throw error;
      mismatches.push({ sessionId, error: error.message });
    }
  }
  throw new Error(`Could not verify ${wanted} arm after ${mismatches.length} deterministic identity seed(s). Control must expose data-cover-experiment-arm="control" or intercepted assignment telemetry; treatment must also render its invitation. Supply --${wanted}-session or verify experiment activation and assignment evidence. Last observations: ${JSON.stringify(mismatches.slice(-4))}`);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const launchOptions = { headless: true };
  const systemChrome = [
    process.env.BROWSER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((candidate) => candidate && fs.existsSync(candidate));
  if (systemChrome) launchOptions.executablePath = systemChrome;
  const browser = await chromium.launch(launchOptions);
  try {
    // Find both actual assignment buckets using only normal customer routes.
    const control = await findArm(browser, 'control', args['control-session']);
    const treatment = await findArm(browser, 'treatment', args['treatment-session']);
    record('Experiment arms observed on normal /new entry', {
      controlSession: control.sessionId, controlSeedAttempts: control.seedAttempts,
      treatmentSession: treatment.sessionId, treatmentSeedAttempts: treatment.seedAttempts,
    });

    // A second entry path is exercised for the control arm; it uses no UI bypass.
    await control.page.setViewportSize({ width: 390, height: 844 });
    await openPicker(control.page, quickPath);
    assert.equal(await hasTile(control.page), false, 'Control arm must omit the invitation on the quick entry path');
    assert.equal(await readAssignedArm(control.page, control.context), 'control', 'Quick entry must retain the same stable control assignment');
    await screenshot(control.page, 'control-quick-entry-390.png');
    record('Quick root/paid entry reaches the control picker', { path: quickPath, invitationAbsent: true });
    await noHorizontalOverflow(control.page, 390, 'Control picker');

    // Treatment placement, responsiveness and screen evidence.
    await treatment.page.setViewportSize({ width: 390, height: 844 });
    await openPicker(treatment.page, '/new');
    assert.equal(await hasTile(treatment.page), true, 'Treatment arm must render the invitation on /new');
    await tilePlacement(treatment.page, 'all');
    await noHorizontalOverflow(treatment.page, 390, 'Treatment All');
    await screenshot(treatment.page, 'treatment-all-390.png');
    await treatment.page.waitForTimeout(1300);
    assert(treatment.context.__smnObservedTelemetry.some(event => event.event_name === 'custom_cover_tile_impression'), 'Measurable visible tile reports impression');


    await treatment.page.getByRole('tab', { name: 'Birthday', exact: true }).click();
    await tilePlacement(treatment.page, 'short');
    await noHorizontalOverflow(treatment.page, 390, 'Treatment short filter');
    await screenshot(treatment.page, 'treatment-birthday-390.png');
    const firstReadyMade = treatment.page.locator('[aria-label="Card designs"] .grid > div').first();
    await firstReadyMade.click();
    assert.equal(await treatment.page.locator('[aria-label="Card designs"] [aria-label="Selected"]').count(), 1, 'A deliberate ready-made selection should be active before opening the drawer');
    await tile(treatment.page).scrollIntoViewIfNeeded();
    await treatment.page.evaluate(() => window.scrollTo({ top: Math.max(0, window.scrollY - 80), behavior: 'instant' }));
    const beforeEscape = await treatment.page.evaluate(() => window.scrollY);
    const tileButton = tile(treatment.page);
    await tileButton.click();
    await drawer(treatment.page).waitFor({ state: 'visible' });
    const carriedOccasion = await drawer(treatment.page).getByRole('combobox').first().inputValue();
    assert.match(carriedOccasion, /birthday/i, `Drawer should carry the active Birthday filter; got ${carriedOccasion}`);
    const idea = 'Synthetic draft to preserve across close and reopen';
    await drawer(treatment.page).getByRole('textbox').first().fill(idea);
    await treatment.page.keyboard.press('Escape');
    await drawer(treatment.page).waitFor({ state: 'hidden' });
    const afterEscape = await treatment.page.evaluate(() => ({ y: window.scrollY, focused: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '' }));
    assert.ok(Math.abs(afterEscape.y - beforeEscape) <= 2, 'Escape should restore the originating scroll position');
    assert.ok(await tile(treatment.page).evaluate((el) => el === document.activeElement), 'Escape should restore focus to the invitation tile');
    assert.equal(await treatment.page.locator('[aria-label="Card designs"] [aria-label="Selected"]').count(), 1, 'Closing the drawer should preserve the selected ready-made cover');
    await tile(treatment.page).click();
    await drawer(treatment.page).waitFor({ state: 'visible' });
    assert.equal(await drawer(treatment.page).getByRole('textbox').first().inputValue(), idea, 'Reopening should preserve the in-progress idea');
    await treatment.page.keyboard.press('Escape');
    await drawer(treatment.page).waitFor({ state: 'hidden' });
    record('Escape restores focus, filter, selection, draft and scroll', { beforeY: beforeEscape, afterY: afterEscape.y, carriedOccasion, selectedCoverPreserved: true, draftPreserved: true });

    // Top shortcut and explicit close return to its originating control and scroll.
    const topShortcut = treatment.page.getByRole('button', { name: /create custom artwork/i }).first();
    await topShortcut.scrollIntoViewIfNeeded();
    const beforeClose = await treatment.page.evaluate(() => window.scrollY);
    await topShortcut.click();
    await drawer(treatment.page).waitFor({ state: 'visible' });
    await drawer(treatment.page).getByRole('button', { name: /close/i }).click();
    await drawer(treatment.page).waitFor({ state: 'hidden' });
    assert.ok(await topShortcut.evaluate((el) => el === document.activeElement), 'Close button should return focus to the top shortcut');
    const afterClose = await treatment.page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(afterClose - beforeClose) <= 2, 'Close button should restore the originating scroll position');
    record('Top shortcut opens shared drawer and close returns focus and scroll', { focusRestored: true, beforeY: beforeClose, afterY: afterClose });

    // Fit checks at 320 and full desktop screenshot at 1200.
    await treatment.page.setViewportSize({ width: 320, height: 760 });
    await openPicker(treatment.page, '/new');
    await tilePlacement(treatment.page, 'all');
    await noHorizontalOverflow(treatment.page, 320, 'Treatment 320');
    await screenshot(treatment.page, 'treatment-all-320.png');
    await treatment.page.setViewportSize({ width: 1200, height: 900 });
    await openPicker(treatment.page, '/new');
    await tilePlacement(treatment.page, 'all');
    await noHorizontalOverflow(treatment.page, 1200, 'Treatment 1200');
    await screenshot(treatment.page, 'treatment-all-1200.png');

    // Explicit generation is the only generation action; response is an in-memory fixture.
    await tile(treatment.page).click();
    await drawer(treatment.page).waitFor({ state: 'visible' });
    assert.equal(intercepted.generationFixture, 0, 'Opening the drawer must not request generation');
    const prompt = drawer(treatment.page).getByRole('textbox').first();
    assert.equal(await drawer(treatment.page).getByRole('button', { name: /create artwork|create custom artwork/i }).last().isDisabled(), true, 'Create action should be disabled until an idea is entered');
    await prompt.fill('Synthetic acceptance fixture: orange cat sleeping by a sunny kitchen window');
    const generate = drawer(treatment.page).getByRole('button', { name: /create artwork|create custom artwork/i }).last();
    await generate.click();
    await drawer(treatment.page).getByText('Synthetic retry fixture').waitFor();
    assert.match(await prompt.inputValue(), /orange cat/);
    assert.equal(intercepted.generationFixture, 1, 'Failure does not trigger automatic retries');
    await generate.click();
    await drawer(treatment.page).getByText(/artwork created/i).waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(intercepted.generationFixture, 2, 'One request and one explicit retry reach the local fixture');
    await screenshot(treatment.page, 'treatment-generated-preview.png');
    const accept = drawer(treatment.page).getByRole('button', { name: /use this cover and write my note|select.*write note/i });
    await accept.click();
    await drawer(treatment.page).waitFor({ state: 'hidden' });
    await treatment.page.getByRole('textbox').first().waitFor({ state: 'visible' });
    record('Synthetic failure preserves the idea and explicit retry and acceptance reach note', { fixtureCalls: intercepted.generationFixture, accepted: true });

    // Return through the product's own navigation and verify the active/saved cover replaces the invitation.
    const back = treatment.page.getByRole('button', { name: /back to (covers|cards)|edit cover|change cover/i }).first();
    await back.waitFor({ state: 'visible', timeout: 10000 });
    await back.click();
    await treatment.page.getByRole('region', { name: /card designs/i }).waitFor({ state: 'visible' });
    assert.equal(await hasTile(treatment.page), false, 'Accepted/saved custom cover must suppress the generic invitation');
    await treatment.page.getByText(/your custom artwork|your custom cover/i).first().waitFor({ state: 'visible' });
    record('Accepted custom cover suppresses generic invitation on return', { invitationAbsent: true, customCoverVisible: true });

    for (const eventName of ['custom_cover_drawer_opened', 'custom_cover_generation_requested', 'custom_cover_generation_failed', 'custom_cover_generation_completed', 'custom_cover_accepted']) {
      const event = treatment.context.__smnObservedTelemetry.find(e => e.event_name === eventName && e.properties?.entrySource === 'grid_tile');
      assert(event, eventName + ' is measured with the grid entry source');
      assert(!JSON.stringify(event.properties).includes('orange cat'), 'Prompt is absent from diagnostics');
    }
    assert.equal(intercepted.deniedSideEffects, 0, 'No payment, order or fulfillment side-effect route was attempted');
    record('Side-effecting endpoints remained unused', { deniedAttempts: intercepted.deniedSideEffects });
    const report = {
      sprint: '0031', checkedAt: new Date().toISOString(), origin: baseOrigin,
      passed: true, syntheticIdentity: true, arms: { control: control.sessionId, treatment: treatment.sessionId },
      checks, screenshots,
      network: { ...intercepted, paymentOrdersFulfillmentAttempted: intercepted.deniedSideEffects },
      limitations: ['This is hosted browser behavior evidence only; it does not measure experiment lift or production customer outcomes.'],
    };
    fs.writeFileSync(path.join(outputDir, 'observed-checks.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, origin: baseOrigin, checks: checks.length, screenshots, network: intercepted }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(`Sprint 0031 browser acceptance failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
