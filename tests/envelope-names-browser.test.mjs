import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { server } from './fixtures/sitelink-entry-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.SMN_CHROMIUM_EXECUTABLE });
server.listen(0, '127.0.0.1');
try {
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const signedIn of [false, true]) {
    const page = await browser.newPage();
    page.on('pageerror', error => { throw error; });
    if (signedIn) {
      await page.addInitScript(() => {
        window.__fixtureUser = { uid: 'fixture', getIdToken: async () => 'fixture' };
      });
    }
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      const address = { street1: '1 Example Lane', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' };
      if (url.pathname === '/api/account/preferences') {
        return route.fulfill({ json: { data: { defaultReturnAddress: { ...address, firstName: 'Sam', lastName: 'Bell' } } } });
      }
      if (url.pathname === '/api/account/people') {
        return route.fulfill({ json: { data: [{
          id: 'fixture-contact', displayName: 'Tess', address: { ...address, firstName: 'Tess', lastName: 'Rivera' },
        }] } });
      }
      return route.continue();
    });

    await page.goto(origin + '/birthday');
    const greeting = page.getByPlaceholder('e.g. Dear Sarah,');
    const signOff = page.getByPlaceholder(/^e\.g\. Warmly,/);
    const continueToAddress = page.getByRole('button', { name: /^Continue to .*Address/i }).first();
    const recipient = page.getByLabel('Recipient name', { exact: true });
    const sender = page.getByLabel('Your name', { exact: true });
    await page.getByPlaceholder('Write your note from the heart...').fill('Happy birthday!');
    await greeting.fill('');
    await greeting.pressSequentially('Dear Tess,');
    await signOff.fill('');
    await signOff.pressSequentially('Warml');
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sendmynotes_draft_v1')));
    assert.equal(draft.note.signOff, 'Warml');
    assert.equal(draft.recipient, null);
    if (!signedIn) assert.equal(draft.sender, null);
    await signOff.pressSequentially('y,');
    const multiline = await signOff.evaluate(field => field.tagName === 'TEXTAREA');
    if (multiline) await signOff.press('Enter');
    await signOff.pressSequentially(multiline ? 'Sammy' : ' Sammy');
    await continueToAddress.click();
    assert.equal(await recipient.inputValue(), '');
    if (signedIn) {
      await page.waitForFunction(() => document.querySelector('#billing-name')?.value === 'Sam Bell');
    }
    assert.equal(await sender.inputValue(), signedIn ? 'Sam Bell' : '');

    if (signedIn) {
      await page.getByRole('button', { name: 'Choose from address book' }).click();
      await page.getByRole('button', { name: 'Use this address' }).click();
    } else {
      await recipient.fill('Tess Rivera');
      await sender.fill('Sam Bell');
    }
    await page.goBack();
    assert.equal(await signOff.inputValue(), multiline ? 'Warmly,\nSammy' : 'Warmly, Sammy');
    await greeting.fill('Hey, birthday kid!');
    await signOff.fill('Love, me');
    await continueToAddress.click();
    await page.reload();
    if (signedIn) {
      // The saved return address arrives asynchronously from account preferences.
      await page.waitForFunction(() => document.querySelector('#billing-name')?.value === 'Sam Bell');
    }
    assert.equal(await recipient.inputValue(), 'Tess Rivera');
    assert.equal(await sender.inputValue(), 'Sam Bell');
    await page.close();
  }
  console.log('Envelope names stay independent through typing, saved address selection, back navigation, and reload.');
} finally {
  await browser.close();
  server.close();
}
