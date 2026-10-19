# SPRINT-0007: Build order, journey and economics investigations

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Let the founder explain a questionable metric and safely investigate a blocked order within two interactions.

## Scope and non-goals

Paginated Journeys/Orders/Economics routes, unified evidence timeline, operational exception views and preserved safe order tools.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0006. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): components/admin/OrderJourneyDrawer.tsx; ProofInspectorModal.tsx; AddressRetryModal.tsx; order-proof/sync/retry APIs; new admin evidence routes; financial detail/reporting adapters.

## Ownership and coordination

Investigation lane owns list/drawer presentation and read APIs. Existing operation endpoints retain their authority; financial lane reviews any state/action refactor.

## Ordered tasks

### SPRINT-0007-T01: Full evidence lists

After: none.

Implement scoped server pagination/search for sessions, journeys, payments and orders. Independent operational filters include all relevant cohorts to avoid hiding stranded payments behind customer-only filters. Enforce role-based reads and default PII masking.

### SPRINT-0007-T02: Chronological timeline

After: T01.

Combine observed client milestones, server state transitions, payment facts, offers, provider observations, release/build and trace links with source/timestamp labels. Show missing evidence, unknown identity and multiple-session resumes explicitly.

### SPRINT-0007-T03: Exception and safe action parity

After: T02.

Rank paid-unmatched, paid-failed, awaiting-address, queued/stale submission and communication failures by impact/age. Preserve proof, address repair and status/reconciliation tools; distinguish read checks from billable retry and require current-state/duplicate checks before submission.

### SPRINT-0007-T04: Actual economics detail

After: T03.

Expose transaction vs cohort views, dated spend/cost provenance, refund/fee/cost coverage, unmatched facts and export parity. Keep scenario/valuation modeling explicitly separate and suppress unsupported recommendation language.

### SPRINT-0007-T05: Authorization and operator walkthrough

After: T04.

Exercise ownership/role denial, masked reveals/audit, expired tokens, paginated historical data and paid-but-failed cases. Demonstrate two-interaction access from overview and exact aggregate/detail/export totals.

## Acceptance criteria

- SPRINT-0007-AC01: Every overview evidence link opens the correct scoped full dataset; search/pagination cannot change aggregates or omit older open exceptions.
- SPRINT-0007-AC02: Payment, address, fulfillment and communication states remain independent; submitted/mailed are never claimed as physically inking/delivered without evidence.
- SPRINT-0007-AC03: Existing safe order tools remain functional, and any billable retry is clearly distinguished, state-checked, authorized and idempotent.
- SPRINT-0007-AC04: Economics shows known vs estimated vs missing costs with exact order/payment provenance and no raw note/address analytics.

## Validation and evidence

Synthetic browser walkthrough, evidence API role/privacy tests, mocked order-tool regressions, paging/filter/export parity and ambiguity-before-retry tests. No live dispatch or customer reveal in screenshots.

Write `docs/sprints/evidence/SPRINT-0007/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Operational scope differs deliberately from customer conversion scope. Label the distinction prominently; do not let global founder exclusion conceal paid exceptions.

Compatible routes/readers and existing action endpoints remain available. Never reverse payment, mail or audit facts when changing investigation UI.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
