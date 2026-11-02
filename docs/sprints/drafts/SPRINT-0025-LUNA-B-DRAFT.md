# Sprint 0025 — Production readiness and sender continuity

## Objective

Integrate the staging account and private Upload Studio work with current production fixes, close all 19 readiness findings, and prove the exact merged candidate on staging. Prepare production infrastructure and operator runbooks with explicit preflight and rollback evidence. Keep production application rollout and reminder email activation as separate decisions.

Read [the canonical project brief](../../CANONICAL_PROJECT_BRIEF.md), [canonical product specifications](../../CANONICAL_PRODUCT_SPECS.md), [the full readiness plan](../../PRODUCTION_READINESS_PLAN_2026-11-01.md), and the Account and Upload Studio design specs as authority. Preserve SendMyNotes sender identity, guest sending, 17:22 cover geometry, personal return identity, explicit art acceptance, UID ownership, Upload grants, immutable ordered artwork, and reminders off by default. Do not treat a code feature as production-ready without operational evidence.

## Baseline observations

- The review checkout is staging branch `codex/account-experience` at `d3066e0`; deployed staging was `00852e7`. Execution clone begins at production main `a298a19`. Preserve the dirty original checkout.
- Main contains custom-art recovery in `app/preview/entry/client.tsx` and its related recovery path, but has no account history implementation. W0 must merge behavior, not replace files.
- Staging has private Upload access and preview routes. `components/upload/UploadStudio.tsx` has one `generationId`, defaults exact lettering to “Thank You,” and carries a selected design to `/new?uploadDesign=...`. The builder can resolve and validate that design, but Studio does not provide a durable version tray or an edit round trip that restores source, prompt, exact words and treatment.
- Staging’s import route hardcodes reminder consent off, while `components/account/ContactImportModal.tsx` owns the user choice; duplicate detection reads only the first 50 people and per-row occasion errors can be swallowed.
- History projection recognizes private upload masters and preset paths, but not trusted generated artwork. History media currently has no generated-art resolver. The existing `saveHistoricalOrderFront` path can be reused; do not create a general URL proxy.
- The audit’s asserted production configuration, indexes and scheduler state are superseded by the corrected evidence in the readiness plan. Provision from actual merged requirements and live preflight results, not illustrative names or stale counts.

## Finding map and ownership

| Finding | Work | Lane |
| --- | --- | --- |
| I1 production storage/configuration | W6 resource manifest, isolation, IAM, secrets and preflight | Operations |
| I2 production indexes | Reconcile final queries, deploy additively, verify READY | Operations |
| I3 branch divergence | Merge main fixes into release branch; conflict notes and regressions | Coordinator |
| I4 background jobs | Configure upload cleanup, library cleanup and reminder dispatch; reminder activation separately gated | Operations |
| C1 verification journey | W1 send/resend/refresh, safe return, refreshed token and clear errors | Identity & history |
| C2 generated history/reuse | W2 shared owner-safe original-art resolver and durable new masters | Identity & history |
| C3 import consent/partial retries | W3 off-by-default consent, idempotent imports and row-level outcomes | Identity & history |
| C4 draft continuation | W4 safe progress-aware restore and fresh front/checkout checks | Account & Studio |
| C5 privacy queue operations | W8 monitored restricted queue, responder and export/deletion runbook | Operations |
| U1 three-version comparison | W5 bounded successful-version tray and Original/Result controls | Account & Studio |
| U2 prompt/lettering conflict | W5 intent-preserving helper and explicit conflict resolution | Account & Studio |
| U3 starter lettering | W5 blank initial field; chips only populate on selection | Account & Studio |
| U4 Studio re-edit | W5 recoverable Studio handoff and safe builder round trip | Account & Studio |
| U5 HEIC guidance | W5 detect and explain supported formats and conversion options | Account & Studio |
| U6 mobile preview | W5 compact, expandable preview, keyboard and zoom validation | Account & Studio |
| A1 contextual recipient picker | W4 picker beside envelope fields, preserving other draft fields | Account & Studio |
| A2 Upload grant state | W4 render actual `/api/upload/access` capability and expiry/pause errors | Account & Studio |
| A3 private draft thumbnails | W4 owner-authenticated previews, 17:22 ratio, safe URL lifetime | Account & Studio |
| A4 occasion start action | W4 existing `/new?accountContact=…&accountOccasion=…` handoff and true next-date ordering | Account & Studio |

All 19 findings need evidence or an explicit founder-approved deferral. “Implemented” alone does not close infrastructure, monitoring, activation or release gates.

## Execution lanes and file boundaries

