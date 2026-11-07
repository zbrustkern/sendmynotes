# One card, a few more people

> Approved scope update, November 6, 2026: [Personal greetings per recipient](PERSONAL_GREETINGS.md) are included in Sprint 0028. [Greeting mockups](assets/personal-greetings.html) supersede the original shared-greeting treatment; base mockups still cover address entry, deferral, household confirmation and fulfillment states.

Minimal holiday multi-send · November 6, 2026 · Design proposal; not implemented or deployed

## Recommendation

Keep today's single-card flow as the default. Add only a quiet text action, **“+ Add another recipient”**, beneath its existing recipient fields. After the sender chooses it, reveal the multi-recipient editor, shared-message explanation, and $9-per-card pricing. Each added address gets one copy of the same card. Keep one shared message body and sign-off, optional recipient-specific opening greetings, one handwriting style, one personal return address, and one payment. For multiple recipients, Review & Pay shows **“3 cards × $9.00 = $27.00”**, a reviewable recipient list, and **“Pay $27.00 · Send 3 cards.”**

**Founder clarification:** multi-send must be introduced subtly from the existing flow. The original one-recipient mockup exposed too much multi-send language; it is superseded. The prototype now opens on **Default · one card**. Recipient counts, shared-card guidance, and the 25-recipient limit belong only after Add another recipient is selected; the Address heading remains “Where should we mail it?” throughout. This feature does not authorize a redesign of the baseline Address or single-card Pay screen.

**Baseline preservation requirement, clarified from the supplied current-screen PDF:** the current production page is the implementation baseline, not the prototype's reconstructed default screen. Preserve its layout, typography, spacing, copy, envelope preview, expanded **Send to** and **From you** forms, address-later option, address-book picker, existing international option, save/account options, and **Review & pay** action. Add only the secondary **“+ Add another recipient”** text action after the recipient City/State/ZIP fields, inside **Send to** and before **From you**. Match existing secondary text-action styling; leave a 44 px hit area. Do not collapse the return-address form, move the preview, rebuild the page shell, or rename the existing CTA as part of this feature. The PDF is a private visual reference and is not copied into the deliverables; its personal data must not be reused in mockups. Its print pagination and fixed-header overlap are not evidence of equivalent live-screen defects.

The prototype's default screen is only a placement/transition sketch and must not be implemented as a replacement page. The post-click multi-recipient mockups are the proposed new interface. The tradeoff is deliberate: multi-send is less prominent to single-card senders, while people seeking it find it next to the address they are entering. Broader page redesign is separate work and is not a prerequisite for multi-send.

No new entry funnel, bulk-send mode switch, cart, or extra step. Sending one card stays familiar. The user encounters multi-send exactly where they already enter an address.

This is for personal holiday greetings to friends and family. The expected usefulness is a product hypothesis, not measured demand or conversion uplift. The October 11 canonical baseline recorded zero independent customer conversions and one founder test. Sprint 0026 later records founder-reported sales; that later report has not been independently audited in this design work.

**Review artifacts:** [approved greeting flow](assets/personal-greetings.html) and [base interactive mockups](assets/multi-send.html), [default single-card entry](assets/single-390.png), [address screen](assets/address-390.png), [adding a recipient](assets/add-390.png), [payment screen](assets/payment-390.png), [desktop payment](assets/payment-1280.png), [partial fulfillment](assets/attention-390.png). The HTML includes single-recipient, three-recipient, payment, confirmation, and attention states. Example people and addresses are fictional; the existing evergreen catalog illustration is the only image used. The preview is not a physical print or handwriting-fit proof.

**Mockup verification:** [review checks](assets/review-checks.json) record 32 screen/width combinations (320, 390, 768, 1280 px), nine local interaction flows, no horizontal overflow, and no external requests. The updated prototype demonstrates stable column placement, distinct greeting/body/sign-off editing, production-style address controls, same-household confirmation, deferral conflict resolution, fixed mobile actions, and separate rejected/uncertain scenes. The baseline remains a schematic, not a pixel-exact replacement for production. Existing international, address-book, scheduling and account controls must be preserved in implementation even where omitted from the drawing. Persistence, server validation, offer eligibility, payment, support delivery and supplier behavior are implementation requirements, not verified by this prototype. All examples are fictional; the design-review toolbar is outside the product UI.

