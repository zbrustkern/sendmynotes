import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = await fs.mkdtemp(path.join(os.tmpdir(), "smn-sprint0021-step4-"));
const lucideSource = await fs.readFile(path.join(root, "components/v3/Step4ReviewAndPayment.tsx"), "utf8");
const iconNames = [...new Set([...lucideSource.matchAll(/import\s*\{([^;]*?)\}\s*from\s*["']lucide-react["']/g)].flatMap((match) => match[1].split(",").map((value) => value.trim().split(/\s+as\s+/)[0])).filter(Boolean))];

const stripeMock = `
const React = require("react");
const Context = React.createContext(null);
exports.Elements = function Elements({ stripe, options, children }) {
  const clientSecret = options?.clientSecret ?? null;
  const elements = stripe ? { id: "elements:" + clientSecret, clientSecret, submit: async () => ({}) } : null;
  const stripeApi = stripe ? { confirmPayment: async () => { window.__fixtureStats.paymentConfirms++; return { paymentIntent: { id: "pi_fixture_test", status: "succeeded" } }; } } : null;
  return React.createElement(Context.Provider, { value: { elements, stripe: stripeApi } }, children);
};
exports.useElements = () => React.useContext(Context)?.elements ?? null;
exports.useStripe = () => React.useContext(Context)?.stripe ?? null;
exports.PaymentElement = function PaymentElement({ onReady }) { React.useEffect(() => { onReady?.(); }, [onReady]); return React.createElement("div", { "data-testid": "payment-element" }, "Mock card fields — no provider connection"); };
exports.ExpressCheckoutElement = function ExpressCheckoutElement({ onConfirm, onReady }) { React.useEffect(() => { onReady?.({ availablePaymentMethods: window.__fixtureOutcome.wallet ? { applePay: true } : {} }); }, [onReady]); return React.createElement("button", { type: "button", "data-testid": "wallet-pay", onClick: onConfirm }, "Mock wallet payment"); };
`;

const mocks = {
  "@stripe/react-stripe-js": stripeMock,
  "@stripe/stripe-js": `exports.loadStripe = (key) => ({ fixtureKey: key });`,
  "next/image": `const React = require("react"); module.exports = function FixtureImage(props) { return React.createElement("img", props); };`,
  "@/lib/delivery-estimate": `exports.calculateDeliveryEstimate = () => ({ earliestDate: "Oct 29", latestDate: "Nov 4" });`,
  "@/lib/device-wallet": `exports.useDeviceWallet = () => ({ walletName: "Apple Pay", type: "apple", paymentNotice: "Fixture wallet available" });`,
  "@/lib/payment-mode": `exports.evaluatePaymentSubmission = ({ isZeroCost, isMock, hasStripe, hasElements }) => isZeroCost ? { mode: "free" } : isMock ? { mode: "local_mock" } : hasStripe && hasElements ? { mode: "stripe" } : { mode: "blocked_error", errorMessage: "Payment processor unavailable" };`,
  "@/lib/checkout-contact-policy": `exports.normalizeCheckoutEmail = (value) => { const email = String(value ?? "").trim(); if (!email) return ""; return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) ? email.toLowerCase() : null; }; exports.checkoutEmailRequired = (deferred, email) => Boolean(deferred && !String(email ?? "").trim());`,
  "@/lib/telemetry": `exports.trackEvent = exports.trackEventV2 = () => {};`,
  "@/components/flow/Sheet": `const React = require("react"); exports.Sheet = ({ children, isOpen }) => isOpen ? React.createElement("div", { role: "dialog", "aria-label": "Card preview" }, children) : null;`,
  "@/components/CardPreview": `const React = require("react"); exports.CardPreview = () => React.createElement("div", null, "Fixture card preview");`,
  "@/lib/google-ads": `exports.markGoogleAdsCheckoutActive = exports.clearGoogleAdsCheckoutActive = () => {};`,
  "./Step3EnvelopeAddressing": `exports.isInternationalCountry = (value) => Boolean(value && !["US","USA"].includes(String(value).toUpperCase()));`,
  "lucide-react": `const React = require("react"); ${iconNames.map((name) => `exports.${name} = (props) => React.createElement("span", { ...props, "aria-hidden": props["aria-hidden"] ?? true });`).join("\n")}`,
};

await build({
  absWorkingDir: root,
  entryPoints: ["tests/fixtures/sprint-0021-step4-entry.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(output, "bundle.js"),
  jsx: "automatic",
  define: { "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '"pk_test_local_fixture_only"' },
  plugins: [{
    name: "step4-fixture-mocks",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^(@stripe\/react-stripe-js|@stripe\/stripe-js|next\/image|lucide-react|@\/.*|\.\/Step3EnvelopeAddressing)$/ }, (args) => ({ path: args.path, namespace: "fixture-mock" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "fixture-mock" }, (args) => ({ contents: mocks[args.path] || "exports.__esModule = true;", loader: "js", resolveDir: root }));
    },
  }],
});
execFileSync(path.join(root, "node_modules/.bin/tailwindcss"), ["-i", "app/globals.css", "-o", path.join(output, "styles.css"), "--config", "tailwind.config.ts"], { cwd: root, stdio: "inherit" });

await fs.writeFile(path.join(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sprint 0021 Step 4 fixture</title><link rel="stylesheet" href="/styles.css"><style>
:root{--font-hw-adam:'HandwryttenAdam';--font-hw-charity:'HandwryttenCharity';--font-hw-chase:'HandwryttenChase';--font-hw-david:'HandwryttenDavid';--font-hw-kate:'HandwryttenKate';--font-hw-will:'HandwryttenWill'}*{box-sizing:border-box}body{margin:0;background:#f3f3ef;color:#272b28;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.fixture-root{min-height:100vh}.fixture-controls{position:sticky;top:0;z-index:40;background:#fff;border-bottom:1px solid #d9ddd8;padding:14px max(14px,calc((100vw - 1240px)/2))}.fixture-controls h1{font:23px/1.2 Georgia,serif;margin:0 0 4px}.fixture-controls p{color:#68736b;font-size:12px;margin:4px 0 8px}.fixture-row{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:7px 0}.fixture-row button,.fixture-row select{min-height:36px;border:1px solid #ccd4cc;background:#fff;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;color:#34443a}.fixture-row button[aria-pressed=true]{border-color:#247451;background:#e8f2eb}.fixture-row label{display:inline-flex;align-items:center;gap:6px;font-size:12px}.fixture-observations{display:flex;gap:7px 14px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:#f4f7f2;border-radius:9px;font-size:11px;color:#39483e}.fixture-payment{max-width:1160px;margin:18px auto;padding:0 16px 32px}.fixture-payment form{padding:18px;background:#fff;border:1px solid #dce1dc;border-radius:16px;box-shadow:0 8px 25px #26332612}@media(max-width:600px){.fixture-controls{padding:10px}.fixture-controls h1{font-size:20px}.fixture-payment{padding:0 8px 20px;margin:10px auto}.fixture-payment form{padding:12px}}
</style></head><body><div id="root"></div><script>
window.__fixtureOutcome={contact:"success",confirm:"success",wallet:false,delayContact:false};window.__fixtureStats={paymentConfirms:0};window.fetch=async(input,options={})=>{const path=String(input);const body=options.body?JSON.parse(options.body):{};if(path!=="/api/checkout/contact"&&path!=="/api/checkout/confirm-order"&&path!=="/api/checkout/complete-free-order")return new Response(JSON.stringify({error:"Fixture blocks this route."}),{status:404});window.__fixtureCounters?.record(path,body.customerEmail);if(path==="/api/checkout/contact"){if(window.__fixtureOutcome.delayContact)await new Promise(resolve=>setTimeout(resolve,1800));if(window.__fixtureOutcome.contact==="failure")return new Response(JSON.stringify({error:"Fixture contact preference save failed."}),{status:503});return new Response(JSON.stringify({success:true}),{status:200});}if(path==="/api/checkout/confirm-order"&&window.__fixtureOutcome.confirm==="reconfirm")return new Response(JSON.stringify({requiresPriceReconfirmation:true,error:"Fixture quote expired; reconfirm total."}),{status:409});if(path==="/api/checkout/complete-free-order")return new Response(JSON.stringify({success:true,viewToken:"fixture-view",status:"CONFIRMED"}),{status:200});return new Response(JSON.stringify({success:true,viewToken:"fixture-view",status:"CONFIRMED"}),{status:200});};
</script><script src="/bundle.js"></script></body></html>`);

const staticFiles = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/bundle.js", ["bundle.js", "text/javascript; charset=utf-8"]], ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (pathname.startsWith("/fonts/")) {
    const filename = path.basename(pathname);
    if (!/^hw(?:Adam|Charity|Chase|David|Kate|Will)\.ttf$/.test(filename)) { response.writeHead(404).end("Not found"); return; }
    try { response.writeHead(200, { "content-type": "font/ttf", "cache-control": "no-store" }).end(await fs.readFile(path.join(root, "public/fonts", filename))); } catch { response.writeHead(404).end("Not found"); }
    return;
  }
  const file = staticFiles.get(pathname);
  if (!file) { response.writeHead(404).end("Fixture blocks this route"); return; }
  response.writeHead(200, { "content-type": file[1], "cache-control": "no-store" }).end(await fs.readFile(path.join(output, file[0])));
});
server.listen(3134, "127.0.0.1", () => console.log("Sprint 0021 Step 4 fixture ready at http://127.0.0.1:3134"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { await fs.rm(output, { recursive: true, force: true }); process.exit(0); }));
