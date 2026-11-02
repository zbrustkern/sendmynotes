# Account and Upload Studio production readiness plan

November 1, 2026 · Proposed implementation and release plan · Production remains blocked

Complete the account and Upload Studio gaps on a release branch that includes the current production fixes, validate the combined experience on staging, and prepare production infrastructure before promoting application code. Treat optional reminder delivery as a separate activation gate: saving dates must never imply that email is operational.

This plan addresses all 19 findings in the [readiness audit](PRODUCTION_READINESS_AUDIT_2026-11-01.md). It preserves personal senders, SendMyNotes branding, personal return identity, the 17:22 card front, explicit artwork acceptance, and private invited Upload access. The [canonical brief](CANONICAL_PROJECT_BRIEF.md), [product specifications](CANONICAL_PRODUCT_SPECS.md), [account design](proposals/2026-11-01-account/DESIGN_SPEC.md), and [Upload Studio design](proposals/2026-10-30-upload-card-front/DESIGN_SPEC.md) govern conflicting recommendations.

This request authorizes review and planning. No implementation, production provisioning, scheduler activation, email sending, payment, or fulfillment is performed by this plan.

## Verified baseline and audit corrections

The implementation reviewed is the account checkout at `.delivery/runs/20261101-account/checkout`, commit `d3066e0`; deployed staging is `00852e7`, build `build-2026-11-01-001`. Refreshed `origin/main` is `a298a19`. Source references below refer to that review checkout, because the original working checkout is older and contains unrelated local changes.

Read-only production inspection at **21:31 UTC on November 1** confirmed that the eight configuration names listed in the audit are absent from the serving revision and all 17 indexes in the current manifest are missing. The project bucket inventory returned no buckets. Cloud Scheduler queries returned an API-disabled/not-previously-used error; this does not prove the absence of every possible external scheduler. Preserve these distinctions in release reporting. See [production facts](evidence/production-readiness-2026-11-01/production-facts.json).

A disposable merge rehearsal found **39 conflicted files**, rather than the audit's 38. Main and staging have 16 and 35 unique commits respectively, with merge base `b831eb0`. Unique commit counts do not establish which changes were already ported semantically. PRs #1–#3 are not ancestors of staging and must be explicitly reconciled. See [conflict inventory](evidence/production-readiness-2026-11-01/merge-rehearsal.json).

The remaining corrections change how the work should be done:

- Missing storage configuration produces controlled unavailable responses on storage operations. It does not mean every account page crashes. Unverified accounts can use some account features; the missing verification flow blocks verification-gated actions, not all sign-in.
- Staging sets `UPLOAD_PRIVATE_BUCKET` as a plain configuration value, not the bucket secret named in the audit. Its secret IDs are `upload-cleanup-secret` and `admin-session-signing-key`, scoped to the staging project. It does not currently bind a reminder worker secret or sender address. Do not copy imagined names or staging credentials into production.
- The 17-index manifest covers `account_people`, `account_occasions`, `account_images`, `account_drafts`, `account_privacy_requests`, `account_reminder_occurrences`, and `orders`. It has no `account_events` or `upload_jobs` indexes. Derive requirements from final queries and the merged manifest, not the audit's illustrative query.
- The import mismatch is real, but the existing modal is `components/ContactImportModal.tsx`. It starts checked and passes per-row `remindMe`; the account page drops that field and the API forces reminders off. Fix the entire consent path and default it off.
- Historical generated fronts are incorrectly hidden by the history projection/media path. However, `saveHistoricalOrderFront` already has a trusted-image reader for non-upload orders. Consolidate that capability instead of adding a general URL proxy.
- Step 1 already has an active private-cover tile. The missing behavior is a reliable Studio edit round trip, not proof that every back navigation erases the selection.
- Saved library images are retained until removed. Cleanup must reclaim expired temporary objects, failed saves and tombstones, plus expired account drafts; it must not delete valid saved images merely because they are unused or “unpinned.”
- HEIC is explicitly outside the approved initial Upload scope. Add useful conversion guidance now. Native/client conversion is a separate dependency decision; the audit's “over 70%” audience claim is not established by project evidence.
- Use the existing `/new?accountContact=…&accountOccasion=…` handoff. Do not introduce the audit's unsupported `/create?personId=…` route. Thumbnail geometry remains 17:22.

