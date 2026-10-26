# Admin complimentary cards — staging release record

SPRINT-0017 and SPRINT-0018 implement the approved full-comp and item-adjustment flow. Release scope is staging only. This pre-deployment record is supplemented by the final hosting evidence and coordinator report after rollout.

## Implemented
- Authenticated admin-only composer with new card, country-aware recipient, personal US sender, required reason, full/item adjustment and explicit review.
- Server-priced integer-cent catalog, immutable accepted quote, audited actor/reason/time, stable idempotency and future eligible-line extension without adding fictional products.
- Full comp covers $9 domestic or $14 international. Partial example: waive the $9 card and leave $5 international balance. Existing public $9 copy and international price selection remain unchanged.
- Positive balances have fixed, expiring payment capabilities; exact amount/currency/order/quote/request verification governs processing. Full comp bypasses customer payment only. Supplier costs are not waived or asserted known.
- Admin origin remains distinct from public promotions and independent conversions. Positive live captures classify as `admin_comp_balance`; zero comps remain `studio_comp`.
- Staging accepts held previews with no Stripe intent, payable capability, email or supplier request. Both positive and zero historical holds survive later configuration changes. No automatic release of held orders.
- Private payment pages omit marketing/attribution and set no-referrer/noindex/no-store. Public receipts retain non-sensitive admin origin while removing private quote/request metadata.

## Validation
Independent Luna backend, UI and audit lanes completed. Final focused evidence is in `checks/`: admin-comp-adversarial, admin-comp-ui, international-pricing, international-checkout.integration, google-purchase-measurement, transaction-security (10/10), staging-review-safety and admin-google-only-auth. Tests use isolated disk mocks, stripped credentials and external-network denial. TypeScript and production Next build are release gates. A stale transaction-security baseline assertion was corrected to expect no state mutation on a missing untrusted payment identifier.

Mounted actual modal with mocked APIs was checked using fictional data: UK full $14 → $0, individual $9 waiver → $5, complete address review, held result preserving $5, 390px mobile layout without horizontal overflow, keyboard focus wrap and authorization-failure disabled action. Screenshots are local fixture evidence, not hosted-authenticated or provider evidence.

## Release and rollback
Base staging `0a4d08205b8077303fe88fd578ecd0397f94b3ab`, prior ready build `build-2026-10-26-003`; this is the rollback target. Production remains `0ebfd958c6854623abab177ebeab2754c242f20c`, build `build-2026-10-26-001`.

Staging: https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app/admin

Before push, verify remote staging/main are unchanged, auto-rollout targets staging, and hosting flags/payment config match the baseline. Push only the reviewed candidate to staging; do not create a duplicate rollout. Confirm exact source SHA, READY build, SUCCEEDED rollout and 100% serving traffic. Preserve production source/config and staging review/test flags. No config/secret changes are required.

## Remaining gates
Hosted authenticated composer testing requires the founder's Google session; the browser currently presents the normal sign-in screen. Local mounted checks do not substitute for that test. Provider-backed payment, Apple Pay, real zero-comp dispatch, supplier charges/address output and physical delivery remain unverified. Positive live admin payment defaults off behind `ALLOW_ADMIN_COMP_LIVE_PAYMENT`; production activation is a separate reviewed release. Do not turn off staging holds to test production behavior.

See `REVIEW-CHECKLIST.md` for founder testing and `docs/sprints/drafts/ADMIN-COMP-AUDIT.md` for independent review. No real payment, supplier request, email or production deployment was performed in this run.
