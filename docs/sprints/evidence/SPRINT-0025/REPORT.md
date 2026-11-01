# Sprint 0025 — implementation and release evidence

Status: deployed to staging at `8373cb3` / build `build-2026-11-01-003`; release acceptance remains open. **Not approved for production.**

The founder authorized sprint planning and Luna execution of the approved readiness plan. Three Luna lanes completed account W1–W4, Studio W5, and integration/operations W0/W7/W8; the coordinator integrated shared builder/checkout code, prepared W6 resources and performed independent review. The original dirty checkout remains unchanged except requested planning/evidence documents.

## Implemented

- Email verification send/resend/refresh and public continuation page; safe return paths, hosted Firebase continuation, and StrictMode-safe action processing.
- Shared trusted historical-front resolution and byte-exact private copies of generated art; saved-image/order MIME preservation, owner/grant enforcement, and immutable checkout pinning.
- Import reminders off by default, stable row identities, full-contact duplicate checks, partial results and retry with exact occasion/consent matching.
- Contextual address-book picker, account draft thumbnails, occasion card actions, safe post-acceptance resume, permission-aware Upload entry points and Studio edit/payment reset integration.
- Studio three-version persistence/selection, accepted-master protection, editable prompt, optional empty lettering, starter choices, prompt-conflict guidance, HEIC guidance, mobile preview and edit/cancel round trip.
- Authenticated bounded cleanup, dry-run samples and rotating cursors; per-job operational summaries with lease-token finalization; truthful reminder queue diagnostics while delivery is off.
- Restricted paginated privacy queue with assignment/status/version checks, same-origin protection, legacy-row compatibility, owner status/preview and completion evidence. Export/deletion remains an operator process.
- Payment merge repairs: one confirm projection, central quote validation for confirm/webhook, captured-money evidence retained on holds, free-order replay protection and uncertain supplier outcomes held for reconciliation.

## Review and validation

The coordinator reviewed the 39-conflict merge and repaired duplicated/missing merge fragments. A separate Luna review checked draft acceptance, UID switching, Studio edit/cancel, changed-front checkout reset and private artwork pinning. See ACCOUNT.md, STUDIO.md, OPS.md and INTEGRATION-REVIEW.md for lane evidence.

Local checks use synthetic storage and blocked external transports. Account suite: 13 suites passed. Targeted account/Studio/ops/free-order suites: 11 passed. Production build passed; TypeScript passed. Final payment/recovery and supplemental security results are recorded in checks/results.json when complete. Historical failed logs are retained locally; they are not passing evidence.

No validation created a real payment, billable supplier order, physical mail or reminder email. Apple Pay and real inbox receipt remain unverified.

## Infrastructure prepared

Dedicated production private bucket created with uniform access/public-access prevention and bucket-scoped runtime permissions. Existing staging private bucket retained. Missing project-local secret containers and initial random keys were prepared; existing enabled versions were retained. Runtime and actual App Hosting service identities received scoped secret access. Secret values were never read or recorded during provisioning.

The manifest now has 21 additive indexes (17 account indexes plus four operational queries, including the earlier environment-only health index retained for compatibility). All 21 manifest indexes were verified READY in both projects. Production running application/traffic was not changed by resource preparation.

Production and staging manifests bind separate bucket/key resources; reminder delivery is explicitly false. New cleanup/reminder schedules are planned, not activated. The existing staging upload cleanup job is retained. Production Scheduler API inventory returned 403 and is an unresolved enablement/access prerequisite. No sender address was invented.

## Audit disposition

| Findings | Implementation | Remaining evidence/gate |
| --- | --- | --- |
| I1 private storage/config | Bucket, scoped IAM, secrets and manifests prepared | Runtime fixture; production config rollout; signing-key compatibility |
| I2 indexes | 21 additive manifest indexes requested | Final READY preflight and actual queries |
| I3 branch divergence | Both source histories integrated; review and regressions | Exact candidate staging acceptance |
| I4 jobs | Authenticated bounded workers, health and schedule inventory | Live fixture, job setup/activation and operators |
| C1 verification | Send/resend/refresh and continuation implemented | Legitimate signup/link/refresh in staging |
| C2 generated history | Trusted resolution, exact bytes and immutable pins | Live signed-in four-front-type review |
| C3 imports | Explicit opt-in and retry-safe partial results | Signed-in import review |
| C4 draft resume | Resume inferred only after front acceptance | Signed-in cross-device and identity review |
| C5 privacy | Restricted queue/status/evidence and runbook | Zeke owns manual requests; disposable export/deletion rehearsal |
| U1–U6 Studio | Version tray, guidance, lettering, edit, HEIC and preview implemented | Signed-in responsive/keyboard and source-lifetime review |
| A1–A4 account UX | Picker, gated CTA, thumbnails and occasion action implemented | Signed-in device review |

All 19 findings are mapped. “Implemented” does not mean the external acceptance gate is closed. The sprint ledger remains active. See RELEASE-GATES.md for concrete production, reminder, migration and rollback requirements.

## Signed-in feedback and release decision

The founder signed in and reported a client exception opening an empty Card history. The history list route returned a double-wrapped pagination envelope; the page expected an array. The follow-up flattens that response, validates client list shape into recoverable errors, and adds an endpoint-to-consumer regression for empty/populated/paged history. It also fixes overview upcoming dates beyond the first 50 saved occasions. All 14 account suites, TypeScript and production build pass after the fix. The fix is deployed; exact evidence is in STAGING-REPORT.md. Founder retest after refreshing remains pending.

Founder decision: keep manual privacy requests for this release. Zeke is the initial operator; no backup is assigned. Settings already explains that requesting deletion does not immediately delete the account. The suggested privacy@sendmynotes.com mailbox has not been verified/configured; notifications are currently the restricted admin dashboard. No automated erasure is claimed.
