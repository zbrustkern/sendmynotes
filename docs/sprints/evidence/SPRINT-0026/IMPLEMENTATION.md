# Sprint 0026 implementation and staging candidate

The founder approved the page mockups and explicitly requested Luna execution and a staging push on November 3, 2026. That approval supersedes the planning-only authorization paragraph in the original sprint proposal. Three native `gpt-6-luna` agents handled backend, UI/privacy, and release/CLI work; the parent integrated and reviewed them in an isolated clone of the production source. This user-requested native-agent execution superseded the skill's default CLI role selection. Production rollout and customer messaging were not requested.

## Delivered

- Main Admin → Orders now contains flow settings, HTML/plain-text synthetic preview, review queue, and per-order controls. Draft revision checks and immutable published versions preserve previously approved copy and timing. Pause/resume, per-step holds, explicit future rescheduling, reply/support holds, and future-only automatic enrollment are bounded to this two-step flow.
- Unchecked optional checkout consent is independent of receipt choice and guest checkout. Unknown historical permission remains held. Signed one-click POST and visible unsubscribe cancel pending optional messages without an account. Signed Resend callbacks record provider facts and durable suppression.
- The outbox freezes each provider payload and idempotency key. Lease recovery, a conservative retry window, acceptance reconciliation, and current payment/permission/repeat-purchase checks precede dispatch. Acceptance is never presented as inbox delivery.
- Check-in timing defaults to ten US business days after authenticated dated mailing evidence; the offer follows seven calendar days after check-in acceptance. Old inferred mailing dates do not start the clock. Overdue or resumed backlog requires an explicit reviewed future date.
- One private $1, one-use, 60-day grant integrates with the existing discount engine. Code redemption and optional consent-aware seven-day link observations associate later verified purchases while preserving Google acquisition. Classification is an observed email match or possible referral, not proof of identity or causal lift.
- The bounded operator CLI defaults to read-only/dry-run. Both runtime activation flags remain false, with staging review-only and test fulfillment preserved.

## Validation

Guarded tests use disk-isolated mock Firestore, fake provider transport and an external-network deny preload. Tested areas include consent capture, immutable versions, concurrent approval and offer issuance, holidays/DST, future-only auto mode, repeat purchase cancellation, resumed and uncertain messages, opt-out, signed provider events, payload-identical retries, attribution and customer-response privacy. Existing payment, offer-engine, financial truth, Google acquisition and transactional receipt suites are included in release validation.

Actual mounted admin settings, rendered email preview, queue and unsubscribe screens were checked in an isolated Chrome session against synthetic local data at desktop and 390px width. Build/typecheck and final staging rollout evidence are recorded in the local delivery run `20261103-post-purchase/checks`.

## Deliberately inactive / acceptance still needed

No customer email, real payment, fulfillment order, or production deployment is part of this release. The two reported receipt-only addresses are not eligible for this marketing flow. Live activation still needs environment-specific secrets, verified sending domain, monitored reply mailbox, business postal footer, authenticated dated supplier events, scheduler setup, controlled-inbox rendering/deliverability validation, and reviewed discount economics. The UI reports missing configuration; no operational fact is inferred from installed code.

This first release exposes operational queue counts and order-level attribution, offer and related-purchase facts. Mature-cohort revenue/margin dashboards, an arbitrary workflow engine, automatic privacy/account-reminder jobs, and membership remain outside this lean release. Reconciliation is evidence-only; uncertain sends are never manually marked accepted by a convenience button. Coupons use a random `NOTE` prefix (16 random hexadecimal characters), not the proposal's illustrative `THANKS-` prefix.

The release inventory found identical pre-release application trees on live staging and production despite different SHAs. Account/Studio and sitelink fixes were already live. Account reminder/cleanup scheduler activation, two-user private-storage validation, privacy-processing rehearsal and Apple Pay validation remain operational work; they are not unpublished feature branches.
