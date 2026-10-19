# SPRINT-0001: Restore reporting trust and freeze shared contracts

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Make current reporting honest and establish the current implementation inventory, safe test baseline and contracts needed for independent builder lanes.

## Scope and non-goals

Current admin correctness, source/consumer inventory, schema/API contracts and synthetic fixtures. No broad UI rewrite or provider-side mutation.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: None. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): app/admin/page.tsx; components/admin/*; lib/metrics-rollup.ts; lib/telemetry-schema.ts; active builder imports; checkout/discount endpoints; package.json; tests.

## Ownership and coordination

Coordinator owns shared contracts/types, test harness and hotspot assignment. Reporting/copy tasks can be separate only after the inventory.

## Ordered tasks

### SPRINT-0001-T01: Inventory and baseline

After: none.

Trace actual public/admin routes and active builder/payment/discount consumers. Compare cleanup work with this checkout; inventory tests and scripts for network/fulfillment effects. Record existing type/build errors and provider access without printing credentials.

### SPRINT-0001-T02: Freeze contracts and golden evidence

After: T01.

Define typed event, financial fact, metric scope/coverage, drilldown and offer lifecycle contracts in focused modules. Commit representative synthetic fixture identities and expected results; record all proposed reporting defaults.

### SPRINT-0001-T03: Close financial aliases and founder heuristics

After: T02.

Browser payment-success aliases, including step_6_paid_order, cannot count as paid. Use verified server facts where available and explicit unknown states otherwise. Explicit founder/test classification overrides mobile/ad tags; remove resolution/email-substring identity assumptions.

### SPRINT-0001-T04: Correct misleading portal claims

After: T02.

Remove factual certainty for assumed margins/fees, missing spend profitability, wallet tests and supplier details. Unresolved revenue classification stays visible. Label legacy inferred funnels and sample-limited campaign data; correct Meta normalization without inventing paid provenance.

### SPRINT-0001-T05: Safe validation and reconciliation packet

After: T03, T04.

Build a fake/emulator test entry point that denies live supplier/payment/email effects. Prepare read-only reconciliation evidence for the displayed paid order; apply no production correction. Document unresolved access and the exact future reconciliation procedure.

## Acceptance criteria

- SPRINT-0001-AC01: No browser event or missing/default amount produces a verified paid count; test/founder records are excluded without excluding an unrelated ultrawide customer.
- SPRINT-0001-AC02: Unknown cost/spend and zero-denominator states are explicit; no assumed LTV recommendation or unsupported product/wallet verification survives in touched admin surfaces.
- SPRINT-0001-AC03: Contracts and golden fixtures name stable IDs, statuses, timezone, classification precedence, maturity, attribution and offer boundaries; downstream lanes can build against them.
- SPRINT-0001-AC04: Test harness proves external effects are denied; baseline failures and the unresolved historical transaction are recorded honestly. No record is deleted or reclassified without evidence.

## Validation and evidence

Run focused mocked authority/founder/unknown-state tests and inspect representative admin states. Review the consumer inventory and safe-command allowlist. Record type/build baseline before implementation; do not run historical fulfillment tests.

Write `docs/sprints/evidence/SPRINT-0001/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

The cleanup audit may describe code no longer active. Provider evidence may remain unavailable; unknown is a valid required state, not permission to infer a customer.

Small reporting corrections must remain backward compatible. Retain raw history and existing operator functionality; revert presentation/reader changes without undoing financial records.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
