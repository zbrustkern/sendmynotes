# SPRINT-0010: Close the learning loop and prepare a verified release

Status: active. Local implementation and isolated verification exist; acceptance and external release gates remain open. See the takeover readiness checkpoint.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Make business changes reviewable against actual exposures and produce an integrated, honest deployment-readiness packet.

## Scope and non-goals

Decision log, stable exposure contract, descriptive/eligible experiment reporting, integrated migration rehearsal, regression/security/performance evidence and release runbook.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0007, SPRINT-0008, SPRINT-0009. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): new Growth decision/exposure views and APIs; active experience exposure hooks; sprint evidence folders; reporting adapters; migration/replay tools; release/runbook docs.

## Ownership and coordination

Coordinator integrates all lanes and owns final acceptance. A reviewer distinct from the implementing lane checks financial/privacy/control boundaries where the orchestrator supports independent review; disclose any gap.

## Ordered tasks

### SPRINT-0010-T01: Decision log and bounded learning

After: none.

Record hypothesis, observation/cohort, alternatives, owner, change/build, primary metric, guardrails and review date. Link decisions to exposures and outcomes; support gathering-evidence states and descriptive reporting before mature experiments.

### SPRINT-0010-T02: Stable assignment and exposure

After: T01.

Where experiments are warranted, implement minimal stable journey assignment, actual rendered exposure, predeclared metric/horizon and assignment checks. Keep release exposure without experiments useful; no speculative provider framework or revival of old version toggle.

### SPRINT-0010-T03: Migration and rollback rehearsal

After: T02.

Run analytics-only backfill/shadow readers on synthetic representative volume with counts/checksums/checkpoints and deliberate interruptions. Prove reader rollback preserves ledger/redemptions/queues and all legacy entry/admin URL compatibility.

### SPRINT-0010-T04: Integrated acceptance and release gates

After: T03.

Run audited safe tests/type/build, privacy/auth/financial/discount/failure regression, dashboard screenshot matrix and bounded query/view timing. Produce a coverage map back to the overhaul spec, separating external missing inputs and inherited defects.

### SPRINT-0010-T05: Readiness packet and handoff

After: T04.

Deliver evidence index, actual verification levels, remaining infrastructure/device/provider gates, release order, monitoring/abort/rollback procedures and first proposed conversion investigation. Update ledger only on evidence. Do not deploy or claim uplift during readiness.

## Acceptance criteria

- SPRINT-0010-AC01: Decision log ties a proposed change to observable cohort/exposure and predeclared outcomes; small samples and code redemption never become causal lift or bidding advice.
- SPRINT-0010-AC02: Backfill/replay is resumable/idempotent and incapable of payment/email/physical fulfillment; shadow differences are explained rather than forced equal.
- SPRINT-0010-AC03: End-to-end synthetic paid/discounted/free/deferred/refunded/failed and retry scenarios reconcile across Overview, Growth, Promotions, Journeys, Orders and Economics.
- SPRINT-0010-AC04: Readiness packet states built/local/staging/production verification separately, lists every unrun external check and supplies a concrete rollout/rollback procedure without executing production changes.

## Validation and evidence

Integrated emulator/fake scenarios, audited safe current build/type commands, browser accessibility/visual matrix, representative-volume timing and reviewer acceptance matrix. Real Apple Pay/Safari/Meta/provider checks only when separately available and authorized.

Write `docs/sprints/evidence/SPRINT-0010/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Program completion is engineering capability, not proof of commercial traction. Unknown invoice costs or cloud access may remain release gates and must not be converted into defaults.

Rehearse compatible reader/UI rollback and consumer pause while retaining new immutable facts and accepted commitments; no destructive migration or production TTL activation.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