## Finding coverage

P0 means release-blocking engineering or operational work. P1 means required completion of the agreed sender experience before this release is accepted. Work package numbers identify the detailed tasks below.

| ID | Audit finding | Disposition | Priority and package |
| --- | --- | --- | --- |
| I1 | Production storage and configuration | Confirmed absent; provision isolated resources and explicit bindings | P0 · W6 |
| I2 | Production composite indexes | All 17 current requirements missing; reconcile merged query set and deploy additively | P0 · W6 |
| I3 | Main and staging divergence | Confirmed; 39 conflicts in rehearsal, including checkout and payment code | P0 · W0 |
| I4 | Background jobs | Production Scheduler API unavailable; configure all three jobs, with reminder activation gated | P0 · W7 |
| C1 | Email verification | Missing verification send/resend/refresh journey | P0 · W1 |
| C2 | Generated artwork history and reuse | Confirmed history/media restriction; reuse reader partly exists | P0 · W2 |
| C3 | Import reminder checkbox ignored | Confirmed across modal, account adapter and API; default-on also conflicts with consent policy | P0 · W3 |
| C4 | Draft resume starts at card | Confirmed intentional safety reset; add a safe progress-aware resume | P1 · W4 |
| C5 | Unmonitored privacy requests | Queue exists; operational triage and fulfillment missing | P0 · W8 |
| U1 | Three-version tray and original comparison | Missing session history and comparison controls | P1 · W5 |
| U2 | Prompt and lettering conflict guidance | Missing; resolve ambiguous text requests explicitly | P1 · W5 |
| U3 | Starter lettering chips | Missing; also remove unsolicited prefilled “Thank You” | P1 · W5 |
| U4 | Return to Studio from builder | Active tile exists, edit handoff missing | P1 · W5 |
| U5 | HEIC guidance | Format restriction is intentional; error guidance needs improvement | P1 · W5 |
| U6 | Mobile preview placement | Preview follows the controls; improve visibility while editing | P1 · W5 |
| A1 | Address book placement in envelope step | Picker exists in the outer toolbar; add contextual access | P1 · W4 |
| A2 | Upload action shown without a grant | Confirmed; render against the server capability | P1 · W4 |
| A3 | Draft artwork thumbnails | Missing | P1 · W4 |
| A4 | Start card from overview occasion | Missing; also avoid mislabeling recent saved dates as the nearest upcoming dates | P1 · W4 |

Every row needs implementation evidence or an explicit founder-approved deferral before release acceptance. Changing a label or moving an item to a later batch does not close it.

## Delivery sequence and responsibilities

Use three bounded delivery batches. These are planning boundaries, not newly dispatched agents or started sprints.

| Batch | Work | Dependency and exit condition |
| --- | --- | --- |
| 1 · Establish the release baseline | W0, then W1–W3; W6 infrastructure manifest and W8 workflow design can proceed alongside | Combined branch preserves production recovery/payment behavior; verification, history and import regression tests pass |
| 2 · Complete the sender and operator flows | W4, W5, W8 implementation; W6 staging parity and W7 controlled operational tests | Signed-in staging acceptance matrix passes; all audit findings have concrete evidence |
| 3 · Prepare and release production | W6 production provisioning, W7 production job setup, W9 release review | Exact candidate and rollback are reviewed; production rollout explicitly authorized; optional email activated only after its own evidence passes |

One integration owner owns checkout, draft contracts, branch resolution and the release manifest. An account engineer owns W1–W4; a Studio engineer owns W5; an operations engineer owns W6–W8; an independent reviewer owns W9 acceptance. Roles may be combined, but ownership must be assigned when execution starts. Avoid concurrent edits to the main builder, auth context or shared contracts without an explicit handoff.

Do not estimate completion from file counts. Size Batch 1 after conflict resolution; implementation, browser acceptance and provider/IAM verification are separate pieces of work.

## W0 Integrate the production baseline

**Owner:** integration engineer. **Depends on:** nothing. **Blocks:** all feature integration and release validation.

