# SPRINT-0005: Strengthen discount pricing, redemption and auto-apply

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Preserve every useful existing code capability while making offers reliable across checkout, resume, concurrent redemptions and reporting.

## Scope and non-goals

Offer versions/quotes/reservations/redemptions, legacy compatibility, validation and active storefront auto-apply plumbing. Promotions UI arrives in 0008.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0002, SPRINT-0003. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): lib/discount.ts; lib/firebase-admin.ts discount helpers; app/api/admin/discounts/route.ts; app/api/discount/*; checkout/free-order/processor routes; active builder/payment/draft paths.

## Ownership and coordination

Offer lane owns pricing contracts and redemption logic. Checkout/order hotspots integrate through the financial lane owner; telemetry hooks reuse 0003.

## Ordered tasks

### SPRINT-0005-T01: Versioned offers and compatibility

After: none.

Map existing codes into additive offer versions without deletion. Preserve fixed/percentage/100%-off/manual/comp behavior, expiry/caps and all accepted discount/code/promo URL aliases. Define scheduled/active/paused/exhausted/expired/archive state and price-quote validity.

### SPRINT-0005-T02: Authoritative quotes and concurrency

After: T01.

Server computes cents and eligibility. Add transactional reservations/budgets with expiry, semantic order-linked redemption and explicit refund policy. Match payment amount to accepted immutable offer snapshot; stale intent/quote changes require visible price reconfirmation.

### SPRINT-0005-T03: Destination-aware application and resume

After: T02.

Auto-apply supported URL offers on every active route, preserve campaign/occasion destination and attribution, persist accepted offer through legitimate draft resume, and allow removal/replacement. Handle no-storage/dead links and invalid/expired/exhausted cases clearly.

### SPRINT-0005-T04: Capture/free-order and telemetry linkage

After: T03.

Consume once after verified paid capture or successful free order; distinguish reservations and application from consumption. Link offer/distribution/version/order while preserving original source. Coordinate crash recovery, lost callbacks and provider retries with 0002.

### SPRINT-0005-T05: Abuse and compatibility gates

After: T04.

Exercise concurrent final-slot, cap/budget rollover, stale quotes, cancellation, duplicate callbacks, partial/full refunds and 100%-off flows. Guest identity limits are explicit; cost unknown does not forbid legitimate offer creation.

## Acceptance criteria

- SPRINT-0005-AC01: Existing valid code links and manual entry continue to work on all supported active entries; URL auto-apply survives step changes and draft resume with correct price.
- SPRINT-0005-AC02: Concurrent final-slot requests obey the chosen reservation policy, no duplicate callback consumes twice, and failures/expiry release holds correctly.
- SPRINT-0005-AC03: Captured/refunded order terms remain immutable; client-supplied pricing is ignored and stale payment intents cannot charge an undisclosed amount.
- SPRINT-0005-AC04: Free/comp redemptions stay available and separately measured; missing supplier cost is shown unknown rather than disabling codes or claiming margin.

## Validation and evidence

Emulator concurrency/transaction and mocked checkout tests; destination/alias/resume matrix; cent arithmetic and stale-intent tests. Block real payments, emails and fulfillment throughout.

Write `docs/sprints/evidence/SPRINT-0005/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Offer acceptance may outlive a pause or scheduled end. Freeze and test the short quote-validity policy, reservation expiry and refund usage semantics before rollout.

Additive compatibility reader keeps old code/link behavior. Stop new offer-version writes safely; retain committed quote, redemption and payment snapshots. Never restore old nontransactional counters as authority.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