Only the coordinator owns shared builder/auth contracts, branch integration, final candidate and W9. Lane owners use narrow APIs and request additive changes through the coordinator. No agent edits another lane’s listed files without an explicit handoff.

**Coordinator — W0 and W9; shared contracts/integration.** Create the release branch from refreshed main in the execution clone; merge staging without replacing whole files. Recompute conflicts and reconcile PRs #1–#3, custom-art recovery, account ownership and drafts, payment confirmation/webhooks, supplier dispatch, admin repair, attribution/consent and environment separation. Own `app/preview/entry/client.tsx`, `context/AuthContext.tsx`, shared account/draft/upload contracts, checkout/payment handoff, branch merge, integration harness and release packet. Deliver behavioral resolution notes and retain the original checkout untouched.

**Lane 1 — Identity, history artwork and import correctness (W1–W3).** Own `components/AuthModal.tsx`, account auth/verification UI and verification API/config integration; `lib/account/history.ts`, `lib/account/images.ts` only by coordinated seam, history-media route/UI, generated-order artwork persistence, and `components/ContactImportModal.tsx`, account people/import route and related occasion service. Keep owner UID authoritative; email fallback applies only to ownerless legacy orders. Share one trusted resolver across history, media and make-similar. Preserve upload provenance, grant checks, idempotency and no address carry-over. Import retries retain one key; duplicates are reconciled beyond page one; each row reports contact and occasion outcomes independently. Reminder opt-in defaults off and stores consent provenance, but does not imply email delivery.

**Lane 2 — Account navigation, drafts and Upload Studio (W4–W5).** Own account overview/people/dates/drafts/images pages and components, Studio component/styles and upload-specific services/contracts. Coordinate builder changes with the coordinator; do not edit the shared builder. Implement address picker at the real envelope fields, verified owned occasion/contact query handoff, truthful access capability, safe draft resume and private thumbnails. Studio needs a deliberate edit contract: preserve the current note, addresses and selected source through navigation; restore the same source asset, generation, prompt, exact words, treatment and design version; fetch private previews after auth; and require fresh acceptance when output changes. Expired temporary sources should offer a saved-source path only when one exists, otherwise explain recovery is unavailable. A flattened library/order front can be reused but cannot claim editable layers. Returning to the builder must cancel safely without dropping the current selection or writing payment/checkout state.

**Lane 3 — Resources, schedulers and privacy operations (W6–W8).** Own `apphosting.yaml` / staging counterpart as needed, `firestore.indexes.json`, operational manifest/preflight, scheduler configuration scripts/docs, cleanup/reminder routes and worker settings, privacy request admin UI/API, alerts and runbooks. Derive bucket/model/secret/IAM needs from the merged code and target project. Keep reminder delivery explicitly false. Production resources are isolated; secrets are production-specific, stored in Secret Manager and never printed. Deploy indexes additively after confirming query scope. Operate all three authenticated POST jobs with bounded retries, observable runs and idempotent cleanup. Never delete valid saved library images due to lack of use. Privacy alerts contain only opaque ID plus protected link, and deletion/export requires operator verification and explicit final action.

**Cross-lane integration order:** coordinator completes W0 baseline and contracts; Lane 1 stabilizes verification/history/import seams; Lane 2 consumes those seams for resume and similar-card/account flows; Lane 3 uses the final query/config inventory after W0 and tests against merged staging. Lanes can work in parallel only on disjoint owned files. Coordinator resolves shared builder, auth and checkout conflicts. No production deployment is part of lane completion.

## Work packages and acceptance

### W0 — Merge-safe production baseline

Start from refreshed `origin/main`, merge the staging line, record both heads and ancestry, and regenerate the conflict inventory. Resolve behavior groups instead of taking a whole-file side. Preserve custom art recovery, saved custom art across refresh/account transitions, payment confirmation and idempotency, existing admin support, attribution/consent, environment separation and account private ownership. Keep test mode and staging-only flags out of production.

**Accept:** both heads are ancestors of the release candidate; no conflict markers; resolution notes map every behavior to a test. Targeted main recovery, account, payment/idempotency, telemetry and sender-validation suites, TypeScript and production build pass. No fulfillment script is run.

### W1 — Email verification

Registration must distinguish account creation from verification-email delivery. Add retry/cooldown, verified refresh, force-refreshed token, sign-out/account switch, expired link and send failure states. Return through an allowlisted same-origin path to the interrupted image/draft action. Server endpoints remain authority; refresh UI alone cannot unlock features. Google sign-in keeps its normal verified path; Upload still requires invitation.