Create `codex/production-readiness` in an isolated checkout from refreshed `origin/main`, then merge the current staging feature line without replacing whole files with one side. Preserve the dirty original checkout. Record both source hashes and recalculate the conflict inventory when execution begins.

Resolve the following as behavior groups: custom artwork persistence/recovery and public-origin redirects from PRs #1–#3; draft identity and account-library handoffs; asynchronous payment confirmation and supplier dispatch; Stripe webhook/free-order idempotency; admin troubleshooting; attribution/consent and accepted recovery telemetry; environment separation. Compare semantically ported changes to avoid duplicate instrumentation or reintroducing old behavior.

**Acceptance:** both selected source heads are ancestors of the release candidate, no conflict markers remain, and the main recovery tests pass alongside `npm run test:account`, relevant payment-mode/idempotency, telemetry and sender-validation suites. Inspect each test's side effects before adding it to the guarded runner; do not substitute a blind `npm test` or fulfillment script. TypeScript and production build must pass on the merged source. Verify custom artwork survives refresh, saved-card recovery and account transitions with no fallback to unrelated catalog art.

**Deliverable:** merge-resolution notes mapping each behavioral conflict to its resolution and regression evidence. Deploy the merged candidate to staging before drawing conclusions from the current 18 signed-out smoke checks.

## W1 Complete email verification

**Owner:** account engineer. **Files:** `context/AuthContext.tsx`, `components/AuthModal.tsx`, `components/account/AccountShell.tsx`, verification-gated actions and Firebase action-link configuration.

Send a verification email after successful email/password registration. Distinguish “account created” from “verification email sent”; if sending fails, preserve the account and offer retry. Provide an unverified banner with Send/resend verification, “I've verified my email,” sign-out/account switching, a cooldown and understandable expired-link/rate-limit errors. Use an allowlisted same-origin return path so verification returns to the saved image or draft flow without accepting arbitrary redirect destinations.

Reload the Firebase user and force-refresh the ID token after verification; update auth consumers even if the UID is unchanged. Keep note, source-image and save intent intact while identity verification happens. Readiness must be rechecked by the server; refreshing a banner alone does not unlock an endpoint. Verified Google sign-in keeps its normal path. Upload still requires a separate invitation grant.

**Acceptance:** new password account, existing unverified account, verified account, Google sign-in, failed email send, cooldown, expired link, verification on a second tab/device and stale ID token all have deterministic outcomes. Verify a controlled test inbox and return URL on staging before production. Unverified users retain the account functions permitted by policy and get specific guidance for blocked actions. Do not automatically opt them into occasion reminders.

## W2 Restore generated artwork in history and reuse

**Owner:** account engineer with integration review. **Files:** `lib/account/history.ts`, `lib/account/images.ts`, `app/api/account/history/[orderId]/media/route.ts`, history detail UI and order artwork persistence.

Introduce one server-side order-front resolver shared by history projection, private media and make-similar. It supports preset assets, immutable private order masters and legacy generated artwork only from explicitly trusted storage locations tied to the owned order. Keep the existing UID authority and verified-email fallback for ownerless legacy orders.

Prefer storage object reads using trusted bucket/object references. If legacy URLs must be fetched, validate exact host, bucket and path; reject arbitrary URLs, credentials, unsupported schemes and redirects outside the allowlist; enforce time, byte and MIME limits. Do not solve this with a broad Firebase-domain redirect that leaks private bearer URLs. Keep responses private/no-store and preserve upload provenance and grant checks.

For new generated-artwork orders, persist a durable immutable front reference so history does not depend on an ephemeral cache URL. Define a bounded, idempotent migration for old orders only where ownership/provenance and the original bytes can be proved. Missing/deleted artwork gets honest unavailable copy; never regenerate a substitute and call it the original.

**Acceptance:** presets, old generated URLs, new generated masters, uploaded masters, deleted objects, foreign orders and revoked upload grants are covered. History and make-similar use the same artwork bytes. Double-click/retry does not duplicate saved items or drafts. Copying a front does not create checkout, payment or fulfillment, and never silently copies an old address into a new order.

## W3 Make import consent and partial results truthful

**Owner:** account engineer. **Files:** `components/ContactImportModal.tsx`, `app/account/people/page.tsx`, `app/api/account/people/import/route.ts`, occasion scheduling.

