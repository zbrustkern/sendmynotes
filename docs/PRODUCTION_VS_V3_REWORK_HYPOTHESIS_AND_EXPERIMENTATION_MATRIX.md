# Production (v2) vs. Rework (v3) Experimentation Matrix & Hypothesis Scaffolding

**Author:** System Architecture & Experimentation Lead  
**Date:** October 3, 2026  
**Status:** Living Engineering Document & A/B Scaffolding Specification  
**Scope:** `sendmynotes.com` Core Purchase Journey & Feature Flag Switchboard

---

## 1. Executive Summary & Philosophy

This document provides a comprehensive, rigorous architectural comparison between the **Production Baseline (v2 Vending Machine)** at commit `43dfc58` and the **New Target Experience (v3)** implemented under feature flag `reworkV3Experience` (accessible at `/new`).

Per founder directive, **every design modification introduced in v3 is treated as an explicit, parameterizable commercial hypothesis**—not dogmatic truth. While the v3 rework is rooted in consumer psychology, costly signaling theory, and physical fulfillment realities, this document establishes the exact engineering scaffolding necessary to parameterize, measure, and validate every change via controlled A/B testing.

### Core Business North Star
The ultimate optimization metric across all experiments is:

$$\text{Net Contribution Per Visitor (CPV)} = \frac{\text{Gross Revenue} - (\text{Stripe Fees} + \text{Fulfillment COGS} + \text{AI Compute} + \text{Discounts} + \text{Refunds})}{\text{Unique Funnel Visitors}}$$

A change that increases top-of-funnel conversion by 20% but doubles custom generation compute costs or results in higher refund rates due to unexpected card sizing can reduce CPV. Every experiment parameter below maps directly to its financial impact.

---

## 2. Comprehensive Comparison: Production (v2) vs. Rework (v3)

| Dimension | Production Baseline (v2) | Rework Target Experience (v3) | Primary Rationale & Hypothesis |
|---|---|---|---|
| **Catalog Architecture** | Prompt-first AI generation with optional preset pills below prompt input. | Ready-made curated 11-occasion catalog first; AI custom generation relegated to an optional branch. | **Hypothesis 1:** Eliminating the mandatory 25–40s AI generation wait reduces initial drop-off and increases Step 1 $\to$ Step 2 progression. |
| **AI Custom Optionality** | Primary interface; user must wait for image synthesis or click small presets. | Curated cards dominate screen; bespoke AI commission accessible via dedicated secondary drawer. | **Hypothesis 2:** AI generation is a high-intent branch; presenting it as an optional upgrade prevents choice paralysis for standard gift senders. |
| **Brand Decoupling** | Mixed branding; "Aster & Blanche Atelier" and "A&B" badges appear throughout SendMyNotes web interface. | Pure SendMyNotes web utility; Aster & Blanche branding stripped entirely from the website and reserved strictly for the physical colophon hallmark on the card. | **Hypothesis 3:** Two brands on one website creates confusion for the sender. Senders need a frictionless sending utility; the recipient discovers Aster & Blanche prestige when holding the card. |
| **Cardstock Specification** | Inconsistent copy; drifted between 100 lb and 120 lb across different steps and marketing pages. | Unified standard: **120 lb Archival Cover Cardstock** (~325 gsm) across all marketing, legal, and UI copy. | **Hypothesis 4:** 120 lb cardstock communicates bespoke luxury (wedding invitation feel) justifying the $9 flat rate, whereas 100 lb feels like corporate collateral. |
| **Physical Envelope & Return Address** | Generic form inputs; no visual envelope; return address treated as an afterthought or warehouse address. | 2D tactile physical cream envelope preview; prominent Sender Personal Return Address in top-left; USPS First-Class stamp. | **Hypothesis 5:** Costly signaling depends on the recipient believing the sender mailed the card personally. The personal return address is the emotional boundary protecting this veneer. |
| **Letter Composition** | Single freeform textarea; unconstrained character count; generic font dropdown. | Structured 3-field letter composer (Salutation, Lined Canvas, Sign-off); live 450-character physical fit meter; 4 robotic pen styles. | **Hypothesis 6:** Structuring the note into natural letter components reduces blank-canvas anxiety. Enforcing a 450-char fit cap prevents text from overflowing physical card leaf margins. |
| **Checkout & Wallets** | User-agent regex spoofing Apple Pay button; static inputs; prominent coupon field. | Verified Stripe Express Checkout Element (Apple Pay/Google Pay only when device-ready); collapsed promo link. | **Hypothesis 7:** Showing non-functional Apple Pay buttons damages trust. Collapsing the promo code prevents discount-hunting abandonment. |
| **Post-Purchase Flow** | Static order summary; basic tracking; immediate prompt to create an account. | 4-stage fulfillment stepper (Payment $\to$ Inking in Phoenix $\to$ Stamped $\to$ Delivery); 1-click occasion reminder without password. | **Hypothesis 8:** Transparency regarding robotic pen plotting and delivery dates reduces support inquiries ("Where is my card?") and increases 30-day repeat send rate. |

