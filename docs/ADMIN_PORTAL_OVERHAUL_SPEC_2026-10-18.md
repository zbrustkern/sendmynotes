# SendMyNotes admin portal: CEO review and overhaul specification

Date: October 18, 2026. Status: proposed; no production changes made.

Founder refinement during review: preserve and strengthen discount codes as a growth and operating capability. Promotions are a first-class workflow in this proposal.

## Executive recommendation

Rebuild the portal around a reliable decision loop: acquire → understand → convert → fulfill → learn. Its primary job is to tell the founder what happened, how trustworthy that conclusion is, what requires intervention, and where to investigate next.

The existing portal has valuable operational plumbing, but its presentation gives configuration, inferred behavior, financial assumptions, and verified outcomes similar visual authority. Reducing padding alone would make unreliable answers more prominent. Fix metric semantics and the information hierarchy together.

At this stage, the business needs evidence of independent purchases and a diagnosis of friction before sophisticated valuation modeling. Retain scenario planning as an explicitly labeled secondary tool. Do not recommend increasing bids based on assumed LTV.

## Review scope and evidence boundaries

- Visually inspected the authenticated production `/admin` Command Center, System Health, Unit Economics, Discounts, and Flags screens in Chrome. Read the implementation of order tools, ingestion, aggregation, attribution widgets, payment instrumentation, server purchase recording, discount calculation/usage and relevant API routes.
- Reviewed the canonical [project brief](CANONICAL_PROJECT_BRIEF.md) and [product specifications](CANONICAL_PRODUCT_SPECS.md). Those govern strategy and product claims.
- Live screens are observations of what the dashboard displays, not an independent validation of its underlying records. Local source identifies mechanisms and risks; the deployed revision was not independently matched to the checkout.
- No individual production payment, supplier invoice, ad account reporting window, or customer classification was reconciled in this review. No fulfillment, retry, comp dispatch, email, or rollout control was executed.
- The October 11 canonical baseline remains zero independent conversions and one founder test. The October 18 portal displays one paid order; this is an unresolved classification/reconciliation issue, not proof of a new customer or proof that the baseline is still current.

## What works

| Existing strength | Why it matters | Keep and improve |
| --- | --- | --- |
| Order search, status, journey drawer, proof inspection, Stripe/supplier sync, address repair and retry | A founder can investigate and resolve an actual order | Give Orders its own route and make exceptions immediately accessible |
| Source/campaign, landing route, device and in-app browser context | Connects acquisition to experience | Use one normalized attribution model and full-cohort aggregates |
| Raw telemetry plus server purchase/fulfillment events | Provides material for auditing and reconstruction | Preserve raw evidence; introduce durable identities and replayable projections |
| Metadata allowlists, body limits and authority-event rejection | Good starting boundaries for telemetry | Close semantic aliases and add typed contracts, redaction and ingestion diagnostics |
| Incident feed, alert configuration and feature flags | Useful control surfaces already exist | Add measured health, change history and verifiable effects |
| Fixed/percentage discount codes, expiry, redemption caps, toggles and share links | Useful commercial controls for acquisition, testing and recovery | Preserve them and add offer-level journeys, reliable redemption accounting and price previews |
| Calm surfaces, recognizable navigation and mobile adaptations | The interface is approachable | Retain clarity while increasing useful density and contrast |

## What is not working

Severity indicates decision risk, not a confirmed production outage.

