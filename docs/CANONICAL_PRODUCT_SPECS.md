# Send My Notes: canonical product specifications

**Updated November 9, 2026.** October 11 API verification is retained; November 9 founder confirmation, supplier receipts and current supplier pages update the facts. Companion to the
[canonical project brief](CANONICAL_PROJECT_BRIEF.md).

Use this table for customer copy, preview geometry, payment descriptions, and
fulfillment changes. An unresolved detail is not permission to reuse an older
claim. This document describes verified configuration and supplier guidance; it
does not claim the current storefront has been corrected.

| Property | Canonical status | Evidence / copy rule |
| --- | --- | --- |
| Fulfillment provider | Handwrytten API v2. | `lib/handwrytten.ts` uploads artwork, creates a custom card, then submits an order. |
| Selected format | **A2 Folded Portrait**, `dimension_id: 4`. | Confirmed by authenticated read-only `GET /v2/design/dimensions`. |
| Folded dimensions | **4.25 × 5.5 inches** (portrait). | Live card catalog independently reports `details_size: "4.25 x 5.5"` for dimension 4. |
| Open dimensions | **8.5 × 5.5 inches**. | Live dimensions response: `open_width: "8.500"`, `open_height: "5.500"`, `format: "folded"`. |
| Front aspect ratio | **17:22**, approximately 0.7727. | Derived from verified folded dimensions. 5:7 artwork is not the same geometry; do not describe it as exact A2 parity. |
| Cover | Customer-selected or generated artwork, uploaded as `type: "cover"`. | Printed artwork; source imagery is not evidence of a letterpress process. |
| Interior | Message written by automated equipment holding real pens. | Supplier documentation; integration sends `message` and a handwriting `font_label`. |
| Optional greeting | Concatenated with the note into the same pen-written message. | Current implementation does not send the optional greeting as a separate printed header. |
| Paper weight / finish | **120 lb vellum cardstock — founder-selected working specification, November 9.** | Handwrytten publishes #120 vellum for design-file printing. Founder is approximately 90% certain this is our stock and explicitly selected it. This is the adopted working spec, not independently verified API-SKU evidence; no cotton or archival certification claim. |
| Envelope | **White envelope**, addressed and mailed by Handwrytten. | Supplier custom-card design specifications, rechecked November 9. No envelope basis-weight or special-finish claim is needed; the older 70 lb claim has no recorded source. |
| Addressing | Request includes recipient and personal sender/return address. | Preserve personal return identity; verify the produced envelope before claiming exact preview parity. |
| Postage | Supplier says First-Class USPS and a real stamp. | General supplier FAQ; no explicit stamp selection in current order payload. Do not promise a particular stamp design. |
| Mailing origin | Supplier says Phoenix, Arizona postmark. | Do not imply the postmark is local to the sender or Lake Forest. |
| Preparation time | Supplier general guidance: aim to complete in **1–2 business days**, dependent on queue and order size. | No verified 2 PM ET cutoff or same-day guarantee for this integration. |
| Transit time | Supplier FAQ: typically **2–7 business days domestically**, may take longer. | Separate transit from preparation; estimate rather than guarantee. Another supplier article gives 1–5 days, so the FAQ's broader window is the interim guidance. |
| Tracking | Order/fulfillment status is supported; actual tracking depends on service and returned data. | Do not promise tracked delivery or confirmed receipt for every stamped letter. |
| Customer price | Current configured base price **$9 USD**, including mailing. | `CARD_FLAT_RATE_CENTS = 900`; supplied ads also say $9 including mailing. Existing discounts can alter payable amount. |
| Actual supplier charge | **$4.88 per single domestic card**, including **$3.75 card + $0.82 postage + $0.31 tax** in the reviewed orders. | Founder confirmation November 9 and actual Handwrytten order receipts dated November 4 and 7. These are actual observed charges, not catalog estimates; recheck if destination, taxes, pricing or product changes. |
| Stripe fee | **$0.56 on an undiscounted $9.00 single-card charge.** | Founder-confirmed November 9. Do not apply this fixed amount to discounted, international or multi-card payments. |
| Single-card contribution | **$3.56 / 39.6%** after the confirmed supplier and Stripe charges. | Arithmetic: $9.00 − $4.88 − $0.56. Before advertising, generation/hosting/support costs and refunds; not net profit. |
| Handwriting styles | Five mapped styles verified available: Casual David, Charming Chase, Carefree Kate, Executive Adam, Dapper Will. | Authenticated `GET /v2/fonts/list`; do not equate font availability with verified physical line wrapping. |
| Message fit | Safe limit not established by this audit. | Legacy UI permits 500 note characters plus a separate greeting; `/new` uses 450 combined. Neither alone proves physical fit across styles, line breaks, and margins. |
| Apple Pay | **Unverified end to end.** | Founder tested a Stripe payment, not Apple Pay. Device-type labels do not verify a configured wallet. |
| “60 seconds” | Experience target, **not measured completion time**. | Do not confuse checkout speed with preparation or delivery speed. |

## Evidence and authority

1. [Founder decisions](CANONICAL_PROJECT_BRIEF.md) establish product strategy and
   the November 9 purchase baseline. [Business evidence](evidence/business-facts-2026-11-09.md) records actual costs and their scope.
2. Live authenticated catalog responses establish our selected format. The
   sanitized [dimensions evidence](evidence/handwrytten-dimensions-2026-10-11.json)
   and [supported-style evidence](evidence/handwrytten-styles-2026-10-11.json) contain
   no keys, message content, addresses, or customer identifiers.
3. [Handwrytten API documentation](https://www.handwrytten.com/api-redoc/) describes
   endpoint contracts.
4. [Supplier FAQ](https://www.handwrytten.com/about/the-company/) supports real pens,
   personal return address, stamp, postmark, and general fulfillment timing. Its
   120 lb statement relates to a design-file printing option and does not confirm
   this API-created product's stock.
5. [Supplier design specifications](https://www.handwrytten.com/resources/card-design-specifications/)
   and [customizer guide](https://cdn.handwrytten.com/www/2025/07/Card-Customizer-Quick-Guide-2025.pdf)
   distinguish folded A2 from flat 5 × 7 cards.

## Evidence updates and narrow remaining details

The November 9 [business evidence record](evidence/business-facts-2026-11-09.md)
closes the supplier-cost question with actual receipts and records the founder's
Stripe fee. Preparation, transit, postage, postmark, real-pen writing and white
envelope facts are supported by current supplier documentation. No new order was
placed to establish these facts.

The founder selected **120 lb vellum** on November 9 after reviewing the supplier
FAQ, with approximately 90% confidence that it is the stock for our product. This
resolves the working specification choice; the public FAQ does not explicitly
identify API dimension 4, so the verification scope stays visible. Record direct
SKU confirmation if obtained; do not describe the choice as a measured or
independently supplier-verified result. Envelope weight is not required product copy.
A universal character limit or exact on-screen/physical line-wrap match also
needs separate evidence. Supplier templates establish layout guidance, not a
successful physical-fit test for every font and message.

Supplier facts must be reverified if the dimension, product, account pricing, or
fulfillment contract changes. Do not A/B test conflicting physical specifications
as if both were true.