---

## 3. Detailed Justifications for Each Change

### 3.1 Card Catalog Architecture (Ready-Made First vs. Prompt-First)
* **The Problem in v2:** When a visitor lands on v2, they are greeted by an empty prompt box asking them to "Describe your ideal card cover." This creates high cognitive friction ("What should I type?") followed by high latency (15–30s waiting for AI painting). Casual gift senders who just need a tasteful birthday card abandon during generation.
* **The v3 Solution:** Displays an instant 2-column (mobile) or 3-column (desktop) grid of 11 curated occasion cards in true vertical A2 format (4.25" × 5.5", 5:7 ratio). Instant zero-latency selection.
* **The Commercial Risk (Founder's Concern):** Some customers may value the bespoke nature of AI creation as the primary hook. If we hide or diminish the AI generator too much, we risk losing visitors who came specifically to commission a custom card.

### 3.2 AI Custom Optionality Placement
* **The Problem in v2:** Custom generation is treated as the default, forcing generation compute costs on every visitor even if they just wanted a simple sympathy note.
* **The v3 Solution:** Ready-made cards are primary, but a secondary module (*"Looking for something bespoke? + Commission custom artwork with Studio AI (~15s)"*) opens a slide-over drawer with prompt suggestions.
* **The Hypothesis to Test:** We must test whether placing the AI generator in:
  1. A separate top-level tab (`[Ready-Made Cards] | [Commission Custom AI]`),
  2. A secondary button below the catalog, or
  3. A dedicated tile inside the catalog grid (`[ + Paint a Custom Card ]`)
  maximizes completed checkouts without cannibalizing ready-made volume.

### 3.3 Brand Decoupling (Pure SendMyNotes vs. Aster & Blanche Dual Branding)
* **The Problem in v2:** Senders on `sendmynotes.com` were confronted with "Aster & Blanche Atelier," "A&B" logos, and Lake Forest press badges. Senders were confused about who they were dealing with.
* **The v3 Solution:** Complete separation:
  * **`sendmynotes.com`:** The private, discrete, modern online service used by the *sender*. Clean, high-speed, modern typography, zero pretension.
  * **Aster & Blanche Press:** The *physical imprint* that appears solely on the physical card's reverse leaf (Handwrytten backplate ID `751314`). When the recipient opens the envelope, they see an authentic luxury stationery hallmark, validating the high quality of the gesture.
* **Justification:** Dual-branding on the web breaks the sender's mental model. Senders don't need to be sold on Aster & Blanche; they need a 60-second card sending tool.

### 3.4 Cardstock Weight Specification (120 lb vs. 100 lb)
* **The Problem:** Inconsistent marketing copy. The site header claimed 120 lb, while recent UI updates claimed 100 lb.
* **The v3 Solution:** Unified strictly to **120 lb Archival Cover Cardstock** (~325 gsm).
* **Justification:** 100 lb cover is 270 gsm—adequate, but noticeably flexible. 120 lb cover is 324 gsm—thick, rigid, and substantial. Because Handwrytten uses robotic plotters with genuine ballpoint pens, heavy downward mechanical pressure is applied. 120 lb stock absorbs pen point pressure without debossing or curling the reverse side. Furthermore, consumers perceive 120 lb as artisanal stationery, justifying the $9.00 price point.

### 3.5 Envelope Addressing & The Personal Veneer
* **The Problem in v2:** Addresses were collected in generic form fields without visual context. The return address was often misunderstood as a billing address or suggested as a studio warehouse return.
* **The v3 Solution:** Renders a 2D physical cream envelope with the sender's return address penned in the top-left, First-Class stamp top-right, and recipient centered.
* **Justification (The Costly Signaling Principle):** The core emotional value of SendMyNotes is the *veneer of high personal effort*. The recipient must believe the sender personally bought the card, wrote it, stamped it, and mailed it. A corporate warehouse return address destroys this illusion. Penned personal return addresses are non-negotiable.

### 3.6 Structured Letter Composition & Real-Time Fit Gauge
* **The Problem in v2:** Senders typed into an unruled text box. Long messages were clipped or shrunk during physical plotting, leading to unreadable cards or fulfillment failures.
* **The v3 Solution:** Three distinct fields:
  1. *Salutation / Recipient* (`Dear Eleanor,`) $\to$ auto-fills recipient name in Step 3.
  2. *Letter Body* (Lined stationery canvas in handwriting font) $\to$ capped at 450 characters with a live progress gauge (warning at 420 chars).
  3. *Closing & Sign-off* (`Warmly, Thomas`) $\to$ auto-fills sender return name in Step 3.
* **Justification:** Guarantees that whatever the customer types will fit onto an A2 card leaf (4.25" × 5.5") at Handwrytten's physical plotter font size without overflowing. Auto-sync eliminates duplicate typing in Step 3.

### 3.7 Verified Stripe Express Checkout vs. Spoofed Buttons
* **The Problem in v2:** The site attempted to render an Apple Pay button based solely on User-Agent regex (`/iPhone|Macintosh/i`). If a user on Mac Chrome clicked it, it failed or fell back awkwardly.
* **The v3 Solution:** Uses Stripe's `@stripe/react-stripe-js` `<ExpressCheckoutElement />`, which queries `paymentRequest.canMakePayment()`. Apple Pay or Google Pay renders **only** when verified active by the hardware wallet. Standard card form renders below with collapsed promo code link.
* **Justification:** Broken wallet buttons destroy conversion instantly. Collapsing promo codes prevents coupon abandonment.

### 3.8 4-Stage Fulfillment Stepper & Retention Flywheel
* **The Problem in v2:** After payment, customers saw a basic confirmation and an intrusive "Create Account" modal, causing post-purchase anxiety and low retention.
* **The v3 Solution:** Shows a clear 4-stage fulfillment stepper (*Payment Confirmed $\to$ Inking in Phoenix Facility $\to$ USPS Stamped $\to$ Delivery Range*). Offers a 1-click annual email reminder tailored to the occasion (e.g. Eleanor's birthday next year) without requiring a password.
* **Justification:** Reassures the customer regarding physical manufacturing timelines and initiates the annual retention loop with zero friction.

---

## 4. Experimentation Architecture & Parameter Schema

To test every change as an independent or multivariate hypothesis, the application supports the following parameter dictionary in `lib/feature-flags.ts`:

```typescript
export interface ReworkExperimentParameters {
  /**
   * Experiment 1: Catalog Entry Architecture
   * Controls what the user sees upon landing on the card selection step.
   */
  catalog_entry_mode: "ready_made_first" | "ai_prompt_first" | "split_equal_tabs";

  /**
   * Experiment 2: AI Custom Optionality Prominence
   * Controls the visibility and styling of the AI custom generation pathway.
   */
  ai_commission_prominence: 
    | "secondary_drawer_button" // v3 Default: Discrete button below ready-made grid
    | "top_hero_banner"         // Prominent banner above catalog
    | "integrated_catalog_tile" // Card inside the grid: "+ Commission Custom Card"
    | "split_nav_tab"           // Equal weight tab at top of page
    | "hidden";                 // Ready-made only

  /**
   * Experiment 3: Brand Identity Exposure
   * Controls whether Aster & Blanche branding is exposed to the sender on the website.
   */
  brand_identity_mode: 
    | "pure_sendmynotes"        // v3 Default: SendMyNotes only; A&B strictly on physical card colophon
    | "co_branded_atelier"      // "SendMyNotes powered by Aster & Blanche Press"
    | "aster_and_blanche_first";// "Aster & Blanche Atelier" primary

  /**
   * Experiment 4: Cardstock Weight Marketing Claim
   * Tests consumer perception and conversion impact of cardstock specifications.
   */
  cardstock_copy_variant: 
    | "luxury_120lb"            // v3 Default: "Luxury 120 lb Archival Cardstock"
    | "heavy_100lb"             // "Heavy 100 lb Cardstock"
    | "unweighted_luxury";      // "Heavy Archival Cotton Cardstock" (no weight specified)

  /**
   * Experiment 5: Letter Composer Ergonomics
   * Tests structured letter fields vs. freeform textarea.
   */
  composer_structure_mode: 
    | "structured_three_field"  // v3 Default: Salutation + Body + Sign-off (auto-syncs to envelope)
    | "freeform_single_box";    // v2 Legacy: Single open textarea

  /**
   * Experiment 6: Physical Character Fit Gauge
   * Tests strict physical fit enforcement vs. warning-only.
   */
  fit_gauge_behavior: 
    | "live_gauge_hard_cap_450" // v3 Default: Progress bar, warn at 420, hard cap at 450
    | "soft_warning_no_cap"     // Warn at 450, allow overflow
    | "unconstrained";          // No character count shown

  /**
   * Experiment 7: Envelope Visual Realism
   * Tests tactile envelope preview vs. standard form inputs.
   */
  envelope_presentation_mode: 
    | "tactile_2d_envelope"     // v3 Default: Cream envelope with return address and stamp
    | "clean_form_inputs_only"; // Standard address form without envelope preview

  /**
   * Experiment 8: Promo Code Visibility
   * Tests collapsed link vs. open input field.
   */
  promo_code_visibility: 
    | "collapsed_text_link"     // v3 Default: "+ Have a voucher or promo code?"
    | "expanded_input_field";   // Open input box next to payment
}
```

---

## 5. Experiment Protocols & Decision Matrix

### Experiment A: Ready-Made vs. AI Custom Optionality (P0 Priority)

> **Founder Context:** This is the most critical commercial question. Does leading with ready-made cards increase speed-to-checkout, or does it diminish the unique AI-generated value proposition that attracted the visitor?

* **Hypothesis Statement:**
  * $H_0$: Visitors presented with ready-made cards first convert at the same or lower rate as visitors presented with custom AI generation first.
  * $H_1$: Leading with ready-made cards reduces time-to-first-selection from 42s to under 8s, increasing Step 1 $\to$ Step 2 progression by $\ge 35\%$ and overall Net Contribution Per Visitor (CPV) by $\ge 20\%$.
* **Variants:**
  * **Variant A (Ready-Made First + Drawer):** Current v3. 11 occasion cards shown immediately; AI generation accessible via secondary button below the grid.
  * **Variant B (Prompt-First):** Production v2. Prominent prompt input box with AI generation queue; preset cards shown as tiny chips below.
  * **Variant C (Dual-Mode Split Tabs):** Equal top tabs: `[ Choose from 11 Ready-Made Cards ]` vs. `[ Paint a Custom Card with AI ]`.
* **Primary Metric:** Funnel Completion Rate ($\text{Paid Orders} / \text{Visitors landing on Step 1}$).
* **Secondary Metrics:**
  * Step 1 $\to$ Step 2 Drop-off Rate.
  * Average Time to Complete Step 1 (seconds).
  * AI Generation GPU Cost per Visitor (cents).
* **Guardrail Metrics:**
  * Refund Request Rate (must stay $< 1.0\%$).
  * User Satisfaction Score on post-order survey.
* **Sample Size & Runtime:**
  * Baseline Conversion: 3.5%
  * Minimum Detectable Effect (MDE): 25% relative uplift (3.5% $\to$ 4.38%)
  * Required Sample Size: 2,800 visitors per variant ($\alpha = 0.05, \beta = 0.80$).
  * Estimated Runtime: 3–4 weeks at current baseline traffic.

---

### Experiment B: Brand Decoupling (Pure SendMyNotes vs. Aster & Blanche Web Exposure)

* **Hypothesis Statement:**
  * $H_0$: Mentioning "Aster & Blanche Press" on the SendMyNotes website increases trust and perceived prestige.
  * $H_1$: Mentioning "Aster & Blanche Press" on the SendMyNotes website creates brand confusion and distraction, reducing checkout velocity and trust. Senders convert higher when SendMyNotes is presented as a dedicated, private sending tool.
* **Variants:**
  * **Variant A (Pure SendMyNotes):** v3 implementation. Zero mention of Aster & Blanche on web; Aster & Blanche exists solely as the physical hallmark on the manufactured card backplate.
  * **Variant B (Co-Branded):** "SendMyNotes by Aster & Blanche Atelier" prominently featured in the header and checkout summary.
* **Primary Metric:** Checkout Conversion Rate ($\text{Completed Payments} / \text{Step 4 Views}$).
* **Guardrail Metric:** Recipient Perception / Net Promoter Score (tested via follow-up recipient feedback QR code).

---

### Experiment C: Cardstock Weight Perception (120 lb vs. 100 lb)

* **Hypothesis Statement:**
  * Explicitly stating "Luxury 120 lb Archival Cardstock" conveys artisanal weight, reducing price resistance to the $9.00 flat rate compared to "Heavy 100 lb Cardstock" or generic "Cardstock".
* **Variants:**
  * **Variant A:** "Luxury 120 lb Archival Cardstock • Real Ballpoint Inking".
  * **Variant B:** "Heavy 100 lb Cardstock • Real Ballpoint Inking".
  * **Variant C:** "Premium Heavyweight Cardstock • Real Ballpoint Inking" (unweighted).
* **Primary Metric:** Step 4 (Payment) Conversion Rate.
* **Secondary Metric:** Perceived Quality Score on post-delivery review.

---

### Experiment D: Letter Composer (Structured 3-Field vs. Freeform Textarea)

* **Hypothesis Statement:**
  * Breaking the note into *Salutation*, *Body*, and *Sign-off* reduces blank-canvas writer's block, prevents character overflow on physical cards, and speeds up addressing via auto-fill.
* **Variants:**
  * **Variant A (Structured 3-Field):** Salutation (`Dear [Name]`) + Lined Body + Sign-off (`Warmly, [Sender]`), auto-syncing to envelope. Hard cap at 450 chars.
  * **Variant B (Freeform 1-Field):** Legacy single large textarea with no salutation/sign-off separation.
* **Primary Metric:** Step 2 $\to$ Step 3 Progression Rate.
* **Guardrail Metric:** Manufacturing Clipping / Overflow Error Rate at Handwrytten API dispatch.

---

### Experiment E: Promo Code Placement (Collapsed Link vs. Open Field)

* **Hypothesis Statement:**
  * Displaying an open "Promo Code / Coupon" input field triggers visitors to leave the funnel to search Google for coupon codes, causing cart abandonment. Collapsing it behind a text link preserves checkout momentum.
* **Variants:**
  * **Variant A (Collapsed):** Subtle text link: `+ Have a voucher or promo code?`. Opens input only on tap.
  * **Variant B (Open Field):** Permanent open input box with `Apply Code` button alongside the card payment fields.
* **Primary Metric:** Checkout Completion Rate ($\text{Paid Orders} / \text{Step 4 Views}$).
* **Secondary Metric:** Average Time Spent on Step 4.

---

## 6. Implementation Scaffolding: How to Run These Experiments

The codebase is structured to support these experiments through three coordinated layers:

### Layer 1: Configuration Engine (`lib/feature-flags.ts`)
The `feature_flags` collection in Firestore stores the active experiment allocation. Defaults are defined statically so the application remains fully functional offline or during local development.

### Layer 2: Client & Server Evaluation Hooks
* Server-side: `isReworkV3Enabled(req)` in Next.js Server Components and route handlers.
* Client-side: `useExperimentVariant(experimentKey)` hook that evaluates:
  1. URL Query Parameter Override (e.g., `?catalog_mode=split_tabs` for instant testing).
  2. Visitor Cookie (e.g., `smn_exp_catalog=A` for sticky visitor assignment).
  3. System Config / Feature Flag default from Firestore.

### Layer 3: Telemetry & Attribution Attribution
Every order created in `/api/checkout/create-intent` automatically records:
* `experimentVariants`: Dictionary of active experiment variants assigned to the visitor at checkout time.
* `funnelVersion`: `"v2_vending_machine"` or `"v3_target_experience"`.
* `timeToCheckoutSeconds`: Duration from initial visit to payment confirmation.
* `netContributionCents`: Exact margin ($9.00 - Stripe Fee - Handwrytten COGS).

This data flows directly into the Admin Margins & Metrics dashboard (`/admin`), enabling the founder to view conversion rates, drop-off, and net contribution broken down by experiment variant.

---

## 7. Immediate Next Steps

1. **Baseline Measurement (Sprint 0):** Run the current production v2 flow to collect exact baseline funnel progression numbers across 1,000 visitors.
2. **Feature Flag Scaffolding:** Use the `ReworkExperimentParameters` schema to wire the A/B split logic into `/new` and the router.
3. **Launch Experiment A (Ready-Made vs. AI):** Split incoming traffic 50/50 between Ready-Made First (Variant A) and Dual-Mode Split Tabs (Variant C) to definitively answer the founder's catalog hypothesis.