| Priority | Finding and evidence | Business consequence | Required change |
| --- | --- | --- | --- |
| P0 | Production shows `$9`, `1 paid / 255 visits`, and `0.4%` with founder exclusion enabled | Founder can mistake testing for customer demand | Reconcile that payment and classify all financial facts explicitly; keep an unresolved bucket |
| P0 | Funnel aggregation fills earlier stages from later stages; `highestStep >= 1` puts landed sessions in Cover Ready; paid orders propagate through every stage. See [rollup](../lib/metrics-rollup.ts), `getAdminDashboardMetrics` | A tidy descending funnel hides missing evidence; automatic defaults look like intent | Count observed semantic milestones; show missing and skipped stages explicitly |
| P0 | `step_6_paid_order` is browser-allowed and the raw aggregator treats it as paid, while other payment success names are server-only. See [schema](../lib/telemetry-schema.ts) and rollup | A client signal can influence a financial-looking funnel stage | All paid metrics must resolve to a verified payment/order ledger; browser confirmation is observational only |
| P0 | [Campaign widget](../components/admin/CampaignPerformanceWidget.tsx) derives visitors from the latest 50 sessions, adds order-derived visitors, conditionally patches purchases, and assigns `$9` / `$3.56` | Campaign rows do not represent the full reporting cohort and can distort purchase counts | Aggregate centrally; never invent a visitor to accommodate an unmatched order |
| P0 | That widget maps Meta `paid_social` to Direct; live `studio_direct_v2` is shown as Direct while the session table shows Meta | Paid acquisition can appear organic | One classifier shared across server reports and every UI surface; click IDs alone do not prove paid acquisition |
| P0 | `$4.88` supplier cost, `$3.56` contribution and `39.6%` are assumed, including a nonzero default percentage with no revenue. [Rollup](../lib/metrics-rollup.ts) and [admin page](../app/admin/page.tsx) | False profitability can drive spending decisions | Actual, estimated, missing and not applicable states; reconcile invoices and Stripe fees |
| P0 | Live economics calls zero entered ad spend profitable and recommends increased bids from assumed LTV | Missing inputs become growth advice | Missing spend must be unknown; suppress recommendations without sufficient reconciled evidence |
| P1 | Explicit founder IDs can be retained when traffic is mobile or ad-tagged; desktop `3440x1440` is categorically excluded. [Rollup](../lib/metrics-rollup.ts) | Founder traffic leaks in; real people can be removed by screen size | Explicit identity and audited classification outrank heuristics; remove resolution/email-substring identity rules |
| P1 | Raw events are loaded across all history; a session is included when it overlaps the window, but its stages are reconstructed from all its events | Selected-window conversion can include behavior outside the intended window | Define entry cohorts, outcome windows, event-time reports and timezone consistently |
| P1 | Ingestion uses an in-process Promise queue and read/modify/write of one summary document, after writing raw data separately; sliding dedupe lists are bounded | Multiple app instances can overwrite aggregates; old retries can count again | Durable dedupe and transaction/outbox boundaries; rebuildable, partitioned projections |
| P1 | System Health derives green status from no unresolved incidents in the latest 50 records | An uninstrumented failure or older open incident can look healthy | Query unresolved incidents independently; require recent measured checks for health |
| P1 | Wallet availability is observed, but the reviewed payment component does not emit attempt/failure/cancel events around its payment branches | Checkout abandonment cannot be separated from payment failure | Instrument the complete payment lifecycle, including load failure and server reconciliation |
| P1 | Admin promises `?discount=CODE` auto-application; legacy builder reads discount/code/promo parameters, but the reviewed V3 experience does not read discount URL parameters | Shared offers can lose their intended convenience across experiences | Verify and implement URL offer hydration consistently on every supported entry; preserve existing link aliases |
| P1 | Date/channel/founder controls sit inside the telemetry widget below KPIs and campaigns | Scope is difficult to understand even when it affects earlier content | One persistent global scope bar with visible timezone and freshness |
| P2 | Large nested cards, 24–32px padding, repeated acquisition/session/recovery sections, decorative badges and supplier configuration consume the overview | Founder must scroll to answer basic questions | Compact summary, one priority queue and focused drilldowns |
| P2 | Font mix is labeled A/B Cohort without experimental assignment; occasions are inferred from private note text in rollup | Descriptive data looks causal and personal content becomes analytics input | Use explicitly selected occasion and design IDs; separate usage from experiments |
| P2 | Recovery estimates multiply recent sessions by `$9`; generic promo URL is labeled one-click recovery | Apparent recoverable revenue lacks identity, intent and resumable-draft evidence | Separate observed inactive journeys, eligible contactable drafts and measured recovered orders |

### Pixel use: specific diagnosis

On the inspected approximately 1900px-wide desktop window, the main content remains approximately 1216px wide. About a third of the width is side gutters. The first funnel begins around screen y=1200, after the app header, tab bar, supplier banner, four KPI cards and a large campaign panel. At a typical 900px screen height, the founder cannot see it on entry. Order tools sit below the funnel, 25 abandoner rows, acquisition/device panels, another session stream and preference panels.

The problem is priority and repetition as much as empty space. Use the available width for a funnel and an action queue side by side, move forensic tables into their own routes, and replace full-width configuration banners with a compact status summary. Do not fill every available pixel or make text tiny.

### Product accuracy in operator screens

Remove unsupported `100 lb cardstock`, `Verified Stripe Express Checkout`, exact envelope-parity and simulated manufacturing-stage claims. Replace Aster & Blanche atelier framing in sender-facing operational descriptions with SendMyNotes. Distinguish configured wallet support, wallet availability observed, and an actual verified wallet payment. Supplier-submitted does not mean physically inking; mailed does not establish delivery.

## Product contract: the questions the portal must answer

| CEO question | Required evidence | Immediate investigation or control |
| --- | --- | --- |
| Are independent customers buying? | Verified live payments, customer/test classification, refunds and paid-order counts | Open the reconciled payment/order record |
| Where is conversion failing? | Observed milestone counts, active vs inactive journeys, errors, latency, route/build/browser context | Open a filtered list and an individual journey |
| Which spend is working? | Date-matched ad spend, landing sessions, verified attributed orders, contribution and attribution coverage | Inspect campaign/ad/landing combination; deep-link to ad platform |
| Are we keeping the promise? | Paid orders awaiting address, submission delays, supplier errors, stale statuses and receipt failures | Open a ranked exception with safe resolution actions |
| What should change next? | Evidence, affected cohort, uncertainty, experiment assignment and release history | Record hypothesis, release change, inspect outcome, roll back if needed |

