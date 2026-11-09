import assert from "node:assert/strict";
import { submitPreparedHandwryttenOrder } from "../lib/handwrytten";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

const params: any = {
  orderId: "transport-test-r1", imageUrl: "/card.png", handwrittenMessage: "Exact frozen note", exactMessage: true, fontId: "4",
  recipient: { firstName: "Maya", lastName: "Friend", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
  returnAddress: { firstName: "Sam", lastName: "Sender", street1: "2 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
};

async function main() {
  await withSafeTestHarness(async () => {
    process.env.HANDWRYTTEN_API_KEY = "synthetic-never-used";
    delete process.env.HANDWRYTTEN_TEST_MODE;
    delete process.env.STAGING_REVIEW_ONLY;
    const response = (status: number, body?: unknown) => new Response(body === undefined ? "unreadable" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const call = (status: number, body?: unknown) => submitPreparedHandwryttenOrder(params, "shared-card", async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.message, "Exact frozen note");
      return response(status, body);
    });

    const auth = await call(401, undefined);
    assert.equal(auth.details?.providerSystemicFailure, true);
    assert.equal(auth.details?.providerOutcome, "not_sent", "exact auth denial is a known pre-order rejection");
    assert.notEqual(auth.details?.providerRejected, true);
    const forbidden = await call(403, { message: "access denied" });
    assert.equal(forbidden.details?.providerOutcome, "not_sent");

    const billing = await call(402, { status: "error", message: "insufficient funds" });
    assert.equal(billing.details?.providerSystemicFailure, true, "HTTP 402 is an account-level billing signal");
    assert.equal(billing.details?.providerOutcome, "unknown", "billing response does not prove no supplier order was created");

    const bodyOnlyBalance = await call(200, { status: "error", message: "account details unavailable" });
    assert.equal(bodyOnlyBalance.details?.providerOutcome, "unknown");
    assert.notEqual(bodyOnlyBalance.details?.providerSystemicFailure, true, "error text alone cannot classify billing/systemic failure");
    const explicitBilling = await call(400, { status: "error", message: "insufficient wholesale balance" });
    assert.equal(explicitBilling.details?.providerSystemicFailure, true, "specific wholesale balance errors pause dispatch");
    assert.equal(explicitBilling.details?.providerOutcome, "unknown", "body-classified billing does not assert no supplier order exists");
    const paymentMethodDeclined = await call(400, { status: "error", message: "payment method declined" });
    assert.equal(paymentMethodDeclined.details?.providerSystemicFailure, true, "an explicit supplier payment-method decline pauses dispatch");
    assert.equal(paymentMethodDeclined.details?.providerOutcome, "unknown");
    const billingAccountDisabled = await call(400, { status: "error", message: "billing account disabled" });
    assert.equal(billingAccountDisabled.details?.providerSystemicFailure, true);
    assert.equal(billingAccountDisabled.details?.providerOutcome, "unknown");
    const explicitAuth = await call(200, { status: "error", message: "invalid API key" });
    assert.equal(explicitAuth.details?.providerSystemicFailure, true, "specific API credential errors pause dispatch");
    assert.equal(explicitAuth.details?.providerOutcome, "unknown", "body-classified auth does not assert no supplier order exists");
    const contentMentionsCard = await call(400, { status: "error", message: "invalid card dimensions" });
    assert.equal(contentMentionsCard.details?.providerOutcome, "unknown");
    assert.notEqual(contentMentionsCard.details?.providerSystemicFailure, true, "the word card does not imply account billing failure");
    const serverError = await call(500, { status: "error", message: "credit balance check failed" });
    assert.equal(serverError.details?.providerOutcome, "unknown", "arbitrary 5xx and body text never prove non-submission");
    assert.equal(serverError.details?.providerSystemicFailure, true, "an explicit billing phrase still pauses dispatch on an ambiguous 5xx");
    const genericServerError = await call(500, { status: "error", message: "unexpected server error" });
    assert.equal(genericServerError.details?.providerOutcome, "unknown");
    assert.notEqual(genericServerError.details?.providerSystemicFailure, true, "generic 5xx does not trigger a guessed billing/auth hold");
    const malformedSuccess = await call(200, { status: "ok" });
    assert.equal(malformedSuccess.details?.providerOutcome, "unknown", "a response without supplier order ID remains ambiguous");
    const accepted = await call(200, { status: "ok", order_id: "hw_transport_accepted" });
    assert.equal(accepted.success, true);
    assert.equal(accepted.order_id, "hw_transport_accepted");

    delete process.env.HANDWRYTTEN_API_KEY;
    let networkCalls = 0;
    const missingKey = await submitPreparedHandwryttenOrder(params, "shared-card", async () => { networkCalls++; return response(200, {}); });
    assert.equal(missingKey.details?.providerSystemicFailure, true);
    assert.equal(missingKey.details?.providerOutcome, "not_sent", "missing credentials are known pre-request no-send");
    assert.equal(networkCalls, 0);
    console.log("Handwrytten batch transport: auth/billing/content/5xx/acceptance classifications passed with injected fetch only");
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