Default the reminder option to **off**. Explicitly carry the selected rows and affirmative reminder choice through the modal, adapter and API using one documented request shape. Explain that this choice applies only to imported dates, not marketing email. Store consent source/time with the resulting occasions. Leave migrations, omitted flags and unchecked imports off; late reminders remain a separate choice.

If delivery, verification or time-zone confirmation is incomplete, show the saved consent and the unmet requirement separately. Do not report that an email is scheduled or enabled merely because a checkbox was selected. Imported contacts without dates get no reminder record.

Fix adjacent import integrity issues before adding consent: retain one batch idempotency key across retry; reconcile duplicates beyond the first 50 contacts; return per-row person/date outcomes, including invalid occasions. The current nested occasion catch can report a created person while silently dropping the date. Retrying must finish that date without duplicating the person or treating an idempotent retry as an unrelated duplicate.

**Acceptance:** selected/unselected rows, checked/unchecked/default choice, birthdays and anniversaries, malformed dates, duplicate people beyond page one, partial failures, retries and interrupted imports all produce accurate counts and recoverable row results. No import or migration triggers unsolicited email. Clock-controlled tests confirm normal and separately consented late reminders.

## W4 Complete account navigation and draft continuation

**Owner:** account engineer. **Depends on:** W1–W3 contracts and W2 media resolver.

1. **Recipient picker:** put “Choose from address book” beside the recipient name/address inputs in the envelope step. Reuse the existing picker/controller. Support keyboard focus, search/pagination, missing-address contacts and loading/error states. Confirm replacement of an edited recipient, preserve the note/front, and revalidate the selected address. An incomplete address must remain visibly incomplete.
2. **Draft continuation:** persist or derive a versioned progress hint without trusting it as permission to skip validation. Resolve the owned front/hash/grant first; present a compact fresh front-review/acceptance checkpoint. After explicit acceptance, continue at note if incomplete or envelope if the note is complete. A fully populated draft still reviews envelope details before payment. Expired/revoked/missing art returns to a clear front-recovery state. Always reset quote, discount, payment identifiers, scheduling and old acceptance; restoring a draft never initializes checkout automatically.
3. **Draft thumbnails:** use owner-authenticated media for private images and validated paths for presets, with a 17:22 thumbnail, accessible label, loading/failure placeholder and revoked object-URL cleanup. Never persist a blob URL or private storage key. Cover account switching and deleted assets.
4. **Upload capability:** use the existing `/api/upload/access` result (`allowed`, pause/reason/expiry), rather than inventing `canUpload`. Show “Upload an image” only when allowed. Explain verification, expired grant and service failure distinctly. Preserve the approved private preview: no automatic invitation request, public promotion or broadened grant. A request-access CTA requires an actual implemented support workflow before display.
5. **Occasion action:** add “Start a card” using `/new?accountContact=…&accountOccasion=…`, with server ownership validation and the existing replacement confirmation. Show the person's name from an authoritative contact lookup. If the section says “Upcoming,” sort by computed next occurrence across the full eligible collection, not the first creation-ordered page. Otherwise retain “Saved dates.” Cover year crossover, missing addresses and deleted contacts; never submit a card automatically.

**Acceptance:** complete each path on phone and desktop with empty, populated, partial and error states. A resumed complete draft avoids unnecessary re-entry while preserving all purchase and artwork checks. Contextual address selection works at the actual envelope form, and the no-grant library state never advertises an unavailable primary action.

## W5 Finish Upload Studio review and editing

**Owner:** Studio engineer. **Depends on:** W0 and coordinated builder handoff changes in W4.

