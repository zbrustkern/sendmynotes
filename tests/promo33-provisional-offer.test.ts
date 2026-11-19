import assert from "node:assert/strict";
import { evaluatePromotion } from "../lib/promotions-v2";
import { promotionReasonMessage } from "../lib/checkout-promotion";

const policy = {
  id: "synthetic-provisional-policy",
  campaignId: "synthetic-provisional-campaign",
  workflow: "multisend" as const,
  scheduleVersion: "multi-send-900-v1",
  countryCodes: ["US"],
  match: "all" as const,
  minimumQuantity: 5,
  audience: "any" as const,
  chargeTypes: ["card_base" as const],
  benefit: { type: "fixed_order" as const, amountCents: 900 },
  payableFloor: "reject" as const,
  selectionStrategy: "eligible_line_order_v1" as const,
};
const basket = {
  workflow: "multisend" as const,
  scheduleVersion: "multi-send-900-v1",
  currency: "USD" as const,
  revision: "synthetic-pending-code-r1",
  lines: Array.from({ length: 4 }, (_, index) => ({
    id: `pending-${index + 1}`, productType: "card" as const, countryCode: "US",
    components: [{ id: `base-${index + 1}`, chargeType: "card_base", grossCents: 900, taxPolicyVersion: "synthetic-v1" }],
  })),
};
const decision = evaluatePromotion(policy, basket, Date.UTC(2026, 10, 19));
assert.equal(decision.eligible, false);
assert.equal(decision.reason, "minimum_quantity");
assert.equal(decision.discountCents, 0);
assert.equal(decision.netCents, 3600, "offer remains provisional while sender can add another eligible card");
assert.equal(promotionReasonMessage(decision.reason, { minimumQuantity: 5, workflow: "multisend" }),
  "Add one more eligible card to check this offer.");

const satisfied = evaluatePromotion(policy, {
  ...basket,
  revision: "synthetic-pending-code-r2",
  lines: [...basket.lines, { id: "pending-5", productType: "card" as const, countryCode: "US", components: [
    { id: "base-5", chargeType: "card_base", grossCents: 900, taxPolicyVersion: "synthetic-v1" },
  ] }],
}, Date.UTC(2026, 10, 19));
assert.equal(satisfied.eligible, true);
assert.equal(satisfied.netCents, 3600);
assert.equal(satisfied.discountCents, 900);
