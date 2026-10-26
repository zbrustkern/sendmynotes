# SPRINT-0013 implementation plan critique

Review date: October 26, 2026
Scope: read-only source review; no product files changed.

## Finding

The sprint has the right fail-closed and payment-binding constraints, but its 41-file/147-line copy inventory is an impact map, not a rewrite list. The minimum safe increment is a country-aware recipient contract and a pure pricing function layered over the existing server offer engine, wired into the active `/new` checkout path. Keep the feature off in production. Preserve all general $9 acquisition copy and the existing domestic path.

The proposal remains $14 total: $9 base plus a $5 international upgrade. An eligible discount reduces only the $9 base, so a $2 discount gives $12 and a full base discount leaves $5 payable. The pure calculation must take an authoritative existing offer quote/discount result and add the upgrade; it must not fork promotion lookup, reservation, quote lifecycle, or redemption logic. Supplier cost and margin remain unconfirmed, so $14 is a proposal, not a profitability claim.

## Current seams

- `app/new/page.tsx` is the primary candidate entry; it uses `app/preview/entry/client.tsx` (EntryPrototypeClient), `Step3EnvelopeAddressing.tsx`, and `Step4ReviewAndPayment.tsx`. This corrects the initial review’s mistaken TargetPurchaseExperience routing assumption; TargetPurchaseExperience is a separate `/send` consumer. `components/VendingMachineBuilder.tsx` is another older checkout caller. Preview-only entry points should remain out of production behavior.
- `app/api/checkout/create-intent/route.ts` validates recipient addresses, calls `issueOfferPriceQuote` and `reserveOfferForCheckout`, creates the PaymentIntent, and stores the draft order. It currently validates US-shaped fields and stores `listPriceCents: 900` / `originalAmountInCents: 900`.
- `lib/offer-engine.ts` owns the canonical 900-cent base and authoritative discounts. Do not change `CARD_FLAT_RATE_CENTS` to 1400. Add a pure arithmetic helper outside or immediately adjacent to this server authority; pass it the validated base discount/quote result.
- `app/api/checkout/confirm-order/route.ts`, the Stripe webhook, `lib/order-processor.ts`, and `lib/handwrytten.ts` are the payment/fulfillment binding chain. The stored order's immutable destination and payable amount must govern all downstream work.
- `MailingAddress` in `lib/types.ts` already carries an optional country field, but address validation, saved contacts, draft recovery, display formatting and supplier serialization assume US fields/country conventions. Additive schema alone does not provide safe support.

## Smallest safe implementation slice

1. Define a small explicit destination configuration with canonical country codes, supplier mapping, required/optional fields, and a server capability defaulting off. Do not enable client flags, query parameters, or cookies as authority. The actual allowlist must wait for supplier/account verification; Canada/UK/Australia are candidates only.
2. Implement and meaningfully unit-test a pure function that calculates `max(0, 900 - eligibleBaseDiscount) + 500` for international, and existing domestic result unchanged. Zero-base domestic orders stay zero; international base-free promos retain the $5 positive balance and cannot use free-order completion. Do not issue the ordinary $9 quote and then trust a client-supplied total.
3. Extend only the active `/new` recipient editor/draft path enough to choose an enabled country, validate its address rules, preserve a separate domestic draft, and submit the canonical country plus complete recipient address. Require complete international address before payment. Keep sender/return address US and personal. Server rejects unknown country, mismatched mode/country, deferred international address, and international requests while capability is off.
4. Bind checkout pricing to the validated destination on the server, store destination/mapping snapshot, exact base/upgrade/discount/total, and enforce the same stored quote/order amount through confirmation and webhook. Reject destination mutation after payment initialization/capture. Keep the offer reservation/redeeming lifecycle intact.
5. Preserve the SPRINT-0011 atomic pricing and provider safeguards in `Step4ReviewAndPayment`: destination or promo repricing invalidates old readiness; only matching server responses become visible; late responses are ignored; matching `clientSecret` remounts Elements; buttons/handlers block in-flight submit and stale intents; failed repricing cannot leave a hidden payable old intent. Do not undertake a broad payment refactor.
6. Make narrowly scoped selected-order totals/country/delivery text truthful on review and receipt/order output actually reachable for this flow. Preserve general `$9` copy. International delivery copy must avoid domestic timing promises. Ensure stored international orders remain readable and fulfillable with the capability off.

## Payment and rollout risk

The existing offer quote uses `CARD_FLAT_RATE_CENTS` as its base and `create-intent` saves the final amount and discount against a $9 original/list price. Simply adding 500 cents after quote issuance is unsafe unless the quote/order/payment verification contracts are updated together: expected amount checks, zero/free handling, metadata, confirmation, webhook-before-client-confirm, redemptions and reporting can otherwise disagree. Treat the international surcharge as a separate, explicit price component in the immutable order snapshot.

The SPRINT-0011 precedent already documents the clientSecret immutability/remount issue, atomic promotion changes, stale-response protection, and retry recovery. Retain these protections and prove destination changes follow the same serialized flow. A mocked smoke test proves application behavior against the mock; it does not establish hosted staging correctness, Stripe behavior, supplier acceptance, or that no live side effect can occur. Staging evidence should name the exact project, backend, revision, payment mode and external-side-effect suppression. No fulfillment script or supplier submission is an audit test.

## Review disposition

Proceed with the bounded implementation and staging readiness work; do not execute the original broad inventory as a mandatory code-edit list. Gate supplier-dependent destination rules and any production exposure on current supplier verification. Keep production capability off; staging must suppress live charges and supplier orders. A passing build or mocked payment test alone is not a deploy guarantee. No live charge, production deployment, supplier order, physical mail, marketing targeting, or painted-door demand test is within this scope.
