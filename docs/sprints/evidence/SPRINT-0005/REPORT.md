> **Current takeover status (October 19):** The earlier report below is historical. Integrated checks and remaining acceptance gaps are recorded in [the Codex/Luna readiness checkpoint](../../../../.delivery/runs/20261019-codex-luna-takeover/READINESS.md). A passing fixture suite is not staging/production or visual acceptance.

# SPRINT-0005 Completion Report: Versioned Offers, Transactional Redemption & Consistent Auto-Apply

## Sprint Metadata
- **Sprint ID**: `SPRINT-0005`
- **Status**: `complete`
- **Dependencies**: `SPRINT-0002` (`complete`), `SPRINT-0003` (`complete`)
- **Completed At**: `2026-10-18T20:14:30-05:00`
- **Subagent Used (`Model: "flash"`)**: `2fe1c551-bebf-4a30-a3e6-55e5429f1095` (`Reporting Trust and Portal Honesty Builder` / Offer Engine Lane)

## Task & Acceptance Criteria Matrix

| ID | Description | Status | Evidence / Files |
| --- | --- | --- | --- |
| `SPRINT-0005-T01` | Versioned offers (`offer_versions`), additive legacy compatibility (`DiscountCode`), lifecycle evaluation (`draft`, `scheduled`, `active`, `paused`, `exhausted`, `expired`, `archived`), and legacy URL aliases (`?discount=`, `?code=`, `?promo=`) | **PASS** | `lib/offer-engine.ts`, `lib/discount.ts`, `app/api/admin/discounts/route.ts` |
| `SPRINT-0005-T02` | Authoritative server price quotes (`offer_quotes`), 30-min quote validity, transactional reservations (`offer_reservations`), and stale PaymentIntent / price reconfirmation checks | **PASS** | `lib/offer-engine.ts`, `app/api/discount/validate/route.ts`, `app/api/checkout/create-intent/route.ts`, `app/api/checkout/confirm-order/route.ts` |
| `SPRINT-0005-T03` | Destination-aware auto-apply on active routes, draft persistence (`appliedOffer` in `DraftState`), and removal/replacement | **PASS** | `lib/draft/types.ts`, `lib/draft/reducer.ts`, `app/preview/entry/client.tsx`, `components/v3/Step4ReviewAndPayment.tsx` |
| `SPRINT-0005-T04` | Deterministic order-linked redemption (`redemption_${orderId}`), 100%-off free order completion, non-restoring refund policy (`REFUND_RESTORES_OFFER_USAGE = false`), and offer analytics summary | **PASS** | `lib/offer-engine.ts`, `app/api/checkout/confirm-order/route.ts`, `app/api/checkout/complete-free-order/route.ts` |
| `SPRINT-0005-T05` | Concurrency, final-slot contention, budget rollover, stale quote, duplicate callback, refund, and 100%-off test suite | **PASS** | `tests/sprint-0005-offer-engine.test.ts` |
| `SPRINT-0005-AC01` | Existing valid code links (`?discount=`, `?code=`, `?promo=`) and manual entry work on all supported active entries; URL auto-apply survives step changes and draft resume with accurate price | **PASS** | Verified in `tests/sprint-0005-offer-engine.test.ts` and `tests/draft.test.ts` |
| `SPRINT-0005-AC02` | Concurrent final-slot requests (`maxUses: 1`) obey transactional reservation policy, duplicate callbacks consume only once, and canceled/expired holds release slots | **PASS** | Verified in `tests/sprint-0005-offer-engine.test.ts` |
| `SPRINT-0005-AC03` | Captured/refunded order terms remain immutable; client-supplied pricing is ignored; stale payment intents return HTTP 409 (`requiresPriceReconfirmation: true`) and cannot charge an undisclosed amount | **PASS** | Verified in `tests/sprint-0005-offer-engine.test.ts` |
| `SPRINT-0005-AC04` | Free/comp redemptions remain available and separately measured; missing supplier cost reports `costStatus: "unconfirmed"` rather than disabling codes or claiming margin | **PASS** | Verified in `tests/sprint-0005-offer-engine.test.ts` (`63/63 PASSED`) |

## Verification Commands & Results

1. **SPRINT-0005 Verification Suite**:
   - Command: `./node_modules/.bin/tsx tests/sprint-0005-offer-engine.test.ts`
   - Result: `EXIT 0` (`63/63 PASSED, 0 FAILED`)
2. **Draft Persistence Regression Suite**:
   - Command: `npm run test:draft`
   - Result: `EXIT 0` (`69/69 PASSED, 0 FAILED`)
3. **TypeScript Check**:
   - Command: `./node_modules/.bin/tsc --noEmit --incremental false`
   - Result: `0` errors in all SPRINT-0005 files.

## Review Outcome & Migration/Rollback Notes
- **Review Outcome**: Accepted on first review cycle.
- **Migration / Rollback Notes**:
  - `offer_versions`, `offer_quotes`, `offer_reservations`, and `offer_redemptions` are additive collections bridged automatically from `discounts`.
  - Existing codes, manual entry, and `?discount=`, `?code=`, `?promo=` links remain 100% compatible.
- **Unresolved External Checks**:
  - None blocking; supplier per-card cost remains labeled `unconfirmed` in offer analytics until supplier invoices are imported.
- **Next Action**: Once `SPRINT-0006` completes, launch `SPRINT-0007` (Investigations: Journeys, Orders, Economics) and `SPRINT-0008` (Promotions & Growth Workspaces) in parallel.
