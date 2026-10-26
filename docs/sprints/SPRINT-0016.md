# SPRINT-0016: Trustworthy admin reporting without planned downtime

Status: **active — implementation and independent source review complete; staging/production release gates in progress.** Authorized October 26, 2026. See the execution evidence for actual deployed SHAs and acceptance; this plan alone is not deployment proof.

## Pyramid Index

- L0: Make the active admin dashboard accurately distinguish customer purchases, founder testing, observed activity and attribution, using an isolated reporting patch and a reversible managed release.
- L1:
  - Customer truth: reconcile the founder-confirmed one-sale baseline, count verified payments once, and keep tests, comps, refunds and unresolved records visible separately.
  - Honest measurement: remove invented revenue/margin and unsupported conversion rates; show source, time window, coverage and unknown states.
  - Narrow implementation: reuse reviewed staged helpers, add one bounded read-only API, and repair the mounted production UI without importing the admin overhaul.
  - Availability: separate main/staging candidates, preserve checkout and existing records, verify the exact release, and retain a compatible existing-build rollback.
- L2: [Decisions](#decisions-and-scope), [Data contract](#reporting-contract), [Tasks](#implementation-plan), [Acceptance](#definition-of-done-and-validation), [Release](#release-and-uptime-runbook), [Rollback](#abort-and-rollback).

## Overview and evidence

The goal is a dashboard the founder can use to judge the small acquisition experiment without confusing tests with demand or estimates with profit. The intended availability outcome is **no planned downtime**. The plan reduces release risk; it does not promise that application or platform failures are impossible.

Read `AGENTS.md`, [canonical brief](../CANONICAL_PROJECT_BRIEF.md) and [canonical specifications](../CANONICAL_PRODUCT_SPECS.md) first. Preserve those dated decisions. Their October 11 zero-customer baseline is historical: on October 26 the founder confirmed **one external $9 sale**, associated in admin with `smn_first_sale_v1`, and that all other paid orders reviewed so far were founder tests. This is a dated reconciliation anchor, not a hardcoded total or a classification rule for future orders. Actual supplier cost and contribution remain unconfirmed.

Verified source defects on the production branch:

- `CampaignPerformanceWidget` counts `session.completed` as a purchase, adds fixed $9 revenue/$3.56 margin, and adds order records only while a campaign count is zero. It can both misclassify and undercount orders.
- Its session input is a latest-50 slice. The displayed 4.5% and 100% rates are not trustworthy complete-campaign conversion estimates.
- Legacy founder filtering includes email substrings, screen resolution, and paid/mobile exceptions. An ad click or mobile device must never override explicit founder/test evidence.
- Legacy admin totals, unit-economics labels, funnel and some scenario views reuse inferred or modeled values. Correcting only an unmounted/new component would leave contradictory numbers visible.
- The legacy rollup can write a backfill to `system_config` during a read. The new report must bypass that path.

The [SPRINT-0015 release](../../.delivery/runs/20261026-google-attribution/REPORT.md) already delivered verified-payment snapshots, browser Ads/GA4 queue diagnostics and the manual Google Purchase goal. Preserve that behavior. A browser queue observation is not Google's confirmation of attribution; future live Google reporting remains separately pending.

### Baseline and concurrent work

Fresh read-only GitHub refs during planning:

| Environment | Source | Last recorded hosted build | Target |
| --- | --- | --- | --- |
| Production | `0ebfd958c6854623abab177ebeab2754c242f20c` | `build-2026-10-26-001` | Project `sendmynotes-2a417`, backend `sendmynotes`, region `us-central1` |
| Staging | `0a4d08205b8077303fe88fd578ecd0397f94b3ab` | `build-2026-10-26-003` | Project/backend `sendmynotes-staging`, region `us-central1` |

Hosted entries are prior verified release evidence, **not a new cloud inspection**. Refresh them at execution. The original checkout is dirty and older than these refs; preserve it and use isolated candidates. No semantic index or chapter is configured.

SPRINT-0013's international preview and guards are staged; SPRINT-0014's discount/artwork work is planned. The coordinator of **Assess international shipping option** reserves SPRINT-0017/0018 for admin complimentary-order work. This sprint owns reporting only. Do not edit its comp quote/dispatch/payment-request APIs, `StudioCompModal`, adjustment types/tests, or pull that staging-only work into production. Keep report DTOs out of shared `lib/types.ts`. Coordinate narrow `app/admin/page.tsx`/ledger changes and allow one release owner at a time on staging.

**Latest recorded staging checkpoint, October 26 at 4:10 PM America/Chicago:** the [SPRINT-0017/0018 release record](../../.delivery/runs/20261026-admin-comp/REPORT.md) confirms source `cae1525bbba5d15377ee8829ee6b8b76d14ab7da`, `build-2026-10-26-004` READY, rollout SUCCEEDED and 100% serving traffic, with eleven hosted smoke checks passing. Production source/build/payment and stable configuration are recorded unchanged. This supersedes the earlier building status and older staging integration baseline above; it is inspected release evidence, not a fresh cloud check by this planning task. Authenticated hosted admin review and live-provider validation remain outstanding, and positive live admin payment defaults off. Before execution, refresh source/build/traffic, preserve the comp contracts below and select the then-current healthy compatible rollback build. Do not roll back past newly accepted comp records/readers.

## Decisions and scope

1. Add **`GET /api/admin/measurement-report`** with report-specific types and pure aggregation. Preserve the existing `/api/admin/metrics` contract and the separate staged `/api/admin/reporting` API. This avoids API collisions and gives the new report its own failure boundary.
2. Correct the active production dashboard's customer-sales/revenue tiles, campaign table, affected funnel labels and attribution access. Replace unsupported live margin/rates with unavailable states; visibly label retained scenario calculations as assumptions. No general admin redesign.
3. Use a small, audited **reporting-only historical reconciliation record** where old orders lack trustworthy classification/payment evidence. It must never alter an order, payment snapshot, fulfillment state, refund or ad event.
4. Use **order-created cohorts** for this first report, with an explicit America/Chicago date window and a separate report `asOf`. Label financial totals “Captured customer revenue for orders created in this window.” Payment verification can arrive later, so historical cohorts may change. This is not a transaction-period accounting report.
5. Report observed site sessions and milestones as a bounded sample. **Do not calculate customer conversion or abandonment percentages in this release.** Complete, ordered session cohorts can be a later change.
6. Preserve existing checkout, pricing, payment webhooks, fulfillment, advertising/consent behavior, supplier integration, public copy, international availability, DNS, runtime sizing, secret bindings and security policy. Do not add Google API sync, a warehouse, workers, a financial import, or new customer instrumentation.

The existing $150 campaign, Maximize clicks setting, goals and destinations stay unchanged. No historical purchase replay, receipt reopening, synthetic Google conversion, live payment, customer email or physical order is part of validation.

### Prepared work to reuse selectively

| Prepared surface | Decision |
| --- | --- |
| Staged bounded-read sentinel and date/timezone helpers | Extract only useful pure functions after tracing dependencies; give the new report a small separate module so stage-owned helpers are not overwritten. |
| Staged metric status/coverage concepts and fixtures | Reuse the definitions and relevant cases without importing the full overhaul contract or engine. |
| Staged `CampaignPerformanceWidget` | Reuse presentation where helpful. Its purchase aggregation still needs replacement; removing fixed amounts alone did not fix counting. |
| Existing `purchaseMeasurement` and authenticated conversion-queue API | Read as existing evidence; do not change their writer, eligibility policy or delivery queue. |
| Financial ledger, outbox, reconciliation workers, offers, new admin shell, reliability/experiment systems | Defer. They are outside this patch's dependency closure and have independent acceptance work. |

## Use cases

- After record-level reconciliation, the founder sees one independently purchased $9 order at the confirmed historical cutoff, with founder tests shown separately and each purchase traceable to a unique order/payment evidence pair. Until then, the founder-confirmed sale is visibly pending and excluded from verified totals.
- A later eligible customer payment increases the count normally. Revisiting admin, duplicate telemetry or webhook delivery does not increase it again.
- A paid order that fails fulfillment remains a paid order with a separate operational problem. A refund remains distinguishable from an unpaid order or a test.
- A session can reach a screen or report completion without becoming a financial purchase. Missing events do not become invented funnel steps.
- An admin can distinguish campaign information captured by the site, browser-reported delivery, and attribution confirmed externally in Google Ads.
- A failed report request shows unavailable/stale information with its original scope; the storefront and operational admin controls remain usable.

## Reporting contract

### API and bounded reads

Put DTOs in `lib/contracts/admin-measurement-report.ts`, pure reducers/scope normalization in `lib/admin-measurement-report.ts`, and server-only reads in `lib/admin-measurement-source.ts`. Equivalent fewer files are acceptable if browser/server boundaries remain explicit. The route uses the existing server admin-auth guard. No request-supplied project, collection, arbitrary path or environment selection is allowed.

Support the existing meaningful controls: Today, Last 7 calendar days including today, Since October 13, All available, and custom dates; channel allowlist; Customer reporting / All operational records. Fix timezone to **America/Chicago**, displayed in the UI. Normalize local calendar dates to UTC half-open boundaries `[start, end)` with DST-aware conversion; never use server-local midnight or a fixed UTC offset. Echo normalized scope and a `scopeKey` in the response. Invalid/ambiguous dates, reversed ranges and unknown filter values return `400` before reads. Label All available with actual coverage, not an invented lifetime guarantee.

Default hard budgets: at most **2,001 order documents** (2,000 plus an overflow sentinel), **501 telemetry documents** (500 plus sentinel), and **101 reconciliation entries** (100 plus sentinel), one bounded pass each, no per-order provider calls and no unbounded pagination. Freeze `asOf` once per request. For this small dataset, a document-ID ordered bounded order census avoids silently omitting records with missing `createdAt`; filter by valid creation time in the reducer and surface undated records separately. Telemetry may use an existing supported timestamp query; absence of an index must produce unavailable activity, not an unbounded scan or infrastructure change. Revisit limits only as a separately reviewed change.

Source overflow or failure has independent coverage consequences: incomplete orders suppress complete order/revenue totals; incomplete historical classification suppresses affected eligibility; a capped telemetry sample does not invalidate an otherwise complete order total. Return structured partial/unavailable status, source count/cap, reason and `asOf`; no silent truncation. Use `503` for an essential-source failure with a small non-PII error code. Auth failure is `401`. A legitimate complete empty result is zero; unavailable is `null`, never zero.

The new path performs no writes, backfills, lazy migrations, external API calls or provider imports. Do not call `getAdminDashboardMetrics`/`getTelemetrySummary`. Check the existing `isFirestoreMock` signal and trusted runtime project: a hosted production report must fail unavailable on mock fallback or project mismatch, never present disk fixtures as live records. Explicitly injected local/staging fixtures must identify themselves as synthetic. Use explicit field projection where supported so notes, addresses, email, receipt tokens and image URLs do not enter the reducer. Return aggregates and authorized order identifiers needed for existing drilldown, not raw click IDs or customer content. Set private/no-store caching. Use one in-flight UI request; cancel/ignore stale responses, an 8-second client deadline and a bounded server deadline without automatic retry loops. A timeout must not start extra background queries or an unbounded fan-out.

### Payment evidence, identity and deduplication

Keep these axes separate:

| Axis | Values / rule |
| --- | --- |
| Payment evidence | Verified positive captured USD amount bound to the order, missing, or conflicting. Browser events and fulfillment status never establish capture. |
| Commercial classification | Independent customer, founder/test, comp/free, admin-origin/adjusted, or unresolved. Explicit reliable exclusion evidence wins over campaign/device guesses. |
| Refund/dispute evidence | Known observations with source/time, or unknown. Do not infer “no refund” from a missing field. |
| Attribution | Recorded campaign/source/click-identifier presence, client-reported queue state, and external Ads verification are distinct. |

For newer orders validate existing server-created `purchaseMeasurement` version, transaction/order binding, positive integer cents, USD and compatible order/payment identity. Reuse its supported evidence, not its `eligible` boolean as a universal accounting definition: Ads eligibility and gross captured revenue differ for known refunded purchases. An ordinary eligible live snapshot supports inclusion absent explicit founder/test/comp/admin-origin evidence. Contradictory sources are shown in exceptions and excluded from independent-customer totals until reconciled. Do not guess identity from an email substring, screen resolution, campaign, or mobile device.

Verify and preserve the SPRINT-0017/0018 contracts at the updated staging source: new full and partial admin orders carry `origin: ADMIN_COMP`; positive live captures are classified `admin_comp_balance`, and full zero comps remain `studio_comp`. Either explicit admin origin or those commercial kinds excludes the record from independent-customer totals even when payment is positive or the record has Google attribution. Show paid admin balances separately in All operational records when payment evidence supports them. Recognize these optional fields through report-local types/adapters without changing shared order types or importing the financial ledger. Existing public redacted receipts preserve admin origin to suppress browser Purchase; this sprint must not remove or bypass that behavior. These contracts need source confirmation at T01, not speculative production activation.

Deduplicate by stable order ID **and** PaymentIntent identity. Repeated identical observations count once; one payment bound to multiple orders, mismatched amount/currency, or conflicting snapshots must not silently merge into a sale. Historical unknowns stay separate. Count all distinct eligible orders in a campaign; remove the existing “only add when purchases is zero” logic. Never substitute $9 for a missing amount.

Gross captured customer revenue is the sum of verified captures for eligible independent orders in the order-created cohort. Known refunds/disputes are shown separately; the original gross capture is not rewritten. Do not label gross revenue as net receipts or profit. Net amounts are unavailable unless refund coverage supports them. Supplier cost, processor fees, ad spend, CAC and contribution remain unavailable here unless independently sourced; the present fixed $3.56/39.6% must disappear from live-results presentation.

Keep `createdAt`, measurement `verifiedAt`, any independently observed provider capture time, and evidence-inspection time separate. Never rename verification time to capture time. An undated order belongs in an exception bucket; it cannot be assigned to Today. Transaction-period revenue and refund accounting are deferred.

### Historical reconciliation and its only allowed write

Do this evidence work before deciding the historical sale is unresolvable. Identify the exact order and payment behind the founder-confirmed campaign sale, and enumerate other paid records at the **fixed review cutoff**. Use existing retained order records plus an authorized read-only Stripe inspection as needed; do not invoke sync/repair/retry endpoints that can dispatch mail. The cutoff must be the reviewed snapshot time, recorded with timezone, not the date implementation happens.

Prepare two separate parts in a private manifest:

- **Identity decision:** exact environment/order/payment IDs, customer/founder/comp/admin/unresolved classification, founder confirmation/source reference, actor, time, revision and superseded revision if corrected.
- **Evidence observation:** references to existing payment evidence and a minimal verified observation of live mode, positive amount/currency/binding and observed refund/dispute state. A copied provider observation must be identified as an inspection snapshot with source/time, never an original transaction, new capture or `purchaseMeasurement`. Unknown refund status need not invalidate known gross capture.

Use a small operator command such as `scripts/reconcile-admin-measurement.ts`, **dry-run by default**, with explicit project, exact reviewed manifest hash and expected prior revision for apply. The hash must bind the environment, cutoff timestamp/timezone, exact reviewed order/payment set, evidence observations and identity decisions. It must have no payment/fulfillment/Ads imports. Do not introduce a public/general-purpose admin mutation UI just for this handful of records. Apply only reporting metadata to an existing verified-private server-controlled namespace, using immutable revisions and compare-and-set/idempotent writes. Read permissions must be checked from actual deployed rules: this repository does not contain `firestore.rules`, so privacy cannot be assumed. If no suitable private namespace exists, report the concrete gate before adding infrastructure or changing rules.

Inspect the proposed before/after reconciliation before apply. Never enumerate “everything except this order” at write time, backfill purchase snapshots, change `isFounderTest` on operational orders, mark an entire campaign as founder, or use the bulk unflag action. Repeat apply is a no-op. A correction appends a superseding record and preserves prior evidence; it cannot convert a known comp/test payment into a customer capture. Stage uses synthetic manifests only; never copy real customer records or personal information into staging fixtures.

Default absence of a sidecar is normal for newer eligible snapshots; failure/truncation of the sidecar source is a coverage error. If evidence cannot bind the historical sale, show “Founder-confirmed sale; payment reconciliation pending” separately from verified totals and document what is missing. The historical reconciliation acceptance item then remains incomplete; do not claim the one-sale fix is finished or manufacture proof to pass it.

### Sessions, campaigns and active UI

Use sampled telemetry only for **observed sessions** and **observed events**, deduplicated within the loaded source. Show the event cap and actual session count. Keep step views distinct from explicit completion events; default note text, `highestStep`, and later payment cannot prove earlier interaction. Hide conversion/drop-off percentages and “high-intent abandoner” conclusions that rely on those inferences. Full ordered-funnel reconstruction and new ingestion are deferred.

Group campaigns by normalized source/medium/campaign identity, preserving the raw label for display. Session rows and order rows use one mapping function. Recognize Google paid identifiers, email, organic, social, referral and unknown consistently; a campaign string alone is not proof of paid traffic. Preserve order attribution without retroactively assigning a purchase from the latest session. Contradictory attribution appears as a diagnostic. Orders without a matching observed session keep their purchase/revenue and show no invented visitor.

Wire the new response into the mounted `/admin` customer totals and campaign table. Use existing authorized order drilldown for payment/queue detail. Preserve operational order lists and their actions. Audit active top-level unit-economics/margin, funnel, scenario and valuation summaries: either wire corrected values, hide unsupported measured values, or prominently label an existing calculator as an assumption-based scenario. Do not leave adjacent old 100%/4.5%/39.6% values looking like validated customer performance.

Replace the current-baseline notice with a dated reconciliation status and dynamic verified totals. Preserve historical documents and mark the old review as history. Tag-ID badges say configured, not healthy/accepted. The diagnostic row should answer: payment evidence; customer classification; campaign recorded; click-ID presence; Ads/GA4 browser state with time; **Google attribution: check in Google Ads / not verified here**. Do not add a green success state for merely queuing or invoking `gtag`.

Show loading, complete-zero, partial, unavailable and stale states. A stale result retains its original scope/time and cannot appear under new filters. No fallback to old guessed metrics when the new API fails. Changing scope aborts/invalidates older requests. Preserve keyboard access and narrow-screen readability.

## Implementation plan

One writer per shared file/worktree. Use isolated `codex/admin-measurement-production` and `codex/admin-measurement-staging` candidates, or suitable existing managed worktrees after checking ownership. Coordinator owns integration, active page wiring, ledger and releases. Independent review must inspect actual source/diffs, not just author reports.

| Task | Work and owner | Depends on | Exit evidence |
| --- | --- | --- | --- |
| T01 Baseline/coordination | Coordinator: fresh refs/hosted state/active owners, mounted-call map, branch deploy policy, supported rollback target, current runtime/payment/Ads fingerprints. Pin allowed files and update stale assumptions. | — | Sanitized baseline manifest; no use of dirty root for release. |
| T02 Reconciliation | Reporting Luna: exact historical order/payment audit; private dry-run classification/evidence manifest; verify server namespace privacy and writer safety. | T01 | Traceable baseline; unresolved evidence explicitly listed; no live writes during discovery. |
| T03 Read model/API | Reporting Luna: local DTOs, normalized scope, bounded queries, independent coverage, pure classification/dedup/aggregation, new authenticated endpoint. | T01; integrates T02 | Fixture tests and read-only dependency audit. |
| T04 Active admin | UI Luna in isolated tree: campaign/header/funnel truth, scope/error states, configured-tag wording and access to existing order diagnostics. Coordinator integrates shared page. | T03 contract; may develop against fixtures | Actual production components mounted with fixture data; surface inventory resolved. |
| T05 Reconciliation tooling | Reporting Luna: exact-manifest dry-run/apply, immutable revisions/idempotence, safe correction; no domain/provider effects. | T02/T03 | Synthetic apply/reapply/conflict/supersede tests; finalized private manifest. |
| T06 Validate/review | Independent Luna reviewer and coordinator: branch-specific tests/build, production UI, timeout/compatibility tests, staged integration/guards, narrow diff review. | T03–T05 | No blocking findings; acceptance map with command results and explicit limitations. |
| T07 Stage | Release owner: integrate only this patch on fresh staging, serialize with other owner, apply synthetic reconciliation fixtures and execute hosted smoke/observation. | T06 | Exact reviewed/built/served staging SHA, guards, report and rollback evidence. |
| T08 Production | Release owner: refresh current main/health/rollback; release independently reviewed main-based patch, apply only reviewed reporting metadata, verify real cutoff reconciliation and observe. | T07 plus production-specific gates below | Serving SHA/config verified; one-sale cutoff reconciles; no observed regression in release checks. |
| T09 Close | Coordinator: report, compatibility/rollback manifest, root JSON ledger entry and any pending outcome evidence. | T08 | Accurate deployed/accepted status; future Google attribution remains separately tracked. |

T03 and T04 may proceed in parallel after the response contract is fixed. No simultaneous deployment with SPRINT-0017/0018. Re-estimate after T01/T02; do not trade verification for a promised calendar deadline.

### Files summary and scope control

Expected production allowlist:

- New `lib/contracts/admin-measurement-report.ts`, `lib/admin-measurement-report.ts`, `lib/admin-measurement-source.ts`; optional focused `lib/admin-measurement-reconciliation.ts` shared by the source/writer.
- New `app/api/admin/measurement-report/route.ts`.
- Narrow edits in `app/admin/page.tsx`, `components/admin/CampaignPerformanceWidget.tsx`, `components/admin/VisitorTelemetryDashboard.tsx`; `ValuationHeuristicsWidget.tsx`/`OrderJourneyDrawer.tsx` only for proven active claim/diagnostic gaps.
- `scripts/reconcile-admin-measurement.ts`, focused tests and safe fixture support, documentation/evidence.

No intended edits to `lib/types.ts`, existing legacy/staged metrics/reporting endpoints, telemetry ingestion, purchase-measurement writer, checkout/webhooks, pricing, fulfillment, comp flow, public routes, configs, lockfile or dependencies. If an active surface requires a file outside this list, document the smallest reason/dependency and obtain independent scope review before expanding. Unexpected provider/checkout dependencies are grounds to redesign the reporting patch, not silently absorb that subsystem.

## Definition of done and validation

Inspect commands before execution. Use isolated synthetic storage and fake provider adapters with network denial; do not run broad test/fulfillment scripts against live credentials or repository `.data`. Use focused new report/reconciliation/UI tests, the existing attribution queue regressions, relevant founder-filter regressions after verifying their semantics, TypeScript and production builds on **both** candidate variants. Record exact commands at execution rather than inventing npm aliases. Builds must not need live provider access.

| AC | Required proof |
| --- | --- |
| AC01 Historical truth | At the fixed founder-reviewed cutoff, exact reconciled identities produce one customer order/$9; other reviewed paid tests appear separately. No fabricated snapshots, order edits or permanent cap. A missing-evidence blocker remains an incomplete AC. |
| AC02 Payment correctness | Two genuine payments in the same campaign both count; repeated observations count once. Session-only completion, pending/failed payment, test/comp, mismatched currency/amount and duplicate cross-order payment bindings do not become independent sales. Explicit `origin: ADMIN_COMP`, `admin_comp_balance` and `studio_comp` remain excluded, including positive paid admin balances with Google attribution; absent optional fields remain compatible. Preserve redacted-receipt origin and browser Purchase suppression in relevant existing regressions. Fulfillment failure does not erase capture. |
| AC03 Money/refunds | Actual captured cents, including discounted positives, are used. Known partial/full refunds and disputes remain distinct; unknown refunds stay unknown; gross is not net/profit. No live $3.56/39.6% assumption. |
| AC04 Time/classification | New ordinary eligible purchase after cutoff counts. Explicit founder flags still exclude mobile/paid traffic. Order creation and capture/verification in different windows follow the documented order-created contract. Test Chicago midnight, DST spring/fall, custom bounds, unknown creation time and `asOf`. |
| AC05 Observation honesty | Default note, screen view, duplicated/unordered events, sampled/capped sessions and no linked session produce no invented purchase, completed step, visitor or percentage. Email and unknown attribution retain correct labels. |
| AC06 Isolation/access | Every new request bounded; cap/source error/malformed query/401/timeout are explicit. Auth is checked before reads with the correct branch-specific guard semantics. Hosted mock fallback/project mismatch cannot appear as live data. Spies prove report GET makes zero writes/provider calls. Existing admin operations and storefront remain usable when it fails. No PII or receipt tokens in DTO/logs; private no-store response. |
| AC07 Reconciliation safety | Private namespace access verified; dry-run has zero writes; hash/prior-version/target mismatch fails; apply is exact-ID/idempotent; correction preserves history. Missing registry is compatible; unreachable/truncated registry cannot silently restore excluded sales. |
| AC08 UI/parity | Mounted main-based UI at 390px and desktop, keyboard use and enlarged text; all affected visible metrics reconcile or explicitly identify different scope. Empty vs unavailable and stale scope are distinguishable. Stage route/component adapter passes same golden fixtures. |
| AC09 Compatibility | Cached prior admin consumer works with unchanged legacy API; new UI tolerates missing/new optional fields and 404/unavailable report during version skew. In-progress old-tab draft can continue across the candidate switch in fake-provider browser tests; payment amount/intent and queue contracts unchanged. |
| AC10 Release | Exact separately reviewed candidate SHAs build/serve in intended environments, required guards/config preserved, rollback artifact retained/compatible, hosted smoke and observation completed, no overlapping release. No fake transaction used for proof. |

Keep two separate statuses: **report release acceptance** and **future live Google conversion outcome**. Do not claim Google accepted the previous sale from its campaign association or browser callback. Do not wait indefinitely for another purchase to complete the code release.

## Release and uptime runbook

### Release mechanism and preflight

Firebase documents a managed sequence that checks the new revision's health before routing new requests to it. A push to the configured live branch can start that process automatically. We use that existing mechanism; no maintenance mode, DNS switch, deletion of the current service or manual Cloud Run traffic splitting is planned. [App Hosting operation](https://firebase.google.com/docs/app-hosting), [rollout controls](https://firebase.google.com/docs/app-hosting/rollouts).

Immediately before each environment's release:

1. Claim the release window with the other coordinator; refresh remote refs and check pending builds/rollouts. Stop if another release is active or the branch changed unexpectedly.
2. Record the healthy source, retained build, service revision, traffic, backend/project/region, automatic branch policy and config fingerprints. Use the same sanitized canonicalization before/after; never print secrets. Inspect custom-host health as well as the backend.
3. Confirm the rollback image still exists, is not expired, and preserves current payment/attribution configuration and all already accepted data readers. Production's expected new baseline is the **October 26 attribution build**, not the older October 21 rollback from SPRINT-0015. Staging rollback must preserve international holds and any later comp work.
4. Confirm candidate ancestry and allowlisted diff; no force push or whole-staging merge. Rebase/integrate concurrent commits in isolation, re-review conflicts and rerun affected tests. Keep a stable reviewed SHA before pushing.
5. Confirm operator can use the supported existing-build rollback and read source/traffic/health. If that recovery path is unavailable, do not promote production based on an assumed capability.

Repository defaults point at production. Every command/control must explicitly identify project/backend/region and source; never run an unqualified generic deploy. Verify the current CLI/API syntax before execution. A configured branch push is the release action; do not follow it with a duplicate manual rollout.

### Staging gate and exact production-path validation

Integrate the reviewed patch on a fresh **staging-based** candidate, preserving its existing admin shell, international preview, `STAGING_REVIEW_ONLY`, `NEXT_PUBLIC_STAGING_REVIEW_ONLY`, `HANDWRYTTEN_TEST_MODE`, stage project/URL and advertising suppression. Use synthetic records only. Do not temporarily replace staging with older production code that lacks current held-order protections.

Staging and production have different admin pages. The actual production `CampaignPerformanceWidget`, page wiring and new route must also pass an isolated main-based build and mounted browser fixture, including failure states and stale tabs. On hosted staging, exercise the same new API and report component/contract through an existing authenticated admin entry. If the component is otherwise unmounted there, add a small stage adapter under the existing admin surface and test it. Document that adapter separately; an unrelated staged workspace passing is insufficient proof.

Require rollout success/READY, correct built and served SHA, intended traffic and fresh hosted checks. The prior healthy service continues to serve during build; if candidate build/readiness fails, diagnose without forcing traffic or running a duplicate deployment.

### Production gate and reporting metadata

After staging passes, refresh main and the production baseline again. Release only the main-based candidate that passed its own tests and independent review. Preserve the existing Google ID/label `AW-18474411963/RAmzCLzyvKodELvPpOlE`, consent/queue behavior, payment config, secret bindings and public route behavior. No Google goal or campaign change accompanies this release.

The new reader tolerates an absent reconciliation record. Deploy the reader/UI first, inspect it, then apply the already reviewed **production** reporting manifest with explicit target and hash. During that interval, historical rows may show reconciliation pending; they must not revert to guessed totals. Read back exact metadata revision and prove the fixed historical cutoff result. Do not apply stage fixture data to production. Application rollback leaves append-only reporting history intact and old readers ignore it.

### Finite hosted checks and observation

Use the same bounded checks at staging and production. Observe for **15 minutes after the candidate is serving**, with smoke passes at minute 0, approximately 5 and 15. The agent should communicate progress and use short polls; this is supervised release work, not a new recurring automation.

- Each pass: one harmless GET to `/`, one known active builder/entry page that does not create an order/payment on load, one authenticated report GET in the agreed scope, and one unauthenticated report GET expecting `401`. No signed receipt or real checkout initialization. This makes 12 bounded requests across the observation window.
- At start/end: a browser check of real admin rendering plus public cover-to-note navigation, with no payment/provider request. Read current error logs/readiness and available payment/webhook error indicators without invoking them. Use artificial provider flows only in fixtures.
- Baseline the same routes before release. Release smoke target: each warmed read completes within **5 seconds** and public warmed reads do not exceed **twice baseline or 3 seconds, whichever is greater**, on two consecutive checks. A single slow/cold response triggers one diagnostic recheck, not automatic promotion. These are proposed operational thresholds for this release, not an advertised SLO or a statistically meaningful p95.
- Zero new 5xx in the smoke; report values match fixtures/cutoff; no auth leak, unexpected provider call, missing asset, unknown target/source or configuration drift. Missing monitoring data is recorded as unobserved, never as zero errors. If source/traffic/essential health or rollback cannot be observed, release acceptance remains incomplete.

Synthetic browser navigation can create ordinary site telemetry; use existing founder markers and exclude it from customer reporting. It must never emit Purchase. Routine HTTP health checks cannot be treated as human demand. Low traffic and this observation period cannot prove future reliability or Google attribution.

## Abort and rollback

Immediate stop/rollback for wrong project/SHA/config, loss of staging guards, broken public entry/checkout, authentication/PII leak, unexpected write/provider effect, duplicate/incorrect customer purchase reporting, or new reproducible errors. A report timeout alone must render unavailable and leave checkout working; diagnose once, then restore the prior build if repeated report failures block the new feature's acceptance. Do not keep a known incorrect financial report live to finish the observation timer.

Restore the freshly recorded compatible existing build through the supported App Hosting **Roll back to this build** control (or a verified equivalent pinned-build API). Firebase's existing-build rollback reuses its original image **and configuration**; a source rebuild is a slower fallback and is not an instant rollback. An expired build cannot use that path. [Rollback documentation](https://firebase.google.com/docs/app-hosting/rollouts), [build retention](https://firebase.google.com/docs/app-hosting/build).

Verify restored READY/source/traffic/config and repeat the safe smoke. Retain order/payment/fulfillment records and reporting audit history. If only a classification decision was wrong, append a corrective reporting revision; do not edit payment facts. Revert the narrow source change with a normal reviewed commit when needed so the live branch does not redeploy the defect; do not reset/force-push shared history. Serialize recovery with any other deployment owner and do not touch Ads configuration, which this release does not change.

Record detection, rollback initiation and restored-service times; these establish actual recovery duration, not a promised recovery guarantee. If data compatibility makes the recorded rollback unsafe, stop promotion before release or choose a newer compatible baseline; never knowingly roll back past international/comp reader requirements.

## Risks, dependencies and open questions

The main risks are historical evidence gaps, sidecar privacy/writer correctness, coupling to legacy read-side writes, misleading surviving UI values, branch divergence and concurrent deployment. The bounded scope, separate evidence axes, safe reader, failure states and explicit release owner address these without completing the entire older admin program.

Execution-time gates are exact historical identities/cutoff and capture evidence; actual private namespace/rules; effective source indexes/coverage; fresh backend/rollback state; and any new overlapping work. None needs a product-preference interview now. Resolve routine implementation choices from this plan; report a concrete unresolved gate rather than weaken evidence or silently expand into payment/infrastructure changes.

Evidence during execution belongs in `.delivery/runs/<execution-date>-admin-measurement/` plus `docs/sprints/evidence/SPRINT-0016/REPORT.md`: source/target manifests, reviewed allowlist, reconciliation dry-run summary without PII, task/AC map, exact tests/build results, screenshots, independent findings, source/traffic/config checks and rollback record. Store sensitive record-level manifests privately outside committed/public output. Update only SPRINT-0016 in the existing JSON ledger, preserving concurrent entries. Planning alone never marks any implementation gate complete.

## Planning provenance

Two independent `gpt-6-luna` high-effort drafts were cross-critiqued. The coordinator inspected production/staging source, verified current Firebase rollout documentation, resolved endpoint/type/time-window choices, coordinated with the other chat under its founder-authorized request, and synthesized this plan. This is same-model independent review, not cross-model consensus. The earlier selected Luna preference overrides default skill lanes; no Gemini lane ran. Scope and uptime priorities were already supplied by the founder, so no duplicate product interview was necessary. See [intent](drafts/SPRINT-0016-INTENT.md) and [merge notes](drafts/SPRINT-0016-MERGE-NOTES.md).

## Execution adjustments — October 26, 2026

The focused handler and reconciliation store are separate dependency-injected modules for read-only/access/CAS tests. Staging uses a small account-guarded `/admin/measurement` adapter linked from its existing overview; the existing executive workspaces remain intact and are not claimed reconciled by this sprint. Production mounts the report in its actual orders overview and removes unsupported measured financial/funnel summaries. No public builder, checkout, provider, configuration, auth implementation, or dependency file is changed.

Snapshot `verifiedAt` remains required by the existing v1 typed purchase contract; historical inspection time is exposed separately as `observedAt`. Refund amount conflicts and out-of-range values become unknown. Historical classifications are founder-confirmed decisions, while capture evidence comes from separate read-only payment inspection.
