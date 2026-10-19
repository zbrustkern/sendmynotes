import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceRoot = path.resolve(process.env.SMN_SOURCE_ROOT || root);
const require = createRequire(import.meta.url);
const { chromium } = process.env.SMN_PLAYWRIGHT_MODULE
  ? require(process.env.SMN_PLAYWRIGHT_MODULE)
  : require("playwright");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "smn-payment-discount-"));

const sourceFiles = ["components/CheckoutStep.tsx", "components/v3/Step4ReviewAndPayment.tsx"];
const lucideNames = new Set();
for (const relative of sourceFiles) {
  const source = await fs.readFile(path.join(root, relative), "utf8");
  for (const match of source.matchAll(/import\s*\{([^;]*?)\}\s*from\s*["']lucide-react["']/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (name) lucideNames.add(name);
    }
  }
}

const mocks = {
  "@stripe/react-stripe-js": `
    const React = require("react");
    const StripeContext = React.createContext(null);
    exports.Elements = function Elements({ stripe, options, children }) {
      const clientSecret = options && options.clientSecret;
      const [providerSecret] = React.useState(stripe ? clientSecret : null);
      const [instance] = React.useState(() => stripe ? ({ clientSecret: providerSecret, id: "elements:" + providerSecret, submit: async () => ({}) }) : null);
      const [stripeInstance] = React.useState(() => stripe ? ({
        confirmPayment: async ({ elements }) => {
          window.__paymentConfirms.push({ providerSecret: instance.clientSecret, submittedElements: elements.id });
          return { paymentIntent: { id: "pi_local_test", status: "succeeded" } };
        }
      }) : null);
      React.useEffect(() => { if (providerSecret) window.__providerMounts.push(providerSecret); }, []);
      return React.createElement(StripeContext.Provider, { value: { stripe: stripeInstance, elements: instance } }, children);
    };
    exports.useStripe = () => { const context = React.useContext(StripeContext); if (context === null) throw new Error("Could not find Elements context; wrap component in <Elements>"); return context.stripe; };
    exports.useElements = () => { const context = React.useContext(StripeContext); if (context === null) throw new Error("Could not find Elements context; wrap component in <Elements>"); return context.elements; };
    exports.PaymentElement = function PaymentElement({ onReady }) {
      React.useEffect(() => { onReady && onReady(); }, [onReady]);
      return React.createElement("div", { "data-testid": "payment-element" }, "Fake card fields");
    };
    exports.ExpressCheckoutElement = function ExpressCheckoutElement({ onConfirm, onReady }) {
      React.useEffect(() => { onReady && onReady({ availablePaymentMethods: { applePay: true } }); }, [onReady]);
      return React.createElement("button", { type: "button", "data-testid": "wallet-pay", onClick: onConfirm }, "Fake wallet payment");
    };
  `,
  "@stripe/stripe-js": `exports.loadStripe = (key) => ({ key });`,
  "next/image": `import React from "react"; export default (props) => React.createElement("img", props);`,
  "next/navigation": `exports.useSearchParams = () => new URLSearchParams();`,
  "@/lib/delivery-estimate": `exports.calculateDeliveryEstimate = () => ({ earliestDate: "Jan 1", latestDate: "Jan 5" });`,
  "@/lib/device-wallet": `exports.useDeviceWallet = () => ({ walletName: "Apple Pay", type: "apple", paymentNotice: "Test wallet" });`,
  "@/lib/payment-mode": `exports.evaluatePaymentSubmission = ({ isZeroCost, isMock, hasStripe, hasElements }) => isZeroCost ? { mode: "free" } : isMock ? { mode: "local_mock" } : hasStripe && hasElements ? { mode: "stripe" } : { mode: "blocked_error", errorMessage: "Payment processor unavailable" };`,
  "@/lib/telemetry": `exports.trackEvent = exports.trackEventV2 = () => {};`,
  "@/lib/google-ads": `exports.trackGA4ViewItem = exports.trackGA4BeginCheckout = exports.trackGA4AddShippingInfo = exports.trackGA4AddPaymentInfo = () => {};`,
  "@/lib/meta-ads": `exports.trackMetaViewContent = exports.trackMetaAddToCart = exports.trackMetaCustomizeProduct = exports.trackMetaInitiateCheckout = exports.trackMetaAddPaymentInfo = () => {};`,
  "@/context/AuthContext": `exports.useAuth = () => ({ user: null, account: null });`,
  "@/components/AttributionTracker": `exports.getStoredAttribution = () => ({});`,
  "@/components/flow/Sheet": `const React = require("react"); exports.Sheet = ({ children, isOpen }) => isOpen ? React.createElement("div", null, children) : null;`,
  "@/components/CardPreview": `const React = require("react"); exports.CardPreview = () => React.createElement("div", null, "preview");`,
};
mocks["lucide-react"] = `const React = require("react"); ${[...lucideNames].map((name) => `exports.${name} = (props) => React.createElement("span", props);`).join("\n")}`;

let entrySource = await fs.readFile(path.join(root, "tests/fixtures/payment-discount-entry.tsx"), "utf8");
entrySource = entrySource
  .replaceAll('"../../components/CheckoutStep"', JSON.stringify(path.join(sourceRoot, "components/CheckoutStep.tsx")))
  .replaceAll('"../../components/v3/Step4ReviewAndPayment"', JSON.stringify(path.join(sourceRoot, "components/v3/Step4ReviewAndPayment.tsx")));
await build({
  absWorkingDir: sourceRoot,
  stdin: { contents: entrySource, resolveDir: root, sourcefile: "payment-discount-entry.tsx", loader: "tsx" },
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(tempDir, "bundle.js"),
  jsx: "automatic",
  define: { "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '"pk_test_browser_harness"' },
  plugins: [{
    name: "isolated-browser-dependencies",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^(@stripe\/react-stripe-js|@stripe\/stripe-js|next\/image|next\/navigation|lucide-react|@\/.*)$/ }, (args) => ({ path: args.path, namespace: "smn-mock" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "smn-mock" }, (args) => ({ contents: mocks[args.path] || "exports.__esModule = true;", loader: "js", resolveDir: root }));
    },
  }],
});
await fs.writeFile(path.join(tempDir, "index.html"), '<!doctype html><html><body><div id="root"></div><script src="bundle.js"></script></body></html>');

