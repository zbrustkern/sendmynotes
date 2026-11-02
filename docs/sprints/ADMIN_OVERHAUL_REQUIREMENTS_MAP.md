# Overhaul requirements to sprint acceptance

Use alongside the [full specification](../ADMIN_PORTAL_OVERHAUL_SPEC_2026-10-18.md) and [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md). Every row requires evidence in its implementing sprint report; this is a coverage map, not a claim of implementation.

| Requirement | Primary sprint/task | Acceptance evidence |
| --- | --- | --- |
| Current code/deployed evidence distinction, retired builder/flag conflicts | 0001 T01; all entry gates | Current route/consumer inventory, baseline revision, no resurrected rollout control |
| Canonical sender audience, brand and accurate physical/wallet claims | 0001 T04; 0006 T04 | Corrected copy and separate configured/observed/verified states |
| Independent customers, founder/test/comp/synthetic separation | 0001 T03; 0002 T01; 0003 T02 | Mobile founder and unrelated ultrawide-customer fixtures |
| Browser success never establishes money | 0001 T03; 0002 T01–T03 | Forged/aliased client signals cannot alter paid metrics |
| Durable captures, actual cents/currency, refunds, disputes | 0002 T01–T05 | Duplicate/out-of-order/concurrent and failed-fulfillment fixtures |
| Real inbox/outbox consumer, retry, dead-letter and recovery | 0002 T02–T03; 0009 T02 | Interrupted-worker recovery using the same callable implementation |
| Historical transaction reconciliation and unknown classification | 0001 T05; 0002 T04 | Redacted read-only comparison; no fabricated correction |
| Event v2, schema, transport dedupe and safe rejection diagnostics | 0003 T01–T05 | Privacy/duplicate/storage/transport failure tests |
| Session inactivity, journey resume and semantic intent | 0003 T02–T03; 0004 T02 | No default/template/navigation completion; valid confirmed starter preserved |
| Full address and payment/wallet failure lifecycle | 0003 T03–T04 | Separate form loading, attempt, action, failure, cancel, observed confirmation and verified payment |
| Date, DST, cohort maturity and transaction/cohort-time distinction | 0004 T02–T03 | Golden fixtures with late purchase/refund, cross-midnight/DST and provisional cohort |
| Observed ordered paths and missing/skipped stages | 0004 T02 | No implied superset stages; deferred-address branch visible |
| Full-cohort campaign counts and one attribution classifier | 0004 T03; 0008 T03 | Pagination-invariant totals, Meta normalization, unknown/unattributed coverage |
| Actual/estimated/missing spend, fees, supplier and generation costs | 0004 T03–T04; 0007 T04 | Dated provenance and cost coverage; no double-counted discount or fake profit |
| Proposed BigQuery plus bounded operational/reporting queries | 0004 T01/T05 | ADR, adapter/config, representative-volume timing and unrun cloud gates disclosed |
| Analytics-only replay, additive migration and reader rollback | 0004 T05; 0010 T03 | Idempotent interrupted replay with external effects impossible |
| Compact overview, addressable routes and global scope | 0006 T01–T05 | 1440×900, 390px, zoom, keyboard, stale-response and state screenshots |
| Evidence drilldowns, full pagination and order tools | 0007 T01–T05 | Exact supporting cohort, two-interaction exception access and safe action parity |
| Preserve fixed/percentage/free/comp/manual and existing links | 0005 T01/T03; 0008 T01/T05 | Every supported active entry/alias and resume tested |
| Versioned offers, server pricing, stale quote/intent safety | 0005 T01–T04 | Immutable accepted terms and disclosed price before payment |
| Transactional caps/budgets, reservations and redemption | 0005 T02/T04/T05 | Concurrent last slot, expiry/retry/cancel/refund and free-order consumption |
| First-class Promotions, campaigns, previews and auto-apply | 0008 T01–T05 | Create-to-archive walkthrough, accurate destination/price and dollar parity |
| Offer exposure vs redemption vs incremental lift | 0008 T03; 0010 T01–T02 | Descriptive/uncertain states; no causal claims from redeemers alone |
| Legitimate recovery links and contact limitations | 0008 T04 | No fake resumable link, no outreach, original acquisition retained |
| Trace/log correlation with redaction and bounded cardinality | 0003 T04; 0009 T01 | Safe linked asynchronous evidence, no provider-internal visibility claim |
| Measured health, independent open incidents and grouped alerts | 0009 T02–T05 | Unknown/stale/no-traffic behavior and isolated notification fault drill |
| Safe pause/retry/resume, resolved state and actor audit | 0007 T03; 0009 T04–T05 | Server role enforcement, current provider state and no duplicate external action |
| PII masking, auth, consent, retention and export protection | 0003 T01; 0007 T01/T05; 0009 T01–T02 | Denied access, redaction/consent tests, disposable expiry configuration; no production TTL activation |
| Decision log, actual exposure and appropriately bounded experiments | 0010 T01–T02 | Stable assignment, rendered exposure, predeclared metric/guardrails and gathering-evidence states |
| End-to-end acceptance and honest release status | 0010 T03–T05 | Integrated evidence index and built/local/staging/production distinctions |

External gates remain explicit: actual provider/invoice evidence, live wallet/browser checks, cloud IAM/billing/configuration, separately authorized historical corrections and deployment. No row is satisfied by inventing these inputs.
