# SPRINT-0013: Copy and price impact inventory

Companion to [SPRINT-0013](SPRINT-0013.md). Inspected October 23, 2026, local `staging` source `ae7f77e`; deployed coverage must be reverified.

**Founder constraint:** keep existing general $9 mailing copy until international targeting begins. This inventory authorizes no copy edits. International-selected orders still require accurate totals, delivery descriptions and receipts.

## Count and limits

The search found **147 matching source lines in 41 distinct files**. A source line can contain multiple occurrences. Results include constants, comments, example promotions, schema metadata, admin labels and historical fixtures; they are not a count of live placements or mandatory changes. Dynamic routes may produce many pages from one template. Country propagation and delivery-only files are additional technical work, so this is not a total implementation file estimate.

```sh
rg -n '\$9|9\.00|including mailing|mailing included|postage included|includes mailing|CARD_PRICE|CARD_FLAT_RATE' app components lib --glob '*.ts' --glob '*.tsx'
```

## Grouped review map

Categories are primary review dispositions, not whole-file edit instructions. Shared files can mix preserved acquisition copy with selected-order UI that must become conditional. In particular, revisit earlier card/note steps after international selection: no order-total label may revert to $9 on back navigation. Preserve their domestic default text.

| Group | Files | Matching lines |
| --- | ---: | ---: |
| Preserve general domestic copy; revisit for international targeting | 10 | 51 |
| Conditional order-specific rendering needed before enabling international checkout | 13 | 31 |
| Pricing logic and quote validation; preserve the domestic base | 7 | 40 |
| Policy activation review; no broad rewrite now | 1 | 2 |
| Operational labels, promotion examples and financial assumptions to audit | 7 | 18 |
| Reference examples and comments; not automatic changes | 3 | 5 |

### Preserve general domestic copy; revisit for international targeting

| File | Matching source lines |
| --- | --- |
| [app/account/page.tsx](../../app/account/page.tsx) | 241, 316 |
| [app/layout.tsx](../../app/layout.tsx) | 16, 36, 55, 103 |
| [app/new/page.tsx](../../app/new/page.tsx) | 7 |
| [app/send/page.tsx](../../app/send/page.tsx) | 181 |
| [app/send/[occasion]/page.tsx](../../app/send/[occasion]/page.tsx) | 183, 243, 275, 345, 446 |
| [app/send/[occasion]/[slug]/page.tsx](../../app/send/[occasion]/[slug]/page.tsx) | 156, 269 |
| [components/flow/EntryCardStep.tsx](../../components/flow/EntryCardStep.tsx) | 108, 168 |
| [components/v3/Step1CardSelection.tsx](../../components/v3/Step1CardSelection.tsx) | 92, 204, 261, 293 |
| [lib/seo-scenarios.ts](../../lib/seo-scenarios.ts) | 39, 48, 57, 66, 68, 75, 84, 93, 119, 179, 242, 293, 343, 400, 401, 452, 502, 551, 596, 650, 696, 744, 791, 837, 838 |
| [lib/product-facts.ts](../../lib/product-facts.ts) | 15, 21, 22, 23, 24 |

### Conditional order-specific rendering needed before enabling international checkout

| File | Matching source lines |
| --- | --- |
| [app/order/[id]/page.tsx](../../app/order/[id]/page.tsx) | 353, 902, 914 |
| [app/preview/entry/client.tsx](../../app/preview/entry/client.tsx) | 1662, 1663 |
| [components/AddressStep.tsx](../../components/AddressStep.tsx) | 146, 645 |
| [components/CheckoutStep.tsx](../../components/CheckoutStep.tsx) | 588 |
| [components/VendingMachineBuilder.tsx](../../components/VendingMachineBuilder.tsx) | 592, 671, 692, 945 |
| [components/flow/ActionBar.tsx](../../components/flow/ActionBar.tsx) | 17, 18 |
| [components/flow/FlowHeader.tsx](../../components/flow/FlowHeader.tsx) | 56, 59 |
| [components/v3/Step2NoteComposition.tsx](../../components/v3/Step2NoteComposition.tsx) | 937, 963 |
| [components/v3/Step3EnvelopeAddressing.tsx](../../components/v3/Step3EnvelopeAddressing.tsx) | 770, 794 |
| [components/v3/Step5Confirmation.tsx](../../components/v3/Step5Confirmation.tsx) | 478 |
| [components/v3/TargetPurchaseExperience.tsx](../../components/v3/TargetPurchaseExperience.tsx) | 549, 557, 674 |
| [lib/device-wallet.ts](../../lib/device-wallet.ts) | 53, 67, 80 |
| [lib/email/transactional.ts](../../lib/email/transactional.ts) | 55, 77, 220, 239 |