const browser = await chromium.launch({ headless: true, ...(process.env.SMN_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SMN_CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage();
page.on("pageerror", (error) => { throw error; });
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/") return route.fulfill({ path: path.join(tempDir, "index.html"), contentType: "text/html" });
  if (url.pathname === "/bundle.js") return route.fulfill({ path: path.join(tempDir, "bundle.js"), contentType: "text/javascript" });
  return route.abort();
});

async function reset(kind, initialProps = {}) {
  await page.goto("http://smn.test/");
  await page.evaluate(({ kind, initialProps }) => {
    window.__startHarness(kind, initialProps);
  }, { kind, initialProps });
  await page.waitForFunction(() => document.querySelector("form") || document.querySelector('[role="alert"]') || document.querySelector('[role="status"]'));
  await page.waitForTimeout(30);
}

async function verifySuite(kind) {
  await reset(kind);
  const mountSecrets = () => page.evaluate(() => window.__providerMounts);
  const confirmCalls = () => page.evaluate(() => window.__paymentConfirms);
  const totalText = () => page.locator("body").innerText();
  const payment = page.getByTestId("payment-element");
  await payment.waitFor();
  assert.deepEqual(await mountSecrets(), ["seti_full_900"], `${kind}: initial full-price provider mounted`);
  assert.match(await totalText(), /\$9\.00/, `${kind}: base price remains $9`);

  if (kind === "v3") {
    await page.getByText("+ Have a voucher or promo code?").click();
  }
  await page.locator('input[placeholder="e.g. LAUNCH100"], input[placeholder="PROMO CODE"]').fill("PARTIAL");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => typeof window.__resolveApply === "function");
  const submits = page.locator('button[type="submit"]');
  const enabledSubmits = await submits.evaluateAll((buttons) => buttons.filter((button) => !button.disabled).length);
  if (process.env.SMN_EXPECT_STALE_PROVIDER !== "1") {
    assert.equal(enabledSubmits, 0, `${kind}: payment submit is blocked while discount apply is pending`);
  }
  if (kind === "v3") assert.equal(await page.getByTestId("wallet-pay").count(), 0, "v3: wallet element is withheld while discount apply is pending");
  await page.evaluate(() => window.__resolveApply());
  await page.getByText("PARTIAL", { exact: true }).first().waitFor();
  if (process.env.SMN_EXPECT_STALE_PROVIDER === "1") {
    assert.equal(enabledSubmits, 1, "baseline also leaves payment enabled during discount apply");
    await submits.last().click();
    await page.waitForFunction(() => window.__paymentConfirms.length > 0);
    assert.equal((await confirmCalls())[0].providerSecret, "seti_full_900", "baseline reproduces provider retaining the original client secret");
    assert.equal((await confirmCalls())[0].submittedElements, "elements:seti_full_900", "baseline submits through stale Elements instance");
    console.log(`REPRODUCED ${kind}: unchanged Elements instance retains full-price secret after discount`);
    return;
  }
  await page.waitForFunction(() => window.__providerMounts.includes("seti_partial_600"));
  assert.match(await totalText(), /\$6\.00/, `${kind}: fixed discount displays $6`);
  await submits.last().click();
  await page.waitForFunction(() => window.__paymentConfirms.some((call) => call.providerSecret === "seti_partial_600"));
  assert.ok((await confirmCalls()).some((call) => call.providerSecret === "seti_partial_600" && call.submittedElements === "elements:seti_partial_600"), `${kind}: payment uses Elements bound to discounted secret`);

  // Reinitialize and check percentage and free transitions in a fresh component tree.
  await reset(kind);
  if (kind === "v3") await page.getByText("+ Have a voucher or promo code?").click();
  await page.locator('input[placeholder="e.g. LAUNCH100"], input[placeholder="PROMO CODE"]').fill("BAD");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => typeof window.__resolveApply === "function");
  await page.evaluate(() => window.__resolveApply());
  await page.getByText("Invalid code").waitFor();
  assert.match(await totalText(), /\$9\.00/, `${kind}: failed promo leaves full amount intact`);

  // The fixture recognizes a 50% code; this validates a fresh successful provider rebind.
  await page.locator('input[placeholder="e.g. LAUNCH100"], input[placeholder="PROMO CODE"]').fill("PERCENT");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => typeof window.__resolveApply === "function");
  await page.evaluate(() => window.__resolveApply());
  await page.waitForFunction(() => window.__providerMounts.includes("seti_percent_450"));
  assert.match(await totalText(), /\$4\.50/, `${kind}: percentage discount displays $4.50`);

  await page.evaluate(() => window.__updateProps({
    onRemoveDiscount: async () => {
      await new Promise((resolve) => { window.__resolveRemove = resolve; });
      window.__updateProps({ appliedDiscount: null, isFree: false, clientSecret: "seti_full_900" });
    },
  }));
  const remove = page.getByTitle(kind === "v3" ? "Remove code" : "Remove discount code");
  await remove.click();
  await page.waitForFunction(() => typeof window.__resolveRemove === "function");
  const removeEnabledSubmits = await page.locator('button[type="submit"]').evaluateAll((buttons) => buttons.filter((button) => !button.disabled).length);
  assert.equal(removeEnabledSubmits, 0, `${kind}: payment submit is blocked while discount removal is pending`);
  if (kind === "v3") assert.equal(await page.getByTestId("wallet-pay").count(), 0, "v3: wallet element is withheld while discount removal is pending");
  await page.evaluate(() => window.__resolveRemove());
  await page.waitForFunction(() => window.__providerMounts.includes("seti_full_900"));
  assert.match(await totalText(), /\$9\.00/, `${kind}: removing a discount restores $9`);

  if (kind === "v3") await page.getByText("+ Have a voucher or promo code?").click();
  await page.locator('input[placeholder="e.g. LAUNCH100"], input[placeholder="PROMO CODE"]').fill("FREE");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(() => typeof window.__resolveApply === "function");
  await page.evaluate(() => window.__resolveApply());
  if (kind === "legacy") await page.getByText("$0.00 (Free)").waitFor();
  else await page.getByText("100% Free Order Voucher").waitFor();
  assert.equal(await page.getByTestId("payment-element").count(), 0, `${kind}: zero amount removes card fields`);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForFunction(() => window.__fetchCalls.some((call) => call.url === "/api/checkout/complete-free-order"));
  assert.ok(!(await confirmCalls()).some((call) => call.providerSecret === "seti_free_0"), `${kind}: free order never confirms payment through Stripe`);
  await page.evaluate(() => window.__updateProps({
    onRemoveDiscount: async () => window.__updateProps({ appliedDiscount: null, isFree: false, clientSecret: "seti_full_900" }),
  }));
  await page.getByTitle(kind === "v3" ? "Remove code" : "Remove discount code").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="payment-element"]'), undefined, { timeout: 3000 }).catch(async () => {
    throw new Error(`${kind}: payment fields did not return after free voucher removal; body=${(await page.locator("body").innerText()).slice(-700)}`);
  });
  await page.waitForFunction(() => window.__providerMounts.includes("seti_full_900"));
  assert.match(await totalText(), /\$9\.00/, `${kind}: removing free voucher restores a payable $9 order`);

  await reset(kind, { isMock: true, clientSecret: null });
  await page.locator('button[type="submit"]').last().click();
  await page.waitForFunction(() => window.__fetchCalls.some((call) => call.url === "/api/checkout/confirm-order"));
  assert.equal((await confirmCalls()).length, 0, `${kind}: local mock checkout has Elements context but does not call Stripe`);

  await reset(kind, { checkoutError: "Checkout could not be refreshed.", clientSecret: null });
  await page.getByRole("alert").getByText("Checkout could not be refreshed.").waitFor();
  await page.getByRole("button", { name: "Retry checkout" }).click();
  assert.equal(await page.evaluate(() => window.__retryCount), 1, `${kind}: checkout error exposes working retry`);
  assert.equal(await page.getByTestId("payment-element").count(), 0, `${kind}: checkout error blocks stale payment fields`);
  console.log(`PASS ${kind}: mounted discount, provider rebind, pending/error, remove, free and retry flows`);
}

try {
  if (process.env.SMN_EXPECT_STALE_PROVIDER === "1") await verifySuite("legacy");
  else {
    await verifySuite("legacy");
    await verifySuite("v3");
  }
} finally {
  await browser.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
