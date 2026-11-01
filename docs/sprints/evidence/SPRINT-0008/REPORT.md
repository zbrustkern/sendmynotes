> **Current takeover status (October 19):** The earlier report below is historical. Integrated checks and remaining acceptance gaps are recorded in [the Codex/Luna readiness checkpoint](../../../../.delivery/runs/20261019-codex-luna-takeover/READINESS.md). A passing fixture suite is not staging/production or visual acceptance.

# SPRINT-0008 Evidence Report: Promotions and Growth Workspaces

**Sprint**: SPRINT-0008
**Title**: Ship first-class Promotions and Growth workspaces
**Status**: Implementation Complete — Validation & Evidence Recorded
**Timestamp**: 2026-10-18T20:48:00-05:00
**Authority Dependencies**: SPRINT-0004 (Reporting & Spend/Cost Ledger), SPRINT-0005 (Offer Lifecycle, Quotes & Redemptions Engine)
**Execution Lane**: Dedicated SPRINT-0008 lane (strictly preserved file concurrency boundaries; zero edits to SPRINT-0007 files or `ledger.json`)

---

## 1. Executive Summary

SPRINT-0008 delivers first-class Promotions and Growth workspaces giving the founder authoritative discount creation and distribution controls, safe destination-aware link generation, consequential change preview with strictly blocked hard deletion of redeemed codes, and an evidence-based view of campaigns and high-intent draft recovery.

In strict compliance with Contract 4 and Contract 2:
1. **Promotions Workspace**:
   - Familiar presets (`welcome_2_off`, `launch_20_pct`, `vip_free_card`, `recovery_150_off`).
   - Destination-aware URL generator enforcing an allowlist (`/`, `/send`, `/send/[occasion]`, `/send/[occasion]/[slug]`, `/preview/entry`), rejecting external, javascript, data, or path traversal URLs.
   - Query aliases supported in priority order: `?discount=`, `?code=`, `?promo=`.
   - Authoritative live price quote & subsidy preview calculated from canonical 900¢ base without billable external calls.
   - Consequential change preview assessing active checkout holds (30-min quote window), redemptions count, and strictly refusing hard deletion of redeemed codes (requiring archiving instead).
   - Immutable audit logging into `admin_audit_log` with actor, action, previous/new state, reason, and timestamp.
   - Comprehensive evidence drawer reconciling exposure, applies, rejects, holds, redemptions, refunds, exact cents, explicit unconfirmed cost (`costStatus: "unconfirmed"`, `verifiedContributionMarginCents: null`), commercial breakdown, and honest guest coverage notes.
2. **Growth Workspace**:
   - Reconciles full-cohort dated ad spend from `dated_spend_ledger` with observed orders and redemptions.
   - Explicit separation of paid discounted orders from 100% free promo orders and studio comps.
   - Prominent Descriptive Non-Causal Attribution Badge: `"Descriptive Redemption Share — Not Causal Lift (No Control Holdout)"` with founder advisory against premature code termination on small sample sizes.
   - High-intent draft recovery tool categorizing resumability into `server_order_draft` (cross-device restoration) and `browser_local_only` (local device cache), with contact eligibility badges (`eligible` vs `anonymous_uncontactable`).
   - Manual recovery link builder preserving original acquisition attribution (`originalChannel`, `originalUtmCampaign`, `touchType: "manual_recovery"`).
   - Strict guarantee: Zero automated customer messaging or SMS; zero ad platform mutation.

---

## 2. Task Breakdown & Execution Status

