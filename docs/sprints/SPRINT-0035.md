# Sprint 0035 — Solo-Founder Follow-up Inbox, Measurement Funnel Consolidation, & Checkout Opt-in Polish

**November 20, 2026.** Replaces the cluttered dual post-purchase UI on the Orders tab with a dedicated, deduplicated **Follow-ups** tab built for personal founder outreach, folds the decision-useful funnel waterfall from the deprecated **Experiment** tab into **Measurement**, protects sympathy orders by default across both manual and automated flows, and polishes the checkout marketing opt-in checkbox.

## Pyramid Index

- **L0.** Give the solo founder a 2-click, deduplicated Follow-ups tab (paid orders + grouped incomplete checkouts + feedback/accounts) with sympathy protection and flexible discount codes, fold the conversion funnel into Measurement, and polish the checkout opt-in.
- **L1.**
  - Clean 5-tab admin navigation: `Orders` · `Follow-ups` · `Measurement` · `Discounts` · `Troubleshooting`.
  - Deduplicated `/api/admin/followup-inbox` backend: 1 row per real paid order, 1 row per unique incomplete-checkout email (excluding anyone who later paid), sympathy auto-skip via occasion + artwork URLs, 1-click skip/unskip, existing + 1-use discount minting, and safe 1-click send.
  - Sympathy exclusion wired into both manual follow-ups and automated `getPostPurchaseEligibility` (`sensitive_occasion`).
  - Decision-useful funnel views (`6-Step Conversion Waterfall` + `Origin & Attribution Funnel Matrix`) rolled into `Measurement` without duplicating revenue KPIs.
  - Checkout opt-in checkbox revealed only after email entry, with tighter copy and typo-reset bug fixed.
