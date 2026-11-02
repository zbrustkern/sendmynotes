# Sprint 0025 W0 merge resolution

W0 integration notes for the uncommitted merge of account staging
`00852e7927cc936d5d31310519d64b9b6b8ab7e8` into production baseline
`a298a1935e9560f5c53df5bcad02ecfc63e9bf44` (shared base `b831eb0`). The
merge is still in progress and no commit has been made. All 39 conflicted paths
were resolved and staged; `git ls-files -u` reported zero unmerged entries.
The coordinator owns tests, TypeScript, build, and final merge completion.

## Resolution decisions

- **Checkout creation and payment:** retained the staging quote/offer flow,
  operational checkout pause, account-order association, and private Upload
  order-master pinning. Kept server country/address validation, personal US
  return identity, immutable quote/payment-intent fields, international
  preview hold, and failed-reservation cleanup behavior. Account and Upload
  references remain server-resolved before order/payment creation; no client
  image URL becomes an authority reference.
- **Confirmation, free orders, and Stripe webhooks:** kept server PaymentIntent
  retrieval/binding, quote integrity, capture evidence, contact-choice
  synchronization checks, receipt delivery claims, account accepted-order
  projection, and deterministic offer redemption. Kept the webhook inbox and
  replay state while retaining main's independent capture and order checks.
  Supplier dispatch remains protected by test-mode and staging holds, an
  operational pause, a transactional lock, and `DISPATCH_UNCERTAIN` handling.
- **Order processor:** the two branches each introduced a
  `verifyPaymentIntentForOrder` declaration and a pre-dispatch authority block.
  Removed the duplicate main declarations/blocks and kept the more complete
  staging authority path, which also validates Admin Comp quote and intent
  bindings, captures auditable payment facts, projects accepted account orders,
  and enqueues the analytics outbox. The resulting processor retains main's
  strict quote/country/contact gates and ambiguity-safe supplier state. A
  single verifier now requires `succeeded`, exact order binding, matching
  amount/currency, and Admin Comp metadata when applicable.
- **Artwork, draft, and builder:** kept account image/draft state and private
  Upload recovery, alongside main's resumable local drafts and PR #1 artwork
  recovery flow. `/api/artwork/recover` remains a signed, short-lived,
  single-cover capability with no-store/no-referrer responses; it does not
  grant account history or order access. The account private image path remains
  separate. The reducer/store retain both address-deferral state and private
  account/Upload selections, with the selection sanitized and revalidated
  before use.
- **Telemetry and attribution:** kept the staging consent-aware V2 retry/outbox
  and accepted-ACK flow, plus main's note-edit throttling and recovery event
  support. Browser payloads remain allowlisted and server-only purchase and
  fulfillment authority is preserved. Attribution fallback and sanitization
  use the staging privacy-aware implementation.
- **Admin and environment:** retained the staging Admin Comp quote/service
  adapter, retry investigation gate, upload admin entry, and telemetry console;
  kept staging review and operational pauses ahead of supplier dispatch. Admin
  logout now clears the server admin cookie before Firebase sign-out. Preserved
  the production environment's existing international-mailing setting and
  staging's explicit review-only, test-mode, private-upload, and reminder-off
  bindings.
- **Purchase measurement:** retained capture/refund-ledger projection and the
  main quote-snapshot total fallback. Explicit legacy `fullyRefunded` evidence
  still marks a measurement refunded; an unavailable refund ledger leaves the
  refund state unknown.
- **Tests:** retained staging's refund-ledger and international-addressing
  coverage while preserving main's full-refund and region-validation
  assertions. The mail fixture still uses provider test addresses only.

## Remaining validation

No tests, typecheck, production build, browser run, network/provider call, or
fulfillment operation was run during conflict resolution, per coordinator
ownership and W0 restrictions. Run these after the source tree is stabilized:

- artwork and draft recovery: `tests/artwork-recovery.test.ts`,
  `tests/draft-recovery-browser.test.mjs`;
- payment, webhook and quote safety: `tests/payment-mode-safety.test.ts`,
  `tests/payment-checkout-parent.test.mjs`,
  `tests/payment-discount-browser.test.mjs`,
  `tests/international-checkout.integration.test.ts`, plus the applicable
  order-processor/webhook regressions;
- account/private artwork ownership: `tests/account-order-association.test.ts`,
  `tests/account-history.test.ts`, `tests/account-routes-security.test.ts`,
  `tests/upload-checkout.test.ts`;
- telemetry and attribution privacy: recovery acceptance/persistence,
  consent/GPC denial, stable retry IDs, payload allowlisting, and no note,
  address, prompt, or recovery token leakage;
- operations and admin: duplicate webhook replay, transient inbox failure,
  Admin Comp staging hold, retry gate, operational fulfillment pause, and
  server admin-cookie clearing.

The merge is code-integrated only. Passing local tests will not prove staging
signed-in acceptance, production indexes/IAM/secrets/jobs, reminder activation,
or production readiness; keep those W6–W9 release gates explicit.
