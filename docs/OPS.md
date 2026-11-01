# Operational jobs and privacy request runbook

This is the application-side runbook for SPRINT-0025 W7–W8. It does not prove that a scheduler, private bucket, credentials, responder, inbox, or production index has been configured. Keep `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false` through the first application rollout. Do not copy staging secrets into production.

## Scheduled jobs

| Job | Method and path | Suggested schedule | Authorization | Work bound |
| --- | --- | --- | --- | --- |
| Upload cleanup | `POST /api/cron/upload-cleanup` | Daily | `Authorization: Bearer …` from `UPLOAD_CLEANUP_SECRET` | At most 100 records per source collection per pass; rotating per-environment cursors; private, ordered and accepted masters are preserved |
| Account cleanup | `POST /api/cron/account-library-cleanup` | Daily, staggered from Upload cleanup | `Authorization: Bearer …` from `UPLOAD_CLEANUP_SECRET` | 100 eligible saved-image records and 100 expired drafts per pass |
| Reminder dispatch | `POST /api/cron/reminder-dispatch` | Every five minutes, only after separate activation | `Authorization: Bearer …` from `REMINDER_WORKER_SECRET` | Existing reminder worker considers at most 50 due occurrences per pass; sending also requires `ACCOUNT_REMINDER_DELIVERY_ACTIVE=true` and configured transport prerequisites |

All routes reject missing or incorrect secrets and return `private, no-store`. A deterministic environment/job/schedule slot record prevents overlapping workers and duplicate successful runs. Each job retains up to 200 run summaries independently. A failed pass may retry in the same slot; stale `running` passes may be reclaimed after 30 minutes, and only the current per-attempt token can finalize a reclaimed run. Cron payloads contain aggregate counts and outcome codes only, never addresses, names, message text, order contents or provider identifiers.

Use authenticated `POST` with `?dryRun=true` to inspect a bounded sample for either cleanup job. The response says `sampled: true`; it is not a whole-store count and changes no assets or records. Upload object orphan sweeps are deliberately deferred until a bounded authoritative reference inventory exists. The daily Upload pass rotates through collection pages, and advances a cursor only after completing that collection page.

## Dashboard and response

Open Admin → Troubleshooting. The Privacy requests & scheduled work panel shows the latest run per worker, a late/failed/unknown signal, reminder activation state, exact pending-due count and oldest due age, plus aggregate uncertain and failed occurrence counts. Queue entries are oldest-open-first with cursor pagination; the panel shows an opaque request id and a short requester UID reference to help an authorized operator locate the account. It does not show profile details or request contents. A reminder worker's `accepted` count means provider acceptance only; it does not prove inbox receipt. `uncertain` work must not be retried blindly. Reminder queue health is measured while delivery is disabled; this is read-only and does not send or claim delivery.

If a job is late or failed, inspect the run state, deployment logs and configured scheduler delivery. Correct the underlying environment/resource issue, then replay the authenticated POST. Slot protection returns `already_running_or_complete` with HTTP 202 when a completed or active pass is encountered. Cleanup is idempotent; failed object deletion leaves the record retryable and its page cursor does not advance.

Do not put raw exception text into the run ledger. To diagnose, correlate the UTC run timestamp with restricted server logs. Never use a cleanup job as a production audit check; dry-run previews use synthetic local storage in tests and production previews only when explicitly called by the scheduler operator.

## Privacy request handling

Customer requests are stored as owner-scoped records and are idempotent when the caller supplies the same `Idempotency-Key`. The customer can view only their own request status. The admin queue exposes type, opaque request ID, short requester UID reference, age, state and assignment, but no profile details or request contents. A verified authorized Google admin can assign a request to themself, move it through `received → manual_review → in_progress`, mark `needs_info`, and mark `completed` from `in_progress`. Completion requires an explicit confirmation and a non-personal internal evidence reference. Every accepted change checks `expectedVersion` and writes a versioned audit event; stale writes return conflict. Legacy manual-review records without `version` are treated as version 1 on read. Completed requests are locked.

The owner-only privacy preview endpoint returns bounded counts for account-scoped records and Upload asset/session records in the active environment, including privacy idempotency and audit metadata categories, plus retained-record notes. It does not export file contents or delete anything. For a real request:

1. Verify the requester using the authenticated account identity and a second appropriate verification step before disclosing or erasing data.
2. Review the private count-only inventory; build any export through a secure, expiring delivery path before telling the requester it is ready. No such delivery path is implied by the request receipt or preview.
3. Pause reminders for the account and confirm consent/occurrence state before any deletion processing.
4. Review accepted orders, payment, supplier, accounting, provider and backup retention separately. Do not erase accepted order artwork or records based only on an account request; resolve retention requirements first.
5. Process only approved account-owned data categories. Record progress per category and preserve a retryable inventory for any partial failure. Do not mark the request completed until the verified action and remaining-retention explanation are recorded.
6. Acknowledge the requester through an approved channel only after a real responder and service target have been assigned. Current UI receipt means only “recorded for review.”

Primary/backup responder names, acknowledgment/escalation target, and a secure expiring export channel remain founder decisions. The dashboard is the internal alert surface; no email or external notification is sent by these changes. No legal deadline is assumed.

## Local synthetic checks

`tests/operational-jobs.test.ts` checks wrong/missing cron credentials, cleanup dry-run behavior, run-slot replay protection, and reminder delivery remaining disabled. `tests/account-privacy-requests.test.ts` checks owner isolation, idempotent submission, authorized assignment/status transitions, audit-safe projection, stale-version conflict and owner-only preview. These tests use temporary mock Firestore storage and do not contact a provider, send mail, or execute fulfillment.

## Index notes for final manifest review

The owner privacy list uses the existing `account_privacy_requests(ownerScope ASC, createdAt DESC)` composite index. Add `operational_job_runs(environment ASC, job ASC, updatedAt DESC)` for per-job health and retention; `account_privacy_requests(status ASC, createdAt ASC)` for oldest-open-first pagination; and `account_reminder_occurrences(state ASC, dueAt ASC)` for pending backlog count and oldest due age. Uncertain and failed state totals use single-field aggregate queries. Confirm the final manifest and deployed index state separately.
