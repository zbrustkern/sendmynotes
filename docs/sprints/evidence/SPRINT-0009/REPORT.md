> **Current takeover status (October 19):** The earlier report below is historical. Integrated checks and remaining acceptance gaps are recorded in [the Codex/Luna readiness checkpoint](../../../../.delivery/runs/20261019-codex-luna-takeover/READINESS.md). A passing fixture suite is not staging/production or visual acceptance.

# SPRINT-0009 implementation report

Status: implementation partial; reviewer verification and several acceptance items remain open.

Source revision: `f9f187e0498ffb6b586c9970aeda8aa3fcf92f96` plus the pre-existing uncommitted overhaul work. No deployment, live provider call, payment, email, fulfillment, production configuration change, or production TTL activation was performed.

## Delivered in this implementation pass

- Added persisted checkout, fulfillment-submission, and artwork-generation controls with actor, required reason, monotonically increasing version, effect preview, and append-only audit records.
- Enforced checkout pause before card intent creation and free-order acceptance; enforced generation disable before generation; enforced fulfillment pause before supplier submission from paid-order processing, free-order processing, and manual retry. Captured orders remain queued when supplier submission is paused.
- Added an authenticated reliability endpoint and admin panel. Health stays `unknown` without a recent complete successful synthetic check; an empty queue is also `unknown`. Open incident count is queried separately from history. Queue age is derived from currently visible outbox entries and labeled state-only. Alert configuration is shown as unverified. Versioned retention/access/deletion-propagation policy is prepared with production TTL inactive; disposable fixture expiry is tested.
- Changed the no-open-incident heading from “All Systems Operational” to “Health Evidence Unknown.” The incident feed now unions recent history with all currently open incidents.
- Added incident grouping by explicit operation class (or normalized failure summary), occurrence counts, correlated operation IDs, diagnostic PII/secret redaction, and one alert per newly opened group. The alert dispatcher has a test-only injectable in-memory sink.
- Added an audited incident lifecycle UI/API for acknowledgement, owner, investigation, resolution, and verification. State changes and their audit records are written in one transaction; verification requires a resolved incident.
- Added operation IDs at checkout-intent creation and artwork generation. The ID is returned in the response header; checkout stores it on the order and Stripe PaymentIntent metadata. Confirm-order and webhook propagation still need the integration hook described below.
- Expanded safe scenarios in `tests/sprint-0009-reliability-controls.test.ts`.

## Task and acceptance status

| Item | Status | Evidence / limitation |
| --- | --- | --- |
| T01 correlated execution evidence | Partial | Checkout-intent and generation IDs flow into order/payment-intent metadata and incident fields. Confirm-order, capture verification, supplier, and communication propagation await the parent-owned webhook/processor integration. |
| T02 measured health and consumer view | Partial | Unknown states, independent open incidents, queue-state diagnostics, and prepared retention/access/deletion policy are implemented and fixture expiry tested. No isolated end-to-end synthetic probe or worker-success heartbeat exists, so green health and measured latency/error rates remain unavailable. |
| T03 lifecycle and grouped alerts | Partial | Lifecycle UI/API, atomic audit, group occurrence accounting, PII/secret redaction, and an isolated in-memory alert sink are implemented and tested. Real email delivery remains unverified; the test-email action was not invoked. |
| T04 safe controls | Partial | Server checks are wired to active intent/free-order, generation, paid dispatch, free dispatch and manual retry paths. Effects are previewed and changes audited. Resume does not start a new queue drain; existing queue/dispatch reconciliation foundation is incomplete, so exactly-once queue resumption is not established. |
| T05 isolated failure drills | Partial | Exercised checkout/generation pause, grouping of two operation failures, notification through an in-memory sink, redaction, old open-incident retrieval, lifecycle transitions, and expiry fixtures. Provider timeout, payment capture preservation, callback duplication, worker lag, and retry reconciliation drills remain unrun. No provider, payment, supplier, email, or production APIs were called. |
| AC01 unknown/stale health semantics | Partial | Missing checks stay unknown; stale checks are not green; empty incident/queue state does not imply green. |
| AC02 journey/order/build/operation links | Partial | Checkout and generation operation IDs are linked to orders, PaymentIntent metadata, and grouped incidents. Confirm/webhook propagation, capture-preservation, build identity, and telemetry-loss drills remain incomplete. |
| AC03 authorized audited pause controls | Partial | Authenticated admin API, required reason, actor/version audit, active server enforcement, and queued-order preservation are implemented. Exactly-once resume is not verified. |
| AC04 isolated grouped alerts | Partial | The isolated test verifies one grouped incident and one notification through an injected sink. Fault-class coverage and real production alert delivery remain unverified. |

## Validation

- `./node_modules/.bin/tsc --noEmit`: exit 2 with 12 errors, all in existing tests (`email-transactional`, `founder-filter-and-real-edit`, `render-auto-select`, `root-auto-select`, and `security-review-remediation`). No errors point to Sprint 0009 changes. Parent reported the same 12-error baseline before this implementation.
- `node --import tsx tests/sprint-0009-reliability-controls.test.ts` from an isolated `/private/tmp/reliability-qa` copy with `.data` and `.env*` excluded: passed. Scenarios cover control API auth/audit and enforcement, operation ID response correlation, unknown health, empty queue, independent old-open query, alert grouping/delivery to a fake sink, PII/secret redaction, lifecycle transition constraints, and expiry fixtures. The shared project copy was used once before the isolation instruction; the test restores the exact mock collections it touches and made no external calls.
- `npm run build`, lint, and existing test suites: not run. No build/lint/test execution paths beyond the focused safe harness were needed for the current type check; fulfillment scripts were not run.
- Real email delivery, cloud Firestore behavior, real provider health, worker lag/heartbeat, actual retention/deletion propagation, staging, and production: not verified.

## Migration, rollback, and next action

The implementation uses additive `system_config`, `operational_control_audit`, `operational_incident_audit`, and optional `reliability_checks/synthetic` documents; it does not create a TTL policy or delete operational records. Rollback is code rollback after review; preserve audit records and paid order documents. A paused supplier queue must be inspected and reconciled before any manual retry because supplier timeout outcomes can be ambiguous.

Next: parent-owned webhook/payment/foundation work should propagate the stored `operationId` from PaymentIntent metadata into capture/order diagnostics and provider event records. Add a non-billable isolated synthetic check and worker heartbeat only where actual consumers can emit evidence; then run the provider timeout, capture preservation, callback duplicate, lag, and inspect-before-retry drills. Resolve the 12 baseline test typing failures separately and request independent reviewer acceptance. Do not mark the sprint complete yet.
