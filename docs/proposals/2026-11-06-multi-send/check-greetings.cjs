const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage();const errors=[],requests=[],layouts=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort()});
  await page.goto('file://'+path.join(__dirname,'assets/personal-greetings.html'));await page.evaluate(()=>document.fonts.ready);
  const scene=async n=>page.locator(`[data-gscene="${n}"]`).click();
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:1000});
   for(const name of ['greetings','greetingedit','greetingreview']){
    await scene(name);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow ${width} ${name}`);
    assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).length),0);
    layouts.push({width,state:name});if([390,1280].includes(width))await page.screenshot({path:path.join(__dirname,`assets/${name}-${width}.png`),fullPage:true});
   }
  }
  await page.locator('[data-scene="single"]').click();assert.equal(await page.locator('[data-greeting]').count(),0);assert(!/Personalize|Recipients \(/.test(await page.locator('main').textContent()));
  await page.setViewportSize({width:1280,height:1000});await scene('greetingedit');await page.locator('.recipientpanel .row').nth(1).screenshot({path:path.join(__dirname,'assets/greeting-inline-detail.png')});assert.match(await page.locator('.envelope-to').textContent(),/Jordan Lee/);await scene('greetings');
  const shared=await page.evaluate(()=>({...note}));
  await page.locator('[data-greeting="r2"]').click();await page.locator('#personalGreeting').fill('Dear Jordan & Chris,');
  assert.match(await page.locator('#personalPreview').textContent(),/^Dear Jordan & Chris,/);await page.locator('#previewRecipient').selectOption('r3');await page.locator('#personalGreeting').fill('Dear Jordan & Chris,');assert.match(await page.locator('#personalPreview').textContent(),/^Dear friends,/);await page.locator('#previewRecipient').selectOption('r2');
  await page.locator('[data-action="continue"]').click();assert.match(await page.locator('#greetingerror').textContent(),/Save or cancel/);assert.equal(await page.locator('#personalGreeting').inputValue(),'Dear Jordan & Chris,');
  await page.locator('#greetingform [type="submit"]').click();assert.deepEqual(await page.evaluate(()=>({...note})),shared);
  await page.locator('[data-greeting="r2"]').click();await page.locator('#personalGreeting').fill('Discard this');await page.locator('[data-gaction="cancel"]').click();assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[1])),'Dear Jordan & Chris,');
  await page.locator('[data-action="editnote"]').click();await page.locator('#salutation').fill('Hello friends,');await page.locator('#noteform [type="submit"]').click();
  assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[0])),'Hello friends,');assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[1])),'Dear Jordan & Chris,');
  await page.locator('[data-greeting="r2"]').click();await page.locator('[data-gaction="reset"]').click();assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[1])),'Hello friends,');
  await page.locator('[data-greeting="r2"]').click();await page.locator('#personalGreeting').fill('');await page.locator('#greetingform [type="submit"]').click();assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[1])),'');
  await page.getByRole('button',{name:'Edit Jordan Lee',exact:true}).click();await page.locator('#recname').fill('Jordan & Chris Lee');await page.locator('#recipientform [type="submit"]').click();assert.equal(await page.evaluate(()=>effectiveGreeting(recipients[1])),'');
  await scene('greetingreview');assert.match(await page.locator('.greetingpay').nth(1).textContent(),/Dear Jordan & Chris,/);assert.match(await page.locator('.greetingpay').nth(2).textContent(),/Dear friends,/);
  await page.locator('[data-gpreview="r3"]').click();assert.match(await page.locator('#personalPreview').textContent(),/^Dear friends,/);
  await page.locator('[data-greeting="r2"]').click();assert(await page.locator('#personalGreeting').isVisible());assert.equal(await page.locator('#personalGreeting').inputValue(),'Dear Jordan & Chris,');
  await page.setViewportSize({width:390,height:844});await page.locator('#personalGreeting').fill('Dear Jordan and family,');await page.locator('[data-action="continue"]').click();
  const input=await page.locator('#personalGreeting').boundingBox(),footer=await page.locator('.actionbar').boundingBox();assert(input.y+input.height<footer.y);
  await page.screenshot({path:path.join(__dirname,'assets/greeting-edit-mobile-focus.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  fs.writeFileSync(path.join(__dirname,'assets/greeting-checks.json'),JSON.stringify({scope:'Local proposed mockups only; no supplier, payment, physical fit or product implementation tested.',layouts,verified:['Single baseline unchanged','Live recipient preview','Unsaved edit guard and mobile focus','Shared body/sign-off unchanged','Cancel retains saved greeting','Default changes preserve overrides','Reset resumes inheritance','Blank override omits greeting','Address edit retains override','Payment displays exact greetings','Payment edit returns to recipient'],errors,requests},null,2));
  console.log('Verified 12 responsive states and 11 greeting behaviors. No external requests.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
