# SPRINT-0002: Establish durable financial truth and reconciliation

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Make verified captures/refunds and order transitions durable even when analytics or downstream processing fails.

## Scope and non-goals

Payment facts, signed webhook inbox, transactional outbox, idempotent consumers and read-only reconciliation. Preserve existing fulfillment locks and ownership checks.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0001. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): lib/order-processor.ts; lib/firebase-admin.ts; lib/stripe.ts; app/api/webhooks/stripe/route.ts; app/api/checkout/*; order and payment types; new domain ledger modules.

## Ownership and coordination

Financial lane exclusively owns order/payment transaction boundaries. Telemetry lane consumes its frozen outbox/fact interfaces; offer lane integrates only after those contracts stabilize.

## Ordered tasks

### SPRINT-0002-T01: Financial fact model

After: none.

Represent actual captures, partial/full refunds and disputes independently from fulfillment status, with provider ID, livemode, actual cents, currency, timestamps and separate commercial/traffic classification. Preserve legitimate unmatched records.

### SPRINT-0002-T02: Durable inbox and transactional outbox

After: T01.

Verify signatures, durably accept provider events and couple accepted order/payment transitions with outbox writes. Preserve fail-closed behavior; no successful acknowledgement before durable acceptance. Avoid adding a parallel payment authority path.

### SPRINT-0002-T03: Idempotent processing and recovery

After: T02.

Deduplicate provider event IDs and semantic operations; tolerate out-of-order delivery and worker retries. Implement the actual authenticated consumer/dispatch entry point, durable leases, retry/backoff, dead-letter handling and recovery configuration so the outbox is not merely a table without a runner. Prepare infrastructure/configuration for separately authorized deployment; local tests invoke the same worker through fakes. Resume interrupted outbox work without double capture counts, duplicate emails or supplier submission. Never rerun external effects in analytics replay.

### SPRINT-0002-T04: Reconciliation and legacy mapping

After: T03.

Build authenticated read-only dry-run comparison of provider facts/orders/projections with resumable checkpoints and redacted exceptions. Map historical evidence to verified/legacy/unresolved, preserving provenance. Prepare separately scoped corrections, not automatic production writes.

### SPRINT-0002-T05: Failure and access gates

After: T04.

Exercise concurrent consumers, telemetry failure after capture, address deferral, failed supplier fulfillment, refunds, free/comp/test modes and mismatched amount/currency. Check role/ownership and absence of sensitive trace payloads.

## Acceptance criteria

- SPRINT-0002-AC01: Repeated or semantically duplicate capture events produce one fact; distinct refunds remain distinct and out-of-order delivery does not regress state.
- SPRINT-0002-AC02: Captured money remains visible when analytics is down, fulfillment fails or recipient address is deferred; free/test/comp facts do not become independent paid orders.
- SPRINT-0002-AC03: Crash recovery preserves durable acceptance and state/outbox consistency. Analytics replay cannot invoke payment, mail, email or order processing effects.
- SPRINT-0002-AC04: Reconciliation is dry-run/read-only by default, supports unmatched records and produces counts/provenance with no credentials/PII exported.

## Validation and evidence

Fake signed webhook and emulator transaction/concurrency tests; crash injection at each durable boundary. Assert actual cents, currency and refund arithmetic. Run affected security/payment-mode suites only after safety audit.

Write `docs/sprints/evidence/SPRINT-0002/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Existing processor may combine payment and fulfillment. Refactor boundaries incrementally; do not weaken its current idempotency or acknowledgement semantics. Real provider reconciliation is separately evidenced.

Additive collections and compatibility readers; drain/pause new consumers safely before reader fallback. Never delete or reverse captured facts or resend physical orders as rollback.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
