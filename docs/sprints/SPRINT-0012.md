# SPRINT-0012: Make the first-sale experience clearer and more truthful

Status: complete. October 20, 2026. Owner: Codex coordinator; Luna planning, implementation and independent review.

Completed: staging f97f98f62d0fee461c236c597e33e9f54a7275d3 and production 0623a0a89b6d948b272f25ad8c9bfb4f4554962f are deployed, verified and serving 100% of their respective traffic. All six acceptance criteria passed. See [release evidence](../../.delivery/runs/20261020-first-sale-cleanup/REPORT.md) and [rollback record](../../.delivery/runs/20261020-first-sale-cleanup/ROLLBACK.md). Validation did not perform a live charge, Apple Pay test or supplier fulfillment. Dates below describe the planning baseline; completion occurred October 20 local / October 21 UTC.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Delivery: Source context, Tasks and dependencies.
- Proof: Acceptance criteria and Validation.
- Release: Deployment and rollback gates.
- Provenance: Decisions, risks and participants.

## Objective

Make the personal custom-artwork offer readable on phones and remove unsupported product claims while the new campaign gathers evidence. Keep the sending journey and $9 including mailing offer stable. Ship this small patch through staging and then production as explicitly requested by the founder.

## Scope and non-goals

Allow responsive copy/layout changes to the custom-art invitation; factual text corrections for material, envelope, generic tracking, delivery timing and unmeasured 60-second promises in the existing sender flow, catalog, policies and order status; and one dated static admin founder-test notice plus inaccurate admin stock descriptions. Prefer existing canonical product constants where they fit without new abstractions or behavioral refactors.

Expected paths: components/flow/EntryCardStep.tsx; components/v3/{Step2NoteComposition,Step3EnvelopeAddressing,Step4ReviewAndPayment,Step5Confirmation,TargetPurchaseExperience}.tsx; components/{AddressStep,CheckoutStep}.tsx; components/VendingMachineBuilder.tsx; app/{privacy,terms,return-policy,send}/page.tsx; app/send/[occasion]/page.tsx; app/order/[id]/page.tsx; lib/product-facts.ts; components/admin/HandwryttenStatusWidget.tsx; app/admin/page.tsx; optionally one tiny shared static admin notice. Inspect exact uses; leave artwork descriptions and supplier payload fields unchanged.

No campaign/budget changes, price or discount changes, new product features, artwork-generation changes, payment/fulfillment behavior changes, new marketing assets, analytics/query/schema rewrites, new live customer counters, legal policy restructuring, or promotion of the unfinished admin overhaul. Policy edits correct descriptive material words and the illustrative transit estimate only, preserving policy rights and conditions. Preserve conditional returned tracking links, sender return-address requirements, guest sending, the canonical historical Oct 11 baseline, and all unrelated working changes.

## Source context

Canonical authority: AGENTS.md, docs/CANONICAL_PROJECT_BRIEF.md and docs/CANONICAL_PRODUCT_SPECS.md. Paper composition/weight/finish and envelope match are unconfirmed; safe copy is cardstock/envelope. Real-pen equipment and USPS First-Class are supported. Preparation is typically 1–2 business days; domestic transit typically 2–7 business days; these are estimates. Actual tracking depends on service and returned data. Sixty seconds is an unmeasured experience target.

Fresh origin/main is c7c127e3e184252d0c727df715dd18e8e30129f6; origin/staging is 2723ea1bc1291d801386124781442a7eeda74ada. The root staging checkout has a later documentation-only commit 844b2bf plus unrelated dirty files. Production candidate checkout: /Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes. Staging integration checkout: /Users/zeke/.codex/worktrees/first-sale-staging/sendmynotes. Reverify cloud source/traffic before deployment. Never merge the staging branch wholesale into production.

The founder reported on Oct 20 that the purchases discussed were their own tests. The admin note must label this as a dated founder report, distinct from reconciled metrics, and explain that paid totals/visit ratios do not establish independent demand. It is not a live zero, a verified classification of all future orders, or a change to the Oct 11 historical baseline.

## Tasks and dependencies

