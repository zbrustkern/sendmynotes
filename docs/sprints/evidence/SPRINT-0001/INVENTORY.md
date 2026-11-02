# SPRINT-0001: Repository Inventory, Consumer Audit & Safe Baseline

**Sprint**: SPRINT-0001 (Tasks T01 & T05)
**Date**: October 18, 2026
**Local Git Commit**: `f9f187e0498ffb6b586c9970aeda8aa3fcf92f96`
**Governing Documents**: `AGENTS.md`, `docs/CANONICAL_PROJECT_BRIEF.md`, `docs/CANONICAL_PRODUCT_SPECS.md`, `docs/sprints/ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md`, `docs/sprints/SPRINT-0001.md`, `docs/CODEBASE_CLEANUP_AUDIT_2026-10-16.md`

---

## 1. Executive Summary & Inventory Scope

This document records the foundational repository inventory and safety audit conducted prior to executing implementation changes for the SendMyNotes Admin Overhaul. In strict compliance with `AGENTS.md` and `SPRINT-0001.md`:
1. No external fulfillment, real ink card dispatch, or live financial transactions were executed.
2. All provider and environment keys were audited by variable name only; no credentials or secrets were printed.
3. The codebase baseline was verified against the October 16 cleanup audit (`docs/CODEBASE_CLEANUP_AUDIT_2026-10-16.md`).
4. Reusable shared contracts (`lib/contracts/admin-overhaul.ts`), deterministic golden fixtures (`lib/contracts/golden-fixtures.ts`), and a safe test harness (`lib/testing/safe-harness.ts`) were established to isolate future automated tests from external side effects.

---

## 2. Public & Admin Route Inventory

### 2.1 Public UI Pages (`app/**/page.tsx`)

| Path | Purpose | Active Status & Implementation Component |
| --- | --- | --- |
| `app/page.tsx` | Root landing page | Active. Resolves entry parameters and renders `<ExperienceRouter />`. |
| `app/new/page.tsx` | Direct card builder entry | Active. Directly imports and renders `<EntryPrototypeClient />` (`app/preview/entry/client.tsx`). |
| `app/send/page.tsx` | Occasion landing | Active. Resolves occasion query/params and renders `<ExperienceRouter />`. |
| `app/send/[occasion]/page.tsx` | Occasion landing | Active. Renders `<ExperienceRouter />` with `initialOccasion`. |
| `app/send/[occasion]/[slug]/page.tsx` | Specific scenario page | Active. Renders `<ExperienceRouter />` with `scenarioSlug` and pre-populated note/font context. |
| `app/preview/page.tsx` | Legacy preview redirect | Active. Redirects to `/preview/entry`. (Note: `next.config.ts` also contains redirect rules). |
| `app/preview/entry/page.tsx` | Preview builder entry | Active. Directly imports and renders `<EntryPrototypeClient />`. |
| `app/order/[id]/page.tsx` | Order status viewer | Active. Displays order timeline, proof images, and tracking. |
| `app/order/[id]/complete-address/page.tsx` | Deferred address entry | Active. Singular route allowing recipient/sender address completion post-purchase. |
| `app/orders/[id]/complete-address/page.tsx` | Plural alias for deferred address | Active. Re-exports `app/order/[id]/complete-address/page.tsx` for email link compatibility. |
| `app/account/page.tsx` | User account & order history | Active. Displays past orders, addresses, and saved cards. |
| `app/privacy/page.tsx` | Privacy policy | Active static page. |
| `app/terms/page.tsx` | Terms of service | Active static page. |
| `app/return-policy/page.tsx` | Return policy | Active static page. |

### 2.2 Admin UI Pages (`app/admin/**/page.tsx`)

| Path | Purpose | Active Status |
| --- | --- | --- |
| `app/admin/page.tsx` | Current admin command center | Active monolithic dashboard. Imports metrics rollup, incident logger, order manager, campaign widgets. |
| `app/admin/feature-flags/page.tsx` | Feature flag manager | Active legacy toggle UI for `v3_experience_rollout` and arbitrary keys. |

