# SPRINT-0008: Ship first-class Promotions and Growth workspaces

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Give the founder stronger discount creation/distribution controls and an evidence-based view of campaigns, offer friction and redemptions.

## Scope and non-goals

Promotions editor/list/detail, Growth campaign reports, contextual offer creation and safe manual recovery links. No automatic outreach or bidding.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0004, SPRINT-0005, SPRINT-0006. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): new /admin/promotions and /admin/growth routes; admin discounts APIs; campaign/high-intent widgets to replace; offer/distribution/reporting APIs; active entry link contracts.

## Ownership and coordination

Promotions/Growth UI lane consumes offer authority from 0005 and reports from 0004; does not implement a second price calculator or attribution classifier.

## Ordered tasks

### SPRINT-0008-T01: Promotions workspace and editor

After: none.

Build first-class code search/filter/lifecycle, familiar presets, fixed/percent/free offers, purpose/campaign association, schedule/caps/budget, price preview and explicit subsidy/unknown-cost state. Preserve archive/history and current valid links; avoid deleting redeemed codes.

### SPRINT-0008-T02: Offer distribution and application preview

After: T01.

Generate allowlisted destination-aware auto-apply links with offer/distribution/UTM context, copy and non-billable validation preview. Show actual final price, expiry and compatibility. Add campaign-context Create offer and easy pause/archive with effect preview.

### SPRINT-0008-T03: Offer evidence and Growth

After: T02.

Display exposure/application/rejection/checkout/capture/refund/fulfillment funnel, source/browser/build breakdown, actual savings/receipts/contribution coverage. Campaigns use full-cohort dated spend and source policy; count free redemption separately and never present code use as lift.

### SPRINT-0008-T04: Recovery investigation tools

After: T03.

Select/create an offer for legitimately resumable drafts; label contact eligibility and anonymous limitations. Do not claim a generic URL resumes a draft. Preserve original acquisition attribution alongside recovery touch; copying a link sends no message.

### SPRINT-0008-T05: End-to-end offer acceptance

After: T04.

Walk through create/schedule/activate/apply/resume/redeem/pause/expire/archive and rejected-code cases using synthetic orders. Verify exact report/ledger parity, discount not subtracted twice and no automatic code termination on tiny samples.

## Acceptance criteria

- SPRINT-0008-AC01: Existing percentage/fixed/100%-off/manual/comp and share-link capabilities are preserved; new code creation is easier to contextualize and preview.
- SPRINT-0008-AC02: Offer detail reconciles exposed/applied/paid/free/refunded counts and actual dollars to its orders and versions; missing identity/cost stays explicit.
- SPRINT-0008-AC03: Growth totals use full scope and dated spend; recovery codes do not overwrite original acquisition or prove incremental conversion.
- SPRINT-0008-AC04: All consequential offer changes show their effect, audit and role enforcement; no outreach/ad-platform mutation or live fulfillment occurs.

## Validation and evidence

Synthetic browser lifecycle, role/API tests, cents/ledger/report parity, copy-link destination/alias checks, cold-load/resume and invalid/exhausted offer tests at desktop/mobile widths.

Write `docs/sprints/evidence/SPRINT-0008/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Guest identity and offer exposure are incomplete by nature. Show coverage and avoid guaranteed per-person abuse prevention or causal claims from redeemer cohorts.

Retain original code API/aliases and additive historical versions. Roll back UI independently from transactional redemption; preserve accepted quote/payment commitments.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