**Accept:** new/existing unverified, verified password/Google, second-tab verification, stale token and failed/cooldown sends behave predictably on staging; note/art intent survives verification. No reminder consent is inferred.

### W2 — Generated history and reuse

Resolve preset fronts, immutable private order masters and legacy generated artwork only from proven trusted storage references and owned orders. Bound legacy reads by host/bucket/path, redirects, timeout, MIME and bytes; prefer object reads. New generated orders persist durable immutable front references. Migration of old artwork is bounded and idempotent only when bytes and provenance are provable. Missing artwork is honestly unavailable; never substitute new art for the historical front. Same original bytes feed media and make-similar; old recipient/address/payment are not copied.

**Accept:** presets, legacy and new generated fronts, upload masters, deleted/missing media, foreign ownership, revoked grants and repeat-key behavior are covered. No broad proxy, payment, order or fulfillment side effect.

### W3 — Consent and recoverable imports

Default reminder choice off and pass explicit per-import consent through modal, adapter and API. Record source/time; imported dates without consent stay off. Retain one idempotency key for retries, reconcile duplicates beyond the first 50, report row-level contact/date success and failure, and allow a retry to finish a missing date without duplicating its person. Invalid date must not be described as imported.

**Accept:** checked/unchecked/default, birthday/anniversary, malformed date, duplicates, partial failures, interruption and retries produce truthful counts; no import sends email.

### W4 — Account navigation and drafts

Put address book choice at recipient name/address input and use the existing picker. Confirm replacement of edits; preserve note/front and validate incomplete addresses. Resume owned draft at a safe next step: freshly resolve art/hash/grant, require a fresh front-review checkpoint, then go to note or envelope based on validated content. Complete drafts review envelope; reset acceptance, quote, discounts, payment IDs and scheduling. Expired/revoked art returns to recovery. Draft thumbnails use authenticated media or approved presets, 17:22 ratio and accessible labels; revoke object URLs and clear on UID switch. Only show Upload CTA when access endpoint says allowed; explain pause, expired, verification and service errors. “Start a card” uses `/new?accountContact=…&accountOccasion=…`, validates owned contact and occasion on server, and orders by next computed occurrence across eligible dates, not creation page.

**Accept:** empty/full/partial/error/paginated states, two dates, missing address, deleted contact, account switch, private deleted image, draft version conflict and completed draft all recover safely. No automatic checkout.

### W5 — Studio review and re-edit continuity

Keep at most three **successful** versions per active owner/source session, including version ID, prompt, exact text, treatment, composition and acceptance. Switching versions costs no generation and does not overwrite the active selection; failed fourth attempts preserve prior successful versions. Refresh restores private tray; sign-out/UID change clears visible previews. Evict oldest unselected version; accepted/ordered masters remain durable independently.

Add accessible Original/Result switching; original is explicitly uncropped/source, result is authoritative 17:22 only after acceptance. Exact lettering starts blank; starter chips populate only on click. Preserve Unicode, case, punctuation and line breaks. Prompt text hints suggest Exact Lettering but do not rewrite; conflicting instructions require sender resolution; ordinary prompts such as “person writing a letter” remain valid. Editing text clears acceptance/recomposes; prompt edits mark prior output stale. Never let async generation silently select a new result.

Builder’s active custom tile/Change front action offers Edit in Studio or choose another design. Use an explicit, owner-bound session/handoff record or validated IDs to restore source, generation, text, treatment and design; do not serialize private URLs or trust query IDs. Cancel/back preserves current state. On successful return, verify owner/grant and current design, preview privately, carry message and addresses, and invalidate acceptance plus quote/payment state only if front bytes changed. If temporary source expired, guide to saved source if actually present or explain the limitation. A flattened saved front supports reuse but not editable source restoration.

Detect HEIC/HEIF before submission; explain JPEG/PNG/WebP and export/conversion for the selected photo. No conversion dependency in this scope. Mobile preview moves before controls and supports compact expandable/sticky visibility without covering form, safe area, keyboard or 320 px/200% zoom.

**Accept:** version selection causes no generation; failed attempt, refresh, account change, Unicode, conflict intent, blank lettering, stale acceptance, source expiry, revoke and complete Studio → builder → Studio → builder round-trip pass. Review at 320/390/768/1024 widths, keyboard-only, screen reader labels, 200% zoom, actual iPhone photo selection. No production claim from simulation.

### W6 — Production resource/configuration readiness

