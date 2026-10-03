# SendMyNotes / Aster & Blanche: Comprehensive Rework Proposal & Agent Build Plan

**Document Version:** 3.0.0  
**Prepared:** October 3, 2026  
**Stage:** Formal Proposal Package — Awaiting Founder Approval Following Independent Validation  
**Target Repository:** `/Users/zeke/code/sendmynotes` (Baseline Commit: `43dfc58`)  
**Target Deployments:** `sendmynotes.com` & `asterandblanche.com` (Firebase App Hosting backend `sendmynotes`, Project: `sendmynotes-2a417`)

---

## 1. Executive Recommendation

### The Business Objective & Problem Statement
The legacy SendMyNotes / Aster & Blanche card platform operates on an elegant commercial thesis: enabling customers to personalize and dispatch an authentic, physically mailed, pen-written greeting card in approximately 60 seconds for a flat $9.00 fee. 

However, source code and asset inspection at commit `43dfc58` identified acute commercial and operational disconnects that depress paid conversion and damage brand equity:
1. **Unsubstantiated Manufacturing & Location Claims:** Marketing and metadata claim "letterpress atelier," "debossed borders," "120 lb archival cardstock," and "principal studio mailing in Lake Forest, IL." The physical fulfillment is executed via Handwrytten’s automated robotics facility in Phoenix, AZ on standard 100 lb cardstock using mechanical ballpoint plotters on A2 folded cards (4.25" × 5.5"), not 5" × 7" letterpress cards.
2. **Deceptive Wallet Detection:** `lib/device-wallet.ts` relies on naive user-agent regex (`/iPhone|iPad|Macintosh/i`), declaring "Apple Pay Ready • Double-click to complete" on devices where Apple Pay is neither configured nor supported.
3. **Inverted Composition Hierarchy:** Customers are forced to navigate an AI prompt input and an expanded 20-item inspiration browser before reaching the primary note-writing textarea.
4. **Checkout Form Exhaustion:** Step 3 requires 12 separate address fields across recipient and sender, plus inline annual occasion reminder dropdowns, inducing heavy cart abandonment.
5. **Brand Disconnect:** Lack of distinct brand architecture between the convenience service (`sendmynotes.com`) and the luxury stationery imprint (`asterandblanche.com`).

### The Foundational Principle: The Veneer of High Personal Effort
The core value proposition is **costly signaling made convenient**:
> When the recipient opens their physical mailbox, they must receive the unmistakable impression that the sender took the deliberate personal effort to visit an upscale boutique stationery shop, hand-select an exquisite card, sit down with a ballpoint pen to write a thoughtful personal note, address the envelope with their own return address, affix an authentic First-Class stamp, and drop it in the mail.

The sender gets the 60-second online convenience; the recipient gets a high-touch, intimate physical keepsake untainted by any hint of automated dropshipping.

### Proposed Experience Summary
- **Curated Ready-Made Cards Default:** Front-loads all 11 occasions in uncropped A2 proportion. AI image generation is relegated to an optional "Custom Studio Commission" branch.
- **Elevated Note Composer:** Structured Salutation, Message Body, and Sign-off fields immediately accessible with real-time character/line fit feedback.
- **Envelope-Anchored Address Step:** Recipient address first, followed by the sender's personal return address framed around physical envelope authenticity.
- **Verified Payment & Order Review:** Real-time Stripe Express Checkout Element detection replaces user-agent guessing, paired with a compact 4-point review card.
- **Post-Purchase Retention:** Occasion-tailored reminder opt-ins on confirmation (quiet check-in for sympathy vs. 14-day annual reminder for birthdays).

### Commercial Mechanism: Increasing Profitable Orders
We do not optimize for raw top-of-funnel clicks or unprofitable voucher volume. The economic objective is **Net Contribution per Visitor (CPV)**:
$$\text{CPV} = \frac{\sum (\text{Paid Gross Revenue} - \text{Stripe Fees} - \text{Handwrytten COGS} - \text{Discounts}) - \text{Ad Spend}}{\text{Total Unique Eligible Visitors}}$$
- **Deterministic Unit Economics:** Retail \$9.00 - Stripe fee \$0.56 (2.9% + \$0.30) - Handwrytten wholesale COGS \$4.88 (\$3.25 cardstock + \$0.25 inking + \$1.38 USPS stamp) = **\$3.56 Net Contribution Margin per Card (39.56%)**.
- **Conversion Velocity Target:** Reduce new-customer checkout friction from 145 seconds to $\le 65$ seconds, lifting paid conversion from an estimated baseline of $\sim 2.1\%$ to $\ge 3.8\%$.
- **LTV Flywheel:** Shifting occasion reminders to post-purchase increases contact capture without hurting initial checkout, scaling annual orders from 1.0 to 3.96 cards/year.

