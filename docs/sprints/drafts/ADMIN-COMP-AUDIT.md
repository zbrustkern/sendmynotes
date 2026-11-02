# Admin complimentary order independent audit

Audit date: 2026-10-26. Candidate checkout: `/private/tmp/sendmynotes-admin-comp-20261026`, branch `codex/admin-complimentary-staging`, baseline `0a4d08205b8077303fe88fd578ecd0397f94b3ab`. This review covers the approved admin-comp intent, current candidate code, isolated regression tests, and a read-only hosting snapshot. I made no product-code edits. I added/maintained only the adversarial test and audit artifacts assigned to this reviewer. No deployment, payment, email, supplier fulfillment, or external provider call was made.

## Current review result

The candidate's principal safety boundaries are present in the reviewed source and covered by passing isolated tests: admin endpoints use the verified server-side admin actor; quotes and accepted amounts are server-owned and immutable; idempotency is enforced; positive balances require payment requests bound to order/quote/country/amount metadata; and staging acceptance remains held. Held orders cannot become payable or dispatchable solely because a staging flag later changes. Full and partial admin comps are excluded from customer conversion attribution and reporting. The positive live balance classification is `admin_comp_balance` (not `studio_comp`); it records operational payment evidence without counting as an independent paid customer conversion.

The public redacted order receipt retains only the non-sensitive `origin: "ADMIN_COMP"` classification needed for browser conversion suppression. The new GET-route regression verifies that a partial admin-comp receipt is not classified as a customer purchase and that quote, quote ID, and payment-request ID remain private. The capability payment page is excluded from analytics by pathname checks in `MarketingScripts` and `AttributionTracker`; middleware supplies `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, and private no-store caching. These protections have static/UI and route-level regression coverage, not a live analytics-provider test.

The legacy `/api/admin/dispatch-comp` endpoint now uses the shared quote/order/dispatch safety path, requires an idempotency key, and returns 423 before persistence while staging review-only is enabled. A zero-balance dispatch validates the accepted quote, address and personal sender, checks pause/hold state before supplier submission, and takes a transactional dispatch lock. The reviewed latest guard rejects held/admin-review or international-preview orders even after configuration changes. A positive staged order remains held if a later payment processor invocation sees staging disabled. Exact payment-request metadata is verified before payment acceptance. The last audit pass included these hold/pause-ordering changes and the public receipt origin fix.

### Executed evidence

These commands were run against the candidate with the repository's safe runner, a fresh temporary working directory, provider credentials stripped, and `.delivery/runs/20261020-first-sale-cleanup/deny-network.cjs` preloaded:

- `python3 .delivery/runs/20261026-admin-comp/run-safe-check.py admin-comp-adversarial.test.ts` — passed. Covers pricing/tampering, auth/actor binding, staging hold and capability suppression, idempotency including expired-quote replay, positive payment metadata verification, minimum balance, country/supplier binding, public receipt privacy and attribution classification, legacy route behavior, CAPI/reporting exclusion, held-order replay after staging flag change, and local-mock positive capture/replay.
- `python3 .delivery/runs/20261026-admin-comp/run-safe-check.py admin-comp-ui.test.tsx` — passed. Covers customer-purchase classification and static checks for global analytics suppression on the capability path.
- `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit` — passed.
- `git diff --check` — passed.

The local-mock positive-capture case printed simulated Stripe and test-mode processor logs. It intentionally skipped live Handwrytten submission; the deny-network preload remained active. This is workflow logic evidence only, not live Stripe, supplier, email, Meta, or Google integration evidence. No fulfillment script was run.

## Historical findings and baseline only

Before this implementation, the authenticated legacy comp route could submit a zero-dollar `STUDIO_COMP` directly to Handwrytten when its staging guard was off, without the new quote/audit/idempotency path. That behavior is historical and is not a description of the current candidate route. Before implementation, browser order-page tracking and server Meta CAPI also lacked admin-comp exclusions. Those gaps are addressed in the candidate and covered by regression tests. Keep this history for context, not as a current blocker.

The following read-only hosting snapshot was captured on 2026-10-26 at 20:37 UTC, before the candidate rollout. It is historical baseline evidence and does not establish the current hosted revision or release readiness. Captured by `.delivery/runs/20261026-admin-comp/inspect-hosting.cjs`; only safe flags and hashes were stored, with `secretValuesLogged: false`.

| Surface | Baseline source and rollout | Traffic and safe configuration |
| --- | --- | --- |
| Staging (`sendmynotes-staging`) | source `0a4d08205b8077303fe88fd578ecd0397f94b3ab`; rollout `rollout-2026-10-26-003` SUCCEEDED; build READY | staging revision at 100%; review-only flags and `HANDWRYTTEN_TEST_MODE` true; Firebase IDs point to staging; environment SHA-256 `6770fda8818cabbb3b487cc7e408b841059789f1a6900781b5c3ff4ad48ee2e5`; payment-config hash `f962e0b0b96d00db456eee679ede54b0f8570ec8264c47da552d10b8421010d8` |
| Production (`sendmynotes-2a417`) | source `0ebfd958c6854623abab177ebeab2754c242f20c`; rollout `rollout-2026-10-26-001` SUCCEEDED; build READY | production revision at 100%; staging-only flags absent; environment SHA-256 `f06137e4c7cb21ee7a26420b095634c2af77ae35aa63feb76762e4e579677f9b`; payment-config hash `04031fc87133f959485b514c1f2170e35fb4f3a5a10c74763bf5edbe316d71e8` |

Do not use this snapshot as evidence for a later rollout. Coordinator-owned release verification should read the rollout tied to the exact intended staging commit and confirm source SHA, successful rollout, READY build, 100% serving traffic, staging project IDs, safety flags, and redacted environment handling. Production is outside this audit and remains a separate decision. No secret values are included here.

## Limits and remaining release checks

This review does not authorize production release, live payment capture, email, or billable fulfillment. Automated tests use mocks/fakes and cannot prove external-provider behavior. Before any staging deployment, the coordinator should independently verify current hosted source/build/traffic and staging flags after rollout, confirm the visible UI labels staging orders as held/review-only, and retain the no-provider-effects boundary. Do not infer supplier costs or customer conversion from comp orders: supplier cost/billability remains unresolved under the canonical product specs, and the canonical baseline records zero independent customer conversions. The founder's later reported sale is a separate, not independently reconciled fact.

The canonical brief and product specs remain authoritative for personal-send audience, sender identity, conversion baseline, and unresolved supplier facts. Admin comps, founder tests, free promotions, test-mode payments, and staging previews remain separate cohorts. A free customer balance does not imply free supplier fulfillment.