| Task ID | Task Description | Dependencies | Status | Evidence / Artifact |
| :--- | :--- | :--- | :--- | :--- |
| **SPRINT-0008-T01** | Promotions workspace and editor: search/filter/lifecycle, familiar presets, fixed/percent/free offers, campaign association, caps/budget, live price preview, explicit subsidy/unknown-cost state. | None | **PASSED** | `lib/promotions-and-growth-service.ts`, `components/admin/PromotionsWorkspace.tsx`, `app/admin/promotions/page.tsx` |
| **SPRINT-0008-T02** | Offer distribution and application preview: destination-aware allowlisted links, aliases (`?discount=`, `?code=`, `?promo=`), UTM tracking, copy link, non-billable validation preview, consequential change preview with delete protection. | T01 | **PASSED** | `lib/promotions-and-growth-service.ts`, `app/api/admin/promotions/route.ts`, `tests/sprint-0008-promotions-and-growth.test.tsx` (Suite 1, Suite 4) |
| **SPRINT-0008-T03** | Offer evidence and Growth: funnel (views, applies, rejects, holds, redemptions, refunds), exact cents, dated spend merge, separation of paid vs free promo/comp, non-causal attribution badge. | T02 | **PASSED** | `lib/promotions-and-growth-service.ts`, `components/admin/GrowthWorkspace.tsx`, `tests/sprint-0008-promotions-and-growth.test.tsx` (Suite 2, Suite 3) |
| **SPRINT-0008-T04** | Recovery investigation tools: draft resumability classification (`server_order_draft` vs `browser_local_only`), contact eligibility, attribution-preserving manual recovery links, zero automated messaging. | T03 | **PASSED** | `lib/promotions-and-growth-service.ts`, `components/admin/GrowthWorkspace.tsx`, `app/api/admin/growth/route.ts` |
| **SPRINT-0008-T05** | End-to-end acceptance: synthetic test suite covering AC01-AC04, exact cents/ledger parity, discount subsidy integrity, and role/auth verification (`verifyAdminAuth` HTTP 401). | T04 | **PASSED** | `tests/sprint-0008-promotions-and-growth.test.tsx` (60/60 tests passing) |

---

## 3. Acceptance Criteria Verification

### SPRINT-0008-AC01: Presets, Destination Links & Non-Billable Validation
- **Requirement**: Existing percentage/fixed/100%-off/manual/comp and share-link capabilities are preserved; new code creation is easier to contextualize and preview.
- **Verification Result**: **PASSED**
  - All 4 starter presets (`welcome_2_off`, `launch_20_pct`, `vip_free_card`, `recovery_150_off`) verified with correct discount types and values.
  - Destination allowlist accepts approved routes: `/`, `/send`, `/send/birthday`, `/send/thank-you/elegant-rose`, `/preview/entry`.
  - Rejects external hosts (`https://`), protocol-relative URLs (`//`), `javascript:`, `data:`, path traversal (`..`), and internal `/admin` paths.
  - Supports query aliases `?discount=`, `?code=`, and `?promo=` with seamless parameter preservation and UTM tags.
  - Non-billable dry-run price quote preview accurately computes list price (900¢), discount amount, final amount, and subsidy without external calls.

### SPRINT-0008-AC02: Offer Evidence Detail & Financial Exact Cents Parity
- **Requirement**: Offer detail reconciles exposed/applied/paid/free/refunded counts and actual dollars to its orders and versions; missing identity/cost stays explicit.
- **Verification Result**: **PASSED**
  - Simulated funnel reconciling views, applies (quotes), rejects, holds (reservations), redemptions, and refunds.
  - Exact financial cents verified: Gross list value (1800¢ = $18.00), total subsidy given (600¢ = $6.00), net captured cash revenue (1200¢ = $12.00), refunded cents (600¢ = $6.00).
  - Explicit `costStatus: "unconfirmed"` and `verifiedContributionMarginCents: null` whenever supplier invoices are not allocated. No margins are fabricated.
  - Commercial classification properly distinguishes `discounted_paid`, `free_promo`, and `studio_comp`.
  - Includes honest coverage statement acknowledging anonymous guest multi-device limitations.

### SPRINT-0008-AC03: Growth Scope, Dated Spend, Non-Causal Badge & Recovery
- **Requirement**: Growth totals use full scope and dated spend; recovery codes do not overwrite original acquisition or prove incremental conversion.
- **Verification Result**: **PASSED**
  - Dated ad spend merged from `dated_spend_ledger` (5000¢ = $50.00 Meta Ads) matched to campaign performance.
  - Cash-paying orders counted strictly separately from 100% free promo vouchers and studio comps.
  - Descriptive ROAS calculated without confounding free promos as paid revenue.
  - Prominently displays `DESCRIPTIVE_ATTRIBUTION_BADGE`: `"Descriptive Redemption Share — Not Causal Lift (No Control Holdout)"` with advisory text warning against automatic code termination on small sample sizes.
  - Recovery tool accurately classifies drafts:
    - `server_order_draft`: appends `draftId` for cross-device restoration.
    - `browser_local_only`: omits `draftId` to avoid mismatch, explaining draft is local to device cache.
  - Preserves original acquisition attribution (`originalChannel`, `originalUtmCampaign`, `touchType: "manual_recovery"`).
  - Guarantees zero automated messaging in disclaimers.

