# SPRINT-0023 — Optional account menu and safe private-studio transitions (Sol B draft)

## Pyramid Index

- L0: Make account actions quietly available in the existing card-builder menu while guest sending remains complete and private Upload studio access stays bound to one verified UID.
- L1: Explicit auth and entitlement states; reliable menu and modal interaction; UID-safe draft/preview transition; distinct administrator controls; staging verification.
- L2: Architecture and implementation lanes below; [approved design](../../proposals/2026-10-31-optional-account-menu/DESIGN_SPEC.md) governs copy and behavior.

## Overview and current baseline

This is a small follow-up to SPRINT-0022, not a second upload implementation. The candidate already contains uncommitted menu sign-in/account/sign-out links, a granted-only Studio link, separate `Upload administration` labeling, two authorized admin emails, administrator 401/403 states, admin-cookie deletion before Firebase sign-out, and a four-second inline saved-note reminder. Keep those changes and close their remaining state and browser gaps. An ongoing Luna fix is working on accepted-upload restoration in a new tab in `app/preview/entry/client.tsx`; do not overwrite it or declare the gate passed until rerun. Staging is authorized; production, live payment, physical mail and customer communications are not.

The canonical audience is personal senders. Guest card selection, note, addresses, clear price, and checkout remain usable without an account. `Upload studio` is a granted sender feature at `/create/upload`; `Upload administration` is an administrator control at `/admin/uploads`. `zbrustkern@gmail.com` and `sentral@gmail.com` are distinct Firebase identities despite forwarding. No admin email acquires a Studio grant automatically.

## Use cases

1. While Firebase restores a session, the top-right menu says `Checking account…` and does not flash signed-out or Studio actions. A signed-out sender opens the existing sign-in modal, closes it, and continues the same guest card.
2. A signed-in sender sees the actual Firebase email and `My account`. During the access check the menu says `Checking studio access…`; active verified grants add `Upload studio`; inactive, revoked, expired, or unverified identities do not. Service errors say access is unavailable with retry, while ordinary sending stays usable.
3. An administrator sees clearly separate upload controls, can switch between the two authorized admin identities, and must still grant Studio access to the exact verified account UID. Signing out from the sending menu invalidates the admin cookie before claiming a complete sign-out; failure is visible and retryable.
4. Sign-out or UID change removes account A's private cover, preview blob, pending upload, design reference and return path from visible state. It preserves nonprivate guest fields and offers an explicit catalog-front or separate-card choice if private art had been selected. Account A can restore server work only after reauthenticating and passing owner/grant checks. Account B cannot preview or order A's cover.
5. A returning sender gets a brief inline saved-note notice, automatically dismissed after about four seconds. Refresh and new-tab restore retain accepted upload identity only after server revalidation, with no durable blob URL or silent checkout bypass.

## Architecture and remaining code gaps

`components/flow/FlowHeader.tsx` currently stores a boolean `uploadStudioAllowed`; a request in flight and a failed service call both look like denial, and opening the menu does not refresh access. It reads `user` but not `AuthContext.loading`, so a restoring Firebase session can briefly show `Sign in`. Change to one state machine: `auth-loading | signed-out | grant-loading | grant-active | grant-inactive | grant-error`, keyed by UID and request sequence. Clear old UID state synchronously on transition, fetch on UID change, menu open and focus/visibility return, and expose `Retry` after an error. Never infer grant from email or admin status. Use the server's `/api/upload/access` response as the menu authority; the route remains the enforcement boundary. Show email visibly, with truncation/title only for layout.

The existing menu action structure and 44 px trigger are good. Finish keyboard behavior: Enter/Space opens, Arrow keys reach actionable items and skip status lines, Escape closes and focuses trigger, Tab exits naturally, outside click closes. The sign-in modal needs a dialog role, initial focus, Escape/close focus return, named close button, and optional one-line guest reassurance. Opening/closing it must not reset the builder or draft. Keep `Start a new card` separated and retain its confirmation; `resetDisabled` blocks only that destructive action, not account access.

`context/AuthContext.tsx` now deletes the separate admin cookie before Firebase sign-out and throws if deletion fails. Preserve that fail-closed order, surface the error in the menu, and test both cookie-delete failure and Firebase sign-out failure. A success state requires both sessions cleared. Do not claim account switch success while a prior administrator cookie remains. `app/admin/uploads/page.tsx` already distinguishes signed-out, insufficient permission and service error; maintain these states and prevent edit controls on 401/403. The admin owner-capability routes remain authoritative, and both authorized administrator emails must be checked against their configured roles. Keep account-page Studio entry gated by the current verified UID, with the same loading/error versus inactive distinction if the link is shown there.

The builder still has two persistence paths: `lib/draft/**` session draft and `smn_active_draft_v2*` local draft in `app/preview/entry/client.tsx`. Current accepted-upload verification clears visible preview while checking, and checkout guards require a verified design ID plus current UID. The in-progress new-tab repair restores the accepted tuple from the legacy store. Finish it without retaining a blob URL, and handle an auth transition across **both** paths: clear in-memory blob/object URL immediately, remove or quarantine the previous UID's local accepted tuple from the active draft, prevent a stale `uploadDesign` URL from reopening under another UID, and keep ordinary note/address fields under an explicit user choice. Server preview and checkout still independently verify ownership and active grant. Do not delete account A's private server work as a side effect of sign-out.

