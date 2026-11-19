# Handwrytten integration audit

**October 11, 2026. Read-only audit; no orders, uploads, or supplier settings changed.**
Current authority: [project brief](CANONICAL_PROJECT_BRIEF.md) and
[product specifications](CANONICAL_PRODUCT_SPECS.md).

## November 9, 2026 status note

This is the historical October 11 audit, not a current unresolved-work list.
The supplier cost finding is now **resolved**: actual receipts confirm $4.88
($3.75 card + $0.82 postage + $0.31 tax). The founder confirms $0.56 Stripe fees
on a $9 undiscounted single-card charge, leaving $3.56 before advertising and
other operating costs. White envelopes and general production/mailing guidance
are supported by current supplier pages. See the updated
[canonical specifications](CANONICAL_PRODUCT_SPECS.md) and
[business evidence](evidence/business-facts-2026-11-09.md). Historical code
findings below must be checked against current implementation before reopening.

## What was checked

Inspected `lib/handwrytten.ts`, `lib/order-processor.ts`, `lib/stripe.ts`,
`lib/image-optimizer.ts`, `lib/delivery-estimate.ts`, both note composers,
`lib/device-wallet.ts`, and the order-status sync test. Queried the existing
Handwrytten account using read-only dimensions, font, and card-catalog endpoints.
Only non-personal format/style evidence was retained in documentation.

The current pipeline uploads the cover, resolves/uploads the Aster & Blanche
backplate, creates a dimension-4 card, then calls `singleStepOrder` with the note,
font, recipient address, and sender return address. Source inspection and catalog
reads verify configuration, not a fresh end-to-end physical order. The founder
reports the existing paid test order; no new order was dispatched.

## Findings and required follow-up

| Finding | Evidence | Required alignment |
| --- | --- | --- |
| Physical size conflicts with storefront and metadata. | Code selects dimension 4; live API confirms A2 folded portrait, 4.25 × 5.5 closed / 8.5 × 5.5 open. Stripe product metadata says 5×7 folded. | Use the verified A2 dimensions in future UI, metadata, previews, and artwork handling. |
| Artwork/preview geometry differs from A2. | Image optimizer targets 1500 × 2100 / 5:7. Verified front geometry is 17:22. | Review crop/bleed against the supplier template; preview the actual output. A resolution label does not prove physical parity. |
| Paper claims are unsupported for this exact SKU. | Request has no stock selection; old docs alternate between 100 and 120 lb. Supplier FAQ's 120 lb option is not clearly the API-created SKU. | Obtain SKU-specific confirmation; use neutral cardstock copy until then. |
| Delivery engine cannot substantiate existing promises. | Uses browser-local 2 PM, skips only Sundays, includes Saturdays as “business days,” and omits postal holidays. Supplier FAQ gives queue-dependent 1–2 business-day preparation. | Replace assumptions with a confirmed production calendar and honest arrival estimates in implementation work. |
| Personal return-address fallback can expose A&B. | `singleStepOrder` falls back to sender first/last names “Aster & Blanche” / “Press” when missing. | Validate personal sender identity before fulfillment rather than silently inserting brand names. Preserve the physical colophon separately. |
| A&B backplate resolution is dynamic. | Environment override, then stored system config, then upload. Historical documents hardcode different IDs. | Do not treat an old numeric ID as canonical. Verify the resolved image and physical sample when changing the imprint. |
| One font alias does not match its name. | `hwCharity` maps to Casual David; live API labels it Chill Charity. | Decide whether this is an intentional compatibility alias; do not offer Charity while promising a different physical style. The five principal mapped styles exist in the live catalog. |
| Physical text fit is unverified. | Current UI limits differ, and optional greeting is combined with the note at dispatch. | Verify combined content and line wrapping against actual margins/styles, not just textarea length. |
| Payment capability messaging is unreliable. | Wallet labels are based on Apple/Android user-agent detection. | Test actual Apple Pay availability and payment in Safari and the Meta ad journey. Stripe card success does not establish wallet readiness. |
| Supplier cost model is stale/unverified. | Live catalog shows varied prices, commonly $3.75 for A2; old docs assume $3.50 before postage. | Reconcile our custom-card invoice, actual postage, taxes, and Stripe charges before setting a break-even acquisition cost. |
| Audit scripts can have real side effects. | `scripts/test-card-creation.ts` uploads assets and calls the fulfillment pipeline. Missing API key simulates success; test mode is controlled at order submission. | Do not use the creation script as a read-only check. Future end-to-end tests must explicitly distinguish mock, supplier test mode, and billable production. |

## Verification limits

The read-only API returned success for dimensions, styles, and catalog. The
existing status-sync test uses mocked responses and checks parsing/error handling;
it does not verify live delivery, stock, postage charges, or Apple Pay. Supplier
paper specifications and full custom-card cost remain open, explicitly marked in
the canonical specification sheet. Runtime/UI changes are follow-up implementation
work; this audit establishes the facts and mismatch list first.

Sources: [API contract](https://www.handwrytten.com/api-redoc/),
[supplier FAQ](https://www.handwrytten.com/about/the-company/),
[design specifications](https://www.handwrytten.com/resources/card-design-specifications/).
