# SPRINT-0011: Bind discount totals to the payment actually confirmed

Status: active. October 19, 2026. Owner: Codex; Luna implementation and regression lanes.

## Pyramid Index

- Outcome and boundaries: Objective, Scope and source context.
- Delivery: Tasks and dependencies.
- Proof: Acceptance criteria and Validation.
- Release: Staging, production and rollback gates.
- Provenance: Participants, unknowns and run artifacts.

## Objective

A sender must authorize the exact server-calculated total shown after applying, replacing or removing a discount, while ordinary $9 checkout remains available. Implement and stage first; promote only this hotfix after required gates pass.

## Scope and source context

Read canonical project brief/specs and AGENTS.md. Current production branch base b831eb0; staging base 7f6e3e5. Reverify hosted source revisions before deployment. Both payment providers lack a React key when clientSecret changes; installed Stripe React source lists clientSecret as immutable. Builders update discount UI before checkout succeeds and initialization catches its own failure. Source defect is verified; connection to the specific founder transaction remains unverified.

Touch active entry builder, target builder, legacy builder, both Stripe wrappers, narrow client helpers if justified, regression tests and sprint evidence. Keep payment methods, API versions, Stripe keys, $9 base price, server discount calculation, webhooks, amount/currency/order verification and fulfillment unchanged. No new Stripe coupon setup, database migration, broad admin promotion, refund, live purchase or physical-mail test. Preserve URL aliases, existing draft compatibility and free-order handling.

## Tasks and dependencies

1. T01 — Snapshot source/deployment: record current production/staging revision and branch policy, unrelated changes and rollback target; create isolated production-based hotfix checkout. Review production/staging differences. Never merge the admin overhaul to release this fix.
2. T02 — Rebind forms: key each Elements provider by its current clientSecret. Reset readiness/processing with the new provider. Disable card, wallet, promo changes and navigation while payment or pricing is in progress. Explicit handler guards must accompany disabled buttons.
3. T03 — Commit price changes atomically: initialization returns explicit success/failure; publish applied-code/total/free state only after successful matching server checkout; on failure invalidate payment readiness and show a recoverable error. Prevent overlapping price operations and stale responses. Before reaching pay, URL/manual validation may update draft offer without initializing checkout or navigating. Fix zero amounts using nullish rather than truthy fallback. Preserve prior accepted offer on replacement/removal failure and allow retry.
4. T04 — Regression evidence after T02/T03: real mounted component behavior with fake Stripe/provider APIs for full-price, fixed/percentage apply/change/remove, free transitions, card/wallet submit, pending/failed update, double clicks, URL/draft resume and retry. Prove the original immutable provider bug fails before the key fix. Check server amount passed to Stripe with fakes; run existing payment-mode/security/discount/draft suites with isolated storage/network denial. Typecheck/build both production hotfix and staging integration.
5. T05 — Stage after T04: integrate only scoped changes into staging; maintain staging project/review guards, no live provider effects. Deploy pinned commit to explicit staging backend. Verify hosted version, routes and a hosted mocked browser matrix; actual Stripe test checkout only if a safely configured test key and fulfillment suppression are verified. A blocked live key must never be worked around by weakening the guard.
6. T06 — Production after T05 gates: deploy production-base hotfix only; retain production secret/payment config byte-for-byte and prior revision for rollback. Verify hosted card/address/pay entry and readiness without confirming a live charge. Observe deployment health and payment-initialization errors. Record evidence and any untested real-device/wallet limitations.

T01 precedes T02/T03; T02/T03 precede T04; T04 precedes T05; T05 precedes T06. One writer/coordinator; at most three repair/review cycles before reassessing unresolved failures.

## Acceptance criteria

- AC01: Fresh no-code checkout still creates a 900-cent USD intent using existing payment methods and confirmation path.
- AC02: Fixed/percentage application, replacement and removal remount the provider onto the correct intent; price and active order are consistent. No stale intent is confirmed by the changed UI.
- AC03: All payment entry points, including wallet and keyboard submission, refuse payment during price changes and after failed initialization; failure is visible and retry works. Concurrent interactions cannot confirm a superseded order.
- AC04: Free-to-paid/paid-to-free transitions preserve zero totals and correct completion path; no card charge is created for a free total.
- AC05: Invalid/expired/exhausted codes leave an accepted checkout coherent; successful validation followed by failed intent creation never reports successful application. URL auto-apply and restored drafts preserve chosen offer without early checkout navigation.
- AC06: Production payment configuration, server price authority and verification are unchanged; payment/security/draft/discount regressions, typecheck and optimized build pass in isolated environments.
- AC07: Explicit staging project/backend, pinned source revision and hosted checks recorded before production; no production base merge of the admin overhaul.
- AC08: Production scoped deployment and health checks recorded, rollback revision/procedure available; clearly distinguish fake-provider, Stripe test-mode and live-production evidence. No claims of real charge or Apple Pay verification from mocked tests.

## Validation and evidence

Use temporary production-base and staging snapshots without repository .env files or customer .data. External test traffic denied except explicitly mocked local browser calls. Never run fulfillment scripts. Mocked tests must exercise mounted provider lifecycle, not merely search for a key in source. Test current stored draft and URL entry with slow/failing requests. Check existing production API contract before adding stricter client response assumptions. Record exact commands, before/after reproduction, outputs and revision fingerprints in the run checks and evidence report.

## Release gates, abort and rollback

No forced updates or secret/config changes. Use explicit project, backend and commit. Record prior production rollout/build and 100% serving revision. Staging must retain mail/live-payment suppression. Deploy only reviewed files from production base, not all staged changes. A successful build alone is insufficient: require hosted readiness/browser evidence and no unexplained payment errors. Stop for wrong total/mode/order binding, unavailable no-code checkout, stale-provider confirmation or unexpected supplier effect. Roll back the application to the recorded prior revision/commit through the existing App Hosting mechanism; do not delete financial facts, pending orders or redemptions. A rollback cannot reverse a charge or accepted supplier submission. Reconcile any captured payment separately; do not refund automatically.

## Risks, decisions and provenance

A remount can require re-entering card details; correctness takes precedence over preserving payment fields during a deliberate price change. In-flight card authorization must disable promo mutation. Backend response races and free-order resume require explicit tests. Existing unpromoted admin gates stay separate. Exact cloud deployment source, staging Stripe test-key availability, actual wallet/Safari behavior and specific founder transaction are unresolved until verified.

Plan synthesized and self-reviewed in Codex using df-sprint-plan; Antigravity has not run. Handoff and local critique retained in .delivery/runs/20261019-discount-payment-fix. Current user authorizes scoped execution/staging/production after readiness; no extra ceremonial approval is required.
