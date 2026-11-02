const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const assets = path.join(__dirname, 'assets');
  execFileSync('python3', ['/Users/zeke/.codex/plugins/cache/openai-bundled/visualize/1.0.55/skills/visualize/scripts/render.py', path.join(assets, 'account-review.html'), '/private/tmp/smn-account-review.html', '--force']);
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 1056, height: 1500 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///private/tmp/smn-account-review.html');
  const f = page.frameLocator('iframe');
  const root = f.locator('#smn-account-review');
  await f.locator('#smn-content h1').waitFor();
  async function navigate(screen) {
    // Dispatch the same local navigation event without depending on mobile nav visibility.
    await root.evaluate((el, screen) => {
      const b = document.createElement('button'); b.dataset.page = screen;
      el.append(b); b.click(); b.remove();
    }, screen);
  }
  async function fit(width) {
    await page.setViewportSize({ width: width + 32, height: 1800 });
    await root.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const height = await root.evaluate(el => el.scrollHeight + 8);
    await page.locator('iframe').evaluate((el, h) => el.style.height = h + 'px', height);
    await page.setViewportSize({ width: width + 32, height: Math.max(1200, height + 64) });
    return await root.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.scrollHeight,
      badImages: [...el.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).length }));
  }
  const measurements = [];
  const screens = ['overview', 'history', 'card', 'images', 'asset', 'upload', 'source', 'people', 'person', 'personedit', 'dates', 'event', 'email', 'drafts', 'settings'];
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 390, 768, 1024]) {
      for (const screen of screens) {
        await navigate(screen);
        const m = await fit(width);
        assert(m.scrollWidth <= m.width + 1, `${theme}/${width}/${screen} overflows: ${JSON.stringify(m)}`);
        assert.equal(m.badImages, 0, `Missing image on ${screen}`);
        measurements.push({ theme, targetWidth: width, screen, ...m });
        if (theme === 'light' && [390, 1024].includes(width) && ['overview', 'history', 'images', 'people', 'person', 'event', 'settings'].includes(screen)) {
          await root.screenshot({ path: path.join(assets, `${screen}-${width}.png`) });
        }
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await fit(1024);
  await navigate('overview');
  await f.locator('#smn-menu').click();
  assert(await f.locator('#smn-mainmenu').isVisible());
  await root.screenshot({ path: path.join(assets, 'menu-1024.png') });
  await f.locator('#smn-mainmenu [data-page=people]').click();
  assert.match(await f.locator('#smn-content h1').textContent(), /Your people/);
  await f.locator('#smn-people-search').fill('Ellis');
  assert.equal(await f.locator('#smn-content [data-search]:visible').count(), 1);
  await navigate('card');
  await f.locator('[data-preview=Inside]').click();
  assert.match(await f.locator('.note').textContent(), /Dear Maya/);
  await root.screenshot({ path: path.join(assets, 'inside-1024.png') });
  await navigate('event');
  await f.locator('#smn-reminder').uncheck();
  assert.match(await f.locator('#smn-reminder-next').textContent(), /no reminder email/);
  await f.locator('#smn-reminder').check();
  await f.locator('[data-action=savedate]').click();
  assert.match(await f.locator('#smn-content').textContent(), /Nov 4/);
  await f.locator('[data-action=addevent]').click();
  assert(!(await f.locator('#smn-reminder').isChecked()), 'New occasions must not opt into email by default');
  await navigate('settings');
  await f.locator('#smn-pause').check();
  await navigate('dates');
  assert.match(await f.locator('#smn-content').textContent(), /Paused in settings/);
  await navigate('upload');
  await f.locator('[data-action=sampleupload]').click();
  assert.match(await f.locator('#smn-content h1').textContent(), /favorite garden/);
  await navigate('images');
  await f.locator('[data-imagetab=uploads]').click();
  assert.match(await f.locator('#smn-content').textContent(), /Example upload/);
  await root.screenshot({ path: path.join(assets, 'uploads-1024.png') });
  await fit(390);
  await navigate('overview');
  await f.locator('#smn-navmobile').click();
  assert(await f.locator('#smn-nav').isVisible());
  await f.locator('#smn-nav [data-page=history]').click();
  assert.match(await f.locator('#smn-content h1').textContent(), /Card history/);
  assert(!(await f.locator('#smn-nav').isVisible()));
  assert.equal(errors.length, 0, errors.join('\n'));
  fs.writeFileSync(path.join(assets, 'review-checks.json'), JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Local design mockup only; no product implementation or live service verification', measurements, interactions: ['main menu and direct address book', 'recipient search', 'historical inside preview', 'reminder toggle and saved date', 'global pause reflected on dates', 'sample upload and library entry', 'mobile navigation'], pageErrors: errors }, null, 2));
  console.log(`Verified ${measurements.length} screen/width/theme combinations and 7 interaction flows.`);
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
