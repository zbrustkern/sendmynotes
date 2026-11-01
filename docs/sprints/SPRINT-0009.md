# SPRINT-0009: Deliver measured reliability and safe operational controls

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Detect customer-impacting failures and give the founder auditable interventions whose state and effect can be verified.

## Scope and non-goals

Structured logs/traces, measured health, job/consumer diagnostics, grouped alerts, scoped roles and checkout/fulfillment/generation pause controls.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0002, SPRINT-0003, SPRINT-0007. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): lib/incident-logger.ts; email alert paths; admin incidents/control APIs; payment/fulfillment/generation entry points; trace/log configuration; new reliability/control UI.

## Ownership and coordination

Reliability lane owns instrumentation/runbooks and control contracts. Financial/fulfillment owner reviews pause/retry/resume boundaries; no old V2/V3 selector is recreated.

## Ordered tasks

### SPRINT-0009-T01: Correlated execution evidence

After: none.

Instrument entry, generation, intent, capture verification, order processing, supplier and communication operations using request/trace/operation links across async boundaries. Redact secrets/PII; avoid high-cardinality metric labels and invented provider-internal traces.

### SPRINT-0009-T02: Health and consumer views

After: T01.

Show healthy/degraded/failing/unknown with last check/success, coverage, latency, error rate, inbox/outbox/projection lag and current open incidents independent of history limit. Add non-billable isolated synthetic checks with fulfillment impossible. Prepare versioned retention/access/deletion-propagation configuration for events, diagnostics and exports, separately from accounting records; test expiration on disposable fixtures. Do not activate production TTL or destructive cleanup without separate authorization.

### SPRINT-0009-T03: Incident lifecycle and grouped alerts

After: T02.

Implement acknowledge/owner/investigating/resolved/verified with age/impact/runbook and audit. Group repeated distinct-operation failures, test delivery in isolated environment, distinguish saved destination from verified delivery; define stale/low-volume/no-traffic handling.

### SPRINT-0009-T04: Safe controls and enforcement

After: T03.

Add server-enforced checkout pause, fulfillment submission pause and generation disable with effect preview, actor/reason/version, role checks and current resolved state. Preserve existing accepted payments and visible queue; resume exactly once. Use deployment rollback for retired experience switches.

### SPRINT-0009-T05: Isolated failure drills

After: T04.

Inject provider timeout, missing telemetry, consumer lag, callback duplicates and stale health; verify one actionable incident, correct alert route, preserved capture facts, no duplicate physical order and inspect-before-retry behavior. Prepare concrete production enablement steps separately.

## Acceptance criteria

- SPRINT-0009-AC01: Green health requires recent positive evidence; no-incidents/no-traffic/configuration does not imply end-to-end success.
- SPRINT-0009-AC02: Failures link affected journeys/orders, build and operation evidence; lost telemetry cannot erase payment truth or hide open historical incidents.
- SPRINT-0009-AC03: Pause/resume is server enforced, authorized and audited, preserves paid queues and cannot duplicate external effects. No obsolete version-control plane is resurrected.
- SPRINT-0009-AC04: Isolated drills produce grouped actionable incidents and verified test notification; real production alerts/infrastructure remain separately scoped.

## Validation and evidence

Fake provider and worker fault injection, permission/control enforcement tests, idempotent queue resume, trace redaction checks and isolated alert sink assertions; record actual vs not-run cloud delivery checks.

Write `docs/sprints/evidence/SPRINT-0009/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

An external provider timeout may have succeeded remotely. Never automatically retry billable submission until reconciliation resolves ambiguity; queue pause is not cancellation.

Version/restore control config while retaining audit; distinguish reader rollback from stopping consumers. Resume only with durable leases/attempt IDs and reconciliation; never delete paid queues.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