### 2.3 API Route Handlers (`app/api/**/route.ts`)

| Route | HTTP Methods | Purpose | Sensitive Effects / Authority |
| --- | --- | --- | --- |
| `app/api/checkout/create-intent/route.ts` | POST | Creates Stripe PaymentIntent or initializes checkout | Creates Stripe PI, calculates discount, validates personal sender. |
| `app/api/checkout/confirm-order/route.ts` | POST | Verifies Stripe PI and triggers order processing | Reads Stripe PI, saves order to Firestore, triggers fulfillment queue. |
| `app/api/checkout/complete-free-order/route.ts` | POST | Dispatches 100% discounted orders | Validates free discount, records order, dispatches fulfillment. |
| `app/api/discount/validate/route.ts` | POST | Validates discount code and returns preview | Read-only calculation of discount and final subtotal. |
| `app/api/generate-cover/route.ts` | POST | Generates AI card cover art | Calls Nano Banana / Gemini API or returns preset fallback. |
| `app/api/orders/[id]/route.ts` | GET | Order details by ID | Read-only order query with view-token protection. |
| `app/api/orders/[id]/complete-address/route.ts` | POST | Submits deferred recipient address | Updates order document and queues fulfillment if paid. |
| `app/api/reminders/route.ts` | GET, POST, DELETE | Scheduled card reminders | Firestore CRUD for recipient dates. |
| `app/api/telemetry/route.ts` | POST | Client telemetry event ingestion | Ingests client events, updates session aggregations. |
| `app/api/feedback/route.ts` | POST | User feedback capture | Writes feedback to Firestore. |
| `app/api/account/route.ts` | GET, POST | User account profile | Firestore user document management. |
| `app/api/feature-flags/route.ts` | GET | Public feature flag resolution | Reads feature flags from Firestore or environment. |
| `app/api/webhooks/stripe/route.ts` | POST | Stripe webhook receiver | Verifies signature, updates order to `PAYMENT_RECEIVED`, dispatches fulfillment. |
| `app/api/webhooks/handwrytten/route.ts` | POST | Handwrytten webhook receiver | Updates order status (e.g., mailed, tracking number). |
| `app/api/admin/auth/route.ts` | POST | Admin login authentication | Verifies admin password / token against `ADMIN_SECRET_KEY`. |
| `app/api/admin/metrics/route.ts` | GET | Admin dashboard rollups | Runs `getAdminDashboardMetrics` across Firestore collections. |
| `app/api/admin/incidents/route.ts` | GET, POST, PATCH | Incident management | Reads and resolves operational incidents. |
| `app/api/admin/discounts/route.ts` | GET, POST, PATCH, DELETE | Promo code management | CRUD operations on `discounts` Firestore collection. |
| `app/api/admin/dispatch-comp/route.ts` | POST | Dispatches complimentary card | Direct operator fulfillment dispatch without payment. |
| `app/api/admin/retry-fulfillment/route.ts` | POST | Retries failed fulfillment | Dispatches order to Handwrytten API. Billable external effect! |
| `app/api/admin/sync-handwrytten/route.ts` | POST | Synchronizes status with Handwrytten | Fetches remote order status and updates Firestore. |
| `app/api/admin/sync-stripe/route.ts` | POST | Synchronizes payment status with Stripe | Fetches remote Stripe PaymentIntent and updates Firestore. |
| `app/api/admin/handwrytten-balance/route.ts` | GET | Checks supplier credit balance | Fetches account balance from Handwrytten API. |
| `app/api/admin/ad-spend/route.ts` | GET, POST | Manages scalar ad spend | Reads/writes manual ad spend figure in Firestore config. |
| `app/api/admin/valuation-assumptions/route.ts` | GET, POST | Valuation model constants | Reads/writes assumed LTV and margins in Firestore config. |
| `app/api/admin/scenarios/route.ts` | GET, POST | Ad scenario management | CRUD for scenario landing templates. |
| `app/api/admin/feature-flags/route.ts` | GET, POST | Admin feature flag manager | CRUD on `feature_flags` Firestore collection. |
| `app/api/admin/mark-founder-device/route.ts` | POST | Flags device as founder | Stores `clientId` / `sessionId` in `system_config/founder_registry`. |
| `app/api/admin/unflag-founder-sessions/route.ts` | POST | Removes founder flag | Deletes session/client from founder registry. |
| `app/api/admin/test-meta-capi/route.ts` | POST | Triggers test Meta CAPI event | Sends test event to Meta Conversions API. |
| `app/api/admin/order-proof/route.ts` | GET | Generates card print proof | Renders high-resolution composite card preview. |

