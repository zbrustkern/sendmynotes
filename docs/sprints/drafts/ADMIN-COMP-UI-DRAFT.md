# Admin complimentary order UI draft

## Goal and boundary

Replace the current one-click “dispatch comp” modal with an admin-only flow that creates a new card order from admin-entered card content and addresses; it does not clone or modify an existing customer order. Preserve SendMyNotes as the sender-facing identity. Domestic full comps remain available. International destinations and future catalog lines become eligible only when the server returns them in the authoritative quote. This UI never chooses prices, creates a purchasable add-on, or treats a preview as a real dispatch.

## Proposed flow

1. **Start a new admin card.** Keep the existing “Dispatch Comp” entry points from the admin overview, Orders, Economics, and Journeys. Open a contained, labelled modal with focus entry/restoration, Escape handling, a visible close/cancel action, and a mobile full-height layout. Collect/select cover artwork, handwriting style, optional printed greeting, and handwritten note, then collect recipient/destination and return address. This is a new admin-created card, not an existing-order clone.
2. **Choose the adjustment.** Once card content and destination are known, load a versioned server quote. Present a fieldset with “Fully complimentary” and “Adjust individual items.” Full comp covers every current eligible line. In item mode, each line shows its server price and an integer-cent adjustment control constrained from zero through that line’s price. Recalculate total, comp adjustment, and customer pays from the server quote; never accept edited client prices. For the international destination, show the country and international mailing line if the server marks it eligible.
3. **Review address and reason.** Show the recipient’s country-aware address editor/summary and the personal sender’s US return address. Do not prefill or substitute a studio address. Validate recipient country, required region/postal fields, and sender address using server-provided requirements. Require a nonempty reason, with useful presets and an “Other” free-text reason; persist the selected reason and actor/time in the server audit record.
4. **Review before action.** A review step summarizes recipient/destination, card and message identity, each original line price and adjustment, total, comp, customer balance, reason, and the reporting/payment classification. Back returns to editable fields without losing draft values. Require an explicit final action.
5. **Resolve the balance safely.** If customer pays is zero, the action is “Record complimentary order.” If positive, create an admin-authorized payment request from the immutable server quote and show its pending state/link only after the server confirms creation. Keep fulfillment unavailable until a verified payment webhook captures the exact quoted amount. A failed or ambiguous request shows a retry/check-status path and does not trigger duplicate links or dispatch.
6. **Staging outcome.** When the server identifies a review-only staging environment, label the operation as a staging preview/held order. Confirm that no payment is collected, email is sent, or physical card is submitted. Do not call the supplier or public checkout from the UI. For positive balances, show “Payment request preview” or a held state, never a real payable link unless the backend explicitly supports a side-effect-free test link. Keep production dispatch copy out of the held confirmation.

## Accessibility and interaction details

- Use `role="dialog"`, `aria-modal="true"`, and a descriptive title; keep keyboard focus inside while open and return it to the invoking button on close.
- Group the two adjustment modes in a labelled `fieldset`; give each amount field a line-specific accessible name and associate min/max/help text and validation errors.
- Make totals an `aria-live="polite"` region. Distinguish original line total, admin comp, and customer amount due with text and currency, not color alone.
- Ensure all controls are keyboard operable, error summaries receive focus when needed, and pending buttons expose a busy state without dismissing the dialog.
- Use responsive stacked line rows on narrow screens rather than requiring horizontal table scrolling.

## UI ownership and files

- `components/admin/StudioCompModal.tsx`: own the new-card form, adjustment/review states, address controls, quote presentation, accessible pending/error/success states, and server calls.
- `app/admin/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/economics/page.tsx`, and `app/admin/journeys/page.tsx`: preserve existing caller entry points; refresh affected admin data after a successful recorded result. Avoid broad workspace changes.
- A narrow public payment-capability page if the positive-balance flow exposes a link; it must show only minimal payment context and obtain its exact amount from server state.
- Add focused tests under `tests/` for mode switching, line adjustment clamping/cent precision, international address requirements, reason validation, review/back preservation, positive-balance pending-link behavior, and held staging copy. Use mocked fetch and deny network/provider calls.

## Required backend contract (coordinate before implementation)

Backend draft cross-review: the proposed contract is sound and matches the new-card composer. UI integration should use:

- Admin `GET /api/admin/comp/catalog?country=XX` for eligible line IDs/prices, address rules, and capability flags.
- Admin `POST /api/admin/comp/quotes` with `{mode, destinationCountryCode, lineItems: [{lineId, waivedCents?}], reason}` to create the actor-bound expiring quote. Re-request/reconfirm when destination changes or a quote expires; never locally change prices.
- Admin `POST /api/admin/comp/orders` with `{quoteId, idempotencyKey, frontImageAssetId, printedMessage, handwrittenNote, fontStyleId, recipientAddress, returnAddress, customerEmail?, scheduledSendDate?}` to create the immutable admin order. Use only app-owned preset/upload asset IDs, never arbitrary client-supplied image URLs. Do not send actor, timestamp, price, or final amount fields.
- Admin `POST /api/admin/comp/orders/{id}/payment-request` and `GET /api/admin/comp/orders/{id}` for idempotent request creation and ambiguous-result recovery.
- Public capability page/API only for a real payment request. It presents a minimal order summary and uses server-stored quote amount; it accepts no order edits, price, or destination changes.

The server derives actor/time, recalculates all amounts, and rejects stale quotes, unknown IDs, unsupported destinations, negative/fractional/excess adjustments, and client-supplied prices. A full-comp submission creates a new immutable admin order snapshot; it does not operate on a preexisting customer order.

Full and positive-balance submissions create new immutable admin order snapshots. Preserve `origin: "ADMIN_COMP"` for both; only a zero-balance full comp is wholly free. Neither may count as an independent customer conversion. A positive balance should return a payment-request capability bound to the immutable snapshot and exact remaining amount, with idempotency and status lookup. The backend draft's staging behavior—`review_only_held`, with no payable URL or PaymentIntent—is the selected UI assumption for this pass. Fulfillment remains server-gated on verified payment and staging policy. Render lifecycle statuses such as `review_only_held`, `payment_pending`, `paid_ready`, and `fulfilled` explicitly; never infer dispatch from quote/order/link creation.

## Explicit non-goals

No fake purchasable add-on in the real catalog; demonstrate future-line extensibility through injected test data only. Do not bypass existing Stripe amount/metadata binding, webhook idempotency, receipt authorization, Google attribution safeguards, admin server authorization, or feature/staging guards. Do not trigger Handwrytten, payment providers, emails, fulfillment, or deployments from UI tests. Supplier charges remain real and unconfirmed even for a zero-customer-balance comp.
