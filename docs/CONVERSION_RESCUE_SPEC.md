# SENDMYNOTES: CONVERSION RESCUE & NATIVE TELEMETRY OVERHAUL
**Target Repository:** `sendmynotes` (Aster & Blanche Press)
**Objective:** Eliminate the two paid-traffic drop-off cliffs (`Step 1 -> Step 2 Cover Selection` and `Step 4 Address -> Step 5 Checkout`) and upgrade `/admin` telemetry so founder test sessions, pre-overhaul legacy data, and real user behavior are cleanly separated at a single glance.

---

### MISSION BRIEF FOR ANTIGRAVITY BUILDER AGENT
Inspect our existing funnel components, analytics/telemetry ingestion, database schema, checkout flow, and `/admin` dashboard page. Execute the following four engineering work packages in sequence and verify that `npm run build` passes cleanly.

---

### WORK PACKAGE 1: Eliminate Cliff #1 (The 91% Cover Selection Bounce on Paid Traffic)
**Problem:** Paid visitors clicking specific ads (e.g., `/send/sympathy/loss-of-pet` or `?utm_source=...`) are bouncing at a 91% rate when forced to browse a cover gallery before interacting with the card editor.
**Implementation:**
1. **Direct-to-Studio Auto-Selection on Deep Links:**
   - When a visitor lands on an occasion route (`/send/[category]/[slug]`, e.g., `/send/sympathy/loss-of-pet`) OR arrives with `?auto_select=1` / paid UTM parameters (`utm_source=google` or `utm_source=meta`), automatically select the #1 default featured cover for that occasion and open the **Inside Note Editor (`Step 2/3`)** immediately on load.
   - Render a compact, tactile header pill above the card preview: `[ Cover: <Cover Title> • Swap Design (6) ]` that opens a quick bottom-sheet/modal cover switcher without losing their place in the note editor.
2. **1-Tap Starter Note Prompts (Blank-Page Cure):**
   - Directly above the Inside Note text area, add 3 clickable horizontal pill chips labeled **"Need inspiration? Tap to insert & edit:"** (e.g., for Pet Sympathy: *"1. Warm & Short"*, *"2. Rainbow Bridge / Fond Memories"*, *"3. Thinking of Your Family"*).
   - Tapping a chip populates a thoughtful 2-sentence handwritten note template into the textarea and fires a telemetry event (`starter_prompt_used`).
3. **Upfront Price & Postage Trust Bar:**
   - Display a calm, reassuring badge inside the studio header: **`$9.00 All-In • Written in Real Ballpoint Ink • Free First-Class Stamp Included`** so there is zero price surprise when the user reaches Step 4/5.

---

### WORK PACKAGE 2: Eliminate Cliff #2 (The 100% Real-User Drop-Off at Step 4: Address Screen)
**Problem:** 18+ real external visitors wrote a custom note and reached Step 4 (`Address Entered`), and 0 of them reached Step 5 (`Checkout Initiated`). Users on mobile (especially inside the Instagram/Facebook in-app browser) either do not have their friend's street address memorized, lose their session when switching apps to text for the address, or get blocked by mobile keyboard/validation friction.
**Implementation:**
1. **Keystroke-Level `localStorage` Draft Persistence (Meta In-App Browser Rescue):**
   - Persist `{ coverId, occasionSlug, insideNoteText, senderName, recipientName, recipientAddress, currentStep }` to `localStorage` (`smn_active_draft_v2`) on every change.
   - If a user switches out of the Instagram/Facebook browser to look up an address in iMessage/Contacts and the webview reloads, automatically hydrate their exact draft and step position with a subtle toast: *"Welcome back — your handwritten note was saved."*
2. **The "Don't Have Their Address Yet? Send Now, Add Address Later" Bypass:**
   - On the Step 4 Address screen, directly above/below the recipient street address fields, add a prominent, high-conversion toggle card:
     > **Don't have their street address handy right now?**
     > **[ ✓ Lock in my card now ($9.00) & text/email me a link to add their address later ]**
   - When the user selects this mode:
     - Only require **Recipient First/Last Name** and the **Sender's Email (or Mobile Number)**.
     - Allow the user to advance immediately to **Step 5 (`Checkout Initiated`)** and complete 1-tap Apple Pay / Google Pay / Stripe checkout.
     - In the database and Stripe webhook handler: if `address_deferred === true`, save the paid order with `fulfillment_status = 'AWAITING_RECIPIENT_ADDRESS'` (do NOT call the Handwrytten API yet) and send an immediate transactional email with a magic link (`/orders/[orderId]/complete-address?token=...`).
     - Build the lightweight `/orders/[orderId]/complete-address` page: as soon as the buyer enters the recipient address, validate it and immediately trigger the Handwrytten fulfillment dispatch.
