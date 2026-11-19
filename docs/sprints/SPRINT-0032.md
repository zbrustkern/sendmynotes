# Sprint 0032 — A personal cover in the card picker

## Pyramid index

- L0. Offer a sender who is browsing ready-made cards one more way to create a meaningful cover.
- L1. Add the approved sixth-position invitation, reuse the existing artwork flow, run a stable picker experiment, and verify the release on staging before promotion.
- L2. The [design and interactions](../proposals/2026-11-18-custom-cover-tile/DESIGN_SPEC.md) and [visual mockup](../proposals/2026-11-18-custom-cover-tile/mockup.html) specify the tile. The acceptance and release checks below define shipment.

## Decisions

Use one card-sized button with the cat illustration, the small Sparkles + AI mark on the surrounding mat, and “Create my cover.” Keep the upper entry. Start with a 50/50 stable session allocation on both environments. Assignment happens on entry to an eligible picker, before scrolling. Use the same drawer behavior for both arms. Copies of the clean sample for the proposal and the UI must match. This sprint has no chapter link or configured semantic index.

## Execution

1. **Picker and drawer (Luna).** Insert after five filtered presets, append for one to five, omit in empty lists. Suppress the invitation for selected/saved custom art, private upload/account covers and unresolved private handoffs. Keep the usual selected design and generated work until the user explicitly accepts. A fresh drawer uses the active chip, with the current card’s occasion for All. Preserve edited inputs on reopen. Make close, Escape and focus return work at the originating scroll position. The mark belongs only to the picker. Deliver the reviewed visual, explanatory drawer introduction and one explicit generate action.
2. **Experiment and diagnostics (Luna).** Use the existing stable assignment helper and first-party identity/consent conventions. Record eligible assignment, a treatment impression after continuous half visibility for one second, entry source for opens and acceptance, and generation outcomes. Preserve the cover source classification and existing purchase authority. Send bounded categorical fields only. Exercise assignment stability, allowed events and privacy with targeted tests. Document how to join first-party session IDs to independent paid outcomes. Compare both paths using all eligible assigned sessions.
3. **Integration and validation (coordinator).** Connect the two packages in the builder, check restored drafts and both arms, validate types, build, targeted regressions and browser interactions. Use synthetic artwork for generation success/failure and confirm paid endpoints see no calls. Validate mobile and desktop placement, cancellation, scroll/focus restoration, CTA alignment, and acceptance to note.
4. **Release.** Integrate only the feature onto the latest staging tip and use a normal fast-forward push. Monitor Firebase App Hosting and smoke both arms on the hosted picker. Build the production patch from the current production line and repeat its checks before a normal push. Verify served revision and hosted behavior. The founder requested a combined production release with the verified checkout retry, envelope-name and private repeat-buyer reporting changes. Multi-send and the wedding portal have separate release plans. A non-fast-forward or overlapping change requires reconciliation on the current tip.

## Acceptance

- The approved illustration, copy and AI mark are legible at 320 and 390 pixels. At 1200 pixels the first row consists of four ready-made cards. One eligible treatment tile appears per visible list, with stable control behavior on reload.
- Opening and closing the drawer preserves selection, draft and scroll. Generation starts only on an explicit action with a valid idea, with preserved existing error and retry paths. Only the accepted cover can proceed to the note.
- A saved/selected custom or private cover suppresses the generic invitation. The sample and its AI mark never become printable items through the invitation.
- Tech acceptance is based on observed behavior. Commercial lift remains unmeasured until independent purchases and an eligible-session denominator support analysis. Rollback can revert this isolated feature commit on each branch.
