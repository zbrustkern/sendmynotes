import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getDiscounts } from "../app/api/admin/discounts/route";
import { GET as getPromotions } from "../app/api/admin/promotions/route";
import { ADMIN_COOKIE_NAME, generateAdminSessionToken } from "../lib/admin-auth";
import { firestoreDb, isFirestoreMock } from "../lib/firebase-admin";
import { offerBalanceRef, offerCutoverRef } from "../lib/offer-balances";
import { PROMOTION_CAMPAIGNS, PROMOTION_CODES, PROMOTION_POLICIES } from "../lib/promotions-v2-store";
import { PROMOTION_SCHEDULES } from "../lib/promotions-v2";

const actor = "promotion-reporting-fixture@example.invalid";

async function main() {
  assert(isFirestoreMock, "Only use the isolated Firestore mock for promotion reporting fixtures.");
  process.env.ADMIN_AUTHORIZED_EMAILS = actor;
  const cookie = `${ADMIN_COOKIE_NAME}=${generateAdminSessionToken(actor)}`;
  const now = Date.now();
  await offerCutoverRef().set({ state: "active", cutoverAt: now });
  await firestoreDb.collection("discount_codes").doc("LEGACY-MIRROR").set({
    id: "LEGACY-MIRROR", code: "LEGACY-MIRROR", type: "FIXED_AMOUNT", value: 200, isActive: true,
    maxUses: 4, usedCount: 1, totalDiscountGivenCents: 200, expiresAt: null, createdAt: now, updatedAt: now,
  });
  await firestoreDb.collection("offer_versions").doc("offer_LEGACY-MIRROR_v1").set({
    code: "LEGACY-MIRROR", offerId: "offer_LEGACY-MIRROR", version: 1, discountType: "FIXED_AMOUNT", discountValue: 200,
    purpose: "Synthetic mirrored offer", status: "active", usedCount: 1, reservedCount: 0,
    totalDiscountGivenCents: 200, createdAt: now, updatedAt: now, destinationPath: "/new",
  });
  await offerBalanceRef("code", "LEGACY-MIRROR").set({ spentUses: 3, spentCents: 600, heldUses: 1, heldCents: 200 });
  await firestoreDb.collection("offer_versions").doc("offer_VERSION-ONLY_v1").set({
    code: "VERSION-ONLY", offerId: "offer_VERSION-ONLY", version: 1, discountType: "FIXED_AMOUNT", discountValue: 100,
    purpose: "Synthetic version-only code", status: "active", usedCount: 2, reservedCount: 0, totalDiscountGivenCents: 200,
    createdAt: now, updatedAt: now, destinationPath: "/new",
  });
  for (let index = 0; index < 53; index++) {
    const id = `reporting-fixture-${index}`;
    const policyVersionId = `policy-${id}`;
    await firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(id).set({
      id, name: id, operatorManaged: index !== 0, status: "active", policyVersionId, revision: 1, createdAt: now, updatedAt: now + index,
    });
    await firestoreDb.collection(PROMOTION_POLICIES).doc(policyVersionId).set({
      id: policyVersionId, campaignId: id, workflow: "single", scheduleVersion: PROMOTION_SCHEDULES.single, countryCodes: ["US"],
    });
    const codes = index === 0 ? 2 : 1;
    for (let codeIndex = 0; codeIndex < codes; codeIndex++) {
      const codeId = `code-${id}-${codeIndex}`;
      await firestoreDb.collection(PROMOTION_CODES).doc(codeId).set({ id: codeId, campaignId: id, distribution: "private",
        ...(index === 0 && codeIndex === 0 ? { maxUses: 1 } : {}) });
      if (index === 0 && codeIndex === 0) await offerBalanceRef("code", codeId).set({ spentUses: 1, spentCents: 300 });
    }
    if (index === 0) await offerBalanceRef("campaign", id).set({ spentUses: 1, spentCents: 300, heldUses: 1, heldCents: 100 });
  }

  const req = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { cookie } });
  const discounts = await getDiscounts(req("/api/admin/discounts"));
  assert.equal(discounts.status, 200);
  const data = await discounts.json();
  assert.equal(data.environment, "test");
  assert.deepEqual(data.stats, {
    totalCodes: 56, activeCodes: 54, totalRedemptions: 6, totalSavingsCents: 1100, heldUses: 2, heldCents: 300,
  });
  assert.equal(data.codes.length, 2, "the legacy table stays separate from the full KPI scope");
  assert.equal(data.codes.find((code: { code: string }) => code.code === "LEGACY-MIRROR").lifecycleStatus, "exhausted");
  assert.equal(data.codes.find((code: { code: string }) => code.code === "LEGACY-MIRROR").usedCount, 3);
  assert.equal(data.codes.find((code: { code: string }) => code.code === "LEGACY-MIRROR").reservedCount, 1);

  const workspace = await getPromotions(req("/api/admin/promotions?status=exhausted"));
  assert.equal(workspace.status, 200);
  const { offers } = await workspace.json();
  assert.equal(offers.length, 1);
  assert.equal(offers[0].historicalRedemptionsCount, 3);
  assert.equal(offers[0].activeReservationsCount, 1);
  assert.equal(offers[0].totalDiscountGivenCents, 600);
  assert.equal(offers[0].canHardDelete, false);
  const selector = await getPromotions(req("/api/admin/promotions?view=campaigns"));
  assert.equal(selector.status, 200);
  assert.equal((await selector.json()).campaigns.length, 50, "editor list bounds do not limit KPI coverage");
  console.log("Admin promotion reporting uses exact legacy balances and complete V2 campaign scope.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
