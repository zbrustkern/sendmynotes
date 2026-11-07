const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page=await browser.newPage();
    await page.emulateMedia({reducedMotion:'reduce'});
    const errors=[], externalRequests=[], checks=[], interactions=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,route=>{externalRequests.push(route.request().url());return route.abort()});
    await page.goto('file://'+path.join(__dirname,'assets/multi-send.html'));
    await page.evaluate(()=>document.fonts.ready);
    assert(!/Recipients \(|shared card|25 recipients|\$9 each/.test(await page.locator('main').textContent()));
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:1000});
      for(const scene of ['single','address','add','payment','paid','attention','uncertain','deferred']){
        await page.locator(`[data-scene="${scene}"]`).click();
        await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
        const result=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
          brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,
          overflowingElements:[...document.querySelectorAll('main *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left < -1)}).map(el=>el.tagName+'.'+el.className)}));
        assert(result.scrollWidth<=width,`Overflow ${width}/${scene}: ${JSON.stringify(result)}`);
        assert.equal(result.brokenImages,0);assert.deepEqual(result.overflowingElements,[]);
        checks.push({scene,...result});
        if([390,1280].includes(width))await page.screenshot({path:path.join(__dirname,`assets/${scene}-${width}.png`),fullPage:true});
      }
    }
    async function scene(s){await page.locator(`[data-scene="${s}"]`).click()}
    async function fillRecipient(r){for(const key of ['name','street','city','zip'])await page.locator('#rec'+key).fill(r[key]);await page.locator('#recstate').selectOption(r.state)}
    async function save(){await page.locator('#recipientform [type="submit"]').click()}
    await page.setViewportSize({width:1280,height:1000});await scene('single');
    const before=await page.locator('.workbench>.aside').boundingBox();
    const first=await page.locator('.recipientpanel').boundingBox(),sender=await page.locator('.senderpanel').boundingBox();
    assert(sender.x>first.x,'Baseline Send to and From you must be side by side');
    await page.locator('#firstform [type="submit"]').click();
    const after=await page.locator('.workbench>.aside').boundingBox();
    assert.equal(Math.round(before.x),Math.round(after.x));assert.equal(Math.round(before.width),Math.round(after.width));
    assert((await page.locator('.senderpanel').boundingBox()).y>(await page.locator('.recipientpanel').boundingBox()).y);
    interactions.push('Desktop preview stays left at identical x/width; right sub-grid expands in place');
    assert.equal(await page.locator('#recstate').evaluate(el=>el.tagName),'SELECT');
    assert.equal(await page.locator('#recunit').count(),0);
    await page.locator('[data-unit="rec"]').click();assert(await page.locator('#recunit').isVisible());
    interactions.push('Production state dropdown, apartment disclosure and city/state/ZIP grouping');
    await page.locator('[data-action="canceledit"]').click();
    assert(!/Recipients \(|25 recipients/.test(await page.locator('main').textContent()));
    await page.locator('[data-action="continue"]').click();assert.equal(await page.locator('[data-action="pay"]').textContent(),'Pay $9.00');
    interactions.push('Cancel second editor returns to quiet single-card baseline and singular payment');
    await scene('address');await page.locator('[data-action="editnote"]').click();
    assert.equal(await page.locator('#salutation').inputValue(),'Dear Maya,');
    const originalBody=await page.locator('#notetext').inputValue(),originalSignOff=await page.locator('#signoff').inputValue();
    await page.locator('#salutation').fill('Dear Friends,');await page.locator('#noteform [type="submit"]').click();
    await page.locator('[data-action="editnote"]').click();
    assert.equal(await page.locator('#salutation').inputValue(),'Dear Friends,');assert.equal(await page.locator('#notetext').inputValue(),originalBody);assert.equal(await page.locator('#signoff').inputValue(),originalSignOff);
    await page.screenshot({path:path.join(__dirname,'assets/note-fields-1280.png'),fullPage:true});
    await page.locator('[data-action="cancelnote"]').click();
    interactions.push('Greeting edits preserve separate message and sign-off fields');
    await scene('deferred');await page.locator('#firstform [type="submit"]').click();assert(await page.locator('.conflict').isVisible());
    await page.screenshot({path:path.join(__dirname,'assets/deferral-conflict-1280.png'),fullPage:true});
    await page.locator('[data-action="keepone"]').click();assert(await page.locator('#defer').isChecked());
    assert.equal(await page.locator('#firstname').inputValue(),'Maya Ellis');
    await page.locator('#firstform [type="submit"]').click();await page.locator('[data-action="resolveconflict"]').click();
    assert.match(await page.locator('#recipientform h3').textContent(),/Complete the first/);
    await fillRecipient({name:'Maya Ellis',street:'123 Example Lane',city:'Portland',state:'OR',zip:'97205'});await save();
    assert.match(await page.locator('#recipientform h3').textContent(),/Add recipient 2/);
    assert.equal(await page.locator('#recname').inputValue(),'');
    interactions.push('Deferred opt-in prompt keeps single preferences or completes first address before adding second');
    await scene('address');await page.locator('[data-action="add"]').click();
    await fillRecipient({name:'Maya Ellis',street:'123 Example Lane',city:'Portland',state:'OR',zip:'97205'});await save();
    assert.match(await page.locator('#recipientform .error').textContent(),/already on your list/);
    await page.locator('#recname').fill('Taylor Example');await save();
    assert.match(await page.locator('.household').textContent(),/Send one to Taylor Example too/);
    assert.match(await page.locator('.totaltext').textContent(),/3 cards · \$27.00/);
    await page.screenshot({path:path.join(__dirname,'assets/household-1280.png'),fullPage:true});
    await page.locator('[data-action="cancelhousehold"]').click();assert.equal(await page.locator('#recname').inputValue(),'Taylor Example');
    await save();await page.locator('[data-action="confirmhousehold"]').click();assert.match(await page.locator('.totaltext').textContent(),/4 cards · \$36.00/);
    interactions.push('Exact duplicate blocks; household addition needs explicit confirmation without losing entered data');
    await page.getByRole('button',{name:'Edit Taylor Example',exact:true}).click();await page.locator('[data-unit="rec"]').click();await page.locator('#recunit').fill('Unit 4');await save();
    await page.getByRole('button',{name:'Remove Taylor Example',exact:true}).click();await page.locator('[data-action="undo"]').click();assert.match(await page.locator('main').textContent(),/Unit 4/);
    interactions.push('Recipient unit editing, removal and undo preserve identity and totals');
    await page.setViewportSize({width:390,height:844});await page.locator('[data-action="add"]').click();await page.locator('#recname').fill('Unfinished Example');
    assert.equal(await page.locator('.actionbar').evaluate(el=>getComputedStyle(el).position),'fixed');
    await page.locator('[data-action="continue"]').click();assert.match(await page.locator('#recipientform .error').textContent(),/Save or cancel/);
    assert.equal(await page.locator('#recname').inputValue(),'Unfinished Example');assert(await page.locator('#recname').evaluate(el=>document.activeElement===el));
    const field=await page.locator('#recname').boundingBox(),bar=await page.locator('.actionbar').boundingBox();assert(field.y+field.height<=bar.y,'Error focus must clear mobile action bar');
    await page.screenshot({path:path.join(__dirname,'assets/mobile-editor-focus-390.png')});
    await page.locator('[data-action="canceledit"]').click();await page.locator('[data-action="continue"]').click();
    assert.match(await page.locator('[data-action="pay"]').textContent(),/Pay \$36.00 · Send 4 cards/);
    await page.locator('[data-action="discount"]').click();assert.match(await page.locator('[data-action="pay"]').textContent(),/Pay \$27.00 · Send 4 cards/);
    await page.locator('summary').click();assert(await page.locator('.fulladdresses').getAttribute('open')!==null);
    await page.locator('[data-action="pay"]').click();assert.match(await page.locator('h1').textContent(),/Your 4 cards are in motion/);
    interactions.push('Fixed mobile footer blocks unsaved editor, focuses clear of bar, then pays correct committed total');
    await scene('attention');assert.match(await page.locator('.statusnote').textContent(),/not accepted because of an address issue/);assert(await page.locator('[data-action="support"]').isVisible());
    await scene('uncertain');assert.match(await page.locator('.statusnote').textContent(),/1 is being checked/);assert.equal(await page.locator('[data-action="support"]').count(),0);assert(!/needs attention/i.test(await page.locator('main').textContent()));
    interactions.push('Rejected-not-sent and dispatch-uncertain have distinct copy and actions');
    assert.equal(errors.length,0,errors.join('\n'));assert.equal(externalRequests.length,0);
    fs.writeFileSync(path.join(__dirname,'assets/review-checks.json'),JSON.stringify({scope:'Local HTML design mockup only. No implementation, payment, supplier, or live deployment testing.',checks,interactions,pageErrors:errors,externalRequests},null,2));
    console.log(`Verified ${checks.length} screen/width combinations and ${interactions.length} local interaction flows. No external requests.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