- Keep up to three successful versions per active owner/source session. Store version IDs plus prompt, lettering, treatment, composition and acceptance metadata; use private preview requests. Switching a version makes no generation request. Failed attempts preserve successful versions. Define oldest-version eviction and preserve any current accepted/ordered master independently. Refresh restores the tray; signing out/account switching clears visible private results.
- Add accessible Original/Result controls. Render the original without pretending it is the final crop; the result retains 17:22 geometry. Show selected, pending, failed and expired states. Do not silently replace the selected successful front when an asynchronous generation finishes.
- Start exact lettering blank; starter chips fill it only on tap. Include Thank You, Happy Birthday, Thinking of You, Congratulations and You're Wonderful. Preserve punctuation, case, accents and intentional line breaks. Replacing existing text requires a deliberate action. Blank produces artwork only.
- Detect likely text requests in the visual prompt and propose exact lettering for confirmation. If prompt and exact words disagree, require resolution before generation. A keyword match is a helper, not proof of intent: “a person writing a letter” must remain usable. Never silently rewrite the sender's words. Editing lettering invalidates acceptance and recomposes the preview; editing the visual prompt marks the result stale until regeneration or explicit discard.
- Add “Edit this front in Studio” to the active upload tile or Change front choice. Restore the verified design's source, generation, exact words and treatment. Carry the current note/addresses through the round trip, and invalidate acceptance/quote/payment state if the front changes. Handle expired temporary sources with a saved-source recovery or clear explanation. Immutable order fronts remain immutable; a flattened saved front is not proof that editable source layers still exist.
- Detect unsupported HEIC/HEIF before submission and retain the current work. Explain that this version accepts JPEG, PNG or WebP and how to export/convert an existing photo. Changing Camera settings affects future captures, not the selected photo. Keep server MIME/magic-byte and image limits. Do not add a conversion dependency without separate quality, orientation, metadata and memory checks.
- Move the mobile preview before long controls and provide a compact expandable sticky preview while editing. Preserve the 17:22 front, clearly distinguish provisional and authoritative output, and keep controls visible above the software keyboard and safe area. At 320 px or high zoom, allow collapse rather than covering the form. Phone preview visibility is a usability target to test, not a mandated 160 px size.

**Acceptance:** selecting previous versions consumes no quota; an unsuccessful fourth request does not erase earlier results; edits never reuse stale acceptance. Verify Unicode lettering, long text, unsupported files, source replacement, expired/revoked grants, refresh, account switching and the complete Studio → note → edit Studio → note round trip. Test at 320/390/768/1024 widths, keyboard-only and 200% zoom, including a real iPhone photo selection and keyboard interaction.

## W6 Prepare production resources and configuration

**Owner:** operations engineer. **Depends on:** W0 final query/configuration inventory. **Provisioning occurs during execution, not this planning pass.**

Create an explicit staging/production resource manifest and an idempotent preflight that fails on wrong project, wrong bucket, missing secrets, wrong runtime IAM, missing index, public object access or accidental production review flags. Confirm the active production backend identity before granting access.

| Configuration | Production treatment |
| --- | --- |
| `UPLOAD_PRIVATE_BUCKET` | Dedicated production bucket value; uniform bucket-level access and public-access prevention; no public object grants; runtime object and bucket-metadata permissions scoped to that bucket |
| `UPLOAD_IMAGE_MODEL` | Explicit model ID verified for the production provider project; test through controlled fixtures before opening grants |
| `UPLOAD_ADMIN_EMAILS` | Founder-confirmed administrator allowlist; preserve existing admin authentication and server checks |
| `UPLOAD_CLEANUP_SECRET` | Production-only secret, runtime binding and controlled scheduler bearer header; rotate with an overlap procedure |
| `ADMIN_SESSION_SIGNING_KEY` | Inventory existing production admin behavior, then use a production-specific secret; plan any session invalidation rather than copying the staging key |
| `ACCOUNT_REMINDER_DELIVERY_ACTIVE` | Explicit `false` through deployment and review; only change after W7 delivery acceptance |
| `REMINDER_WORKER_SECRET` | Production-only secret and authenticated dispatcher invocation; never reuse cleanup/admin credentials |
| `REMINDER_FROM_EMAIL` and existing `RESEND_API_KEY` | Verified sending identity and correctly scoped runtime binding; no placeholder sender or assumed deliverability |

Bucket names/model IDs/admin emails are configuration, not inherently secrets. Secrets belong in Secret Manager; do not print bearer headers into job inspection output or check credentials into Git.

Deploy the merged index manifest additively, preserving unrelated live indexes. Match collection group as well as field order and query scope; the earlier list API returned other collection groups too. Verify every required index is READY before account traffic. The current 17 are a baseline; new admin/upcoming-date queries may add requirements. Compare client Firestore rules and IAM before deployment; do not broadly replace live rules with an unreviewed manifest.

