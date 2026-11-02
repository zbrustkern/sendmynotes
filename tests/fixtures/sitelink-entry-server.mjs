// Isolated real-component fixture. No external APIs, payment or analytics transports.
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { build } from "esbuild";
const root=process.cwd();
const dir=await fs.mkdtemp(path.join(os.tmpdir(), "smn-sitelink-fixture-"));
const mocks = {
  "next/navigation": `exports.useSearchParams = () => new URLSearchParams(window.location.search);`,
  "next/image": `import React from 'react'; export default ({fill, priority, unoptimized, ...props}) => React.createElement('img', props);`,
  "next/link": `import React from 'react'; export default (props) => React.createElement('a', props);`,
  "@/context/AuthContext": `exports.useAuth = () => ({ user: null, account: null, loading: false });`,
  "@/lib/telemetry": `exports.trackEvent = exports.trackEventV2 = (name, props) => { (window.__events ||= []).push({name, props}); }; exports.getSessionId = () => 'sess_fixture';`,
  "@/lib/google-ads": `exports.trackGA4ViewItem = exports.trackGA4BeginCheckout = exports.trackGA4AddShippingInfo = exports.trackGA4AddPaymentInfo = () => {};`,
  "@/lib/meta-ads": `exports.trackMetaViewContent = exports.trackMetaAddToCart = exports.trackMetaCustomizeProduct = exports.trackMetaInitiateCheckout = exports.trackMetaAddPaymentInfo = () => {};`,
  "@/components/AttributionTracker": `exports.getStoredAttribution = () => ({});`,
  "@/components/v3/TargetPurchaseExperience": `exports.extractRecipientName = x => x; exports.extractSenderName = x => x;`,
  "@/components/v3/Step4ReviewAndPayment": `import React from 'react'; export const Step4ReviewAndPayment = () => React.createElement('div', null, 'Payment fixture');`,
  "@/components/v3/Step5Confirmation": `exports.Step5Confirmation = () => null;`,
};

await build({absWorkingDir:root,stdin:{contents:`
import React from 'react'; import {createRoot} from 'react-dom/client';
import {EntryPrototypeClient} from './app/preview/entry/client';
import {getScenario,getScenariosByOccasion} from './lib/seo-scenarios';
import {createInitialDraft} from './lib/draft/reducer';
import {saveDraft} from './lib/draft/store';
const names={client:['thank-you','client-closing-appreciation'],interview:['thank-you','after-job-interview'],sympathy:['sympathy','heartfelt-condolences'],thanks:['thank-you','kindness-and-support'],birthday:['birthday','happy-birthday'],anniversary:['anniversary','heartfelt-to-spouse']};
const key=location.pathname.slice(1); const args=names[key]; const s=args?getScenario(...args):null;
document.getElementById('seed').onclick=()=>{localStorage.clear();sessionStorage.clear();const c=getScenario('thank-you','client-closing-appreciation');const d={...createInitialDraft(),selectedDesign:{presetId:c.slug,imageUrl:c.coverUrl,title:c.h1Title,occasion:c.occasionName,source:'preset',accepted:true},note:{text:'My intentional client note remains safe.',salutation:'',signOff:'Alex',style:'hwKate'},currentStep:'note'};saveDraft(d,localStorage);saveDraft(d,sessionStorage);location.href='/interview?utm_source=google&utm_medium=cpc&utm_campaign=fixture&utm_content=interview';};
document.getElementById('reset').onclick=()=>{localStorage.clear();sessionStorage.clear();location.href='/generic';};
const props=s?{initialOccasion:s.occasionName,initialCoverUrl:s.coverUrl,initialHandwrittenNote:s.handwrittenNote,initialFontStyleId:s.fontStyleId,scenarioSlug:s.slug,scenarioTitle:s.h1Title,initialStep:'note'}:{initialStep:'card'};
createRoot(document.getElementById('root')).render(React.createElement(EntryPrototypeClient,props));
`,resolveDir:root,sourcefile:'fixture.tsx',loader:'tsx'},outfile:path.join(dir,'bundle.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^(next\/|@\/)/},async args=>{if(mocks[args.path])return{path:args.path,namespace:'mock'};if(args.path.startsWith('@/'))return b.resolve('./'+args.path.slice(2),{resolveDir:root,kind:args.kind});});b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:root}));}}]});
const bundle=await fs.readFile(path.join(dir,'bundle.js'));
const cssRoot=process.env.SMN_FIXTURE_CSS_DIR || path.join(root,'.next/static/css');
let css='';try{for(const file of await fs.readdir(cssRoot))if(file.endsWith('.css'))css+=await fs.readFile(path.join(cssRoot,file),'utf8');}catch{}
const links=['client','interview','sympathy','thanks','birthday','anniversary','generic'].map(name=>`<a href="/${name}?utm_source=google&utm_medium=cpc&utm_campaign=fixture&utm_content=${name}">${name}</a>`).join(' | ');
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated sitelink test</title><link rel="stylesheet" href="/style.css"></head><body><aside style="background:#eef6ff;padding:8px;font:12px system-ui">Local fixture: ${links}<br><button id="seed">Seed edited legacy client draft</button> | <button id="reset">Reset fixture drafts</button></aside><div id="root"></div><script src="/bundle.js"></script></body></html>`;
http.createServer(async(req,res)=>{
const url=new URL(req.url,'http://localhost');
if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle);}
if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
if(url.pathname==='/api/mailing-options'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({destinations:[],enabled:false}));}
if(url.pathname.startsWith('/api/')){res.statusCode=409;return res.end(JSON.stringify({error:'All other APIs blocked in fixture'}));}
if(url.pathname.startsWith('/presets/')||url.pathname.startsWith('/fonts/')){try{const data=await fs.readFile(path.join(root,'public',url.pathname));res.setHeader('Content-Type',url.pathname.endsWith('.jpg')?'image/jpeg':'application/octet-stream');return res.end(data);}catch{res.statusCode=404;return res.end();}}
res.setHeader('Content-Type','text/html');res.end(page);
}).listen(4317,'127.0.0.1',()=>console.log('Fixture ready at http://127.0.0.1:4317/generic'));