- **L2.** [Architecture](#architecture) · [Workstreams](#workstreams) · [Acceptance Criteria](#acceptance-criteria) · [Risks & Mitigations](#risks--mitigations).

## Architecture

### 1. Follow-up Policy & Guardrails (Nov 20 Founder Decision)
- **Early-order manual 1:1 outreach:** The founder may send a personal follow-up (including an optional thank-you discount code) to early buyers or incomplete checkouts who provided their email address, without requiring the checkout opt-in checkbox.
- **Hard suppression remains mandatory:** Any address marked `unsubscribed`, `bounced`, or `complained` in `email_preferences` is strictly blocked. Every sent email includes signed one-click unsubscribe headers (`List-Unsubscribe`, `List-Unsubscribe-Post`) and a visible unsubscribe link.
- **CAN-SPAM postal address:** Included automatically in the email footer whenever `POST_PURCHASE_BUSINESS_POSTAL_ADDRESS` is set. Plain personal 1:1 check-ins are not blocked by its absence, while the composer surfaces a calm reminder whenever a discount code is attached without a configured business/PO box address.
- **Sympathy protection:** Shared detector `isSensitiveOccasionOrder` checks `occasion`, `recipientOccasion.occasionType`, `recipientOccasion.occasionTitle`, and `frontImageUrl` (`/presets/sympathy-*`, `/presets/pet-sympathy-*`). Sympathy orders are auto-skipped in the Follow-ups inbox and excluded (`sensitive_occasion`) from automated enrollment in `lib/post-purchase/enrollment.ts`.
- **Dormant automation bridge:** Existing `lib/post-purchase/*` drip engine, cron, and settings remain intact and paused (`POST_PURCHASE_DELIVERY_ACTIVE=false`, `POST_PURCHASE_AUTO_ENROLL_ACTIVE=false`), tucked behind an expandable `Automation (Off)` drawer in the Follow-ups tab.

### 2. Measurement Funnel Consolidation (Evaluating the "Experiment" Tab)
- **Worth keeping for decision making:**
  - `6-Step Conversion Waterfall` (identifies the exact step with the largest visitor drop-off).
  - `Origin & Attribution Funnel Matrix` (shows which sources/campaigns move visitors deeper into the card builder, not just final sales).
  - Window/channel/Owner-QA controls and device/bot breakdown.
- **Redundant to hide in consolidated view:**
  - The 5-card KPI strip (`tier-1-kpi-strip`) duplicates `AdminMeasurementPanel` and `Orders`.
- **UX shape:** Remove top-level `Experiment` tab; add a 2-pill sub-view switcher inside `Measurement`: **Verified Revenue & Orders** (default) and **Conversion Funnel & Drop-off** (`AdminWaterfallConsole` with `compactFunnelOnly={true}`). Legacy `?tab=telemetry` links open Measurement's funnel sub-view; `?tab=contacts` opens the new `Follow-ups` tab.

### 3. Checkout Opt-in Polish (`Step4ReviewAndPayment.tsx`)
- Hide the disabled opt-in checkbox while the email field is blank so it adds zero clutter above Stripe payment.
- Reveal a single concise line once the customer types an email: `"Email me occasional offers & check-ins (unsubscribe anytime)."`
- Fix the bug where editing a typo in the email field unchecks `followupOptIn` (only reset to `false` when the field becomes empty).

## Workstreams

| Worker | Owned Files | Deliverable |
| --- | --- | --- |
| `backend-followup` | `lib/post-purchase/sympathy.ts`, `lib/post-purchase/contracts.ts`, `lib/post-purchase/enrollment.ts`, `lib/post-purchase/manual.ts`, `lib/post-purchase/followup-inbox.ts`, `app/api/admin/followup-inbox/route.ts`, `components/admin/OrderFollowupPanel.tsx`, `docs/CANONICAL_PROJECT_BRIEF.md` | Harden deduplicated inbox API, sympathy exclusion, skip/unskip, 1-use discount minting, safe 1-click send, and canonical brief policy update. |
| `admin-ui` | `components/admin/FollowupsWorkspace.tsx`, `components/admin/AdminWaterfallConsole.tsx`, `app/admin/page.tsx` | Wire new `Follow-ups` tab, remove top-of-Orders clutter and `Experiment`/`Other contacts` top-level tabs, fold compact funnel view into `Measurement`, polish `FollowupsWorkspace`. |
| `checkout-polish` | `components/v3/Step4ReviewAndPayment.tsx` | Clean conditional opt-in checkbox, tighter copy, fix typo-reset bug. |
| `verifier` | `tests/followup-inbox.test.ts` (new) + read-only review & verification of all changes | Write comprehensive unit/integration tests for inbox, sympathy, deduplication, discount minting, and send safety; run full relevant test suite + `tsc --noEmit`; report bugs to owning authors until green. |

## Acceptance Criteria

1. Admin top nav has 5 clean tabs (`Orders`, `Follow-ups`, `Measurement`, `Discounts`, `Troubleshooting`), with legacy `?tab=contacts` and `?tab=telemetry` query params handled gracefully.
2. `Orders` tab no longer renders the noisy `Optional post-purchase follow-ups` queue/settings box at the top.
3. `Follow-ups` tab renders 3 sub-views: **Paid orders** (1 row per paid order, founder/test hidden by default), **Incomplete checkouts** (1 row per unique email excluding anyone with a paid order, showing grouped attempt counts), and **Feedback & accounts**.
4. Sympathy cards (via occasion metadata OR `/presets/sympathy-*` artwork URLs) are auto-skipped into a collapsed section in `Follow-ups` and rejected with `sensitive_occasion` in `getPostPurchaseEligibility`.
5. Composer supports editable starter templates, picking an existing active discount code, minting a new 1-use discount code, previewing, 1-click skip/restore, and safe 1-click send (respecting `MANUAL_FOLLOWUP_DELIVERY_ACTIVE`, hard-blocking suppressed emails, preventing double-sends via atomic transaction).
6. `Measurement` tab includes a clean sub-view switcher for **Verified Revenue & Orders** vs **Conversion Funnel & Drop-off** (without redundant revenue KPI cards).
7. Checkout opt-in checkbox appears only after an email is typed, uses tightened single-line copy, and preserves checked state while fixing typos in the email input.
8. All existing post-purchase, manual-followup, waterfall, checkout-contact tests plus new `tests/followup-inbox.test.ts` and `npx tsc --noEmit` pass.

## Risks & Mitigations

- **Accidental live send during development/testing:** `MANUAL_FOLLOWUP_DELIVERY_ACTIVE` stays `"false"` in `apphosting.yaml` and `apphosting.staging.yaml` until the founder explicitly approves enabling live sending. Tests run strictly inside `withSafeTestHarness` with fake transports.
- **Breaking existing sprint tests:** Keep existing `ManualFollowupPanel`, `OrderFollowupPanel`, `CapturedContactsPanel`, `AdminWaterfallConsole` default props, and `OrderJourneyDrawer` contracts intact so existing tests stay green.
- **Duplicate sends on double-click:** Atomic Firestore transaction in `sendQuickFollowup` + deterministic `idempotencyKey` prevents duplicate dispatch.
