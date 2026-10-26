# SPRINT-0017: Auditable admin complimentary and adjusted orders

Status: complete for the authorized staging scope. Authorized October 26, 2026; staging-only implementation/release. Depends on the current international/attribution staging baseline, not the pending reporting or artwork sprints.

## Pyramid Index
- L0: Add a server-owned admin adjustment contract that supports full comps and partial payments without granting public checkout pricing authority.
- L1: Versioned catalog lines; authenticated quote and immutable order creation; safe zero/positive-balance lifecycles; audit and commercial classification; isolated tests and independent review.
- L2: Authority → Overview; contracts → Architecture; work ownership → Implementation Plan; required proof → Definition of Done.

## Overview
The founder approved the admin mockup and requested Luna sprint execution and staging deployment. This sprint implements its backend foundation. Preserve personal senders, truthful supplier claims and personal US return identity. Read AGENTS.md and canonical brief/specs. October 11 zero-customer evidence is historical; the founder subsequently reported one genuine sale. Do not count admin-origin orders as independent customer conversions.

Implementation uses an isolated clone at `/private/tmp/sendmynotes-admin-comp-20261026`, branch `codex/admin-complimentary-staging`, based on staging `0a4d08205b8077303fe88fd578ecd0397f94b3ab`. Main baseline is `0ebfd958c6854623abab177ebeab2754c242f20c`. Preserve both the dirty original and prior international managed worktree. SPRINT-0016 is reserved by the reporting chat; it confirmed docs-only work and no concurrent deployment. SPRINT-0014 remains separately planned. No chapter or semantic index configured.

## Use Cases
1. Admin composes a new domestic/international card and covers all allowed charges.
2. Admin covers specified amounts per line and creates a payment request for the remainder.
3. New trusted catalog add-ons inherit full-comp behavior without a hardcoded $9 waiver.
4. Staging exercises the same quote/review contract while recording an explicit hold, without payment, email or supplier effects.

## Architecture
Pure integer-cent line-item calculation derives prices from trusted versioned configuration. Client IDs select configured products, never prices. Current $9 base and $5 international surcharge remain; public discounts still apply only to their existing eligible base. No fictional add-on goes into the production catalog. Inject future lines only in unit tests.

Admin quote/creation requires the existing verified account-bound admin session; derive actor from it, never request body. Require a bounded reason and persist actor/time, origin=admin, original line prices, adjustments and accepted quote. Recompute and bind destination/price/adjustments; reject stale/tampered quotes, unknown lines, duplicate IDs, fractional/negative/excess cents. Idempotent retries must recover the same operation/order and reject reuse with different content.

New zero-balance orders bypass customer payment only, retaining address, supplier eligibility and dispatch/retry safety gates. Positive balances use a server-created immutable payment request; a public bearer may pay the fixed amount but cannot change price or gain admin authority. Verified capture amount/currency/order/quote bindings and existing dispatch lock govern fulfillment. Nonzero sub-minimum provider amounts must fail clearly before provider creation. Never infer paid/fulfilled from link creation or browser redirect.

All admin-origin orders, including partially paid orders, remain separate from independent acquisition conversions. Store actual collections faithfully rather than labelling nonzero money as a full comp. Audit data must not leak through public receipt APIs. Keep Google and Meta suppression explicit.

## Implementation Plan
- T01: Coordinator preserves current source, hosting guards and rollback baseline; records independent Luna plans and synthesis.
- T02: Backend Luna owns pure admin quote/types, trusted catalog validation, authenticated quote/order/payment request endpoints, persistent audit and idempotency.
- T03: Backend Luna owns the minimum payment/fulfillment/classification integration changes, retaining public domestic/international behavior and immutable receipt/payment bindings.
- T04: Backend Luna adds route-level regression tests with fake storage and adapters, external networking denied. Audit Luna independently reviews actual diff and negative cases.
- T05: Coordinator runs the relevant regression/security/TypeScript/build checks and records limits. Stage via SPRINT-0018 after both pass.

## Files Summary
Backend ownership: new admin pricing/order/payment modules and routes; additive `lib/types.ts`; narrowly required order processor, webhook, financial/purchase measurement integration. UI worker does not edit these. Exact changed files recorded in evidence. Coordinator owns package scripts, ledger and release files.

## Definition of Done
Authenticated and unauthenticated route behavior; pure full/partial/future-line cases; invalid cents/line/country/version; required reason and authenticated actor; personal US sender; replay/concurrency/changed request; zero comp and positive balance; stale/incorrect payment metadata; public API cannot mint admin authority; admin-origin conversion exclusion; staging makes zero provider/email/fulfillment calls. Existing public $9 and $14/discounter semantics regressions pass. Independent review has no unresolved release blocker. Actual provider/live tests remain unverified unless performed and separately authorized.

## Risks & Mitigations
Payment changes are high impact: isolate admin branch, preserve public contract, assert exact amounts and deny network in tests. Browser ambiguity uses stable operation identity and state lookup. Supplier ambiguity must never automatically double-send. Catalog evolution must preserve accepted snapshots. Supplier costs remain unknown and nonzero even for customer comps.

## Dependencies / Open Questions
No additional product decision blocks the approved scope. The backend/UI lanes agree the exact DTO before edits. Current mockup is design approval, not evidence of provider behavior. No production push, real charge, outbound email, supplier call, secret/config mutation or broad historical migration is authorized.

## Delivery result
Staging commit `cae1525bbba5d15377ee8829ee6b8b76d14ab7da`, build/rollout `2026-10-26-004` READY/SUCCEEDED at100% traffic. Focused tests, TypeScript, production build, local mounted UI and eleven hosted boundary checks passed. Production unchanged. Founder authenticated review and provider/live testing remain separate; see `.delivery/runs/20261026-admin-comp/REPORT.md` and `REVIEW-CHECKLIST.md`.
