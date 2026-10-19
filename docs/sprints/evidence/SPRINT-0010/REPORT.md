> **Current takeover status (October 19):** The earlier report below is historical. Integrated checks and remaining acceptance gaps are recorded in [the Codex/Luna readiness checkpoint](../../../../.delivery/runs/20261019-codex-luna-takeover/READINESS.md). A passing fixture suite is not staging/production or visual acceptance.

# SPRINT-0010 implementation report (partial; integration not accepted)

Date: 2026-10-19
Status: bounded implementation and isolated fixture verification only. This is not sprint completion, release readiness, or deployment approval.

## Implemented in this lane

- Added decision records with the sprint fields, bounded input, direct email/phone rejection, default `gathering_evidence`, idempotent create, audited status changes, and an authenticated admin API in `lib/decision-log.ts` and `app/api/admin/decisions/route.ts`.
- Added a review UI in `components/admin/DecisionLogWorkspace.tsx`. It displays sampled rendered-exposure counts and explicitly reports unavailable outcomes/no estimated lift. **It is not mounted in the active Growth page yet.**
- Added a deterministic journey assignment helper in `lib/experiment-assignment.ts`. Assignment occurs only when a caller explicitly supplies an enabled, valid configuration. No experiment was activated.
- Added `components/experiments/ExperimentExposure.tsx`; it sends an allowlisted exposure only when the rendered wrapper is at least 50% visible (or after a visible-tab fallback interval). **No active entry route mounts this component yet.**
- Added `lib/analytics-replay.ts`: caller-supplied, sanitized analytics events are normalized and replayed into only `analytics_replay_checkpoints` and `analytics_replay_projection`. Batch projections and cursor advancement commit together; keys/checksums are stable for a run/window/schema/chunk-size. It reports shadow deltas and rejects conflicting duplicate IDs or changed source for a checkpoint. It has no payment, redemption, order, provider, email, fulfillment, or queue imports or calls.

## Integration hook for coordinator

After the foundation patch is integrated, mount `DecisionLogWorkspace` inside the active Growth workspace. A future, separately reviewed experiment caller may call `assignStableJourneyVariant` with the existing pseudonymous journey ID and a predeclared configuration, then wrap the actually rendered variant with `ExperimentExposure` and pass the real session ID, path, and build/version. Keep `enabled` false unless an experiment has separately passed review; do not turn on rollout, bidding, or automatic decisions from this code. Keep `runAnalyticsReplay` as an explicitly invoked, analytics-only rehearsal utility; do not route it through payment or fulfillment handlers. This lane did not change the active Growth page or add an admin replay endpoint.

## Evidence and checks

Ran in `/private/tmp/sprint10-qa`, an isolated source copy with `.env*`, `.data`, `.git`, `.next`, and repository-local dependencies excluded; `node_modules` was linked read-only from the repository. No shared `.data/mock-firestore.json` was read or written by the test.

- `node --import tsx tests/sprint-0010-learning-and-replay.test.ts` — **passed**. It covers auth, create/status audit, idempotency and collision rejection, PII pattern rejection, descriptive exposure counts, stable assignment, disabled/invalid assignment, component server rendering, replay interruption/resume, deterministic retry, concurrent retry convergence, shadow differences, conflicting event IDs, preservation of seeded payment/redemption/outbox fixtures, and blocked-external-call count zero.
- `npx tsc --noEmit` — **not clean**. This isolated snapshot reported six existing errors outside this lane: `lib/admin-investigation-client.ts` imports a non-exported `FinancialFactRecord`; `lib/offer-engine.ts` has one `ReservationResult` union error and missing `ReserveOfferInput` fields (`requireAuthoritativeBinding`, `finalAmountCents`, `discountAmountCents`); `tests/sprint-0006-executive-shell.test.tsx` has a `firestore_bounded`/`firestore_unbounded` mismatch. None points to SPRINT-0010 files. This is the observed count for this snapshot, not a claim that another integration snapshot has the same baseline.
- No full test suite, production build, active-page browser test, screenshot matrix, representative-volume timing, live provider check, migration, deploy, or production data operation was run in this lane.

## Acceptance and remaining gates

- AC01: **Partial.** The log captures the required review fields and observed exposure summaries; outcome cohorts, mature-sample uncertainty, and causal estimation are not connected. UI integration remains open.
- AC02: **Fixture-level evidence only.** Pause/resume, retry, deterministic IDs, source conflict, and no business collection mutations passed. No representative-volume backfill or production projection parity was run.
- AC03: **Not run.** Integrated paid/discount/free/deferred/refunded/failed scenarios and portal reconciliation remain coordinator acceptance work.
- AC04: **Not run.** No integrated release packet, browser/accessibility matrix, reviewer acceptance, or rollout/rollback verification is claimed here.

Not verified: active page integration; auth against the deployed admin environment; production Firestore index/transaction behavior; replay volume/cost/latency; real visitor telemetry completeness; browser variants/device behavior; Apple Pay/Safari/Meta paths; external provider behavior; production/staging IAM and backup/rollback procedure. Sprint acceptance and ledger changes remain with the coordinator.