### Integrated review feedback

| Feedback | Final design decision / review surface |
| --- | --- |
| Step 3 columns swapped on opt-in | Keep the same 12-column desktop workbench: left 5 columns retain the envelope; right 7 columns hold addresses. Single-send keeps **Send to | From you** side by side. After opt-in, **Recipients (N)** spans the right column, with **From you** below it. Shared-card/note review appears below the envelope on the left. The header and horizontal preview position remain stable. |
| Note editor flattened greeting/body/sign-off | Keep three fields and the existing composition rule; make **Default greeting** the first multi-send shared-note field and show each recipient’s effective greeting in review; custom greetings do not alter body/sign-off. [Structured note example](assets/note-fields-1280.png). |
| Added address controls differed from production | Reuse the existing `US_STATES` select, optional **+ Add Apt / Suite / Unit**, City full width, then State / ZIP Code in two columns. |
| Same household was silently accepted | Require an inline decision before committing a second card to the same address with a different name; include unit in address identity. [Household example](assets/household-1280.png). |
| Deferred address could not enter multi-send cleanly | Prompt before requiring the missing street fields; keep the original name and sender. Explicit acceptance opens completion of recipient 1 first, then a blank recipient 2. [Deferral conflict](assets/deferral-conflict-1280.png). |
| Rejection and uncertainty were mixed | Separate **Address rejected** (`REJECTED_NOT_SENT`) and **Being checked** (`DISPATCH_UNCERTAIN`) review scenes; unknown outcomes never offer a send-again action. |
| Mobile action behavior unspecified during editing | Keep one fixed footer showing committed count and current subtotal. Review & pay focuses the unfinished editor with a save/cancel error; it never omits that editor or advances. |


## Authority, evidence, and proposed limits

The [canonical project brief](../../CANONICAL_PROJECT_BRIEF.md) and [product specifications](../../CANONICAL_PRODUCT_SPECS.md) govern this proposal. SendMyNotes is the sender-facing brand. Preserve the supplier's existing recipient-facing backplate independently. Preserve a complete personal return address. Use the verified dimension-4 A2 folded portrait format (4.25 × 5.5 inches, front ratio 17:22).

