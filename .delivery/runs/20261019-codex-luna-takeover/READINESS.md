# Admin overhaul: integrated local checkpoint

October 19, 2026. **Staging deployment requested by founder; sprint acceptance remains partial. Production is not approved.**

The inherited working tree is preserved. Starting HEAD was `f9f187e0498ffb6b586c9970aeda8aa3fcf92f96`; verified implementation is saved in local staging commit `fe090f4`. It has not been pushed. `source-sha256.json` identifies the reviewed source snapshot. This checkpoint supersedes inherited completion claims where they conflict with the evidence below.

## Delivered and repaired

- Integrated the Luna foundation and portal repairs, operational controls, incident lifecycle, decision log, deterministic assignment helper and analytics-only replay utility. The decision log is mounted in Growth. No experiment, consumer schedule, production TTL or rollout was activated.
- Separated browser-safe helpers from server persistence/payment imports. Fixed inherited test typing errors. The optimized application build now succeeds.
- Hardened provider webhook retry acceptance, payment amount/currency/order binding, financial fact preservation during analytics failure, missing outbox handlers, analytics-only draining, offer quote/version/redemption binding and stale supplier dispatch locks. Supplier outcomes that cannot be confirmed require reconciliation before a billable retry.
- Corrected transaction-period refund handling, unmatched paid-order counts, calendar/timezone/DST boundaries, 24-hour entry-cohort conversion and provisional cohorts. Unknown fees/costs/spend cannot become verified profitability. Intent creation time is no longer used as capture time; server observations are distinguished from provider-reported timestamps.
- Removed invented recovery candidates, offer views/rejections, journey revenue, Economics campaign rows, historical-baseline incidents and blanket healthy/reconciled claims. Growth and investigation financial summaries use financial facts rather than order status or browser payment aliases. Communication status depends on a recorded acknowledgement.
- Preserved discount creation, presets, percentage/fixed/free/comp terms, manual and URL codes, legacy tools and link distribution. Kept costs explicitly unconfirmed. Redemption observations remain descriptive and cannot establish causal lift.
- Connected workspace navigation and scope, loading/error states, refresh, dedicated-page auth, operational Controls and keyboard activation. Corrected the inherited dark-theme text against the light shell. Audit identity for the repaired mutation APIs comes from verified credentials rather than a caller-supplied name.

## Verification actually performed

| Check | Result | Limits |
| --- | --- | --- |
| TypeScript, without incremental cache | Pass | Application and tests in shared source; no live integration implication |
| 14 scoped test files + staging safety regression | Pass | Ten sprint suites, portal repair, draft, reporting regression and cross-workspace integration; `checks/summary.json` |
| Optimized Next build | Pass | Isolated source copy, original root layout, mock server storage, no lint; `checks/optimized-build.log` |
| Six-workspace business evidence rehearsal | Pass | Synthetic paid, discounted, free, deferred, refunded and failed cases; duplicate captures, browser-success forgery and unsafe retry gate. Seeded evidence, not a real checkout or supplier submission |
| Reporting boundary regressions | Pass | Chicago 23/25-hour DST days, inclusive calendar final date / exclusive timestamp end, historical refunds, unlinked captures, next-day payment within entry horizon and read-budget overflow |
| Volume fixture | Pass | 1,807 telemetry events; ingest plus report took 456 ms in the recorded mock run. This includes ingestion and is **not** cloud query latency, p95 or a performance SLO |
| Analytics replay | Pass | 10,000 synthetic events; paused after 800, resumed and retried with identical checksum and 10,000 unique projections; 69 ms recorded mock replay time. Business order fixtures unchanged; zero external calls |
| Browser matrix | Partial; see `BROWSER_REVIEW.md` | Compiled isolated application, explicit synthetic banner, mock data, tracking scripts/client Firebase disabled only in QA copy |

The raw logs contain only isolated fixture work. They are not evidence of independent customer purchases or commercial improvement. No fulfillment scripts were used as an audit check. No live payment, supplier order, email, ad mutation, production data edit, deploy or destructive retention action was performed. The final build with staging advertising suppression also passed (`checks/staging-build.log`); staging safety results are in `checks/staging-review-safety.log`.

