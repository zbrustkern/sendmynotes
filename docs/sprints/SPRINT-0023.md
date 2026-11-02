# SPRINT-0023 — Optional account menu and consistent note preview

Status: active. Founder-approved implementation and staging release; production excluded.

## Pyramid Index

- L0: Offer quiet account utilities in the card builder and one consistent, honest interior preview while preserving guest sending and private upload ownership.
- L1: Auth/entitlement menu states; UID-safe private draft transitions; shared note renderer/font resolution; admin/account clarity; tested staging release.
- L2: [Approved menu design](../proposals/2026-10-31-optional-account-menu/DESIGN_SPEC.md), Architecture, Implementation Plan, and Definition of Done below; planning synthesis in `drafts/SPRINT-0023-MERGE-NOTES.md`.

## Overview and authority

The founder approved the optional account menu and explicitly added a shared interior note preview to this sprint. Use native **Sol planning and Luna execution**, overriding the sprint skill's default Claude/Astra lanes. The approved design and prior execution/staging authorization settle scope; no new approval interview is needed. Current candidate work already includes menu basics, `Upload administration` labeling, two administrator emails with separate Studio grants, admin 401/403 states, admin-cookie sign-out ordering, a short restored-note notice, and checkout-origin fixes. Preserve and verify this work. The mounted refresh/new-tab test has passed accepted upload preview and tuple through checkout; signed-out/cross-UID behavior remains to prove.

The audience is personal senders. Guest card selection, note, addresses, clear total and checkout remain complete without an account. `Upload studio` at `/create/upload` appears only for a verified, explicitly granted UID. `Upload administration` at `/admin/uploads` is a distinct administrator surface. `zbrustkern@gmail.com` and `sentral@gmail.com` may both be authorized administrators, but forwarding between them does not combine Firebase identities or Studio grants. The canonical independent conversion baseline remains zero; no UX improvement is claimed as measured.

## Use Cases

1. Guest opens the top-right menu, optionally opens/closes sign-in and continues the same card. No account prompt interrupts checkout, and no public upload advertisement appears.
2. Signed-in sender sees their actual email and account link. A verified active grant adds `Upload studio`; checking, error, inactive, expired, revoked and unverified states are represented honestly. Direct Studio/API access remains server enforced.
3. Sender signs out or changes account. Old private source/preview pixels, blob URLs, upload selection, pending work and return path leave visible state immediately; late responses cannot restore them. Safe note/address fields remain, but choosing a catalog front or separate card is explicit before checkout. Original owner may later restore their private design after fresh server verification.
4. Admin switches authorized accounts deliberately and sees `Upload administration` separately from sender Studio; a failed session clear is reported rather than hidden.
5. Sender and admin inspect the same approximate inside-leaf layout for the selected handwriting style, greeting and note. The full text remains readable when the scaled image cannot fit it; no preview claims exact physical line wrapping or trim parity.

## Architecture and contracts

**Menu state.** Replace a Boolean entitlement view with `auth-loading | signed-out | grant-loading | grant-active | grant-inactive | grant-error`, keyed by captured Firebase UID and request sequence. Clear old allowance synchronously on UID change. Fetch `/api/upload/access` with the current ID token on UID change, menu open and focus/visibility return; ignore stale replies. Auth loading shows `Checking account…`, grant loading shows `Checking studio access…`, and service error shows `Studio access unavailable` plus retry. Only active verified grant shows `Upload studio`. Keep `Start a new card` below a separator with its own confirmation. Menu trigger stays top-right with a 44 px target and keyboard/focus behavior from the approved design. The sign-in modal may include one brief guest reassurance, and canceling it does not alter the draft.

**Two-session sign-out.** The shared sign-out operation clears the separate admin cookie, then signs out Firebase. It reports whether either phase failed and never claims a complete account switch if one identity remains. The admin switch uses this operation, not a second copy of cookie-deletion logic. Admin routes remain capability checked and 401/403 editing controls stay closed. No automatic Studio grant for either admin identity.

**Private draft boundary.** On sign-out/UID change, stop displaying prior private preview before any new request, revoke in-memory object URLs, clear active upload selection and old UID pending state, and ignore late access/preview results. Apply this to `lib/draft/**` and legacy `smn_active_draft_v2*` hydration. Never persist a private preview URL. Keep ordinary note/address fields safely available but require an explicit catalog-front or separate-card choice when the private front disappears. Same-UID refresh/new-tab restoration still requires `GET /api/upload/designs/:id` and authenticated preview before checkout; server ownership and grant checks remain authoritative.

**Shared inside preview.** Introduce `NoteInteriorPreview` as the single right-leaf renderer used by `CardPreview` single and spread views, all Step 2 interior preview variants, and admin `ProofInspectorModal`. Feed it a common normalized preview model: optional greeting/salutation, note, sign-off where present, selected font ID, and an `empty` placeholder state that is never mistaken for submitted text. The core order-comparison path joins trimmed `printedMessage` and trimmed `handwrittenNote` with `\n\n` exactly as `buildSingleStepOrderPayload` does; do not edit that supplier payload or checkout fields. Step 2's salutation/body/sign-off display should use the same visual renderer with its current draft transformation, and tests should explicitly compare the final order-bound string. Do not invent a separate printed greeting header: the current supplier request sends one pen-written message.

