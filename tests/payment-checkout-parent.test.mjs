import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceRoot = path.resolve(process.env.SMN_SOURCE_ROOT || repoRoot);
const require = createRequire(import.meta.url);
const { chromium } = process.env.SMN_PLAYWRIGHT_MODULE
  ? require(process.env.SMN_PLAYWRIGHT_MODULE)
  : require("playwright");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "smn-parent-checkout-"));

const parentSources = [
  "app/preview/entry/client.tsx",
  "components/VendingMachineBuilder.tsx",
  "components/CheckoutStep.tsx",
  "components/v3/Step4ReviewAndPayment.tsx",
];
const iconNames = new Set();
for (const relative of parentSources) {
  const source = await fs.readFile(path.join(sourceRoot, relative), "utf8");
  for (const match of source.matchAll(/import\s*\{([^;]*?)\}\s*from\s*["']lucide-react["']/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (name) iconNames.add(name);
    }
  }
}

const parentMock = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { EntryPrototypeClient } from "${path.join(sourceRoot, "app/preview/entry/client.tsx")}";
  import { VendingMachineBuilder } from "${path.join(sourceRoot, "components/VendingMachineBuilder.tsx")}";

  const ParentPayment = (props) => {
    window.__latestPaymentProps = props;
    return React.createElement("section", { "data-testid": "parent-payment" },
      React.createElement("div", { "data-testid": "order-id" }, props.orderId || "no-order"),
      React.createElement("div", { "data-testid": "client-secret" }, props.clientSecret || "no-secret"),
      React.createElement("div", { "data-testid": "applied-code" }, props.appliedDiscount?.code || "none"),
      React.createElement("div", { "data-testid": "free-state" }, String(Boolean(props.isFree))),
      React.createElement("div", { "data-testid": "checkout-error" }, props.checkoutError || ""),
      React.createElement("div", { "data-testid": "updating-state" }, String(Boolean(props.isUpdatingCheckout))),
      React.createElement("button", { type: "button", "data-testid": "apply-parent-code", onClick: async () => { window.__applyResult = await props.onApplyDiscount("HALF"); } }, "Apply HALF"),
      props.onRetryCheckout && React.createElement("button", { type: "button", "data-testid": "parent-retry", onClick: props.onRetryCheckout }, "Retry parent checkout")
    );
  };

  window.__startParent = ({ kind, initialStep, draft, search }) => {
    window.__root?.unmount();
    window.__root = createRoot(document.getElementById("root"));
    window.__latestPaymentProps = null;
    window.__applyResult = undefined;
    window.__draft = draft;
    window.__searchParams = new URLSearchParams(search || "");
    window.__root.render(kind === "entry"
      ? React.createElement(EntryPrototypeClient, { initialStep: initialStep || "pay" })
      : React.createElement(VendingMachineBuilder, { initialStep: initialStep || 3 }));
  };
`;

const flowMocks = `
  import React from "react";
  export const FlowHeader = () => null;
  export const ProgressIndicator = () => null;
  export const ActionBar = ({ primaryLabel, onPrimaryClick, isLoading, isDisabled }) => React.createElement("button", { type: "button", onClick: onPrimaryClick, disabled: Boolean(isLoading || isDisabled), "data-testid": "action-bar-primary" }, primaryLabel);
  export const EntryCardStep = () => null;
`;

const childMocks = `
  import React from "react";
  export const Step2NoteComposition = () => null;
  export const HANDWRITING_STYLES = [{ id: "hwDavid", label: "David", fontClass: "font-David" }];
  export const Step3EnvelopeAddressing = ({ onContinue, onBack }) => React.createElement("section", { "data-testid": "entry-address" }, React.createElement("button", { onClick: onContinue }, "Continue address"), React.createElement("button", { onClick: onBack }, "Back"));
  export const Step4ReviewAndPayment = (props) => window.__renderParentPayment(props);
  export const Step5Confirmation = () => React.createElement("div", null, "Confirmation");
  export const CustomAiCommissionDrawer = () => null;
`;

const mockModules = {
  "next/navigation": `exports.useSearchParams = () => window.__searchParams || new URLSearchParams(); exports.useRouter = () => ({ push: (url) => { window.__lastNavigation = url; } });`,
  "next/image": `import React from "react"; export default (props) => React.createElement("img", props);`,
  "next/link": `import React from "react"; export default (props) => React.createElement("a", props, props.children);`,
  "@/lib/card-presets": `exports.CARD_PRESETS = [{ id: "test-card", title: "Test Card", imageUrl: "/test.png", occasion: "Birthday", defaultHandwrittenNote: "Hello" }]; exports.OCCASIONS = ["Birthday", "General"]; exports.FONT_OPTIONS = [{ id: "hwDavid", name: "David" }]; exports.matchOccasionToPreset = () => exports.CARD_PRESETS[0]; exports.getTopPresetForOccasion = () => exports.CARD_PRESETS[0]; exports.canonicalOccasion = (x) => String(x || "general").toLowerCase();`,
  "@/lib/draft": `exports.useDraft = () => ({ draft: window.__draft || { selectedDesign: null, note: { text: "", style: "hwDavid", salutation: "", signOff: "" }, recipient: {}, sender: {}, discountCode: null, appliedOffer: null, currentStep: "pay", completed: false }, dispatch: () => {}, clearDraft: () => {}, isLoaded: true });`,
  "@/components/flow": flowMocks,
  "@/components/v3/Step2NoteComposition": childMocks,
  "@/components/v3/Step3EnvelopeAddressing": childMocks,
  "@/components/v3/Step4ReviewAndPayment": childMocks,
  "@/components/v3/Step5Confirmation": childMocks,
  "@/components/v3/CustomAiCommissionDrawer": childMocks,
  "@/components/v3/TargetPurchaseExperience": `exports.extractRecipientName = () => "Friend"; exports.extractSenderName = () => "Sender";`,
  "@/lib/payment-mode": `exports.evaluateCheckoutInitTransition = () => ({ canAdvance: true }); exports.evaluatePaymentSubmission = ({ isZeroCost, isMock, hasStripe, hasElements }) => isZeroCost ? { mode: "free" } : isMock ? { mode: "local_mock" } : hasStripe && hasElements ? { mode: "stripe" } : { mode: "blocked_error", errorMessage: "Payment processor unavailable" };`,
  "@/lib/telemetry": `exports.trackEvent = exports.trackEventV2 = () => {}; exports.getSessionId = () => "parent-test-session";`,
  "@/lib/google-ads": `exports.trackGA4ViewItem = exports.trackGA4BeginCheckout = exports.trackGA4AddShippingInfo = exports.trackGA4AddPaymentInfo = exports.trackGA4CustomEvent = () => {};`,
  "@/lib/meta-ads": `exports.trackMetaViewContent = exports.trackMetaAddToCart = exports.trackMetaCustomizeProduct = exports.trackMetaInitiateCheckout = exports.trackMetaAddPaymentInfo = () => {};`,
  "@/components/AttributionTracker": `exports.getStoredAttribution = () => ({});`,
  "@/context/AuthContext": `exports.useAuth = () => ({ user: null, account: null, saveAddress: async () => {} });`,
  "@/lib/device-wallet": `exports.useDeviceWallet = () => ({ heroCallout: "", walletName: "Apple Pay", type: "apple", paymentNotice: "test" });`,
  "@/lib/seo-scenarios": `exports.parseScenarioNote = () => null; exports.mapScenarioFontId = () => "hwDavid";`,
  "@/lib/discount": `exports.extractOfferCodeFromUrlParams = (params) => params?.get?.("discount") || params?.discount || null;`,
  "@/lib/thematic-sentiment": `exports.analyzeThematicSentiment = () => ({});`,
  "@/lib/types": `exports.__esModule = true;`,
  "./CardPreview": `import React from "react"; export const CardPreview = () => React.createElement("div", null, "Preview");`,
  "./CoverStep": `import React from "react"; export const CoverStep = () => null;`,
  "./InsideNoteStep": `import React from "react"; export const InsideNoteStep = () => null;`,
  "./AddressStep": `import React from "react"; export const AddressStep = () => React.createElement("div", { "data-testid": "vending-address" });`,
  "./CheckoutStep": `import React from "react"; export const CheckoutStep = (props) => window.__renderParentPayment(props);`,
  "./FeedbackModal": `import React from "react"; export const FeedbackModal = () => null;`,
  "./AuthModal": `import React from "react"; export const AuthModal = () => null;`,
};
mockModules["lucide-react"] = `import React from "react"; ${[...iconNames].map((name) => `export const ${name} = (props) => React.createElement("span", props);`).join(" ")}`;

const mockLoader = `
  import React from "react";
  ${Object.entries(mockModules).map(([key, source]) => `// ${key}\n`).join("")}
`;
void mockLoader;

const browserEntry = `${parentMock}\nwindow.__renderParentPayment = (props) => { window.__latestPaymentProps = props; return React.createElement("section", { "data-testid": "parent-payment" }, React.createElement("div", { "data-testid": "order-id" }, props.orderId || "no-order"), React.createElement("div", { "data-testid": "client-secret" }, props.clientSecret || "no-secret"), React.createElement("div", { "data-testid": "applied-code" }, props.appliedDiscount?.code || "none"), React.createElement("div", { "data-testid": "free-state" }, String(Boolean(props.isFree))), React.createElement("div", { "data-testid": "checkout-error" }, props.checkoutError || ""), React.createElement("div", { "data-testid": "updating-state" }, String(Boolean(props.isUpdatingCheckout))), React.createElement("button", { type: "button", "data-testid": "apply-parent-code", onClick: async () => { window.__applyResult = await props.onApplyDiscount("HALF"); } }, "Apply HALF"), props.onRetryCheckout && React.createElement("button", { type: "button", "data-testid": "parent-retry", onClick: props.onRetryCheckout }, "Retry parent checkout")); };`;

await build({
  absWorkingDir: sourceRoot,
  stdin: { contents: browserEntry, resolveDir: sourceRoot, sourcefile: "payment-checkout-parent-entry.jsx", loader: "jsx" },
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(tempDir, "bundle.js"),
  jsx: "automatic",
  plugins: [{
    name: "isolated-parent-dependencies",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^(next\/.*|lucide-react|@\/.*|\.\/.*)$/ }, (args) => {
        if (args.path.startsWith("./") && !Object.hasOwn(mockModules, args.path)) return;
        return { path: args.path, namespace: "parent-mock" };
      });
      pluginBuild.onLoad({ filter: /.*/, namespace: "parent-mock" }, (args) => ({
        contents: mockModules[args.path] || "exports.__esModule = true;",
        loader: args.path === "next/image" || args.path === "next/link" || args.path.startsWith("@/components/flow") || args.path.startsWith("@/components/v3/") || args.path.startsWith("./") || args.path === "lucide-react" ? "jsx" : "js",
        resolveDir: sourceRoot,
      }));
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

async function reset({ kind = "entry", initialStep, draft, search = "" } = {}) {
  await page.goto("http://smn-parent.test/");
  await page.evaluate(({ kind, initialStep, draft, search }) => {
    window.__calls = [];
    window.__draft = draft;
    window.__searchParams = new URLSearchParams(search);
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      const body = options.body ? JSON.parse(options.body) : {};
      window.__calls.push({ url, body });
      if (url === "/api/discount/validate") {
        return window.__validateResponse ? window.__validateResponse(body) : new Response(JSON.stringify({ valid: true, code: body.code, type: "PERCENTAGE", value: body.code === "HALF" ? 50 : 100, discountAmountInCents: body.code === "HALF" ? 450 : 900, finalAmountInCents: body.code === "HALF" ? 450 : 0, isFree: body.code !== "HALF" }), { status: 200 });
      }
      if (url === "/api/checkout/create-intent") {
        return window.__intentResponse ? window.__intentResponse(body) : new Response(JSON.stringify({ orderId: "free-order", clientSecret: null, isFree: true, amountInCents: 0, finalAmountInCents: 0, isMock: false }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    };
    window.__startParent({ kind, initialStep, draft, search });
  }, { kind, initialStep, draft, search });
  await page.waitForTimeout(80);
}

try {
  // A valid promo followed by failed intent creation must not become the accepted UI state.
  await reset({ kind: "entry", initialStep: "pay" });
  await page.waitForFunction(() => window.__calls.some((call) => call.url === "/api/checkout/create-intent"));
  await page.evaluate(() => {
    window.__validateResponse = async (body) => new Response(JSON.stringify({ valid: true, code: body.code, type: "PERCENTAGE", value: 50, discountAmountInCents: 450, finalAmountInCents: 450, isFree: false }), { status: 200 });
    window.__intentResponse = async (body) => body.discountCode
      ? new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ orderId: "base-order", clientSecret: "seti-full", amountInCents: 900, isFree: false }), { status: 200 });
  });
  await page.getByTestId("apply-parent-code").click();
  await page.waitForFunction(() => window.__applyResult !== undefined);
  assert.equal(await page.getByTestId("applied-code").innerText(), "none", "failed repricing does not commit the promo code");
  assert.equal(await page.getByTestId("free-state").innerText(), "false", "failed repricing does not commit the new free/paid state");
  assert.match(await page.getByTestId("checkout-error").innerText(), /temporarily unavailable/, "failed repricing is visible and retryable");
  assert.equal(await page.getByTestId("updating-state").innerText(), "false", "failed repricing leaves the payment form unavailable, not stuck loading");
  assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.url === "/api/checkout/create-intent").length), 2);

  // A restored pay draft validates a saved free code before creating one free intent and then stops.
  await reset({
    kind: "entry",
    initialStep: "pay",
    draft: { selectedDesign: null, note: { text: "", style: "hwDavid", salutation: "", signOff: "" }, recipient: {}, sender: {}, discountCode: "FREE", currentStep: "pay", completed: false },
  });
  await page.waitForFunction(() => window.__latestPaymentProps?.isFree === true && window.__latestPaymentProps?.appliedDiscount?.code === "FREE");
  await page.waitForTimeout(300);
  const resumeCalls = await page.evaluate(() => window.__calls);
  const validateIndex = resumeCalls.findIndex((call) => call.url === "/api/discount/validate");
  const freeIntentCalls = resumeCalls.filter((call) => call.url === "/api/checkout/create-intent");
  assert.ok(validateIndex >= 0, "resumed code is server-validated");
  assert.equal(freeIntentCalls.length, 1, "free checkout intent is created only once");
  assert.equal(freeIntentCalls[0].body.discountCode, "FREE", "resumed code is included in the server request");
  assert.ok(validateIndex < resumeCalls.findIndex((call) => call.url === "/api/checkout/create-intent"), "validation precedes intent creation");

  // A URL offer on the address step updates the offer only; the sender must choose Continue to create checkout.
  await reset({ kind: "vending", initialStep: 3, search: "step=3&discount=HALF" });
  await page.getByRole("button", { name: /Proceed to Payment \(\$4\.50\)/ }).waitFor();
  const prePayCalls = await page.evaluate(() => window.__calls);
  assert.equal(prePayCalls.filter((call) => call.url === "/api/checkout/create-intent").length, 0, "pre-pay URL validation does not create an intent or navigate");
  assert.ok(prePayCalls.some((call) => call.url === "/api/discount/validate"), "pre-pay URL code is validated");
  console.log("PASS parent checkout: repricing failure, free-code resume once, pre-pay URL offer timing");
} finally {
  await browser.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