| Kind | What this design relies on |
| --- | --- |
| Founder direction | Personal senders; a thoughtful gesture made seamless; guest sending; accurate prices and product claims. This request authorizes designing multi-send. |
| Inspected repository facts | The active candidate entry uses `EntryPrototypeClient`, with `Step3EnvelopeAddressing` and `Step4ReviewAndPayment`. Drafts, checkout requests, order records, and fulfillment currently carry one recipient. Base price is 900 cents. Current integration performs image upload, custom-card creation, then `singleStepOrder`. These are source findings, not deployment verification. |
| Supplier documentation, read November 6 | The custom-card response supplies a reusable `card_id`; `singleStepOrder` accepts one recipient, message, sender, and `client_metadata`. The docs also describe a separate basket bulk workflow. No supplier idempotency guarantee was established by this review. [Handwrytten API](https://www.handwrytten.com/api-redoc/) |
| Proposed launch defaults | 2–25 recipients for multi-send; U.S. addresses only; send as soon as prepared; all addresses complete before checkout; $9 per card including mailing; no volume discount. These are design recommendations, not approved supplier limits. |
| Still unresolved | Account-specific custom-card charges and margins, safe sustained request rate, metadata lookup/reconciliation behavior, and physical message fit. Confirm before a live rollout. Apple Pay remains unverified end to end. No holiday-arrival cutoff is established. |

### Keep the first release small

Include manual add/edit/remove, guest use, draft restoration, a recipient-selectable note preview, optional inside-greeting overrides, exact server pricing, one checkout, and per-recipient fulfillment recovery. Reuse an existing saved-address picker where available, one address at a time; multi-send must not depend on the proposed account redesign.

Defer CSV upload, pasted lists, new contact-import flows, mail merge, different covers, message bodies or sign-offs per recipient, multiple copies at one address, international sending, new scheduling, per-recipient reminders, and bulk address-book saving. Do not automatically save anyone to an account or opt them into reminders.

For one recipient, retain existing deferral and scheduling behavior. For multiple recipients, require complete addresses and immediate processing. When a sender with deferral or a future date taps Add another recipient, show a local explanation with **“Enter addresses and send when ready”** and **“Keep one recipient.”** Evaluate this conflict before full-address validation so a deferred first recipient can reach the explanation. “Keep one recipient” preserves deferral, incomplete fields, sender and schedule exactly. Accepting the conversion clears incompatible preferences explicitly and opens recipient 1 for any missing fields before opening recipient 2. Preserve the complete sender form and require it before payment. Conversion preserves all entered data; no preference is silently cleared. Returning to one recipient does not silently restore a discarded schedule or deferral preference.

## Address step

Keep the existing step sequence: **Card → Note → Address → Pay**. Keep the production page shell and heading. At `lg`, preserve the `grid-cols-12` workbench with sticky left `col-span-5` preview and right `col-span-7` form region. The right-side single-send `md:grid-cols-2` grid remains unchanged until opt-in. Multi-send makes the recipient list/editor span both inner columns, with the shared sender beneath it. Never swap the left and right regions. At smaller breakpoints preserve the existing preview-before-form order, while Add/Edit scrolls directly to and focuses the active editor. Only reveal shared-note review after opt-in; at desktop it stays beneath the envelope on the left. Do not adopt the mockup's typography or spacing as a replacement for production styles.

### One recipient

Keep the current heading **“Where should we mail it?”**, singular recipient copy, **Send to** / **From you** fields, envelope preview, existing optional controls, and normal checkout action. Immediately below the recipient fields place only **“+ Add another recipient”** as a secondary text action with a 44 px hit area. No full-width dashed box, banner, supporting multi-send paragraph, count badge, list heading, shared-note callout, or recipient-cap text appears in this default state. Do not require a separate Save action for the first recipient: Add another or Continue validates and commits its current fields.

Keep today's personal return-address editor, price display, and single-card payment behavior. The current-screen reference uses **“$9 total · USPS mailing included”** and **“Review & pay”**; preserve those instead of adopting the sketch's different CTA. Preserve applied discounts and the existing single-card international option. The proposed domestic-only restriction applies only after choosing multi-send: if an international address is already selected, explain the restriction and allow the sender to keep the existing single-card order without changing its address or price. A sender who never clicks Add another recipient encounters no other multi-send UI.

Clicking Add another recipient reveals the expanded interface on the same step, with the first address committed and a blank second editor focused. At that moment, show the shared-message explanation and $9-per-card price before the second address is saved. Canceling that editor returns to the quiet baseline if only one recipient remains. Saving it enables the multi-recipient checkout. Removing back to one also restores the quiet baseline. Returning from payment preserves the correct state based on the committed count, not an irreversible multi-send mode flag.

### Two or more recipients

Collapse completed addresses into an ordered list. Each row shows name, complete street including unit, city/state/ZIP, visible **Edit address** / **Remove** actions, and its exact inside greeting with Default/Personalized status and **Personalize greeting** / **Edit greeting**. Number rows to aid error references, while stable recipient IDs preserve identity after reordering or removal. Display **“Recipients (3)”** and the shared-message explanation. Keep the add action beneath the list; display “Up to 25 recipients” quietly there.

Only one recipient editor is open at a time. Add opens blank fields inline and focuses Recipient name. Reuse the actual existing field controls: recipient name; street; collapsed **+ Add Apt / Suite / Unit** disclosure (open automatically for a saved nonempty unit); City on its own row; State from the existing `US_STATES` select and ZIP Code in the two-column row below it. Do not replace the select with a two-character free-text field. Preserve the existing supported name mapping, including single-word names; do not invent “Friend” to bypass validation. Use per-recipient autocomplete sections so browser autofill cannot overwrite another row or the shared sender.

Actions in an added editor: **“Save recipient”**, **“Cancel.”** Cancel closes only this editor and leaves the committed list unchanged. Saving adds a row, announces the new card count and subtotal, and focuses Add another. Editing uses **“Save changes”** and preserves the row ID. Continue with an unsaved editor focuses it with **“Save or cancel this address before continuing.”** Never silently omit the unsaved recipient.

Remove immediately updates the subtotal and exposes an **Undo** action until the next list mutation/navigation. The final recipient cannot be removed; its fields can be edited. Removing down to one returns to single-recipient presentation, preserving shared content and the remaining address, moving the survivor’s effective greeting into the normal single-card Note field and clearing its hidden override. Undo must restore the previous default and per-recipient modes as well as the removed row. At 25, replace Add with **“25 recipients added — this is the limit for one order.”** Enforce the same cap on the server.

Return address appears once, labeled **“Your return address · used on every envelope.”** A filled address can be summarized with Edit; missing fields open the existing editor. It is personal sender identity, not the billing address. An envelope preview, if retained, shows only the currently edited/selected recipient and labels that recipient explicitly.

### Validation and duplicates

Validate each committed recipient and the full sender address both locally and on the server. Required-field validation does not establish postal deliverability. Preserve ZIP strings and unit numbers. Block unsupported countries with a specific explanation rather than substituting USA. Do not purchase a new supplier validation service implicitly.

An exact normalized duplicate of name + street + unit + city + state + ZIP is blocked: **“This recipient is already on your list. Edit the existing address instead.”** Ignore case, repeated whitespace, and harmless punctuation for comparison, but preserve entered display text. Same address with different names is allowed after **“Another card is already going to this address. Send one to [name] too?”** Different unit numbers are distinct. Do not count or price the new recipient until the sender chooses **“Send a separate card.”** **“Edit this address”** keeps the editor and all typed values open. Changing a pending name/address invalidates the earlier confirmation; the server checks duplicates and requires the same-household acknowledgment to match the final submitted recipient/address hash. Never merge household members silently.

Show field errors inline and an error summary linking to the affected row. Focus the first invalid field after an explicit submit. At 320 px, stack city/state/ZIP where needed. Controls have 44 px touch targets, visible keyboard focus, labels independent of placeholders, and accessible names such as “Remove Maya Ellis.” Announce saves, removals, and total changes politely. Keep exactly one fixed mobile footer above safe-area padding with enough page bottom padding and editor scroll margin that it covers no controls. While adding/editing, it displays only the committed recipient count and subtotal, for example **“3 cards · $27.00”** and **“Review & pay ($27.00) →.”** Tapping it with an open editor shows **“Save or cancel this address before continuing”**, scrolls the editor into view and focuses its first field without dropping typed text. Save recipient / Cancel remain local to the editor. Do not render both the parent ActionBar and child fixed footer; retain the existing `hideFixedActionBar` ownership pattern.

### Shared message risk

Adding a recipient never rewrites the note or infers a greeting from their envelope name. Copy says **“Same card, message and sign-off. You can personalize each opening greeting.”** Preserve `salutation` as the default, `draft.note.text`, and `signOff` as separate fields. Multi-send shared-note editing labels salutation **Default greeting** and explains that personalized greetings stay unchanged. If the default says “Dear Maya,” retain and display it until the sender edits it.

Each saved recipient inherits the default or has an explicit custom opening line; an empty custom value means no greeting. **Personalize greeting** expands one inline field beneath the address with Save greeting, Cancel and Use default greeting. Match the [approved detailed flow](PERSONAL_GREETINGS.md). Only one address, greeting or shared-note editor may be active; preserve unsaved input and block navigation with focused feedback. Card and envelope previews follow the selected recipient together; never display another recipient’s unsaved text.

Default changes affect inherited greetings only; shared body/sign-off edits affect all unpaid copies. Preserve these semantics across draft migration, refresh, back navigation, address edits and remove/undo. Compose each message using `[effectiveGreeting, draft.note.text, signOff].filter(Boolean).join("\n\n")` with existing content semantics. Validate every full resolved note against application constraints before payment, with recipient-specific errors. Never parse a flattened note, duplicate an already-composed greeting, or invent a physical-fit limit. Store structured shared fields and each recipient’s resolved greeting and composed message in the immutable snapshot so review and dispatch agree.

## Review & Pay

The changes below apply only when at least two recipients are committed. With one recipient, retain today's Review & Pay screen and singular copy; no recipient list/count, shared-message warnings, or “one payment for everyone” explanation is added.

On desktop, show the selected recipient’s complete card and note on the left, with recipients and checkout on the right. On mobile, order the content: shared card/message, recipients, return address, receipt email, totals/payment. The front uses 17:22 geometry; label previews as representations. The full exact selected message is available by default for multi-send, not hidden behind a tiny thumbnail. Every recipient row visibly lists its exact greeting (or No greeting), with **Preview this card** and **Edit greeting** actions. Edit returns to that row on Address; save before returning to payment. Do not hide greetings in the full-address disclosure.

The recipient summary shows all names, count, and city/state; **“Review addresses”** expands complete addresses in place. **“Edit recipients”** returns to Address without losing the note or return address. Keep totals visible near the pay action. Do not put a quantity stepper here: quantity is the number of committed recipient addresses.

| Checkout item | Three-recipient example |
| --- | --- |
| Cards | 3 × $9.00 — $27.00 |
| Mailing | Included for all 3 |
| Total | $27.00 USD |
| Primary action | Pay $27.00 · Send 3 cards |
| Supporting copy | One payment. Each card is mailed separately. |

Use the existing Stripe payment components and one receipt email. Wallets appear only when Stripe reports availability; mockups use a card-payment placeholder and make no wallet-verification claim. Disable payment during pricing, recipient changes, payment authentication, or quote failure. Show **“Updating total…”** instead of permitting payment with stale values. Preserve payment errors and allow retry of the same payment attempt where appropriate.

Use **“We prepare your cards, then mail them separately. Arrival dates can vary.”** Do not promise Christmas arrival, a same-day cutoff, simultaneous delivery, or tracked receipt. If timing estimates appear, reuse only verified preparation/transit guidance with explicit holiday uncertainty, not the current calculator's unverified cutoff assumptions.

### Discounts: proposed narrow rule

Keep existing single-card offers worth their existing single-card benefit **once per checkout**. A 20% code discounts one $9 card by $1.80; a one-free-card code subtracts $9, not the entire batch. Three cards with a one-free-card offer cost $18.00. Label the line **“[CODE] · applies to one card.”** No new volume pricing.

The server must explicitly support this scope in quote creation, redemption, confirmation, and allocation; multiplying the old discounted total is incorrect. Honor the offer's actual terms: an offer with incompatible or ambiguous scope must be rejected with an explanation before payment, never silently reinterpreted. Revalidate when count changes, reserve/redeem once per parent order, and release replaced reservations. Existing zero-cost single-card flows remain supported; multi-send is never free under this proposed rule.

## Confirmation and exceptions

Payment confirmation headline: **“Your 3 cards are in motion.”** Explain **“Payment received. We’re preparing the same card for 3 recipients.”** Show paid total, one reference/receipt, shared card, and a row for each recipient. Do not call cards mailed at payment success.

| Per-recipient condition | Customer wording and action |
| --- | --- |
| Paid, not submitted | Preparing your card |
| Supplier accepted | Being prepared |
| Supplier reports mailed | Mailed; date when available |
| Confirmed rejection, not created | Needs attention; support-assisted address correction if appropriate |
| Request outcome unknown | Checking this card; no retry/send-again CTA |
| Canceled before submission, refund pending | Not sent · refund pending |
| Refund verified | Not sent · $X refunded |

For a confirmed rejection, show **“2 cards are being prepared. 1 needs attention.”** Name the recipient, say the card was not accepted, and offer support-assisted correction or allocated refund. For an unknown submission outcome, show **“2 cards are being prepared. 1 is being checked.”** Say no new payment or send-again action is needed; do not label it a confirmed failure or ask for an address correction before reconciliation. Use separate status enums and display mappings, not a shared ambiguous attention flag. Keep accepted cards moving. One parent receipt; consolidated status emails on meaningful changes, with per-recipient detail behind an authorized order link. No burst of 25 receipts or 25 purchase events.

Operators need one parent order with per-recipient status, supplier ID, attempts, and safe actions. An unknown outcome requires reconciliation before correction, resubmission, cancellation, or refund. Once a child is confirmed not accepted and atomically stopped, support can correct and retry that child without charging again, or refund its allocated paid amount. Never retry the whole group. Completed children are immutable.

## Data and payment design

Use **one parent commercial order and N delivery children**. A multi-send parent is not represented as N independently paid legacy orders. This avoids multiplying revenue, promotion uses, emails, and attribution. Existing single orders keep their current contract; branch explicitly on `kind` when reading multi-send records.

```text
Order (kind: multi_send, schemaVersion: 2)
  id, ownerId? / protected guest access, paymentMode
  immutable checkoutRevision, contentHash, ordered recipientIds
  shared card asset/version, structured default greeting/body/sign-off, font, return address
  immutable per-recipient greeting mode, effective greeting, composed message
  currency: usd, quantity, unitPriceCents: 900
  subtotalCents, discountCents, totalCents, quote/offer snapshot
  Stripe PaymentIntent ID, payment state, aggregate delivery counts
  shared supplier preparation state, coverId, cardId, backplate version
  receipt/email and financial-event deduplication keys

orders/{orderId}/deliveries/{recipientId}
  immutable address, effective greeting and composed message snapshots, parent revision/contentHash
  allocatedDiscountCents, allocatedPaidCents, refund ledger references
  state, supplierOrderId?, attemptId?, lease/fence, request fingerprint
  attemptedAt, acceptedAt?, mailedAt?, safe error classification
```

Stable recipient IDs are generated once in the draft and checked for uniqueness at checkout. Proposed draft v2 migrates an existing `recipient` into a one-element `recipients` list and supports a separately persisted unfinished editor. Preserve the current 24-hour local expiry and clear-on-completion policy. Never store Stripe client secrets or payment credentials in local drafts. An expired draft is not silently reconstructed from unrelated account contacts.

Keep names, addresses, message text, tokens, and emails out of analytics and ordinary logs. The parent guest credential must authorize every child read/edit; child IDs confer no access. Preserve masked/public order behavior. Authenticate account ownership from the server session, not a submitted userId. Extend Firestore rules so clients cannot change paid snapshots, money, supplier IDs, or child states directly.

### Checkout lifecycle

1. Client submits shared content, stable recipients, sender, optional offer, draft revision, and a request key. Server validates all rows, cap, country, each resolved full message, and sender before charging. Ignore client prices. Return row-specific validation errors without creating a payable intent.
2. Server computes integer-cent subtotal `N × 900`, validates offer scope, and freezes the complete snapshot. Creation is idempotent for the same owner/draft/revision and payload hash. A conflicting payload under the same key is rejected.
3. Create one PaymentIntent for the immutable snapshot, with server idempotency key and non-personal parent ID/revision metadata. Persist its identity before returning checkout data. Repeated clicks/tabs resume the same active attempt.
4. Editing after intent creation first exits payment and cancels/settles the old intent server-side. Do not mint a payable replacement while the old intent can still succeed. If it is processing, wait; if it succeeded, show that paid order and its frozen addresses rather than generating a second payment. Only a confirmed cancellable/canceled or failed attempt permits replacement. Clear old client secrets/Stripe Elements and quote state. This applies to same-price address or greeting edits as well as count changes.
5. A verified webhook or server retrieval checks status, identity, currency, environment, exact amount, and revision. Atomically record one capture fact and enqueue durable delivery work. A stale or anomalous successful payment is reconciled against its own frozen snapshot; never dispatch a newer edited draft or ignore money received.
6. Use an idempotent materialization job if delivery children are created after payment: stable child document paths and a manifest ensure exactly N children even after a crash. Dispatch starts only after the parent is verified paid and the manifest is complete. Browser closure and webhook retries must not change this.

The confirm route, webhook, free-order route, and pricing guard must agree on the same authoritative order type. `processPaidOrder` currently ties one PaymentIntent to one order; do not call it N times with the same intent pretending each recipient is a paid order.

Allocate the order discount proportionally across children in integer cents, assigning rounding remainders by stable recipient order. With a $9 discount across three cards, each has a $3 allocation and $6 paid value. These are refund/accounting allocations; the offer is still redeemed once. Sum of child paid allocations must equal the parent total. Verified per-child refunds cannot exceed that allocation or the parent's remaining refundable capture. Protect refund and dispatch decisions with one transactional state check, and deduplicate refund requests/provider events. Supplier cancellations and costs remain separate from customer refunds.

## Handwrytten calls and durable work

Refactor the current combined `fulfillHandwryttenOrder` into reusable preparation and single-recipient submission boundaries. Keep the legacy wrapper for single sends if needed.

**Proposed sequence:** paid parent → durable preparation job → upload shared cover once → resolve existing backplate → create dimension-4 custom card once → persist `cardId` → enqueue N child submissions → status sync per returned supplier order ID.

Reuse that frozen card ID across the batch; do not update its artwork in place. Share font and artwork; pass each child's frozen composed message and recipient fields with the same personal sender. Retries and address corrections reuse that child’s paid message, never a newer draft/default. The greeting stays in the pen-written message field. Carry non-personal parent/child/attempt references in `client_metadata`; our current payload does not send that field. Metadata is for correlation, not proof of supplier deduplication. [Supplier endpoint documentation](https://www.handwrytten.com/api-redoc/)

Prefer the existing single-order endpoint over introducing the supplier basket for this release. This is an architectural choice: it keeps each child's acceptance and recovery explicit. A basket is a later option only after its account isolation, mapping, charging, and partial-failure semantics are verified.

Start with serial child submission per batch and a configurable account-wide concurrency/rate ceiling; do not assume the proposed 25-recipient product limit is a supplier limit. A durable worker processes bounded units and checkpoints between calls; do not place a 25-call loop inside the checkout request or depend on an unawaited server function. Extend the outbox only if it supports leases, durable retries, and reconciliation; otherwise add a dedicated delivery-job collection and authenticated worker trigger.

| Failure boundary | Required behavior |
| --- | --- |
| Before a request is sent | Safe to retry the queued work after backoff. |
| Cover upload/custom-card creation fails | No child dispatch until a card ID is durably recorded. Bound retries; an ambiguous preparation result requires inspection before creating more supplier resources. |
| A child is claimed | Transactional claim/fencing prevents another worker from sending it. Record the attempt before network I/O. |
| Supplier returns an accepted order ID | Persist it before advancing the child. Do not resubmit accepted children. |
| Timeout, connection loss after send, ambiguous 5xx, or crash before recording success | Mark `DISPATCH_UNCERTAIN`; block automated resend. A lease expiry after an attempt began is not permission to submit again. Reconcile through supplier evidence/operator tooling. |
| Explicit, documented rejection proving no order was created | Mark `REJECTED_NOT_SENT`; correct or retry only this child using a new attempt, never a new customer charge. A generic non-2xx is insufficient proof. |
| Supplier account billing/auth failure | Pause remaining submissions and alert operations; already accepted children keep their status. |
| Status sync fails | Retry read-only status checks. Never infer failure to mail or resend from a status-read failure. |

Unknown outcomes have no blind retry. If correlation lookup cannot uniquely establish acceptance/non-acceptance, retain a hold for operator/supplier review. Test payments and local mock mode must never enter the live supplier path. Preserve staging-review and global fulfillment pause controls. The current missing-key mock response must not masquerade as live success for a paid batch.

## Implementation map

Limit UI refactoring to what the feature actually needs: a recipient-list state model, reusable address validation/field logic where practical, and a conditional multi-recipient view. Keep the existing single-recipient render path and its controls intact. The click hands the current recipient, return address, note, and card to the expanded view without re-entry; cancel restores the original view and values. Internal changes must not require a new visual design for single-card senders. Payment/fulfillment changes described above remain necessary even with this minimal entry-point UI.

Paths refer to inspected source in this checkout. This design does not modify those files.

| Surface | Main files / responsibility |
| --- | --- |
| Entry and draft | `app/preview/entry/client.tsx`; `lib/draft/{types,reducer,store}.ts`: array migration, stable IDs, shared note behavior, invalidation and restoration. Audit legacy `smn_active_draft_v2` paths too. |
| Address and payment | `components/v3/Step3EnvelopeAddressing.tsx`, `Step4ReviewAndPayment.tsx`, `components/flow/ActionBar.tsx`: progressive address list, totals, exact-message review, shared sender. `components/ExperienceRouter.tsx`: restrict exposure to the supported candidate flow. |
| Checkout / offers | `app/api/checkout/create-intent/route.ts`, sibling confirm/free-order routes; `lib/stripe.ts`, `lib/offer-engine.ts`, discount validation: quantity-aware immutable quotes and one payment. |
| Order persistence / access | `lib/types.ts`, `lib/firebase-admin.ts`, `firestore.rules`, `app/api/orders/[id]/route.ts`: discriminated parent schema, delivery children, authorization, masking. Keep complete-address route single-only initially. |
| Dispatch / reconciliation | `lib/order-processor.ts`, `lib/handwrytten.ts`, `lib/transactional-outbox.ts`, `lib/reconciliation.ts`, fulfillment status-sync route/worker: durable preparation, child claims, uncertain-outcome holds. |
| Financial events | `app/api/webhooks/stripe/route.ts`, `lib/financial-ledger.ts`: one capture and purchase, allocated refunds, no child revenue duplication. |
| Post purchase / operations | `app/order/[id]/page.tsx`, `app/account/page.tsx`, `lib/email/transactional.ts`, admin order/detail and retry tooling: one parent with per-card status. Never expose legacy whole-order retry for a batch. |

Do not assume older parallel components or legacy builder paths are active. Keep them single-send compatible until deliberately migrated. Do not depend on unfinished account, upload, or international proposals.

## Acceptance and launch gates

Ship behind a server-enforced `multiSendEnabled` flag. Disabling new batches must not strand already paid delivery jobs. Launch to a small controlled audience only after the money/fulfillment checks pass; UI polish alone is insufficient.

1. **Single-card regression:** restored legacy draft, normal payment, discounts, deferral, existing international behavior, address-book/save options, and existing scheduling still work. No new mandatory step. Compare before/after screenshots at the same viewport and state: the only intended visual difference before opting in is the added text action and its necessary vertical space. Use the actual current page as the comparison baseline, not the reconstructed prototype. Canceling multi-send restores original field values and optional settings unless the sender explicitly accepted a change.
2. **List behavior:** 1/2/25 recipients, cap rejection at 26, add/edit/remove/undo, cancellation of unsaved input, duplicate names/units, single-word names, refresh, and back navigation preserve the intended list and note. Full sender validation is identical across UI and API.
3. **Pricing:** 3 cards cost 2700 cents before offers; 20% of one card yields 2520 cents; one-free-card offer yields 1800 cents. Allocation sums, cap, offer reservation/redemption, and tampered prices are checked server-side.
4. **Payment races:** double-click, two tabs, changed count, same-price address/greeting edits, authentication redirect, webhook duplication, and a payment succeeding during attempted edit produce at most one active payable purchase and dispatch the correct frozen content.
5. **Worker recovery:** crash at each preparation/child boundary, duplicated jobs, lease expiry, accepted-result persistence failure, rate limits, and account billing failure cannot resend accepted or uncertain children. Successful siblings continue unless the issue is systemic.
6. **Partial failure:** one of three definitively rejected, and one of three uncertain, have distinct customer/operator outcomes. Correction affects only a proven unsent child; refund is allocated and idempotent. A worker/refund race cannot both send and refund an allegedly unsent card.
7. **Commercial reporting:** one paid purchase and one receipt, quantity 3, revenue equal to actual captured total; independent customers, founder tests, comps, refunds, and fulfillment failures remain separate.
8. **Privacy and access:** guest link and authenticated owner can view only authorized children; masked reads stay masked; no PII in metadata/analytics/logs; paid snapshots cannot be edited directly.
9. **Responsive/accessibility:** review at 320/390/768/1280 px; keyboard and screen-reader errors/count updates; 44 px targets; long names and unit lines; no footer occlusion. Wallet copy depends on actual readiness and separate testing.
10. **Supplier readiness:** confirm account charges, safe concurrency, metadata reconciliation, and shared-card reuse against this account using non-billable evidence/approved test setup. Do not run fulfillment scripts as an audit. A live physical order requires deliberate authorization.

Record non-personal events for add/remove, count at checkout, quote failures, verified paid batch, child accepted/uncertain/mailed, and verified refund. Report completion and support incidents by actual batch size. Do not forecast conversion uplift from the historical funnel counters.

## Decisions to confirm before implementation

Recommended defaults are complete enough to build from: 25-recipient cap, domestic immediate sending, existing single-card offer benefit once, and support-assisted partial-failure recovery. Confirm these commercial and operational choices with the founder before rollout. Recipient-specific greetings are approved scope in this sprint and require the G1–G5 acceptance gates. Raising the cap or adding per-recipient bodies/sign-offs remains deferred.

The largest engineering work is reliable one-payment/many-delivery processing. Keep the customer interface small while giving that work explicit acceptance gates.