---

## 3. Active Builder, Payment, and Discount Consumers

Comparison against `docs/CODEBASE_CLEANUP_AUDIT_2026-10-16.md`:

### 3.1 Experience Routing & Builder Components
- **`components/ExperienceRouter.tsx`**:
  - Checks query parameter `v3` (`?v3=1` or `?v3=0`) with fallback to `initialIsV3` (defaults to `true`).
  - When `isV3` is `true`, imports and renders `<EntryPrototypeClient />` from `app/preview/entry/client.tsx`.
  - When `isV3` is `false`, imports and renders legacy `<VendingMachineBuilder />` from `components/VendingMachineBuilder.tsx`.
  - Also imported by `app/page.tsx` (root), `app/send/page.tsx`, `app/send/[occasion]/page.tsx`, and `app/send/[occasion]/[slug]/page.tsx`.
- **`app/preview/entry/client.tsx` (`EntryPrototypeClient`)**:
  - The authoritative active builder (~1,400 lines).
  - Handles card selection (`EntryCardStep`), note composition, envelope addressing, payment, and confirmation.
  - Hydrates and synchronizes draft storage (`smn_active_draft_v2`).
  - Imports only two pure utility functions from `components/v3/TargetPurchaseExperience`: `extractRecipientName` and `extractSenderName`.
- **`components/v3/TargetPurchaseExperience.tsx`**:
  - An inactive 648-line orchestrator shell.
  - The application code does **not** render `TargetPurchaseExperience`. It is only referenced for `extractRecipientName` and `extractSenderName` in `app/preview/entry/client.tsx` and in `tests/target-experience.test.ts`.
- **`lib/discount.ts`**:
  - Actively consumed by `app/api/discount/validate/route.ts`, `app/api/checkout/create-intent/route.ts`, and `app/api/checkout/complete-free-order/route.ts`.
  - Exports `calculateDiscount` and `validateDiscount` with support for percentage and fixed-amount discounts, expiration timestamps, and usage caps.
- **`lib/order-processor.ts`**:
  - Actively consumed by `app/api/checkout/confirm-order/route.ts`, `app/api/webhooks/stripe/route.ts`, and `app/api/orders/[id]/complete-address/route.ts`.
  - Enforces `validatePersonalSender` to reject brand senders (e.g. "Aster & Blanche").
  - Triggers Handwrytten fulfillment (`fulfillHandwryttenOrder`) and records discount usage (`recordDiscountUsage`).

---

## 4. Script and Test Safety Classification

### 4.1 Scripts (`scripts/` and `package.json`)

