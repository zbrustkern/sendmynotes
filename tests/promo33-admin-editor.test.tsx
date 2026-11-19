import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BespokeOfferEditor } from "../components/admin/BespokeOfferEditor";

const html = renderToStaticMarkup(<BespokeOfferEditor />);

for (const label of [
  "Multisend · 5+ cards · 20% base, $9 cap",
  "Single Canada · $3 mailing surcharge",
  "Wedding · first 25 project cards · $1 base",
  "Prior project allowance used (cards)",
  "Prior project allowance used (cents)",
  "Verified sender",
  "Wrong project",
  "Clone to independent draft",
  "Clear for new draft",
  "Issue or retry batch",
]) assert.ok(html.includes(label), `Missing editor control: ${label}`);

assert.ok(html.includes("Environment: Current server environment"));
assert.ok(!html.includes("environment=production"));
assert.ok(html.includes('disabled=""'), "Publish and preview are disabled before a draft is reviewed");
console.log("Sprint 33 admin editor renders templates, scenario controls, and gated actions.");
