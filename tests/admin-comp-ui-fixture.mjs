import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".delivery/runs/20261026-admin-comp/ui-fixture");
const cssPath = path.join(out, "styles.css");
const icons = ["AlertTriangle", "ArrowLeft", "ArrowRight", "CheckCircle2", "Loader2", "X"];
await fs.mkdir(out, { recursive: true });
execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", path.join(root, "app/globals.css"), "-o", cssPath, "--config", path.join(root, "tailwind.config.ts")], { cwd: root, stdio: "ignore" });
const entry = `
import React from 'react'; import { createRoot } from 'react-dom/client';
import { StudioCompModal } from ${JSON.stringify(path.join(root, "components/admin/StudioCompModal.tsx"))};
let root = null;
window.__mountStudioComp = () => { root?.unmount(); root = createRoot(document.getElementById('fixture-modal')); root.render(React.createElement(StudioCompModal, { onClose: () => { document.getElementById('fixture-modal').innerHTML = '<p>Dialog closed.</p>'; }, onSuccess: () => window.__fixtureRequests.push('onSuccess') })); };
window.__mountStudioComp();
`;
const countrySource = await fs.readFile(path.join(root, "components/v3/Step3EnvelopeAddressing.tsx"), "utf8");
const stateBlock = countrySource.match(/export const US_STATES = (\[[\s\S]*?\n\]);/)?.[1] || "[]";
await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: "admin-comp-entry.tsx", loader: "tsx" }, bundle: true, platform: "browser", format: "iife", outfile: path.join(out, "bundle.js"), jsx: "automatic", plugins: [{ name: "comp-ui-browser-shims", setup(p) {
  p.onResolve({ filter: /^next\/image$/ }, () => ({ path: "next-image", namespace: "fixture" }));
  p.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => args.path === "next-image" ? ({ contents: `import React from 'react'; export default (props) => React.createElement('img', props);`, loader: "js", resolveDir: root }) : null);
  p.onResolve({ filter: /^lucide-react$/ }, () => ({ path: "lucide", namespace: "fixture" }));
  p.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => args.path === "lucide" ? ({ contents: `import React from 'react'; export const ${icons.map((name) => `${name} = (props) => React.createElement('span', { ...props, 'aria-hidden': 'true' })`).join(", ")};`, loader: "js", resolveDir: root }) : null);
  p.onResolve({ filter: /^@\/components\/v3\/Step3EnvelopeAddressing$/ }, () => ({ path: "state-list", namespace: "fixture" }));
  p.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => args.path === "state-list" ? ({ contents: `export const US_STATES = ${stateBlock};`, loader: "js" }) : null);
} }] });

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin comp UI fixture</title><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font:14px system-ui;background:#f5f3ee;color:#292524}.fixture{padding:14px;background:#e7e5e4;border-bottom:1px solid #a8a29e}.fixture p{margin:4px 0}.fixture button{margin:6px 6px 0 0;padding:6px 10px}#request-log{white-space:pre-wrap;max-height:100px;overflow:auto;font:11px monospace}#fixture-modal{min-height:85vh}</style></head><body><aside class="fixture"><strong>Local admin comp visual fixture</strong><p>Fictional address data. All APIs are mocked in this page; external requests are blocked. Final action records a held preview only.</p><button onclick="window.__mountStudioComp()">Reset / reopen dialog</button><button onclick="window.__fixtureConfig.authDenied=true;window.__mountStudioComp()">Simulate catalog authorization failure</button><button onclick="window.__fixtureConfig.authDenied=false;window.__mountStudioComp()">Restore catalog access</button><button onclick="window.__fixtureConfig.quoteDelayMs=1500">Delay next quote response</button><button onclick="document.getElementById('request-log').textContent=JSON.stringify(window.__fixtureRequests,null,2)">Show intercepted requests</button><pre id="request-log"></pre></aside><div id="fixture-modal"></div><script src="/mock-api.js"></script><script src="/bundle.js"></script></body></html>`;
const mock = `
window.__fixtureConfig={authDenied:false,quoteDelayMs:0}; window.__fixtureRequests=[]; window.__orderCreates=0; window.__fixtureQuotes={}; window.__fixtureOrders={};
const usRegions=${stateBlock};
const presets=[{assetId:'preset:birthday-balloons',label:'Celebration Garland',url:'/presets/birthday-balloons.jpg'},{assetId:'preset:thank-you-botanical',label:'Wildflower Meadow',url:'/presets/thank-you-botanical.jpg'},{assetId:'preset:thinking-of-you-misty-pines',label:'Misty Pines & Dawn',url:'/presets/thinking-of-you-misty-pines.jpg'},{assetId:'preset:congrats-champagne',label:'Golden Cheers Coupes',url:'/presets/congrats-champagne.jpg'},{assetId:'preset:anniversary-monstera',label:'Botanical Wreath',url:'/presets/anniversary-monstera.jpg'},{assetId:'preset:love-roses',label:'Velvet Blossoms',url:'/presets/love-roses.jpg'}];
const destinations=[{countryCode:'CA',countryName:'Canada',available:true,regionRequired:true,postalCodeRequired:true,regions:[{code:'ON',name:'Ontario'},{code:'BC',name:'British Columbia'}]},{countryCode:'GB',countryName:'United Kingdom',available:true,regionRequired:false,postalCodeRequired:true,regions:[]}];
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
window.fetch=async(input,init={})=>{const url=new URL(String(input),location.href);const method=(init.method||'GET').toUpperCase();window.__fixtureRequests.push(method+' '+url.pathname+url.search);if(!url.origin.startsWith(location.origin))throw Error('External network blocked by fixture');if(url.pathname==='/api/mailing-options')return respond({destinations});if(url.pathname==='/api/admin/comp/catalog'){if(window.__fixtureConfig.authDenied)return respond({error:'Admin session required.'},401);const country=url.searchParams.get('countryCode')||'US';if(country!=='US'&&!destinations.some(x=>x.countryCode===country))return respond({error:'Unavailable destination.'},400);return respond({catalogVersion:'fixture-v1',quoteVersion:'admin-comp-v1',currency:'USD',destination:country==='US'?{countryCode:'US',countryName:'United States',regionRequired:true,postalCodeRequired:true,regions:usRegions}:destinations.find(x=>x.countryCode===country),lines:[{lineId:'card_a2',label:'Folded A2 card',unitPriceCents:900,quantity:1,adjustmentEligible:true},...(country==='US'?[]:[{lineId:'international_mailing',label:'International mailing',unitPriceCents:500,quantity:1,adjustmentEligible:true}])],presets,staging:{reviewOnly:true,canDispatch:false,canCreatePaymentRequest:false}})}if(url.pathname==='/api/admin/comp/quotes'&&method==='POST'){const delay=window.__fixtureConfig.quoteDelayMs;window.__fixtureConfig.quoteDelayMs=0;if(delay)await new Promise(r=>setTimeout(r,delay));const body=JSON.parse(init.body||'{}');if(!body.reason?.trim())return respond({error:'Reason is required.'},400);const lines=[{lineId:'card_a2',label:'Folded A2 card',quantity:1,unitPriceCents:900},...(body.destinationCountryCode==='US'?[]:[{lineId:'international_mailing',label:'International mailing',quantity:1,unitPriceCents:500}])].map(x=>{const waived=body.mode==='full_comp'?x.unitPriceCents:(body.adjustments||[]).find(a=>a.lineId===x.lineId)?.waivedCents||0;return {...x,grossCents:x.unitPriceCents,adjustmentEligible:true,waivedCents:waived,dueCents:x.unitPriceCents-waived}});const grossCents=lines.reduce((a,x)=>a+x.grossCents,0),waivedCents=lines.reduce((a,x)=>a+x.waivedCents,0);const quote={quoteId:'fixture-quote-'+Date.now(),version:'admin-comp-v1',catalogVersion:'fixture-v1',currency:'USD',destinationCountryCode:body.destinationCountryCode,lines,grossCents,waivedCents,customerPayableCents:grossCents-waivedCents,mode:body.mode,issuedAt:Date.now(),expiresAt:Date.now()+600000};window.__fixtureQuotes[quote.quoteId]=quote;return respond({quote})}if(url.pathname==='/api/admin/comp/orders'&&method==='POST'){const body=JSON.parse(init.body||'{}');const key=body.idempotencyKey;if(window.__fixtureOrders[key])return respond(window.__fixtureOrders[key]);window.__orderCreates++;const quote=window.__fixtureQuotes[body.quoteId];if(!quote)return respond({error:'Quote missing or expired.'},409);const order={orderId:'order_fixture_held_0001',origin:'ADMIN_COMP',lifecycleStatus:'review_only_held',quote,paymentRequest:{status:'review_only_held'},staging:{held:true,message:'Held test preview; no external effects.'}};window.__fixtureOrders[key]=order;return respond(order)}if(url.pathname.includes('/payment-request'))return respond({status:'review_only_held',amountCents:500});if(url.pathname.includes('/api/admin/comp/orders/'))return respond({orderId:'order_fixture_held_0001',origin:'ADMIN_COMP',lifecycleStatus:'review_only_held',staging:{held:true},paymentRequest:{status:'review_only_held'}});return respond({error:'Fixture blocked this request.'},404)};
`;
await fs.writeFile(path.join(out, "index.html"), html);
await fs.writeFile(path.join(out, "mock-api.js"), mock);
const port = Number(process.env.ADMIN_COMP_FIXTURE_PORT || 4173);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname.startsWith("/presets/") && /^[A-Za-z0-9-]+\.jpg$/.test(path.basename(pathname))) {
    try { const asset = await fs.readFile(path.join(root, "public/presets", path.basename(pathname))); res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" }); res.end(asset); }
    catch { res.writeHead(404); res.end("Not found"); }
    return;
  }
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "bundle.js", "mock-api.js", "styles.css"].includes(file)) { res.writeHead(404); res.end("Not found"); return; }
  const body = await fs.readFile(path.join(out, file));
  const contentType = file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" }); res.end(body);
});
server.listen(port, "127.0.0.1", () => console.log(`Admin comp UI fixture: http://127.0.0.1:${port}/`));
