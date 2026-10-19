# Storage Architecture Decision: Operational Firestore Projections vs BigQuery Warehouse

**Document ID:** SPRINT-0004-DECISION-STORAGE-001
**Date:** 2026-10-18
**Sprint:** SPRINT-0004 (Build coherent reporting, spend and actual-cost coverage)
**Status:** Approved & Implemented
**Authority:** AGENTS.md, docs/sprints/SPRINT-0004.md, docs/sprints/ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md

---

## 1. Executive Summary & Context

SendMyNotes requires an authoritative reporting engine that reconciles observed entry cohorts, verified financial transactions, supplier production costs, and dated campaign spend.

As of the canonical baseline:
- Cloud BigQuery IAM, billing, and datasets are **not provisioned**.
- The production datastore is Cloud Firestore (and in local development/test, disk-persisted mock Firestore).
- The historical operational database contains hundreds of orders, thousands of legacy telemetry events, and newly introduced immutable financial fact ledgers (`financial_facts`, `provider_webhook_inbox`, `transactional_outbox`, `telemetry_events_v2`).

To avoid unbounded full-table scans on every dashboard refresh while ensuring deterministic attribution, exact transaction-time reconciliation, and mathematical consistency across drilldowns and exports, we evaluated two paths:
1. **Option A: External Cloud Data Warehouse (Google BigQuery)**
2. **Option B: Bounded Firestore Projections with Storage-Independent API Contracts**

---

## 2. Evaluation & Feasibility Matrix

| Evaluation Dimension | Option A: Google BigQuery Warehouse | Option B: Bounded Firestore Projections (Selected) |
| :--- | :--- | :--- |
| **Provisioning Status** | **Unavailable.** No GCP BigQuery dataset, service account credentials, or billing project configured in environment. | **Available.** Uses existing Firestore / mock Firestore persistence layer. |
| **Query Latency** | High overhead on small queries (1.5s - 4.0s startup latency per query). | Sub-50ms indexed lookups on cached cohort projections and bounded collections. |
| **Local / Test Portability** | Zero local support without cloud emulators and mock GCP credentials. Prohibits air-gapped test execution in `withSafeTestHarness`. | Native offline support with local mock Firestore (`.data/mock-firestore.json`) and in-memory test harnesses. |
| **Cost & Billing Risk** | Additional GCP billing line item, slot allocations, and IAM management overhead. | Zero incremental vendor spend or API cost; operates entirely within existing standard footprint. |
| **Scan Boundaries** | Can scan terabytes if queries lack partitioning / clustering. | Strictly bounded by finite date windows (e.g. 7d, 30d, custom), pagination limits (50-200), and pre-aggregated summaries. |
| **Adapter Disclosure** | N/A | Exposes `adapterType: "firestore_bounded"` and `cloudWarehouseStatus: "not_provisioned"` in all reporting responses. |

---

## 3. Decision

We adopt **Option B: Bounded Firestore Projections** with a storage-independent interface design.

1. **Storage-Independent Engine Design:**
   The reporting engine (`lib/reporting-engine.ts`) and spend/cost ledger (`lib/spend-and-cost-ledger.ts`) interact through clean, decoupled query contracts (`ReportingStorageAdapter`, `SpendLedgerStorageAdapter`). If a BigQuery or ClickHouse warehouse is provisioned in the future, the backend adapter can be swapped with zero breaking changes to API consumers or client contracts.

2. **Explicit Adapter Gap Disclosure:**
   All reporting API responses and metric envelopes explicitly disclose:
   ```json
   "storage": {
     "adapterType": "firestore_bounded",
     "cloudWarehouseStatus": "not_provisioned",
     "maxQueryWindowDays": 90,
     "projectionVersion": "2026-10-18.v1"
   }
   ```

3. **Collection Schema & Indexed Read Boundaries:**
   To guarantee bounded execution and eliminate unbounded table scans:
   - **`dated_spend_ledger`**: Stores dated advertising spend by calendar date (`YYYY-MM-DD`), channel, and optional campaign. Deterministic key: `spend_${date}_${channel}_${utmCampaign || "_all_"}`.
   - **`supplier_cost_allocations`**: Stores unit supplier costs (e.g., Handwrytten invoices, postage, printing) tied to verified orders. Deterministic key: `cost_${orderId}_${invoiceId}`.
   - **`reporting_projections_v2`**: Stores versioned aggregate projections computed over specific cohorts, cached with a 5-minute freshness TTL.
   - **Indexed Boundaries:** Queries are bounded by date range filters (`from` and `to` timestamps) and capped pagination cursors. Replays run as background/asynchronous jobs with rate limits.

4. **Replay & Concurrency Safety:**
   Analytics projection replays operate with `isReplay: true`, updating only derived analytical summaries and projection documents without touching external side effects (fulfillment APIs, emails, Stripe webhooks).

---

## 4. Verification & Rollback

- **Verification:**
  Verified in test suite `tests/sprint-0004-reporting-and-spend.test.ts` across golden scenarios (`scen_skipped_funnel_stages`, `scen_unknown_cost_and_zero_spend`, `scen_founder_mobile_ad`, `scen_ultrawide_customer`), verifying deterministic aggregates, pagination parity, idempotent imports, and lack of external side effects.
- **Rollback Strategy:**
  Because operational raw data (`orders`, `financial_facts`, `telemetry_events_v2`) remains immutable and intact, projections can be dropped or rebuilt at any time via `runAnalyticsProjectionReplay()` without data loss or downtime.