Initial audits came from two independent Luna workers. One Luna builder delivered Sprint 9–10 modules. The repair workers then hit the account usage limit. The coordinator integrated, repaired and locally reviewed the final result; **a final Luna foundation audit found two additional edge cases in classification and provider refund/dispute relations; these were repaired, including stable refund/dispute identity across missing-to-known relationships. Independent review of the entire final integrated diff is still outstanding**. Do not describe it as externally approved.

## Acceptance and remaining work

The ledger retains Sprints 2–10 as active, with implementation and acceptance recorded separately. Passing tests alone do not complete the original criteria.

| Scope | Remaining engineering / acceptance work |
| --- | --- |
| 0002 financial durability | Exercise real Firestore/emulator contention and commit failures. Prove recovery after each durable inbox/capture/outbox boundary. Only analytics has an executable outbox handler; external fulfillment/email remain synchronous and general draining fails closed. Do not enable external consumers by substituting no-op handlers. |
| 0003 telemetry | Finish a real browser entry/checkout/deferred/resume instrumentation matrix with fake providers; verify all entry consumers. Extend stored operation correlation through confirmations, receipts and provider observations. Real Safari, Meta and wallets remain separate device gates. |
| 0004 reporting | Bounded reads have a 2,000-record sentinel and refuse incomplete totals. This is a safe fallback, **not** indexed full-data pagination or a provisioned warehouse. Complete indexed continuation/warehouse adapters and actual datastore timing. Add ordered, timestamped funnel transition evidence before restoring abandonment rates. |
| 0005 offers | Local pricing, aliases, reservation, redemption and immutable quote regressions pass. Real datastore concurrency and complete active-entry/draft-resume browser matrix remain. Do not weaken free/comp/discount support to close these gates. |
| 0006 shell | Use the actual browser matrix below. No arbitrary baseline incident is inserted to reach a target of three: display all actual available exceptions when fewer exist. Complete true 200% browser zoom and detailed keyboard/focus checks if not recorded. |
| 0007 investigations | Continue exact metric/stage/filter/export drilldown parity, historical order-vs-transaction windows, privacy reveal and unknown supplier/communication states. The core six-workspace synthetic financial reconciliation passes. |
| 0008 Growth/Promotions | Complete channel/campaign spend identity and coverage, scoped recovery eligibility, unique exposure definitions and additional browser mutation/preview tests. No redemption ratio may become incremental lift. |
| 0009 reliability | Positive end-to-end probes, measured latency/error coverage, actual worker heartbeat and full operation correlation remain. Unknown is intentional. Prove queue resume with provider ambiguity/reconciliation and no duplicate physical effect; generic automatic resume is unavailable. Real notification delivery has not been tested. |
| 0010 learning/readiness | Decision registry and sampled rendered exposure summaries exist; outcome cohorts/uncertainty are not connected and no lift is estimated. Replay interruption/resume is locally proven. Complete independent integrated review, full browser matrix, cloud rehearsal and rollback evidence before acceptance. |

## Safe continuation order

1. Review this exact integrated source snapshot. Do not rebuild earlier sprints from their inherited reports.
2. Finish remaining local evidence/filter/browser gaps in small isolated lanes. Keep one application writer or use separate patches; coordinator owns the ledger. Reuse the documented network-denied mock snapshot, never repository `.data` or `.env*`.
3. Implement scalable indexed reads and complete the shadow comparison, preserving immutable financial facts and accepted offer terms. Do not silently sample totals or fabricate missing identity, fees or costs.
4. Prove durable recovery and consumer behavior in an emulator/fake-provider environment, including a timeout that may have succeeded remotely. Reconcile before resubmission. Do not promise exactly-once physical fulfillment solely because the request includes an order reference.
5. Complete the decision/outcome linkage and measured observability. Keep experiment activation, real provider calls and any infrastructure change separately reviewed.
6. Obtain final independent review and staging evidence. Only then prepare the production approval item.

## External release gates

Not verified: production/staging Firestore transactions, indexes, IAM, service identity, warehouse/billing, backup restore, consumer scheduling, real Stripe/webhook delivery, provider/account health, actual supplier invoices and processor fees, real alert/receipt delivery, Apple Pay, Safari/Meta in-app paths, retained-data deletion propagation, production load/cost or monitoring.

