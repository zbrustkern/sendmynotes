# Sprint 0025 release gates

## Review candidate

The release branch merges production `a298a19` with staging `00852e7`, resolves 39 merge conflicts, and adds the audit remediation. The original dirty checkout is preserved. See REPORT.md for the exact candidate and current evidence.

## Before production promotion

1. Complete legitimate signed-in staging acceptance with two controlled users: verification continuation/token refresh, saved-image ownership and anonymous/cross-user denial, import consent/retry, draft resume, generated/preset/upload history and reuse, Studio select/edit/cancel/refresh and changed-front checkout reset. Local mocks and signed-out shells do not prove this.
2. Verify runtime-identity private object put/read/delete, anonymous denial and actual indexed queries using disposable staging fixtures. Bucket IAM inspection is supporting evidence, not this runtime test.
3. Complete responsive/keyboard acceptance at 320/390/768/1024 widths. Apple Pay remains untested.
4. Run authenticated cleanup dry-run against disposable live fixtures, check preservation of accepted/ordered/saved objects and partial-failure retry, then configure cleanup schedules. Existing staging upload cleanup is retained. New library/reminder jobs have not been activated; production Scheduler API is unavailable/disabled in the recorded preflight.
5. Zeke is the initial privacy-request operator; manual requests are approved for this release. Confirm the dashboard review routine, response/escalation targets and secure export channel. A backup is not assigned. Rehearse manual export/deletion inventory and partial-failure recovery using disposable data. The shipped queue/preview is not an automated erasure/export processor; completion requires operator evidence.
6. Decide signing-key migration before production. Binding the new independent `ADMIN_SESSION_SIGNING_KEY@1` invalidates old admin sessions, admin-comp links signed by the old key, and seven-day artwork-recovery links previously signed through the legacy fallback. Choose a bounded compatibility migration or explicitly authorize invalidation and reissue affected links. Do not promote this configuration without resolving the recovery-link gate.
7. Repeat production preflight on the exact candidate; all manifest indexes must be READY, private bucket/secret IAM correct, and production-specific values resolved. Confirm rollback and explicitly authorize production application rollout.

## Separate reminder activation gate

Keep `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false`. Set a verified sender only after it is confirmed; no `REMINDER_FROM_EMAIL` is guessed. Require legitimate opted-in inbox receipt, links/unsubscribe, timezone/DST/late-event behavior, current consent and backlog review, operators/alerts, and explicit activation authorization. Provider acceptance alone is not inbox proof.

## Rollback

Record the current production revision/traffic/config before rollout. Prefer rolling the application back to that exact known revision. Preserve additive indexes, buckets, secrets and account records. Pause intake/jobs first when needed; do not delete new records or restore legacy contact-array writers that can overwrite per-record people/dates. New library and order masters remain private and immutable. Rehearse read-only compatibility against new fixtures before promotion. Do not reset user drafts or run physical fulfillment to validate rollback.

## Known scope limit from integration review

Private pinned fronts preserve their actual MIME and hash. The older guest remote-image supplier adapter still assumes JPEG for remote PNG/WebP URLs; review this independently before widening supported guest formats. No live supplier capability is claimed by synthetic tests.
