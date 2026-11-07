# SPRINT-0028 — Minimal multi-send, one payment and reliable per-card fulfillment

> Approved scope update, November 6, 2026: [Personal greetings per recipient](../proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md) are included in this sprint. [Greeting mockups](../proposals/2026-11-06-multi-send/assets/personal-greetings.html) govern greeting editing, previews and payment review; the base mockup remains the reference for other multi-send flows.

Status: local implementation verified; staged acceptance pending · November 6, 2026 · No deployment or live external side effects.

Execution evidence: [combined review](evidence/SPRINT-0028/REVIEW.md), [operations and launch gates](evidence/SPRINT-0028/OPERATIONS.md). Three user-requested Luna agents implemented the work locally, with parent review and integration.

Governing sources: [Canonical project brief](../CANONICAL_PROJECT_BRIEF.md), [canonical product specifications](../CANONICAL_PRODUCT_SPECS.md), [updated multi-send design](../proposals/2026-11-06-multi-send/DESIGN_SPEC.md), and [interactive mockups](../proposals/2026-11-06-multi-send/assets/multi-send.html).

## Pyramid Index

- **L0:** Add one subtle recipient action to the current sending flow, then support one shared card with optional recipient-specific greetings sent to multiple addresses through one verified payment and independently recoverable deliveries.
- **L1:** Preserve the single-card baseline; match production layout and note/address controls; add optional inline greetings; freeze per-recipient text and quantity-aware checkout snapshots; dispatch each physical card safely; expose truthful recipient status and recovery.
- **L2:** [Scope and decisions](#scope-and-decisions), [architecture](#architecture), [work packages](#implementation-plan), [acceptance matrix](#acceptance-matrix), [release and rollback](#release-and-rollback), [definition of done](#definition-of-done).

## Overview

The founder wants a minimal addition to the current Address screen for the holiday season. Before opting in, the only intended visible difference is **“+ Add another recipient”** below the recipient City/State/ZIP fields. Preserve the actual production page, its expanded sender form, envelope preview, address book, international and address-later options, account controls, price treatment and Review & pay action. The prototype's baseline is a schematic, not permission to rebuild production.

Clicking Add another recipient introduces the expanded interface on the same step. It carries the existing card, structured note, recipient and sender forward. It never silently rewrites the greeting. Each saved recipient can inherit the default greeting, use a custom opening line, or explicitly omit the greeting. The body and sign-off remain shared. One parent purchase pays for N separately addressed cards, and each recipient has independently recorded supplier acceptance and mailing status.

The user explicitly authorized direct planning in this chat after Claude CLI was unavailable on PATH. This is a repository-backed single-author plan; no Claude draft, model fan-out, or independent cross-review is claimed. [Planning notes](drafts/SPRINT-0028-PLANNING-NOTES.md) record orientation, feedback dispositions, evidence and unresolved assumptions.

## Scope and decisions

### Confirmed direction

- Preserve the existing single-card UI and flow. Do not combine this feature with a visual redesign.
- Multi-send is opt-in, with a consistent left-preview/right-addresses layout and reversible transition.
- Same cover, message body, sign-off, handwriting and personal return address for every recipient. Optional recipient-specific inside greetings are approved scope: inline editing on Address, exact greeting review on Pay, and a selected-recipient full-card preview. No changes to the single-card baseline.
- Integrate all seven feedback items: layout continuity, structured note fields, matching address controls, household confirmation, deferral conflict, separate rejection/uncertainty, and mobile footer behavior.
- Planning does not authorize deployment, live payments, emails, refunds or physical fulfillment.

### Proposed implementation defaults

Carry the design's defaults into configuration and tests: **2–25 complete U.S. recipients**, send as soon as prepared, $9 per card including mailing, no volume discount. Existing single-card offers retain one single-card benefit once per parent checkout, only where their actual terms permit it. These are proposed commercial limits, not supplier limits or newly confirmed founder pricing decisions. Record confirmation before enabling the feature for live customers; no need to block implementation of the disabled feature.

No CSV/import redesign, per-recipient message bodies or sign-offs, automatic name substitution/merge tags, international multi-send, multi-copy quantity controls, new scheduling, bulk account saving, reminder enrollment, business campaign tools, or account redesign. Existing international single-send and deferred-address single-send remain available. Do not migrate all historical single-card orders to the new schema.

### Use cases

1. A single-card sender ignores the new link and completes the same flow as before.
2. A holiday sender adds three addresses, keeps the shared message, saves “Dear Maya,” and “Dear Jordan & Chris,” for two recipients, leaves a third on “Dear friends,”, reviews each greeting and the $27 total, and pays once.
3. A sender adds another household member at the same address and explicitly confirms a separate card; different unit numbers remain distinct.
4. A sender using address-later either keeps that single-card flow or explicitly switches, completes recipient 1, then adds recipient 2.
5. A paid order has two accepted cards and one rejected or uncertain card. The sender sees accurate recipient statuses; operations can resolve the affected child without charging again or resending accepted siblings.

## Repository findings and baseline gate

The inspected checkout mounts `app/preview/entry/client.tsx` through `components/ExperienceRouter.tsx`, using `components/v3/Step3EnvelopeAddressing.tsx` and `Step4ReviewAndPayment.tsx`. Do not implement only the older parallel `TargetPurchaseExperience` or legacy builder. Confirm the actual execution target before editing: current local source differs from the newer production/account work described by prior sprint evidence.

`lib/draft/types.ts` already has separate salutation/text/signOff fields but a singular recipient. Checkout initializes one order at 900 cents. `lib/order-processor.ts` verifies one payment, claims one dispatch and holds uncertain submissions. `lib/handwrytten.ts` combines artwork preparation and one recipient submission. The outbox has transaction enqueue and lease APIs, but currently scans its collection and can reclaim expired leases; neither alone makes physical submission retry-safe.

Admin retry and status-sync paths assume one recipient and one supplier ID. In inspected source, retry can update an address before its gate, and sync can infer MAILED from broad strings and fabricate a date. A batch must not inherit these behaviors. Financial capture/refund facts exist, but per-child refund allocation and a guarded refund initiation path are new work.

Recent context: 0025 covers account/production readiness; 0026 plans optional order follow-ups and one-card offers; 0027 changes holiday catalog assets. Respect all existing dirty work, especially catalog changes. No semantic index or chapter context is configured. October 11's zero-independent-conversion baseline is historical; 0026 records later founder-reported sales, not independently verified here. No conversion uplift or current customer count is asserted by this plan.

## Architecture

### Draft and UI state

Retain the current one-recipient render branch. Add a migrated recipient array with stable IDs and one separately buffered editor. Keep `salutation`, body text, `signOff`, and handwriting style separate; resolve each recipient’s greeting and compose `[effectiveGreeting, body, signOff].filter(Boolean).join("\n\n")` with the existing content semantics at review/snapshot creation. Preserve Unicode and line breaks without guessing a greeting from a flat string.

Persist a versioned recipient greeting union: `{ mode: 'inherit' } | { mode: 'custom', text: string }`. Legacy recipients migrate to inherit; an empty custom string explicitly omits the greeting. Do not infer names or parse composed text. Default edits update inherited greetings only. Address/name edits leave greeting choice intact. Persist buffered edits separately from committed values; cancel discards only that buffer. Remove/undo preserves stable ID and greeting choice. On collapse to one recipient, carry the survivor’s effective greeting into the ordinary Note field and clear its hidden override, while retaining enough prior state for Undo to restore the removed row and the previous inheritance/custom choices. Adding another recipient later inherits the current default.

Explicit UI states: `single`, `conflict_prompt`, `complete_first_recipient`, `adding`, `editing`, `editing_greeting(recipientId)`, `multiple`. Permit only one address, greeting or shared-note editor at a time. Committed count controls payment quantity. An unsaved editor never increments it. Canceling a conflict preserves optional settings; accepted preference changes are explicit. Returning to one recipient restores the baseline without reviving explicitly discarded preferences. Existing draft expiry, ownership and clear-on-completion rules remain in force. Payment secrets and credentials do not belong in draft persistence.

### Commercial parent and delivery children

Use a discriminated `Order` contract: legacy/single order unchanged; `kind: multi_send` parent has immutable checkout revision, content/recipient hashes, ordered recipient IDs, durable artwork reference/version, structured shared default/body/sign-off plus an immutable map of each recipient’s greeting mode, effective greeting and final composed message, font, return address, quantity, currency and integer-cent money snapshot. The parent owns the PaymentIntent, receipt, offer redemption, capture and purchase event.

Store child records under `orders/{parentId}/deliveries/{recipientId}`. Each has the original immutable address, resolved greeting and final composed message copied from the parent snapshot, matching content revision/hash, supplier attempt/result, fulfillment state, allocated paid amount and refund linkage. Support-assisted corrections create an audited new address/attempt revision only after confirmed non-submission; retain the original paid snapshot. Accepted or uncertain attempts cannot have their recipient silently overwritten. Children do not emit independent paid-order or revenue records.

Server-issued guest access or verified account ownership authorizes parent and child reads/changes. Existing masked/public views stay masked. Neither a child ID nor client-submitted userId proves access. No names, addresses, notes, emails or guest credentials in analytics, queue payloads, correlation metadata or ordinary logs; workers load private snapshots by opaque ID.

### Checkout and accounting

One server-authoritative quote is `N × 900 − permitted order discount`, USD. Quantity, country, all address fields, duplicate/household acknowledgments, resolved complete-note constraints for every recipient and personal sender are validated before making an intent payable. Example totals: 3 cards = 2700 cents; 20% off one card = 2520; one free card = 1800. One quote/reservation/redemption per parent. Reject ambiguous offer scope visibly; never silently multiply discounts or reinterpret promised terms.

Bind an idempotent request key to the authenticated/guest checkout identity, draft revision and canonical payload hash. Repeated requests resume the same attempt; conflicting payloads under the same key fail. Quote expiry and offer reservation expiry must prevent stale payment activation without abandoning already captured money.

Editing recipients, a custom/default greeting, shared content or the sender after creating an intent invalidates checkout, including edits that leave price unchanged. Cancel or settle the previous intent server-side before issuing a replacement; clear old Elements/client secrets. A processing or uncertain cancellation holds replacement creation. If the intent succeeded during the edit race, show its frozen paid order. A delayed successful webhook always reconciles its own snapshot, never a newer draft.

Confirm route and signed webhook both verify stored intent identity, captured status, amount, currency, payment environment, parent and revision. Exactly one capture fact plus durable preparation work is recorded through a retry-safe transactional boundary. Preserve existing zero-cost single-card handling; multi-send cannot enter the free-order shortcut under this offer policy.

Allocate discount proportionally in cents with deterministic remainder assignment by the frozen recipient order. Allocations sum exactly to the parent total. Refund amount cannot exceed the child's remaining paid allocation or the parent’s remaining captured balance. Cancellation of an unsent child, dispatch claim, and refund initiation share an atomic decision boundary. Use a deterministic Stripe refund idempotency key and distinguish requested/pending/verified/unknown refunds; provider truth drives financial facts. Unknown refunds are reconciled before retrying. This allocation policy requires founder confirmation before launch.

### Preparation, dispatch and recovery

Separate the Handwrytten adapter into shared card preparation and per-recipient submission. Prepare the cover and dimension-4 custom card once per paid parent, persist the resolved IDs, then submit one request per child with that child’s frozen composed message and the shared font/sender. Retries and support-assisted address corrections reuse that child’s paid text; they never recompose from a current draft or another child. The greeting remains part of the pen-written `message`, not a separate printed header. Freeze shared artwork; never mutate a card ID still used by paid children. Supplier metadata can carry opaque parent/child/attempt IDs but is not an idempotency guarantee.

Reuse the transactional outbox for durable wakeups, with new batch handlers and a child-level state machine; do not loop through 25 submissions in checkout or leave an unawaited background promise. Replace unbounded candidate scans with bounded, indexed due-state queries for this worker. An authenticated scheduler drives it independently of the browser. Process one bounded submission per job/lease, serially per parent, under an account-wide configured concurrency limit. Pause controls stop new submissions, not payment reconciliation or status reads.

Child states: `QUEUED`, `DISPATCHING`, `ACCEPTED`, `MAILED`, `REJECTED_NOT_SENT`, `DISPATCH_UNCERTAIN`, `CANCELED_NOT_SENT`. Refund state is separate. Persist attempt identity before network I/O and atomically claim the child. A timeout, ambiguous response, crash after request initiation, or expired dispatch lease produces a hold, never automatic resend. Check child state before any reclaimed outbox entry can call the supplier. Only a verified rejection proving no order was created permits a new child attempt. Failed upload/card preparation must not release children; ambiguous preparation outcomes also require bounded reconciliation before recreating potentially billable resources.

Safely continue accepted/unaffected siblings except on systemic auth/billing/pause failures. Status reads retry independently and cannot cause resubmission. Record MAILED only from documented supplier mailing evidence, and leave an unknown mailing date unknown. Test/local-mock payments and missing live credentials must never produce live supplier calls or masquerade as live acceptance.

## Implementation plan

### W0 — Freeze the target and contracts (prerequisite)

Identify target branch/SHA, mounted UI, active account/address-book and draft implementations, and environment boundaries. Preserve unrelated dirty changes; use a suitable isolated checkout for execution. Capture synthetic single-send before screenshots at 320/390/768/1280 px and behavior fixtures for guest, signed-in, international, deferred, discount and custom artwork flows. Inventory every consumer of singular recipient/supplier fields before choosing the final discriminated type.

Define draft migration and explicit inherit/custom/blank greeting semantics, one shared composition/validation contract, parent/child DTOs, quote/intent replacement protocol, actor authorization, provider result taxonomy, refund allocation and global concurrency boundary. Publish these contracts before parallel implementation begins. Inspect existing indexes/worker auth conventions. No live side-effect scripts.

**Exit:** baseline and consumer map documented; schema/test fixtures agreed; proposed defaults recorded explicitly; feature defaults false server-side and cannot be bypassed by a query parameter.

### W1 — Recipient state, greetings and structured-note migration

Update `lib/draft/{types,reducer,store}.ts`, `app/preview/entry/client.tsx`, and the actual owned-draft storage surface identified in W0. Migrate legacy singular recipient to one stable row; preserve incomplete editor state without making it billable. Keep the three shared note fields and old expiry/restore semantics. Add per-recipient greeting mode/text and separate edit buffers; migrate existing recipients to inherit. Implement default propagation, explicit blank, cancel/reset, address-edit retention, remove/undo and lossless collapse back to the ordinary single-card Note field. Invalidate checkout on any relevant revision change. Restore at a reviewable step, never automatically pay.

**Exit:** old and new drafts round-trip across refresh/back navigation; note fields and greeting modes remain distinct; cancel restores original values; G1/G2 lifecycle tests pass; cross-account or stale restoration cannot expose recipient lists or reactivate an old payable intent.

### W2 — Minimal Address UI, personal greetings and all feedback flows

Modify the mounted `Step3EnvelopeAddressing` and parent wiring. Prefer a small reusable recipient-field component extracted without changing the existing baseline DOM/layout; use the current US_STATES, unit disclosure, labels, autocomplete and City/State/ZIP layout. Single-send receives only the subtle action. At desktop keep left 5/right 7 column polarity; multi-send expands only the right inner grid, with sender below, while envelope and shared-note review remain left.

Add stable rows, one editor, add/edit/remove/undo, cap validation, field-error focus, exact duplicate rejection and explicit same-household confirmation (unit-sensitive). Bind household acknowledgment to the final normalized pair; edits invalidate it. On deferred opt-in show the conflict before full validation; accepting completes recipient 1 before opening recipient 2. Keep one recipient preserves all settings. Handle international/future-date incompatibilities only after opt-in and with an escape back to the original flow.

Shared-note editing uses three fields or the existing Step 2 route; label salutation **Default greeting** only in multi-send and explain that custom greetings stay unchanged. Never automatically rewrite it. After opt-in, saved recipient rows show their exact inside greeting, Default/Personalized status and **Personalize greeting** / **Edit greeting**. Expand one inline opening-line input with Save greeting, Cancel and Use default greeting; blank means no greeting. Keep new-address entry free of an extra required field. Select that recipient’s card and envelope preview together and update only the greeting while typing; label unsaved previews. Selecting another preview retains the draft and must not show one recipient’s unsaved greeting on another card. Use one fixed mobile action bar owned by the existing parent/child contract (`hideFixedActionBar`); show committed quantity and current subtotal while the editor is open. Review & pay scrolls/focuses the unsaved editor with the exact save/cancel error; account for safe area, keyboard and 200% zoom.

**Exit:** feedback flows F1–F7 and greeting UX checks G1–G3 below pass with keyboard and mobile interactions; baseline screenshot difference is limited to the text action and necessary space. No saved-address/account redesign.

### W3 — Authoritative multi-send pricing and payment

Extend `app/api/checkout/create-intent`, `confirm-order`, `complete-free-order`, `app/api/discount/validate`, `lib/offer-engine.ts`, `lib/stripe.ts`, and `Step4ReviewAndPayment` through the explicit batch contract. Reuse existing payment components, capability-based wallet presentation and receipt email collection. Show each recipient’s exact greeting (including No greeting) without requiring a disclosure, with **Preview this card** and **Edit greeting** returning to that row on Address. Preview the complete selected recipient message; preserve the shared body/sign-off. Show per-card arithmetic, and keep single-card checkout unchanged.

Resolve and validate every recipient’s full message server-side before making an intent payable; report the affected recipient on length/constraint failure and use the same composition contract as preview. Do not invent a physical-fit limit. Include greeting mode and text in the content revision/hash even for same-price changes. Implement idempotent creation, frozen quote/snapshot, verified ownership, replacement-intent cancellation/settlement and no-overlap races. Update confirm and Stripe webhook routes consistently. Reserve/redeem once, clear stale quoted amounts and handle incompatible offers explicitly. Route batch free-order requests to rejection rather than legacy dispatch.

**Exit:** price/tampering/race tests P1–P4 and greeting validation/snapshot checks G4/G5 pass; verified captured money never disappears when a UI or fulfillment operation fails; no supplier calls occur before authoritative payment verification.

### W4 — Durable preparation and per-child fulfillment

Add focused `lib/multi-send/{contracts,orders,dispatch}.ts` services (names proposed), adapt `lib/order-processor.ts`, `lib/handwrytten.ts`, and `lib/transactional-outbox.ts`, and add an authenticated bounded worker endpoint using the target's existing cron conventions. Snapshot durable artwork and environment identity; persist one shared card preparation result. Materialize exactly N child paths with each frozen resolved greeting and composed message, and finish the manifest before dispatch. Assert the actual Handwrytten request message equals that child’s paid snapshot; reuse shared artwork without reusing one recipient’s text.

Implement child claims, attempt/fence records, accepted-ID persistence, uncertain holds, explicit rejection classification, systemic pause, bounded backoff for demonstrably unsent work, read-only reconciliation and per-child status updates. Add necessary server-only Firestore rules/indexes. Older worker/legacy endpoints must recognize batch parents and reject unsupported operations rather than falling through to singular dispatch.

**Exit:** G5 verifies per-child text identity through dispatch/recovery; failure injection at every external boundary proves no blind resend of accepted or uncertain children. Browser closure and repeated webhooks/jobs do not strand paid work. Missing credentials/test mode/replay cannot trigger live supplier work.

### W5 — Truthful status, support recovery and allocated refunds

Extend `app/api/orders/[id]/route.ts`, `app/order/[id]/page.tsx`, owned history projections, `lib/email/transactional.ts`, the admin Orders drawer, `retry-fulfillment`, `sync-handwrytten`, reconciliation services and financial ledger/webhook integration. Inspect actual target account paths in W0 rather than creating a parallel account implementation.

Show one order/receipt and per-child counts. Authorized order/history/support views read each purchased greeting/message from the frozen snapshot; post-payment draft changes cannot alter them. Masked/public views remain masked. Separate **Needs attention · not sent** from **Checking this card**. Rejected cards get support-assisted correction or refund; uncertain cards get no send-again/correction action until reconciled. Guard server actions before writing an address or invoking a provider. Admin actions require actor, child ID, state/version, reason, explicit billable-dispatch consent where applicable, and idempotency; never retry an entire parent.

Implement one guarded per-child refund service and admin action, with request/result ledger linkage and recovery of uncertain provider results. Consolidate transactional status notifications with stable event keys. Keep transactional messages separate from Sprint 0026 optional follow-ups/marketing consent. One capture, purchase, offer use and receipt per parent; report card quantity separately.

**Exit:** privacy, partial-rejection, uncertain-recovery, refund-race and commercial-count tests pass; all legacy paths either handle batch type deliberately or fail closed before side effects.

### W6 — Integrated evidence and release packet

Run focused unit/integration and browser coverage against fake providers, including inherited/custom/blank greetings and distinct sibling payloads, then the appropriate existing regression checks, typecheck and build in the isolated execution checkout. No simultaneous builds sharing `.next`. Add test scripts only for meaningful money/state/compatibility behavior, not snapshots that merely repeat implementation. Browser layout evidence must come from the implemented page, not these design mockups.

Prepare staging deployment/config/index/worker instructions with safe external egress/test guards, a controlled test checklist, operator runbook, exact revision and rollback packet. Do not claim hosted, wallet, supplier or physical evidence from local mocks. Any authorized later staging run must prove worker trigger/auth, index availability, paid-job recovery and order-link access as well as UI behavior.

**Exit:** acceptance matrix is linked to concrete evidence; release blockers and unverified supplier facts are explicit; the feature remains off until the release decision.

## Files summary

| Area | Existing / proposed files |
| --- | --- |
| Builder / UI | `app/preview/entry/client.tsx`, `components/v3/Step3EnvelopeAddressing.tsx`, `Step2NoteComposition.tsx`, `Step4ReviewAndPayment.tsx`, `components/flow/ActionBar.tsx`; proposed small recipient fields/list and inline greeting editor components |
| Draft / orders | `lib/draft/*`, `lib/types.ts`, `lib/firebase-admin.ts`; proposed `lib/multi-send/*`; target's owned-draft and history projections; one pure greeting resolution/composition/validation contract |
| Money | Checkout and discount API routes, `lib/stripe.ts`, `lib/offer-engine.ts`, `app/api/webhooks/stripe/route.ts`, `lib/financial-ledger.ts`; proposed guarded child-refund service/route |
| Fulfillment | `lib/handwrytten.ts`, `lib/order-processor.ts`, `lib/transactional-outbox.ts`, `lib/reconciliation.ts`; proposed bounded batch-worker route |
| Recovery / presentation | `app/api/orders/[id]/route.ts`, `app/order/[id]/page.tsx`, admin Orders components, retry/status-sync routes, transactional email templates |
| Operations | `lib/feature-flags.ts`, `lib/operational-controls.ts`, `firestore.rules`, `firestore.indexes.json`, focused tests and `docs/sprints/evidence/SPRINT-0028/` |

## Acceptance matrix

| ID | Required proof |
| --- | --- |
| F1 — Baseline / layout | Single-send before/after differs only by the text action and space; at desktop the preview keeps its x-position/width on opt-in and the right sub-grid expands locally. Existing mobile order and non-multi controls remain intact. |
| F2 — Structured note | Editing “Dear Maya,” → “Dear Friends,” changes only salutation. Body and sign-off survive refresh, cancel, Step 2 roundtrip and checkout; the default change reaches inherited recipients only; each child receives its own correctly composed text. |
| F3 — Fields | Added/edited recipient uses the real US_STATES select, unit disclosure, full-width City and two-column State/ZIP. Saved units reopen; unique autocomplete sections prevent cross-row overwrites. |
| F4 — Household | Exact duplicate blocked; same normalized address/different name waits for explicit acknowledgment; changing fields invalidates it; different units accepted separately; direct API bypass denied. |
| F5 — Deferral | Add with missing street reaches conflict prompt before validation. Keep one preserves deferral/name/sender/date. Accept completes first recipient, then second; all addresses/sender required before multi checkout. |
| F6 — Status semantics | Known rejection says not sent and offers child-specific support. Unknown outcome says being checked and has no resend/correction action. Accepted is not mailed; no invented mailing dates. |
| F7 — Mobile footer | Exactly one fixed bar at 320/390 px; committed count/total only. Unsaved editor blocks navigation, keeps values and focuses visibly above the bar/keyboard. Save/Cancel stay reachable. |
| G1 — Greeting semantics | Inherit/custom/explicit blank round-trip through migration, persistence, refresh and Step 2 navigation. Default edits affect inherited rows only; Save/Cancel/Use default work; Unicode, punctuation and blank-line semantics are preserved; body/sign-off are unchanged. |
| G2 — Recipient lifecycle | Address/name edits never rewrite a greeting. Add inherits the current default; remove/undo retains IDs and greeting choices. Collapse to one transfers the survivor’s effective greeting to the normal Note field, including blank; Undo restores the earlier default and per-row modes without loss. |
| G3 — Editing / review | Greeting actions appear only after opt-in. One inline editor; keyboard/mobile unsaved guard preserves values and focus. Preview selection tracks card and envelope together without cross-recipient draft leakage. Pay shows every exact greeting; edit returns to the right row and saves before returning to checkout. |
| G4 — Composition / validation | Server resolves every complete message with the same composition contract as preview. A long custom greeting that makes one complete note exceed application constraints blocks payable checkout and identifies that recipient. API tampering cannot bypass it; no unsupported physical-fit guarantee. |
| G5 — Snapshot / dispatch | Different inherited/custom/blank sibling messages match review → frozen parent/child snapshot → supplier request. Same-price edits trigger P2; retries, address correction and duplicate jobs reuse that child’s paid text. Later draft edits cannot change paid history, support views or fulfillment. |
| P1 — Pricing | Counts 1/2/3/25; 0/26 rejected; 2700/2520/1800 examples; integer-cent allocations sum; client-price/country/quantity tampering rejected; free shortcut cannot dispatch a batch. |
| P2 — Payment races | Double click/two tabs, amount-preserving address or default/custom greeting edit, 3DS redirect, cancellation failure, late success and duplicate webhook cannot create overlapping payable replacements or dispatch a different snapshot. |
| P3 — Identity | Wrong account, guest token, parent/child association, intent, currency, mode or amount rejected. Child IDs confer no access; masked/public data stays masked; paid snapshots are server-owned. |
| P4 — Accounting | One capture/receipt/redemption/purchase and quantity N; founder/test/comp/refund categories preserved; per-child refund cannot exceed allocation or parent balance and cannot race with dispatch. |
| D1 — Manifest / preparation | Crash and duplicate job materialize exactly N children and one authoritative shared preparation result; no child dispatch before payment and manifest completion; preparation ambiguity holds. |
| D2 — Dispatch | Inject failures before send, after send, after accepted response/before persistence, at lease expiry and after process restart. Accepted/unknown children never blindly resend; provably unsent child retries independently. |
| D3 — Operations | Authenticated bounded worker, indexed progress, global rate/concurrency and pause respected; systemic billing/auth issue pauses new sends; read-only sync retries never resubmit; test/missing-key/replay cannot hit live provider. |
| R1 — Compatibility | Existing guest/account, saved address, international, deferral, discounts, custom/private artwork, legacy draft/order and single-card emails work on the actual target revision. |

## Risks and dependencies

- **Branch drift:** local checkout and described production differ; W0 identifies actual mounted code and preserves newer account, private-art and payment fixes. Never copy the prototype into production as a page replacement.
- **Holiday deadline:** UI is small; payments, durable dispatch and recovery are substantial. If time is constrained, keep multi-send disabled until the safety gates pass. Do not trade duplicate-send protection for an earlier announcement.
- **Supplier unknowns:** confirm account-specific reuse, full costs, safe concurrency, response classification and correlation/reconciliation behavior before live activation. No supplier idempotency or margin assumption is a release fact.
- **Legacy fall-through:** singular admin/complete-address/free-order/sync consumers can corrupt batches unless discriminated early. Inventory them and test negative batch routes.
- **Scheduler/index readiness:** a durable job record without a deployed worker is not fulfillment. Trigger ownership, auth, indexes, alerts, backlog age and recovery runbook are launch requirements.
- **Commercial policy:** cap, once-per-checkout single-card benefit, allocation/refunds and support ownership need founder confirmation before customer exposure. Reject offers whose terms conflict; do not change promises silently.
- **Per-recipient text integrity:** a small editor changes the fulfillment payload. Explicit inheritance, complete-note validation, immutable recipient snapshots and distinct-sibling dispatch tests are required, not later polish.
- **Evidence limits:** Apple Pay end-to-end, physical handwriting fit, exact supplier costs and holiday arrival are unverified unless separately documented. No new supplier order is needed for this planning task.

## Release and rollback

Greeting-only personalization is required sprint scope. Implement the base multi-send state/payment/dispatch contracts first, then integrate greetings through W1–W5 and verify G1–G5 before marking the sprint complete. No separate sprint is implied. If a staged base-only release is needed, record the release decision and keep greetings incomplete in this sprint; do not silently drop them or claim the full sprint is done. Disabling a greeting UI must never strip custom text from existing drafts or paid snapshots: preserve/review those values, or block that draft’s checkout until a compatible flow is available.

1. Implement additively with `multiSendEnabled=false` enforced server-side. UI and new checkout acceptance use the same flag; client/query overrides cannot enable it.
2. Prepare a reviewable exact-SHA packet, fake-provider results, implemented browser comparisons, rule/index/worker manifest and recovery rehearsal. Obtain staging/deployment authorization when execution reaches that stage; this document is a plan, not that authorization.
3. Before a live pilot, confirm commercial defaults, named operator, supplier evidence and failure-recovery procedures. Keep existing single-card flows available throughout.
4. To stop new multi-send purchases, turn off acceptance/UI, then cancel or settle outstanding unpaid multi-send intents so old client secrets cannot newly commit without a known policy. A late capture remains a paid frozen order requiring fulfillment or reconciliation.
5. Preserve compatible readers, webhooks, reconciliation and workers for existing paid batches. Do not roll back to an old binary that cannot read/operate the new schema. On unsafe supplier behavior, separately pause physical dispatch; retain the paid backlog and show truthful status. Rollback never means deleting paid children or refund facts.

## Definition of done

- [x] W0 target/contract inventory complete; baseline screenshots captured from actual implementation.
- [ ] W1–W5 implemented with explicit legacy single-send compatibility and all F/G/P/D/R gates passing, including recipient-specific greetings.
- [x] New tests exercise failures and races with denied external side effects; relevant existing checks, typecheck and build pass.
- [x] Implemented responsive layouts, keyboard focus and CSS zoom evidence reviewed; private data excluded. Native mobile keyboard and hosted 3DS/wallet checks remain release gates.
- [x] Per-recipient operator recovery/refund, worker ownership, alerts and rollback rehearsal documented.
- [x] Staging/live facts distinguished from local mocks; unresolved supplier and commercial launch decisions recorded.
- [x] Local release packet complete with explicit hosted/supplier acceptance gaps. Deployment and live activation remain separate decisions; no full sprint acceptance claim merely because local checks pass.

## Open launch decisions

Recommended: 25 recipients, domestic/immediate multi-send, one existing single-card offer benefit per parent, proportional paid allocations for refunds, and support-assisted corrections. Confirm before activating; build with these as explicit defaults meanwhile. Supplier acceptance/non-acceptance correlation and the named operator must be established before allowing uncertain-outcome recovery. Broader UX refactoring is out of scope.