3. **Mobile Keyboard & Sticky CTA Viewport Audit:**
   - Audit the Step 4 -> Step 5 `"Continue to Checkout"` button on mobile viewports (`52%` of traffic is mobile).
   - Ensure the primary CTA button is never trapped behind the iOS Safari / Meta in-app browser virtual keyboard, and display clear inline field error messages if an address field is incomplete (never disable the button silently without showing *why*).

---

### WORK PACKAGE 3: Fix Funnel Telemetry & Event Granularity
**Problem:** In our current `/admin` waterfall, `Step 2 (Cover Selected)` shows `32` while `Step 3 (Note Written)` shows `34`, and `Step 4 (Address Entered: 27)` does not tell us whether the user merely *viewed* the address form or actually *completed* typing an address before abandoning.
**Implementation:**
1. **Granular 7-Stage Telemetry Events:**
   Update the client telemetry tracker and backend ingestion to record distinct, monotonically ordered funnel milestones per session (`session_id` / `client_id`):
   - `step_1_landed`: Landed on page
   - `step_2_cover_ready`: Selected cover (or auto-selected via deep link)
   - `step_3_note_typed`: Typed >= 10 characters in the inside note (or tapped a 1-tap starter prompt)
   - `step_4a_address_viewed`: Reached the recipient address step
   - `step_4b_address_completed`: Validated full recipient address OR toggled `"Add Address Later"`
   - `step_5_checkout_initiated`: Mounted Stripe Payment Element / clicked Apple Pay
   - `step_6_paid_order`: Completed `$9.00` purchase
2. **Capture Sub-Step Diagnostic Metadata:**
   - Log `in_app_browser: boolean` (detect `FBAN`, `FBAV`, `Instagram` in `navigator.userAgent`).
   - Log `used_address_deferral: boolean`.
   - Log `last_validation_error: string | null` if a user taps "Continue to Checkout" on Step 4 and fails client validation.

---

### WORK PACKAGE 4: Upgrade the `/admin` Dashboard for Single-Glance Truth
Update the `/admin` page UI and data queries so the founder can diagnose performance in 5 seconds:
1. **Top Filter Control Bar (Sticky):**
   - **Date Range Selector:** Quick toggle pills for **`Since UX Overhaul (Oct 13+)`** *(Default)*, **`Today`**, **`Last 7 Days`**, and **`All Time`**, plus a custom date input.
   - **Founder / Test Session Filter Toggle:** A prominent switch **`[ ✓ Exclude Founder & Test Sessions ]`** *(Default: ON)*.
     - Add a button in `/admin` labeled **`"Mark My Current Browser as Founder Device"`** that sets a persistent cookie/localStorage flag (`smn_founder_device=1`) and tags the founder's IP/session IDs in the database so all past and future founder test checkouts (including the 9 test checkouts and 2 test orders) are cleanly excluded when the toggle is ON.
   - **Channel Filter Pill:** `All Traffic` | `Paid Only (Google + Meta)` | `Google CPC` | `Meta Paid` | `Organic / Direct`.
2. **Updated Step-by-Step Drop-Off Waterfall:**
   - Render the 7-stage waterfall (`1. Landed` -> `2. Cover Ready` -> `3. Note Typed` -> `4A. Address Viewed` -> `4B. Address Completed/Deferred` -> `5. Checkout Initiated` -> `6. Paid Order`).
   - Enforce **strict cohort funnel math**: a session counted in Step $K$ is guaranteed to be a subset of unique sessions in Step $1..K-1$ within the selected date/channel filter.
3. **"High-Intent Abandoners" Live Inspector Table (New Section on `/admin`):**
   - Directly below the waterfall, render a table of the **Last 25 Sessions That Reached Step 3 (`Note Typed`) or Step 4A (`Address Viewed`)**:
     - Columns: `Time Ago`, `Source / Campaign (UTM)`, `Device / Browser (Flag Instagram/FB In-App Browser)`, `Landing Path`, `Furthest Step Reached`, `Note Length (chars)`, `Validation Error Hit (if any)`.
   - This gives instant visibility into every single real person who writes a note and exactly what happened in their final 10 seconds on the site.