Create explicit environment resource manifest and idempotent preflight for exact project, private bucket access controls, runtime IAM, secret bindings, final index set and review flags. Use actual config names and actual project inventory. Never copy staging credentials. Preserve payment/auth/fulfillment configuration. Bucket metadata, model ID and admin list are config; use Secret Manager for credentials. Reminder activation is false. Indexes are additive; verify collection group/query scope, READY status and representative reads.

**Accept:** disposable fixture put/read/delete passes in target, cross-UID and public reads are denied; preflight proves exact target; indexes satisfy merged queries; prior config/revision recorded for rollback. Production provisioning execution requires independent review; no customer data or public exposure.

### W7 — Scheduler, cleanup and optional email

Configure authenticated POST jobs for temporary Upload cleanup, account library/draft cleanup and reminder dispatch. Cadences are operational defaults to validate, not sender promises. Bounded work must progress across skipped/tombstone rows. Cleanup removes expired temporary uploads, failed saves, deletion tombstones and expired drafts; valid saved images persist until user removal; ordered masters persist. Add run summaries and alerts for missed runs, oldest pending age, cleanup failure, dispatcher failure and uncertain provider delivery, with owner and recovery steps. Scheduler bearer tokens stay protected; bad/missing tokens fail.

Reminder provider and scheduler remain disabled until separate consent, verified-address, timezone, DST/leap/late-choice, pause/unsubscribe, deletion/edit race, exact-order suppression, annual continuation, 48-hour catch-up, uncertain response and dedupe tests pass. GET never unsubscribes; POST cancels. Do not deliver overdue backlog; expired occurrence is missed. Activation requires a controlled opted-in inbox, sender identity, receipt/link/unsubscribe proof and explicit authorization.

**Accept:** replay/overlap safe, cleanup preserves valid/ordered fixtures, monitoring reaches assigned operator. Core account can pass with reminders disabled; reminder finding stays open until activation evidence.

### W8 — Privacy request operations

Build restricted admin queue with request ID, verified owner reference, type, age, assignee, conflict-safe states, audit log and idempotent intake. Alert with opaque ID and secure admin link only. Add retry/delivery status, overdue view, primary/backup operators and founder-approved internal acknowledgment target. Define requester verification and export/deletion runbook covering contacts, dates, images, drafts, preferences, orders, provider copies, reminders, backups and legal retention. Receipt is not erasure completion; destructive deletion requires explicit operator confirmation.

**Accept:** synthetic request reaches restricted queue/operator, assignment/escalation and truthful status work; alert failure is visible/retryable. Export/deletion rehearsal on disposable data safely resumes after partial failure. Do not email or expose live customer data during audit.

### W9 — Staging proof and release decision

Independent reviewer tests exact merged candidate deployed to staging, using real controlled sign-in and two UIDs plus synthetic data. Matrix covers: guest/password/unverified/verified/Google/stale token/sign-out race; preset/legacy generated/new master/upload/missing/revoked art; account CRUD/pagination/import consent/retry/draft conflict/cross-device; Studio versions/failure/lettering/HEIC/edit round trip/mobile; scheduler wrong-auth/replay/cleanup/provider uncertainty; privacy queue; guest/catalog/custom/upload checkout, price/discount/payment confirmation/webhook idempotency using test doubles/test mode; and visual/a11y at all required widths. Separate mocked tests from hosted identity/storage/query proof. Apple Pay remains unverified until actually tested on device; Stripe evidence does not imply wallet readiness.

**Accept:** targeted suite, `npm run test:account`, integrated recovery regressions, new lane tests, TypeScript and production build pass. Attach signed-in staging matrix, real storage isolation, index/preflight, monitoring and rollback evidence. No billable fulfillment script or real payment/order. Release packet includes exact candidate hash, 19 dispositions, migration/compatibility behavior, operators, schedules/retention, candidate config and tested rollback. Rollback preserves additive indexes and new records/objects; prove compatibility bridge/read-only fallback and disable incompatible legacy writers. Keep Studio grants limited and reminder delivery false for first rollout.

**Release gate:** only after the packet is complete may the founder authorize production rollout. Production health, real sign-in, private-storage isolation and safe fixtures are post-authorization checks. Reminder email activation is a later, independent approval after W7.

## Definition of done

- W0–W9 accepted with traceable evidence; all 19 findings closed or explicitly deferred by founder.
- Clean merge ancestry and testable release candidate; no overwriting of dirty original checkout.
- Studio edit round trip preserves editable source when available and never claims flattened output is editable.
- Operational preflight, index readiness, three scheduler runbooks, privacy responder and rollback are proven.
- Staging acceptance distinguishes fixture, mocked, real integration and still-unverified behavior.
- No production app rollout, live email, payment, provider order or fulfillment audit call without its separate gate.

