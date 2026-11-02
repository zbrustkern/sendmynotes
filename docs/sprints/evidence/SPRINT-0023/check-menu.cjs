const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/zeke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {identity,seed,firebase}=require('./browser-fixtures.cjs');
const base='http://127.0.0.1:3122',out=path.join(__dirname,'checks/menu');fs.mkdirSync(out,{recursive:true});let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[],checks=[];
 async function setup(signedIn){
  const c=await browser.newContext({viewport:{width:1024,height:900}}),state={who:identity(),access:'active',delay:0,logoutFail:false,accessCalls:0};
  if(signedIn)await seed(c,state.who);await firebase(c,()=>state.who);
  await c.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;
   if(p==='/api/account')return r.fulfill({json:{user:{uid:state.who.uid,email:state.who.email,savedAddresses:[]},orders:[]}});
   if(p==='/api/upload/access'){state.accessCalls++;const mode=state.access; if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));return r.fulfill({status:mode==='error'?503:200,json:mode==='error'?{error:'Fixture unavailable'}:{allowed:mode==='active',paused:false}});}
   if(p==='/api/admin/auth')return r.fulfill({status:state.logoutFail?503:200,json:{authenticated:true,success:!state.logoutFail,email:state.who.email}});
   return r.fulfill({json:{success:true,fonts:[],addresses:[]}});
  });
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/new?step=note');await p.getByPlaceholder('Write your note from the heart...').waitFor({timeout:45000});return{c,p,state};
 }
 const {c:g,p:gpage}=await setup(false);
 await gpage.getByPlaceholder('Write your note from the heart...').fill('Synthetic guest note remains intact.');
 const options=gpage.getByRole('button',{name:'Account and card options'});
 for(const width of [320,390,768,1024]){
  await gpage.setViewportSize({width,height:900});await options.click();await gpage.getByRole('menuitem',{name:'Sign in',exact:true}).waitFor();assert.equal(await gpage.getByRole('menuitem',{name:'Upload studio'}).count(),0);assert(await gpage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'guest horizontal overflow '+width);
  await gpage.getByRole('menuitem',{name:'Sign in',exact:true}).click();const dialog=gpage.getByRole('dialog');await dialog.getByText('You can send a card without an account.',{exact:true}).waitFor();assert.equal(await gpage.getByPlaceholder('Write your note from the heart...').inputValue(),'Synthetic guest note remains intact.');await gpage.screenshot({path:out+'/guest-'+width+'.png'});await gpage.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 }
 checks.push('guest optional modal preserves draft at 320/390/768/1024');
 await options.click();await gpage.getByRole('menuitem',{name:'Sign in',exact:true}).click();await gpage.locator('#auth-email').fill('owner@example.test');await gpage.locator('input[type=password]').fill('fixture-password');await gpage.getByRole('dialog').getByRole('button',{name:'Sign In',exact:true}).click();await gpage.getByRole('dialog').waitFor({state:'hidden'});await gpage.getByPlaceholder('Write your note from the heart...').waitFor();assert.equal(await gpage.getByPlaceholder('Write your note from the heart...').inputValue(),'Synthetic guest note remains intact.');checks.push('guest sign-in preserves current note and step');await g.close();
 const {c,p,state}=await setup(true);await p.getByPlaceholder('Write your note from the heart...').fill('Catalog note remains through sign out.');const menuButton=p.getByRole('button',{name:'Account and card options'}),studio=p.getByRole('menuitem',{name:'Upload studio',exact:true});
 state.delay=400;await menuButton.click();await p.getByText('Checking studio access…',{exact:true}).waitFor();await studio.waitFor();assert(await p.getByRole('menu').getByText(state.who.email,{exact:true}).count());
 await p.keyboard.press('Escape');assert(await menuButton.evaluate(el=>el===document.activeElement));
 state.delay=0;state.access='inactive';const before=state.accessCalls;await menuButton.click();await studio.waitFor({state:'hidden'});assert(state.accessCalls>before);checks.push('menu opening refreshes inactive grant');
 state.access='error';await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.getByText('Studio access unavailable',{exact:true}).waitFor();state.access='active';await p.getByRole('menuitem',{name:'Retry',exact:true}).click();await studio.waitFor();checks.push('failed entitlement distinct and retry succeeds');
 state.access='inactive';await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await studio.waitFor({state:'hidden'});checks.push('visibility return refreshes access');
 for(const width of [320,390,768,1024]){await p.setViewportSize({width,height:900});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'signed in horizontal overflow');await p.screenshot({path:out+'/signed-in-'+width+'.png'});}
 state.logoutFail=true;await p.getByRole('menuitem',{name:'Sign out',exact:true}).click();await p.getByRole('menu').getByRole('alert').waitFor();await p.getByRole('menu').getByText(state.who.email,{exact:true}).waitFor();checks.push('failed admin logout retains sender identity');
 state.logoutFail=false;await p.getByRole('menuitem',{name:'Sign out',exact:true}).click();await menuButton.click();await p.getByRole('menuitem',{name:'Sign in',exact:true}).waitFor();assert.equal(await studio.count(),0);await p.getByPlaceholder('Write your note from the heart...').waitFor();assert.equal(await p.getByPlaceholder('Write your note from the heart...').inputValue(),'Catalog note remains through sign out.');checks.push('successful logout removes account and studio while retaining catalog note and step');
 assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(out+'/summary.json',JSON.stringify({passed:true,checks,errors,apiResponses:'mocked; no payment or supplier requests'},null,2));console.log(checks);await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
