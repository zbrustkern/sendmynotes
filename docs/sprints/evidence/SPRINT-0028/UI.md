# Sprint 0028 UI lane evidence

This is local implementation work in the isolated Sprint 0028 checkout. No build,
browser run, payment, fulfillment, email, or supplier call was performed in this
lane. Acceptance is not claimed.

## Implemented in this pass

- Added an optional versioned multi-send draft with structured shared note,
  stable recipient IDs, and explicit inherited/custom greeting state. Empty custom
  greeting remains distinct from inheritance.
- Added allowlisted draft sanitization for that state. Existing one-recipient
  drafts without the new key continue through the singular `recipient` field.
- Added reducer support to set/clear multi-send and invalidate stale checkout
  bindings when it changes.
- Added the subtle “+ Add another recipient” action after the existing recipient
  controls. It appears only when the server-provided multi-send flag is true, and
  the opt-in retains one committed address and opens a separate new-recipient buffer.
- Added `multiSendEnabled` with a false default and passed the server flag into the
  mounted entry client. Other candidate mounts read the same server-owned
  `/api/feature-flags` response; no query override enables the feature.
- Added a saved recipient list with one buffered address editor, matching US state
  select and City / State / ZIP layout, optional unit disclosure, save/cancel,
  recipient removal, collapse-to-one and undo. New addresses count toward the
  subtotal only after save.
- Added one inline greeting editor with Save, Cancel, Use default, intentional blank
  custom greetings, and a navigation guard. Shared note updates synchronize the
  multi-send default without changing custom recipient greetings.
- Added household duplicate rejection and explicit same-household confirmation
  bound to recipient IDs and the normalized address key. Address edits clear prior
  acknowledgments. Multi-send opt-in from deferred-address mode asks before
  converting and opens the existing recipient for completion first.
- Kept the preview column on the left, selecting the envelope recipient alongside
  an implemented card note preview. Unsaved greeting text is labeled in that
  preview. Pay review lists each greeting and offers Preview this card / Edit
  greeting actions.
- Account draft serialization and restore preserve multi-send content.
- Checkout client request sends the frozen-shape multi-send note and recipient
  payload, UUID checkout ID, household acknowledgments, and prior payable checkout
  binding when replacing an intent.

## Remaining UI acceptance work

Browser behavior, keyboard focus at 200% zoom, 320/390px footer overlap, actual
production screenshots, complete integration with the server quote/payment
contract, and address-duplicate flows have not been browser-verified by this lane.
The parent agent is running integrated browser checks. No live provider calls or
fulfillment actions were made.

Parent review also verified reload preservation of unsaved greetings, 3-person household acknowledgment, active-batch removal undo, and explicit deferral conversion. The entry preview route is dynamic so server flags are not frozen at build time. See the final execution report for integrated evidence and limits.
