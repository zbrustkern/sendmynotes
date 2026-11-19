import assert from "node:assert/strict";
import { buildSyntheticPromotionBasket, evaluatePromotion } from "../lib/promotions-v2";

const domesticBase = (count: number) => ({
  workflow: "multisend" as const,
  scheduleVersion: "multi-send-900-v1",
  currency: "USD" as const,
  revision: "fixture-r1",
  lines: Array.from({ length: count }, (_, index) => ({
    id: `line-${String(index + 1).padStart(2, "0")}`,
    productType: "card" as const,
    countryCode: "US",
    components: [{ id: `base-${index + 1}`, chargeType: "card_base", grossCents: 900, taxPolicyVersion: "fixture-tax-v1" }],
  })),
});

const cappedMultisend = {
  id: "policy-multisend",
  campaignId: "campaign-multisend",
  workflow: "multisend" as const,
  scheduleVersion: "multi-send-900-v1",
  countryCodes: ["US"],
  match: "all" as const,
  minimumQuantity: 5,
  audience: "any" as const,
  chargeTypes: ["card_base" as const],
  benefit: { type: "percentage" as const, basisPoints: 2000 },
  maxDiscountCentsPerOrder: 900,
  selectionStrategy: "eligible_line_order_v1" as const,
  payableFloor: "reject" as const,
};

const four = evaluatePromotion(cappedMultisend, domesticBase(4), Date.UTC(2026, 10, 19));
assert.equal(four.eligible, false);
assert.equal(four.grossCents, 3600);
assert.equal(four.netCents, 3600);
assert.equal(four.discountCents, 0);

const five = evaluatePromotion(cappedMultisend, domesticBase(5), Date.UTC(2026, 10, 19));
assert.equal(five.eligible, true);
assert.equal(five.grossCents, 4500);
assert.equal(five.discountCents, 900);
assert.equal(five.netCents, 3600);
assert.deepEqual(five.lines.map((line: any) => line.discountCents), [180, 180, 180, 180, 180]);
assert.deepEqual(five.appliedPromotions.length, 1);

const eight = evaluatePromotion(cappedMultisend, domesticBase(8), Date.UTC(2026, 10, 19));
assert.equal(eight.discountCents, 900);
assert.equal(eight.netCents, 6300);

const internationalSurchargePolicy = {
  id: "policy-international",
  campaignId: "campaign-international",
  workflow: "single" as const,
  scheduleVersion: "base900-international500-v1",
  countryCodes: ["CA"],
  match: "matching" as const,
  audience: "any" as const,
  chargeTypes: ["destination_surcharge" as const],
  benefit: { type: "fixed_order" as const, amountCents: 300 },
  selectionStrategy: "eligible_line_order_v1" as const,
  payableFloor: "reject" as const,
};
const canadian = {
  workflow: "single" as const,
  scheduleVersion: "base900-international500-v1",
  currency: "USD" as const,
  revision: "fixture-ca-r1",
  lines: [{ id: "ca-1", productType: "card" as const, countryCode: "CA", components: [
    { id: "ca-base", chargeType: "card_base", grossCents: 900, taxPolicyVersion: "fixture-tax-v1" },
    { id: "ca-mailing", chargeType: "destination_surcharge", grossCents: 500, taxPolicyVersion: "fixture-tax-v1" },
  ] }],
};
const caResult = evaluatePromotion(internationalSurchargePolicy, canadian, Date.UTC(2026, 10, 19));
assert.equal(caResult.eligible, true);
assert.equal(caResult.grossCents, 1400);
assert.equal(caResult.discountCents, 300);
assert.equal(caResult.netCents, 1100);

const usBasket = { ...canadian, revision: "fixture-us-r1", lines: [{ ...canadian.lines[0], countryCode: "US", components: [canadian.lines[0].components[0]] }] };
const usResult = evaluatePromotion(internationalSurchargePolicy, usBasket, Date.UTC(2026, 10, 19));
assert.equal(usResult.eligible, false);
assert.equal(usResult.discountCents, 0);
assert.equal(usResult.netCents, 900);

