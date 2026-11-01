# SPRINT-0021 independent review

Review date: October 27, 2026. Read-only source/configuration review; no production settings or code were changed by this reviewer.

## Findings

- Stripe source creates PaymentIntents with `card` and `link`. The staging DOM confirmed Bank and Klarna appear as Link funding sources. The installed Stripe SDK exposes no per-intent Link funding-source filter. Stripe Support documents that Klarna-in-Link can be disabled in Dashboard settings, but other Link funding sources cannot be disabled individually; removing Bank and Klarna together requires disabling Link. The user directed us to preserve the production user-facing Stripe setup, so the Card/Link policy is resolved as preserve. Staging visual parity for Link funding sources (including Bank and Klarna) remains unverified.
- The serving staging service references `sendmynotes-staging/stripe-secret-key` version `1`; the diagnostic classified it as a test key and recorded only hashes and allowlisted account/domain facts. The exact staging hosted.app hostname is registered in Stripe test mode and reports Apple Pay, Google Pay, and Link active. Production configuration was not mutated. No eligible physical iPhone was available, so Apple Pay rendering or payment was not tested end to end.
- Checkout source originally selected an embedded test publishable-key fallback when runtime key variables were absent. The implementation now requires a configured key matching the resolved payment mode and adds an explicit staging publishable-key setting. The test-only probe retrieved the same synthetic PaymentIntent using the returned publishable key and client secret, verifying that key pair; it recorded only the key class and hash. No charge or mail was attempted.
- Email changes now persist an explicit `provided`/`omitted` choice, clear a prior PaymentIntent `receipt_email` with Stripe's documented empty-string update semantics before normal confirmation, and suppress application email when the choice is omitted or unsynchronized. New-policy confirmation paths require a synced choice. A paid order arriving during synchronization is held for recovery; an atomic guard also rechecks the choice while taking the fulfillment dispatch lock. Webhook and recovery email sends share a Firestore delivery claim.

## Verification status

- The browser fixture result file records clear-state persistence across remount/refresh/late auth, typed replacement preservation, all card/wallet/free/deferred policy cases, save-failure blocking, and captured-payment submit blocking. It records `realPaymentAttempted: false`.
- The recorded TypeScript check exits successfully, and the contact policy test passes. I independently reran `node --import tsx tests/checkout-contact-route.integration.test.ts`; it exited 0 and printed `checkout contact route integration tests passed`. This supersedes the stale 10:39 log entry that failed on the paid-recovery preview case.
- The fresh focused-suite evidence now records exit 0 for all listed tests, including `checkout-contact-route.integration.test.ts` and `payment-mode-safety.test.ts`. The earlier payment-mode failure came from reused mock Firestore state; the isolated rerun now confirms test-order labels and test-mode fulfillment behavior. Staging review safeguards intentionally blocked the transactional email send in the synthetic webhook case. TypeScript and build result files also record exit 0.
- No real payment, fulfillment, or mail test was performed by this review.

## Disposition

The requested production Card/Link policy is preserved. Staging visual parity for Link funding sources remains unverified, since Bank and Klarna are supplied by Link and no per-intent filter is available. The test publishable-key/intent pair is verified, and the contact recovery route and fresh focused suite pass. Apple Pay end-to-end remains unverified without an eligible physical device.
