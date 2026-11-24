import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { firestoreDb, getOrdersCollection } from "../lib/firebase-admin";
import {
  loadFollowupInbox,
  mintSingleUseFollowupCode,
  sendQuickFollowup,
  skipFollowupOrder,
  unskipFollowupOrder,
} from "../lib/post-purchase/followup-inbox";
import { isSensitiveOccasionOrder } from "../lib/post-purchase/sympathy";
import { getPostPurchaseEligibility } from "../lib/post-purchase/enrollment";
import {
  getEmailPreference,
  recordPostPurchaseConsent,
  suppressPostPurchaseEmail,
} from "../lib/post-purchase/preferences";
import { MANUAL_MESSAGES } from "../lib/post-purchase/manual";
import { GET, POST } from "../app/api/admin/followup-inbox/route";
import { ADMIN_COOKIE_NAME, generateAdminSessionToken } from "../lib/admin-auth";
import type { Order } from "../lib/types";

async function main() {
  await withSafeTestHarness(async () => {
    process.env.POST_PURCHASE_SENDER_HMAC_KEY = "test-followup-inbox-hmac-secret-32-chars-minimum";
    process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET = "test-followup-inbox-unsub-secret-32-chars-minimum";
    process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS = "PO Box 42, Lake Forest, IL 60045";
    process.env.POST_PURCHASE_SENDER_EMAIL = "zeke@sendmynotes.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://sendmynotes.com";
    process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "true";
    process.env.POST_PURCHASE_DELIVERY_ACTIVE = "false";
    process.env.POST_PURCHASE_AUTO_ENROLL_ACTIVE = "false";
    delete process.env.STAGING_REVIEW_ONLY;

    const actor = "admin:zbrustkern@gmail.com";
    const baseTime = 1_760_000_000_000;

    async function seedOrder(id: string, extra: Partial<Order> = {}): Promise<Order> {
      const order: Order = {
        id,
        customerEmail: `${id}@example.invalid`,
        createdAt: baseTime,
        updatedAt: baseTime,
        status: "MAILED",
        amountInCents: 900,
        occasion: "Thank You",
        frontImageUrl: "/presets/thank-you-floral.jpg",
        returnAddress: {
          firstName: "Taylor",
          lastName: "Morgan",
          street1: "123 Main St",
          city: "Chicago",
          state: "IL",
          zip: "60601",
          country: "US",
        },
        recipientAddress: {
          firstName: "Jordan",
          lastName: "Lee",
          street1: "456 Oak Ave",
          city: "Austin",
          state: "TX",
          zip: "78701",
          country: "US",
        },
        printedMessage: "PRIVATE CARD MESSAGE DO NOT LEAK",
        ...extra,
      } as Order;
      await getOrdersCollection().doc(id).set(order);
      return order;
    }

    // =========================================================================
    // 1. Sympathy detector & automated enrollment exclusion
    // =========================================================================
    assert.equal(isSensitiveOccasionOrder({ occasion: "Sympathy & Support" }), true);
    assert.equal(isSensitiveOccasionOrder({ recipientOccasion: { occasionType: "sympathy" } as any }), true);
    assert.equal(isSensitiveOccasionOrder({ recipientOccasion: { occasionTitle: "Deepest Condolences" } as any }), true);
    assert.equal(isSensitiveOccasionOrder({ frontImageUrl: "/presets/sympathy-olive.jpg" }), true);
    assert.equal(isSensitiveOccasionOrder({ frontImageUrl: "/presets/pet-sympathy-rainbow.jpg" }), true);
    assert.equal(isSensitiveOccasionOrder({ occasion: "Thinking of your loss" }), true);
    assert.equal(
      isSensitiveOccasionOrder({ occasion: "Easter", frontImageUrl: "/presets/easter-blossom.jpg" }),
      false,
      "easter-blossom must not false-positive on 'loss'"
    );
    assert.equal(
      isSensitiveOccasionOrder({ occasion: "Birthday", printedMessage: "So sorry for your loss and sympathy" } as any),
      false,
      "detector never inspects private printedMessage"
    );

    const eligibleBaseOrder: Order = {
      id: "elig-base",
      customerEmail: "eligible@example.invalid",
      createdAt: baseTime,
      status: "MAILED",
      amountInCents: 900,
      occasion: "Easter",
      frontImageUrl: "/presets/easter-blossom.jpg",
      postPurchaseMailedAt: baseTime + 60_000,
      postPurchaseMailingEvidence: { source: "handwrytten_sync", verifiedAt: baseTime + 60_000 } as any,
      purchaseMeasurement: {
        eligible: true,
        refundStatus: "none",
        verifiedAt: baseTime,
      } as any,
    } as Order;

    assert.deepEqual(getPostPurchaseEligibility(eligibleBaseOrder, "granted"), {
      eligible: true,
      reason: "ready",
    });
    assert.deepEqual(
      getPostPurchaseEligibility({ ...eligibleBaseOrder, occasion: "Sympathy & Support" }, "granted"),
      { eligible: false, reason: "sensitive_occasion" }
    );
    assert.deepEqual(
      getPostPurchaseEligibility(
        { ...eligibleBaseOrder, occasion: "", recipientOccasion: { occasionType: "bereavement" } as any },
        "granted"
      ),
      { eligible: false, reason: "sensitive_occasion" }
    );
    assert.deepEqual(
      getPostPurchaseEligibility(
        { ...eligibleBaseOrder, occasion: "Personal note", frontImageUrl: "/presets/sympathy-olive.jpg" },
        "granted"
      ),
      { eligible: false, reason: "sensitive_occasion" }
    );
    assert.deepEqual(
      getPostPurchaseEligibility(
        { ...eligibleBaseOrder, occasion: "Personal note", frontImageUrl: "/presets/pet-sympathy-rainbow.jpg" },
        "granted"
      ),
      { eligible: false, reason: "sensitive_occasion" }
    );

    // =========================================================================
    // 2. Seed orders & test loadFollowupInbox filtering, dedup, sympathy
    // =========================================================================
    const paid1 = await seedOrder("paid-1", {
      customerEmail: "BuyerOne@Example.Invalid",
      createdAt: baseTime + 10_000,
      status: "MAILED",
      occasion: "Birthday",
    });
    const paid2 = await seedOrder("paid-2", {
      customerEmail: "buyerone@example.invalid",
      createdAt: baseTime + 20_000,
      status: "PAYMENT_RECEIVED",
      occasion: "Thank You",
    });
    const paidSympathyOccasion = await seedOrder("paid-symp-occasion", {
      customerEmail: "symp-occ@example.invalid",
      createdAt: baseTime + 21_000,
      occasion: "Sympathy & Support",
    });
    const paidSympathyRecipient = await seedOrder("paid-symp-recipient", {
      customerEmail: "symp-rec@example.invalid",
      createdAt: baseTime + 22_000,
      occasion: "",
      recipientOccasion: { occasionType: "sympathy", occasionTitle: "In Loving Memory" } as any,
    });
    const paidSympathyOlive = await seedOrder("paid-symp-olive", {
      customerEmail: "symp-olive@example.invalid",
      createdAt: baseTime + 23_000,
      occasion: "Personal note",
      frontImageUrl: "/presets/sympathy-olive.jpg",
    });
    const paidSympathyPet = await seedOrder("paid-symp-pet", {
      customerEmail: "symp-pet@example.invalid",
      createdAt: baseTime + 24_000,
      occasion: "Personal note",
      frontImageUrl: "/presets/pet-sympathy-rainbow.jpg",
    });
    await seedOrder("paid-no-email", {
      customerEmail: "",
      createdAt: baseTime + 25_000,
      status: "MAILED",
    });
    const founderTestOrder = await seedOrder("founder-test-paid", {
      customerEmail: "founder@example.invalid",
      createdAt: baseTime + 26_000,
      isFounderTest: true,
      status: "MAILED",
    });
    await seedOrder("stripe-test-paid", {
      customerEmail: "stripetest@example.invalid",
      createdAt: baseTime + 27_000,
      paymentMode: "stripe_test",
      status: "MAILED",
    });
    await seedOrder("comp-paid", {
      customerEmail: "comp@example.invalid",
      createdAt: baseTime + 28_000,
      isComp: true,
      origin: "ADMIN_COMP",
      amountInCents: 0,
      status: "MAILED",
    });
    await seedOrder("refunded-paid", {
      customerEmail: "refunded@example.invalid",
      createdAt: baseTime + 29_000,
      status: "MAILED",
      purchaseMeasurement: { eligible: false, refundStatus: "fully_refunded", verifiedAt: baseTime } as any,
    });

    // Incomplete checkouts:
    // - 3 attempts for same email (mixed case, PENDING_PAYMENT & FAILED) -> 1 row
    const incAttempt1 = await seedOrder("inc-dup-1", {
      customerEmail: "  Almost@Example.Invalid ",
      createdAt: baseTime + 30_000,
      status: "PENDING_PAYMENT",
      occasion: "Anniversary",
      returnAddress: { firstName: "Sam", lastName: "Rivera" } as any,
    });
    await seedOrder("inc-dup-2", {
      customerEmail: "almost@example.invalid",
      createdAt: baseTime + 35_000,
      status: "FAILED",
      occasion: "",
      returnAddress: {} as any,
    });
    const incAttempt3 = await seedOrder("inc-dup-3", {
      customerEmail: "ALMOST@example.invalid",
      createdAt: baseTime + 40_000,
      status: "PENDING_PAYMENT",
      occasion: "",
      returnAddress: {} as any,
    });

    // - Incomplete checkout for an email that ALSO has a paid order -> MUST BE EXCLUDED
    await seedOrder("inc-who-later-paid", {
      customerEmail: "buyerone@example.invalid",
      createdAt: baseTime + 5_000,
      status: "PENDING_PAYMENT",
    });
    // - Incomplete checkout for an email that has a comp/founder paid order -> MUST BE EXCLUDED even when includeTests=false
    await seedOrder("inc-founder-attempt", {
      customerEmail: "founder@example.invalid",
      createdAt: baseTime + 5_500,
      status: "PENDING_PAYMENT",
    });
    // - Sympathy incomplete checkout via preset URL -> auto_skipped_sympathy
    await seedOrder("inc-sympathy", {
      customerEmail: "inc-symp@example.invalid",
      createdAt: baseTime + 45_000,
      status: "PENDING_PAYMENT",
      occasion: "",
      frontImageUrl: "/presets/sympathy-olive.jpg",
    });

    const defaultInbox = await loadFollowupInbox({ includeTests: false });

    // 2 normal paid orders + 4 sympathy paid orders = 6 paid orders (1 per paid order, even same buyer email)
    assert.equal(defaultInbox.paidOrders.length, 6);
    assert.equal(defaultInbox.counts.paidTotal, 6);
    assert.equal(defaultInbox.counts.paidNeedsFollowup, 2);
    assert.equal(defaultInbox.counts.paidSympathySkipped, 4);
    assert.equal(defaultInbox.counts.paidWithoutEmail, 1);

    const paidIds = new Set(defaultInbox.paidOrders.map((o) => o.orderId));
    assert.ok(paidIds.has(paid1.id));
    assert.ok(paidIds.has(paid2.id));
    assert.ok(!paidIds.has(founderTestOrder.id), "founder test excluded by default");
    assert.ok(!paidIds.has("stripe-test-paid"), "stripe_test excluded by default");
    assert.ok(!paidIds.has("comp-paid"), "comp excluded by default");
    assert.ok(!paidIds.has("refunded-paid"), "refunded excluded by default");

    for (const sympId of [
      paidSympathyOccasion.id,
      paidSympathyRecipient.id,
      paidSympathyOlive.id,
      paidSympathyPet.id,
    ]) {
      const row = defaultInbox.paidOrders.find((o) => o.orderId === sympId);
      assert.ok(row, `expected sympathy order ${sympId}`);
      assert.equal(row.isSensitiveOccasion, true);
      assert.equal(row.followupStatus, "auto_skipped_sympathy");
    }

    // Incomplete checkouts: only almost@example.invalid + inc-symp@example.invalid
    assert.equal(defaultInbox.incompleteCheckouts.length, 2);
    assert.equal(defaultInbox.counts.incompleteTotal, 2);
    assert.equal(defaultInbox.counts.incompleteNeedsFollowup, 1);

    const dupRow = defaultInbox.incompleteCheckouts.find((c) => c.email === "almost@example.invalid");
    assert.ok(dupRow, "deduplicated incomplete row present");
    assert.equal(dupRow.attemptCount, 3);
    assert.equal(dupRow.latestOrderId, incAttempt3.id);
    assert.deepEqual(dupRow.orderIds, [incAttempt3.id, "inc-dup-2", incAttempt1.id]);
    assert.equal(dupRow.firstAttemptAt, baseTime + 30_000);
    assert.equal(dupRow.latestAttemptAt, baseTime + 40_000);
    assert.equal(dupRow.senderFirstName, "Sam", "falls back to earlier attempt with sender name");
    assert.equal(dupRow.occasion, "Anniversary", "falls back to earlier attempt with occasion");
    assert.equal(dupRow.followupStatus, "needs_followup");

    assert.ok(
      !defaultInbox.incompleteCheckouts.some((c) => c.email === "buyerone@example.invalid"),
      "email with paid order excluded from incomplete checkouts"
    );
    assert.ok(
      !defaultInbox.incompleteCheckouts.some((c) => c.email === "founder@example.invalid"),
      "email with founder paid order excluded from incomplete checkouts"
    );
    assert.ok(
      !defaultInbox.incompleteCheckouts.some((c) => c.email === "refunded@example.invalid"),
      "refunded order never leaks into incomplete checkouts"
    );

    const incSympRow = defaultInbox.incompleteCheckouts.find((c) => c.email === "inc-symp@example.invalid");
    assert.ok(incSympRow);
    assert.equal(incSympRow.isSensitiveOccasion, true);
    assert.equal(incSympRow.followupStatus, "auto_skipped_sympathy");

    // includeTests=true includes founder/test/comp paid orders, still excludes fully_refunded
    const withTestsInbox = await loadFollowupInbox({ includeTests: true });
    const withTestsPaidIds = new Set(withTestsInbox.paidOrders.map((o) => o.orderId));
    assert.ok(withTestsPaidIds.has("founder-test-paid"));
    assert.ok(withTestsPaidIds.has("stripe-test-paid"));
    assert.ok(withTestsPaidIds.has("comp-paid"));
    assert.ok(!withTestsPaidIds.has("refunded-paid"), "fully refunded orders stay excluded even with includeTests=true");

    // =========================================================================
    // 3. skipFollowupOrder & unskipFollowupOrder
    // =========================================================================
    await skipFollowupOrder(paid1.id, actor, "Already spoke on phone");
    let afterSkip = await loadFollowupInbox();
    const skippedPaid1 = afterSkip.paidOrders.find((o) => o.orderId === paid1.id);
    assert.equal(skippedPaid1?.followupStatus, "skipped");
    assert.equal(skippedPaid1?.skipReason, "Already spoke on phone");
    assert.equal(afterSkip.counts.paidNeedsFollowup, 1);

    await unskipFollowupOrder(paid1.id, actor);
    afterSkip = await loadFollowupInbox();
    assert.equal(afterSkip.paidOrders.find((o) => o.orderId === paid1.id)?.followupStatus, "needs_followup");
    assert.equal(afterSkip.counts.paidNeedsFollowup, 2);

    // Multi-attempt incomplete checkout: skip an OLDER attempt, then unskip via latestOrderId
    await skipFollowupOrder(incAttempt1.id, actor, "Wait a day");
    let incAfterSkip = await loadFollowupInbox();
    assert.equal(
      incAfterSkip.incompleteCheckouts.find((c) => c.email === "almost@example.invalid")?.followupStatus,
      "skipped"
    );
    await unskipFollowupOrder(incAttempt3.id, actor);
    incAfterSkip = await loadFollowupInbox();
    assert.equal(
      incAfterSkip.incompleteCheckouts.find((c) => c.email === "almost@example.invalid")?.followupStatus,
      "needs_followup",
      "unskipping latestOrderId clears skip on prior incomplete attempts for the same email"
    );

    // =========================================================================
    // 4. mintSingleUseFollowupCode
    // =========================================================================
    await assert.rejects(
      mintSingleUseFollowupCode({ type: "INVALID" as any, value: 200 }),
      /FIXED_AMOUNT or PERCENTAGE/
    );
    await assert.rejects(
      mintSingleUseFollowupCode({ type: "FIXED_AMOUNT", value: 49 }),
      /\$0\.50 and \$9\.00/
    );
    await assert.rejects(
      mintSingleUseFollowupCode({ type: "FIXED_AMOUNT", value: 901 }),
      /\$0\.50 and \$9\.00/
    );
    await assert.rejects(
      mintSingleUseFollowupCode({ type: "PERCENTAGE", value: 4 }),
      /5% and 100%/
    );
    await assert.rejects(
      mintSingleUseFollowupCode({ type: "PERCENTAGE", value: 101 }),
      /5% and 100%/
    );

    const fixedCode = await mintSingleUseFollowupCode({
      type: "FIXED_AMOUNT",
      value: 200,
      validDays: 45,
      orderId: paid1.id,
    });
    assert.match(fixedCode.code, /^THANKS[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    assert.equal(fixedCode.type, "FIXED_AMOUNT");
    assert.equal(fixedCode.value, 200);
    assert.equal(fixedCode.maxUses, 1);
    assert.equal(fixedCode.usedCount, 0);

    const fixedDiscountDoc = (await firestoreDb.collection("discount_codes").doc(fixedCode.code).get()).data();
    const fixedOfferDoc = (await firestoreDb.collection("offer_versions").doc(`offer_${fixedCode.code}_v1`).get()).data();
    assert.ok(fixedDiscountDoc, "discount_codes doc created");
    assert.equal(fixedDiscountDoc.isActive, true);
    assert.equal(fixedDiscountDoc.maxUses, 1);
    assert.equal(fixedDiscountDoc.value, 200);
    assert.equal(fixedDiscountDoc.type, "FIXED_AMOUNT");
    assert.ok(fixedOfferDoc, "offer_versions doc created");
    assert.equal(fixedOfferDoc.status, "active");
    assert.equal(fixedOfferDoc.maxUses, 1);
    assert.equal(fixedOfferDoc.code, fixedCode.code);
    assert.equal(fixedOfferDoc.discountValue, 200);

    const pctCode = await mintSingleUseFollowupCode({
      type: "PERCENTAGE",
      value: 20,
      validDays: 3, // clamps up to 7
    });
    assert.equal(pctCode.type, "PERCENTAGE");
    assert.equal(pctCode.value, 20);
    assert.equal(pctCode.maxUses, 1);
    const pctDays = Math.round(((pctCode.expiresAt || 0) - Date.now()) / 86_400_000);
    assert.ok(pctDays >= 6 && pctDays <= 8, `expected validDays clamped to 7, got ~${pctDays}`);

    const inboxWithCodes = await loadFollowupInbox();
    assert.ok(inboxWithCodes.activeDiscounts.some((d) => d.code === fixedCode.code));
    assert.ok(inboxWithCodes.activeDiscounts.some((d) => d.code === pctCode.code));

    // =========================================================================
    // 5. sendQuickFollowup: early-customer sending, suppression, gates, concurrency, headers/footer, non-mutation
    // =========================================================================
    const sentPayloads: Array<{ payload: Record<string, any>; idempotencyKey: string }> = [];
    const transport = {
      async send(payload: Record<string, unknown>, idempotencyKey: string) {
        sentPayloads.push({ payload: payload as Record<string, any>, idempotencyKey });
        return { id: `resend-msg-${sentPayloads.length}` };
      },
    };

    // 5a. Respects MANUAL_FOLLOWUP_DELIVERY_ACTIVE=false and STAGING_REVIEW_ONLY=true
    process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "false";
    await assert.rejects(
      sendQuickFollowup({ orderId: paid1.id, subject: "Quick check-in", body: "How did your card go?" }, actor, { transport }),
      /paused/i
    );
    process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE = "true";
    process.env.STAGING_REVIEW_ONLY = "true";
    await assert.rejects(
      sendQuickFollowup({ orderId: paid1.id, subject: "Quick check-in", body: "How did your card go?" }, actor, { transport }),
      /Staging/i
    );
    delete process.env.STAGING_REVIEW_ONLY;
    assert.equal(sentPayloads.length, 0);

    // 5b. Allows sending to early paid customer without recorded marketing opt-in (even with "denied" checkout consent)
    //     and concurrent double-click race sends only ONCE + refuses resend + refuses skip after accepted.
    await recordPostPurchaseConsent({
      email: paid1.customerEmail,
      orderId: paid1.id,
      optedIn: false,
      disclosureVersion: "checkout-v1",
    });
    assert.equal((await getEmailPreference(paid1.customerEmail))?.state, "denied");

    const raceResults = await Promise.allSettled([
      sendQuickFollowup(
        {
          orderId: paid1.id,
          subject: "Thanks for trying SendMyNotes",
          body: "Hi Taylor,\n\nHere is a thank-you code for your next card.",
          discountCode: fixedCode.code,
        },
        actor,
        { transport }
      ),
      sendQuickFollowup(
        {
          orderId: paid1.id,
          subject: "Thanks for trying SendMyNotes",
          body: "Hi Taylor,\n\nHere is a thank-you code for your next card.",
          discountCode: fixedCode.code,
        },
        actor,
        { transport }
      ),
    ]);
    assert.equal(raceResults.filter((r) => r.status === "fulfilled").length, 1, "exactly one concurrent send wins");
    assert.equal(raceResults.filter((r) => r.status === "rejected").length, 1, "concurrent duplicate is rejected");
    assert.equal(sentPayloads.length, 1, "transport invoked only once");

    // Refuses resend after accepted
    await assert.rejects(
      sendQuickFollowup(
        { orderId: paid1.id, subject: "Second try", body: "Should not send" },
        actor,
        { transport }
      ),
      /already sent/i
    );
    assert.equal(sentPayloads.length, 1);

    // Refuses skip and unskip after accepted
    await assert.rejects(skipFollowupOrder(paid1.id, actor), /already sent/i);
    await assert.rejects(unskipFollowupOrder(paid1.id, actor), /Only skipped/i);

    // Verify email payload headers, unsubscribe link, postal address, tags, idempotencyKey
    const firstSent = sentPayloads[0];
    assert.ok(firstSent.idempotencyKey.startsWith("manual_"));
    assert.equal(firstSent.payload.to, "buyerone@example.invalid");
    assert.match(firstSent.payload.headers["List-Unsubscribe"], /^<https:\/\/sendmynotes\.com\/api\/post-purchase\/unsubscribe\?token=.+>$/);
    assert.equal(firstSent.payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(String(firstSent.payload.text).includes("Stop optional follow-ups: https://sendmynotes.com/email/unsubscribe?token="));
    assert.ok(String(firstSent.payload.html).includes('<a href="https://sendmynotes.com/email/unsubscribe?token='));
    assert.ok(String(firstSent.payload.text).includes("SendMyNotes · PO Box 42, Lake Forest, IL 60045"));
    assert.ok(String(firstSent.payload.html).includes("SendMyNotes · PO Box 42, Lake Forest, IL 60045"));
    assert.deepEqual(firstSent.payload.tags, [
      { name: "program", value: "manual_followup" },
      { name: "message_id", value: firstSent.idempotencyKey },
    ]);

    // Never mutates order status/classification or manufactures opt-in consent
    const paid1After = (await getOrdersCollection().doc(paid1.id).get()).data() as Order;
    assert.equal(paid1After.status, "MAILED");
    assert.equal(paid1After.isTest, undefined);
    assert.equal((await getEmailPreference(paid1.customerEmail))?.state, "denied", "never manufactures opt-in");
    assert.equal((await firestoreDb.collection("post_purchase_enrollments").get()).size, 0);

    // 5c. Incomplete checkout without marketing opt-in AND without POST_PURCHASE_BUSINESS_POSTAL_ADDRESS
    delete process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS;
    assert.equal(await getEmailPreference("almost@example.invalid"), null);

    const incSendResult = await sendQuickFollowup(
      {
        orderId: incAttempt3.id,
        subject: "Did anything trip you up?",
        body: "Hi Sam,\n\nJust checking if anything got in the way.",
      },
      actor,
      { transport }
    );
    assert.equal(incSendResult.state, "accepted");
    assert.equal(sentPayloads.length, 2);

    const secondSent = sentPayloads[1];
    assert.equal(secondSent.payload.to, "almost@example.invalid");
    assert.ok(String(secondSent.payload.text).includes("Stop optional follow-ups: https://sendmynotes.com/email/unsubscribe?token="));
    assert.ok(!String(secondSent.payload.text).includes("undefined"), "no undefined postal address");
    assert.ok(!String(secondSent.payload.text).includes("SendMyNotes ·"), "omits postal line when unconfigured");
    assert.equal((await getOrdersCollection().doc(incAttempt3.id).get()).data()?.status, "PENDING_PAYMENT");
    assert.equal(await getEmailPreference("almost@example.invalid"), null, "never manufactures opt-in on incomplete send");

    const inboxAfterSends = await loadFollowupInbox();
    const sentPaidRow = inboxAfterSends.paidOrders.find((o) => o.orderId === paid1.id);
    assert.equal(sentPaidRow?.followupStatus, "sent");
    assert.equal(sentPaidRow?.discountCodeUsed, fixedCode.code);
    const sentIncRow = inboxAfterSends.incompleteCheckouts.find((c) => c.email === "almost@example.invalid");
    assert.equal(sentIncRow?.followupStatus, "sent");

    // 5d. Hard-blocks unsubscribed, bounced, and complained emails
    for (const suppressionState of ["unsubscribed", "bounced", "complained"] as const) {
      const suppressedOrder = await seedOrder(`suppressed-${suppressionState}`, {
        customerEmail: `blocked-${suppressionState}@example.invalid`,
        createdAt: baseTime + 50_000,
      });
      await suppressPostPurchaseEmail(suppressedOrder.customerEmail, suppressionState);
      await assert.rejects(
        sendQuickFollowup(
          { orderId: suppressedOrder.id, subject: "Check in", body: "Should be blocked" },
          actor,
          { transport }
        ),
        new RegExp(`suppressed \\(${suppressionState}\\)`)
      );
      const inboxCheck = await loadFollowupInbox();
      const row = inboxCheck.paidOrders.find((o) => o.orderId === suppressedOrder.id);
      assert.equal(row?.followupStatus, "suppressed");
      assert.equal(row?.optInState, suppressionState);
    }
    assert.equal(sentPayloads.length, 2, "no suppressed email was ever dispatched");

    // 5e. Uncertain state on transport error prevents silent double-send
    const uncertainOrder = await seedOrder("paid-uncertain", {
      customerEmail: "uncertain@example.invalid",
      createdAt: baseTime + 55_000,
    });
    const failingTransport = {
      async send() {
        throw new Error("network timeout");
      },
    };
    await assert.rejects(
      sendQuickFollowup(
        { orderId: uncertainOrder.id, subject: "Quick check-in", body: "Hi there" },
        actor,
        { transport: failingTransport }
      ),
      /did not confirm delivery/i
    );
    await assert.rejects(
      sendQuickFollowup(
        { orderId: uncertainOrder.id, subject: "Quick check-in", body: "Hi there" },
        actor,
        { transport }
      ),
      /already sent or is in progress/i
    );
    await assert.rejects(skipFollowupOrder(uncertainOrder.id, actor), /already sent/i);
    const uncertainRow = (await loadFollowupInbox()).paidOrders.find((o) => o.orderId === uncertainOrder.id);
    assert.equal(uncertainRow?.followupStatus, "uncertain");

    // =========================================================================
    // 6. Auth & Origin checks on GET / POST /api/admin/followup-inbox
    // =========================================================================
    assert.equal(
      (await GET(new NextRequest("https://sendmynotes.com/api/admin/followup-inbox"))).status,
      401
    );
    assert.equal(
      (
        await POST(
          new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
            method: "POST",
            body: JSON.stringify({ action: "skip", orderId: paid2.id }),
          })
        )
      ).status,
      401
    );

    const adminCookie = `${ADMIN_COOKIE_NAME}=${generateAdminSessionToken("zbrustkern@gmail.com")}`;

    // Untrusted origins rejected with 403
    assert.equal(
      (
        await POST(
          new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
            method: "POST",
            headers: { cookie: adminCookie, origin: "https://evil.invalid" },
            body: JSON.stringify({ action: "skip", orderId: paid2.id }),
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await POST(
          new NextRequest("http://0.0.0.0:8080/api/admin/followup-inbox", {
            method: "POST",
            headers: {
              cookie: adminCookie,
              origin: "http://0.0.0.0:8080",
              "x-forwarded-host": "sendmynotes.com",
              "x-forwarded-proto": "https",
            },
            body: JSON.stringify({ action: "skip", orderId: paid2.id }),
          })
        )
      ).status,
      403,
      "internal proxy origin must not be trusted when NEXT_PUBLIC_APP_URL is configured"
    );

    process.env.NEXT_PUBLIC_APP_URL = "not-a-valid-url";
    assert.equal(
      (
        await POST(
          new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
            method: "POST",
            headers: { cookie: adminCookie, origin: "https://sendmynotes.com" },
            body: JSON.stringify({ action: "skip", orderId: paid2.id }),
          })
        )
      ).status,
      403,
      "invalid configured origin fails closed"
    );
    process.env.NEXT_PUBLIC_APP_URL = "https://sendmynotes.com";

    // Trusted origin behind App Hosting proxy succeeds
    const skipRes = await POST(
      new NextRequest("http://0.0.0.0:8080/api/admin/followup-inbox", {
        method: "POST",
        headers: {
          cookie: adminCookie,
          origin: "https://sendmynotes.com",
          "x-forwarded-host": "sendmynotes.com",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ action: "skip", orderId: paid2.id, reason: "Route skip test" }),
      })
    );
    assert.equal(skipRes.status, 200);
    assert.equal(skipRes.headers.get("cache-control"), "no-store");

    const unskipRes = await POST(
      new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
        method: "POST",
        headers: { cookie: adminCookie, origin: "https://sendmynotes.com" },
        body: JSON.stringify({ action: "unskip", orderId: paid2.id }),
      })
    );
    assert.equal(unskipRes.status, 200);

    // Invalid mint_code type and unknown action return 400
    const badMintRes = await POST(
      new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
        method: "POST",
        headers: { cookie: adminCookie, origin: "https://sendmynotes.com" },
        body: JSON.stringify({ action: "mint_code", type: "FREE_FOREVER", value: 100 }),
      })
    );
    assert.equal(badMintRes.status, 400);

    const unknownActionRes = await POST(
      new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
        method: "POST",
        headers: { cookie: adminCookie, origin: "https://sendmynotes.com" },
        body: JSON.stringify({ action: "delete_everything" }),
      })
    );
    assert.equal(unknownActionRes.status, 400);

    // Valid mint_code through POST route
    const mintRes = await POST(
      new NextRequest("https://sendmynotes.com/api/admin/followup-inbox", {
        method: "POST",
        headers: { cookie: adminCookie, origin: "https://sendmynotes.com" },
        body: JSON.stringify({ action: "mint_code", type: "FIXED_AMOUNT", value: 100, validDays: 30, orderId: paid2.id }),
      })
    );
    assert.equal(mintRes.status, 200);
    const mintJson = await mintRes.json();
    assert.equal(mintJson.data.value, 100);
    assert.equal(mintJson.data.maxUses, 1);

    // Authenticated GET returns expected inbox data and respects includeTests
    const getRes = await GET(
      new NextRequest("https://sendmynotes.com/api/admin/followup-inbox?includeTests=true", {
        headers: { cookie: adminCookie },
      })
    );
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("cache-control"), "no-store");
    const getJson = await getRes.json();
    assert.ok(getJson.data.paidOrders.some((o: any) => o.orderId === "founder-test-paid"));
    assert.ok(!JSON.stringify(getJson).includes("PRIVATE CARD MESSAGE DO NOT LEAK"));

    // Send-time eligibility recheck: incomplete checkout must be rejected if the buyer later completed a paid order
    await seedOrder("inc-race-attempt", {
      customerEmail: "latebuyer@example.invalid",
      createdAt: baseTime + 50_000,
      status: "PENDING_PAYMENT",
    });
    await seedOrder("inc-race-paid-later", {
      customerEmail: "latebuyer@example.invalid",
      createdAt: baseTime + 55_000,
      status: "QUEUED_FOR_FULFILLMENT",
      amountInCents: 900,
    });
    let raceSent = 0;
    await assert.rejects(
      () =>
        sendQuickFollowup(
          {
            orderId: "inc-race-attempt",
            subject: "Need a hand finishing your card?",
            body: "Hi there — saw you started a card.",
          },
          actor,
          {
            transport: {
              async send() {
                raceSent += 1;
                return { id: "re_should_not_send" };
              },
            },
          }
        ),
      /already completed a paid order/i
    );
    assert.equal(raceSent, 0, "abandonment email must never send after a later paid order");

    // Sanity check: manual messages collection only contains expected order records, no automated enrollment
    assert.equal((await firestoreDb.collection("post_purchase_enrollments").get()).size, 0);
    assert.ok((await firestoreDb.collection(MANUAL_MESSAGES).get()).size >= 2);
  });

  console.log("Follow-up inbox, sympathy exclusion, deduplication, discount minting, send safety, and route auth/origin tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