The October 11 canonical baseline remains zero independent conversions and one founder test. Synthetic UI screenshots do not change that baseline. No uplift or supplier-cost claim is established by this implementation.

## Rollout, abort and rollback procedure for the eventual approved release

- Before staging: snapshot the existing deployment revision, approved schema/index configuration and retention/access settings. Confirm backups and recovery access. Retain new immutable facts, redemptions, inboxes and audit history through any reader rollback.
- Introduce additive readers/projections in shadow mode; compare window/cohort counts and checksums. Explain every difference. Never alter facts just to force parity.
- Enable admin readers after financial/discount parity, auth/privacy and read-budget checks pass. Enable a consumer topic only with a real handler, verified lease/retry behavior, monitoring and an explicit ownership/runbook decision.
- Abort for missing/duplicated financial facts, wrong order/price/mode binding, duplicate supplier submissions, lost accepted offer terms, PII leakage, missing handlers acknowledged as success, or material unexplained shadow differences.
- Pause the affected consumer/submission path, retain captures and queues, reconcile provider outcomes, and restore the prior approved reader/application deployment. A deployment rollback does not cancel already accepted supplier work. Do not delete queues, facts or redemptions to clear an incident.
- Record operator, reason, revision, affected scope and verification evidence. Do not resume uncertain physical submissions until provider reconciliation establishes the next safe action.

## First conversion investigation

Compare observed paid-entry cohorts by campaign, device and in-app browser; first establish which visitors actually loaded payment, saw an eligible payment method and reached server verification. Exclude founder/test activity and retain unknown identity. Investigate payment readiness/verification errors before changing offers or bidding. The current evidence supports a measurement investigation, not a claim that price or a discount caused abandonment.

## Staging preparation, October 19

The existing `sendmynotes-staging` App Hosting backend watches the `staging` branch. Its current revision is `sendmynotes-staging-build-2026-10-16-009`, source `f9f187e0498ffb6b586c9970aeda8aa3fcf92f96`. The default Firebase project is production, so no unqualified deployment command is allowed.

Prepared `apphosting.staging.yaml` to set the staging URL/project, disable production advertising tags, and bind a private admin-session signing key. `STAGING_REVIEW_ONLY` blocks live Stripe keys, email delivery and physical supplier submission before provider calls. Stripe test mode remains possible. A dedicated regression verifies those boundaries without external calls. Production base configuration is unchanged.

Automatic approval review rejected creating the private staging signing key, granting only the existing backend service account read access to that key, and selecting the backend's `staging` environment. Explicit founder approval is pending. No mutation from that rejected action occurred. Do not push this deployment until configuration approval is resolved and the backend selects the matching override file; otherwise staging would inherit production URLs and have no secure session signing key.

## Staging approval resolved

The founder explicitly approved the staging push after reviewing the configuration request. The existing staging backend now selects `environment=staging`. A private signing key was created in the staging project and its existing compute service account was verified to have read access. No key value was printed or saved locally. Production configuration was not modified. The approved staging push and rollout verification are in progress.

## Staging deployment verified

Deployed commit `a73debd90949700d33fff9659defd72611f26f3d`; rollout `build-2026-10-19-003` succeeded, build READY, serving revision `sendmynotes-staging-build-2026-10-19-003` at 100% traffic. See `checks/staging-rollout.json` and `checks/staging-runtime.json`.

The first attempt rejected empty environment overrides; they were removed in favor of the explicit client/server review guards already tested. The second attempt exposed missing access for App Hosting's deployment service; the standard `apphosting:secrets:grantaccess` setup completed the founder-approved backend secret access. No application rollback or provider transaction was needed.

Hosted `/admin` and `/admin/growth` return 200 with production advertising scripts absent. Unauthenticated reporting and reliability APIs return 401. Runtime uses the staging project and URL; both review flags, supplier test flag and private signing-key binding are verified. Live charges, physical submission and email remain blocked by review guards. No real transaction was attempted. Signed-in navigation, mutations and the outstanding acceptance gates remain unverified. Production was unchanged.

This deployment evidence is retained locally after the pushed revision, avoiding an unnecessary deployment solely to publish its own result.
