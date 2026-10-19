# SPRINT-0011 release evidence

Status: complete. Scoped hotfix deployed and verified in staging and production.

Luna implemented/reviewed the five scoped client files and authored both mounted browser suites. Codex reviewed the integration, ran production/staging builds and existing regression suites, and independently reran the actual parent-page suite on staging source. No Antigravity review is claimed.

Production-only hotfix: c7c127e (runtime change 427b160). Staging integration: 2723ea1 (runtime change bc4587c). Production branch excludes the unpromoted admin overhaul. No Stripe keys, payment methods, API versions, server pricing, payment verification, webhooks, fulfillment or production infrastructure configuration changed.

Passed locally: six existing production payment/security/draft/sender suites; five staging security/discount/review-safety suites; both optimized builds with type checking; mounted legacy and current payment forms with Stripe-faithful immutable provider and missing-context behavior; baseline stale-payment reproduction; actual parent failed-repricing, restored-free-code single initialization and pre-pay URL timing. The baseline main source had test-only type errors; minimal corrections in four tests allow the production build without changing runtime behavior.

Coverage includes full price, fixed/percentage discount changes/removal, null-secret free orders and free-to-paid transition, local mock fallback, pending/error/retry, card and wallet guards, saved-code revalidation and free resume without repeated order creation. Actual wallet/device success and a live production charge remain untested. Hosted staging evidence and production release results will be appended after verification.

Evidence: checks/production-regressions.json, checks/staging-regressions.json, checks/production-build.json, checks/staging-build.json, checks/payment-discount-browser.log, checks/payment-checkout-parent.log, checks/production-baseline-typecheck.log, source fingerprints and before-deployment snapshots. See ROLLBACK.md for the previous READY production build/source and recovery procedure. No fulfillment scripts, live charges, refunds or customer emails were used as audit checks.

## Hosted staging evidence

Source 2723ea1, rollout-2026-10-19-004 SUCCEEDED, build-2026-10-19-005 READY; revision at 100%. Review/supplier suppression flags and TEST key mode verified. Hosted /new HTTP200 with no page errors; browser provider/tracking and API writes blocked. Actual hosted create-intent prices and Stripe TEST amounts verified: normal900, fixed-$2 code700, 20%-off720, 100%-off0 without intent. Three intents confirmed test-mode, USD, correct amount and canceled; zero captures, emails or supplier orders. Three synthetic promo fixtures expired/deactivated; synthetic audit artifacts retained. Reports: checks/luna-staging-hosted-report.json and checks/luna-staging-pricing-report.json.

## Production release

Main source c7c127e3e184252d0c727df715dd18e8e30129f6, rollout-2026-10-19-001 SUCCEEDED, build-2026-10-19-001 READY. Serving revision sendmynotes-build-2026-10-19-001 at 100%. Payment configuration SHA256 equals the recorded baseline; application URL remains https://sendmynotes.com and no staging review flag was introduced. Read-only anonymous browser checks of / and /new returned 200 with zero page errors, with all provider/tracking traffic and API mutations blocked. No production checkout intent was created. The first count-only post-rollout observation after 45 seconds reported zero ERROR and zero payment-related entries; this is a brief health check, not a traffic/load or live-purchase proof.

AC01–AC08 passed within the scoped criteria: full-price server authority preserved; immutable form remount/payment-to-secret binding; pending/failure/retry guards; null-secret free/mock and free-to-paid; invalid/saved-code/pre-pay timing and single resume; builds/security/offer tests and unchanged critical files; staged exact-source verification and TEST amounts; production exact-source/config/health with retained rollback. Independent Antigravity review, real Apple Pay/Safari/Meta confirmation and a live production charge were not performed and are not claimed.

Production evidence: checks/luna-production-hosted-report.json, checks/luna-production-log-summary.json, checks/release-scope.json. No rollback was needed. Previous READY source/build remains documented. No unrelated admin overhaul was promoted to production.