| Script / File | Execution Command | Side Effects & External Services | Safety Classification | Notes |
| --- | --- | --- | --- | --- |
| `scripts/generate-backplate.ts` | `npm run build:assets` | Local filesystem only (`sharp` writes PNG to `public/`) | **SAFE** | Pure image rendering asset generation. |
| `scripts/generate-previews.ts` | `npm run build:previews` | Local filesystem only (`sharp` generates card presets) | **SAFE** | Local image generation. |
| `scripts/install-card-presets.ts` | `tsx scripts/install-card-presets.ts` | Reads/writes local presets or Firestore presets | **SAFE** (with mock db) | Pure preset seeding. |
| `scripts/install-new-presets.ts` | `tsx scripts/install-new-presets.ts` | Local filesystem / preset data | **SAFE** | Seeding script. |
| `scripts/update-flagged-presets.ts`| `tsx scripts/update-flagged-presets.ts` | Local preset JSON modification | **SAFE** | Local data file edits. |
| `scripts/prepare-ad-assets.ts` | `tsx scripts/prepare-ad-assets.ts` | Local filesystem image transformation | **SAFE** | Asset preparation. |
| `scripts/verify-ad-entry-browser.ts`| `tsx scripts/verify-ad-entry-browser.ts` | Puppeteer / Chrome local headless navigation | **SAFE** (read-only) | Reads localhost HTTP server. |
| `scripts/verify-workbench.ts` | `tsx scripts/verify-workbench.ts` | Hardcoded Antigravity paths & Chrome execution | **SAFE** (read-only) | Obsolete developer path wiring. |
| `scripts/test-card-creation.ts` | `tsx scripts/test-card-creation.ts` | **Calls live `api.handwrytten.com`!** Uploads logo, creates custom card, dispatches order | **CRITICAL: UNSAFE** | **DO NOT RUN.** Reads `.env.local` API key and sends real physical card to Lake Forest, IL. Billable operation. |

### 4.2 Test Suites (`tests/`)

| Test File | Script in `package.json` | Mocking / Isolation Behavior | Safety Classification | Notes |
| --- | --- | --- | --- | --- |
| `tests/milestone1.test.ts` | `npm run test:m1` | Saves order to Firestore; **calls `fulfillHandwryttenOrder` and Stripe PI helper** | **CRITICAL: UNSAFE** | **DO NOT RUN.** Can trigger live fulfillment if API key is present. |
| `tests/milestone4.test.ts` | `npm run test:m4` | Saves order to Firestore; **calls `fulfillHandwryttenOrder` directly** | **CRITICAL: UNSAFE** | **DO NOT RUN.** Simulates webhook by dispatching real fulfillment call. |
| `tests/unit-economics.test.ts` | `npm run test:margins` | In-memory unit economics math calculations | **SAFE** | Pure math assertions. |
| `tests/reminders.test.ts` | `npm run test:reminders` | Pure date calculations & mock reminder validations | **SAFE** | In-memory tests. |
| `tests/contact-parser.test.ts` | `npm run test:parser` | Pure string and address parsing functions | **SAFE** | In-memory unit tests. |
| `tests/card-intent.test.ts` | `npm run test:intent` | In-memory intent classification & regex checks | **SAFE** | Pure logic tests. |
| `tests/thematic-sentiment.test.ts` | `npm run test:thematic` | Pure keyword and sentiment classification | **SAFE** | In-memory unit tests. |
| `tests/handwrytten-sync.test.ts` | `npm run test:sync` | Uses mock Firestore and mock responses | **SAFE** | Mocked sync verification. |
| `tests/transaction-security.test.ts`| `npm run test:security` | Tests security guards, CSRF, and input limits | **SAFE** | Mocked HTTP requests. |
| `tests/security-review-remediation.test.ts` | `npm run test:security-review` | Uses in-memory fakes; tests rate limiting, sender validation | **SAFE** (mocked) | Contains pre-existing TS errors (lines 54, 336). |
| `tests/visitor-telemetry.test.ts` | `npm run test:telemetry` | Tests telemetry event schemas and payload boundaries | **SAFE** | In-memory telemetry validation. |
| `tests/feature-flags.test.ts` | `npm run test:flags` | Evaluates flag resolution logic | **SAFE** | In-memory unit tests. |
| `tests/target-experience.test.ts` | `npm run test:target` | Tests `extractRecipientName` and `extractSenderName` | **SAFE** | Pure string extraction unit tests. |
| `tests/ad-scenarios-routing.test.ts` | `npm run test:ads` | Tests URL and scenario routing resolution | **SAFE** | Pure routing logic tests. |
| `tests/meta-conversions-api.test.ts` | `npm run test:meta` | Mocks fetch; tests Meta CAPI payload format | **SAFE** (mocked) | Intercepts fetch. |
| `tests/payment-mode-safety.test.ts` | `npm run test:payment-mode` | Tests payment mode transitions | **SAFE** | Pure state machine tests. |
| `tests/sender-validation.test.ts` | `npm run test:sender-validation` | Mocks `global.fetch` explicitly for Handwrytten endpoints | **SAFE** (mocked) | Intercepts and captures fetch payloads. |
| `tests/telemetry-ingestion.test.ts` | `npm run test:telemetry-ingestion` | Tests ingestion API and rate limiting | **SAFE** | In-memory request testing. |
| `tests/delivery-estimate.test.ts` | `npm run test:delivery-estimate` | Pure business day & holiday delivery calculator | **SAFE** | Pure date math tests. |
| `tests/draft.test.ts` | `npm run test:draft` | Tests localStorage draft serialization and hydration | **SAFE** | In-memory draft tests. |
| `tests/scenario-draft-seeding.test.ts` | `npm run test:scenario-draft` | Tests seeding drafts from URL scenarios | **SAFE** | Pure state seeding tests. |
| `tests/review-remediation.test.ts` | `npm run test:remediation` | Tests validation logic and error messages | **SAFE** | In-memory validation tests. |
| `tests/artwork-harness.test.ts` | `npm run test:artwork` | Tests prompt sanitation & fallback images | **SAFE** | Fallback mock mode. |
| `tests/art-generation-fixtures.test.ts` | `npm run test:art-fixtures` | Tests art preset fixtures and aspect ratios | **SAFE** | Fixture validation. |
| `tests/auto-select-ad-entry.test.ts` | `npm run test:auto-select` | Tests redirect and entry query parsing | **SAFE** | URL parsing logic. |
| `tests/render-auto-select.test.tsx` | `npm run test:render-auto-select` | React component render tests | **SAFE** | Contains 1 pre-existing TS error (line 118). |
| `tests/founder-filter-and-real-edit.test.ts` | `npm run test:founder-filter` | Tests founder filtering rules in metrics | **SAFE** | Contains 7 pre-existing TS errors. |
| `tests/email-transactional.test.ts` | `npm run test:email` | Tests Resend transactional email payload generation | **SAFE** (simulation) | Contains 1 pre-existing TS error (line 116). |
| `tests/staging-polish.test.tsx` | `npm run test:staging-polish` | Component rendering tests for styling | **SAFE** | In-memory render. |
| `tests/root-auto-select.test.tsx` | `npm run test:root-auto-select` | Component tests for root redirects | **SAFE** | Contains 1 pre-existing TS error (line 296). |
| `tests/rate-limit.test.ts` | *(none in package.json)* | In-memory sliding window rate limiter | **SAFE** | Pure algorithm tests. |
| `tests/image-compression.test.ts` | *(none in package.json)* | Local `sharp` compression assertions | **SAFE** | Local image buffer tests. |