### Pricing logic and quote validation; preserve the domestic base

| File | Matching source lines |
| --- | --- |
| [app/api/checkout/complete-free-order/route.ts](../../app/api/checkout/complete-free-order/route.ts) | 10, 88, 164 |
| [app/api/checkout/confirm-order/route.ts](../../app/api/checkout/confirm-order/route.ts) | 2, 174, 256, 300 |
| [app/api/checkout/create-intent/route.ts](../../app/api/checkout/create-intent/route.ts) | 4, 73, 84, 113, 167, 176, 194, 218, 243, 252, 283 |
| [app/api/discount/validate/route.ts](../../app/api/discount/validate/route.ts) | 3, 21, 45 |
| [lib/offer-engine.ts](../../lib/offer-engine.ts) | 30, 270, 281, 291, 301, 311, 317, 411, 451, 481, 486, 488, 494 |
| [lib/promotions-and-growth-service.ts](../../lib/promotions-and-growth-service.ts) | 50, 100, 121, 388 |
| [lib/stripe.ts](../../lib/stripe.ts) | 20, 37 |

### Policy activation review; no broad rewrite now

| File | Matching source lines |
| --- | --- |
| [app/terms/page.tsx](../../app/terms/page.tsx) | 139, 163 |

### Operational labels, promotion examples and financial assumptions to audit

| File | Matching source lines |
| --- | --- |
| [app/admin/page.tsx](../../app/admin/page.tsx) | 1090, 1681, 1944, 1949, 1961, 1965, 1977, 2683, 2757 |
| [components/admin/CampaignPerformanceWidget.tsx](../../components/admin/CampaignPerformanceWidget.tsx) | 86 |
| [components/admin/PromotionsWorkspace.tsx](../../components/admin/PromotionsWorkspace.tsx) | 831, 1292 |
| [components/admin/VisitorTelemetryDashboard.tsx](../../components/admin/VisitorTelemetryDashboard.tsx) | 805 |
| [lib/metrics-rollup.ts](../../lib/metrics-rollup.ts) | 24, 1360 |
| [lib/promotion-client.ts](../../lib/promotion-client.ts) | 15, 17 |
| [lib/valuation-heuristics.ts](../../lib/valuation-heuristics.ts) | 73 |

### Reference examples and comments; not automatic changes

| File | Matching source lines |
| --- | --- |
| [lib/contracts/golden-fixtures.ts](../../lib/contracts/golden-fixtures.ts) | 321, 357, 424 |
| [lib/factory/types.ts](../../lib/factory/types.ts) | 56 |
| [lib/types.ts](../../lib/types.ts) | 145 |

## Important distinctions

- Keep `PRODUCT_PRICE` domestic defaults and the 900-cent base. Add destination-aware order quotes and conditional display; do not replace the global constant with $14.
- Transactional receipts currently assign a literal `$9.00`. Wire actual stored payment amount through both text/HTML and callers. Historical discounted/free orders must not be relabeled as full price.
- Some admin $9 references are static illustrations or explicit comments warning against invented fixed revenue; retain accurate examples. Audit actual calculations before changing them, and preserve unknown supplier cost/margin.
- Terms contain domestic service wording and a $9 liability example. Flag for narrow review before paid activation; do not rewrite policy rights or silently declare policy review complete.
- Do not rewrite schema/SEO/landing-page prices now. At future international targeting, verify structured offers and visible copy together, retaining the domestic base offer and accurately disclosing any international offer.
- Promotion examples may promise a free card. Validate compatibility with a base-only discount plus international surcharge before exposure; do not assume an internal formula settles customer-facing terms.