## Information architecture and layout

Use addressable routes with persistent filters; replace local tab state as the only navigation mechanism.

| Route | Purpose and default content |
| --- | --- |
| `/admin` Overview | Executive scorecard, observed funnel, exceptions, acquisition summary, measurement health |
| `/admin/growth` | Campaign/ad/creative/landing report, dated spend ingestion, attribution coverage, experiment results |
| `/admin/promotions` | First-class discount workspace: create, distribute, inspect performance, pause and archive offers |
| `/admin/journeys` | Searchable full session/journey history, errors, milestone timing and release/browser comparisons |
| `/admin/orders` | All paid orders, drafts and exceptions with independent operational filters and a journey drawer |
| `/admin/reliability` | Customer-impacting failures, traces, latency, jobs, integrations, webhooks, alert delivery and telemetry quality |
| `/admin/controls` | Rollout flags, emergency checkout/fulfillment controls, scenario pages and audit log; links to Promotions |
| `/admin/economics` | Actual revenue/refunds/fees/costs/spend with reconciliation; assumptions in a separate modeling view |

### Overview wireframe

This is a layout proposal; placeholders are deliberately not fabricated business metrics.

```text
┌──────────────┬────────────────────────────────────────────────────────┐
│ SendMyNotes  │ Overview       PRODUCTION     Updated <time>   Refresh  │
│              ├────────────────────────────────────────────────────────┤
│ Overview     │ Last 7 days ▾  Compare ▾  America/Chicago  Customer ▾    │
│ Growth       │ Channel ▾  Experience ▾  Device/browser ▾  Coverage ▾  │
│ Promotions   ├────────────────────────────────────────────────────────┤
│ Orders       │ Paid orders | Net receipts | Paid-session CVR | Spend  │
│ Reliability  │ <count>       <amount>       <n / N>            <state> │
│ Controls     ├──────────────────────────────────┬─────────────────────┤
│ Economics    │ Observed conversion milestones   │ Needs attention     │
│ Journeys     │ Landed → Engaged → Note confirmed│ Payment mismatch    │
│              │ → Address path → Payment attempt│ Fulfillment blocked │
│              │ → Verified paid                  │ Measurement gaps    │
│              │ Counts · rates · missing evidence│ Owner · age · Open  │
│              ├──────────────────────────────────┴─────────────────────┤
│              │ Acquisition summary · full cohort · top 5 + View all  │
│              │ Channel | Spend | Eligible | Paid | CPA | Contribution│
│              ├────────────────────────────────────────────────────────┤
│              │ Data: payment match · attribution coverage · freshness│
└──────────────┴────────────────────────────────────────────────────────┘
```

- Desktop: 184–208px navigation; remaining width fluid up to approximately 1680px; 20–24px page gutters; 12–16px panel gaps. Four summary metrics, each 76–96px tall. Funnel/action row uses approximately 2:1 width.
- At 1440×900 and browser zoom 100%, show global scope, scorecard, complete funnel and at least three actionable exception rows without scrolling. At 1280px retain readable two-column content where possible; collapse secondary navigation before compressing tables.
- Default body text 14px; secondary annotations 12px; tabular numbers. Desktop table rows 36–44px, clear hover/focus states; touch controls at least 44px. Offer comfortable density where useful. Avoid unreadable all-caps 10px table headings.
- At 390px, prioritize exceptions and KPIs, then funnel. Use a compact navigation menu and labeled horizontal overflow for wide tables. Keyboard access, focus, textual status labels and contrast must remain intact at 200% zoom.
- Keep only one detailed session table, on Journeys. Overview shows summaries and links. Fonts, geography and design usage belong in secondary exploration.
- Promotions has its own navigation destination and a contextual Create offer action from campaigns and eligible recovery investigations. Comp dispatch remains available in a contextual menu. Overview can surface offers needing attention; its primary action is investigation.

## Metric definitions and reporting rules

Every metric response carries `definitionVersion`, `asOf`, `window`, `timezone`, `filters`, `source`, `coverage`, and a status of `verified`, `estimated`, `partial`, `unavailable`, or `not_applicable`. Hover/click exposes numerator, denominator, exclusions, calculation and source records. Zero is a valid measured value; null means missing or not computable.

