# SPRINT-0013: Add a quiet international mailing option

Status: active — implementation and staging authorized October 26, 2026. Original plan October 23, 2026.

The founder authorized Luna implementation, payment-safety enhancements and staging preparation on October 26 for an event in about a week. This supersedes the original planning-only boundary. Staging deployment and a guarded international preview are authorized; production rollout, live charges, email sends and physical orders are reserved for a later explicit testing/release step. Original planning questions below are resolved only where documented in the execution addendum.

## Pyramid Index

- L0: Add an optional international recipient editor and server-priced mailing upgrade while preserving the existing $9 domestic experience and general marketing copy.
- L1:
  - Product: one “International?” link, country-aware modal/sheet, explicit total before payment; US personal return address remains.
  - Correctness: destination survives drafts, payment, order storage, fulfillment, receipts and operational retries.
  - Commercial: $14 is a proposal, actual custom-card cost remains unconfirmed; broader international targeting and copy changes are deferred.
  - Proof: feature defaults off; isolated regression and independent review precede a separate activation decision.
- L2: [Decisions](#decisions-and-boundaries), [UX](#use-cases-and-ui-contract), [Architecture](#architecture), [Tasks](#implementation-plan), [Acceptance](#definition-of-done), [inventory](SPRINT-0013-COPY-IMPACT.md), [validator brief](#independent-validator-handoff).

## Overview

Help personal senders reach friends and family abroad with minimal impact on the existing sending journey. The founder proposed an “International?” affordance beside “To,” opening a modal that replaces domestic recipient entry with an international form and clearly shows the revised total. The working proposal is $14 USD total ($9 base plus $5 international upgrade); $15 remains an alternative pending cost confirmation.

The founder explicitly directed on October 23: **keep the existing $9 mailing copy until targeting international customers.** Do not perform a global replacement with “$9 including US mailing,” change ad creative, or reframe acquisition pages in this sprint. Once a sender selects international mailing, transaction-specific prices and delivery statements must accurately reflect that order. Shared components must preserve current domestic output while rendering the selected international state correctly, including when navigating backward.

International support is a product hypothesis, not evidence of demand or conversion uplift. The canonical October 11 baseline remains zero independent conversions; the paid order was the founder's test. Apple Pay remains unverified end to end.

## Decisions and boundaries

| Item | Status / instruction |
| --- | --- |
| Existing $9 offer and general mailing copy | Founder decision: preserve. Inventory future changes without making them. |
| Small international entry point and explicit price | Founder direction: incorporate. Proposed link text: “International? +$5”; modal shows “$14 total, including international mailing.” |
| $14 vs $15 | Proposed default: $14; not a finalized price or confirmed margin. One server configuration sets the enabled price. |
| Sender | Proposed v1 boundary: personal US return address only, preserving existing identity requirement. |
| Recipient countries | Proposed v1 boundary: explicit supplier-verified allowlist. Canada, UK and Australia are candidate examples, not a verified launch list. |
| Address later | Proposed v1 boundary: domestic only. International requires complete recipient address before payment. |
| Discounts | Proposed policy for validator review: existing discounts apply to the $9 base; the international upgrade is not discounted. Do not silently change existing promotion promises; unresolved conflicts block activation. |
| Exposure | New server-controlled capability defaults off. No cookie/query/client-only override may authorize international payment. |
| Release | Deliver implementation readiness in the eventual sprint; production activation and international targeting are separate decisions. |

Non-goals: international senders, non-USD checkout, new stationery/artwork, translation, all-country coverage, new stamp selection, a carrier/rate-shopping platform, international deferred-address top-ups, a new experimentation framework, new marketing photos, acquisition campaign changes, unrelated admin overhaul, or broad legal-policy rewriting.

## Source context and orientation

Read [canonical brief](../CANONICAL_PROJECT_BRIEF.md), [canonical specs](../CANONICAL_PRODUCT_SPECS.md) and repository AGENTS.md first. Founder decisions govern strategy; source inspection establishes current code behavior; supplier documentation does not establish an account-specific charge.

Source inspected: local `staging` checkout at `ae7f77e` on October 23, with unrelated existing dirty files. This is not a fresh verification of production. Recheck production/staging revisions and actual routed experiences before implementation. Preserve all unrelated changes; do not merge staging wholesale into production.

Recent context:

- SPRINT-0012 preserved $9 mailing copy while removing unsupported product claims; do not undo it.
- SPRINT-0011 fixed payment-provider binding and atomic price changes. Destination changes must obey the same protections as promo changes.
- SPRINT-0010 and the earlier admin program have outstanding acceptance gates. This feature must not depend on wholesale promotion of that work.
- No semantic index is configured; targeted source retrieval was used. See [configuration](../SEMANTIC-INDEX.md). No chapter link selected; no chapter ledger was found.

Verified source findings:

- `lib/types.ts` and draft address types have optional country, but v3 `AddressData` lacks it. The active entry and target builders hard-code `country: "USA"` in several draft/request paths.
- `lib/handwrytten.ts` sends city/state/ZIP but no recipient country in `orders/singleStepOrder`.
- Checkout creation requires state and ZIP generically; the deferred-address API validates US states and writes `country: "USA"`.
- Stripe intent creation, offer quotes, confirmation/free-order handling and no-code amount validation have $9 assumptions.
- Email receipts, confirmation/order UI and wallet labels contain literal $9 amounts. Destination and actual paid amount must be consistent beyond the payment button.
- The copy inventory finds **147 matching lines across 41 files**, including logic/comments/examples. It is not a count of live placements or required edits.

Supplier documentation reviewed October 23:

- [FAQ](https://www.handwrytten.com/about/the-company/): international mailing offered; published stamp figure $1.70, plus discussion of an international convenience fee.
- [Pricing](https://www.handwrytten.com/pricing/): published 10¢ international manual-processing surcharge. Not confirmation of our custom SKU/account total.
- [API contract](https://www.handwrytten.com/api-redoc/): `recipient_country_id`/`recipient_country`, US defaults, state required for US/Canada; postal field is marked required. Treat no-postal-code destinations as unresolved, never invent a placeholder.
- [Country list](https://www.handwrytten.com/api/list-countries/): supported countries, states/provinces and delivery costs. No authenticated country/rate response was obtained for this plan; examples in docs are not live rates.

## Use cases and UI contract

1. **Domestic sender:** unchanged default address entry, $9 base offer and existing discount behavior. No new mandatory country field or step. Capability-off state hides the international affordance.
2. **Choose international:** link beside “To” opens a desktop modal or mobile full-screen sheet. Show the complete USD total and upgrade before committing. Country comes first, followed by name, address lines, city/locality, and country-appropriate region/postal fields. Show only enabled destinations.
3. **Save:** validate, then replace the domestic fields with an international address summary, visible country, “Edit” and “Use a US address instead.” Update all order totals and selected-order labels together. Preserve note, artwork, sender and domestic address draft.
4. **Cancel / close / Escape:** discard uncommitted edits and preserve the last committed address, delivery mode and price. Return keyboard focus to the opener; trap modal focus and label errors. At 320px, keyboard-visible form fields and actions must remain reachable.
5. **Switch country or revert:** preserve compatible fields; revalidate country-dependent fields, clear invalid region selections, and avoid converting foreign data into a US address. Reverting restores the separate domestic draft and domestic price. Never lose a saved international draft merely by canceling an edit.
6. **Resume / saved contact:** country survives refresh, legacy-draft migration, account address selection and review. Known unsupported foreign destinations fail with a useful message instead of silently becoming US. International drafts restored with capability off remain editable, but cannot create a new international checkout.
7. **Address later:** international mode explains that the full address is needed to confirm mailing. Reject international plus deferred-address combinations server-side. Domestic deferred purchases remain US-only at completion; never infer eligibility for international service from an already paid $9 order.
8. **Delivery:** international-specific copy says delivery varies by destination; no invented date range, tracking guarantee or domestic 2–7-day estimate. Preserve returned tracking links only when actually available. Preparation and transit remain distinct.

The conversational sketch illustrates the interaction, not production-ready validation. Its sample countries/address and price are illustrative. Reconstruct using existing product components; do not introduce its sample data into real forms.

## Architecture

### Country and address contract

Use a canonical country code internally and one explicit mapping to supplier IDs. Normalize recognized legacy US aliases (`US`, `USA`, `United States`) at the boundary. Missing country on an established legacy domestic record may map to US; an explicit unknown/foreign country must never default to US. For new international submissions, require an explicit enabled country.

Preserve address text/diacritics subject to confirmed supplier support. Do not uppercase arbitrary international regions or force a US state list/5-digit ZIP. Country requirements should be a small verified configuration for the launch allowlist, used on both client and server. Store country through drafts, saved contacts, orders, previews, fulfillment and authorized corrections. Snapshot the supplier-country mapping used for an accepted order, or otherwise ensure mapping changes cannot silently reroute it.

### Authoritative price and payment binding

Introduce one shared server quote calculation; do not change the global domestic 900-cent constant to 1400. Example proposed calculation: `payable = max(0, 900 - eligibleBaseDiscount) + internationalUpgrade`. A $2 base discount yields $12 international; 100% off the base yields $5 international. These are policy examples for validation, not new published promotion terms.

Persist base, upgrade, discount, final amount, currency, destination/delivery class, price-policy version and quote identity on the order. Bind the quote to the intended order and recipient destination; client-supplied price/country IDs are not trusted. Resolve discount eligibility and destination jointly. Reject mismatched totals, stale country/quote combinations and unsupported destinations before creating payment or reserving an offer where practical.

Changing destination or promo after checkout initialization invalidates the old payment readiness. Only publish the new price/secret after a matching server response; ignore late responses. Preserve SPRINT-0011 provider remounting, wallet/keyboard guards and failed-update recovery. A failed repricing must not leave a payable stale intent behind the new visible total. Old/superseded intents must not dispatch a changed order; if one is captured asynchronously, reconcile it as its original immutable order or hold for investigation, never mutate its destination to match the newer UI.

Confirmation, webhooks and free completion validate stored order/quote, paid amount, currency and payment/order association. The proposal leaves a positive international surcharge even for a free-base offer, so it must use the paid path. Reject direct free-endpoint bypasses. Preserve historical US orders and genuine domestic zero totals without truthy fallbacks. Changes after accepted payment cannot silently reprice or change delivery class.

### Fulfillment and operational compatibility

Pass explicit supplier recipient and sender countries through the existing custom A2 flow. Keep idempotency/retry protections, personal sender identity and actual supplier-status semantics. Admin edits/retries must preserve country and enforce the paid delivery class; moving a paid US order abroad requires a future supported repricing flow, not an admin shortcut. A new country suspension can hold an order for review; it must not change its address or price.

Use the stored quote/actual payment for receipts and order-specific totals. Keep known costs distinct from quoted supplier delivery fields; do not manufacture a margin. Destination-specific display changes apply to shared header/action bar/back-navigation, review, wallet CTA, confirmation, order page, email and delivery estimate wherever the international order can appear. Keep unrelated domestic marketing copy unchanged.

### Capability and rollback

Default off, enforced server-side at new quote/checkout creation. Supplier unavailable or unknown destination means international unavailable; domestic checkout continues. Avoid a live supplier-rate dependency on every keystroke: use verified versioned country configuration with a defined freshness/review policy.

Turning off new international sales must not erase or strand already accepted orders. Keep readers, payment reconciliation, order rendering and fulfillment compatibility for stored international orders. Separate pause of new sales from fulfillment pause. Do not roll back to code incapable of reading outstanding international orders; use capability-off plus a compatible corrective release.

## Implementation plan

| Task | Work and likely files | Depends on | Evidence |
| --- | --- | --- | --- |
| T01 — Verify scope and supplier contract | Recheck deployed routes/branches; read-only country/rate lookup and existing invoice evidence; confirm custom dimension 4 charge, destination list, postal/region/script rules, return address and delivery guidance. Review unresolved price/promo/policy questions. | None | Dated facts vs unknowns, production/staging source map, candidate allowlist and pricing decision. No fulfillment call. |
| T02 — Define contracts and quote policy | Shared address/country and quote helpers; `lib/types.ts`, draft types/store/reducer, `lib/feature-flags.ts`, relevant saved-address adapters. Preserve legacy reads and country. | T01 interface findings | Contract fixtures, US migration and explicit-invalid-country cases, flag default/off enforcement. Supplier gaps can remain activation gates. |
| T03 — Build minimal UI | `components/v3/Step3EnvelopeAddressing.tsx`, `app/preview/entry/client.tsx`, `components/v3/TargetPurchaseExperience.tsx`, shared flow/action/review components. Include legacy `AddressStep`/`VendingMachineBuilder` only if enabled routes can reach them; otherwise explicitly gate unsupported entry paths. | T02 | Desktop/320/390px modal/sheet checks, cancel/save/revert/resume behavior, country-sensitive validation. |
| T04 — Bind payment and fulfillment | `app/api/checkout/{create-intent,confirm-order,complete-free-order}/route.ts`, `app/api/discount/validate/route.ts`, `lib/offer-engine.ts`, pricing/discount services, `lib/stripe.ts`, Stripe webhook, `lib/order-processor.ts`, `lib/handwrytten.ts`; audit all bypass/retry/comp/deferred endpoints. | T02; integrates T03 | Destination/quote/payment matrix, counterfeit amount/flag/country rejection, replay and retry proof with fake providers. |
| T05 — Complete order truth | Confirmation, order page, transactional email, delivery estimates, wallet labels, admin address retry/proof/order views; wire amount/country through actual callers. Keep general $9 copy. | T03, T04 | Synthetic international order is identical across review, receipt, payment, supplier request and admin retry. No receipt fallback to $9. |
| T06 — Validate and package | Safe focused tests, typecheck/build, browser accessibility/responsive checks, independent review, update inventory dispositions, activation checklist and compatible rollback procedure. | T03–T05 | AC matrix, exact revisions/results, unresolved gates and validator disposition. |

The previous 3–5-day estimate was a rough bounded implementation estimate, excluding supplier response and physical validation. This audit adds explicit payment, receipt and legacy-route work. Re-estimate after T01; do not treat 3–5 days as a delivery commitment. Narrow country/route exposure before cutting payment or receipt correctness.

One writer per checkout. Reviewer should inspect independently from the implementer. Do not assume the current dirty staging checkout is the release base.

## Files summary

Planned new helpers (names provisional): `lib/mailing-destinations.ts`, `lib/order-pricing.ts`, and a shared international-address editor if existing component extraction is warranted. Extend existing draft/order schemas additively, not via a destructive migration. Avoid duplicating discount computation inside a new helper; preserve the authoritative offer engine and reservation lifecycle.

Existing clusters are identified in T02–T05. Additional address consumers to trace include `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/contact-parser.ts`, `components/ContactImportModal.tsx`, `components/admin/AddressRetryModal.tsx`, `app/api/admin/{retry-fulfillment,dispatch-comp}/route.ts`, and `app/api/orders/[id]/complete-address/route.ts`. Verify their actual paths/callers and active deployment before editing. Every reachable order path must either support the destination contract or explicitly reject unsupported international creation.

Copy-only search results and future targeting work: [impact inventory](SPRINT-0013-COPY-IMPACT.md). This is a review map, not a 41-file mandatory rewrite.

## Definition of Done

- **AC01 — Preservation:** feature off leaves current domestic journey and general $9 marketing copy unchanged; US full-price checkout is 900 cents and existing domestic discounts/deferred flows still work. Server rejects new international checkout even with a forged client flag.
- **AC02 — UI:** feature on presents one optional affordance; explicit proposed total before save/pay; accessible responsive editor; cancel preserves committed state; save/revert/back/refresh do not lose note/art/sender or show stale domestic price for an international selection.
- **AC03 — Address:** enabled-country requirements work client/server; alpha postal codes and optional regions are supported where verified. Unknown, disabled and unsupported countries fail before charging. Country survives every supported persistence and selection boundary.
- **AC04 — Price:** fixed/percentage/100%/invalid/expired discounts and $14/$15 configuration examples produce the approved policy totals; upgrade is charged exactly once. Client tampering, stale responses, destination changes, quote expiry and price-config changes cannot authorize a mismatched total. Historical accepted order price is immutable.
- **AC05 — Payment:** all card/wallet/keyboard paths bind to the accepted current quote and payment instance; repricing failures disable payment; webhook/confirm/free paths reject amount/currency/order/destination mismatch. Duplicate events and retries do not double-submit fulfillment. Domestic zero totals remain zero.
- **AC06 — Fulfillment:** a mocked custom A2 order includes correct explicit country mapping and US personal return address; data is not silently coerced to US; administrative retry/correction cannot bypass destination pricing. No real supplier order is used to prove this.
- **AC07 — Complete experience:** summary, confirmation, order page, receipt, wallet CTA and operational views render the recorded amount/country. International orders receive no domestic transit estimate or unsupported tracking/date promise. General acquisition copy stays unchanged.
- **AC08 — Deferred and legacy:** international address deferral rejected server-side; paid domestic deferred orders cannot become foreign through the completion endpoint. Legacy missing-country domestic fixtures still read; explicit foreign records never silently default to US. Unexposed legacy creation paths reject international requests.
- **AC09 — Controls:** disable new sales without blocking reconciliation/reading of accepted orders; country suspension/fulfillment pause has an explicit operational outcome. Compatible rollback preserves orders, payments and destination data.
- **AC10 — Review/readiness:** audited safe regression tests, typecheck/build and browser evidence pass; independent validator has no unresolved execution/release blockers. Final report separately marks implemented, locally verified, supplier-confirmed, externally tested and enabled. Feature remains off until activation gates are resolved and release is authorized.

## Validation and evidence

Use synthetic addresses and fake payment/supplier/email adapters with network denial and isolated storage. Inspect test scripts before running; do not run fulfillment scripts, generate artwork, send emails or initiate live payments as an audit. Existing relevant suites include payment-checkout parent, payment-mode, transaction-security, draft, sender-validation, delivery-estimate and email tests; verify exact commands and side effects at execution time.

Add behavioral tests for meaningful new boundaries, not source-string mirrors. Include domestic legacy/missing-country, Canada required province, a verified optional-region destination, alphanumeric postal code, unknown country, mode/country conflict, resumed draft, saved contact, delayed/out-of-order quote responses, paid-to-free/free-to-paid domestic transitions, free-base international positive balance, webhook-before-client-confirm, duplicate webhook, captured superseded intent, destination-change attempt after payment, disabled feature and admin retry.

Browser evidence: 320px, 390px and desktop; keyboard focus/Escape/validation and touch/keyboard-visible sheet actions; back-navigation, refresh and failed quote; contrast/light-dark if supported. Do not label fake-wallet tests as real Apple Pay verification.

Event reporting should use existing privacy-safe telemetry only if needed: international option selected, destination eligibility result, accepted price and completed/failed checkout. No address, name, note or postal code in analytics. No causal conversion claim from small counts. Keep supplier costs unknown until confirmed.

Write `docs/sprints/evidence/SPRINT-0013/REPORT.md` during execution with task/AC results, exact revisions/checks, screenshots or fixtures, reviewer findings, open supplier gates and compatible rollback. No implementation report is fabricated during planning.

## Risks, dependencies and activation gates

| Risk / dependency | Required treatment |
| --- | --- |
| Published postage differs from actual account/custom SKU billing | Confirm total charges, postage/handling/tax treatment and any country differences before selecting final commercial price. No margin claim from catalog examples. |
| Address schemas/country support vary | Limit launch to verified destinations; establish supplier acceptance including diacritics and missing-postcode cases. No all-country promise. |
| Domestic-looking copy after international selection | Conditional selected-order rendering across headers/back-navigation/receipts is in scope even while broad marketing copy remains unchanged. |
| “Free card” promotions conflict with a non-discounted upgrade | Review current promotion eligibility/terms. Either clearly disclose the remaining upgrade for compatible offers or exclude incompatible offers from international use; do not silently reinterpret them. |
| Current terms contain a fixed $9 example and domestic service description | Inventory now. Before paid activation, review whether a narrow accurate international exception is needed; preserve rights and avoid broad policy changes. This is a launch question, not authorization to rewrite legal terms. |
| Multiple deployed experiences and unfinished admin work | Verify real routing; share core contract or explicitly reject unsupported paths. Release only scoped compatible changes from the verified release base. |
| Supplier outage/suspension or capability rollback | Fail closed for new international sales; maintain accepted order processing or explicit hold/reconciliation. Never silently switch service/address. |
| Real-world delivery quality unverified | Agree separate supplier/sandbox and, if needed, explicitly authorized physical validation. Record what remains untested; no billable order during this planning/automated verification. |

No production rollout is authorized here. A later release packet must verify staging first, capture production baseline and rollback source, resolve supplier/price/promotion/policy gates, then request or use explicit release authorization. International ad targeting triggers the broader copy review in the inventory; it is not implied by feature development.

## Open questions for validation

1. Is $14 the desired price after actual SKU cost confirmation, or $15? Is a single upgrade viable for every launch destination?
2. Is the proposed base-only discount policy compatible with current promotions, or should some international offers be explicitly excluded?
3. Which destinations can be verified first, and what supplier proof is sufficient for enabling each?
4. Are all live entry paths covered by the proposed shared editor/quote integration, with unsupported paths safely blocked?
5. What minimal policy clarification and physical/supplier validation are required before enabling paid international orders while preserving general $9 acquisition copy?

These are execution/activation decisions; they do not prevent delivery of this review draft.

## Independent validator handoff

Read this sprint, the companion impact inventory, canonical documents, SPRINT-0011/0012, and the cited implementation paths. Independently verify source findings and active-route assumptions. Review for missing country propagation, discount/free-path bypasses, stale payment binding, webhook/late capture behavior, saved/deferred addresses, retry/admin paths, actual-paid receipts, feature-off behavior and rollback compatibility. Challenge the effort estimate and identify the smallest safe scope.

Return: (1) verdict — ready / ready with changes / blocked; (2) prioritized findings with file/section evidence and proposed corrections; (3) missing acceptance tests; (4) unresolved commercial/supplier decisions; (5) revised estimate and dependencies. Do not implement, deploy, email the supplier, change ads or submit a real order as part of validation. Existing $9 general mailing copy is a founder constraint, not a defect to fix globally.

## Planning provenance

Prepared by the current Codex agent. The df-sprint-plan template and orientation guidance were used. Its default full workflow resolves to Claude Fable 5.1 and Codex GPT-6 Astra (Gemini disabled), but Claude CLI was absent at preflight, so the multi-model workflow did not run. No independent review or human approval is claimed. The founder explicitly intends to provide a separate validator; this is the draft for that handoff. The helper supports YAML/TSV ledgers, while this repository uses JSON; preserve and append to the existing JSON ledger rather than creating a competing ledger.


## October 26 execution addendum

The current request proceeds with actual international implementation, not a painted-door substitute. Preserve the scope and general $9 copy while splitting verification into baseline, implementation and independent review.

- Coordinator: current Codex agent; requested Luna agents handle plan critique/UI, server implementation, baseline tests and independent review. The user-selected Luna model takes precedence over skill default Astra. Native agent execution is used rather than an additional CLI wrapper; successful agent runs establish model availability.
- Isolated candidate: `codex/international-staging` from local staging `ae7f77e`; known remote staging is `f97f98f` and production `0623a0a`. Preserve unrelated dirty original-checkout work. Do not promote all staging work to production.
- Fresh read-only verification: existing staging READY build `build-2026-10-21-001`, source `f97f98f`, serves 100% and retains review flags plus supplier test mode. Read-only country catalog verifies US=1, CA=2, GB=4, AU=5. See execution checks; catalog delivery rates are not complete A2 costs.
- Working staging price: $14 USD = $9 base less eligible base discount + $5 upgrade. Domestic remains unchanged. Production activation still requires final commercial/supplier review.
- Expose preview only through `INTERNATIONAL_MAILING_PREVIEW=true` combined with server staging-review protection. Preserve the live-payment, outbound-email and physical-dispatch guards. Never enable production via a client flag. A genuine Stripe test-key environment may test payments; a live key must remain blocked.
- Strengthening work: a narrow pure calculation integrated with the existing server offer/reservation machinery; baseline and failure-path regression checks; guarded optional UI recovery; independent review. Do not claim a happy-path mock proves production reliability or replace the existing payment lifecycle.
- Current work excludes live charges, supplier submissions, new ads and production changes. Founder event testing should be a separate checklist with exact environment, price, payment method and expected fulfillment behavior. The founder confirmed the event is Saturday, October 31, 2026 and requested broad supplier-supported destinations rather than a three-country pilot.
- Evidence location: `.delivery/runs/20261026-international-staging/` and final `docs/sprints/evidence/SPRINT-0013/REPORT.md`. Report baseline, local, staged, supplier-confirmed and live-tested states separately.

### Broad destination verification (October 26)

The read-only supplier catalog returned 225 records. A normalized snapshot maps 212 country records; after current USPS suspensions it exposes 200 international destinations for staging preview. Ambiguous aliases, duplicate UK/subregion entries and a non-country Presort record are excluded. The catalog reports delivery_cost $0.82 US, $1.10 Canada and $1.85 for other international records; these are not full custom A2 costs. One $5 international upgrade remains the proposed customer-facing structure. The API requires a region for US/Canada and marks postal code required generally. Handling destinations without postal codes still requires supplier clarification before live activation. See `lib/handwrytten-country-catalog.json`, [API contract](https://www.handwrytten.com/api-redoc/) and [USPS international suspensions](https://about.usps.com/newsroom/service-alerts/international/) (page dated October 23).
