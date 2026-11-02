# Sprint 0024 — people, occasions, reminders evidence

## Delivered

- Owner-scoped people and occasion services, cursor pagination, optimistic version updates, optional private mailing address, soft removal, and contact-linked occasion cleanup.
- Idempotent `users/{uid}.savedAddresses` migration to deterministic people/occasion IDs. The migration marker is `account_people_migrations/{accountScope(uid)}_saved-addresses-v1`; legacy reminder booleans are never treated as current consent.
- Date validation and civil-date scheduling with IANA timezone conversion with an explicit confirmed-timezone gate, explicit Feb 29 behavior, 14-day lead, separately consented late reminders, frozen `occurrenceDate` / `dueLocalDate`, and 48-hour catch-up.
- Owner-scoped reminder outbox with injected transport, default-off Resend SDK adapter, identity/email/consent/preferences rechecks, unsubscribe token opt-out, accepted-order suppression, safe expired-claim recovery, and stale `dispatching` outcomes marked `uncertain` instead of retried.
- Account people/date screens and legacy AuthContext bridges now use versioned person/occasion APIs. `/api/account` projects canonical people for older consumers and rejects stale whole-array address writes after performing migration.

## Validation

- `NODE_ENV=test SMN_TEST_DATA_DIR=/private/tmp/smn-sprint24-lane1-test node --import tsx tests/sprint-0024-people-reminders.test.ts` — passed with a fresh isolated mock Firestore directory. Covers date/leap/DST rules, owner isolation, idempotency/version conflict, migration with default-off consent, message privacy, disabled delivery, fake transport acceptance/dedupe, timezone adjustment, late consent, and uncertain provider outcome.
- `npx tsc --noEmit --pretty false` — passed after clearing stale generated `.next/types` from the earlier quoted route path.

## Operational boundaries and residual risk

- Real reminder sending remains off unless `ACCOUNT_REMINDER_DELIVERY_ACTIVE=true`, `RESEND_API_KEY`, `REMINDER_FROM_EMAIL`, and `REMINDER_WORKER_SECRET` are all configured. The adapter uses the Resend SDK idempotency option and does not use the legacy simulated-send wrapper.
- No email, supplier, fulfillment, or deployment calls were made. Production delivery and unsubscribe lifecycle remain external gates.
- Checkout acceptance can race between the final exact owner/occasion/date accepted-order lookup and provider invocation. The hook cancels only `pending`/`claimed`; once `dispatching` begins, timeout/recovery is recorded as `uncertain` and is never automatically resent to avoid duplicate mail.
- Production Firestore composite indexes need to include reminder outbox queries by `(ownerScope, occasionId, occurrenceDate)` and `(state, nextCheckAt)`, `(state, leaseUntil)`, `(state, dispatchStartedAt)`; order suppression queries the environment-scoped orders collection by `(userId, accountOccasionId, occasionOccurrenceDate, accountAcceptedAt)`. Pending outbox work is ordered by `nextCheckAt`; temporary ineligibility advances only that retry field, leaving the frozen `dueAt` and civil dates intact.
