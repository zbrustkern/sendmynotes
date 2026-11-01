# Sprint 0024 — local implementation and activation boundaries

The initial implementation was local only. The founder subsequently authorized staging deployment. Staging retains review-only payment/mail controls and explicitly disables occasion reminder delivery; production is excluded. No reminder scheduler, real email, payment, or physical fulfillment is part of this release. Customer examples used in validation are synthetic.

## Before a hosted release

- Deploy the deny-all client Firestore rules and additive indexes in `firestore.indexes.json`; wait for indexes to become ready. Prior checked-in evidence showed the same deny-all policy on the production project. This sprint has not audited the live rules or IAM.
- Confirm server Firebase credentials and revoked-token verification. New account routes reject production mock persistence. Test a second real account to verify records and private media remain isolated.
- Confirm `UPLOAD_PRIVATE_BUCKET` uniform bucket-level access and public-access prevention. Library objects use `account-library/` and are separate from short-lived Studio objects and immutable order masters. Existing Upload invitation grants still apply to uploads; ordinary generated fronts do not require a Studio grant.
- Schedule authenticated account-library cleanup using `UPLOAD_CLEANUP_SECRET`. Library is retained until removed; account drafts expire after 90 days without an update. Validate cleanup against disposable hosted fixtures before enabling it.
- Check account sign-in return, library save/reuse, a durable draft resume, account switching, and order history with synthetic hosted fixtures. Do not use fulfillment endpoints as an audit check.

## Reminder activation

Keep `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false` through review. Then verify `RESEND_API_KEY`, a verified `REMINDER_FROM_EMAIL`, `REMINDER_WORKER_SECRET`, and an HTTPS `NEXT_PUBLIC_APP_URL`. Configure an authenticated POST scheduler for `/api/cron/reminder-dispatch` only after provider and sender-domain checks. Settings and dates must show delivery as inactive until this gate is satisfied.

Individual reminders require a verified current account email, a time zone explicitly saved in Settings, an opted-in occasion, and an unpaused account. A late reminder requires its separate tomorrow choice. The stored occurrence fixes the civil reminder date; the dispatcher permits bounded catch-up and records uncertain provider outcomes without blind retry. An accepted order suppresses only its exact owner/occasion/occurrence. An order accepted after the dispatch boundary cannot recall email already in flight.

Use a controlled sender-owned test address to verify provider receipt and unsubscribe before enabling broadly. No such email was sent by this sprint. Provider acceptance is not proof of inbox delivery. Privacy export/deletion submissions are recorded for manual review; operations must monitor and resolve the queue. They do not claim immediate export or erasure.

## Evidence limits

Local fake transports/storage exercise behavior without real services. Signed-out responsive overflow checks passed. A signed-in fixture was prepared with production components and synthetic data, but browser policy blocked its review; signed-in responsive visual acceptance remains pending. No auth fixture or bypass ships in the app. Local checks cannot certify live IAM, deployment configuration, email delivery, device-specific payment behavior, or physical print/arrival results.
