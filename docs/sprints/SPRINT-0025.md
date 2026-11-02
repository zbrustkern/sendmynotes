# SPRINT-0025 — Production readiness and account completion

Status: active · November 1, 2026 · Founder authorized planning and Luna execution.

## Pyramid Index
- L0: Integrate current production fixes with accounts/Studio and close the 19 readiness findings with evidence.
- L1: W0 preserves payment/recovery invariants; W1–W5 complete identity, account and Studio flows; W6–W8 make storage, jobs and privacy operable; W9 proves the release candidate and rollback boundaries.
- L2: Execution lanes and frozen ownership; Work packages W0–W9; Finding-to-work map; Release gates and risk controls.

## Overview
Two native Luna drafts and reciprocal critiques informed this sprint. User-requested Luna overrides the skills’ Claude/Astra default CLI lanes; coordinator model remains inherit. The approved readiness plan settles product scope, so execution proceeds without a repeated interview or approval pause. No chapter or semantic index is configured. Source authority: `docs/PRODUCTION_READINESS_PLAN_2026-11-01.md`, canonical brief/specs and AGENTS.md.

## Use cases
A sender verifies their account, reviews and reuses the exact historical front, imports people with deliberate reminder consent, resumes saved work safely, and edits private Studio versions without losing accepted artwork. An operator sees actionable privacy requests, safe cleanup/worker health and concrete release evidence.

## Objective and release boundary

Integrate the account/Upload staging work with production main, close all 19 audited findings, and produce signed-in staging and rollback evidence for one exact release candidate. Keep the personal-sender SendMyNotes experience, explicit cover acceptance, verified ownership, private Upload grants, 17:22 fronts, and immutable order artwork. Reminder opt-in stays off by default and delivery stays disabled through the first application rollout. Production promotion and any real reminder delivery remain separate founder decisions.

The implementation baseline is production main `a298a19`; account review code is `.delivery/runs/20261101-account/checkout` at `d3066e0` (deployed staging `00852e7`, build `build-2026-11-01-001`). Preserve the dirty original checkout. Recalculate the 39-conflict rehearsal against the exact selected heads. Do not copy staging secrets or project values. Do not run fulfillment, send real customer email, create a billable order, or contact providers as an audit check. Synthetic/fake-provider tests and controlled staging fixtures only.

Canonical project and product specs govern product claims. Baseline remains zero independent conversions; the one paid order was the founder test; Apple Pay remains untested. Materials/costs remain unresolved. Never present hypotheses as measured results.

## Execution lanes and frozen ownership

1. **Luna integration/operations (`luna_account_shell`)** first resolves W0's 39 unmerged files and preserves production recovery plus staging account/Upload contracts. Stage resolved paths, coordinator commits/reviews. After W0, own W7/W8: cron endpoints, cleanup/reminder operational reporting, privacy service/admin queue, related tests and runbooks. Do not edit general account pages or Studio.
2. **Luna account (`luna_plan_a`)** owns W1–W4 account/auth/history/import implementation: `contexts/AuthContext.tsx` (verify actual path), auth modal/account shell, account pages and account API/services, `components/ContactImportModal.tsx`, and contextual picker component. Exclude privacy service/admin queue (integration lane), Studio, and any still-unmerged shared file. Own one `lib/account/order-front.ts` server resolver (actor + owned order → descriptor/bytes or typed unavailable); history, media and image reuse must consume it. Request coordinator handoff for shared builder/checkout changes. No competing edits to shared contracts; propose additive shape to coordinator first.
3. **Luna Studio (`luna_plan_b`)** owns W5: `components/upload/**`, Studio-specific private endpoints/helpers, version metadata, file guidance and tests. Own narrow Upload-design persistence contract; coordinate order-master changes with account lane. Do not edit shared builder until coordinator handoff.
4. **Coordinator** owns final sprint/ledger/evidence, W6 final environment/index/resource manifests and safe tooling, shared builder/draft acceptance/roundtrip integration after W0, shared contracts, final cross-review, build/typecheck and W9 staging/release packet. No simultaneous builds or shared `.next` writers. Integration lane may propose manifest changes but coordinator alone applies them.

