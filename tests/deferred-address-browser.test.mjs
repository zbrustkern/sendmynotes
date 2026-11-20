import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SMN_PLAYWRIGHT_MODULE || "playwright");
const orderId = "synthetic-deferred-order";
const origin = "https://sendmynotes.com";
const path = `/orders/${orderId}/complete-address`;
const checkoutToken = "synthetic-address-capability";
const readToken = "synthetic-read-capability";
const mocks = {
  "next/navigation": `export const useParams = () => ({ id: "${orderId}" });`,
  "next/link": "export default 'a';",
  "next/image": "export default 'img';",
  "@/components/v3/Step3EnvelopeAddressing": "export const US_STATES = [{ code: 'IL', name: 'Illinois' }];",
};

const bundle = await build({
  stdin: {
    contents: `import React from "react"; import { createRoot } from "react-dom/client";
      import Page from "./app/orders/[id]/complete-address/page";
      createRoot(document.body.appendChild(document.createElement("div")))
        .render(React.createElement(React.StrictMode, null, React.createElement(Page)));`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "deferred-address-fixture", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
  } }],
});

const browser = await chromium.launch({
  headless: true, ...(process.env.SMN_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SMN_CHROMIUM_EXECUTABLE } : {}),
});

async function scenario({ suffix, blockedStorage = false, editable, refresh = false, submit = false }) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    if (blockedStorage) await context.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    });
    const readRequests = [];
    const writes = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === path) return route.fulfill({ contentType: "text/html", body: '<script defer src="/address-fixture.js"></script>' });
      if (url.pathname === "/address-fixture.js") return route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text });
      if (url.pathname === `/api/orders/${orderId}`) {
        const token = request.headers()["x-view-token"];
        readRequests.push({ url: request.url(), token });
        return route.fulfill({ json: {
          accessKind: token === checkoutToken ? "checkout" : "read",
          order: { id: orderId, isRedacted: false,
            recipientAddress: { firstName: "Pat", lastName: "Synthetic", street1: "••••••••", zip: "•••••" } },
        } });
      }
      if (url.pathname === `/api/orders/${orderId}/complete-address` && request.method() === "POST") {
        writes.push({ url: request.url(), token: request.headers()["x-view-token"], body: request.postDataJSON() });
        return route.fulfill({ json: { success: true, readToken } });
      }
      return route.abort();
    });

    const page = await context.newPage();
    await page.goto(origin + path + suffix);
    if (!editable) {
      await page.getByRole("heading", { name: "Unable to Open Order" }).waitFor();
      assert.equal(await page.getByLabel("Street address").count(), 0);
      assert.equal(writes.length, 0);
      return;
    }
    await page.getByLabel("Street address").waitFor();
    assert.equal(page.url(), origin + path, "credential is scrubbed from the visible location");
    if (refresh) {
      await page.reload();
      await page.getByLabel("Street address").waitFor();
      assert.equal(page.url(), origin + path);
    }
    assert.ok(readRequests.every(request => request.token === checkoutToken && request.url === origin + `/api/orders/${orderId}`));
    if (submit) {
      await page.getByLabel("Street address").fill("42 Test Street");
      await page.getByLabel("City").fill("Chicago");
      await page.getByLabel("State", { exact: true }).selectOption("IL");
      await page.getByLabel("ZIP Code").fill("60601");
      await page.getByRole("button", { name: /Dispatch My Card/ }).click();
      const trackingLink = page.getByRole("link", { name: "Track Order Status" });
      await trackingLink.waitFor();
      assert.equal(await trackingLink.getAttribute("href"), `/order/${orderId}#read=${readToken}`);
      assert.deepEqual(writes, [{
        url: origin + `/api/orders/${orderId}/complete-address`, token: checkoutToken,
        body: { street1: "42 Test Street", street2: "", city: "Chicago", state: "IL", zip: "60601" },
      }]);
    }
    await page.evaluate(() => { window.location.hash = "#address=another-token"; });
    await page.getByRole("heading", { name: "Unable to Open Order" }).waitFor();
    await page.goBack();
    await page.getByLabel("Street address").waitFor();
    await page.goto(origin + path + "?revisit=1");
    await page.getByRole("heading", { name: "Unable to Open Order" }).waitFor();
  } finally {
    await context.close();
  }
}

try {
  await scenario({ suffix: "#address=" + checkoutToken, blockedStorage: true, editable: true, refresh: true, submit: true });
  await scenario({ suffix: "?token=" + checkoutToken, editable: true, refresh: true });
  await scenario({ suffix: "#address=" + readToken, editable: false });
  await scenario({ suffix: "", editable: false });
  console.log("Deferred address link, blocked-storage refresh, StrictMode, legacy link and read-only boundary passed.");
} finally {
  await browser.close();
}
