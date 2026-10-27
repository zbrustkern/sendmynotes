# SPRINT-0021 execution and staging release

Status: implementation reviewed; local validation passed; staging deployment pending. Authorized October 27, 2026: Luna agents and staging deployment. Production deployment is not authorized by this sprint.

## Baseline and execution

- Clean isolated clone: `/private/tmp/sendmynotes-checkout-0021`, branch `codex/checkout-polish-0021`.
- Baseline staging: `c8cc214100dc5f0184df9d1f0131a3c108e94e9e`, build `build-2026-10-27-003`, READY, rollout SUCCEEDED, 100% traffic.
- Baseline production: `5d008dd82f078002926de7e03a87a34e89ae1741`, build `build-2026-10-26-002`, READY, rollout SUCCEEDED, 100% traffic.
- Original dirty checkout preserved. Native Luna workers implemented visual and contact changes; a separate Luna worker audited payment configuration and reviewed the contact implementation. Main orchestration/review inherited the current model. Explicit user Luna selection overrides the sprint skill's default coding model. Luna CLI authentication preflight passed. No semantic index or chapter configured; existing JSON ledger convention retained.

## Stripe findings and scoped repair

The serving staging revision resolves `STRIPE_SECRET_KEY` to the staging project's `stripe-secret-key` version 1, verified as a test credential. A synthetic unpaid checkout returned a test PaymentIntent with `card` and `link`. Retrieval of that same intent with its returned publishable key and client secret succeeded: the key pair is matched. No charge was attempted.

The exact staging hostname was absent from test-mode wallet domain registrations. It has now been registered in that test account, with Apple Pay, Google Pay and Link each reported active. The three pre-existing production hostnames and all live-mode registrations were left unchanged. See [domain repair](checks/domain-repair.json), [runtime audit](stripe-staging-runtime.json), and [unpaid intent probe](checks/intent-probe.json).

The fresh browser checkout reproduced Bank and Klarna with Stripe DOM method IDs `link` and `link_klarna`; they are Link funding options, not an extra Klarna PaymentIntent method. Stripe documents controls for Klarna in Link but not individual disabling of the Bank option while preserving Link. The founder subsequently directed us to use production's existing user-facing setup as the reference. Preserve the Card/Link policy and production settings. Do not disguise or claim to have removed these test-mode Link options.

The source hardcoded test publishable-key fallback has been replaced with explicit staging runtime configuration. No pricing calculations or Stripe package versions are changed.

Domain activation is provider configuration evidence, not evidence of wallet readiness on an eligible iPhone or a completed Apple Pay payment. Those device/transaction acceptance items remain open. No live payment, email, supplier order, or physical mail is authorized or tested.

## Visual checks

Actual components rendered in an isolated local fixture, with production CSS and handwriting fonts and synthetic addresses. At 320, 390, 768 and 1280 CSS pixels, the normal recipient text block's center differed from the envelope center by less than 0.004 CSS pixels; no horizontal overflow. At 320px, long Unicode/apartment text at 200% size remained inside the growing envelope. International and deferred states inspected. Reset confirmation initially focuses Keep editing, Shift+Tab wraps to discard, Escape restores Card options focus, cancellation invokes zero reset callbacks, and busy reset is disabled. See [visual results](checks/visual-results.json).

## Release evidence

Independent Luna review found no implementation blocker. All 16 focused test suites, TypeScript checking, and the Next.js production build passed. Browser fixtures exercised the real envelope/header, payment component with mocked Stripe, and parent draft persistence. Outside-click closes the reset menu without resetting; the header displays the supplied $12.75 total. Staging push and exact serving-build verification are pending. See [review](REVIEW.md), [checks](checks/focused-results.json), and [browser contact checks](checks/browser-contact-results.json).

## Rollback

Code rollback: revert this sprint's scoped commit on staging and let App Hosting deploy the revert; do not reset shared history. Previous staging source is the baseline above. The added test-mode domain can be disabled by its recorded ID if a scoped rollback is required; do not alter live-mode domains. Restore prior staging configuration only if reverting the explicit publishable configuration together with the source fallback change.

## References

- [Stripe Link FAQ](https://support.stripe.com/questions/link-faq)
- [Stripe payment method domain API](https://docs.stripe.com/api/payment_method_domains/create)
- [Stripe wallet testing](https://docs.stripe.com/testing/wallets?ui=express-checkout-element)