Use one resolver for `hwDavid`, `hwChase`, `hwKate`, `hwAdam`, `hwWill` and current legacy aliases: numeric `1`–`5`, `hwCharity`→David, `font-casual`→David, `font-calligraphy`→Chase, `font-classic`→Adam. Keep selected font meaning stable. The supplier's existing payload uses David when ID is unset and Adam when an unknown ID is supplied; preserve that behavior without editing `lib/handwrytten.ts`. For an unknown ID, the preview must explicitly say the handwriting style is unavailable rather than depict an arbitrary known style as accurate. Wait for font readiness where possible; slow/failed loads use a stable readable fallback and remeasure when ready. The leaf keeps 17:22 proportion, bounded type size and padding, measured line wrapping/height, and visible overflow status. Never clip, truncate or shrink indefinitely to make all text appear to fit; provide the complete text in a selectable, accessible reading region beside/below the visual approximation. Geometry is proportional to verified A2 portrait only. Remove `1:1`, `exact physical print preview`, letterpress/archival substrate and guaranteed wrapping claims. Use “Approximate interior preview”; supplier trim and physical line breaks remain unverified. Ensure admin modal reflows on narrow screens, scrolls safely, retains close/tab controls and focuses correctly.

## Implementation Plan — three exclusive Luna lanes

| Lane | Exclusive ownership | Deliverable |
| --- | --- | --- |
| 1 — menu/auth/account | `components/flow/FlowHeader.tsx`, `components/AuthModal.tsx`, `context/AuthContext.tsx`, `app/account/page.tsx`, focused menu/auth tests. | Complete state matrix, refresh/error retry, menu/modal accessibility, email inspection, honest two-session sign-out, guest continuity, account link semantics. |
| 2 — private UID transitions | `app/preview/entry/client.tsx`, `lib/draft/**`, `components/upload/UploadStudio.tsx` only if a concrete pending-state leak requires it, focused draft/privacy tests. | Cross-UID and signed-out clearing/late-response safety, explicit safe-draft recovery, preserve already passing same-UID new-tab restoration and checkout tuple. |
| 3 — shared previews/admin modal | New `components/NoteInteriorPreview.tsx` and shared font resolver, `components/CardPreview.tsx`, `components/v3/Step2NoteComposition.tsx`, `components/admin/ProofInspectorModal.tsx`, preview fixtures/tests. | One renderer across all specified interiors; style aliases; measurement/overflow/fallback; approximate copy and responsive admin modal. No supplier/order-path edits. |

Main owns verification of the existing upload-admin/backend fixes (`app/admin/uploads/page.tsx`, admin routes/capabilities), cross-lane integration and tests, shared evidence, staging config, release and exact-commit proof. Do not assign another editor to the currently changing builder file until its owner finishes. Each lane reports necessary cross-owner changes to main; no duplicated implementation. The added preview lane receives a frozen prop/model and resolver contract before coding.

## Files Summary

Menu and auth: `FlowHeader`, `AuthModal`, `AuthContext`, account page. Private state: mounted builder, draft stores and possibly UploadStudio pending state. Preview: new shared leaf and resolver, `CardPreview`, `Step2NoteComposition`, `ProofInspectorModal`. Main verification: existing admin files, focused tests, evidence and staging configuration. No fulfillment, payment, order submission or production configuration change.

## Definition of Done

- Full menu matrix passes: auth restoring without flash; signed out; signed in with checking/active/inactive/expired/revoked/unverified/error states; refresh on menu open/focus; error retry; active email and exact UID grant isolation. Guest can cancel/sign in and continue the same cover, note, addresses, quote and safe mock checkout.
- Sign-out and admin switch clear both sessions or show precise partial failure. A pending private preview/access response for UID A cannot show A's bytes or accepted tuple after sign-out or UID B sign-in. Both current and legacy draft paths preserve safe fields and block private checkout until same-UID validation. Same-UID refresh/new-tab behavior remains passing.
- Shared preview shows each of the five styles and legacy IDs consistently in admin, CardPreview single/spread, and all Step 2 interior surfaces. Unknown ID, slow font and failed font cases remain readable and honestly labeled. Greeting-plus-note text matches the unchanged fulfillment join. Long/line-broken text has bounded visual sizing, visible overflow state and complete accessible selectable text.
- Preview geometry follows 17:22 for the folded leaf; no exact-print, verified-wrap or unsupported stock/manufacture claims remain. Admin modal fits, scrolls and retains controls at 320/375/390/430 px, tablet and desktop. Keyboard, screen reader labels, focus and WebKit are checked where available; record any unavailable engine as a limit.
- The existing short restored-note notice stays inline, dismisses after about four seconds, and does not block controls or count as checkout completion. Admin 401/403, both authorized emails and separate Studio grants are verified without widening privileges.
- Focused auth/draft/security/preview tests, typecheck/build and mounted browser checks pass. Staging hosted route serves the exact intended commit with production untouched. Use synthetic fixtures only; no live payment, fulfillment script, supplier request, physical mail or customer communication.

## Risks and mitigations

- **State races across Firebase, admin cookie and two draft stores:** UID-key request cancellation/sequence and explicit partial sign-out state; server checks remain authority.
- **Over-clearing guest work:** remove only private upload authority/pixels automatically, retain safe fields and require a front choice before checkout.
- **Font and layout variability:** shared resolver plus font readiness and measured bounds; overflow is visible, complete text remains accessible, and physical fit is never guaranteed.
- **Preview/fulfillment drift:** share trimming/join semantics in a pure helper or direct contract test, without modifying supplier request behavior. Synthetic fixtures prove equality.
- **Release regression:** preserve already passing new-tab path and SPRINT-0022 generation. Main integrates only reviewed lane edits and verifies current staging runtime before rollout.

## Dependencies and open questions

Dependencies: existing Firebase auth/admin cookie, `/api/upload/access` and accepted-design resolver, bundled handwriting fonts and current SPRINT-0022 fixtures. The precise font-measurement approach can be chosen by the preview lane using browser APIs; it must pass the overflow/fallback fixtures and not imply supplier-certified fit. No unresolved product decision requires another approval request. If WebKit is unavailable, record its absence and complete all other device/browser gates. Staging remains the only release target under prior authorization.