## Later international-targeting work package

When international targeting is explicitly requested, rerun this inventory against the actual production source and inspect rendered routes. Review these eight surface groups:

1. Entry/card-selection copy, global flow header and persistent price bar.
2. Generic sending landing page and occasion/suboccasion templates.
3. SEO titles/descriptions, social previews and structured product/offer data.
4. Account/new-card invitations and repeat-send entry points.
5. Checkout/confirmation/order/receipt wording for both service classes.
6. FAQ/terms/delivery/refund statements with narrow policy review.
7. Promotion templates, emails and admin illustrative economics.
8. External ad creative, ad destinations and other off-repository acquisition assets.

This is a plan for a later copy pass, not a mandate to change all eight groups. External ads/account assets were not inspected or counted; neither generated production pages nor external campaign placements are covered by the 41-file count.

Acceptance for that later work: a domestic visitor still understands the $9 offer, an international-targeted visitor sees the applicable complete price before committing, and selected-order prices remain consistent across channels. No performance/uplift claim without evidence.

## Exact matched-line evidence

Frozen search output follows for reproducibility. Line numbers may move during implementation. No private order/address data is included.

```text
components/flow/EntryCardStep.tsx:108:          <span>$9 including mailing. No account needed.</span>
components/flow/EntryCardStep.tsx:168:                  $9.00 flat rate • Ready to write note
app/send/page.tsx:181:            $9.00 Flat All-Inclusive
lib/promotion-client.ts:15:  welcome_2_off: { key: "welcome_2_off", name: "Welcome $2.00 Off", codeSuggestion: "WELCOME2", purpose: "First-time sender introductory gesture", discountType: "FIXED_AMOUNT", discountValue: 200, destinationPath: "/send", description: "Applies $2.00 off standard $9.00 card. Final price $7.00.", perCustomerLimit: 1 },
lib/promotion-client.ts:17:  vip_free_card: { key: "vip_free_card", name: "VIP 100% Free Card (Comp)", codeSuggestion: "VIPGIFT", purpose: "100% complimentary card gift", discountType: "PERCENTAGE", discountValue: 100, destinationPath: "/send", description: "100% off ($9.00 card becomes $0.00). Counted as free promo.", maxUses: 50, perCustomerLimit: 1 },
lib/types.ts:145:  value: number; // Percentage (e.g. 20 for 20%) or Fixed Cents (e.g. 200 for $2.00, 900 for $9.00)
app/send/[occasion]/[slug]/page.tsx:156:      price: "9.00",
app/send/[occasion]/[slug]/page.tsx:269:                $9.00 Flat All-Inclusive
components/flow/ActionBar.tsx:17:  priceDisplay = "$9 total",
components/flow/ActionBar.tsx:18:  priceSubtext = "USPS mailing included",
lib/seo-scenarios.ts:39:    metaTitle: "Send a Real Handwritten Thank You Card | Mailed for You ($9)",
lib/seo-scenarios.ts:48:    metaTitle: "Send a Real Handwritten Sympathy Card | Condolence Mail ($9)",
lib/seo-scenarios.ts:57:    metaTitle: "Send a Handwritten Congratulations Card | Real Pen Mail ($9)",
lib/seo-scenarios.ts:66:    metaTitle: "Send a Real Handwritten Birthday Card | Stamped & Mailed ($9)",
lib/seo-scenarios.ts:68:      "Celebrate milestone birthdays and long-distance best friends. Written with a real ballpoint pen on heavy cardstock and mailed for $9 all-inclusive.",
lib/seo-scenarios.ts:75:    metaTitle: "Send a Handwritten Anniversary Card | Real Ink Delivery ($9)",
lib/seo-scenarios.ts:84:    metaTitle: "Send a Handwritten Get Well Soon Card | Real Pen Mail ($9)",
lib/seo-scenarios.ts:93:    metaTitle: "Send a Handwritten Thinking of You Card | Real Pen Mail ($9)",
lib/seo-scenarios.ts:119:    metaTitle: "Send a Warm Handwritten Thank You Note | Real Pen Mail ($9)",
lib/seo-scenarios.ts:179:    metaTitle: "Send a Handwritten Interview Thank You Note | Real Pen & USPS Mail ($9)",
lib/seo-scenarios.ts:242:    metaTitle: "Handwritten Thank You Note to a Mentor | Real Pen-on-Paper ($9)",
lib/seo-scenarios.ts:293:    metaDescription: "Delight your real estate or consulting clients upon contract closing. Automated real pen handwriting mailed with USPS First Class stamp for $9.",
lib/seo-scenarios.ts:343:    metaTitle: "Send a Real Handwritten Sympathy Card | Stamped & Mailed ($9)",
lib/seo-scenarios.ts:400:    metaTitle: "Pet Loss Sympathy Card | Handwritten Dog & Cat Condolence Note ($9)",
lib/seo-scenarios.ts:401:    metaDescription: "Express your condolences for the loss of a dog, cat, or beloved pet. Pre-seeded with gentle comforting words, written with a real ballpoint pen and mailed for $9.",
lib/seo-scenarios.ts:452:    metaTitle: "Condolence Card on the Loss of a Parent | Real Pen-on-Paper ($9)",
lib/seo-scenarios.ts:502:    metaTitle: "Handwritten Housewarming Card | Congratulate New Homeowners ($9)",
lib/seo-scenarios.ts:551:    metaTitle: "Congratulations on Promotion Card | Handwritten Real Pen Mail ($9)",
lib/seo-scenarios.ts:596:    metaTitle: "Send a Real Handwritten Birthday Card | Stamped & Mailed ($9)",
lib/seo-scenarios.ts:650:    metaDescription: "Honor milestone birthdays with a luxurious real pen-on-paper card. Pre-filled with celebratory words, written in real ink and mailed for $9 flat.",
lib/seo-scenarios.ts:696:    metaDescription: "Bridge the distance on their birthday with a physical card written with a real pen. Personalize in seconds and mail for $9 all-inclusive.",
lib/seo-scenarios.ts:744:    metaTitle: "Handwritten Anniversary Card for Husband or Wife | Real Ink ($9)",
lib/seo-scenarios.ts:791:    metaTitle: "Get Well Soon Card After Surgery | Real Handwritten Delivery ($9)",
lib/seo-scenarios.ts:837:    metaTitle: "Thinking of You During Tough Times | Handwritten Support Card ($9)",
lib/seo-scenarios.ts:838:    metaDescription: "Show someone you care during illness, divorce, job loss, or life transitions. Real pen handwriting mailed in a stamped envelope for $9 flat.",
lib/offer-engine.ts:30:import { CARD_FLAT_RATE_CENTS } from "./stripe";
lib/offer-engine.ts:270:      finalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:281:      finalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:291:      finalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:301:      finalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:311:      finalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:317:  const basePriceCents = CARD_FLAT_RATE_CENTS; // 900
lib/offer-engine.ts:411:            authoritativeFinalCents: fresh.finalAmountInCents ?? CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:451:        authoritativeFinalCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:481:    input.paymentIntentAmountCents !== CARD_FLAT_RATE_CENTS
lib/offer-engine.ts:486:      authoritativeFinalCents: CARD_FLAT_RATE_CENTS,
lib/offer-engine.ts:488:      reason: "Standard order price is $9.00.",
lib/offer-engine.ts:494:    authoritativeFinalCents: CARD_FLAT_RATE_CENTS,
app/send/[occasion]/page.tsx:183:      price: "9.00",
app/send/[occasion]/page.tsx:243:                $9.00 Flat All-Inclusive
app/send/[occasion]/page.tsx:275:              $9.00 Flat All-Inclusive
app/send/[occasion]/page.tsx:345:              No store runs • No stamps • $9 flat
app/send/[occasion]/page.tsx:446:                  What is included in the $9.00 flat price?
components/flow/FlowHeader.tsx:56:              $9.00 All-In • Written in Real Ballpoint Ink • Free First-Class Stamp Included
components/flow/FlowHeader.tsx:59:              $9.00 All-In • Real Ink • Stamp Included
lib/factory/types.ts:56:  retailPriceCents: number; // Retail price to customer (e.g. 900 for $9.00)
app/account/page.tsx:241:              <span>Send New Card ($9.00)</span>
app/account/page.tsx:316:                  Design an AI cover, compose your sentiment, and our robotic pen plotters will pen it with real ink and mail it for a flat $9.00.
lib/product-facts.ts:15:// 1. PRICING (Canonical Specs row: "Customer price", CARD_FLAT_RATE_CENTS = 900)
lib/product-facts.ts:21:  formattedPrice: "$9.00",
lib/product-facts.ts:22:  shortFormattedPrice: "$9",
lib/product-facts.ts:23:  priceDescription: "$9 including mailing",
lib/product-facts.ts:24:  pricingNotice: "$9.00 flat rate per physical card (printing, real ink handwriting, postage, and USPS First-Class mail included).",
lib/email/transactional.ts:55: * Confirms $9.00 payment, displays the personal note text, and provides a direct magic link to complete the recipient address.
lib/email/transactional.ts:77:  const formattedAmount = "$9.00";
lib/email/transactional.ts:220: * Confirms $9.00 payment, recipient address, note text, and estimated USPS First-Class arrival.
lib/email/transactional.ts:239:  const formattedAmount = "$9.00";
components/AddressStep.tsx:146:          We ink, package, stamp, and mail this physical card via USPS First Class Mail. Postage is 100% included in the $9.00 flat fee.
components/AddressStep.tsx:645:          Included in $9.00
components/CheckoutStep.tsx:588:          Zero accounts or onboarding required. Flat $9.00 all-inclusive with real pen inking and USPS postage. {deviceWallet.heroCallout}
components/v3/Step2NoteComposition.tsx:937:                <span>Continue to Recipient Address — $9.00 All-In</span>
components/v3/Step2NoteComposition.tsx:963:              <span>Continue to Address ($9.00 All-In)</span>
components/VendingMachineBuilder.tsx:592:                  : "$9.00"}
components/VendingMachineBuilder.tsx:671:          Send a real handwritten card right now—without buying stationery, finding a pen, or looking for a mailbox. We write your note in real pen ink on quality cardstock, stamp it, and mail it via USPS for a flat <strong>$9.00</strong> including mailing. {deviceWallet.heroCallout}
components/VendingMachineBuilder.tsx:692:              : "Mailed via USPS ($9.00 Flat)"}
components/VendingMachineBuilder.tsx:945:                      : "Proceed to Payment ($9.00)"}
app/layout.tsx:16:    "Send real pen-on-paper handwritten greeting cards in minutes. Written with real ballpoint ink on folded cardstock, stamped, and mailed anywhere in the US for $9.00 flat.",
app/layout.tsx:36:      "Send a real handwritten card in minutes. Written in real pen and ink on folded cardstock, stamped, and mailed directly to their door for $9 flat.",
app/layout.tsx:55:      "Send a real handwritten card in minutes. Written in real pen and ink on folded cardstock, stamped, and mailed directly to their door for $9 flat.",
app/layout.tsx:103:                price: "9.00",
components/v3/Step3EnvelopeAddressing.tsx:770:              <span>Review &amp; pay ($9.00) →</span>
components/v3/Step3EnvelopeAddressing.tsx:794:            <span>Review &amp; pay ($9.00) →</span>
components/admin/VisitorTelemetryDashboard.tsx:805:                            Paid ($9.00)
app/preview/entry/client.tsx:1662:          priceDisplay="$9 total"
app/preview/entry/client.tsx:1663:          priceSubtext="USPS mailing included"
components/v3/TargetPurchaseExperience.tsx:549:                4. Pay ($9)
components/v3/TargetPurchaseExperience.tsx:557:            <span className="hidden sm:inline">$9 Flat Rate</span>
components/v3/TargetPurchaseExperience.tsx:674:          Cardstock • Flat $9.00 Rate (Postage Included)
components/v3/Step1CardSelection.tsx:92:            <span>$9.00 Flat Rate • Real Pen Inking &amp; First-Class USPS Postage Included</span>
components/v3/Step1CardSelection.tsx:204:                  <span className="font-serif font-bold text-stone-800">$9.00</span>
components/v3/Step1CardSelection.tsx:261:              $9.00 flat rate • Real pen inking &amp; USPS postage included
components/v3/Step1CardSelection.tsx:293:              $9.00 Flat Rate
components/admin/CampaignPerformanceWidget.tsx:86:      // Do not invent fixed $9.00 or $3.56 margin
app/admin/page.tsx:1090:                <p className="text-[10px] sm:text-[11px] text-stone-400">$9.00 flat per card</p>
app/admin/page.tsx:1681:                  {metrics?.margins?.paidCardsCount || 0} delivered cards @ $9.00 flat
app/admin/page.tsx:1944:            {/* THE $9.00 UNIT WATERFALL EXPLAINER */}
app/admin/page.tsx:1949:                  Unit Economics Anatomy: The $9.00 Card Waterfall
app/admin/page.tsx:1961:                      +$9.00
app/admin/page.tsx:1965:                    Customer pays $9.00 flat with free First Class shipping, envelope addressing, and physical stamp included.
app/admin/page.tsx:1977:                    Standard credit card interchange fee of 2.9% + $0.30 ($0.26 + $0.30 = $0.56 on $9.00). $0 for comp promo codes.
app/admin/page.tsx:2683:                <p className="text-[11px] text-stone-400">Physical cards placed ($9 flat)</p>
app/admin/page.tsx:2757:                    Google SERP rich snippets active: $9.00 flat, in-stock, free USPS First Class delivery.
app/api/checkout/create-intent/route.ts:4:import { createCardPaymentIntent, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
app/api/checkout/create-intent/route.ts:73:    let finalAmountInCents = CARD_FLAT_RATE_CENTS; // 900
app/api/checkout/create-intent/route.ts:84:        listPriceCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:113:      finalAmountInCents = quoteResult.finalAmountInCents ?? CARD_FLAT_RATE_CENTS;
app/api/checkout/create-intent/route.ts:167:        originalAmountInCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:176:        listPriceCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:194:        originalAmountInCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:218:            originalAmountCents: String(CARD_FLAT_RATE_CENTS),
app/api/checkout/create-intent/route.ts:243:      originalAmountInCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:252:      listPriceCents: CARD_FLAT_RATE_CENTS,
app/api/checkout/create-intent/route.ts:283:      originalAmountInCents: CARD_FLAT_RATE_CENTS,
lib/valuation-heuristics.ts:73:export const STANDARD_RETAIL_PRICE = 9.00;
app/api/checkout/complete-free-order/route.ts:10:import { CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
app/api/checkout/complete-free-order/route.ts:88:        const validation = validateDiscount(discountData, CARD_FLAT_RATE_CENTS);
app/api/checkout/complete-free-order/route.ts:164:      discountAmountCents: CARD_FLAT_RATE_CENTS,
components/admin/PromotionsWorkspace.tsx:831:                  <span>Authoritative Price Preview ($9.00 Standard Card)</span>
components/admin/PromotionsWorkspace.tsx:1292:                    <span className="text-stone-600">Gross List Value ($9/card):</span>
app/api/checkout/confirm-order/route.ts:2:import { getStripeClient, CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
app/api/checkout/confirm-order/route.ts:174:          : CARD_FLAT_RATE_CENTS;
app/api/checkout/confirm-order/route.ts:256:          : CARD_FLAT_RATE_CENTS;
app/api/checkout/confirm-order/route.ts:300:            : order.amountInCents ?? CARD_FLAT_RATE_CENTS,
lib/device-wallet.ts:53:      checkoutButtonLabel: "Send with Apple Pay ($9.00)",
lib/device-wallet.ts:67:      checkoutButtonLabel: "Send with Google Pay ($9.00)",
lib/device-wallet.ts:80:    checkoutButtonLabel: "Send Handwritten Card ($9.00)",
components/v3/Step5Confirmation.tsx:478:          <span className="font-bold text-stone-900 text-sm">$9.00</span>
app/api/discount/validate/route.ts:3:import { CARD_FLAT_RATE_CENTS } from "@/lib/stripe";
app/api/discount/validate/route.ts:21:      listPriceCents: CARD_FLAT_RATE_CENTS,
app/api/discount/validate/route.ts:45:      finalAmountInCents: result.finalAmountInCents ?? CARD_FLAT_RATE_CENTS,
app/terms/page.tsx:139:              All prices are listed in USD. Our $9.00 flat fee covers custom card printing, robotic pen inking, packaging, and domestic postage. Payments are securely processed through Stripe.
app/terms/page.tsx:163:                UNDER NO CIRCUMSTANCES SHALL OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR IN CONNECTION WITH ANY ORDER EXCEED THE TOTAL AMOUNT ACTUALLY PAID BY YOU FOR THAT SPECIFIC ORDER (I.E., $9.00 USD).
lib/contracts/golden-fixtures.ts:321:      "A verified Stripe live capture ($9.00) whose Handwrytten API submission failed remains captured revenue ($9.00) and must surface as a critical operational exception.",
lib/contracts/golden-fixtures.ts:357:      "A verified Stripe capture ($9.00) with status AWAITING_RECIPIENT_ADDRESS counts as verified revenue ($9.00) and enters the deferred-address path.",
lib/contracts/golden-fixtures.ts:424:      "A verified captured order ($9.00) with known Stripe fee ($0.56), but unconfirmed supplier invoice and no dated ad spend, must report supplier cost, contribution margin, and CAC as unavailable/null, NEVER 39.6% or $0.00 CAC.",
app/order/[id]/page.tsx:353:      title: "Payment Confirmed ($9.00 Paid)",
app/order/[id]/page.tsx:902:              <span className="font-serif font-bold text-base">$9.00 Flat Rate</span>
app/order/[id]/page.tsx:914:            <span>Send Another Card ($9.00)</span>
lib/metrics-rollup.ts:24:  return Math.round(amountInCents * 0.029) + 30; // 2.9% + $0.30 (56¢ on $9.00)
lib/metrics-rollup.ts:1360:      stepName: "6. Paid Order ($9.00)",
lib/stripe.ts:20:export const CARD_FLAT_RATE_CENTS = 900; // $9.00 flat rate (Card + Robot Pen + Envelope + USPS Postage)
lib/stripe.ts:37:  const amountToCharge = params.amountInCents !== undefined ? params.amountInCents : CARD_FLAT_RATE_CENTS;
app/new/page.tsx:7:    "Curated greeting cards written in real ballpoint pen ink. Mailed via USPS First-Class with your return address for $9.00 total.",
lib/promotions-and-growth-service.ts:50:import { CARD_FLAT_RATE_CENTS } from "./stripe";
lib/promotions-and-growth-service.ts:100:    description: "Applies $2.00 off standard $9.00 card. Final price $7.00.",
lib/promotions-and-growth-service.ts:121:    description: "100% off ($9.00 card becomes $0.00). Counted as free promo.",
lib/promotions-and-growth-service.ts:388:  basePriceCents: number = CARD_FLAT_RATE_CENTS
```
