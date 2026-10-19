import assert from "node:assert/strict";
import { buildEvidenceDrilldownUrl, parseAdminGlobalScope, serializeAdminGlobalScope } from "../lib/admin-scope";
import { buildDestinationOfferLink, previewOfferPricing, validateDestinationPath } from "../lib/promotion-client";

const scope = parseAdminGlobalScope("workspace=economics&environment=staging&timezone=Europe%2FLondon&datePreset=custom&from=2026-10-01&to=2026-10-18");
const roundTrip = parseAdminGlobalScope(serializeAdminGlobalScope(scope));
assert.equal(roundTrip.environment, "staging");
assert.equal(roundTrip.timezone, "Europe/London");
assert.equal(roundTrip.customFrom, "2026-10-01");
assert.equal(roundTrip.customTo, "2026-10-18");
assert.equal(parseAdminGlobalScope("environment=invalid&timezone=Not%2FAZone").environment, "production");
assert.equal(parseAdminGlobalScope("environment=invalid&timezone=Not%2FAZone").timezone, "America/Chicago");
assert.match(buildEvidenceDrilldownUrl("orders", scope, { orderId: "order-123" }), /^\/admin\/orders\?/);
assert.match(buildEvidenceDrilldownUrl("journeys", scope), /^\/admin\/journeys\?/);
assert.equal(validateDestinationPath("https://example.com").isValid, false);
assert.equal(previewOfferPricing("PERCENTAGE", 100).finalAmountCents, 0);
assert.equal(buildDestinationOfferLink({ code: "WELCOME2", destinationPath: "/send" }).pricePreview.basePriceCents, 900);

console.log("Admin portal repair regressions passed.");
