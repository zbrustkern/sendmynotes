# Post-purchase follow-up operations

This runbook covers the optional two-message post-purchase flow from Sprint 0026. The code is designed to remain inactive until the sender identity, reply mailbox, postal footer, suppression behavior, and permission evidence are verified. Reminder delivery is a separate program and remains off.

## Safe defaults

Both App Hosting manifests set `POST_PURCHASE_DELIVERY_ACTIVE=false` and `POST_PURCHASE_AUTO_ENROLL_ACTIVE=false`. The persisted program config also defaults to reviewed enrollment and globally paused. Staging remains review-only and Handwrytten test mode stays enabled. Turning on either flag is a separate activation decision; deploying code does not authorize customer sends.

Only messages about the sender's own previous purchase are optional marketing follow-ups. Existing receipt delivery remains transactional and independent. A historical receipt address, founder order, comp, free order, test order, refunded order, pending payment, missing/unknown opt-in, support hold, or unverified mailing evidence must not be enrolled or sent.

## CLI

Run the repository command with an explicit environment and bounded limit. Preview and candidates are read-only. `enroll` and `dispatch` default to dry-run; state changes require `--apply`. `enroll --apply` is an explicit operator approval that activates an eligible reviewed enrollment and schedules its first message. It still does not send email. `reconcile` is read-only and must never infer that a send succeeded from a timeout or missing provider event.

```text
npm run post-purchase -- preview --order <order-id> --stage check-in|offer --environment staging|production
npm run post-purchase -- candidates --environment staging|production --limit 25
npm run post-purchase -- enroll --order <order-id> --environment staging|production [--apply]
npm run post-purchase -- dispatch --environment staging|production --limit 25 [--apply]
npm run post-purchase -- reconcile --message <message-id> --environment staging|production
```

The script must verify that its configured Firebase project exactly matches the selected environment before reading data. For `--apply`, it requires live Application Default Credentials, an authorized operator identity, the matching environment project, and service eligibility checks. Staging's review-only guard blocks delivery. Production dispatch additionally requires `POST_PURCHASE_DELIVERY_ACTIVE=true`; otherwise it fails closed. Enrollment approval can schedule an eligible message while delivery remains off; no provider call occurs until a separate dispatch apply passes its delivery gates. No command accepts an arbitrary recipient override. Test delivery, if later approved, must use a synthetic record and a separately configured allowlisted operator inbox.

Dry-run mode makes no provider calls, creates no active code, and performs no writes. Output is bounded redacted JSON; it must not include raw addresses, message text, tokens, coupon values, authentication data, or provider response bodies. Exit nonzero on invalid arguments, wrong project, missing operator authorization, or service errors.

## Activation prerequisites

Before any reviewed enrollment or provider dispatch:

- Confirm a verified Resend sender domain with SPF/DKIM/DMARC, a monitored reply-to address, and the exact business postal address required in each message footer.
- Provision an environment-specific `POST_PURCHASE_SENDER_HMAC_KEY` (32+ random bytes) and retain its version. Do not copy the key across projects or print it into logs.
- Provision environment-specific `POST_PURCHASE_UNSUBSCRIBE_SECRET` and `POST_PURCHASE_LINK_SECRET` values (each at least 32 characters). These sign unsubscribe tokens and private offer references; keep them out of the manifests and logs, and bind secret versions only through the approved App Hosting secret configuration.
- Verify consent is affirmative and tied to a disclosure version. The two previously reported customer emails are receipt-only / permission unknown and remain excluded unless new evidence is recorded.
- Confirm payment capture and non-test/comp/refund state, non-pending recipient address, and an actual provider `mailed` status plus dated mailing evidence. A synthesized historical timestamp is not proof.
- Verify checkout continues without marketing consent and existing transactional receipts remain functional.
- Confirm all required indexes are READY (due messages by `state + dueAt`, stale dispatch leases by `state + leaseUntil`, enrollments by `senderKey + programId` and `sourceOrderId + programId`, messages by `enrollmentId + step`, accepted check-ins by `state + step + followupFinalizedAt + acceptedAt`) and Firestore browser rules deny client access to preferences, enrollments, messages, unsubscribe tokens, and offer grant mappings.
- Exercise synthetic order, timeout, retry, suppression, unsubscribe, duplicate webhook, offer-collision, and final-slot redemption cases with fake transport. Do not send to historical customers during validation.

## First reviewed run

Keep `mode=review`, `globalPaused=true`, and both runtime flags false while configuring copy and timing. Preview each exact message using a synthetic eligible order. The first approval requires an operator-reviewed eligibility list with affirmative recipient permission and verified mailing evidence. Scheduling a message is not approval to send it: provider delivery remains blocked by both runtime flags and the global pause. The first actual send batch requires a separate explicit release authorization, a controlled cohort, and an independently monitored provider result. Do not backfill old orders into a send queue. Automatic enrollment is future-only and remains separately disabled until the reviewed pilot is accepted.

## Uncertain delivery and opt-out

Provider acceptance means only that Resend accepted a request; it does not prove inbox delivery. After an ambiguous network failure, preserve the stable provider idempotency key and frozen payload. Reconcile via authenticated provider webhook/API evidence or an explicit audited operator resolution. Never blindly retry after the provider idempotency window expires. Opt-out and bounce/complaint suppression take precedence before every dispatch. Unsubscribe routes and signed webhook processing remain active when new enrollment or delivery is paused.

Disable future enrollment and provider dispatch by leaving or setting both flags to false and setting the program paused. Preserve unsubscribe handling, suppression records, already-promised coupon terms, and durable message/offer history. A code already sent must not be silently revoked because an unrelated purchase or later opt-out occurred.

## Deployment procedure reference

Recent releases were Git-triggered Firebase App Hosting rollouts. PR #5's [release record](sprints/evidence/SPRINT-0025/PRODUCTION-REPORT.md) and the November 2 Account/Studio release packet in the delivery artifacts show the source SHA, build ID, rollout, 100% traffic, hosted checks, safety flags, and rollback build captured after each rollout. For this sprint, prepare and review the exact candidate, deploy the authorized staging branch first, and independently verify App Hosting build source, READY status, successful rollout, 100% traffic, environment flags, project bindings, indexes, and hosted checks. Production requires its own explicit approval after staging acceptance. Do not treat Git merge, a queued build, or provider acceptance as successful deployment or inbox delivery.
