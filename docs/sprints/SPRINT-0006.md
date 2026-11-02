# SPRINT-0006: Deliver the compact executive overview and admin shell

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Make the five CEO questions answerable from a compact overview with consistent scope and immediate evidence navigation.

## Scope and non-goals

Addressable admin shell, global scope, overview and route scaffolds. Existing operator tools remain accessible while dedicated pages follow.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0004. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): app/admin/page.tsx; app/admin layout/routes to add; components/admin/*; aggregate/detail APIs and existing admin auth.

## Ownership and coordination

Portal lane owns shell/navigation and presentation. Metric definitions stay in 0004. Coordinate route extraction with investigations and Promotions owners.

## Ordered tasks

### SPRINT-0006-T01: Authenticated shell and scope

After: none.

Create Overview, Growth, Promotions, Journeys, Orders, Reliability, Controls and Economics navigation with shareable query scope, environment, timezone, range/comparison, classification and channel/experience/browser filters. Prevent stale response races and preserve scope on drilldown.

### SPRINT-0006-T02: Executive overview

After: T01.

Render four compact metrics, observed funnel/branch summary, ranked exceptions, full-cohort top acquisition rows and measurement health. Move supplier configuration and repeated forensic tables out of primary space. Use status/coverage and unknown states from API.

### SPRINT-0006-T03: Evidence navigation and continuity

After: T02.

Each summary opens exact scoped evidence, not a locally reconstructed table. Route placeholders must have a real existing compatible destination until later sprints replace them. Preserve old admin URLs and operator features; no dead navigation or hidden discount tools.

### SPRINT-0006-T04: Responsive and accessible states

After: T03.

Use fluid width and dense readable tables; validate loading/error/partial/stale/empty/zero and populated states, keyboard/focus, 390px and 200% zoom. Financial facts must not flash false zeros during loading.

### SPRINT-0006-T05: Visual gate and parity

After: T04.

Capture sanitized synthetic screenshots and walkthroughs at agreed desktop/mobile sizes; assert scope persistence, data parity, no PII exposure and correct action placement. Record first useful-view timing conditions.

## Acceptance criteria

- SPRINT-0006-AC01: At 1440x900/100% zoom, scope, scorecard, complete funnel and at least three actionable exceptions are visible without scrolling.
- SPRINT-0006-AC02: 390px and 200% zoom remain usable with keyboard/focus/textual statuses and labeled table overflow; no tiny type used to force density.
- SPRINT-0006-AC03: Metric clicks preserve exact evidence scope and totals; refresh failures show partial/stale state instead of false healthy/zero.
- SPRINT-0006-AC04: Orders, existing discounts and other operational controls remain accessible throughout extraction; no financial calculations are duplicated in components.

## Validation and evidence

Browser walkthrough with synthetic contract fixtures plus API-to-UI parity checks and auth boundary tests. Capture desktop/mobile/zoom screenshots; record timing environment and sample count.

Write `docs/sprints/evidence/SPRINT-0006/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

The current admin page is monolithic. Extract small route modules behind a shared authenticated boundary; avoid wholesale rewrite of working order actions during layout work.

Keep old admin entry as compatible route/reader until parity passes. Revert shell routing without reverting data contracts or losing access to operator functions.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
