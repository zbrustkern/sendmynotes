import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || "playwright");
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "smn-draft-recovery-"));
const mocks = {
  "next/navigation": `exports.useSearchParams = () => new URLSearchParams(window.location.search);`,
  "next/image": `import React from 'react'; export default ({fill, priority, unoptimized, ...props}) => React.createElement('img', props);`,
  "next/link": `import React from 'react'; export default (props) => React.createElement('a', props);`,
  "@/context/AuthContext": `exports.useAuth = () => ({ user: null, account: null });`,
  "@/lib/telemetry": `exports.trackEvent = exports.trackEventV2 = (name, props) => { (window.__events ||= []).push({name, props}); }; exports.getSessionId = () => 'sess_fixture';`,
  "@/lib/google-ads": `exports.trackGA4ViewItem = exports.trackGA4BeginCheckout = exports.trackGA4AddShippingInfo = exports.trackGA4AddPaymentInfo = () => {};`,
  "@/lib/meta-ads": `exports.trackMetaViewContent = exports.trackMetaAddToCart = exports.trackMetaCustomizeProduct = exports.trackMetaInitiateCheckout = exports.trackMetaAddPaymentInfo = () => {};`,
  "@/components/AttributionTracker": `exports.getStoredAttribution = () => ({});`,
  "@/components/v3/TargetPurchaseExperience": `exports.extractRecipientName = x => x; exports.extractSenderName = x => x;`,
  "@/components/v3/Step4ReviewAndPayment": `import React from 'react'; export const Step4ReviewAndPayment = () => React.createElement('div', null, 'Payment fixture');`,
  "@/components/v3/Step5Confirmation": `exports.Step5Confirmation = () => null;`,
};
await build({ absWorkingDir: root, stdin: { contents: `
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {EntryPrototypeClient} from './app/preview/entry/client';
 import {createInitialDraft,draftReducer} from './lib/draft/reducer';
 import {saveDraft} from './lib/draft/store';
 window.__seed = (kind='custom') => {
   let d=createInitialDraft();
   d=draftReducer(d,{type:'UPDATE_NOTE',payload:{text:'These are my saved words.',salutation:'Dear Friend',signOff:'Love, Me',style:'hwKate'}});
   if(kind==='custom') d=draftReducer(d,{type:'SELECT_DESIGN',payload:{imageUrl:'/recovered.png',title:'My custom artwork',source:'custom',occasion:'Thank You',accepted:true}});
   if(kind==='generated') d=draftReducer(d,{type:'SET_CUSTOM_GENERATION',payload:{status:'completed',resultImageUrl:'/recovered.png',prompt:'A beach sunset'}});
   saveDraft(d,localStorage);
   localStorage.setItem('smn_active_draft_v2', JSON.stringify({insideNoteText:'Stale older words',hasCustomUserEdits:true,currentStep:'card',updatedAt:Date.now()}));
 };
 window.__mount=()=>{window.__root=createRoot(document.getElementById('root'));window.__root.render(React.createElement(EntryPrototypeClient,{initialStep:'card'}));};
 `, resolveDir: root, sourcefile: "fixture.tsx", loader: "tsx" }, outfile: path.join(dir, "bundle.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", plugins: [{name:"mocks",setup(b){b.onResolve({filter:/^(next\/|@\/)/}, async args => {
 if(mocks[args.path])return {path:args.path,namespace:'mock'};
 if(args.path.startsWith('@/'))return b.resolve('./'+args.path.slice(2),{resolveDir:root,kind:args.kind});
 });b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:root}));}}] });
const bundle = await fs.readFile(path.join(dir, "bundle.js"));
const art = process.env.SMN_RECOVERED_ART ? await fs.readFile(process.env.SMN_RECOVERED_ART) : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const css = process.env.SMN_BROWSER_CSS ? await fs.readFile(process.env.SMN_BROWSER_CSS) : Buffer.from("");
const calls=[];
const server=http.createServer((req,res)=>{
 calls.push(req.url);
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle);}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
 if(req.url==='/recovered.png'){res.setHeader('Content-Type','image/png');return res.end(art);}
 if(req.url.startsWith('/api/artwork/recover')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({imageUrl:'/recovered.png',occasion:'Thank You',title:'Recovered custom artwork'}));}
 if(req.url.startsWith('/api/discount/validate')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({valid:true,code:'LAUNCHVIP600',type:'FIXED_AMOUNT',value:300,discountAmountInCents:300,finalAmountInCents:600,isFree:false}));}
 if(req.url.startsWith('/api/mailing-options')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({destinations:[],enabled:false}));}
 if(req.url.startsWith('/api/')){res.statusCode=500;return res.end('Unexpected API call');}
 if(/\.(png|jpg|webp|svg)/.test(req.url)){res.setHeader('Content-Type','image/png');return res.end(art);}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.SMN_CHROMIUM_EXECUTABLE?{executablePath:process.env.SMN_CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try {
 let page=await context.newPage();await page.goto(origin);await page.evaluate(()=>{window.__seed();window.__mount();});
 await page.getByRole('button',{name:'Continue saved card'}).waitFor();
 assert.equal(await page.locator('text=My custom artwork').count()>0,true);
 await page.getByRole('button',{name:'Continue saved card'}).click();
 assert.equal(await page.locator('textarea').first().inputValue(),'These are my saved words.');
 await page.close();
 page=await context.newPage();await page.goto(origin);await page.evaluate(()=>window.__mount());
 await page.waitForFunction(()=>document.querySelector('textarea')?.value === 'These are my saved words.');
 assert.equal(await page.locator('img[src="/recovered.png"]').count()>0,true);
 assert.equal((await page.locator('body').innerText()).includes('Stale older words'),false);
 await page.close();
 page=await context.newPage();await page.goto(origin+'/?recover_artwork=1&discount=LAUNCHVIP600');await page.evaluate(()=>window.__mount());
 await page.waitForFunction(()=>document.body.innerText.includes('Your recovered artwork is ready'));
 await page.waitForFunction(()=>document.body.innerText.includes('Discount applied'));
 assert.match(await page.locator('body').innerText(),/\$6\.00/);
 assert.equal((await page.locator('body').innerText()).includes('$9.00'),false);
 assert.equal(await page.locator('img[src="/recovered.png"]').count()>0,true);
 assert.equal(await page.locator('textarea').first().inputValue(),'These are my saved words.');
 await page.screenshot({path:path.join(dir,'recovered-discount-mobile.png'),fullPage:true});
 await page.close();
 page=await context.newPage();await page.goto(origin);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();window.__seed('generated');window.__mount();});
 await page.getByRole('button',{name:'View saved artwork'}).waitFor();
 await page.getByRole('button',{name:'View saved artwork'}).click();
 assert.equal(await page.locator('[role="dialog"] img[src="/recovered.png"]').count()>0,true);
 assert.deepEqual(errors,[]);
 assert.equal(calls.some(url=>url.includes('/checkout/')),false,'Resuming artwork must not create a payment/order');
 console.log(JSON.stringify({passed:true,coverage:['fresh tab restores selected cover and note','canonical draft wins over old fallback','private artwork link preserves saved words','discount has one consistent price','unselected generated artwork resumes','no checkout calls'],screenshots:dir}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
