import assert from "node:assert/strict";
import { offerAllowanceFits, offerBalance, promotionCounterDeltas } from "../lib/offer-balances";

const campaign = {
  ref: { id: "synthetic-campaign" } as any,
  kind: "campaign" as const,
  data: offerBalance({ heldCents: 300, spentCents: 200, heldUses: 1, spentUses: 1 }),
  maxCents: 505,
  maxUses: 3,
};
const proposed = { id: campaign.ref.id, kind: "campaign" as const, uses: 1, cents: 5, units: 1 };
assert.equal(offerAllowanceFits(campaign, proposed), true, "last five cents and last use fit exactly");
assert.equal(offerAllowanceFits(campaign, { ...proposed, cents: 6 }), false, "one cent over budget is rejected");
assert.equal(offerAllowanceFits(campaign, { ...proposed, uses: 2 }), false, "use limit is enforced independently");

const sharedCampaign = { ...campaign, data: offerBalance(), maxCents: 500, maxUses: undefined };
assert.equal(offerAllowanceFits(sharedCampaign, proposed), true, "first code can reserve the shared campaign's final five dollars");
const exhaustedCampaign = { ...sharedCampaign, data: offerBalance({ heldCents: 500 }) };
const secondCode = { ...proposed, id: "synthetic-second-code" };
assert.equal(offerAllowanceFits(exhaustedCampaign, secondCode), false, "a second code cannot exceed the shared campaign budget");

assert.deepEqual(promotionCounterDeltas([
  { ref: { id: "campaign" } as any, kind: "campaign" as const },
  { ref: { id: "code" } as any, kind: "code" as const },
], 5, 1), [
  { id: "campaign", kind: "campaign", uses: 1, cents: 5, units: 1 },
  { id: "code", kind: "code", uses: 1, cents: 5, units: 1 },
]);

assert.throws(() => offerBalance({ heldCents: -1 }), /Invalid stored promotion balance/);
