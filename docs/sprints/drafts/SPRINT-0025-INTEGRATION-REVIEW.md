# Sprint 0025 integration review

Read-only comparison for W0, November 1, 2026. Compared production `main` at
`a298a19`, account staging `00852e7`, and their shared base `b831eb0`. The
execution checkout is on `codex/production-readiness` at `a298a19`; no source
files were changed. The existing untracked readiness-plan/evidence files were
left untouched.

## Merge conclusion

Treat `a298a19` as the production safety baseline and merge the account feature
by behavior group. Do not take either branch wholesale for checkout, webhook,
or order processing. Main contains accepted-payment verification and recovery
work that staging predates; staging contains the account/private-artwork
association and webhook-event inbox that main does not have. Reconcile those
contracts before resolving conflicts, preserving both where their authority
boundaries differ.

The shared base is `b831eb0`; staging head is `00852e7927cc936d5d31310519d64b9b6b8ab7e8`.
Main contains commits `e34e52b` (PR #1), `989a958` (PR #2), and `a298a19`
(PR #3) above its checkout/payment work. The three PRs are additive recovery
changes, not substitutes for the account library or order ownership work.

## Behavior to preserve

- **Payment authorizes fulfillment only after server verification.** Main
  binds confirmation to the order's stored PaymentIntent, checks status,
  currency, amount received and accepted quote, and blocks mismatches with an
  incident/reconciliation path. The webhook independently verifies the
  succeeded capture and order binding. Keep the browser `verifyOnly` path
  separate from the fulfillment call; it must not become an alternate
  authority or dispatch route.
- **The accepted order snapshot controls the transaction.** Preserve the
  server-calculated country/quote and total, personal US return address,
  explicit recipient country, and international staging hold. Keep the
  account UID association and server-pinned Upload master from staging, but
  resolve and validate them before payment/order writes. Client-supplied image
  URLs cannot replace private account/upload references.
- **Contact choice is committed before receipt or fulfillment.** Main adds an
  explicit contact endpoint and effective-email policy, with pending/synced
  state checks in confirm, free-order completion, and the order processor.
  Preserve the no-email/deferred-address cases and transactional receipt
  claim. Avoid resurrecting the older path that sends directly from both
  confirmation and webhook without an idempotency claim.
- **Supplier dispatch is idempotent and ambiguity-safe.** Keep transactional
  dispatch locking, test-mode supplier suppression, and a terminal
  `DISPATCH_UNCERTAIN` state for ambiguous provider submission. Do not retry an
  uncertain physical submission blindly. Preserve staging's webhook event
  inbox/deduplication and adapt it to the stricter main verification checks.
- **Artwork recovery is narrow and non-authoritative.** PR #1 issues a
  seven-day HMAC token scoped to one generated cache entry and returns only
  that cover, with no draft/order access. `/open` exchanges the query token for
  a short-lived HttpOnly cookie before navigating to `/new`; the client then
  restores artwork while retaining local draft fields. The route is private,
  no-store, and no-referrer. PR #2 builds the redirect from the request's
  public origin. PR #3 asserts telemetry acceptance was persisted. Preserve
  all three and keep this legacy generated-artwork recovery distinct from
  signed-in account history/media and immutable order masters.
- **Telemetry and order records do not invent customer outcomes.** Keep
  accepted server telemetry authority and recovery assertions; keep capture
  evidence separate from purchase classification. Account/order ownership
  remains UID-first, with only the documented ownerless legacy verified-email
  fallback. Never let a recovery token, telemetry event, or email itself grant
  order ownership.

## Main behavior already represented in staging

The following main-side behavior is substantially present in the staging tree
and should be reconciled rather than duplicated: international address/country
validation and quote snapshots in checkout creation; personal return-address
validation; contact-email intent/state and contact API; `effectiveOrderEmail`
handling; payment-mode/test-mode separation; quote metadata on the intent;
capture validation and explicit order matching; idempotent receipt delivery;
and customer-facing deferred-address handling. Confirm by behavior, because
staging has since changed the surrounding APIs and persisted records.

Staging adds behavior absent from main that must remain: account-to-order
association; server-pinned Upload order master and private artwork references;
account library/draft handoffs; and `lib/webhook-inbox.ts` event deduplication.
Main's recovery feature is not semantically replaced by those account APIs:
the recovery URL restores a generated legacy cover into a new guest builder,
whereas account history and private media authorize retrieval of an owned
order's immutable artwork.

## Conflict resolution by file

| File or group | Resolve toward | Merge notes |
| --- | --- | --- |
| `app/api/checkout/create-intent/route.ts` | Compose both | Preserve main's destination validation, quote calculation, surcharge and intent metadata. Add staging's account association and Upload-master pinning before reservation/order creation. Keep offer/discount reservation and release semantics coherent; check no failed private-artwork resolution leaves a reserved offer or orphan intent. Persist a single immutable order snapshot with verified owner and private master reference. |
| `app/api/checkout/confirm-order/route.ts` | Main authority + staging-compatible record shape | Retain main's stored-PI equality check, verification, capture snapshot, `verifyOnly`, and receipt claim. Carry staging's account/order fields through the order reads and results. Do not reintroduce the old amount-only or browser-owned confirmation check. Ensure successful verify-only replies do not imply supplier submission. |
| `app/api/checkout/complete-free-order/route.ts` | Main guards + staging fields | Preserve authoritative eligibility, contact synchronization, and deferred-email checks. Retain account/private-artwork metadata when reading/updating the order. Free completion must remain discount-authorized and idempotent, with no accidental live payment or supplier dispatch from a malformed order. |
| `app/api/checkout/contact/route.ts` and `lib/checkout-contact.ts` | Main | Keep view-token authorization, pending/synced transition, accepted email choice, and effective-email policy. Adapt only the order storage/ownership shape needed by staging; do not accept client-chosen ownership. |
| `app/api/webhooks/stripe/route.ts` + `lib/webhook-inbox.ts` | Compose; main validates, staging deduplicates | Keep inbox claim/processed state and replay behavior, but run main's capture/order/currency/livemode validation before dispatch. Record malformed-but-captured money for reconciliation where possible. Define when inbox events become processed so a transient DB/provider failure is retryable while a confirmed duplicate is safely acknowledged. Preserve exactly-once receipt claim and do not swallow uncertain supplier outcomes as success. |
| `lib/order-processor.ts` | Main dispatch/payment safeguards + staging account projection | Retain transaction lock, bound PI, accepted order/quote checks, international hold, explicit contact gate, test-mode supplier suppression, and `DISPATCH_UNCERTAIN`. Ensure each order update preserves `userId`, owner scope, `uploadMaster`, account association and immutable artwork metadata. Keep staging's current Upload/account-reference validation at the pre-dispatch boundary. Resolve any differences in the order status union and update helpers explicitly. |
| `lib/stripe.ts`, `lib/payment-mode.ts`, `lib/types.ts` | Merge fields and invariants | Keep staging's private artwork/account fields and main's quote/payment metadata. Preserve strict live/test configuration boundaries and avoid making test-mode confirmation capable of supplier dispatch. Additive type changes should represent persisted fields actually written by both paths. |
| `app/api/artwork/recover/route.ts`, `lib/artwork-recovery.ts` | Main, retained as separate legacy path | Keep signed token scope, TTL, public-origin redirect, short cookie exchange, no-store/no-referrer headers, and strict cache record validation. Do not route account history through this endpoint or loosen it into a generic URL proxy. |
| `app/preview/entry/client.tsx`, `components/flow/EntryCardStep.tsx`, `components/v3/CustomAiCommissionDrawer.tsx`, `components/v3/Step2NoteComposition.tsx`, `lib/draft/*` | Compose recovery with account draft contracts | Preserve PR #1's local guest-draft recovery and account-switch cleanup. Add account draft restoration as a distinct authenticated, owner-checked source; never let a stale guest recovery token override a signed-in saved front. Explicit acceptance and current front/hash validation remain required. |
| `app/api/telemetry/route.ts`, `lib/telemetry-schema.ts`, `lib/telemetry.ts` | Main, then merge account event additions narrowly | Keep allowlisted accepted recovery event persistence and server-only purchase/fulfillment authority. Avoid duplicate recovery instrumentation and avoid putting artwork prompts, note text, addresses, or tokens in telemetry. |

## Focused validation after integration

Run guarded suites with synthetic storage/provider stubs only; inspect each
script before running it. At minimum:

- `tests/artwork-recovery.test.ts` and `tests/draft-recovery-browser.test.mjs`:
  token scope/expiry/tampering, cookie exchange, public-origin redirect,
  private cache headers, draft survives refresh, recovery telemetry accepted,
  and no private note/address leakage.
- `tests/payment-mode-safety.test.ts`,
  `tests/checkout-contact-policy.test.ts`,
  `tests/checkout-contact-route.integration.test.ts`,
  `tests/international-checkout.integration.test.ts`,
  `tests/payment-checkout-parent.test.mjs`, and
  `tests/payment-discount-browser.test.mjs`: valid and invalid capture,
  changed/mismatched quote, owner-bound artwork, contact pending state,
  idempotent confirm/webhook, deferred address, staging international hold,
  test-mode supplier suppression, and no dispatch on verification failure.
- Account/upload coverage: `tests/account-order-association.test.ts`,
  `tests/account-history.test.ts`, `tests/account-routes-security.test.ts`,
  and `tests/upload-checkout.test.ts`; prove UID mismatch, ownerless legacy
  email fallback boundaries, private master durability, and no arbitrary URL
  fetch. Exercise duplicate webhook event IDs and replay after transient
  failure against a mock inbox.
- Order processor assertions: concurrent confirmation admits one dispatch;
  stale/uncertain submission never blindly retries; receipt delivery claims
  once; accepted immutable order art survives account changes/deleted library
  entries; no path sends real email or calls a supplier in the test harness.

Run `npm run test:account` only after reviewing its runner for external side
effects, plus TypeScript and the coordinator-owned production build after
source stabilization. Do not run fulfillment scripts or live provider calls.
Passing local tests does not prove deployed indexes, IAM, secrets, jobs, signed-in
staging acceptance, or production readiness; keep those gates open per W6–W9.