1. **Classification:** store environment, payment mode and traffic role separately. Traffic role is customer, founder, staff, synthetic, known bot or unresolved. Comp/free/promotion is a separate commercial property. Explicit audited classifications override device/source heuristics. Unresolved historical records appear separately; never quietly promote them into verified customers. Customer reporting excludes founder/staff/tests/comps/synthetics/known bots; retain operational visibility into every order in its environment.
2. **Sessions and journeys:** session is a visit with a proposed 30-minute inactivity boundary; journey is the resumable draft across sessions. Anonymous device identifiers are fallible pseudonyms, not people. Show independent customers only when an order identity can be resolved legitimately; show unresolved customer identity separately. Do not fingerprint or merge people by IP. Expose classification reason and version.
3. **Eligible entry cohort:** unique classified customer sessions that observed a supported customer entry in `[start, end)` in the selected timezone. Report the share that is unresolved or unmeasured; browser telemetry cannot count people who block it. Keep aggregate server entry requests as a separate diagnostic, not a human-session substitute.
4. **Conversion:** primary session CVR is eligible entry sessions with at least one linked verified live positive payment within 24 hours of entry / eligible entry sessions. One session counts once even with multiple orders. Mark the last 24 hours provisional and disclose maturity. Also show paid orders and journey conversion separately. The 24-hour horizon is a proposed reporting policy to revisit with data, not an observed completion window.
5. **Revenue by transaction time:** sum verified actual captured cents within the selected payment-time window. Show discounts, refunds, net receipts, currency and tax treatment explicitly. Do not require successful fulfillment to recognize a capture; paid-but-failed fulfillment remains a payment and an operational exception. A deferred-address purchase is also paid. Never derive money from an order's current fulfillment status.
6. **Financial views differ from cohorts:** label transaction-time revenue vs acquisition-cohort revenue. Refunds are cash movements at refund time; attach them to original acquisition cohorts when computing cohort contribution. Do not silently compare different windows.
7. **Contribution:** net receipts excluding pass-through taxes, less actual processing fees, supplier charges, variable generation cost, resends and other defined variable costs; subtract matched acquisition spend to show contribution after acquisition. Display cost coverage, invoice source and estimates separately. Unknown cost means contribution unknown. Do not call this company profit; fixed operating costs are separate.
8. **CPA and CAC:** CPA = matched campaign spend / attributed paid orders. CAC requires distinct verified new customers and the specified acquisition scope. Zero purchases with positive spend produces `No purchases`, with spend shown, rather than `$0 CAC`. Missing spend is unknown. ROAS is revenue/spend and does not establish profitability. No inferred LTV-based bidding advice.
9. **Funnel:** milestones require their own observed evidence and timestamp. Navigation, a loaded default note, an automatic cover, wallet availability and opening payment do not establish intent or completion. A valid unedited starter note can be deliberately confirmed; editing is diagnostic, not a requirement for conversion.
10. **Paths:** support custom vs preset cover, preset auto-load, guest vs returning, address completed vs deferred, wallet vs card, and resumed drafts. Show route-specific sequences and a payment-to-address-completion branch. Do not force these into one fabricated linear sequence. Strict ordered path counts are intersections of actually observed events in order, with missing-stage counts alongside.
11. **Inactivity:** active, inactive-unconverted, converted and outcome-unknown are separate states. Proposed active threshold 5 minutes; inactive after 30 minutes. Only mature unconverted cohorts are used for final abandonment. A tab close or missing event does not prove why someone left.
12. **Attribution:** retain first touch, current entry touch and order-linked attribution snapshot separately. Initial internal model: last observable non-direct touch within a disclosed 7-day window, plus first-touch context; preserve unattributed. Require paid-medium/campaign evidence or a verified paid-platform mapping; `fbclid` alone does not prove spend. Do not overwrite non-direct context with a direct return. Version this policy and state it on reports; do not expect internal figures to equal platform attribution.
13. **Comparisons:** equal-duration prior periods, identical definitions, explicit partial-day and changed-instrumentation warnings. Counts and denominators accompany rates; low samples get an uncertainty interval and descriptive wording, not winner badges. “0 of 12” is more useful than an unsupported ranking.

## Telemetry contract v2

Treat product analytics and application reliability as related but distinct evidence. Business events establish state transitions. Traces/logs explain execution. A vendor SDK or session replay is not a substitute for either contract.

### Common event envelope

```text
event_id (stable across retries), event_name, schema_version
occurred_at, received_at (server), environment, source (browser/server/provider)
session_id?, anonymous_id?, journey_id?, order_id?, payment_attempt_id?
request_id?, trace_id?, build_sha, experience_version, route_template
classification + reason/version (server-resolved), consent_state
attribution_snapshot_id?, experiment_exposures?, typed allowlisted properties
```

Server assigns trusted environment/source/classification and ingestion time. Treat client timestamps, IDs and trace headers as untrusted inputs: validate bounds and correlation; preserve clock-skew evidence. Avoid raw dynamic URL segments/tokens. Attach build and experience consistently, including default routes and flags. Session/client storage failures must not stop the product or silently discard all telemetry; mark degraded identity.

### Required events and precise triggers

