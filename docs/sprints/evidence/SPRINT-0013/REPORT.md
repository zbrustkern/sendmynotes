# SPRINT-0013: international staging candidate

Prepared October 26, 2026 for the founder's Saturday, October 31 event. Scope: implement and verify a staging preview; production activation and real payments/physical mail are separate release steps.

## Implemented

The primary `/new` flow and `/send` recipient component expose a small “International? +$5” action when the server permits staging preview. A country-aware modal replaces the domestic recipient editor after Save. Cancel preserves the address; US and international drafts are retained separately. International selection changes transaction totals and country/delivery text; general $9 acquisition copy remains intact.

The working international price is $14 USD. Eligible discounts reduce the $9 base only: a $2 discount gives $12; a full base discount leaves $5 payable. The existing offer engine remains authoritative, while a versioned order snapshot binds the country, supplier mapping, base, discount, surcharge and total. Payment confirmation and webhook processing check the captured amount and order association. Promotion redemption is idempotent and separates the base payable from the full captured amount.

Staging allows preview independently of payment configuration. International test checkout requires Stripe test mode; local fake adapters require explicit nonproduction configuration. International preview orders are durably marked and held before supplier dispatch. Staging live-payment, email, advertising and physical-dispatch guards remain in place. Country changes cannot be smuggled through free-order completion, deferred addresses or admin retries.

## Supplier facts and boundaries

Authenticated read-only Handwrytten `/v2/countries/list` returned 225 records on October 26. The normalized catalog maps 212 country records and exposes 200 international destinations after excluding current postal suspensions. Ambiguous mappings, duplicates and a Presort non-country record are excluded. Country mapping is a dated snapshot, not a guarantee of delivery availability.

Catalog `delivery_cost` is $0.82 US, $1.10 Canada and $1.85 for the remaining international records. This supports a single international customer upgrade rather than country pricing tiers, but does not establish the full charge or margin for our API-created A2 card.

The [supplier API contract](https://www.handwrytten.com/api-redoc/) supports country ID/name fields and requires a state/region for US and Canada. It marks postal code required generally. No dummy postal code is inserted: treatment of countries without postal codes needs supplier clarification before live activation. Suspensions use the [USPS international service-alert table](https://about.usps.com/newsroom/service-alerts/international/) dated October 23. Recheck the catalog and suspensions before launch.

US personal return addresses remain required. No real supplier order was submitted, and no delivery-time guarantee was added.

## Review and evidence

Luna agents implemented server and UI work and independently reviewed the candidate. Review caught and repaired: double-added upgrade in the edit modal, a stale international total after switching to US, loss of the separate international draft, address edits during pending checkout, base/total mismatch in promotion redemption, missing durable preview markers, missing webhook-only promotion redemption, and deferred-address mutation gaps.

Evidence lives in `.delivery/runs/20261026-international-staging/`: backend/UI/release-review reports, isolated test runners, supplier catalog and staging before/after metadata. Tests use isolated mock stores and deny external network effects; their success does not prove Stripe or physical fulfillment behavior. Existing stale webhook/payment fixtures were corrected to carry verified payment status/amount and authoritative offer bindings.

## Local verification

- Optimized Next.js production build, type checking and `git diff --check`: passed on the final application source.
- Isolated international pricing and checkout integration: passed, including discounted webhook-only redemption and replay.
- Static address UI, draft persistence, feature flags and delivery estimate suites: passed.
- Transactional email suite: passed with fake Resend after correcting stale verified-payment fixtures.
- Independent payment, offer, concurrency and mounted-browser regression results are recorded in the release audit.

## Release and remaining gates

Local and hosted verification results and exact deployed source will be recorded after the final gates. Production remains at `0623a0a89b6d948b272f25ad8c9bfb4f4554962f`. Staging rollback baseline is `f97f98f62d0fee461c236c597e33e9f54a7275d3`, build `build-2026-10-21-001`.

Before live activation: confirm complete custom A2 supplier charges and the $14 commercial decision, resolve no-postal-code requirements, refresh destination suspensions, verify a separate Stripe test-key environment, and perform the explicitly chosen founder live-payment/physical-mail scenarios. Apple Pay remains unverified. The event checklist distinguishes test payments, real charges, supplier acceptance and eventual delivery.

A production candidate must apply this scoped change to the verified production base; do not merge all staging history. The international feature currently has no production activation path. Staging international confirmation/order pages also need a dedicated preview-hold message before enabling hosted test payments; ordinary fulfillment copy is not evidence of a supplier submission.
