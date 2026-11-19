import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getPromotions, POST as postPromotions } from "../app/api/admin/promotions/route";
import { POST as postDiscounts } from "../app/api/admin/discounts/route";
import { POST as exchange } from "../app/api/discount/exchange/route";
import { ADMIN_COOKIE_NAME, generateAdminSessionToken } from "../lib/admin-auth";
import { firestoreDb, isFirestoreMock } from "../lib/firebase-admin";
import { offerCutoverRef } from "../lib/offer-balances";
import { ensureFollowupOffer, GRANTS, isFollowupOfferAvailable } from "../lib/post-purchase/offers";
import { buildSyntheticPromotionBasket, evaluatePromotion, isSupportedPromotionPayable } from "../lib/promotions-v2";
import {
  PROMOTION_CAMPAIGNS, PROMOTION_CODES, PROMOTION_POLICIES, PROMOTION_USAGE,
  promotionUsageRef, readPromotionForCode, readPromotionFromRequestReference, readPromotionUsage,
} from "../lib/promotions-v2-store";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

const ACTOR = "synthetic-promotion-admin@example.invalid";
const PRIVATE_CODE = "SYNTHETIC-PRIVATE-33";
const baseUrl = "http://localhost:3000";

async function request(body: Record<string, unknown>, handler = postPromotions, authenticated = true) {
  const res = await handler(new NextRequest(`${baseUrl}/api/admin/promotions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { cookie: `${ADMIN_COOKIE_NAME}=${generateAdminSessionToken(ACTOR)}` } : {}),
    },
    body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() };
}

const v2Policy = {
  workflow: "multisend", scheduleVersion: "multi-send-900-v1", countryCodes: ["US"], match: "all",
  minimumQuantity: 5, audience: "any", chargeTypes: ["card_base"],
  benefit: { type: "percentage", basisPoints: 2000 }, maxDiscountCentsPerOrder: 900, payableFloor: "reject",
};

async function main() {
  await withSafeTestHarness(async () => {
    assert(isFirestoreMock, "promotion fixtures require the local Firestore mock");
    process.env.ADMIN_AUTHORIZED_EMAILS = ACTOR;
    process.env.PROMOTION_PRIVATE_KEY = "synthetic-key-separate-from-runtime-secrets-0033";

    assert.equal((await request({ action: "draft-save" }, postPromotions, false)).status, 401);
    assert.equal((await request({ action: "draft-save", environment: "production" }, postDiscounts)).status, 409);
    const save = await request({
      action: "draft-save", name: "Synthetic multisend", distribution: "private", code: PRIVATE_CODE,
      policy: v2Policy, budgetCents: 5000,
    }, postDiscounts);
    assert.equal(save.status, 200, JSON.stringify(save.data));
    assert.equal(save.data.draft.hasPrivateCode, true);
    assert(!JSON.stringify(save.data).includes(PRIVATE_CODE));
    const campaignId = save.data.campaign.id;
    const original = await request({ action: "draft-preview", campaignId, revision: 1 });
    assert.equal(original.status, 200, JSON.stringify(original.data));
    assert.equal(original.data.previews.nearMiss.reason, "minimum_quantity");
    assert.equal(original.data.previews.qualifying.netCents, 3600);
    assert.equal(original.data.previews.largest.netCents, 21600);
    assert.equal(original.data.maximumOrderSubsidyCents, 900);
    assert.equal(original.data.maximumCampaignSubsidyCents, 5000);
    assert.equal(original.data.publicationAvailable, false);
    for (const collection of ["offer_quotes", "offer_reservations", "offer_redemptions", PROMOTION_POLICIES, PROMOTION_CODES, PROMOTION_USAGE, "orders"]) {
      assert.equal((await firestoreDb.collection(collection).get()).size, 0, `preview left no ${collection} records`);
    }
    const publish = (revision: number, previewToken: string) => request({ action: "draft-publish", campaignId, revision, previewToken, reason: "Reviewed synthetic pricing" });
    assert.equal((await publish(1, original.data.previewToken)).status, 409, "publication waits for migration");
    assert.equal((await request({
      action: "draft-save", campaignId, revision: 1, name: "Edited synthetic multisend", distribution: "private",
      policy: v2Policy, budgetCents: 5000,
    })).status, 200);
    assert.equal((await publish(1, original.data.previewToken)).status, 409, "an edit invalidates the old preview");
    await offerCutoverRef().set({ state: "active", cutoverAt: Date.now() });
    process.env.PROMOTION_MULTISEND_RESERVATIONS_DISABLED = "true";
    const pausedWorkflow = await request({ action: "draft-preview", campaignId, revision: 2 });
    assert.match(pausedWorkflow.data.publicationBlockReason, /workflow/);
    assert.equal((await publish(2, pausedWorkflow.data.previewToken)).status, 409);
    delete process.env.PROMOTION_MULTISEND_RESERVATIONS_DISABLED;
    const review = await request({ action: "draft-preview", campaignId, revision: 2 });
    assert.equal(review.data.publicationAvailable, true);
    const published = await publish(2, review.data.previewToken);
    assert.equal(published.status, 200, JSON.stringify(published.data));
    assert.equal(published.data.issued.code, PRIVATE_CODE);
    assert.equal(new URL(published.data.issued.url).search, "");
    assert.equal(new URL(published.data.issued.url).hash, `#offer=${PRIVATE_CODE}`);
    assert.deepEqual((await publish(2, review.data.previewToken)).data, published.data, "publication retry reuses the same code");
    const history = await getPromotions(new NextRequest(`${baseUrl}/api/admin/promotions?view=history&campaignId=${campaignId}`, {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${generateAdminSessionToken(ACTOR)}` },
    }));
    assert.equal(history.status, 200);
    const audit = (await history.json()).history;
    assert(audit.every((item: any) => item.actorEmail === ACTOR && item.environment === "test"));
    assert.equal(audit.filter((item: any) => item.action === "publish_policy").length, 1);
    assert(!JSON.stringify(audit).includes(PRIVATE_CODE));

    const issue = (count: number) => request({ action: "campaign-issue", campaignId, requestId: "synthetic-batch-001", count, reason: "Synthetic recipients" });
    const issued = await issue(2);
    assert.equal(issued.status, 200, JSON.stringify(issued.data));
    assert.equal(issued.data.issued.length, 2);
    assert.deepEqual((await issue(2)).data, issued.data);
    assert.equal((await issue(1)).status, 409);

    const exchanged = await exchange(new NextRequest(`${baseUrl}/api/discount/exchange`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: PRIVATE_CODE }),
    }));
    assert.equal(exchanged.status, 200);
    const ref = (await exchanged.json()).reference;
    assert(!ref.includes(PRIVATE_CODE));
    const cookie = exchanged.headers.get("set-cookie")!.split(";")[0];
    const buyer = new NextRequest(baseUrl, { headers: { cookie } });
    const foreign = new NextRequest(baseUrl);
    assert.equal((await readPromotionFromRequestReference(buyer, ref))?.campaign.id, campaignId);
    assert.equal(await readPromotionFromRequestReference(foreign, ref), null);

    const domestic = { ...v2Policy, workflow: "single", scheduleVersion: "base900-international500-v1", minimumQuantity: 1, maxDiscountCentsPerOrder: undefined };
    for (const cents of [0, 1, 49, 50]) {
      assert.equal(isSupportedPromotionPayable(cents, false), cents === 50);
      assert.equal(isSupportedPromotionPayable(cents, true), cents === 50 || cents === 0);
      const result = await request({ action: "draft-save", name: `Domestic payable ${cents}`, distribution: "public", budgetCents: 1000,
        code: `SMN33-TEST-${cents}`, policy: { ...domestic, allowFreeDomesticSingle: cents === 0, benefit: { type: "fixed_order", amountCents: 900 - cents } },
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const testId = result.data.campaign.id;
      const preview = await request({ action: "draft-preview", campaignId: testId, revision: 1 });
      assert.equal(preview.data.publicationAvailable, cents === 50 || cents === 0);
      const attempt = await request({ action: "draft-publish", campaignId: testId, revision: 1, reason: "Synthetic floor check", previewToken: preview.data.previewToken });
      assert.equal(attempt.status, cents === 50 || cents === 0 ? 200 : 400, JSON.stringify(attempt.data));
    }

    const wedding = await request({
      action: "draft-save", name: "Synthetic wedding", distribution: "private", budgetCents: 5000,
      policy: { ...v2Policy, workflow: "wedding", scheduleVersion: "wedding-graduated-pilot-v1", countryCodes: ["US", "CA"],
        match: "matching", audience: "project", projectId: "synthetic-project", minimumQuantity: 1,
        maxDiscountCentsPerOrder: undefined, maxUnitsPerProject: 25, benefit: { type: "fixed_unit", amountCents: 100 } },
    });
    assert.equal(wedding.status, 200, JSON.stringify(wedding.data));
    const weddingId = wedding.data.campaign.id;
    const weddingPreview = await request({ action: "draft-preview", campaignId: weddingId, revision: 1, scenario: { countryCode: "US", count: 50 } });
    assert.equal(weddingPreview.data.previews.custom.netCents, 35250);
    assert.equal(weddingPreview.data.weddingCheckoutAvailable, false);
    const publishWedding = () => request({ action: "draft-publish", campaignId: weddingId, revision: 1, previewToken: weddingPreview.data.previewToken, reason: "Synthetic availability check" });
    assert.equal((await publishWedding()).status, 409);
    Object.assign(process.env, {
      WEDDING_CHECKOUT_ENABLED: "true", PROMOTION_WEDDING_CHECKOUT_READY: "true",
      STAGING_REVIEW_ONLY: "true", STRIPE_SECRET_KEY: "sk_test_promotion_fixture",
    });
    const publishedWedding = await publishWedding();
    assert.equal(publishedWedding.status, 200, JSON.stringify(publishedWedding.data));
    assert.equal(new URL(publishedWedding.data.issued.url).pathname, "/thank-you/wedding");
    assert.match(new URL(publishedWedding.data.issued.url).hash, /^#offer=/);
    const weddingIssue = await request({ action: "campaign-issue", campaignId: weddingId, requestId: "synthetic-wedding-issue", reason: "Synthetic wedding issue" });
    assert.equal(weddingIssue.status, 200, JSON.stringify(weddingIssue.data));
    assert.equal(new URL(weddingIssue.data.issued[0].url).pathname, "/thank-you/wedding");

    const at = Date.now();
    const retained = await ensureFollowupOffer({ enrollmentId: "synthetic-33-enrollment", sourceOrderId: "synthetic-source", messageId: "synthetic-message", at, amountCents: 100, validDays: 30 });
    assert.equal((await firestoreDb.collection("offer_versions").doc(`${retained.offerId}_v1`).get()).exists, false);
    assert(!(JSON.stringify((await firestoreDb.collection(GRANTS).doc(retained.id).get()).data()).includes(retained.code)));
    assert.equal((await firestoreDb.collection(PROMOTION_CAMPAIGNS).doc(retained.offerId).get()).exists, true);
    const retainedOffer = (await readPromotionForCode(retained.code))!;
    const batch = buildSyntheticPromotionBasket({ ...retainedOffer.policy, workflow: "multisend", scheduleVersion: "multi-send-900-v1" }, { countryCode: "US", count: 3 });
    const { usage } = await readPromotionUsage(retainedOffer, batch);
    assert.deepEqual(evaluatePromotion(retainedOffer.policy, batch, at, usage).lines.map(({ netCents }) => netCents), [867, 867, 866]);
    assert.equal(await isFollowupOfferAvailable(retained.enrollmentId, at), true);
    await promotionUsageRef("code", retained.codeId!).set({ heldUses: 1, heldCents: 100 });
    assert.equal(await isFollowupOfferAvailable(retained.enrollmentId, at), false);
  });
  console.log("Promotion publisher, private references, payable domain, and V2 grant checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