const oncePerSender = { ...internationalSurchargePolicy, perSenderLimit: 1, countryCodes: ["CA"] };
const identifiedCanadian = { ...canadian, ownerUid: "synthetic-sender" };
const postCutoverFirstUse = evaluatePromotion(oncePerSender, identifiedCanadian, Date.UTC(2026, 10, 19), {
  sender: { heldUses: 0, spentUses: 0, heldCents: 0, spentCents: 0, heldUnits: 0, spentUnits: 0, maxUses: 1 },
});
assert.equal(postCutoverFirstUse.eligible, true, "pre-cutover history is excluded from the new personal counter");
const postCutoverSecondUse = evaluatePromotion(oncePerSender, identifiedCanadian, Date.UTC(2026, 10, 19), {
  sender: { heldUses: 0, spentUses: 1, heldCents: 0, spentCents: 300, heldUnits: 0, spentUnits: 1, maxUses: 1 },
});
assert.equal(postCutoverSecondUse.reason, "sender_limit");

// Synthetic wedding cases remain previewable while authorized wedding checkout is staged.
const weddingPolicy = {
  id: "policy-wedding",
  campaignId: "campaign-wedding",
  workflow: "wedding" as const,
  scheduleVersion: "wedding-graduated-pilot-v1",
  countryCodes: ["US", "CA"],
  match: "matching" as const,
  audience: "project" as const,
  projectId: "synthetic-project",
  chargeTypes: ["card_base" as const],
  benefit: { type: "fixed_unit" as const, amountCents: 100 },
  maxUnitsPerProject: 25,
  payableFloor: "reject" as const,
  selectionStrategy: "eligible_line_order_v1" as const,
};
const noPayPermission = buildSyntheticPromotionBasket(weddingPolicy, { countryCode: "US", count: 50 });
noPayPermission.canPayProject = false;
assert.equal(evaluatePromotion(weddingPolicy, noPayPermission, Date.UTC(2026, 10, 19)).reason, "project_unavailable");

const fiftyDomestic = buildSyntheticPromotionBasket(weddingPolicy, { countryCode: "US", count: 50 });
const weddingFifty = evaluatePromotion(weddingPolicy, fiftyDomestic, Date.UTC(2026, 10, 19));
assert.equal(weddingFifty.grossCents, 37750);
assert.equal(weddingFifty.discountCents, 2500);
assert.equal(weddingFifty.netCents, 35250);

const firstBatch = evaluatePromotion(weddingPolicy,
  buildSyntheticPromotionBasket(weddingPolicy, { countryCode: "US", count: 20 }), Date.UTC(2026, 10, 19));
assert.equal(firstBatch.discountCents, 2000);
const secondBatch = evaluatePromotion(weddingPolicy,
  buildSyntheticPromotionBasket(weddingPolicy, { countryCode: "US", count: 30, previouslyPurchased: 20 }),
  Date.UTC(2026, 10, 19), { project: { heldUses: 0, spentUses: 1, heldCents: 0, spentCents: 2000, heldUnits: 0, spentUnits: 20 } });
assert.equal(firstBatch.netCents, 14500);
assert.equal(secondBatch.discountCents, 500);
assert.equal(secondBatch.netCents, 20750);

const mixedHundred = evaluatePromotion(weddingPolicy,
  buildSyntheticPromotionBasket(weddingPolicy, { countryCode: "US", count: 100,
    countryCodes: [...Array(97).fill("US"), "CA", "CA", "CA"] }), Date.UTC(2026, 10, 19));
assert.equal(mixedHundred.grossCents, 74200);
assert.equal(mixedHundred.discountCents, 2500);
assert.equal(mixedHundred.netCents, 71700);