---

## 5. TypeScript & Linting Baseline

### 5.1 TypeScript Compilation Baseline
- **Command**: `./node_modules/.bin/tsc --noEmit --incremental false`
- **Exit Code**: `2`
- **Result**: Exactly 12 pre-existing errors across 5 test files (zero errors in application source files `app/`, `components/`, or `lib/`):
  1. `tests/email-transactional.test.ts:116:15` — TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.
  2. `tests/founder-filter-and-real-edit.test.ts:102:23` — TS18048: 'vtExcluded' is possibly 'undefined'.
  3. `tests/founder-filter-and-real-edit.test.ts:103:21` — TS18048: 'vtExcluded' is possibly 'undefined'.
  4. `tests/founder-filter-and-real-edit.test.ts:104:24` — TS18048: 'vtExcluded' is possibly 'undefined'.
  5. `tests/founder-filter-and-real-edit.test.ts:114:13` — TS18048: 'vtExcluded' is possibly 'undefined'.
  6. `tests/founder-filter-and-real-edit.test.ts:126:31` — TS18048: 'vtIncluded' is possibly 'undefined'.
  7. `tests/founder-filter-and-real-edit.test.ts:223:22` — TS18048: 'vtStep3' is possibly 'undefined'.
  8. `tests/founder-filter-and-real-edit.test.ts:224:21` — TS18048: 'vtStep3' is possibly 'undefined'.
  9. `tests/render-auto-select.test.tsx:118:10` — TS2345: Argument of type 'boolean \| undefined' is not assignable to parameter of type 'boolean'.
  10. `tests/root-auto-select.test.tsx:296:7` — TS2345: Argument of type 'boolean \| undefined' is not assignable to parameter of type 'boolean'.
  11. `tests/security-review-remediation.test.ts:54:15` — TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.
  12. `tests/security-review-remediation.test.ts:336:9` — TS2739: Type missing properties `createdAt`, `updatedAt` from type `DiscountCode`.

