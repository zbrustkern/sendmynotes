# Sprint 0025 W0 integration review

Read-only review of the merged W0 checkout, payment, webhook, order-processor,
draft-recovery and custom-art changes. No W0/shared files were changed during
this review. Findings below are actionable against the current candidate source.

## Findings

### P1 — Free-order retries can resubmit physical mail

**Status: fixed in the W0 follow-up.**

`app/api/checkout/complete-free-order/route.ts` only treats recent `DISPATCHING`,
`PROCESSING_HANDWRYTTEN`, and `MAILED` as already processed (around lines 72–89).
An `AWAITING_RECIPIENT_ADDRESS` order is therefore eligible to claim the lock
again even though it has already completed the paid/free-order path. A stale
`DISPATCHING` lock is also allowed through and is reset to a new dispatch lock;
unlike `processPaidOrder`, this route does not transition stale locks to
`DISPATCH_UNCERTAIN`. Finally, a failed/ambiguous supplier response is written
as `QUEUED_FOR_FULFILLMENT` (lines 298–318), which permits an operator retry
without knowing whether Handwrytten accepted the first submission.

The follow-up adds deferred, uncertain and supplier-accepted terminal cases,
atomically turns stale/malformed dispatch locks into `DISPATCH_UNCERTAIN`, and
routes provider false/throw results to an injected, focused dispatch helper
that persists uncertainty and logs an incident. The helper has no runtime test
flags; production supplies the real provider and test passes a fake adapter.
Regression coverage is `tests/free-order-safety.test.ts`.

### P1 — Stripe webhook can dispatch an expired/invalid offer quote

`app/api/checkout/confirm-order/route.ts` calls `verifyCheckoutQuoteIntegrity`
before the paid-order path, but `app/api/webhooks/stripe/route.ts` proceeds from
`verifyPaymentIntentForOrder` directly to `processPaidOrder` (around lines
119–205). That verifier checks the saved order quote and PaymentIntent binding,
but it does not check offer quote expiry/current offer validity. A PaymentIntent
that succeeds after its 30-minute offer quote expires can therefore be rejected
by client confirmation while the webhook still fulfills it. The webhook must
apply the same authoritative quote-integrity decision before dispatch; captured
funds should be recorded and held for explicit price reconciliation, not sent
to the supplier. Cover the expired quote through both client-confirm and
webhook-only completion paths.

### P2 — Confirmation projects purchase measurement twice

`app/api/checkout/confirm-order/route.ts` repeats
`projectPurchaseMeasurementForOrder` and the `verifyOnly` return at lines
300–322. The first `verifyOnly` branch already returns, so normal confirmation
performs the same projection twice. Keep one projection and one verify-only
return. This is likely idempotent but creates an avoidable duplicate write and
obscures the intended side-effect boundary.

### P2 — An early Stripe retry can consume an active dispatch lock

`processPaidOrder` takes a `DISPATCHING` lock before calling the supplier. If
the supplier helper throws (rather than returning a typed failure), the webhook
marks the inbox event retryable. A Stripe retry arriving before the five-minute
stale-lock threshold enters the transaction, sees an active `DISPATCHING`
state, and returns `alreadyProcessed`; the webhook then marks the event
processed. The order stays `DISPATCHING`, and the later retry that would convert
the stale lock to `DISPATCH_UNCERTAIN` never happens. Catch supplier exceptions
at the dispatch boundary and immediately persist/return
`DISPATCH_UNCERTAIN`, or keep the inbox event retryable without treating an
active lock as a completed payment event. Add a fake supplier test that throws
after lock acquisition, retries before five minutes, and asserts the order is
visible as uncertain/reconcilable rather than permanently dispatching.

### P2 — Free-order supplier exceptions leave an ambiguous lock

**Status: fixed in the W0 follow-up.**

The helper catches supplier exceptions after lock acquisition, persists
`DISPATCH_UNCERTAIN`, records an operator incident, and returns HTTP 409 without
claiming success or retrying. The regression fakes both a throwing provider and
an ambiguous `{success:false}` response and verifies replay does not call the
provider again.

## Strengths retained

- `verifyPaymentIntentForOrder` binds payment status, amount, currency, order ID,
  saved destination quote, and Admin Comp metadata before a dispatch lock is
  acquired.
- Paid-order dispatch rechecks contact-choice synchronization inside the same
  transaction as its dispatch claim, and preserves an uncertainty state for
  ambiguous supplier outcomes.
- Confirm/webhook paths persist capture evidence before fulfillment decisions;
  invalid captures are not silently treated as revenue authority.
- Webhook acceptance has a durable inbox and uses verified provider payloads;
  client confirmation retrieves the PaymentIntent directly from Stripe.
- Account/Upload artwork is server-resolved and pinned before payment creation;
  the request's public URL is not accepted as authority for private fronts.
- Draft recovery keeps one-cover short-lived capabilities separate from account
  history, while account and private Upload selections are sanitized into
  owner-bound references rather than private preview URLs.

## Scope and verification

This is a source review plus a guarded free-order regression, not a full W0
validation claim. `node scripts/readiness/run-tests.mjs free-order-safety
payment-mode-safety international-checkout.integration` passed with the
network-denial preload and Resend mock; these used Firestore/fake provider
adapters. No real provider call, email send, payment, or fulfillment operation
was run. No typecheck or build was run. Remaining findings require
coordinator-owned regressions and final typecheck/build after integration.
