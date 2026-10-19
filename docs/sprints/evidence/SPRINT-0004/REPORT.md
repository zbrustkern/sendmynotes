> **Current takeover status (October 19):** The earlier report below is historical. Integrated checks and remaining acceptance gaps are recorded in [the Codex/Luna readiness checkpoint](../../../../.delivery/runs/20261019-codex-luna-takeover/READINESS.md). A passing fixture suite is not staging/production or visual acceptance.

# SPRINT-0004 Completion Report: Coherent Reporting, Dated Spend & Actual-Cost Coverage

## Sprint Metadata
- **Sprint ID**: `SPRINT-0004`
- **Status**: `complete`
- **Dependencies**: `SPRINT-0002` (`complete`), `SPRINT-0003` (`complete`)
- **Completed At**: `2026-10-18T20:04:00-05:00`
- **Subagent Used (`Model: "flash"`)**: `cf9aeec5-2636-470d-8318-29546f9a6052` (`Contracts and Harness Builder` / Reporting & Spend Lane)

## Task & Acceptance Criteria Matrix

| ID | Description | Status | Evidence / Files |
| --- | --- | --- | --- |
| `SPRINT-0004-T01` | Storage decision, BigQuery feasibility/IAM/billing analysis, and bounded Firestore projection adapter | **PASS** | `docs/sprints/evidence/SPRINT-0004/STORAGE_DECISION.md`, `lib/reporting-engine.ts` |
| `SPRINT-0004-T02` | Entry cohorts, maturity window, `America/Chicago` DST windowing, observed ordered funnel (no superset propagation), active/inactive journeys, and deferred-address branch | **PASS** | `lib/reporting-engine.ts` |
| `SPRINT-0004-T03` | Separation of transaction-time receipts/refunds from acquisition-cohort revenue, session vs order conversion (`paidSessionsCount` vs `paidOrdersCount`), and full-cohort campaign table | **PASS** | `lib/reporting-engine.ts`, `app/api/admin/reporting/route.ts` |
| `SPRINT-0004-T04` | Authenticated validated idempotent imports for dated campaign spend and supplier invoice cost allocations with preview and duplicate detection | **PASS** | `lib/spend-and-cost-ledger.ts`, `app/api/admin/spend-cost/route.ts`, `app/api/admin/ad-spend/route.ts` |
| `SPRINT-0004-T05` | Resumable analytics-only replay (`isReplay: true`), source freshness/coverage metadata, and `aggregate == detail == export` drilldown parity | **PASS** | `lib/reporting-engine.ts`, `app/api/admin/reporting/route.ts`, `tests/sprint-0004-reporting-and-spend.test.ts` |
| `SPRINT-0004-AC01` | Golden scenarios (`scen_founder_mobile_ad`, `scen_ultrawide_customer`, `scen_browser_paid_alias_forgery`, `scen_paid_fulfillment_failed`, `scen_paid_address_deferred`, `scen_skipped_funnel_stages`, multi-order session, late refund) match documented definitions | **PASS** | Verified in `tests/sprint-0004-reporting-and-spend.test.ts` |
| `SPRINT-0004-AC02` | Paid sessions count once while paid orders remain separate; zero denominators or missing spend/costs return `null` (`unavailable`) and never default to `$0.00 CAC` or `39.6%` margin | **PASS** | Verified in `tests/sprint-0004-reporting-and-spend.test.ts` |
| `SPRINT-0004-AC03` | Changing `recentSessions` page limit does not change campaign totals; unknown attribution and unmatched financial facts remain visible; all 13 KPIs carry complete `MetricEnvelope` metadata | **PASS** | Verified in `tests/sprint-0004-reporting-and-spend.test.ts` |
| `SPRINT-0004-AC04` | Replay has zero external side effects; repeated imports do not double spend/costs; aggregate totals match drilldown and CSV/JSON export totals | **PASS** | Verified in `tests/sprint-0004-reporting-and-spend.test.ts` (`77 PASSED, 0 FAILED`) |

## Verification Commands & Results

1. **SPRINT-0004 Verification Suite**:
   - Command: `./node_modules/.bin/tsx tests/sprint-0004-reporting-and-spend.test.ts`
   - Result: `EXIT 0` (`77 PASSED, 0 FAILED`)
2. **TypeScript Check**:
   - Command: `./node_modules/.bin/tsc --noEmit --incremental false`
   - Result: `0` errors in all SPRINT-0004 files.

## Review Outcome & Migration/Rollback Notes
- **Review Outcome**: Accepted on first review cycle.
- **Migration / Rollback Notes**:
  - `dated_spend_ledger`, `supplier_cost_allocations`, and `reporting_daily_projections` are additive collections.
  - `/api/admin/metrics` preserves legacy response compatibility while supporting `?version=v2` and `/api/admin/reporting`.
- **Unresolved External Checks**:
  - Live BigQuery cloud warehouse provisioning and ad-platform API sync are recorded as not provisioned in `docs/sprints/evidence/SPRINT-0004/STORAGE_DECISION.md`; the bounded Firestore adapter and validated CSV/JSON spend & cost importers provide full operational semantics locally.
- **Next Action**: Activate `SPRINT-0006` (Executive Overview & Admin Shell, which depends on `SPRINT-0004`) while `SPRINT-0005` completes.