### SPRINT-0008-AC04: Consequential Change Preview, Delete Guard & Role Enforcement
- **Requirement**: All consequential offer changes show their effect, audit and role enforcement; no outreach/ad-platform mutation or live fulfillment occurs.
- **Verification Result**: **PASSED**
  - Consequential change preview inspects active reservations count and displays notice that unexpired quotes (issued in the last 30 minutes) remain valid.
  - Evaluates `canHardDelete`:
    - Code with 0 redemptions: `canHardDelete: true` (deletion permitted).
    - Code with >=1 redemptions: `canHardDelete: false` (deletion strictly blocked; returns 400 error requiring archive).
  - Archiving redeemed code succeeds, deactivating future applies while preserving historical ledger parity.
  - All mutations write an immutable record into `admin_audit_log` with actor, action, previous/new state, reason, and timestamp.
  - Security verification: `verifyAdminAuth` rejects unauthorized requests with HTTP 401 across all endpoints (`GET /api/admin/promotions`, `POST /api/admin/promotions`, `GET /api/admin/growth`, `POST /api/admin/growth`).

---

## 4. Test Suite Execution Summary

```
======================================================================
🏷️ RUNNING SPRINT-0008 PROMOTIONS & GROWTH WORKSPACES TEST SUITE
======================================================================

--- SUITE 1: AC01 — Presets, Destination Allowlist & Link Builder ---
  ✅ PASS: Preset welcome_2_off provides $2.00 fixed discount
  ✅ PASS: Preset launch_20_pct provides 20% discount
  ✅ PASS: Preset vip_free_card provides 100% free card
  ✅ PASS: Preset recovery_150_off provides $1.50 recovery incentive
  ✅ PASS: Allows root path '/'
  ✅ PASS: Allows '/send'
  ✅ PASS: Allows '/send/birthday'
  ✅ PASS: Allows '/send/thank-you/elegant-rose'
  ✅ PASS: Allows '/preview/entry'
  ✅ PASS: Rejects external https:// URLs
  ✅ PASS: Rejects protocol-relative // URLs
  ✅ PASS: Rejects javascript: scheme
  ✅ PASS: Rejects data: scheme
  ✅ PASS: Rejects path traversal (..)
  ✅ PASS: Rejects internal non-customer path '/admin'
  ✅ PASS: Builds link with ?discount= alias and UTM tracking
  ✅ PASS: Supports ?code= query alias
  ✅ PASS: Supports ?promo= query alias
  ✅ PASS: Fixed $2.00 off preview: $9.00 -> $7.00 (subsidy $2.00)
  ✅ PASS: 100% off preview: $9.00 -> $0.00 (isFree: true)

--- SUITE 2: AC02 — Offer Evidence Detail & Financial Reconciliation ---
  ✅ PASS: Quotes issued successfully
  ✅ PASS: Evidence detail generated
  ✅ PASS: Funnel records 2 redemptions
  ✅ PASS: Funnel records 1 refund
  ✅ PASS: Exact Gross List Value is 1800¢ ($18.00)
  ✅ PASS: Exact Subsidy Given is 600¢ ($6.00)
  ✅ PASS: Exact Net Captured Revenue is 1200¢ ($12.00)
  ✅ PASS: Exact Refunded Amount is 600¢ ($6.00)
  ✅ PASS: Cost status is explicitly 'unconfirmed' when invoice not allocated
  ✅ PASS: Verified margin is strictly null (never fabricated)
  ✅ PASS: Commercial breakdown identifies 2 paid discounted orders
  ✅ PASS: Includes honest guest identity & unconfirmed cost coverage note

--- SUITE 3: AC03 — Growth Campaigns, Non-Causal Badge & Recovery ---
  ✅ PASS: Report displays 'Descriptive Redemption Share — Not Causal Lift (No Control Holdout)'
  ✅ PASS: Includes advisory against premature code termination on small sample sizes
  ✅ PASS: Finds 'fall_special_2026' in campaigns list
  ✅ PASS: Matches exact dated spend ($50.00)
  ✅ PASS: Counts paid orders
  ✅ PASS: Computes descriptive ROAS
  ✅ PASS: Recovery link applies offer code via ?discount=
  ✅ PASS: Preserves original acquisition channel as utm_source
  ✅ PASS: Preserves original campaign as utm_campaign
  ✅ PASS: Tags touchpoint with recovered_from=draft_id
  ✅ PASS: Includes draftId for cross-device restoration of server draft
  ✅ PASS: Guarantees zero automated messaging in disclaimer
  ✅ PASS: Browser-local link does not append draftId to prevent cross-device draft mismatch
  ✅ PASS: Explicitly notes draft was stored in local browser storage only

--- SUITE 4: AC04 — Consequential Change Preview & Audited Mutations ---
  ✅ PASS: Unused code with 0 redemptions can be hard-deleted (canHardDelete: true)
  ✅ PASS: Unused code deleted successfully
  ✅ PASS: Redeemed code CANNOT be hard-deleted (canHardDelete: false)
  ✅ PASS: Preview emits warning that hard deletion is blocked
  ✅ PASS: executeAuditedOfferChange refuses to hard-delete redeemed code
  ✅ PASS: Error advises founder to archive code instead to preserve accounting
  ✅ PASS: Archiving redeemed code succeeds
  ✅ PASS: Offer status updated to 'archived'
  ✅ PASS: Audited mutations recorded in admin_audit_log collection (found 2 entries)
  ✅ PASS: Audit record captures actor, targetType, and immutable timestamp

--- SUITE 5: API Security & verifyAdminAuth Enforcement ---
  ✅ PASS: Unauthorized GET /api/admin/promotions returns HTTP 401
  ✅ PASS: Unauthorized POST /api/admin/promotions returns HTTP 401
  ✅ PASS: Unauthorized GET /api/admin/growth returns HTTP 401
  ✅ PASS: Unauthorized POST /api/admin/growth returns HTTP 401

======================================================================
🏁 SPRINT-0008 TEST RESULTS: 60/60 PASSED (0 FAILED)
======================================================================
```

