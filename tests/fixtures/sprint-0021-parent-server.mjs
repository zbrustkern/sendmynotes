import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = await fs.mkdtemp(path.join(os.tmpdir(), "smn-sprint0021-parent-"));
const parentFile = await fs.readFile(path.join(root, "app/preview/entry/client.tsx"), "utf8");
const iconNames = [...new Set([...parentFile.matchAll(/import\s*\{([^;]*?)\}\s*from\s*["']lucide-react["']/g)].flatMap((match) => match[1].split(",").map((value) => value.trim().split(/\s+as\s+/)[0])).filter(Boolean))];

const flowMocks = `
const React = require("react");
exports.FlowHeader = ({ onClearDraft, resetDisabled }) => React.createElement("header", { className: "fixture-parent-header" }, React.createElement("strong", null, "Actual EntryPrototypeClient · fixture header"), React.createElement("button", { type: "button", disabled: Boolean(resetDisabled), onClick: onClearDraft }, "Clear draft / start new card"));
exports.ProgressIndicator = ({ currentStep }) => React.createElement("nav", { "aria-label": "Checkout progress" }, "Current step: " + currentStep);
exports.ActionBar = ({ primaryLabel, onPrimaryClick, isDisabled }) => React.createElement("button", { type: "button", disabled: Boolean(isDisabled), onClick: onPrimaryClick }, primaryLabel);
exports.EntryCardStep = ({ onAcceptAndContinue }) => React.createElement("section", null, React.createElement("h2", null, "Choose a card"), React.createElement("button", { type: "button", onClick: onAcceptAndContinue }, "Continue to note"));
`;
const childMocks = `
const React = require("react");
exports.Step2NoteComposition = ({ onContinue }) => React.createElement("section", null, React.createElement("h2", null, "Write your note"), React.createElement("button", { onClick: onContinue }, "Continue to address"));
exports.HANDWRITING_STYLES = [{ id: "hwDavid", label: "David", fontClass: "font-hwDavid" }];
exports.Step3EnvelopeAddressing = ({ onContinue }) => React.createElement("section", null, React.createElement("h2", null, "Address"), React.createElement("button", { onClick: onContinue }, "Continue to payment"));
exports.isInternationalCountry = (country) => Boolean(country && !["US","USA"].includes(String(country).toUpperCase()));
exports.Step4ReviewAndPayment = (props) => { const source = !props.customerEmail ? "empty" : props.customerEmail === "sam.sender@example.test" ? "account fixture" : props.customerEmail === "typed.sender@example.test" ? "typed fixture" : "other nonempty"; window.__latestEmailState = source; return React.createElement("section", { className: "fixture-payment-child", "aria-label": "Parent checkout contact state" }, React.createElement("h2", null, "Parent email state"), React.createElement("label", { htmlFor: "parent-email" }, "Customer email"), React.createElement("input", { id: "parent-email", type: "email", autoComplete: "off", value: props.customerEmail, onChange: (event) => props.onChangeCustomerEmail(event.target.value) }), React.createElement("p", { role: "status", "aria-live": "polite" }, "Email source: " + source + " (value redacted)"), React.createElement("button", { type: "button", onClick: () => props.onChangeCustomerEmail("") }, "Clear email through parent callback"), React.createElement("button", { type: "button", onClick: () => props.onChangeCustomerEmail("typed.sender@example.test") }, "Set a typed test email")); };
exports.Step5Confirmation = () => React.createElement("p", null, "Confirmation fixture");
exports.CustomAiCommissionDrawer = () => null;
`;
const mocks = {
  "next/navigation": `exports.useSearchParams = () => new URLSearchParams(window.location.search); exports.useRouter = () => ({ push: (value) => { window.__lastNavigation = value; } });`,
  "@/lib/card-presets": `exports.CARD_PRESETS = [{ id:"fixture-card", title:"Fixture Card", imageUrl:"/fixture-card", occasion:"Thinking of You", defaultHandwrittenNote:"Hello" }]; exports.OCCASIONS=["Thinking of You","Birthday","General"]; exports.matchOccasionToPreset=()=>exports.CARD_PRESETS[0]; exports.getTopPresetForOccasion=()=>exports.CARD_PRESETS[0]; exports.canonicalOccasion=(value)=>String(value||"general").toLowerCase();`,
  "@/components/flow": flowMocks,
  "@/components/v3/Step2NoteComposition": childMocks,
  "@/components/v3/Step3EnvelopeAddressing": childMocks,
  "@/components/v3/Step4ReviewAndPayment": childMocks,
  "@/components/v3/Step5Confirmation": childMocks,
  "@/components/v3/CustomAiCommissionDrawer": childMocks,
  "@/lib/payment-mode": `exports.evaluateCheckoutInitTransition=()=>({canAdvance:true}); exports.evaluatePaymentSubmission=()=>({mode:"blocked_error",errorMessage:"No payments in parent fixture."});`,
  "@/lib/telemetry": `exports.trackEvent=exports.trackEventV2=()=>{}; exports.getSessionId=()=>"parent-prefill-fixture";`,
  "@/lib/journey-identity": `exports.bindJourneyToDraft=()=>({});`,
  "@/lib/google-ads": `exports.trackGA4ViewItem=exports.trackGA4BeginCheckout=exports.trackGA4AddShippingInfo=exports.trackGA4AddPaymentInfo=()=>{}; exports.getStoredAttribution=()=>({});`,
  "@/lib/meta-ads": `exports.trackMetaViewContent=exports.trackMetaAddToCart=exports.trackMetaCustomizeProduct=exports.trackMetaInitiateCheckout=exports.trackMetaAddPaymentInfo=()=>{};`,
  "@/components/AttributionTracker": `exports.getStoredAttribution=()=>({});`,
  "@/context/AuthContext": `const React=require("react"); exports.useAuth=()=>{const [user,setUser]=React.useState(window.__fixtureAuthUser); window.__setFixtureAuthUser=(value)=>{window.__fixtureAuthUser=value;setUser(value)}; return {user,account:null,saveAddress:async()=>{}};};`,
  "lucide-react": `const React=require("react"); ${iconNames.map((name) => `exports.${name}=(props)=>React.createElement("span", { ...props, "aria-hidden": props["aria-hidden"] ?? true });`).join("\n")}`,
  "@/lib/seo-scenarios": `exports.parseScenarioNote=()=>null; exports.mapScenarioFontId=()=>"hwDavid";`,
  "@/components/v3/TargetPurchaseExperience": `exports.extractRecipientName=()=>"Friend"; exports.extractSenderName=()=>"Sender";`,
  "@/lib/discount": `exports.extractOfferCodeFromUrlParams=(params)=>params?.get?.("discount")||null;`,
};

await build({
  absWorkingDir: root,
  entryPoints: ["tests/fixtures/sprint-0021-parent-entry.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(output, "bundle.js"),
  jsx: "automatic",
  define: { "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '"pk_test_parent_fixture_only"' },
  plugins: [{
    name: "actual-parent-with-local-dependencies",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@\/lib\/draft$/ }, () => ({ path: path.join(root, "lib/draft/index.ts") }));
      pluginBuild.onResolve({ filter: /^(next\/navigation|lucide-react|@\/.*)$/ }, (args) => ({ path: args.path, namespace: "parent-fixture" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "parent-fixture" }, (args) => ({ contents: mocks[args.path] || "exports.__esModule = true;", loader: "js", resolveDir: root }));
    },
  }],
});
execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "app/globals.css", "-o", path.join(output, "styles.css"), "--config", "tailwind.config.ts"], { cwd: root, stdio: "inherit" });

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sprint 0021 parent email fixture</title><link rel="stylesheet" href="/styles.css"><style>
*{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#252b28;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.controls{position:sticky;top:0;z-index:20;padding:14px;background:#fff;border-bottom:1px solid #d8ded8}.controls h1{font:22px Georgia,serif;margin:0 0 5px}.controls p{margin:4px 0;color:#68736b;font-size:12px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.actions button{min-height:38px;border:1px solid #cbd4cc;border-radius:9px;background:white;padding:6px 11px;color:#293c31}.observe{display:flex;gap:7px 16px;flex-wrap:wrap;padding:8px 10px;border-radius:8px;background:#f2f6f1;font-size:12px}.fixture-parent-header{height:56px;background:white;border-bottom:1px solid #ddd;display:flex;align-items:center;justify-content:space-between;padding:0 16px}.fixture-parent-header button,.fixture-payment-child button{min-height:40px;border:1px solid #cbd4cc;border-radius:8px;background:#fff;padding:6px 12px}.fixture-payment-child{max-width:620px;margin:24px auto;padding:20px;background:white;border:1px solid #ddd;border-radius:14px}.fixture-payment-child h2{font:22px Georgia,serif;margin:0 0 12px}.fixture-payment-child label{display:block;font-size:12px;font-weight:600}.fixture-payment-child input{display:block;width:100%;min-height:44px;margin:5px 0 8px;padding:8px 10px;border:1px solid #ccd4cc;border-radius:8px;font:inherit}.fixture-payment-child p{color:#55645a;font-size:13px}.fixture-payment-child button{margin-right:6px}@media(max-width:560px){.controls{padding:10px}.controls h1{font-size:19px}.fixture-payment-child{margin:14px 9px;padding:14px}}
</style></head><body><section class="controls" aria-label="Fixture controls"><h1>Actual parent email state fixture</h1><p>Real EntryPrototypeClient and useDraft persistence. Payment step is a local child stub; all requests are mocked and no payment can occur.</p><div class="actions"><button type="button" id="late-auth">Simulate late auth email</button><button type="button" id="auth-away">Sign out</button><button type="button" id="remount">Remount parent at payment</button><button type="button" id="refresh">Refresh page</button><button type="button" id="read-choice">Read saved contact choice</button><button type="button" id="clear-storage">Reset fixture storage</button></div><div class="observe" role="status" aria-live="polite"><strong>Redacted fixture state</strong><span id="auth-state">Auth: signed out</span><span id="saved-choice">Saved draft choice: not inspected</span><span id="fetch-count">Mock fetches: 0</span><span id="fetch-paths">Routes: none</span></div></section><div id="parent-root"></div>
<script>
window.__fixtureAuthUser=null;window.__fixtureFetchPaths=[];if(!sessionStorage.getItem("__smn_parent_fixture_started")){sessionStorage.clear();sessionStorage.setItem("__smn_parent_fixture_started","1");}window.fetch=async(input,options={})=>{const url=String(input);window.__fixtureFetchPaths.push(url);document.getElementById("fetch-count").textContent="Mock fetches: "+window.__fixtureFetchPaths.length;document.getElementById("fetch-paths").textContent="Routes: "+window.__fixtureFetchPaths.map((path)=>new URL(path,location.href).pathname).join(" → ");if(url==="/api/mailing-options")return new Response(JSON.stringify({enabled:false,previewAvailable:false,destinations:[]}),{status:200});if(url==="/api/checkout/create-intent")return new Response(JSON.stringify({orderId:"parent-fixture-order",viewToken:"fixture-view-token",clientSecret:"seti_parent_fixture",publishableKey:"pk_test_parent_fixture_only",amountInCents:900,isFree:false,isMock:false}),{status:200});return new Response(JSON.stringify({error:"Fixture blocks all other requests."}),{status:404});};
</script><script src="/bundle.js"></script><script>
document.getElementById("late-auth").onclick=()=>{window.__setFixtureAuthUser({email:"sam.sender@example.test",uid:"fixture-user"});document.getElementById("auth-state").textContent="Auth: signed in (email redacted)"};document.getElementById("auth-away").onclick=()=>{window.__setFixtureAuthUser(null);document.getElementById("auth-state").textContent="Auth: signed out"};document.getElementById("remount").onclick=()=>window.__startParent("pay");document.getElementById("refresh").onclick=()=>location.reload();document.getElementById("read-choice").onclick=()=>{try{const draft=JSON.parse(sessionStorage.getItem("sendmynotes_draft_v1")||"null");document.getElementById("saved-choice").textContent="Saved draft choice: "+(draft?.checkoutContact?.choice||"untouched")}catch{document.getElementById("saved-choice").textContent="Saved draft choice: unavailable"}};document.getElementById("clear-storage").onclick=()=>{sessionStorage.clear();window.__fixtureFetchPaths=[];location.reload()};window.__startParent("pay");
</script></body></html>`;
await fs.writeFile(path.join(output, "index.html"), page);

const files = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/bundle.js", ["bundle.js", "text/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const item = files.get(pathname);
  if (!item) { response.writeHead(404).end("Fixture blocks this route"); return; }
  response.writeHead(200, { "content-type": item[1], "cache-control": "no-store" }).end(await fs.readFile(path.join(output, item[0])));
});
server.listen(3135, "127.0.0.1", () => console.log("Sprint 0021 parent fixture ready at http://127.0.0.1:3135"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { await fs.rm(output, { recursive: true, force: true }); process.exit(0); }));
