import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCustomerPurchaseOrder } from "../lib/customer-purchase-classification";

assert.equal(isCustomerPurchaseOrder({ origin: "ADMIN_COMP", amountInCents: 500 } as any), false, "partial admin-origin balance is not tracked as a customer purchase");
assert.equal(isCustomerPurchaseOrder({ origin: "ADMIN_COMP", isComp: true, amountInCents: 0 } as any), false, "full admin comp is not tracked as a customer purchase");
assert.equal(isCustomerPurchaseOrder({ paymentMethod: "STUDIO_COMP", amountInCents: 0 } as any), false, "legacy studio comps remain excluded");
assert.equal(isCustomerPurchaseOrder({ isComp: true, amountInCents: 0 } as any), false, "legacy comp records remain excluded");
assert.equal(isCustomerPurchaseOrder({ origin: "CUSTOMER_CHECKOUT", amountInCents: 900 } as any), true, "customer orders remain eligible for purchase tracking");

const shell = readFileSync(new URL("../components/admin/ExecutiveShell.tsx", import.meta.url), "utf8");
assert(shell.includes("New comp card"), "admin entry action describes creating a card rather than dispatching immediately");
const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
assert(rootLayout.includes("<MarketingScripts />"), "marketing tags use the path-aware client wrapper");
const marketingScripts = readFileSync(new URL("../components/MarketingScripts.tsx", import.meta.url), "utf8");
assert(marketingScripts.includes('pathname?.startsWith("/comp-payment/")'), "private payment capabilities do not load advertising pixels");
const attributionTracker = readFileSync(new URL("../components/AttributionTracker.tsx", import.meta.url), "utf8");
assert(attributionTracker.includes('pathname?.startsWith("/comp-payment/")'), "private payment capabilities skip attribution capture and route tracking");
const privateMiddleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
assert(privateMiddleware.includes('response.headers.set("Referrer-Policy", "no-referrer")'), "payment capability URLs are not sent as referrers");
assert(privateMiddleware.includes('response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive")'), "payment capability pages are excluded from indexing and archive");
const paymentPage = readFileSync(new URL("../app/comp-payment/[capability]/page.tsx", import.meta.url), "utf8");
assert(paymentPage.includes("index: false, follow: false, noarchive: true"), "payment capability page sets noindex metadata");
for (const path of ["../app/admin/page.tsx", "../app/admin/orders/page.tsx", "../app/admin/economics/page.tsx", "../app/admin/journeys/page.tsx"]) {
  assert(readFileSync(new URL(path, import.meta.url), "utf8").includes("<StudioCompModal"), `${path} retains the shared modal entry point`);
}

console.log("PASS admin comp UI classification and entry-point checks");