- **Verification of New Overhaul Contracts**:
  Following creation of:
  - `lib/contracts/admin-overhaul.ts`
  - `lib/contracts/golden-fixtures.ts`
  - `lib/testing/safe-harness.ts`
  The TypeScript compilation was re-executed. Result: Exactly 12 errors in 5 files. **Zero new type errors introduced.**

### 5.2 Linting Status
- **Command**: `npm run lint` (`next lint`)
- **Status**: Deprecated and unconfigured.
- **Behavior**: Running `next lint` launches an interactive prompt asking how to configure ESLint (`Strict`, `Base`, `Cancel`) because there is no `.eslintrc` or ESLint configuration file in the project. The script does not run autonomously in CI/automated runs.

---

## 6. Environment & Provider Configuration Audit

*Audit restricted to variable names and configuration keys only; zero credentials printed.*

### 6.1 Local Environment Keys (`.env.local`)
- `ADMIN_SECRET_KEY`
- `HANDWRYTTEN_API_KEY` *(Present — necessitates strict test harness isolation)*
- `HANDWRYTTEN_BACKPLATE_IMAGE_ID`
- `HANDWRYTTEN_TEST_MODE`
- `META_CONVERSIONS_API_ACCESS_TOKEN`
- `META_PIXEL_ID`
- `META_TEST_EVENT_CODE`
- `NANO_BANANA_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID`
- `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL`
- `NEXT_PUBLIC_GOOGLE_ADS_ID`
- `NEXT_PUBLIC_GOOGLE_TAG_ID`
- `NEXT_PUBLIC_META_DOMAIN_VERIFICATION`
- `NEXT_PUBLIC_META_PIXEL_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### 6.2 Secret Manager Integration
- Configured in `lib/email/resend.ts` via `@google-cloud/secret-manager`.
- Secret identifier: `projects/<project-id>/secrets/resend-key/versions/latest`.
- Fallbacks gracefully to memory cache, `process.env.RESEND_API_KEY`, or safe simulation mode when key is absent.

---

## 7. Read-Only Reconciliation Procedure for the Historical Displayed Paid Order

### 7.1 Historical Finding & Context
- As established in the canonical project brief (`docs/CANONICAL_PROJECT_BRIEF.md`, October 11, 2026):
  > *"There have been zero independent customer conversions as of the canonical baseline. The one paid order was the founder's test. Apple Pay is untested."*
- Inspection of the production `/admin` dashboard on October 18, 2026 displayed:
  > *"1 paid order / 255 visits ($9.00 total revenue, 0.4% conversion rate)"*
- Root cause analysis in `lib/metrics-rollup.ts`:
  In `getAdminDashboardMetrics`, founder exclusion filters orders using:
  ```ts
  if (excludeFounder) {
    if (isExcludedOrderCohort(o)) return false;
    if (o.sessionId && founderSessionIds.has(o.sessionId)) return false;
    if (o.customerEmail && (o.customerEmail.toLowerCase().includes("founder") || o.customerEmail.toLowerCase().includes("zeke"))) {
      return false;
    }
  }
  ```
  If the founder executed a live test order using an alternate personal email address that did not contain the substring "founder" or "zeke", and was not pre-registered in `founderSessionIds`, the order was included in customer metrics.

### 7.2 Read-Only Reconciliation Procedure
To reconcile this historical record without mutating production data or deleting evidence:
1. **Query Firestore Order Record**: Retrieve the order document displayed in the October 18 report via authenticated read-only script or Firebase console.
2. **Inspect Stripe Payment**: Match the order's `stripePaymentId` against the Stripe Dashboard (read-only):
   - Confirm customer name, billing address, and cardholder identity.
   - Confirm whether the card belongs to the founder or an internal test instrument.
3. **Classify Provenance**:
   - If verified as the founder's test, assign classification:
     `role: "founder"`, `reason: "founder_test_reconciled"`, `explicitOverride: true`.
   - If evidence is inconclusive or pending founder confirmation, assign:
     `role: "unresolved"`, `reason: "pending_founder_verification"`, `explicitOverride: false`.
4. **Preserve Accounting & Exceptions**:
   - The transaction remains permanently in the financial facts ledger (`FinancialFactRecord`).
   - In customer-facing conversion metrics (`ReportingMode = "customer_reporting"`), it is excluded from customer conversion counts.
   - In operational mode (`ReportingMode = "operational_all"`), it remains visible in the operational exceptions queue.
   - **Zero records shall be deleted.**

---

## 8. Summary of Shared Contracts & Safe Harness Deliverables

1. **`lib/contracts/admin-overhaul.ts`**:
   - Freezes reporting defaults: `REPORTING_POLICY_VERSION = "2026-10-18.v1"`, 30-min session inactivity, 5-min active journey, 24-hr conversion horizon, 7-day last-observable-non-direct attribution, `America/Chicago` timezone, max 1 offer per order, no auto-usage restoration on refund, 30-min price quote validity.
   - Defines Contract 1 (Event v2 envelope, authority rules, ingestion response, dedupe keys).
   - Defines Contract 2 (Payment/capture/refund/dispute ledger, webhook inbox, outbox, exceptions, correlation IDs).
   - Defines Contract 3 (Metric envelope, status, coverage, global report scope, unified acquisition channel classifier with strict unverified `fbclid` handling).
   - Defines Contract 4 (Offer versioning, price quote snapshots, reservation & redemption records).
   - Defines Contract 5 (Evidence drilldown queries, pagination cursors, operational exception queue items).

2. **`lib/contracts/golden-fixtures.ts`**:
   - Establishes stable deterministic test fixtures for all 9 required edge cases:
     1. `scen_founder_mobile_ad`: Founder mobile ad visit excluded from customer reporting.
     2. `scen_ultrawide_customer`: Ultrawide 3440x1440 customer included in reporting.
     3. `scen_browser_paid_alias_forgery`: Browser paid alias without server payment fact produces $0.
     4. `scen_paid_fulfillment_failed`: Captured payment with failed fulfillment counts as revenue and flags exception.
     5. `scen_paid_address_deferred`: Captured payment awaiting recipient address counts as paid and branches to deferred address.
     6. `scen_skipped_funnel_stages`: Draft resume to checkout counts observed milestones only.
     7. `scen_unknown_cost_and_zero_spend`: Unconfirmed supplier invoice and missing ad spend reports unavailable economics, never false defaults.
     8. `scen_historical_unresolved_order`: October 18 displayed paid order remains unresolved until reconciled.
     9. `scen_concurrent_last_slot_offer`: Concurrent reservations on 1-slot offer allow at most 1 reservation and 1 redemption.

3. **`lib/testing/safe-harness.ts`**:
   - Intercepts `globalThis.fetch` to block external network requests to Handwrytten, Stripe, Resend, and Meta Graph APIs.
   - Sets safe environment variables (`HANDWRYTTEN_SANDBOX_MODE="true"`, `STRIPE_PAYMENT_MODE="test"`, `DISABLE_LIVE_EXTERNAL_EFFECTS="true"`).
   - Throws `ExternalEffectDeniedError` and tracks blocked attempts.
   - Provides `withSafeTestHarness` for deterministic test isolation.