| Domain | Event family | Evidence and properties |
| --- | --- | --- |
| Entry | `entry_viewed`, `builder_engaged` | Rendered usable entry; first deliberate builder interaction. Capture entry route, occasion ID, acquisition context and load timing |
| Cover | `cover_loaded`, `cover_selected`, `generation_requested/completed/failed` | Distinguish automatic/default from deliberate selection; record preset ID, operation ID, duration, retry, provider outcome and actual/estimated cost |
| Note | `note_template_loaded`, `note_edit_started`, `note_confirmed` | Emit edit-start once per draft editing phase; explicit confirmation after validation. Capture length bucket, edited flag, template and font IDs; no text or keystrokes |
| Address | `address_viewed`, `address_validation_failed`, `address_confirmed`, `address_deferred` | Role is sender or recipient; categorical field/error IDs; server validates final persisted state. No addresses or field values |
| Checkout | `checkout_requested`, `checkout_created`, `payment_ui_ready`, `payment_ui_failed` | Link draft revision to order and attempt; server reports intent creation, configured mode and amount; distinguish form opening from a real attempt |
| Wallet | `wallet_availability_observed`, `wallet_selected`, `wallet_canceled` | Availability is available/unavailable/unknown by method; selected method separate from verified method |
| Payment | `payment_attempted`, `payment_action_required`, `payment_failed`, `payment_canceled`, `payment_confirmation_observed` | Client lifecycle with safe failure category, stage, method and duration; confirmation cannot increment paid metrics |
| Financial authority | `payment_captured`, `payment_refunded`, `payment_disputed` | Server-verified provider facts, actual cents/currency, provider object ID, livemode and occurrence time; signed webhook or authenticated reconciliation |
| Fulfillment | `fulfillment_queued/submitted/failed`, `supplier_status_observed` | Server facts with attempt ID, supplier reference, idempotency key, safe error and provider-observed timestamp; preserve raw-to-normalized status mapping |
| Communications | `receipt_requested/accepted/delivered/failed` | Separate provider acceptance from delivery; no email content/address in analytics; correlate operational order and provider reference |
| Promotions | `offer_viewed`, `discount_apply_requested/applied/rejected/removed`, `discount_redeemed` | Offer/code version, distribution link and categorical rejection reason; redemption is server-authoritative and tied to one verified commercial order |
| Recovery | `draft_resumed`, `recovery_offer_viewed`, `recovery_purchase_linked` | Only link legitimately resumable drafts and verified paid orders. Contact eligibility and permission are explicit; no automatic outreach in this scope |
| Change | `experiment_exposed`, `control_changed`, `release_observed` | Assignment is stable; exposure records rendered experience, experiment/variant and deployment; audit changes with actor and before/after |

Typed emitter calls and runtime validation share a versioned schema. Unknown event names/properties are rejected or quarantined with counts visible to operators. Capture rejection reasons, rate limits, duplicates and consumer lag without retaining rejected sensitive payloads. Apply the same sanitization before any optional GA/ad forwarding; the existing browser forwarding spreads raw metadata.

### Storage and processing

Proposed architecture reuses Firebase and the current application; add an analytics store without rewriting checkout or fulfillment:

```text
Browser → validated first-party collector → durable event store → projections
Order/payment transaction → outbox → idempotent consumer ────────┘
Signed provider webhook → durable inbox → reconciliation ───────┘
                                          ↓
                  Firestore operational views + BigQuery reporting tables
                                          ↓
                        versioned, cached admin metrics API
API/jobs → structured logs + OpenTelemetry traces → reliability backend
```