1. T01 — Record clean production and staging baselines, automatic rollout policies and rollback build/source. Preserve dirty files. Complete Luna alternate plan critique and coordinator synthesis.
2. T02 — Luna implements the production-based UI/copy patch. Use shorter invitation wording with natural wrapping and a reachable action at narrow widths. Apply only canonical factual corrections. Add the dated static admin note without data/API dependencies. Record changed files and verification in its role artifact.
3. T03 — Independent Luna reviews the actual diff for accuracy, scope, regressions, preserved functionality and release contamination. Coordinator reviews independently and resolves justified findings within three repair cycles.
4. T04 — Validate production candidate with relevant existing safe regression suites, typecheck and optimized build. Validate browser appearance at 320px, 390px and desktop; open/close custom artwork without generating; select a preset and exercise note/address navigation without starting or confirming payment.
5. T05 — Apply reviewed changes to clean staging integration checkout. Resolve only small copy differences in divergent admin files; retain staging-only safety guards and existing work. Run appropriate staging checks/build, push isolated release branch and deploy pinned staging source. Verify hosted source/revision, routes, copy, responsive invitation and health.
6. T06 — After staging gates pass, push production-based source and explicitly deploy its pinned commit. Verify hosted source/revision, public UI and service health. Update remote release branches consistently without force or wholesale merges. Record rollback and evidence, then mark complete.

T01 → T02 → T03/T04 → T05 → T06. One writer per checkout; coordinator owns state, ledger and integration. Read-only review may run independently. Do not require extra approval for the staging/production deployment the user explicitly requested.

## Acceptance criteria

- AC01: Custom-art invitation title, description and action are fully readable at 320px and 390px without horizontal overflow; desktop layout remains coherent. Keyboard/tap can open and close the existing chooser without generation, lost selection or behavior changes.
- AC02: The scoped public and admin surfaces contain no unsupported stock weight/composition/archival/matching-envelope claims, blanket live-tracking promise or measured-sounding 60-second promise. Canonical preparation/transit estimates replace the scoped 2–4 day status text. Existing valid status/tracking data rendering remains intact; policy commitments are unchanged.
- AC03: Admin founder-test clarification is dated and attributed, separate from computed totals. No metrics query, financial calculation, database record, classification, payment, order or campaign behavior changes. Historical canonical baseline remains intact.
- AC04: Existing relevant safe regressions, typecheck and optimized builds pass for production candidate and staging integration. Independent review has no unresolved release-blocking finding. Changed files/config fingerprints prove payment/provider/hosting configuration and unrelated admin work are excluded from production patch.
- AC05: Explicit staging project/backend and pinned source serve successfully before production release, with staging guards preserved and hosted responsive/navigation checks recorded.
- AC06: Explicit production project/backend and pinned source serve successfully; public UI/route health verified; prior READY build/source and rollback procedure recorded. No real purchase, supplier submission, fulfillment, email send, refund or art generation was performed as validation.

## Validation

Use existing UI/render/entry/draft/sender tests that operate locally; inspect before running. Avoid broad fulfillment suites and new copy-mirror tests. Builds/test processes run in clean checkouts without copied .env or customer .data and with isolated or blocked external dependencies as needed. Use the computer-use tool for visual UI checks. A build pass alone is not visual proof. Review conditional status code without fetching personal order data; if runtime order-state verification requires fixtures, keep them local. Never claim an Apple Pay or real charge test from this cleanup.

## Deployment and rollback gates

Capture current successful App Hosting rollouts/builds and 100% Cloud Run traffic source for sendmynotes-staging (project sendmynotes-staging) and sendmynotes (project sendmynotes-2a417), region us-central1. Inspect automatic branch triggers before pushing. Use isolated release branches plus pinned rollouts when needed so production cannot precede staging evidence. Maintain original env/secret/payment configuration byte-for-byte. Use scoped commits from the production base; integrate those into staging, never reverse-merge the overhaul.

Abort promotion for build failure, unreadable CTA, broken existing navigation, incorrect source/config, unexplained service errors or unexpected provider effect. Roll back application serving to the saved previous READY build using the verified App Hosting mechanism. Rollback changes application code only; it cannot reverse external side effects. No destructive data cleanup or refunds are authorized by this sprint.

## Decisions, risks and provenance

Codex coordinated a local draft with an actual gpt-6-luna alternate plan/critique, implementation and independent review. This is a disclosed single-app plan; Antigravity did not run. Canonical stock facts remain unknown and actual customer acquisition is still unproven. This cleanup is not a prediction of conversion uplift or a reason to increase ad spend.

The dated admin note may become historical; its attribution/date prevents it masquerading as a current counter. Staging and production admin shapes differ, so integrate small hunks separately. Source-copy inventory may encounter art prompts and CSS tracking classes; do not replace those. Deployment trigger behavior and cloud permissions are operational unknowns until inspected.

Run: .delivery/runs/20261020-first-sale-cleanup/. See intent.md, local-draft.md, luna-plan-review.md, merge-notes.md and subsequent evidence.
