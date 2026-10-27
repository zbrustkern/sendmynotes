import assert from "node:assert/strict";
import { resolvePaymentMode } from "../lib/payment-mode";
import { fulfillHandwryttenOrder } from "../lib/handwrytten";
import { resend } from "../lib/email/resend";
import { getMetaAccessToken } from "../lib/meta-conversions-api";
import { configuredAdminEnvironment } from "../lib/admin-environment";
async function main() {
  process.env.STAGING_REVIEW_ONLY = "true";
  process.env.K_SERVICE = "sendmynotes-staging";
  assert.equal(configuredAdminEnvironment(), "staging");
  process.env.META_CONVERSIONS_API_ACCESS_TOKEN = "fixture_must_not_be_used";
  assert.equal(getMetaAccessToken(), undefined, "Review mode blocks server advertising events");
  for (const key of ["sk_live_fake", "rk_live_fake"]) assert.throws(() => resolvePaymentMode({ NODE_ENV: "production", STAGING_REVIEW_ONLY: "true", STRIPE_SECRET_KEY: key }), /disabled in staging/);
  assert.equal(resolvePaymentMode({ NODE_ENV: "production", K_SERVICE: "sendmynotes-staging", STAGING_REVIEW_ONLY: "true", STRIPE_SECRET_KEY: "sk_test_fake" }), "stripe_test");
  // Invalid input proves the review gate runs before any image/provider work.
  const fulfillment = await fulfillHandwryttenOrder({} as any);
  assert.equal(fulfillment.success, false);
  assert.match(fulfillment.error!, /disabled in staging/);
  const mail = await resend.emails.send({ from: "a@example.com", to: "b@example.com", subject: "fixture", text: "fixture" });
  assert.equal(mail.data, null);
  assert.equal(mail.error?.name, "staging_review_only");
  console.log("Staging safety: live Stripe, supplier submission and email blocked; staging identity and Stripe-test mode verified.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