- Use immutable accepted events and a durable inbox keyed by provider event ID. A transactional order state update and outbox record prevent a captured order from disappearing from analytics when telemetry fails. Do not claim exactly-once network delivery; implement at-least-once transport with idempotent effects.
- Durable uniqueness must cover provider event IDs and semantic business operations (payment capture, refund ID, supplier attempt). Duplicate provider events can reference the same object. Out-of-order events must not regress state. Stripe explicitly documents duplicate and unordered webhook delivery: [Stripe webhooks](https://docs.stripe.com/webhooks#event-ordering).
- Keep the existing raw history as legacy evidence. A replay tool updates analytics projections only; it must never call order processing, send email, charge a customer or submit fulfillment.
- Replace the global summary hot spot with per-session/journey projections and partitioned aggregates. Ingestion, projection and financial ledger updates need explicit durable transaction boundaries. A process-local queue is not cross-instance protection.
- Proposed reporting store: partitioned BigQuery tables for events, sessions, journeys, payment facts, order facts, ad spend, experiment exposures and operator changes; materialized/derived reporting tables from versioned definitions. Firestore retains operational records and fast exception views. Verify actual project IAM, billing, export support and query cost during implementation; this is a proposed choice, not a claim that a connector is already configured.
- Do not scan all historical Firestore events on dashboard refresh. Use indexed operational queries and bounded aggregate queries, separate from paginated journey/detail endpoints. Cache by scope and definition version; expose freshness and partial-source failures.
- Replace scalar `admin_ad_spend` with dated spend facts keyed by platform account, campaign/ad and day, including currency, account timezone, import source and sync time. Start with validated imports if API access is unavailable; clearly label imported vs synced. Add cost coverage and reconciliation before ROAS/CPA is actionable.
- Preserve legitimate unmatched payments/orders in an explicit exception table. Never create synthetic sessions to make counts reconcile.

## Reliability and observability

Use structured logs, metrics and correlated traces. [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) and [JavaScript context propagation](https://opentelemetry.io/docs/languages/js/propagation/) provide the portable instrumentation basis. Begin with the existing Google Cloud logging/monitoring stack if it meets retention, trace and error-grouping needs; no paid vendor purchase is necessary to approve this specification.

Instrument these paths: entry render → artwork generation → checkout/intent creation → payment verification → order processing → supplier submission → status update → receipt/deferred-address communication. External providers may not propagate our trace context; link asynchronous operations through stored correlation IDs and span links rather than implying visibility inside Stripe or Handwrytten.

Each error group shows affected unique journeys, customer-facing symptom, first/last seen, build, browser, trace and resolution. Prioritize blocked money and promises over raw error counts. Keep transaction identifiers in logs/traces and investigative tables, not high-cardinality metric labels.

| Signal | Proposed initial target or alert policy | Operator response |
| --- | --- | --- |
| Verified payment with no matching order/capture projection | Any unresolved case older than 5 minutes | Critical exception; inspect inbox/outbox and reconcile without charging again |
| Paid complete-address order not submitted | Older than 15 minutes, excluding intentional schedule/hold | Critical exception; inspect queue and supplier attempt before retry |
| Paid deferred-address order | Age buckets; proposed follow-up task at 24 hours | Review address-completion communication and eligibility, no automatic marketing send |
| Telemetry projection freshness | Target under 2 minutes; stale warning after 5 | Show stale/partial state, inspect ingestion and consumer health |
| Supplier, checkout and generation failures | Alert on repeated system errors, e.g. 3 within 10 minutes; count distinct operations | Group incident with affected journeys, avoid one alert per retry |
| Missing telemetry vs actual entry requests | Sustained divergence from established route/browser baseline | Investigate instrumentation/blocking; request counts are not session truth |
| Browser performance | p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 with sample counts | Compare supported entry routes and builds; investigate traces/errors |
| Admin data access | Proposed p95 aggregate API <1s on representative volume; first useful view <2s | Profile bounded queries/cache; show component errors instead of silent zeros |

These are proposed engineering thresholds, not measured current performance or supplier guarantees. Tune after observing normal traffic. Core Web Vitals thresholds follow [web.dev](https://web.dev/articles/vitals); instrument real visits and report sample coverage separately from lab tests.

Health is healthy, degraded, failing or unknown. Green requires recent successful evidence for the named check; configuration presence, card on file, no incidents and no traffic cannot prove end-to-end health. Show last checked, last success, error rate, latency and what the check actually covers. A non-billable synthetic can test entry and test-mode payment contracts with fulfillment hard-disabled. Never test production fulfillment as a health probe.

Alert state includes detected, acknowledged, investigating, resolved and verified, with owner, notes, next step and audit history. Query open incidents independently of the latest-history limit. Verify alert delivery configuration; do not silently equate a saved destination with a successful notification. Rate-limit and group notifications.

## Control and investigation behavior

- Every summary metric, funnel transition and exception opens a filtered evidence list; every row opens a chronological journey combining browser events, server transitions, payment facts, supplier observations, release/experiment context and trace links. Distinguish missing evidence from an observed failure.
- Orders show payment, address, fulfillment and communication states separately, with current age and next expected action. Operational lists default to exceptions across all relevant cohorts, so test exclusions cannot hide a stranded paid order. Global environment is always explicit.
- Preserve proof inspection, address repair, Stripe reconciliation and supplier status sync. Label read-only status checks separately from actions that can submit physical mail. Show actual available actions from state, not ambiguous Retry buttons.
- For a fulfillment retry, fetch current provider/order state, show duplicate risk and known attempt IDs, require deliberate confirmation of any billable submission, and enforce server-side idempotency and authorization. Ambiguous provider timeout requires reconciliation before resubmission.
- Rollout controls show configured flag, actual resolved route experience, build, cache status, last actor/time and observed exposures. Add staged percentages only with stable assignment and exposure measurement. Rollback restores a recorded configuration; financial effects and mailed cards cannot be rolled back.
- Proposed emergency controls: disable new checkout with a clear customer message; pause new fulfillment submissions while retaining paid orders in a visible queue; disable a failing generation provider/feature. Each needs a documented runbook, permissions, previewed effect, reason and audit record. No production control is changed by this specification.
- Promotions show effective payable amount, expiry, usage, revenue and actual margin coverage; preserve personal-sender targeting. Put SEO page maintenance under Growth/Controls rather than occupying primary executive navigation.
- Use existing authentication as a starting point; verify read/operator/owner permissions at server endpoints. Log changes and sensitive record reveals. Mask personal data by default and reveal it only in the operational record where necessary. Do not include draft content, contact details, bearer tokens or payment details in telemetry or traces.
- Proposed retention policy: raw product events 90 days, detailed diagnostics 30 days and pseudonymous daily aggregates 13 months; explicitly review legitimate needs before activation. Apply expiration, deletion and access controls to replicas and exports. Keep accounting/fulfillment records under their separately defined retention policy. No session replay in phase one; it would require a separate masking/consent and privacy review for this personal-message product.

## Discount codes as a first-class growth capability

Strengthen the existing system instead of replacing it with a generic settings form. The current [discount calculation](../lib/discount.ts) already supports fixed and percentage discounts, expiry, active state and usage caps. Preserve those capabilities and existing codes/links. The [usage recorder](../lib/firebase-admin.ts), `recordDiscountUsage`, currently reads and overwrites counters; reliable concurrent redemption needs a transactional ledger and idempotent order linkage. This is a source-level implementation concern, not a measured finding of oversubscription.

### Promotions workspace

Default table: offer/code, purpose, campaign/channel, lifecycle, discount/final price, exposed journeys, applied journeys, verified paid redemptions, discount dollars, net receipts, contribution and coverage. Include new vs repeat where customer identity is known. Drill into one offer to see the entire funnel and supporting orders, failures, refunds and distribution links. Usage counts alone are not an optimization dashboard.

- Preserve convenient presets, manual entry, fixed dollar amounts and percentages. Create campaign-specific, occasion-specific, launch, referral and recovery offers; provide templates rather than requiring them. Personal gifts remain the audience.
- Offer editor includes internal purpose, readable code, amount, starts/ends in an explicit timezone, total redemption limit, optional per-customer restriction, optional discount-dollar budget, campaign/landing associations, eligibility and stacking policy. Per-customer enforcement must state its identity limitations for guests; do not promise perfect prevention across anonymous devices.
- Lifecycle: draft, scheduled, active, paused, exhausted, expired, archived. Archive retains historical attribution and redemption facts. Pausing stops new applications according to a clear policy; accepted price quotes have a short disclosed validity period. Version changes so historical orders retain their actual terms. Do not silently change a captured amount when an offer changes.
- Creation preview shows `$9 base − discount = payable amount`, amount owed to Stripe, known/unknown variable costs and any intentional acquisition subsidy. For example, a `$2 off` offer produces a `$7` price; this is price arithmetic, not a claim about margin. Unknown supplier cost must not prevent routine code creation, but must remain visibly unknown. Allow a deliberate subsidy with an operator reason and budget.
- Provide landing-aware auto-apply share links with offer/distribution IDs and UTMs; preserve `/send/<occasion>` destination rather than always returning to `/`. Carry accepted offers through draft resume, step changes and checkout. Show applied savings and final price clearly, with easy removal or replacement; verify parity in supported mobile and in-app browsers.
- Preserve acquisition attribution when a returning visitor uses a recovery code. Offer/distribution touch is an additional dimension, not permission to rewrite the original paid source as email/direct. Manual entry also links the offer to its order.
- Server validates eligibility and payable amount at quote/intent creation and capture reconciliation. Keep one active discount per order initially; add stacking only with explicit precedence rules. Revalidate stale quotes, invalidate or update stale payment intents safely, and communicate any changed price before payment. Do not trust a browser-supplied discount amount.
- Enforce max uses and budgets transactionally. For scarce offers use expiring reservations linked to checkout attempts, then consume once on verified capture or completed free order; release on failure/expiry and reconcile lost callbacks. Define whether a refund restores eligibility; default to keeping the historical redemption and recording refund separately. Do not count repeated Apply clicks or webhook retries as redemptions.
- Keep 100%-off and comp flows available, with clear operator intent and separate commercial reporting. Successful free fulfillment can be useful product/recovery evidence; it does not become a positive paid conversion. Show free redemptions and their real fulfillment costs.
- Provide a non-billable preview/validation mode for a code and destination. Do not send a physical card or execute a live payment to test an offer.

### Performance and learning

Track offer exposure → application → server acceptance/rejection → checkout attempt → verified paid or completed free redemption → refund → fulfillment. Segment by source, destination, browser, experience and code version. Show invalid, expired, exhausted, ineligible and technical failures separately; broken code application can itself destroy conversion.

For each offer show application rate, applied-to-paid conversion, actual discount dollars, discounted receipts, cost coverage and contribution before/after acquisition spend. Keep discount dollars as a reduction from list price, not an additional cost subtracted a second time from already discounted receipts. Show discount issued/reserved separately from discount consumed.

An order using a code establishes redemption, not incremental lift. Compare randomized offer vs no-offer exposure only when traffic can support it; record assignment and measure all exposed eligible journeys, not just redeemers. Until then, show descriptive cohorts and uncertainty. Investigate whether codes are bringing additional orders, helping specific friction, or subsidizing purchases that might have happened anyway. Do not automatically kill codes on inconclusive samples.

Recovery tools should let the founder choose or create a relevant code and a legitimate resumable-draft link, preview savings and check contact eligibility. Copying a generic promo URL must not claim to restore a draft or imply a known recipient. Automatic outreach is a separate feature, not authorized by this review.

Acceptance: existing valid codes/links continue to work; a campaign offer is created with a correct destination and price preview; it survives navigation/resume; exhausted/expired/paused cases are explained; concurrent final-slot attempts cannot exceed the chosen policy; repeated payment callbacks consume one redemption; refunds and free orders remain distinguishable; every displayed dollar reconciles to actual order facts; no test submits live fulfillment.

## Learning and conversion optimization

Growth should make a bounded hypothesis reviewable: observation → candidate explanation → proposed change → exposure → outcome. An observation of unedited starter notes does not establish that copy is the cause of abandonment. Inspect render success, intent, validation, payment readiness, browser and latency first.

Create a short decision log with hypothesis, supporting cohort, alternative explanations, owner, change/build, primary outcome, guardrails and review date. Default early work to resolving reproducible defects and usability friction. At this traffic level, report experiments as gathering evidence until an appropriate sample and evaluation horizon exist; do not manufacture a universal sample-size target from an unverified baseline.

When experiments become appropriate: stable journey assignment, actual exposure events, predeclared primary metric, randomization checks, cost/refund/failure guardrails, sufficient cohort maturity, and uncertainty. Do not call a font popularity table an A/B test or automatically pause/increase ads based on a few sessions. Preserve custom artwork choice as a product hypothesis to investigate, not a feature this admin redesign authorizes removing.

## Delivery sequence and acceptance gates

### Phase 0 — Make current reporting honest

Reconcile the displayed paid order using read-only provider/order evidence. Correct explicit classifications with an audit trail; retain unresolved data. Remove unsupported claims, estimated-margin certainty, zero-spend profitability and automatic bid advice. Deprecate the browser paid alias and require verified payment facts for paid counts. Mark current inferred historical funnels as legacy/partial. Correct Meta labeling and surface the latest-50 limitation until the widget is replaced.

Gate: the known founder test is visible as a founder transaction and absent from independent-customer metrics; no unverified margin or wallet claim appears verified. No existing order/payment record is deleted to obtain a clean dashboard.

### Phase 1 — Establish measurement and financial truth

Implement contracts, typed emitters, durable inbox/outbox/dedupe, payment facts, journey/session classification, safe diagnostics and definitions. Include the discount redemption ledger, offer versioning and exposure/application events. Add reconciliation and data-quality views. Add dated spend and actual-cost ingestion. Run v2 alongside legacy reporting; explain differences rather than forcing equality.

Gate: fixtures cover duplicated, delayed, out-of-order, missing and forged events; server/client disagreement; captured-but-fulfillment-failed payment; partial/full refund; zero/free/comp/test orders; founder mobile/ad visits; real customer ultrawide display; multiple orders per session; resumed drafts; address deferral; timezone boundaries; storage failure and telemetry outage. Accepted events replay to identical projections without any external side effects. Payment/fulfillment tests use fakes or isolated test services with production fulfillment impossible.

### Phase 2 — Ship executive overview and investigations

Build the shell/global scope, scorecard, observed funnel, exception queue, growth summary, Promotions workspace and dedicated routes. Preserve current discount creation/share/toggle capabilities while adding destination-aware offers and performance drilldowns. Reuse order tools with explicit state and effects. All metric calculations come from the same reporting service, not independently reconstructed in components.

Gate: pixel/zoom/mobile criteria above pass; every summary opens its exact supporting cohort. Totals agree across overview/detail/export for identical definitions and scope. Failed/missing sources produce partial/unknown states. Recent-session pagination cannot change campaign totals. Operators can identify a blocked paid order and open its evidence within two interactions.

### Phase 3 — Close the operating loop

Add correlated traces, measured integration health, non-billable synthetic checks, alert grouping/verification, safe pause/retry/rollback, release annotations and experimental exposure. Integrate ad APIs if permissions and value justify them.

Gate: failure drills prove that lost telemetry cannot erase financial truth; duplicate webhooks cannot duplicate capture counts or physical orders; provider timeout is investigated before retry; changing an operator flag produces an audit entry and demonstrable resolved behavior. Simulated faults generate one actionable incident and a tested notification route in an isolated environment.

### Phase 4 — Optimize from evidence

Use the observed data to select the first conversion intervention. Add mature retention/repeat-purchase cohorts when real customers and time make them meaningful. Keep valuation modeling subordinate to measured economics.

Gate: each optimization has a documented hypothesis, exposed cohort, primary metric and guardrail. Any claimed lift has defensible denominators, horizon and uncertainty; no forecast is promoted to a measured result.

## Definition of success

The founder can open the overview and understand demand, conversion, acquisition spend, delivery exceptions and measurement confidence in about 30 seconds. A questionable number can be traced to evidence; a failing order can be investigated safely; a change can be connected to its actual exposure and outcome. This is a proposed usability target to validate with the founder, not a current performance claim.

The immediate recommendation is to approve phases 0–2 as the first implementation scope, with reliability foundations included in phase 1 and deeper operations following in phase 3. Layout polish and a larger analytics vendor alone will not achieve the goal.