---

## 2. Verified Current State and Baseline

### Inspection Scope & Limitations
- **Inspected Commit:** `43dfc58` (October 1, 2026: *"fix(security): resolve transaction loop vulnerabilities (P0)"*).
- **Environment Evidence:** Source code, configuration files, test suites, and local mock-firestore store (`.data/mock-firestore.json`).
- **Limitation:** Live browser and production analytics access were restricted. Telemetry figures from the local store show zero live sessions. Therefore, all commercial uplift figures are structured as **testable hypotheses**, not assumed historical baselines.

### Categorized Evidence Table
| Area | Source Reference | Category | Verified Finding vs. Defect | Commercial Implication |
|---|---|---|---|---|
| **Wallet Detection** | `lib/device-wallet.ts#L23-L33` | **Verified Defect** | User-agent regex `/iPhone\|iPad\|iPod\|Macintosh/i` returns `"apple"` regardless of wallet setup. | Causes false expectations; failure on Touch ID/Face ID prompt induces drop-off. |
| **Card Dimensions** | `lib/handwrytten.ts#L208` vs `app/layout.tsx#L26` | **Verified Mismatch** | Code sets `dimension_id: 4` (Handwrytten A2 4.25" × 5.5"), but copy claims `5x7 folded cards`. | Customer expectation gap; potential refund risk upon delivery. |
| **Cardstock Spec** | `lib/handwrytten.ts` vs `app/layout.tsx#L16` | **Verified Inconsistency** | Site claims `120 lb archival cardstock`; Handwrytten standard A2 inventory is 100 lb cover. | Over-promising specs creates trust deficit with paper enthusiasts. |
| **Fulfillment Origin** | `app/privacy/page.tsx#L59` vs `lib/handwrytten.ts` | **Verified Defect** | Terms claim studio mailing operations in Lake Forest, IL; actual mailing is from Phoenix, AZ. | Legal vulnerability and operational inaccuracy. |
| **Catalog Coverage** | `lib/card-presets.ts#L299-L354` | **Verified Defect (Now Resolved)** | Originally only 6 presets existed; 5 occasions had zero ready-made cards. | Senders looking for Sympathy or Holidays bounced or suffered AI latency. |
| **Address Form Fields** | `components/AddressStep.tsx#L150-L500` | **Verified Friction** | 12 input fields across two desktop columns plus pre-purchase reminder forms. | High cognitive load; violates Baymard checkout form-field benchmarks. |
| **Delivery Cutoff** | `lib/delivery-estimate.ts#L39` | **Verified Defect** | Evaluates `now.getHours() >= 14` in local browser time without timezone conversion. | West Coast / East Coast customers receive inaccurate dispatch promises. |

---

## 3. Brand & Domain Strategy and Affected Deployments

### Dual-Brand Strategy: Two Separate Worlds
```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               THE DUAL-BRAND ARCHITECTURE                         │
│                                                                                   │
│   ASTER & BLANCHE (asterandblanche.com)         SENDMYNOTES (sendmynotes.com)     │
│   - The Luxury Stationery House                 - The Private Sender Utility      │
│   - Recipient-Facing Proof of Taste             - Sender-Facing 60-Sec Concierge  │
│   - Elegant Portfolio & Fine Art Backplate      - Fast, Frictionless Builder      │
│   - Left AS-IS per Founder Directive            - Direct Conversion Target        │
└───────────────────────────────────────────────────────────────────────────────────┘
```

1. **Aster & Blanche (`asterandblanche.com`):**
   - **Role:** High-end boutique letterpress and stationery imprint.
   - **Recipient Experience:** When the recipient turns the card over and sees the debossed-style colophon mark, they find an upscale stationery house that validates the pedigree of the gift.
   - **Status:** **Left as is.** It represents the aspirational design identity.
2. **SendMyNotes (`sendmynotes.com`):**
   - **Role:** The sender's private 60-second execution tool.
   - **Sender Experience:** Solves the friction of finding stationery, buying stamps, and locating a mailbox. The service fulfills using Aster & Blanche physical stationery.

