# SPRINT-0021 planning evidence

Reviewed October 27, 2026. Planning only; no application code, hosting or Stripe setting changed.

## Source and context

- Remote staging tip: `c8cc214100dc5f0184df9d1f0131a3c108e94e9e`; main tip: `5d008dd82f078002926de7e03a87a34e89ae1741` (read-only `git ls-remote`). Source inspected in `/private/tmp/sendmynotes-envelope-0020`.
- Read AGENTS.md, canonical project/product documents, and relevant recent sprint context (0018–0020). No semantic index or chapter context configured.
- User screenshot reviewed privately; its personal email/address content was not copied into artifacts. Only generic invented contact values appear in concepts.
- `app/preview/entry/client.tsx:238–241` is the confirmed account-email refill effect. Step4's committed-email effect and server `||` fallbacks are additional risks for explicit omission, not proven causes of the visible keystroke-level bug.
- `components/flow/EnvelopePreview.tsx` recipient layout uses fixed percentage margins. `FlowHeader.tsx` uses a small underlined reset button beside a wide pill.
- `components/v3/Step4ReviewAndPayment.tsx` has mandatory email in its input and submit handler, separate Express Checkout confirmation, unconditional wallet-name heading, and mobile/desktop guarantee blocks.
- Both source revisions' `lib/stripe.ts` use `payment_method_types: ["card", "link"]`. A narrow diff shows the staging payment-mode guard is additional; the method list itself did not change. No claim is made that the screenshot's actual intent used that list.
- `app/api/checkout/create-intent/route.ts` omits empty receipt email at intent creation, but has a hardcoded test publishable-key fallback. Account mismatch is a diagnostic possibility, not an established finding.
- `confirm-order`, free-order completion, order processor and Stripe webhook can fall back to saved receipt/contact email. The order page has an unconditional receipt-sent label with a missing-email fallback; this must change if email is optional.

## External reference verification

Official Stripe documentation read during planning:

1. [PaymentIntent create](https://docs.stripe.com/api/payment_intents/create): receipt email optional.
2. [Payment Element options](https://docs.stripe.com/js/elements_object/create_payment_element): ordering does not filter additional intent methods; method-required billing details must still be supplied.
3. [Express Checkout](https://docs.stripe.com/elements/express-checkout-element): supported methods depend on setup and eligibility.
4. [Wallet testing](https://docs.stripe.com/testing/wallets?ui=express-checkout-element) and [domain registration](https://docs.stripe.com/payments/payment-methods/pmd-registration?dashboard-or-api=dashboard): compare on a supported device, with separate environment registrations.
5. [Payment configurations](https://docs.stripe.com/payments/payment-method-configurations): supports scoped configurations when dynamic methods are used; not a reason to migrate this integration.

No live account audit, payment transaction, email delivery or physical order was performed. The proposed Apple Pay button is a drawing, not integration evidence. Founder-reported correct production display is retained separately from end-to-end payment verification.

## Mockup validation

The standalone concept was rendered at 1240px and checked at 320px (document width 320px, no horizontal overflow). Options menu and confirmation opened; Keep editing returned to the concept. Wallet and deferred-address toggles changed the illustrated state. There is no Stripe SDK, backend, persistent storage or external request in the concept. Assets are copies of the sanitized SPRINT-0020 paper/stamp and bundled handwriting font, not new product photography. Screenshots were inspected visually.

## Planning exception and ledger

The founder previously authorized direct single-author planning when Claude CLI was unavailable. That preference is retained. The skill model resolver still reports default Claude Fable / Codex Astra lanes; no external planning agents were launched or represented as having reviewed this plan. Claude remains unavailable on PATH. The existing ledger is JSON; the installed helper supports YAML/TSV only, so the new entry is added to the established JSON ledger without creating a competing ledger or rewriting other entries.
