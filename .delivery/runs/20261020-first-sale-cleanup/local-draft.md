# Coordinator draft

1. Refresh refs and record production/staging source and rollback metadata. Create a clean production-based checkout so this release cannot carry the staging admin overhaul.
2. Luna alternate planner audits the scope and acceptance checks. Synthesize SPRINT-0012 and reserve it in the existing ledger as planned.
3. Luna implementation changes the entry invitation layout and narrow factual copy only. Keep ad destination, artwork generation, prices, payment and fulfillment code untouched. A separate Luna reviewer checks claims, scope and mobile risk against the canonical documents.
4. Add a dated admin founder-test caveat only if it can be kept independent of analytics and the unfinished overhaul; don't display a hardcoded current zero. Track this as an observation, not a recalculated metric.
5. Coordinator reviews the diff; run existing relevant safe tests, typecheck and optimized builds. Use browser visual checks at phone and desktop sizes, including opening/closing the custom-artwork chooser without generation. Do not add tests that merely duplicate copy text.
6. Apply the reviewed patch to a clean staging integration checkout, retaining staging's review/payment guards. Push a scoped branch and explicitly deploy the pinned staging commit. Verify hosted copy, navigation and health.
7. Push production changes based on the verified production source only after staging passes. Deploy the pinned source, verify serving revision and public UI, record rollback and final evidence, then complete the ledger. Preserve unrelated dirty files and unfinished sprint statuses.

Risks: broad search replacements can change art prompt descriptions; staging/main admin shapes differ; branch auto-rollout may activate on push; build-only success doesn't prove visible wrapping; founder baseline wording can become stale. Inspect exact occurrences, keep stock/tracking claims scoped, use dated caveats, inspect branch rollout policies, and verify hosted UI.
