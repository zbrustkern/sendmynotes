import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const { chromium } = process.env.SMN_PLAYWRIGHT_MODULE ? require(process.env.SMN_PLAYWRIGHT_MODULE) : require("playwright");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "smn-international-address-"));
const lucide = ["Mail", "ArrowRight", "ArrowLeft", "ShieldCheck", "Plus", "Eye", "ChevronDown", "ChevronUp"];
const entrySource = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { Step3EnvelopeAddressing } from ${JSON.stringify(path.join(root, "components/v3/Step3EnvelopeAddressing.tsx"))};
  const options = { enabled: false, previewAvailable: true, destinations: [
    { countryCode: "CA", countryName: "Canada", postalCodeRequired: true, regionRequired: true, available: false },
    { countryCode: "JP", countryName: "Japan", postalCodeRequired: true, regionRequired: false, available: false },
  ] };
  let recipient = { fullName: "Taylor Doe", street1: "1 Oak St", city: "Austin", state: "TX", zip: "78701", country: "US" };
  let domestic = recipient;
  let international = null;
  let baseTotal = 900;
  let busy = false;
  const sender = { fullName: "Alex Sender", street1: "10 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" };
  const root = createRoot(document.getElementById("root"));
  function render() {
    const isInternational = recipient.country !== "US" && recipient.country !== "USA";
    root.render(React.createElement(Step3EnvelopeAddressing, {
      recipient, sender, fontClass: "", hideFixedActionBar: true, isBusy: busy,
      mailingOptions: options, isInternational, displayTotalCents: (isInternational ? baseTotal + 500 : baseTotal),
      onChangeRecipient: (field, value) => { recipient = { ...recipient, [field]: value }; render(); },
      onChangeSender: () => {}, onBack: () => {}, onContinue: () => {},
      onSaveInternational: (value) => { if (!isInternational) domestic = recipient; international = value; recipient = value; render(); },
      savedInternationalRecipient: international,
      onUseUSAddress: () => { if (isInternational) international = recipient; recipient = { ...domestic, country: "US" }; render(); },
    }));
  }
  window.__mountInternational = () => { baseTotal = 900; render(); };
  window.__mountFreeBaseDiscount = () => { recipient = { ...domestic, country: "US" }; baseTotal = 0; render(); };
  window.__setBusy = (value) => { busy = value; render(); };
`;

await build({
  absWorkingDir: root,
  stdin: { contents: entrySource, resolveDir: root, sourcefile: "international-entry.jsx", loader: "jsx" },
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: path.join(tempDir, "bundle.js"),
  jsx: "automatic",
  plugins: [{ name: "lucide-shim", setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^lucide-react$/ }, () => ({ path: "lucide-react", namespace: "mock" }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `const React = require("react"); ${lucide.map((name) => `exports.${name} = (props) => React.createElement("span", props);`).join("\n")}`, loader: "js", resolveDir: root }));
  } }],
});
await fs.writeFile(path.join(tempDir, "index.html"), '<!doctype html><html><body><div id="root"></div><script src="bundle.js"></script></body></html>');

const browser = await chromium.launch({ headless: true, ...(process.env.SMN_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SMN_CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => { throw error; });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ path: path.join(tempDir, "index.html"), contentType: "text/html" });
    if (url.pathname === "/bundle.js") return route.fulfill({ path: path.join(tempDir, "bundle.js"), contentType: "text/javascript" });
    return route.abort();
  });
  await page.goto("http://smn.test/");
  await page.evaluate(() => window.__mountInternational());

  await page.getByRole("button", { name: "International? +$5" }).click();
  let dialog = page.getByRole("dialog");
  await page.evaluate(() => window.__setBusy(true));
  assert.equal(await dialog.getByLabel("Country or region").isDisabled(), true, "country cannot change while checkout is creating an intent");
  assert.equal(await dialog.getByRole("button", { name: /Save address/ }).isDisabled(), true, "address cannot be committed while checkout is creating an intent");
  await page.evaluate(() => window.__setBusy(false));
  dialog = page.getByRole("dialog");
  const country = dialog.getByLabel("Country or region");
  await country.selectOption("CA");
  await dialog.getByLabel(/Recipient name/).fill("Taylor Doe");
  await dialog.getByLabel(/Street address/).fill("1 Queen St");
  await dialog.getByLabel(/City or locality/).fill("Toronto");
  await dialog.getByLabel(/State, province or region/).fill("ON");
  await dialog.getByLabel(/Postal code/).fill("M5V 2T6");
  assert.match(await dialog.getByRole("button", { name: /Save address/ }).innerText(), /\$14\.00 total/);
  await dialog.getByRole("button", { name: /Save address/ }).click();
  await page.getByText("Canada", { exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /\$14\.00/);
  assert.match(await page.locator("body").innerText(), /Preview only/);

  await page.getByRole("button", { name: "Use a US address instead" }).click();
  assert.match(await page.locator("body").innerText(), /Austin/);
  await page.getByRole("button", { name: "International? +$5" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByLabel("Country or region").inputValue(), "CA", "the saved international country is restored after switching to US");
  assert.equal(await dialog.getByLabel(/City or locality/).inputValue(), "Toronto", "the saved international recipient remains a separate draft");
  await dialog.getByLabel(/City or locality/).fill("Ottawa");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  assert.match(await page.locator("body").innerText(), /Austin/, "cancel preserves the committed US address");
  await page.getByRole("button", { name: "International? +$5" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByLabel(/City or locality/).inputValue(), "Toronto", "cancel preserves the saved international draft");
  await dialog.getByRole("button", { name: /Save address/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/City or locality/).fill("Ottawa");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByLabel(/City or locality/).inputValue(), "Toronto", "cancel leaves the committed international address unchanged");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Edit", "closing the editor restores focus to its trigger");
  await page.getByRole("button", { name: "Use a US address instead" }).click();
  assert.match(await page.locator("body").innerText(), /Austin/);
  await page.getByRole("button", { name: "International? +$5" }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByLabel("Country or region").inputValue(), "CA", "the saved international country is restored after switching to US");
  assert.equal(await dialog.getByLabel(/City or locality/).inputValue(), "Toronto", "the international recipient remains a separate draft after switching back");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.evaluate(() => window.__mountFreeBaseDiscount());
  await page.getByRole("button", { name: "International? +$5" }).click();
  dialog = page.getByRole("dialog");
  assert.match(await dialog.getByRole("button", { name: /Save address/ }).innerText(), /\$5\.00 total/, "a full base-only discount leaves the international surcharge due");
  console.log("PASS mounted international address editor behavior checks");
} finally {
  await browser.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