**Acceptance:** configuration preflight, runtime private upload/library put-read-delete on disposable fixtures, denied cross-account/public access, and actual representative compound queries succeed in the target environment. New infrastructure must not alter existing Stripe, fulfillment, ads or Firebase authentication configuration. Preserve the prior revision/configuration inventory for rollback.

## W7 Operate retention and optional reminders

**Owner:** operations engineer plus account engineer. **Depends on:** W3, W6 and staging tests.

Configure **all three** authenticated POST jobs. Proposed schedules below are operational defaults to validate against observed job duration/backlog; they are not promises to customers.

| Endpoint | Proposed cadence | Required behavior |
| --- | --- | --- |
| `/api/cron/upload-cleanup` | Daily | Delete only expired temporary Studio objects according to the existing policy; preserve ordered masters and durable library copies |
| `/api/cron/account-library-cleanup` | Daily, staggered | Reclaim failed/pending saves and deleted-object tombstones; expire account drafts after the disclosed 90 days; retain valid saved images until removed |
| `/api/cron/reminder-dispatch` | Every 5 minutes after activation | Process bounded due work with stable occurrence IDs, current consent/email/time-zone checks and no duplicate or blind uncertain retries |

Enable Scheduler API in the intended project, create restricted operator access, configure authenticated bearer headers via protected tooling, and set bounded retries/deadlines. Verify a missing/wrong token is rejected. Before enabling cleanup against customer data, run a dry-run/report mode or a staging harness with clearly disposable fixtures and prove the retention boundaries. No blanket object-prefix deletion.

Add operation summaries and alerts for missed runs, oldest pending job age, cleanup failures, dispatcher failures and uncertain delivery. Monitor whether fixed batch sizes can drain expected volume; verify progress through skipped/ineligible rows. Name a responder and provide retry/reconciliation instructions that do not expose message text or recipient addresses.

Keep reminder delivery off until a controlled, opted-in inbox proves provider acceptance, receipt, correct start-card link and unsubscribe behavior. Exercise default-off/import consent, verified email changes, confirmed time zone, DST/leap dates, late choice, account pause, deletion/edit races, exact-order suppression, annual continuation and 48-hour catch-up. GET must not unsubscribe; POST must cancel applicable future work. Test lost provider responses and restart recovery without duplicate sends. Do not run an overdue-email backlog on activation; apply the documented grace window and show expired occurrences as missed.

**Acceptance:** scheduled invocations succeed with observable summaries; replay/overlap is safe; saved and ordered fixtures survive cleanup; privacy-safe failure alerts reach the assigned operator. Core account review may continue while delivery is disabled, but the reminder finding remains open until its activation gate passes.

## W8 Give privacy requests an operational owner

**Owner:** operations engineer with account engineer. **Depends on:** W0; complete before production account launch.

Add a restricted admin queue with request ID, owner reference, type, age, assigned operator and status. Support received/manual-review/in-progress/completed/needs-information outcomes with an audit trail and conflict-safe updates. Make retries of the same submission idempotent so repeated clicks do not create several unresolved requests.

Assign a primary responder and backup. Choose an internal acknowledgment target and escalation age with the founder; establish applicable response obligations separately before publishing a deadline. Add a reliable notification or monitored dashboard alert with retries, delivery status and an overdue view. Alerts contain an opaque request ID and secure admin link, not a customer's note, artwork, postal address or export payload. The planning request does not authorize sending a notification now.

Define the actual export/deletion runbook: verify the requester, inventory contacts/dates/images/drafts/preferences/order references/provider copies, pause reminders, distinguish retained order records from removable personal data, track backups/retention exceptions, and provide a secure expiring export handoff. Request receipt must never be labeled completed erasure. Keep irreversible deletion as an explicit operator action with the required confirmation.

**Acceptance:** a synthetic request appears in the queue, reaches the operator, can be assigned/escalated, and has accurate customer-visible status. Notification failure leaves a visible retryable item. Only authorized operators can view or update it. Rehearse export and deletion on disposable fixtures, including failure halfway through and safe retry.

## W9 Validate and authorize the production release