The four-second inline `role=status` notice is already present. Verify it appears only for a genuinely restored edited draft, can be dismissed, does not cover controls or trigger false funnel completion, and disappears after the timeout. Do not turn the reminder into a blocking modal.

## Implementation plan and exclusive Luna lanes

Freeze the current working diff and let the ongoing creative new-tab work finish before assigning another editor to `app/preview/entry/client.tsx`. Then run three Luna lanes with exclusive file ownership; main handles integration, shared browser evidence and staging release.

| Lane | Exclusive ownership | Deliverable |
| --- | --- | --- |
| A — menu and auth utility | `components/flow/FlowHeader.tsx`, `components/AuthModal.tsx`, `context/AuthContext.tsx`, new `tests/optional-account-menu.test.tsx` | Replace boolean grant with UID-keyed state machine, menu-open/focus refresh and error retry; accessible keyboard/menu/modal behavior; honest two-session sign-out failure handling; guest-modal retention. Preserve the existing reminder implementation elsewhere. |
| B — private draft and handoff | `app/preview/entry/client.tsx`, `lib/draft/{types,reducer,store}.ts`, new `tests/optional-account-transition.test.ts` | Integrate ongoing new-tab restoration, handle UID change/sign-out across session and legacy local stores, revoke preview object URLs, hold private cover until revalidated, preserve nonprivate edits with explicit recovery choice, block stale checkout. No changes to provider or upload APIs unless a concrete server defect is found and main assigns it. |
| C — account/admin clarity | `app/account/page.tsx`, `app/admin/page.tsx`, `app/admin/uploads/page.tsx`, `lib/upload/admin.ts`, `app/api/admin/upload-{access,standards}/route.ts`, new `tests/optional-account-admin.test.ts` | Reconcile existing uncommitted admin changes; validate both configured admin identities and separate owner capability/Studio grant; account entry loading/error semantics; no controls for 401/403. Keep labels `Upload administration` and `Upload studio` distinct. |

Main owns `docs/sprints/evidence/SPRINT-0022/check-ui.cjs`, new SPRINT-0023 evidence, `apphosting.staging.yaml`, commits, merging, checkout/security regression coordination, and staging deployment. The existing evidence script is currently changing for the new-tab gate, so no Luna lane edits it in parallel. Assign fixes found in tests back to the file owner. Avoid broad auth or upload architecture rewrites; preserve all already-working SPRINT-0022 generation and typography behavior.

## Test matrix and Definition of Done

| State/scenario | Expected proof |
| --- | --- |
| Auth restoring; signed out; sign-in modal open/close; optional sign-in success | Correct menu rows/order without flash; card/note/address/quote retained; guest can still reach review and mock checkout without login. |
| Signed in, grant checking/active/inactive/expired/revoked/unverified/error | Only current verified UID with active grant sees Studio link; error shows unavailable/retry; menu-open and focus refresh reflect grant change; direct route/API still enforce access. |
| UID A → sign out → UID B; failed admin-cookie delete; failed Firebase sign-out | No A preview or private selection visible/orderable under B; successful sign-out clears both sessions; failed sign-out says so and does not claim switch complete; ordinary guest draft fields remain recoverable. |
| Accepted upload handoff, same-tab refresh and new tab | Server revalidates accepted tuple and owner before note/review/checkout; preview bytes are fetched privately; no blob URL in session/local storage; new-tab browser gate passes. |
| Menu/modal/reminder at 320/390/768/1024 px with keyboard | Trigger target and menu fit; email inspectable; Enter/Space/Arrows/Escape/Tab and focus return work; notice is inline, dismissible and expires around four seconds; no horizontal overflow. |
| Admin `zbrustkern` and `sentral` identities, owner/nonowner grant states | Both can authenticate if configured; only owner capability edits grants/standards; Studio grant remains UID-specific; 401/403 shows no editing controls. |

Run focused tests for these states plus existing draft/upload checkout/security tests, typecheck/build, and mounted browser checks. Staging smoke must inspect actual hosted auth domain, exact deployed commit and environment flags, with production unchanged. Automated browser fixtures may mock APIs for deterministic UI states, but one hosted test must verify real identity/grant handling where safe. Do not use live payment or fulfillment as a check. Record unresolved gates honestly; the existing new-tab failure is not a pass until rerun.

## Files summary, risks, dependencies and open items

Changed only as needed: `FlowHeader`, `AuthModal`, `AuthContext`, mounted builder draft/handoff, account/admin pages and existing upload-admin authorization, plus focused tests/evidence and staging config. No new public upload navigation, payment path, supplier integration or product photography is needed.

Key risk is state spread across Firebase Auth, an admin cookie, session draft, legacy local draft and an in-memory blob URL. The plan treats UID transition as a single privacy boundary and tests it end to end. Another risk is over-clearing: guest words and addresses should survive optional sign-in/out, with an explicit choice when an upload cover is removed. The only implementation choice to settle is the exact UI for that choice, using existing builder patterns; it does not require reopening the approved scope. Provider and print claims remain governed by SPRINT-0022 and canonical specs. The commercial baseline remains zero independent paid conversions; no menu change is described as measured uplift.