Stages: finish W0 and freeze contracts while account/Studio work starts only in non-conflict files; integrate all lanes; finalize query/config inventory; prepare/provision reviewed isolated staging resources; verify additive indexes READY; deploy exact candidate; signed-in acceptance; production preflight/release decision. Production application rollout and real email/reminder delivery remain separate authorization gates. Authorized resource preparation is not permission to enable mail or fulfillment.

## Work packages

### W0 — Merge the production baseline

Start an isolated release branch from refreshed production main and merge the staging account line by behavior, not whole-file replacement. Reconcile custom-art recovery/public-origin redirect changes (PRs #1–#3), account/draft identity and library handoffs, payment confirmation and supplier dispatch, Stripe webhook/free-order idempotency, admin troubleshooting, attribution/consent/recovery telemetry, and environment separation. Preserve main’s current draft-resume and private-upload recovery behavior. Record both input SHAs, recalculated conflicts, decisions per conflict group, and any already-ported behavior. Keep the original dirty checkout untouched.

**Acceptance:** source heads are ancestors of the candidate; zero conflict markers; merge-resolution map is reviewable; account, custom artwork recovery, payment/webhook/idempotency and telemetry regressions pass; typecheck and production build pass. No fake auth bypass is used as hosted evidence.

### W1 — Complete email verification (Lane 1; coordinator auth-context handoff)

Add verification send/retry and an unverified account state to registration and account flows. Distinguish account creation from mail delivery failure, provide cooldown and clear expired/rate-limited outcomes, preserve draft/source/save intent, and allow only an allowlisted same-origin return destination. After verification, reload Firebase user and force-refresh ID token while keeping the UID; server checks remain authoritative. Verified Google sign-in is unchanged. Verification never enables reminders by implication; Upload remains invitation-grant gated.

**Acceptance:** new/existing unverified, verified password and Google, send failure/cooldown, expired link, second device/tab, stale token, UID continuity, sign-out/account switching, and return-path rejection tests. Verify with a controlled staging inbox; no real customer email.

### W2 — Resolve owned historical fronts safely (Lane 1)

Consolidate history projection, media serving, and make-similar on one server-side order-front resolver. It returns the same original bytes for presets, trusted generated fronts, private Upload masters, and immutable saved order copies. Bind private objects to the owned order and grant checks. If legacy URL reads are unavoidable, use exact host/bucket/path allowlists, no cross-host redirects, byte/MIME/time bounds, and private no-store responses; never add a general URL proxy. Persist immutable object references for new generated orders. Migrate legacy bytes only when owner and provenance are provable; show unavailable state when they are not. Do not silently substitute art.

**Acceptance:** same-byte history/reuse tests for each supported source, ownerless legacy email fallback only where allowed, explicit UID authority, foreign order, missing/deleted object, expired/revoked Upload grant, malicious URL/redirect, retry idempotency, and no accidental checkout/payment/fulfillment.

### W3 — Honor import selection and consent (Lane 1)

Default reminder consent unchecked. Carry the selected rows and explicit per-row reminder request through modal, account page, and API using one request contract. Consent is for date reminders only, not marketing or contact outreach. Record consent source/time; omitted, unchecked, and migrated rows remain disabled. Keep partial import truth: identify person/date failures and allow safe row retry without duplicate people/dates. Duplicate detection must scan beyond the first page, and possible duplicates require a user decision. Fix nested occasion failure reporting and do not claim full success when only the contact was saved.

**Acceptance:** default-off, explicit-on, omitted/invalid row, duplicate after first 50, partial occasion failure, repeated batch key, retry after interruption, contact-only import, and date-consent provenance tests. No reminder is sent.

### W4 — Finish account and builder handoffs (Lane 1; coordinator owns builder)

- Put the owner-scoped recipient picker beside the actual envelope recipient form; retain accessible search, pagination, keyboard use, missing-address guidance, replace confirmation, and fresh server ownership checks. Reuse existing picker logic rather than adding a second account model.
- Draft resume uses an explicit, versioned progress hint but validates every restored field. Resume at note when only safe identity/artwork data exists; resume at envelope only when note is complete; a fully populated draft still reviews envelope before payment. Re-resolve owned front/hash/grant, require current explicit front acceptance, and clear quote, discount, payment, schedule and stale acceptance state. Never auto-submit checkout.
- Show private authenticated draft thumbnails and validated preset thumbnails in 17:22 geometry; handle missing/revoked media and revoke temporary browser URLs. Persist no blob URL or private key.
- Gate the saved-image primary action on `/api/upload/access` (`allowed`, pause/reason/expiry); show distinct verification, expired grant, and unavailable states. Do not invent an access-request workflow.
- Add “Start a card” from an occasion using `/new?accountContact=…&accountOccasion=…`, validate owner and date server-side, retain replacement confirmation, and sort “upcoming” across the full eligible set by computed next occurrence. Label creation-ordered data “Saved dates” if it is not a true upcoming sort. Handle year crossover, missing address, deleted person, and pagination.

**Acceptance:** empty/populated/error/paginated account views; cross-user and stale-session requests; phone/desktop picker at envelope; draft save/resume across refresh and device with invalid/revoked art, conflicts and changed address; no stale acceptance/payment; date route owner checks and full-set upcoming ordering. No creation sends an order.

### W5 — Complete Studio review and edit loop (Lane 2)

Support up to three successful versions for the active owner/source session, with composition, prompt, exact lettering and acceptance metadata. Version selection is local and consumes no generation request; failed generation never erases successful versions or the ordered master. Provide accessible Original/Result comparison and clear selected/pending/failed/stale states. Begin exact lettering blank; starter chips fill only after a tap. Preserve Unicode, punctuation and line breaks; require explicit conflict resolution for likely text instructions in prompt; never silently rewrite. Editing lettering invalidates acceptance; prompt changes make output stale. Return to Studio from the active cover tile, carrying note/addresses and clearing checkout state if front changes; immutable order art stays immutable. Explain JPEG/PNG/WebP restrictions for HEIC/HEIF without adding conversion work. On mobile, show a compact preview before/while editing with safe-area/keyboard and zoom support.

**Acceptance:** first/second/third/fourth version, failed attempt, refresh and account switch; no extra generation on selection; blank and Unicode lettering; prompt/lettering disagreement; explicit replacement; Studio→builder→Studio roundtrip; expired source and revoked grant; invalidated quote/acceptance; 17:22 output; HEIC guidance retains current work. Browser checks at 320/390/768/1024px, keyboard-only, 200% zoom, and a real iPhone photo selection. No image generation/provider action in audit tests.

### W6 — Prepare isolated production resources and final indexes (Lane 3, coordinator release owner)

Create a production/staging resource manifest and idempotent preflight that validates project identity, dedicated private bucket, uniform bucket access/public access prevention, scoped runtime IAM, model/provider config, admin allowlist, secrets, rules, and required indexes. Keep `UPLOAD_PRIVATE_BUCKET` as a config value; use production-only cleanup/admin/reminder secrets. Never copy staging credentials. Set `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false`. Do not invent sender or secret names; bind only verified configuration. Reconcile index requirements against final queries and merged `firestore.indexes.json`, deploy additively, preserve unrelated live indexes/rules, and confirm every required index is READY. Check environment separation for Stripe, fulfillment, Ads and Firebase.

**Acceptance:** wrong-project/missing-binding/public-bucket/missing-index preflight failures; disposable private put/read/delete and cross-owner/public denials; representative compound queries; no secret output; rollback inventory captures prior revision/config. Production provisioning is prepared and reviewed only as authorized by the parent execution directive; this sprint plan itself is not proof of live state.

### W7 — Operate cleanup and optional reminders safely (Lane 3)

Configure authenticated bounded jobs: `/api/cron/upload-cleanup` daily; `/api/cron/account-library-cleanup` daily, staggered; `/api/cron/reminder-dispatch` every five minutes only after its separate activation gate. Preserve durable saved and ordered art; clean only expired temporary objects, failed saves, eligible tombstones and expired drafts per policy. Worker must make fair progress past paused/unverified/unconfirmed recipients, maintain stable occurrence IDs, recheck current consent/verified email/confirmed timezone immediately before dispatch, handle leases and uncertain provider results without blind resend, honor unsubscribe, accepted-order suppression and annual recurrence. Use fake injected transports for all unit/e2e tests. Add privacy-safe summaries/alerts for missed runs, backlog age, failures, uncertain states and cleanup outcomes, with named responder and recovery runbook.

**Acceptance:** wrong/missing scheduler auth rejected; retries/overlap safe; cleanup preserves saved/order objects; skipped rows do not starve eligible rows; consent off by default; time-zone/DST/leap/late/pause/delete/edit/order suppression/unsubscribe behavior; lost provider response never blindly duplicates. Jobs are observable in staging. Delivery remains disabled; before a separately authorized activation, controlled opted-in inbox must prove receipt/link/unsubscribe and no overdue backlog sends.

### W8 — Make privacy requests operational (Lane 3)

Build restricted request queue with idempotent submissions, request owner/type/age/assignment, conflict-safe status transitions, and audit trail for received/manual review/in progress/completed/needs information. Assign primary and backup responder, decide acknowledgment/escalation target with founder, and ensure reliable retryable alert/dashboard without PII in notification payload. Document requester verification, data inventory, reminder pause, secure expiring export, retained order/provider/backups exceptions, deletion confirmation, and partial-failure retry. Receipt is not completion; only a verified operator action can mark erasure complete.

**Acceptance:** synthetic submission→alert→assignment→status/overdue path; notification failure visible/retryable; unauthorized operator denied; duplicate request idempotent; export and deletion dry-run on disposable fixture including mid-process failure/retry. No actual personal-data request or deletion.

### W9 — Signed-in staging acceptance and release decision (Coordinator + independent reviewer)

Deploy exact integrated candidate to staging, record SHA/build/config and run controlled two-account signed-in flows. Matrix covers identity (new/existing unverified, verified Google/password, stale token, two UIDs, sign-out race), history (preset/generated/upload/saved front, missing/revoked/malicious source, same bytes through reuse), account/import (pagination, duplicate/partial consent, dates, drafts, conflict and cross-device), Studio version/lettering/file/mobile/roundtrip, operations auth/cleanup/replay/uncertainty/privacy, existing guest/custom/upload/payment/webhook/saved-card recovery using test doubles or test mode, and responsive/accessibility checks with synthetic screenshots. Apple Pay is expressly untested unless a real device validation is completed and documented.

**Acceptance:** account tests, main recovery and payment regressions, targeted lane tests, typecheck and production build pass on the same source SHA; real staging sign-in/storage/query isolation is separate from mocked tests; no browser auth bypass; no billable fulfillment. Release packet contains all 19 finding dispositions/evidence, merge decisions, final index/preflight results, owner/schedule/runbook, migration compatibility, browser matrix, exact candidate, and rollback rehearsal. Obtain specific founder authorization for production promotion only after the packet is reviewable. The initial app rollout keeps Upload grants restricted and reminder delivery false; reminder activation requires its own authorization and W7 evidence.

## Finding-to-work map

| Finding | Closure package |
| --- | --- |
| I1 production storage/config | W6 |
| I2 production indexes | W6, W9 |
| I3 main/staging divergence | W0 |
| I4 background jobs | W7 |
| C1 email verification | W1 |
| C2 generated-art history/reuse | W2 |
| C3 import reminder consent/partial results | W3 |
| C4 safe draft resume | W4 |
| C5 privacy request monitoring/operations | W8 |
| U1 three-version tray/comparison | W5 |
| U2 prompt/lettering conflict guidance | W5 |
| U3 starter chips/empty default | W5 |
| U4 Studio edit roundtrip | W5 |
| U5 HEIC guidance | W5 |
| U6 mobile preview | W5 |
| A1 contextual envelope recipient picker | W4 |
| A2 Upload CTA permission gate | W4 |
| A3 draft thumbnails | W4 |
| A4 occasion start-card/full upcoming sort | W4 |

## Release gates and risk controls

A release cannot be reported “production ready” on code or hosted shell checks alone. Close each finding with named evidence or a founder-approved deferral. Staging authentication, private object isolation, query/index readiness and signed-in device review are required. Production bucket/secrets/IAM/indexes/jobs require an explicit live-state preflight and operator ownership; no staging secret/value reuse. Keep optional reminder sending off through application rollout. Separate production rollout authorization from reminder activation authorization. Rollback preserves additive indexes and account records, disables incompatible legacy array writers, pauses reminders/Studio intake first, and never deletes new data to restore an old revision.

## Architecture and accepted critique refinements

- Studio session metadata is owner/source scoped, server validated, and bounded to three successful versions. Refresh restores only still-valid private sources/generations/designs. Cancel retains the prior accepted front; selecting a changed front invalidates acceptance/payment. Account changes revoke previews and discard stale async responses. Ordered/accepted durable masters are independent of temporary version cleanup; a flattened saved front never implies editable layers.
- W6 separates plain bucket/model/admin-email values from secret references. Record exact project, runtime identity, indexes, private bucket policy and safe config booleans. `ACCOUNT_REMINDER_DELIVERY_ACTIVE=false` is explicit. Unavailable API evidence is not absence. Never copy staging secret values into production.
- W7 all jobs use authenticated POST, bounded retries, privacy-safe run summaries and alerts. Dry-run/disposable fixture proof precedes real cleanup; valid unused library images and ordered masters are excluded. GET unsubscribe does not mutate. Provider acceptance is separate from confirmed inbox receipt; activation cannot send expired backlog.
- W8 uses the restricted internal dashboard as the notification channel initially, with visible overdue/failed state. Actual responder names and service target remain founder decisions. No guessed legal deadlines or unverified deletion-complete claims.
- W9 rehearses a compatibility/read-only rollback against new per-record people/date/draft/image fixtures and blocks legacy array overwrites. After separately authorized production rollout: health, sign-in, safe storage fixture and cross-UID denial, index queries and monitoring must pass before wider access. Apple Pay remains unverified until device evidence exists.

## Files summary and dependencies
Named ownership above is authoritative. Both source ancestors must survive integration. Shared builder/draft/checkout files are W0-owned until handoff; payment and recovery guards retain synthetic regression coverage. Cloud IAM, actual sign-in/inbox/device access and operator assignment are external acceptance dependencies, not grounds to claim local code incomplete or production complete. No runtime/provider credentials belong in evidence.

## Definition of done
All W0–W9 acceptance above is evidenced for the exact candidate or explicitly listed open; all 19 findings have dispositions. Required implementation may not be silently deferred. Guarded local regression suites, typecheck and build pass; signed-in staging and real device/inbox/production gates remain distinct. The ledger stays active until required acceptance is fulfilled.

## Risks, mitigation and open decisions
Main/staging divergence is resolved by behavior and independent review. Private art uses owner checks and durable immutable masters. New records survive rollback. User-visible notification and device acceptance require legitimate controlled accounts, never auth bypass. Production rollout, optional actual email activation, operator ownership and any remaining supplier facts require explicit evidence/decisions before those dependent actions.
