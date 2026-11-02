# SPRINT-0004: Build coherent reporting, spend and actual-cost coverage

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Provide one bounded, versioned reporting API that reconciles observed cohorts, financial transactions and acquisition economics.

## Scope and non-goals

Reporting models, projections/replay, attribution, imports, quality metadata and drilldown contracts. No ad-platform automation or new vendor purchase.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0002, SPRINT-0003. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): lib/metrics-rollup.ts; app/api/admin/metrics/route.ts; app/api/admin/ad-spend/route.ts; lib/types.ts; reporting modules/adapters and import endpoints to add.

## Ownership and coordination

Reporting lane owns semantic definitions and aggregate API. Financial and telemetry lanes supply immutable evidence contracts; UI consumes frozen fixtures.

## Ordered tasks

### SPRINT-0004-T01: Storage decision and bounded adapters

After: none.

Record BigQuery feasibility/IAM/billing, query limits, operational Firestore projections and local/emulator strategy. Implement storage-independent API contracts and indexed bounded reads; no historical full scan on refresh. If cloud provisioning is unavailable, expose the adapter gap explicitly.

### SPRINT-0004-T02: Cohort and funnel projections

After: T01.

Implement entry cohorts, maturity, timezone/DST, session vs journey conversion, observed ordered intersections, missing/skipped evidence, active/inactive states and address-deferral branches. Keep legacy evidence separate; no superset propagation.

### SPRINT-0004-T03: Financial and acquisition reports

After: T02.

Separate transaction-time receipts/refunds from acquisition-cohort revenue; calculate actual-cost contribution and coverage. Normalize attribution with unknown/unattributed states; use full cohort, never recent-session samples or fabricated visitors. Implement counts/denominators and provisional comparisons.

### SPRINT-0004-T04: Dated spend and cost inputs

After: T03.

Create authenticated validated idempotent imports for dated campaign spend, invoice allocations and actual processing fees with source/currency/timezone/provenance. Preview imports, detect duplicates and corrections; keep estimates distinct and avoid double subtraction of discounts.

### SPRINT-0004-T05: Replay, quality and parity

After: T04.

Implement resumable analytics-only replay, cached scope keys, source freshness/error/coverage and metric drilldown cursors. Prove identical fixture totals across aggregate/detail/export and reader rebuild; document cloud/performance checks not executed.

## Acceptance criteria

- SPRINT-0004-AC01: Golden scenarios with missing stages, deferred address, founder-mobile, ultrawide customer, multiple orders/session and late refunds match documented definitions.
- SPRINT-0004-AC02: Paid sessions count once while paid orders remain separate; 0 denominators/missing spend/costs are never defaulted into profitability.
- SPRINT-0004-AC03: Changing the recent-session page cannot change campaign totals. Unknown attribution and unmatched financial facts remain visible; every metric has definition/status/window/asOf/coverage.
- SPRINT-0004-AC04: Replay has no external side effects; repeated imports do not double spend/costs; queries are bounded and measured against disclosed representative volume.

## Validation and evidence

Table-driven golden cohort and ledger fixtures, DST/timezone boundaries, role checks, pagination/export parity, duplicate imports and projection concurrency tests. Profile aggregate queries and record dataset size/cache conditions.

Write `docs/sprints/evidence/SPRINT-0004/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Supplier charges and ad access are unresolved. Missing external evidence must not block local semantics but must prevent verified economics or cloud-readiness claims.

Version projections/API and switch compatible readers; retain immutable evidence/import history. Replay can rebuild new projections without deleting old operational or financial records.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