**Owner:** independent reviewer and release owner. **Depends on:** W0–W8 evidence.

The current 18 hosted checks prove page shells, signed-out API rejection and a disabled worker. They do not prove signed-in customer workflows. Replace that gap with the following acceptance matrix on the exact merged candidate deployed to staging:

| Area | Required cases |
| --- | --- |
| Identity | Guest, new password account, existing unverified account, verified Google/password account, two different UIDs, stale token, sign-out during a request |
| Artwork | Preset, legacy generated order, new generated master, upload source/front, missing media, revoked grant, expired source, same bytes through history and reuse |
| Account | Empty/populated/error/paginated states, contact with two dates and no address, duplicate/partial import, consent off/on, draft conflict and cross-device restore |
| Studio | Three versions, failed generation, exact lettering conflict, blank lettering, file restrictions, mobile editing, builder edit round trip |
| Operations | Wrong scheduler auth, cleanup preservation, replay/overlap, provider uncertainty, reminder pause/unsubscribe and a monitored privacy request |
| Existing sending flow | Guest/catalog/custom/upload flows; price/discount changes, saved-card recovery, payment confirmation/webhook idempotency and truthful order status using test doubles or test mode |
| Presentation | 320/390/768/1024 widths, keyboard and focus return, visible error/status messages, screen-reader names, zoom and phone keyboard; synthetic data in saved screenshots |

Run `npm run test:account`, the integrated recovery regressions from main, the new targeted suites, TypeScript and a production build. Exercise real staging identity/storage/query behavior with two controlled accounts. Do not use unsigned tokens, auth bypasses or a browser-policy workaround as hosted evidence. Keep mocked tests clearly separate from real sign-in evidence. No billable fulfillment script is an audit check. Apple Pay remains an explicit device-validation gap until actually exercised; do not turn a Stripe test into an Apple Pay claim.

### Release decision

The release packet must contain the exact candidate hash, all 19 dispositions, test and browser evidence, production preflight/index results, operator ownership, schedules/retention policy, migration behavior and a tested rollback route. Address every P0 and agreed P1 item; obtain a specific founder decision for any remaining scope deferral. Request production rollout authorization only when this packet is concrete and ready to review.

After authorization, promote the reviewed candidate through the established production release process. Keep Upload grants limited and reminder delivery false for the first application rollout. Validate production health, real sign-in, safe read/write fixtures and private storage isolation before broadening exposure. Activate reminder delivery separately only after W7 passes and its controlled send is authorized. Do not copy `STAGING_REVIEW_ONLY=true`, test Stripe keys or `HANDWRYTTEN_TEST_MODE=true` into production, or loosen them in staging.

Rollback immediately for cross-account exposure, incorrect artwork/recipient association, payment regression, sustained account query failures or duplicate reminder behavior. Pause reminders and new Studio work first. Reverting to the current production revision may not be safe after new per-record account writes: test the compatibility bridge/read-only fallback, preserve all new records and objects, and disable incompatible legacy array writers. Keep additive indexes and data; do not roll back by deleting customer records. Record who can restore traffic and how the prior runtime configuration is recovered.

## Completion checklist

- [ ] W0 merged release branch preserves production fixes and passes combined regressions.
- [ ] W1 verification can be sent, retried, completed and reflected in refreshed authorization.
- [ ] W2 original generated artwork is visible and reusable without widening media access.
- [ ] W3 explicit import consent, duplicate handling and partial retries are correct.
- [ ] W4 contextual recipient selection, safe draft continuation, thumbnails, capability states and date actions pass.
- [ ] W5 all six Studio gaps pass real mobile and state-transition review.
- [ ] W6 production resources, bindings, IAM and the final index set pass preflight.
- [ ] W7 all three jobs and monitoring work; reminder activation has separate controlled evidence.
- [ ] W8 privacy requests have a tested operator workflow, notification and fulfillment runbook.
- [ ] W9 signed-in staging acceptance, rollback rehearsal and release packet are complete.
- [ ] Founder authorizes the concrete production rollout; post-rollout checks are recorded.

The next implementation step is **W0 integration**, followed by **W1 verification, W2 history artwork and W3 import correctness**. Production promotion remains blocked until the release decision above is satisfied.