---

## 5. File Ownership & Concurrency Boundary Verification

Strict adherence to the 9 designated files was maintained throughout:
1. `lib/promotions-and-growth-service.ts` (created) — Authoritative promotions and growth service.
2. `app/api/admin/promotions/route.ts` (created) — Admin promotions API route with role enforcement.
3. `app/api/admin/growth/route.ts` (created) — Admin growth API route with role enforcement.
4. `components/admin/PromotionsWorkspace.tsx` (created) — First-class Promotions UI workspace.
5. `components/admin/GrowthWorkspace.tsx` (created) — First-class Growth UI workspace.
6. `app/admin/promotions/page.tsx` (created) — Executive shell wrapper for `/admin/promotions`.
7. `app/admin/growth/page.tsx` (created) — Executive shell wrapper for `/admin/growth`.
8. `tests/sprint-0008-promotions-and-growth.test.tsx` (created) — Comprehensive AC01-AC04 test suite.
9. `docs/sprints/evidence/SPRINT-0008/REPORT.md` (created) — Sprint evidence report.

No edits were made to SPRINT-0007 files (`app/admin/page.tsx`, `lib/investigation-service.ts`, `components/admin/OrderJourneyDrawer.tsx`, `app/api/admin/investigations/*`) or `docs/sprints/ledger.json`.

---

## 6. Safety, Privacy & Invariant Attestations

1. **Zero Billable Production Calls**: No outbound API calls to Handwrytten or USPS fulfillment were made. Price previews and validation are non-billable dry-runs.
2. **Zero Ad Platform Mutation**: No automated ad spend mutation, campaign creation, or Meta Graph API calls were executed.
3. **Zero Automated Customer Messaging**: Recovery tools strictly generate manual links for founder-assisted gestures; no emails, SMS, or automated campaigns are dispatched.
4. **Non-Causal Attribution Discipline**: Redemptions are framed as descriptive share, never causal lift.
5. **No Unsupported Business Claims**: Supplier costs remain explicitly unconfirmed until invoice matching; margin is never fabricated.

---

## 7. Migration, Rollback & Review Provenance

- **Migration**: Fully backward-compatible. Bridges legacy `discount_codes` into versioned `offer_versions` records transparently without schema mutations.
- **Rollback**: UI routes (`/admin/promotions`, `/admin/growth`) can be disabled or removed independently without affecting transactional offer redemption in checkout.
- **Next Action**: Orchestrator verification and ledger update.
