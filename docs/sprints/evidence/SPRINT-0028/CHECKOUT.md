# Sprint 0028 checkout lane evidence

## Frozen boundary

Checkout accepts a versioned `multiSend` request with a UUID checkout ID, 2–25 recipients, safe stable recipient IDs, full U.S. mailing addresses, and `inherit` or exact `custom` greeting choices. The shared structured note is `{salutation?, text, signOff?, style}`. Inherited greeting resolves from `note.salutation`; complete printed content is `[resolvedGreeting, text, signOff].filter(Boolean).join("\n\n")`, checked against the existing 450-character application limit per recipient. Same-address/different-name entries require an acknowledgment tied to the normalized address key. No recipient-name substitution or physical-fit claim is introduced.

The additive `Order.multiSend` snapshot type models the immutable parent and recipient payload. The feature flag `multiSendEnabled` defaults to false. When explicitly enabled, create-intent calculates quantity pricing at $9 per recipient, allocates integer cents, pins existing trusted artwork through the current upload/account path, persists the immutable parent snapshot, and creates one PaymentIntent. Identical retries use a content-bound deterministic parent ID and Stripe idempotency key. Confirm and webhook reuse the shared payment convergence path, which validates the frozen quote and queues batch work without singular supplier dispatch.

## Local verification

`python /private/tmp/smn28-tests.py tests/multi-send-contracts.test.ts` and `python /private/tmp/smn28-tests.py tests/multi-send-checkout-route.test.ts` passed with mocked providers. Route coverage includes default-off gating, frozen messages and quantity quote, a $1.80 offer on a three-card $27 quote ($25.20 payable), exact retry retrieval without a second create, missing guest capability, account-owner mismatch, content replacement proof, racing initial requests and retry fences, previous-intent cancellation failure, processing/succeeded payment states, and tampered amount/currency/revision/livemode. No live network, Stripe, supplier, deployment, build, or fulfillment commands were run.

The parent resolved the shared mock Firestore and draft-test typing issues; the final combined typecheck passes. See REVIEW.md for current integrated evidence.

## Remaining checkout integration

Provider behavior was validated with an injected fake Stripe client under the safe network-denying harness. The checkout group uses a separate random 32-byte HttpOnly, same-site guest capability cookie (scoped to the checkout API) or authenticated account identity; checkout ID and client session ID are not authorization. Transactional claims serialize changed-snapshot replacements and exact-retry retrieval. Stripe replacement validates the prior frozen intent metadata and cancels it before creating a replacement; unknown, paid, or provider-error cases fail closed into reconciliation. Live Stripe cancellation failures, full authenticated account middleware behavior, and provider-backed staging remain unverified. The feature flag is false by default and has no request/query override.