### Affected Deployments & Infrastructure
- **Single Monorepo:** `/Users/zeke/code/sendmynotes` on branch `main`.
- **Backend Infrastructure:** Google Cloud Firebase App Hosting backend `sendmynotes` (Project ID: `sendmynotes-2a417`).
- **Domain Routing:** Next.js middleware routes requests by `Host` header:
  - `sendmynotes.com` -> Fast 60-second card builder funnel.
  - `asterandblanche.com` -> Curated stationery brand experience.
  - Both share underlying Stripe checkout, Firestore persistence, and Handwrytten API fulfillment.

---

## 4. Proposed Customer Journey & Annotated Concrete Designs

### A. Journey Architecture
```mermaid
flowchart LR
    S1["1. Ready-Made Selection<br/>(11 Occasions, True A2)"] --> S2["2. Letter Composition<br/>(Structured Fields, Fit Warning)"]
    S2 --> S3["3. Envelope Addresses<br/>(Recipient + Sender Return)"]
    S3 --> S4["4. Review & Verified Pay<br/>(Stripe Express Wallet / Card)"]
    S4 --> S5["5. Confirmation Stepper<br/>(Fulfillment Queue & Reminders)"]
```

> [!TIP] **Interactive Mockup Artifact & Visual Screenshot Gallery:**
> An interactive high-fidelity prototype and design showcase is available at:
> - Interactive Prototype & Showcase: [`target_experience_mockups.html`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/target_experience_mockups.html)
> - Screen 1 Mockup (Card Selection): [`screen1_selection_1791044640784.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/screen1_selection_1791044640784.jpg)
> - Screen 2 Mockup (Note Composition): [`screen2_composition_1791044657106.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/screen2_composition_1791044657106.jpg)
> - Screen 3 Mockup (Physical Envelope & Addresses): [`screen3_envelope_1791044673897.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/screen3_envelope_1791044673897.jpg)
> - Screen 4 Mockup (Review & Verified Payment): [`screen4_payment_1791044689815.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/screen4_payment_1791044689815.jpg)
> - Screen 5 Mockup (Confirmation & Retention Stepper): [`screen5_confirmation_1791044705325.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/screen5_confirmation_1791044705325.jpg)
> - Desktop Viewport Mockup (1200px): [`desktop_mockup_1791044734543.jpg`](file:///Users/zeke/.gemini/antigravity/brain/26a83f2d-e5c6-4276-ad0d-6080d08bf227/desktop_mockup_1791044734543.jpg)

---

### B. Concrete Screen Specifications (Mobile & Desktop)

#### Screen 1: Card Selection (Step 1)
- **Header:** Warm stationery ivory background (`#FAF8F5`). Aster & Blanche colophon badge top-left. Value banner: *"$9.00 Flat Rate • Real Pen Inking & First-Class USPS Postage Included"*.
- **Occasion Navigation:** Horizontal scrollable pill carousel with active count:
  `[All (11)] [Birthday] [Thank You] [Sympathy] [Thinking of You] [Congrats] [Anniversary] [Just Because] [Holidays]`
- **Primary Grid:** 2 columns on mobile (375px), 3 columns on desktop (1200px).
  - Cards displayed in true 5:7 vertical portrait format (A2 proportions) with 4px rounded corners and subtle drop shadow.
  - Each card shows: Card Title (e.g., *"Serene Olive Bough"*), Occasion tag, and subtle zoom preview icon.
- **Secondary Tab:** Discrete outline button at bottom: *"Commission Custom Artwork with Studio AI"* (opens generation modal with clear notice: *"Takes ~15s to paint with studio AI"*).
- **Mobile Sticky Action Bar:** Docked at viewport bottom:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ [Thumbnail] Serene Olive Bough • $9.00     [Write Note →]  │
  └─────────────────────────────────────────────────────────────┘
  ```

#### Screen 2: Note Composition & Penmanship (Step 2)
- **Top Section (The Letter Composer):**
  - **Salutation Field:** Input text box. Label: `Salutation / Recipient`. Placeholder: `Dear Eleanor,`. Prefills recipient name into address step.
  - **Message Body Textarea:** Auto-expanding multi-line textarea with subtle lined-paper ruling. Prefilled with relationship-safe default draft.
  - **Closing & Sign-off Field:** Input text box. Label: `Sign-off / Your Name`. Placeholder: `Warmly, Thomas`. Automatically prefills sender name on return address.
  - **Real-Time Fit Gauge:**
    `[●●●●●○○○○○] 185 / 450 characters (Fits beautifully on physical A2 leaf)`
    - *Warning State (>420 chars):* Yellow banner: *"Approaching card space limit."*
    - *Error State (>450 chars):* Red outline: *"Message will overflow physical card margins. Please trim 12 characters."*
- **Subordinate Styling (Accordion Below Note):**
  - Accordion 1: *“Handwriting Style”* (Defaults to `Casual David`). Shows 4 authentic robotic pen font samples.
  - Accordion 2: *“Need Inspiration?”* (Collapsed by default). Offers tone filters (Heartfelt, Warm, Brief, Poetic). Shuffling requires explicit confirmation before replacing user text.
- **Physical Authenticity Notice:**
  > *"All interior text is plotted in genuine ballpoint ink by automated precision pens—never digital imitation fonts or toner."*

#### Screen 3: Envelope Addresses (Step 3)
- **Visual Envelope Representation:** A clean representation of a physical envelope showing where each address appears.
- **Section 3A: Delivery Destination:**
  - Header: `1. Where should we mail your card? (Recipient)`
  - Fields:
    - First Name (Autofilled from Salutation if present) & Last Name (`autocomplete="shipping given-name family-name"`)
    - Street Address (`autocomplete="shipping address-line1"`)
    - Apartment, Suite, Unit (`+ Add Apartment / Suite` collapsed toggle)
    - City, State (2-letter dropdown), ZIP Code (`autocomplete="shipping postal-code"`)
- **Section 3B: Your Return Address (Essential Envelope Credential):**
  - Header: `2. Your Return Address (Sender)`
  - Explanatory Callout:
    > *"Penned in the top-left corner of the envelope so your recipient knows this card was sent personally by you, and USPS can return it if undeliverable."*
  - Fields:
    - First Name & Last Name (Autofilled from Sign-off)
    - Street Address, City, State, ZIP (`autocomplete="billing address-line1"`)
    - Single-tap Keychain / Browser autofill enabled.
- **Removed from Step 3:** Inline annual reminder pickers and address book enrollment are completely removed from checkout.

#### Screen 4: Review & Payment (Step 4)
- **Compact Physical Review Card:**
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ [Card Thumb]  Serene Olive Bough                            │
  │               "Dear Eleanor, Sending you strength and..."   │
  │               -------------------------------------------   │
  │               📬 Deliver To: Eleanor Vance, Denver, CO      │
  │               ✉️ Return From: Thomas Miller, Chicago, IL     │
  │               🚚 Est. USPS Arrival: Wed, Oct 8 – Fri, Oct 10│
  │               💵 Total Due: $9.00 Flat (Postage Included)   │
  └─────────────────────────────────────────────────────────────┘
  ```
- **Verified Payment Elements:**
  - **Dynamic Wallet Button:** Queries `stripe.paymentRequest.canMakePayment()`. Renders `<ExpressCheckoutElement />` (Apple Pay on Safari/iOS, Google Pay on Chrome/Android) **only when verified available**.
  - **Divider:** *“— Or pay with card —”*
  - **Standard Card Form:** Clean Stripe `<PaymentElement />` (Card number, MM/YY, CVC, ZIP).
  - **Promo Code:** Collapsed behind subtle text link: `+ Have a voucher or promo code?`. Clicking opens a compact inline input.

#### Screen 5: Confirmation & Retention Flywheel (Step 5)
- **Order Status Stepper:**
  - `[✓] Payment Confirmed ($9.00)`
  - `[●] Queued for Precision Pen Inking (Phoenix Fulfillment)`
  - `[○] USPS Dispatch Scheduled: Monday Morning`
  - `[○] Estimated USPS First-Class Arrival: Oct 8 – Oct 10`
- **Occasion-Tailored Retention Prompt:**
  - *If Birthday:* `Never miss Eleanor's birthday next year. [Send Me an Annual Reminder]` (1-click email opt-in, zero password required).
  - *If Sympathy:* `Would you like to send a quiet follow-up note in 3 months? [Save Reminder]`.
  - *If General:* `Save Eleanor to your private address book for future cards. [Save Contact]`.
- **Secondary Action:** `[Send Another Card →]`.

---

### C. Mobile Keyboard & Small Screen Behavior (320px–430px)
- **Viewport Hardening:** Certified across iPhone SE (320px/375px), iPhone 15/16 (393px), and Pro Max (430px).
- **Virtual Keyboard Management:**
  - Active input field automatically scrolls into view with `scrollIntoView({ behavior: 'smooth', block: 'center' })`.
  - The mobile sticky action bar docks cleanly above the virtual keyboard or auto-hides during active typing to maximize viewport real estate.
  - Zero horizontal overflow (`overflow-x: hidden` enforced on root container).
- **Accessibility & Touch Standards:**
  - Minimum touch target: 44 × 44 pt for all buttons, inputs, and cards.
  - Contrast ratio: Minimum 4.5:1 for body copy against `#FAF8F5` background.
  - Explicit `<label for="...">` associations on all form elements.

---

## 5. Asset Retain / Replace / Add Plan

| Asset | Path | Classification | Action | Rationale |
|---|---|---|---|---|
| **Aster & Blanche Backplate** | `public/aster-blanche-backplate.png` | Colophon Mark | **RETAIN** | Authentic stationery press mark on reverse leaf. Handwrytten ID `751314`. |
| **Existing 6 Preset Covers** | `public/presets/*.jpg` | Digital Art | **RETAIN** | Preserves high-performing existing art (Balloons, Botanical, etc.). |
| **New 5 Preset Covers** | `public/presets/{sympathy,justbecause,holiday,easter,halloween}*.jpg` | Digital Art | **ADDED & VERIFIED** | Resolves catalog gaps for Sympathy, Just Because, Christmas, Easter, Halloween. |
| **Physical Product Photography** | External Dependency | Physical Proof | **INGEST WHEN PROVIDED** | **No new cards will be ordered.** Founder will provide photography when available. Build pipeline scaffolds responsive `<picture>` slots. |
| **Handwriting Vector Fonts** | `public/fonts/hw*.ttf` | Font Assets | **RETAIN** | Authentic Handwrytten mechanical plotting fonts (`hwDavid`, `hwKate`, `hwAdam`, `hwChase`, `hwWill`). |
| **Ad Creative Assets** | `public/ad-assets/` | Marketing Assets | **UPDATE SLOTS** | Prepares multi-ratio asset containers (1.91:1, 1:1, 4:5) ready for founder photography. |

---

## 6. Proposed Copy & Verified Product / Delivery Facts

### Verified Source of Product Facts
- **Format:** A2 Folded Greeting Card (4.25" × 5.5" folded, 8.5" × 5.5" flat spread).
- **Cardstock:** Premium 100 lb textured cover stock.
- **Inking Instrument:** Precision mechanical plotter using authentic ballpoint pens with archival ink.
- **Enclosing:** 70 lb matching envelope with genuine USPS First-Class postage stamp.
- **Envelope Return Address:** The sender's personal return address.
- **Fulfillment Facility:** Automated fulfillment center in Phoenix, AZ.
- **Design Studio:** Aster & Blanche Press, Lake Forest, IL (curation and stationery imprint).

### Operational Delivery SLA Policy
- **Daily Cutoff Time:** **2:00 PM Eastern Time (11:00 AM Mountain / Facility Time)** Monday through Friday.
- **Inking & Dispatch Schedule:**
  - Orders placed before 2:00 PM ET dispatch the next business day.
  - Orders placed after 2:00 PM ET dispatch within 2 business days.
  - Weekend orders dispatch Tuesday.
- **USPS Transit Window:** 3 to 5 business days nationwide. (Excludes Sundays and federal postal holidays).

### Canonical Customer Copy Matrix
- **Hero Statement:** *"Real pen-on-paper cards, written and mailed for you in 60 seconds."*
- **Pricing Guarantee:** *"$9.00 flat rate. Card, real ballpoint inking, envelope, and First-Class USPS postage included."*
- **Return Address Field Notice:** *"Penned on the envelope so your recipient knows this card was sent personally by you."*
- **Delivery Guarantee:** *"Orders placed before 2 PM ET are inked and stamped for USPS dispatch next business day. Estimated delivery is 3–5 business days from dispatch."*
- **Error Messages:**
  - *Address Validation:* "USPS could not verify this street address. Please double-check the street number and ZIP code."
  - *Card Declined:* "Your card was declined by the issuer. Please check your card details or try another payment method."
  - *Message Overflow:* "Your message exceeds the 450-character limit to fit neatly on an A2 card leaf. Please trim [X] characters."

---

## 7. Criterion-by-Criterion Acceptance Matrix

| Criterion | Current State | Proposed Change | Screen Reference | Validation Method | Owner | Unresolved Dependency |
|---|---|---|---|---|---|---|
| **A. Brand & First Impression** | Inconsistent claims; conflated domains | Preserve Aster & Blanche as luxury stationery imprint; SendMyNotes as convenience service | Screen 1 & Headers | Founder brand sign-off | Product Lead | None |
| **B. Product Proof & Accuracy** | No real photos in repo | Scaffold responsive picture elements ready for founder-provided photography | Screen 1 & Product Modal | Asset pipeline linting | Frontend Lead | Founder photography delivery |
| **C. Ready-Made Primacy** | AI generator inputs prominent | Curated cards default for all 11 occasions; AI moved to optional commission tab | Screen 1 (Catalog) | 11-occasion catalog verification | Design Lead | Completed (all 11 presets installed) |
| **D. Personal Note & Style** | Textarea buried under inspirations | Note textarea at top (Salutation, Body, Sign-off); safe defaults; live fit indicator | Screen 2 (Composer) | Note-fit boundary test | Frontend Lead | None |
| **E. Mobile Progression & A11y** | Long scrolling; no sticky CTA; keyboard shifts | Persistent sticky bottom action bar ($9.00 total + next step); 44px touch targets; WCAG AA | Screens 1–4 (Mobile) | Lighthouse a11y score $\ge 95$ | Frontend Lead | None |
| **F. Address Entry** | Confusing 12-field grid; pre-purchase reminders | Clear recipient form + envelope-framed sender return address; prefill from sign-off | Screen 3 (Addresses) | Time-to-complete test (<25s) | Fullstack Lead | None |
| **G. Payment & Final Review** | Fake UA wallet detection; expanded promo field | Verified Stripe Express Checkout; compact card/envelope review card | Screen 4 (Review & Pay) | Real iOS & Android device check | Fullstack Lead | Live Apple Pay domain association check |
| **H. Delivery Promises** | Inconsistent SLA; local time cutoff | 2 PM ET cutoff engine; holiday exclusion; unified 3–5 business day copy | Screen 4 & Layout | Cutoff & holiday unit test | Backend Lead | None |
| **I. Occasion Landings** | Duplicate headers pushing builder down | Clean occasion landings connecting ad intent directly to card and note | Programmatic Routes | Bounce & scroll depth tracking | Marketing Lead | None |
| **J. Confirmation Flywheel** | Repetitive birthday nudges | Occasion-tailored post-purchase reminders (birthday annual vs sympathy quiet check-in) | Screen 5 (Confirmation) | Test suite (`card-intent.test.ts`) | Product Lead | Email templates |

---

## 8. Measurement and Commercial Experiment Plan

### Economic Optimization Model
We establish that the rework produces more profitable orders by optimizing **Net Contribution per Visitor (CPV)** rather than vanity metrics:
$$\text{CPV} = \frac{\sum (\text{Gross Revenue} - \text{Stripe Fees} - \text{Handwrytten COGS} - \text{Discounts}) - \text{Ad Spend}}{\text{Total Unique Eligible Visitors}}$$

- **Baseline Margin per Card:**
  $$\text{Margin} = \$9.00 - \$0.56 - \$4.88 = \mathbf{\$3.56\text{ (39.56\% net margin)}}$$
- **Break-Even CPA:** **\$3.56**. Every acquired paid order under \$3.56 is immediately profitable on Day 1.

### Funnel Telemetry & Deduplication
To guarantee attribution integrity without capturing customer PII or note content, events are dispatched via `lib/telemetry.ts` and tied to server-verified, deduplicated orders:
```typescript
export type FunnelEvent =
  | { name: "funnel_started"; occasion: string; source: string }
  | { name: "card_selected"; cardId: string; isPreset: boolean }
  | { name: "note_edited"; characterCount: number; fontId: string }
  | { name: "address_completed"; hasReturnAddress: boolean }
  | { name: "wallet_availability_detected"; applePay: boolean; googlePay: boolean }
  | { name: "payment_initiated"; method: "wallet" | "card" | "voucher" }
  | { name: "order_verified"; orderId: string; amountCents: number; dedupeToken: string }
  | { name: "fulfillment_queued"; hwOrderId: string }
  | { name: "reminder_opt_in"; occasionType: string };
```
- **Deduplication Safeguard:** A unique `dedupeToken` is generated per checkout session and stored in `sessionStorage`. Subsequent confirmation page reloads cannot trigger duplicate purchase conversions in Google Ads or analytics.

### Sequential Experiment Design (Handling Low Traffic)
If traffic volume is modest, a standard A/B test would require months to reach statistical power. We deploy a **Sequential Testing Framework** with predefined stopping rules:
- **Sample Size Target:** Minimum 400 completed orders per variant to detect a 25% relative uplift in conversion rate ($\alpha = 0.05, 1 - \beta = 0.80$).
- **Minimum Observation Window:** 14 calendar days (capturing two full weekend cycles).
- **Decision Rules:**
  - *Scale / Declare Win:* Variant CPV > Control CPV with $p < 0.05$ and guardrail metrics green.
  - *Early Stop (Stop-Loss):* If payment error rate exceeds 2.5% or fulfillment failure rate exceeds 1.0% over any 48-hour window, the variant is paused.

---

## 9. Delivery Plan: Sprints, Gates, Rollout, and Rollback

> **Critical Architecture Gate:** Sprint 0 contains **ZERO UI changes**. All code and UI modifications are moved behind formal founder approval of this proposal.

```mermaid
flowchart TD
    subgraph PreApproval ["Pre-Implementation (Current Phase)"]
        P1["Proposal Package Submission"]
        P2["Founder Review & Formal Approval"]
    end

    subgraph Sprint0 ["Sprint 0: Read-Only Audit & Baseline (3 Days)"]
        S0_1["Live HTTP & Deployment Provenance Audit"]
        S0_2["Canonical Product Spec Sheet Finalization"]
        S0_3["Baseline Telemetry Logging (Read-Only)"]
    end

    subgraph ImplementationGated ["Implementation Phase (Post-Approval)"]
        S1["Sprint 1: Delivery Policy & Stripe Wallet Engine (4 Days)"]
        S2["Sprint 2: Ready-Made Catalog & Composer UX (5 Days)"]
        S3["Sprint 3: Address Entry & Mobile Sticky Bar (4 Days)"]
        S4["Sprint 4: Confirmation Flywheel & Telemetry Sync (4 Days)"]
        S5["Sprint 5: Staged Rollout & Commercial Validation (14 Days)"]
    end

    P1 --> P2
    P2 --> Sprint0
    Sprint0 --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
```

### Sprint 0: Read-Only Evidence Baseline, Spec Alignment & Live Audit
- **Scope:** **Strictly Read-Only.** Zero UI, template, or code modifications.
- **Target Duration:** 3 Days
- **Tasks:**
  1. **Task 0.1 (Deployment Audit):** Audit live DNS, SSL certificates, and Firebase App Hosting deployments for `sendmynotes.com` and `asterandblanche.com`.
  2. **Task 0.2 (Spec Alignment):** Lock down canonical specification sheet (`docs/CANONICAL_PRODUCT_SPECS.md`): A2 card format (4.25" × 5.5"), 100 lb cardstock, Phoenix AZ facility inking, Eastern Time 2 PM cutoff.
  3. **Task 0.3 (Baseline Telemetry):** Query live Firestore order records to establish 30-day pre-rework conversion and contribution benchmarks.
- **Validation Gate:**
  - `npm run test:security` and `npm run test:margins` pass.
  - Verification: Founder sign-off on baseline specifications.

### Sprint 1: Delivery Policy, Timezone Engine & Stripe Express Checkout
- **Scope:** Operational delivery calculation and verified wallet payment integration.
- **Target Duration:** 4 Days
- **Tasks:**
  1. **Task 1.1:** Refactor `lib/delivery-estimate.ts` to enforce 2:00 PM ET cutoff, weekend dispatch logic, and USPS federal holiday calendar.
  2. **Task 1.2:** Rewrite `lib/device-wallet.ts` to eliminate user-agent regex and query confirmed wallet availability via Stripe Elements.
  3. **Task 1.3:** Verify `.well-known/apple-developer-merchantid-domain-association` route for both domains.
  4. **Task 1.4:** Collapse promo code field behind secondary text trigger in `components/CheckoutStep.tsx`.
- **Validation Gate:**
  - Automated tests in `tests/delivery-cutoff.test.ts` pass 100%.
  - Physical iOS Safari and Android Chrome verification confirming active wallets.

### Sprint 2: Ready-Made Catalog Primacy & Inside Note Streamlining
- **Scope:** Catalog front-loading and note composer re-architecture.
- **Target Duration:** 5 Days
- **Tasks:**
  1. **Task 2.1:** Verify all 11 ready-made card presets in `lib/card-presets.ts`.
  2. **Task 2.2:** Reorder `components/CoverStep.tsx` so curated cards are default and GenAI prompt is moved to an optional commission tab.
  3. **Task 2.3:** Redesign `components/InsideNoteStep.tsx` to put Salutation, Body, and Sign-off fields at the top.
  4. **Task 2.4:** Replace intimate defaults (e.g., romantic anniversary) with relationship-safe sentiments.
  5. **Task 2.5:** Add real-time line/character fit warning to prevent text exceeding card margins.
- **Validation Gate:**
  - `npm run test:thematic` and `tests/note-fit.test.ts` pass.
  - Responsive screenshot verification across mobile and desktop.

### Sprint 3: Address Entry Streamlining & Mobile Sticky Bar
- **Scope:** Address flow optimization and mobile navigation.
- **Target Duration:** 4 Days
- **Tasks:**
  1. **Task 3.1:** Re-architect `components/AddressStep.tsx` into a clean sequence: Recipient Address first, followed by Sender Return Address framed around physical envelope authenticity.
  2. **Task 3.2:** Automatically prefill sender name from the note sign-off; enable standard HTML5 address autofill.
  3. **Task 3.3:** Build persistent mobile bottom navigation bar showing step, total ($9.00), and primary CTA.
  4. **Task 3.4:** Build `CompactReviewCard.tsx` in `components/CheckoutStep.tsx` displaying card, note excerpt, envelope preview, and arrival window.
- **Validation Gate:**
  - Synthetic form submission tests simulating browser autofill.
  - Lighthouse Accessibility score $\ge 95$ (WCAG 2.1 AA).

### Sprint 4: Confirmation Flywheel, Telemetry & Photography Pipeline
- **Scope:** Retention flywheel, analytics sync, and founder photography ingestion.
- **Target Duration:** 4 Days
- **Tasks:**
  1. **Task 4.1:** Refactor `app/order/[id]/page.tsx` with clear status stepper and occasion-tailored reminder opt-ins.
  2. **Task 4.2:** Ensure `lib/telemetry.ts` dispatches deduplicated conversion events without transmitting PII.
  3. **Task 4.3:** Verify responsive picture elements are ready to accept high-res photography from the founder without code changes.
- **Validation Gate:**
  - `npm run test:intent` and `npm run test:sync` pass.
  - End-to-end synthetic order verification through payment, Firestore, and Handwrytten API formatting.

### Sprint 5: Staged Rollout, Traffic Ramp & Commercial Validation
- **Scope:** Preview deployment, traffic ramp, and guardrail monitoring.
- **Target Duration:** 14 Days (Observation Window)
- **Tasks:**
  1. **Task 5.1:** Deploy to Firebase App Hosting preview channel; test live transactions on both domains.
  2. **Task 5.2:** Ramp traffic: 10% on Day 1, 50% on Day 4, 100% on Day 7 if all error metrics remain green.
  3. **Task 5.3:** Monitor contribution margin, payment completion rates, and fulfillment exceptions in real time.
- **Rollback Safeguard:**
  - Automated rollback to commit `43dfc58` triggered if payment failures exceed $2.5\%$ or fulfillment exceptions exceed $1.0\%$ over any 6-hour window.

---

## 10. Risks, Unknowns, and Founder Decisions

### Locked Principles
1. **Separate Brand Identity:** Aster & Blanche is preserved as the high-end boutique stationery press; SendMyNotes is the convenience sending service. Aster & Blanche remains as is.
2. **Sender Return Address Preserved:** Every card envelope will feature the sender's own return address to maintain the authentic personal gesture.
3. **No Card Orders:** No physical sample cards will be ordered from Handwrytten. The engineering pipeline will ingest founder-provided photography when available.
4. **Approval Gate:** Sprint 0 is strictly read-only. Zero UI or implementation code changes occur until formal founder sign-off on this proposal.

### Founder Review Checkpoint
- **Proposal Sign-Off:** Review the concrete screen specifications, verified SLA promises, and CPV commercial measurement framework above.
- **Ready for Dispatch:** Upon approval, agents will be dispatched to execute **Sprint 0: Read-Only Evidence Baseline & Live Audit**.
