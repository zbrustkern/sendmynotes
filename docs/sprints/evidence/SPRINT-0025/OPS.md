# SPRINT-0025 W7–W8 operational evidence

## Implemented

- Added authenticated, bounded cron handlers for Upload cleanup, account library/draft cleanup, and reminder dispatch. Cleanup supports an authenticated `dryRun=true` bounded sample. Reminder dispatch stays inactive unless its explicit feature gate and transport prerequisites are configured.
- Added per-environment/job run summaries with per-job retention, stale-run reclaim, attempt-token compare-and-set finalization, and latest-per-job health projection. Run summaries contain aggregate outcomes only.
- Added an admin Troubleshooting panel for job health, exact reminder queue backlog/oldest-due and uncertain/failed counts, and oldest-first paginated privacy requests. Privacy changes require same-origin admin requests, expected-version checks, and an explicit completion confirmation plus internal evidence reference.
- Added owner-scoped, idempotent privacy request submission/status and bounded count-only preview. Legacy request rows without version/status timestamps are projected safely. The preview neither exports nor deletes data.
- Added rotating, bounded Upload cleanup cursors. Page cursors advance only after successful collection-page processing. Dry-run samples do not advance cursors. Accepted/ordered designs are preserved; unbounded object-orphan deletion is deferred pending an authoritative bounded reference inventory.
- Documented operating limits and founder-owned readiness gates in [`docs/OPS.md`](../../../OPS.md).

## Verification

- `npm run test:account` passed the account sprint and related regression suites, including account preferences, privacy requests, history, legacy reminder retirement, account library/drafts, people/reminders, draft model, upload checkout, upload route security, and optional account menu.
- `node --import tsx tests/operational-jobs.test.ts` passed synthetic-storage checks for cron authentication, bounded cleanup/dry-run behavior, cursor progress/tombstone handling, accepted-design retention, slot replay, reminder-disabled diagnostics, and attempt-token finalization.
- `node --import tsx tests/account-privacy-requests.test.ts` passed synthetic-storage checks for owner isolation, idempotency, admin authorization and same-origin protection, version conflicts, audit transitions, completion evidence, and bounded owner preview.
- `git diff --check` passed.

All tests use synthetic mock storage. No provider, email, fulfillment, external service, build, or deployment was run. A typecheck/build remains for the coordinator's integration pass.

## Remaining operational gates

- Keep `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false` until the founder authorizes activation and a real transport is configured and validated.
- Configure and verify the scheduler secrets and schedules independently in the target environment.
- Add the three composite indexes documented in `docs/OPS.md` to the final manifest and verify their deployed state.
- Assign primary/backup responders, response/escalation targets, and an approved secure export channel before making customer-facing service commitments.
- Validate actual retention/deletion obligations for accepted orders, payment, supplier, accounting, provider, and backup data before executing privacy erasure. No destructive privacy processor or customer export delivery path is claimed by this work.
